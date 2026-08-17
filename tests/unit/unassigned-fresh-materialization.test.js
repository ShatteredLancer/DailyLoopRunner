import { describe, expect, it, vi } from 'vitest';
import { materializeFreshUnassigned } from '../../src/unassigned/fresh-materialization.js';

function player(id, definitionId, rating = 85, rareflag = 1) {
  return { id, definitionId, type: 'player', rating, rareflag };
}

function harness(overrides = {}) {
  const openedItems = overrides.openedItems || [player(101, 501), player(102, 502, 86)];
  const state = { repositoryItems: overrides.repositoryItems || [] };
  return {
    openedItems,
    state,
    options: {
      openedItems,
      baselineIds: overrides.baselineIds || [],
      attempts: overrides.attempts || 2,
      invalidate: vi.fn(async () => ({ invalidated: true, actions: [] })),
      requestFresh: vi.fn(async () => ({ success: true, status: 200, response: { items: openedItems } })),
      readRepositoryItems: vi.fn(() => state.repositoryItems),
      readRepositoryState: vi.fn(() => ({ mergedCount: state.repositoryItems.length })),
      triggerNavigation: vi.fn(async () => ({ requested: true, confirmed: false })),
      ...overrides,
    },
  };
}

describe('fresh Unassigned opened-item materialization', () => {
  it('accepts a complete forced-fresh response without requiring a Controller transition', async () => {
    const current = harness();
    current.options.requestFresh = vi.fn(async () => {
      current.state.repositoryItems = [...current.openedItems];
      return { success: true, status: 200, response: { items: current.openedItems } };
    });

    const result = await materializeFreshUnassigned(current.options);

    expect(result).toMatchObject({ status: 'confirmed', attempt: 1, matchedCount: 2, unresolvedCount: 0 });
    expect(current.options.invalidate).toHaveBeenCalledOnce();
    expect(current.options.requestFresh).toHaveBeenCalledOnce();
    expect(current.options.triggerNavigation).not.toHaveBeenCalled();
    expect(result.records[0]).toMatchObject({
      repositoryBefore: { mergedCount: 0 },
      repositoryAfter: { mergedCount: 2 },
    });
  });

  it('accepts one-to-one remapped live Repository entities after excluding the baseline', async () => {
    const openedItems = [player(101, 501), player(102, 502, 86)];
    const existing = player(90, 900, 80);
    const aliases = [player(301, 501), player(302, 502, 86)];
    const current = harness({
      openedItems,
      baselineIds: [existing.id],
      repositoryItems: [existing, ...aliases],
      requestFresh: vi.fn(async () => ({ success: true, status: 200, response: { items: [] } })),
    });

    const result = await materializeFreshUnassigned(current.options);

    expect(result).toMatchObject({ status: 'confirmed', matchedCount: 2, unresolvedCount: 0 });
    expect(result.matches.map((entry) => entry.live.id)).toEqual([301, 302]);
  });

  it('does not accept a stale 304 empty response and stops after one bounded navigation trigger', async () => {
    const current = harness({
      requestFresh: vi.fn(async () => ({ success: true, status: 304, response: { items: [] } })),
    });

    const result = await materializeFreshUnassigned(current.options);

    expect(result).toMatchObject({ status: 'blocked', attempts: 2, matchedCount: 0, unresolvedCount: 2 });
    expect(current.options.invalidate).toHaveBeenCalledTimes(2);
    expect(current.options.requestFresh).toHaveBeenCalledTimes(2);
    expect(current.options.triggerNavigation).toHaveBeenCalledOnce();
  });

  it('does not treat response DTO items as live materialization evidence', async () => {
    const current = harness({ attempts: 1 });

    const result = await materializeFreshUnassigned(current.options);

    expect(current.options.requestFresh).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      status: 'blocked',
      matchedCount: 0,
      unresolvedCount: 2,
      records: [expect.objectContaining({
        request: expect.objectContaining({ responseItemCount: 2, responseItemIds: [101, 102] }),
        repositoryCount: 0,
      })],
    });
  });

  it('uses one navigation trigger between two forced refresh attempts', async () => {
    const current = harness();
    current.options.requestFresh = vi.fn(async () => {
      if (current.options.requestFresh.mock.calls.length === 2) {
        current.state.repositoryItems = [...current.openedItems];
      }
      return { success: true, status: 200, response: { items: current.openedItems } };
    });

    const result = await materializeFreshUnassigned(current.options);

    expect(result).toMatchObject({ status: 'confirmed', attempt: 2, matchedCount: 2 });
    expect(current.options.invalidate).toHaveBeenCalledTimes(2);
    expect(current.options.requestFresh).toHaveBeenCalledTimes(2);
    expect(current.options.triggerNavigation).toHaveBeenCalledOnce();
  });

  it('blocks a partial response instead of treating any non-empty Unassigned result as success', async () => {
    const openedItems = [player(101, 501), player(102, 502, 86)];
    const current = harness({
      openedItems,
      attempts: 1,
    });
    current.options.requestFresh = vi.fn(async () => {
      current.state.repositoryItems = [openedItems[0]];
      return { success: true, status: 200, response: { items: [openedItems[0]] } };
    });

    const result = await materializeFreshUnassigned(current.options);

    expect(result).toMatchObject({ status: 'blocked', matchedCount: 1, unresolvedCount: 1 });
    expect(result.unresolvedItems).toEqual([openedItems[1]]);
  });

  it('blocks ambiguous same-version aliases that cannot be mapped one-to-one', async () => {
    const openedItems = [player(101, 501)];
    const current = harness({
      openedItems,
      attempts: 1,
      repositoryItems: [player(301, 501), player(302, 501)],
      requestFresh: vi.fn(async () => ({ success: true, status: 200, response: { items: [] } })),
    });

    const result = await materializeFreshUnassigned(current.options);

    expect(result).toMatchObject({ status: 'blocked', matchedCount: 0, unresolvedCount: 1 });
  });

  it('retains complete diagnostics when invalidation and the request both fail', async () => {
    const current = harness({
      attempts: 1,
      invalidate: vi.fn(async () => ({
        invalidated: false,
        actions: [{ id: 'repository-set-dirty', available: true, succeeded: false, error: 'dirty failed' }],
      })),
      requestFresh: vi.fn(async () => { throw new Error('request failed'); }),
    });

    const result = await materializeFreshUnassigned(current.options);

    expect(result).toMatchObject({ status: 'blocked', attempts: 1, unresolvedCount: 2 });
    expect(result.records[0]).toMatchObject({
      invalidation: { invalidated: false },
      request: { success: false, error: 'request failed' },
      repositoryCount: 0,
    });
  });
});
