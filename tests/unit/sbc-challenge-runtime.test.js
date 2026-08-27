import { describe, expect, it, vi } from 'vitest';
import { loadUserscript } from '../helpers/load-userscript.js';

function observable(result, beforeReply = null) {
  return {
    observe(controller, callback) {
      beforeReply?.();
      callback({ unobserve() {} }, result);
    },
  };
}

function rareGoldChallenge(id) {
  return {
    id,
    requiredPlayerCount: 6,
    eligibilityRequirements: [
      { key: 'PLAYER_RARITY_GROUP', values: [4], count: 6 },
      { key: 'PLAYER_QUALITY', values: [3], count: -1 },
    ],
  };
}

describe('dynamic SBC Challenge runtime context', () => {
  it('falls back to the standard live request when the direct DAO metadata request fails', async () => {
    const { api, window } = await loadUserscript({ pageReady: true, fastTimers: true });
    const registered = rareGoldChallenge(3953);
    const set = { id: 1389, name: '1 of 3 85+ Player Pick', challenges: { _collection: [] } };
    const getChallengesForSet = vi.fn(() => observable({ success: false, status: 512 }));
    const requestChallengesForSet = vi.fn(() => observable(
      { success: true, data: { challenges: [registered] } },
      () => { set.challenges._collection = [registered]; },
    ));
    window.services.SBC.sbcDAO = { getChallengesForSet };
    window.services.SBC.requestChallengesForSet = requestChallengesForSet;

    await expect(api.loadDynamicSbcDiscoveryChallenges(set, { challengeIds: [3953] }, {
      cachedSnapshot: true,
    })).resolves.toEqual([registered]);
    expect(getChallengesForSet).toHaveBeenCalledWith(1389);
    expect(requestChallengesForSet).toHaveBeenCalledWith(set);
  });

  it('preserves the dynamic scan circuit when the direct DAO returns a 429 result', async () => {
    const { api, window } = await loadUserscript({ pageReady: true, fastTimers: true });
    const set = { id: 1389, name: '1 of 3 85+ Player Pick', challenges: { _collection: [] } };
    const getChallengesForSet = vi.fn(() => observable({
      success: false,
      status: 429,
      error: { code: 429, message: 'Too Many Requests' },
    }));
    const requestChallengesForSet = vi.fn();
    window.services.SBC.sbcDAO = { getChallengesForSet };
    window.services.SBC.requestChallengesForSet = requestChallengesForSet;

    await expect(api.loadDynamicSbcDiscoveryChallenges(set, { challengeIds: [3953] }, {
      cachedSnapshot: true,
    })).rejects.toMatchObject({ status: 429 });
    expect(getChallengesForSet).toHaveBeenCalledWith(1389);
    expect(requestChallengesForSet).not.toHaveBeenCalled();
  });

  it('uses the exact Set-registered model for the SBC screen', async () => {
    const { api, window } = await loadUserscript({ pageReady: true, fastTimers: true });
    const registered = rareGoldChallenge(3935);
    const discoveryDto = rareGoldChallenge(3935);
    const set = {
      id: 1380,
      name: '2 of 3 86+ Player Pick',
      challenges: { _collection: [registered] },
      getChallenge: (id) => (id === registered.id ? registered : null),
    };
    window.services.SBC.requestChallengesForSet = vi.fn();

    await expect(api.resolveSbcChallengeForScreen(set, discoveryDto)).resolves.toBe(registered);
    expect(window.services.SBC.requestChallengesForSet).not.toHaveBeenCalled();
  });

  it('fails closed when a live refresh does not register the exact Challenge id', async () => {
    const { api, window } = await loadUserscript({ pageReady: true, fastTimers: true });
    const adjacent = rareGoldChallenge(3936);
    const set = {
      id: 1380,
      name: '2 of 3 86+ Player Pick',
      challenges: { _collection: [adjacent] },
      getChallenge: () => adjacent,
    };
    window.services.SBC.requestChallengesForSet = vi.fn(() => observable({
      success: true,
      data: { challenges: [adjacent] },
    }));

    await expect(api.resolveSbcChallengeForScreen(set, rareGoldChallenge(3935)))
      .rejects.toThrow(/Challenge #3935 is not registered in Set #1380/);
  });
});
