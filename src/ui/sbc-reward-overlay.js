const CLAIM_REWARD_PATTERNS = Object.freeze([
  'Claim Rewards',
  'Claim Reward',
  'Collect Rewards',
  'Collect Reward',
  '领取奖励',
  '領取獎勵',
  '领取',
  '領取',
]);

const REWARD_CONTEXT_SELECTOR = [
  '.view-modal-container',
  '.ut-modal',
  '.modal',
  '[class*="modal"]',
  '[class*="Modal"]',
].join(',');

const REWARD_CONTROLLER_MARKER_SELECTOR = '.rewards-footer, .reward, [class*="game-rewards"], [class*="GameRewards"]';
const REWARD_MARKER_SELECTOR = '.rewards-footer, [class*="game-rewards"], [class*="GameRewards"]';
const REWARD_ROOT_SELECTOR = '.view-modal-container, .ea-dialog-view, [class*="modal"], [class*="Modal"]';
const REWARD_ACTION_SELECTOR = 'footer button.call-to-action:not(.disabled), button.call-to-action:not(.disabled), footer button:not(.disabled)';
const SUBMIT_ERROR_SELECTOR = [
  '.view-modal-container',
  '.ut-modal-view',
  '.ea-dialog',
  '.modal-content',
  '.ut-dialog',
].join(',');

export function createSbcRewardOverlay({
  dom,
  pageRuntime,
  findButtonByText,
  findClickableByText,
  isClickableElement,
  compactText,
  matchesAny,
  click,
  sleep,
  log,
}) {
  function findClaimButton() {
    return findButtonByText(CLAIM_REWARD_PATTERNS) || findClickableByText(CLAIM_REWARD_PATTERNS);
  }

  function findSubmitError() {
    for (const modal of dom.queryAll(SUBMIT_ERROR_SELECTOR)) {
      const text = String(modal?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 220);
      if (!text) continue;
      if (
        /Ineligible Squad/i.test(text) ||
        /Concept or Loan Players/i.test(text) ||
        /cannot be submitted in Squad Building Challenges/i.test(text) ||
        /Squads containing .*Loan/i.test(text)
      ) {
        return { modal, text };
      }
    }
    return null;
  }

  function dismissSubmitError(error) {
    const modal = error?.modal;
    if (!modal) return false;
    const buttons = Array.from(modal.querySelectorAll?.('button') || []);
    const button = buttons.find((candidate) => /^(ok|okay|确定|確定)$/i.test(String(candidate?.textContent || '').trim())) ||
      buttons.find((candidate) => !candidate?.disabled);
    if (!button) return false;
    click(button);
    return true;
  }

  function findClaimContext() {
    const contexts = dom.queryAll(REWARD_CONTEXT_SELECTOR)
      .filter(isClickableElement)
      .map((element) => ({ element, text: compactText(element) }))
      .filter(({ text }) => text && text.length < 2000);
    return contexts.find(({ text }) =>
      matchesAny(text, ['Claim Rewards', 'Claim Reward', 'Collect Rewards', 'Collect Reward', '领取奖励', '領取獎勵']) ||
      (matchesAny(text, ['Reward', 'Rewards', '奖励', '獎勵']) &&
        matchesAny(text, ['Pack', 'Player', 'Claim', 'Collect', '包', '球员', '球員', '领取', '領取']))
    ) || null;
  }

  function isRewardsController(controller) {
    if (!controller) return false;
    if (/UTGameRewardsViewController/i.test(pageRuntime.controllerName(controller))) return true;
    const root = pageRuntime.controllerRoot(controller);
    return !!root?.querySelector?.(REWARD_CONTROLLER_MARKER_SELECTOR);
  }

  function activeController() {
    return pageRuntime.popupControllerCandidates().find(isRewardsController) || null;
  }

  function findDomRoot() {
    const marker = dom.queryAll(REWARD_MARKER_SELECTOR).find(isClickableElement);
    if (!marker) return null;
    return marker.closest?.(REWARD_ROOT_SELECTOR) || marker.parentElement;
  }

  function isVisible() {
    return !!activeController() || !!findDomRoot() || !!findClaimContext();
  }

  async function dismiss(label) {
    const controller = activeController();
    if (controller && typeof controller.onBackButton === 'function') {
      log(`${label}: closing ${pageRuntime.controllerName(controller) || 'SBC reward'} overlay`);
      controller.onBackButton();
      await sleep(700);
      return true;
    }

    const root = findDomRoot();
    const action = root?.querySelector?.(REWARD_ACTION_SELECTOR);
    if (!action) return false;
    const actionText = compactText(action);
    log(`${label}: advancing SBC reward overlay${actionText ? ` (${actionText})` : ''}`);
    click(action);
    await sleep(700);
    return true;
  }

  return Object.freeze({
    activeController,
    dismiss,
    dismissSubmitError,
    findClaimButton,
    findClaimContext,
    findDomRoot,
    findSubmitError,
    isRewardsController,
    isVisible,
  });
}
