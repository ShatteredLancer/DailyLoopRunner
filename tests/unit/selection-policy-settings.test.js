import { describe, expect, it, vi } from 'vitest';
import { showSelectionPolicySettings } from '../../src/ui/selection-policy-settings.js';

function harness() {
  const byId = new Map();
  const create = (tagName) => {
    const listeners = new Map();
    const children = [];
    const attributes = new Map();
    const element = {
      tagName: String(tagName).toUpperCase(),
      style: {},
      dataset: {},
      children,
      textContent: '',
      value: '',
      checked: false,
      removed: false,
      addEventListener(type, callback) { listeners.set(type, callback); },
      append(...items) { items.forEach((item) => element.appendChild(item)); },
      appendChild(item) {
        children.push(item);
        if (item.id) byId.set(`#${item.id}`, item);
      },
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.get(name) || ''; },
      remove() { element.removed = true; },
      click() { return listeners.get('click')?.({ target: element }); },
    };
    return element;
  };
  return {
    byId,
    dom: {
      create,
      query: (selector) => byId.get(selector) || null,
      appendToBody(element) { if (element.id) byId.set(`#${element.id}`, element); },
    },
  };
}

describe('selection policy settings modal', () => {
  it('separates standard SBC, automatic-use, and Pick handling settings', async () => {
    const ui = harness();
    const onSave = vi.fn(async () => true);
    const overlay = showSelectionPolicySettings({
      dom: ui.dom,
      sbcFodderOptions: { lowRatedGoldMaxRating: 82, ratingSbcMaxCardRating: 88 },
      pickOptions: {
        protectionRating: 90,
        autoSelectBelow90: true,
        openPicksAtEnd: false,
        rollingStorageSinkEnabled: false,
        rollingSurplusCraftingEnabled: false,
        rollingProvisionsShortageRecoveryEnabled: false,
        rollingRequiredSpecialRecoveryEnabled: false,
        rollingProtectAllClubNonTotwSpecials: false,
        rollingAllowClubCurrentPoolSpecialsForProvisions: false,
        rollingStoragePressureClubBoostersEnabled: false,
        rollingDuplicateSwapEnabled: false,
        rollingProvisionsMaxRating: 88,
        rollingRecoveryStorageFirst: false,
        rollingOpenDuplicateProvisionsRewards: false,
        rollingShortageProvisionsPackLimit: 2,
      },
      storageSinkCandidates: [
        { setId: 20995, name: '1 of 3 95+ Player Pick', rewardKind: 'player-pick', challengeRatings: [88, 89], status: 'validated' },
        { setId: 20994, name: '94 Rated Campaign Player', rewardKind: 'player', challengeRatings: [87, 89], status: 'validated' },
      ],
      onSave,
    });

    expect(ui.byId.get('#bronze-loop-policy-low-rated-gold-max').value).toBe('82');
    expect(ui.byId.get('#bronze-loop-policy-rating-sbc-max-card').value).toBe('88');
    expect(ui.byId.get('#bronze-loop-policy-automatic-use-max').value).toBe('90');
    expect(ui.byId.get('#bronze-loop-pick-mode').value).toBe('rating-auto');
    expect(ui.byId.get('#bronze-loop-policy-rolling-storage-sink-mode').value).toBe('off');
    expect(ui.byId.get('#bronze-loop-policy-rolling-storage-sink-set').value).toBe('20995');
    expect(ui.byId.get('#bronze-loop-policy-rolling-surplus-crafting').checked).toBe(false);
    expect(ui.byId.get('#bronze-loop-policy-rolling-provisions-shortage-recovery').checked).toBe(false);
    expect(ui.byId.get('#bronze-loop-policy-rolling-required-special-recovery').checked).toBe(false);
    expect(ui.byId.get('#bronze-loop-policy-rolling-protect-club-specials').checked).toBe(false);
    expect(ui.byId.get('#bronze-loop-policy-rolling-allow-club-current-pool-provisions').checked).toBe(false);
    expect(ui.byId.get('#bronze-loop-policy-rolling-allow-club-current-pool-provisions').disabled).toBe(false);
    expect(ui.byId.get('#bronze-loop-policy-rolling-storage-pressure-club-boosters').checked).toBe(false);
    expect(ui.byId.get('#bronze-loop-policy-rolling-duplicate-swap').checked).toBe(false);
    expect(ui.byId.get('#bronze-loop-policy-rolling-duplicate-swap-mode').value).toBe('off');
    expect(ui.byId.get('#bronze-loop-policy-rolling-provisions-max-rating').value).toBe('88');
    expect(ui.byId.get('#bronze-loop-policy-rolling-provisions-max-rating').children
      .map((option) => [option.value, option.textContent]))
      .toEqual([
        ['88', '87-88'],
        ['89', '87-89'],
        ['90', '87-90'],
        ['91', '87-91'],
      ]);
    expect(ui.byId.get('#bronze-loop-policy-rolling-recovery-storage-first').checked).toBe(false);
    expect(ui.byId.get('#bronze-loop-policy-rolling-storage-recovery-priority').value).toBe('storage-pressure-only');
    expect(ui.byId.get('#bronze-loop-policy-rolling-storage-recovery-priority').children
      .map((option) => [option.value, option.textContent]))
      .toEqual([
        ['storage-pressure-only', 'Storage Pressure only'],
        ['provisions-only', 'Provisions only'],
        ['provisions-then-storage-pressure', 'Provisions once, then Storage Pressure'],
      ]);
    expect(ui.byId.get('#bronze-loop-policy-rolling-shortage-provisions-pack-limit').value).toBe('2');
    expect(ui.byId.get('#bronze-loop-policy-rolling-open-duplicate-provisions-rewards').checked).toBe(false);
    expect(ui.byId.get('#bronze-loop-policy-protect-fsu-locked-players').checked).toBe(false);
    expect(ui.byId.get('#bronze-loop-policy-protect-active-squad-players').checked).toBe(false);

    ui.byId.get('#bronze-loop-policy-low-rated-gold-max').value = '81';
    ui.byId.get('#bronze-loop-policy-rating-sbc-max-card').value = '89';
    ui.byId.get('#bronze-loop-policy-automatic-use-max').value = '95';
    ui.byId.get('#bronze-loop-pick-mode').value = 'rating-review';
    ui.byId.get('#bronze-loop-policy-rolling-storage-sink-mode').value = 'selected';
    ui.byId.get('#bronze-loop-policy-rolling-storage-sink-set').value = '20994';
    ui.byId.get('#bronze-loop-policy-rolling-surplus-crafting').checked = true;
    ui.byId.get('#bronze-loop-policy-rolling-provisions-shortage-recovery').checked = true;
    ui.byId.get('#bronze-loop-policy-rolling-required-special-recovery').checked = true;
    ui.byId.get('#bronze-loop-policy-rolling-protect-club-specials').checked = true;
    ui.byId.get('#bronze-loop-policy-rolling-allow-club-current-pool-provisions').checked = true;
    ui.byId.get('#bronze-loop-policy-rolling-storage-pressure-club-boosters').checked = true;
    ui.byId.get('#bronze-loop-policy-rolling-duplicate-swap').checked = true;
    ui.byId.get('#bronze-loop-policy-pick-open-at-end').checked = true;
    ui.byId.get('#bronze-loop-policy-rolling-provisions-max-rating').value = '91';
    ui.byId.get('#bronze-loop-policy-rolling-recovery-storage-first').checked = true;
    ui.byId.get('#bronze-loop-policy-rolling-storage-recovery-priority').value = 'provisions-then-storage-pressure';
    ui.byId.get('#bronze-loop-policy-rolling-shortage-provisions-pack-limit').value = '4';
    ui.byId.get('#bronze-loop-policy-rolling-open-duplicate-provisions-rewards').checked = true;
    ui.byId.get('#bronze-loop-policy-protect-fsu-locked-players').checked = true;
    ui.byId.get('#bronze-loop-policy-protect-active-squad-players').checked = true;
    await ui.byId.get('#bronze-loop-policy-save').click();

    expect(onSave).toHaveBeenCalledWith({
      sbcFodderOptions: expect.objectContaining({ lowRatedGoldMaxRating: 81, ratingSbcMaxCardRating: 89 }),
      pickOptions: expect.objectContaining({
        protectionRating: 95,
        autoSelectBelow90: false,
        pickSelectionMode: 'rating-review',
        openPicksAtEnd: true,
        rollingStorageSinkEnabled: true,
        rollingStorageSinkMode: 'selected',
        rollingStorageSinkSetId: 20994,
        rollingStorageSinkSetName: '94 Rated Campaign Player',
        rollingSurplusCraftingEnabled: true,
        rollingProvisionsShortageRecoveryEnabled: true,
        rollingRequiredSpecialRecoveryEnabled: true,
        rollingProtectAllClubNonTotwSpecials: true,
        rollingAllowClubCurrentPoolSpecialsForProvisions: false,
        rollingStoragePressureClubBoostersEnabled: true,
        rollingDuplicateSwapEnabled: true,
        rollingDuplicateSwapMode: 'special-only',
        rollingProvisionsMaxRating: 91,
        rollingRecoveryStorageFirst: true,
        rollingStorageRecoveryPriority: 'provisions-then-storage-pressure',
        rollingOpenDuplicateProvisionsRewards: true,
        rollingShortageProvisionsPackLimit: 4,
        protectFsuLockedPlayers: true,
        protectActiveSquadPlayers: true,
      }),
    });
    expect(overlay.removed).toBe(true);
  });

  it('clamps imported legacy values through the existing normalizers', async () => {
    const ui = harness();
    const onSave = vi.fn(async () => true);
    showSelectionPolicySettings({
      dom: ui.dom,
      sbcFodderOptions: { lowRatedGoldMaxRating: 120, ratingSbcMaxCardRating: 0 },
      pickOptions: { autoPickThreshold: 101, autoSelectBelow90: false },
      onSave,
    });
    expect(ui.byId.get('#bronze-loop-policy-low-rated-gold-max').value).toBe('99');
    expect(ui.byId.get('#bronze-loop-policy-rating-sbc-max-card').value).toBe('1');
    expect(ui.byId.get('#bronze-loop-policy-automatic-use-max').value).toBe('99');
    expect(ui.byId.get('#bronze-loop-pick-mode').value).toBe('rating-review');
    expect(ui.byId.get('#bronze-loop-policy-rolling-storage-sink-mode').value).toBe('off');
    expect(ui.byId.get('#bronze-loop-policy-rolling-surplus-crafting').checked).toBe(false);
    expect(ui.byId.get('#bronze-loop-policy-rolling-provisions-shortage-recovery').checked).toBe(false);
    expect(ui.byId.get('#bronze-loop-policy-rolling-required-special-recovery').checked).toBe(false);
    expect(ui.byId.get('#bronze-loop-policy-rolling-protect-club-specials').checked).toBe(false);
    expect(ui.byId.get('#bronze-loop-policy-rolling-allow-club-current-pool-provisions').checked).toBe(false);
    expect(ui.byId.get('#bronze-loop-policy-rolling-storage-pressure-club-boosters').checked).toBe(false);
    expect(ui.byId.get('#bronze-loop-policy-rolling-duplicate-swap').checked).toBe(false);
    expect(ui.byId.get('#bronze-loop-policy-rolling-duplicate-swap-mode').value).toBe('off');
    expect(ui.byId.get('#bronze-loop-policy-rolling-provisions-max-rating').value).toBe('88');
    expect(ui.byId.get('#bronze-loop-policy-rolling-recovery-storage-first').checked).toBe(false);
    expect(ui.byId.get('#bronze-loop-policy-rolling-storage-recovery-priority').value).toBe('storage-pressure-only');
    expect(ui.byId.get('#bronze-loop-policy-rolling-shortage-provisions-pack-limit').value).toBe('2');
    expect(ui.byId.get('#bronze-loop-policy-protect-fsu-locked-players').checked).toBe(false);
    expect(ui.byId.get('#bronze-loop-policy-protect-active-squad-players').checked).toBe(false);
  });

  it('persists the explicit Club current-pool Provisions fallback when strict protection is off', async () => {
    const ui = harness();
    const onSave = vi.fn(async () => true);
    showSelectionPolicySettings({
      dom: ui.dom,
      pickOptions: {
        rollingProtectAllClubNonTotwSpecials: false,
        rollingAllowClubCurrentPoolSpecialsForProvisions: true,
      },
      onSave,
    });

    expect(ui.byId.get('#bronze-loop-policy-rolling-allow-club-current-pool-provisions').checked).toBe(true);
    expect(ui.byId.get('#bronze-loop-policy-rolling-allow-club-current-pool-provisions').disabled).toBe(false);
    await ui.byId.get('#bronze-loop-policy-save').click();

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      pickOptions: expect.objectContaining({
        rollingProtectAllClubNonTotwSpecials: false,
        rollingAllowClubCurrentPoolSpecialsForProvisions: true,
      }),
    }));
  });

  it('does not save a Storage sink change when the dialog is cancelled', async () => {
    const ui = harness();
    const onSave = vi.fn(async () => true);
    const overlay = showSelectionPolicySettings({
      dom: ui.dom,
      pickOptions: { rollingStorageSinkEnabled: false },
      storageSinkCandidates: [{ setId: 20995, name: '1 of 3 95+ Player Pick' }],
      onSave,
    });
    ui.byId.get('#bronze-loop-policy-rolling-storage-sink-mode').value = 'selected';
    await ui.byId.get('#bronze-loop-policy-cancel').click();
    expect(onSave).not.toHaveBeenCalled();
    expect(overlay.removed).toBe(true);
  });
});
