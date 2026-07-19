import { describe, expect, it, vi } from 'vitest';
import { createSbcRewardOverlay } from '../../src/ui/sbc-reward-overlay.js';

function createHarness(options = {}) {
  const logs = [];
  const clicks = [];
  const sleeps = [];
  const queryResults = options.queryResults || new Map();
  const overlay = createSbcRewardOverlay({
    dom: {
      queryAll: (selector) => queryResults.get(selector) || [],
    },
    pageRuntime: {
      controllerName: (controller) => controller?.className || '',
      controllerRoot: (controller) => controller?.root || null,
      popupControllerCandidates: () => options.controllers || [],
    },
    findButtonByText: options.findButtonByText || (() => null),
    findClickableByText: options.findClickableByText || (() => null),
    isClickableElement: options.isClickableElement || (() => true),
    compactText: (element) => String(element?.textContent || '').replace(/\s+/g, ' ').trim(),
    matchesAny: (text, patterns) => patterns.some((pattern) => text.includes(pattern)),
    click: (element) => clicks.push(element),
    sleep: async (milliseconds) => { sleeps.push(milliseconds); },
    log: (message) => { logs.push(message); },
  });
  return { clicks, logs, overlay, sleeps };
}

describe('SBC reward overlay', () => {
  it('finds claim controls and reward modal context through injected DOM helpers', () => {
    const button = { id: 'claim' };
    const context = { textContent: 'Rewards Player Pack Claim Rewards' };
    const queryResults = new Map([
      ['.view-modal-container,.ut-modal,.modal,[class*="modal"],[class*="Modal"]', [context]],
    ]);
    const { overlay } = createHarness({
      queryResults,
      findButtonByText: (patterns) => patterns.includes('领取奖励') ? button : null,
    });

    expect(overlay.findClaimButton()).toBe(button);
    expect(overlay.findClaimContext()).toEqual({ element: context, text: 'Rewards Player Pack Claim Rewards' });
    expect(overlay.isVisible()).toBe(true);
  });

  it('closes an active EA reward controller before checking the DOM fallback', async () => {
    const onBackButton = vi.fn();
    const controller = { className: 'UTGameRewardsViewController', onBackButton };
    const { logs, overlay, sleeps } = createHarness({ controllers: [controller] });

    await expect(overlay.dismiss('Daily Rare')).resolves.toBe(true);
    expect(onBackButton).toHaveBeenCalledOnce();
    expect(logs).toEqual(['Daily Rare: closing UTGameRewardsViewController overlay']);
    expect(sleeps).toEqual([700]);
  });

  it('advances a visible DOM reward overlay when no controller is available', async () => {
    const action = { textContent: 'Continue' };
    const root = { querySelector: () => action };
    const marker = { closest: () => root };
    const queryResults = new Map([
      ['.rewards-footer, [class*="game-rewards"], [class*="GameRewards"]', [marker]],
    ]);
    const { clicks, logs, overlay, sleeps } = createHarness({ queryResults });

    await expect(overlay.dismiss('84+ TOTW')).resolves.toBe(true);
    expect(clicks).toEqual([action]);
    expect(logs).toEqual(['84+ TOTW: advancing SBC reward overlay (Continue)']);
    expect(sleeps).toEqual([700]);
  });

  it('reports no action when neither controller nor reward DOM is present', async () => {
    const { overlay } = createHarness();
    expect(overlay.isVisible()).toBe(false);
    await expect(overlay.dismiss('SBC')).resolves.toBe(false);
  });

  it('finds and dismisses an ineligible squad modal using the preferred confirm button', () => {
    const preferred = { textContent: '确定', disabled: false };
    const fallback = { textContent: 'Cancel', disabled: false };
    const modal = {
      textContent: 'Ineligible Squad Concept or Loan Players cannot be submitted',
      querySelectorAll: () => [fallback, preferred],
    };
    const queryResults = new Map([
      ['.view-modal-container,.ut-modal-view,.ea-dialog,.modal-content,.ut-dialog', [modal]],
    ]);
    const { clicks, overlay } = createHarness({ queryResults });

    const error = overlay.findSubmitError();
    expect(error).toEqual({ modal, text: 'Ineligible Squad Concept or Loan Players cannot be submitted' });
    expect(overlay.dismissSubmitError(error)).toBe(true);
    expect(clicks).toEqual([preferred]);
  });

  it('ignores unrelated modals and refuses to dismiss without an enabled action', () => {
    const unrelated = { textContent: 'Network unavailable' };
    const blocked = {
      textContent: 'Squads containing a Loan player are not allowed',
      querySelectorAll: () => [{ textContent: 'Cancel', disabled: true }],
    };
    const queryResults = new Map([
      ['.view-modal-container,.ut-modal-view,.ea-dialog,.modal-content,.ut-dialog', [unrelated, blocked]],
    ]);
    const { overlay } = createHarness({ queryResults });

    const error = overlay.findSubmitError();
    expect(error?.modal).toBe(blocked);
    expect(overlay.dismissSubmitError(error)).toBe(false);
  });
});
