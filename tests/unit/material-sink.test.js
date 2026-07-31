import { describe, expect, it } from 'vitest';
import {
  assignMaterialSinkParetoLayers,
  classifyMaterialSinkCandidate,
  MATERIAL_SINK_FAMILIES,
  parseMaterialSinkReward,
  selectMaterialSinkCandidate,
} from '../../src/config/material-sink.js';

function reward(name) {
  return parseMaterialSinkReward({ type: 'PACK', name });
}

function candidate(setId, className, cost, guaranteedCount, minimumRating) {
  return {
    setId,
    setName: `Set ${setId}`,
    materialSink: {
      className,
      cost,
      reward: { guaranteedCount, minimumRating, rarity: 'rare' },
    },
  };
}

describe('material sink classification', () => {
  it('parses generic numeric and word-count Rare Gold Pack rewards', () => {
    expect(reward('5x 80+ Rare Gold Players Pack')).toMatchObject({
      guaranteedCount: 5,
      minimumRating: 80,
      rarity: 'rare',
    });
    expect(reward('84+ x3 Rare Gold Players Pack')).toMatchObject({
      guaranteedCount: 3,
      minimumRating: 84,
      rarity: 'rare',
    });
    expect(reward('Two Rare Gold Players Pack')).toMatchObject({
      guaranteedCount: 2,
      minimumRating: 75,
      rarity: 'rare',
    });
    expect(reward('Mystery Players Pack')).toBeNull();
    expect(parseMaterialSinkReward(
      { type: 'PACK', packId: 1024 },
      { fallbackText: '5x 80+ Upgrade', fallbackRarity: 'rare' },
    )).toMatchObject({
      guaranteedCount: 5,
      minimumRating: 80,
      rarity: 'rare',
    });
  });

  it('classifies the Common Gold baseline and a cheaper, better premium', () => {
    const familyId = MATERIAL_SINK_FAMILIES.commonGold;
    expect(classifyMaterialSinkCandidate({
      familyId,
      cost: 11,
      reward: reward('Two Rare Gold Players Pack'),
    }).className).toBe('baseline');
    expect(classifyMaterialSinkCandidate({
      familyId,
      cost: 9,
      reward: reward('5x 80+ Rare Gold Players Pack'),
    }).className).toBe('premium');
  });

  it('classifies 2x84 as the Rare Gold baseline and future superior sinks as premium', () => {
    const familyId = MATERIAL_SINK_FAMILIES.rareGold;
    expect(classifyMaterialSinkCandidate({
      familyId,
      cost: 6,
      reward: reward('2x 84+ Rare Gold Players Pack'),
    }).className).toBe('baseline');
    expect(classifyMaterialSinkCandidate({
      familyId,
      cost: 5,
      reward: reward('3x 85+ Rare Gold Players Pack'),
    }).className).toBe('premium');
  });

  it('keeps weaker and cross-tradeoff candidates out of normal selection', () => {
    const familyId = MATERIAL_SINK_FAMILIES.commonGold;
    expect(classifyMaterialSinkCandidate({
      familyId,
      cost: 12,
      reward: reward('One Rare Gold Player Pack'),
    }).className).toBe('sub-baseline');
    expect(classifyMaterialSinkCandidate({
      familyId,
      cost: 8,
      reward: reward('One Rare Gold Player Pack'),
    }).className).toBe('incomparable');
    expect(classifyMaterialSinkCandidate({ familyId, cost: 8, reward: null }).className)
      .toBe('incomparable');
  });
});

describe('material sink ranking', () => {
  it('builds Pareto layers before applying a preference', () => {
    const efficient = candidate(1, 'premium', 8, 5, 81);
    const dominated = candidate(2, 'premium', 9, 4, 80);
    const highRating = candidate(3, 'premium', 9, 3, 82);
    expect(assignMaterialSinkParetoLayers([efficient, dominated, highRating]))
      .toEqual([[efficient, highRating], [dominated]]);
  });

  it('supports reward, quantity and cost preferences among non-dominated Premium candidates', () => {
    const quantity = candidate(10, 'premium', 9, 6, 80);
    const rating = candidate(11, 'premium', 8, 3, 82);
    expect(selectMaterialSinkCandidate([quantity, rating], {
      classes: ['premium'], preference: 'reward-first',
    }).candidate).toBe(rating);
    expect(selectMaterialSinkCandidate([quantity, rating], {
      classes: ['premium'], preference: 'quantity-first',
    }).candidate).toBe(quantity);
    expect(selectMaterialSinkCandidate([quantity, rating], {
      classes: ['premium'], preference: 'cost-first',
    }).candidate).toBe(rating);
  });

  it('prefers Premium over Baseline and reports an unconfigured top tie as ambiguous', () => {
    const baseline = candidate(20, 'baseline', 6, 2, 84);
    const premium = candidate(21, 'premium', 5, 3, 85);
    expect(selectMaterialSinkCandidate([baseline, premium], {
      classes: ['baseline', 'premium'], preference: 'reward-first',
    }).candidate).toBe(premium);

    const quantity = candidate(22, 'premium', 6, 5, 84);
    const rating = candidate(23, 'premium', 6, 3, 86);
    expect(selectMaterialSinkCandidate([quantity, rating], { classes: ['premium'] }).status)
      .toBe('ambiguous');
  });
});
