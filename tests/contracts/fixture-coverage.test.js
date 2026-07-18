import { describe, expect, it } from 'vitest';
import { loadFixture } from '../helpers/fixtures.js';
import { loadUserscript } from '../helpers/load-userscript.js';

describe('M0 fixture coverage', () => {
  it('registers normal and recovery behavior for every built-in loop', async () => {
    const { api } = await loadUserscript();
    const scenarios = await loadFixture('workflow-scenarios.json');
    const loopIds = api.LOOP_DEFS.map((loop) => loop.id).sort();
    const scenarioIds = Object.keys(scenarios.loops).sort();
    expect(scenarioIds).toEqual(loopIds);
    for (const [loopId, coverage] of Object.entries(scenarios.loops)) {
      expect(coverage.normal, `${loopId} normal scenario`).toMatch(/\S/);
      expect(coverage.recovery, `${loopId} recovery scenario`).toMatch(/\S/);
    }
  });

  it('keeps representative EA, FSU, inventory and pack fixtures readable', async () => {
    const fsu = await loadFixture('fsu/selection-policy.json');
    const packs = await loadFixture('packs/my-packs.json');
    const overflow = await loadFixture('inventory/storage-overflow.json');
    const daily = await loadFixture('challenges/daily-progress.json');
    const rating = await loadFixture('challenges/rating-84x10.json');

    expect(fsu.goldRange).toHaveLength(2);
    expect(packs.packs).toHaveLength(packs.expected.total);
    expect(overflow.unassigned).toHaveLength(overflow.expected.count);
    expect(daily.set.repeats).toBeGreaterThan(daily.set.timesCompleted);
    expect(rating.players).toHaveLength(rating.model.requiredPlayerCount);
  });
});
