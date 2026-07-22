import { describe, expect, it, vi } from 'vitest';
import { confirmUnassignedView } from '../../src/unassigned/confirmation.js';

function harness(overrides = {}) {
  const calls = [];
  const logs = [];
  const options = {
    reason: 'Daily Rare end',
    openUnassigned: vi.fn(() => true),
    clickFallback: vi.fn(() => calls.push('fallback')),
    waitLoadingEnd: vi.fn(async () => calls.push('wait')),
    refreshUnassigned: vi.fn(async () => calls.push('refresh')),
    getItems: vi.fn(() => []),
    log: (message) => logs.push(message),
    ...overrides,
  };
  return { calls, logs, options };
}

describe('Unassigned view confirmation', () => {
  it('opens, waits, refreshes, and reports an empty Unassigned pile', async () => {
    const current = harness();
    await expect(confirmUnassignedView(current.options)).resolves.toEqual([]);
    expect(current.options.openUnassigned).toHaveBeenCalledOnce();
    expect(current.options.clickFallback).not.toHaveBeenCalled();
    expect(current.calls).toEqual(['wait', 'refresh']);
    expect(current.logs).toEqual([
      'Opening unassigned items view for confirmation: Daily Rare end',
      'Unassigned confirmation (Daily Rare end): empty after 1 stable read(s)',
    ]);
  });

  it('requires consecutive empty reads when pack recovery requests stable confirmation', async () => {
    const snapshots = [[], [], []];
    const current = harness({
      stableEmptyReads: 3,
      emptyReadDelayMs: 250,
      sleep: vi.fn(async (ms) => current.calls.push(`sleep:${ms}`)),
      getItems: vi.fn(() => snapshots.shift() || []),
    });
    await expect(confirmUnassignedView(current.options)).resolves.toEqual([]);
    expect(current.options.refreshUnassigned).toHaveBeenCalledTimes(3);
    expect(current.options.sleep).toHaveBeenCalledTimes(2);
  });

  it('returns a delayed Unassigned item instead of accepting the first empty cache read', async () => {
    const delayed = { id: 77 };
    const snapshots = [[], [delayed]];
    const current = harness({
      stableEmptyReads: 2,
      sleep: vi.fn(async () => {}),
      getItems: vi.fn(() => snapshots.shift() || []),
    });
    await expect(confirmUnassignedView(current.options)).resolves.toEqual([delayed]);
    expect(current.logs.at(-1)).toContain('1 item(s) still present');
  });

  it('uses the text-button fallback and returns remaining items', async () => {
    const items = [{ id: 1 }, { id: 2 }];
    const current = harness({
      openUnassigned: vi.fn(() => false),
      getItems: vi.fn(() => items),
    });
    await expect(confirmUnassignedView(current.options)).resolves.toBe(items);
    expect(current.options.clickFallback).toHaveBeenCalledOnce();
    expect(current.logs.at(-1)).toBe('Unassigned confirmation (Daily Rare end): 2 item(s) still present');
  });

  it('logs navigation errors but still waits and refreshes the inventory', async () => {
    const current = harness({
      openUnassigned: vi.fn(() => { throw new Error('controller unavailable'); }),
    });
    await expect(confirmUnassignedView(current.options)).resolves.toEqual([]);
    expect(current.calls).toEqual(['wait', 'refresh']);
    expect(current.logs).toContain('Could not open unassigned view automatically: controller unavailable');
  });
});
