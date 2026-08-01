import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SBC_FODDER_POLICY,
  effectiveNormalGoldMaxRating,
  effectiveSbcFodderPolicy,
  normalizeSbcFodderPolicy,
  resolveSbcFodderPolicy,
} from '../../src/config/sbc-fodder-policy.js';

describe('SBC fodder policy', () => {
  it('uses the shared 82/88 defaults and infers mode from structured rating metadata', () => {
    expect(normalizeSbcFodderPolicy()).toEqual(DEFAULT_SBC_FODDER_POLICY);
    expect(effectiveSbcFodderPolicy({ requirements: [] }).mode).toBe('low-gold');
    expect(effectiveSbcFodderPolicy({ ratingSbcFill: {} }).mode).toBe('rating-constrained');
    expect(effectiveSbcFodderPolicy({
      dynamicChallenges: [{ targetRating: 84 }],
    }).mode).toBe('rating-constrained');
  });

  it('inherits global and Workflow values while allowing a child override', () => {
    const globalPolicy = normalizeSbcFodderPolicy({
      lowRatedGoldMaxRating: 81,
      ratingSbcMaxCardRating: 87,
    });
    const workflowPolicy = resolveSbcFodderPolicy(globalPolicy, {
      sbcFodderPolicy: { ratingSbcMaxCardRating: 89 },
    });
    const childPolicy = effectiveSbcFodderPolicy({
      sbcFodderPolicy: { mode: 'low-gold', lowRatedGoldMaxRating: 80 },
    }, workflowPolicy);

    expect(workflowPolicy).toEqual({
      mode: 'auto',
      lowRatedGoldMaxRating: 81,
      ratingSbcMaxCardRating: 89,
    });
    expect(childPolicy).toEqual({
      mode: 'low-gold',
      lowRatedGoldMaxRating: 80,
      ratingSbcMaxCardRating: 89,
    });
  });

  it('intersects the low-Gold limit with FSU and business limits', () => {
    const policy = normalizeSbcFodderPolicy({ lowRatedGoldMaxRating: 82 });
    expect(effectiveNormalGoldMaxRating(policy, [75, 83])).toBe(82);
    expect(effectiveNormalGoldMaxRating(policy, [75, 80])).toBe(80);
    expect(effectiveNormalGoldMaxRating(policy, [75, 90], 81)).toBe(81);
  });

  it('reads legacy protection fields without generating them', () => {
    expect(normalizeSbcFodderPolicy({
      protectHighGold: true,
      highGoldThreshold: 84,
    })).toEqual({
      mode: 'auto',
      lowRatedGoldMaxRating: 83,
      ratingSbcMaxCardRating: 88,
    });
    expect(effectiveSbcFodderPolicy({
      ratingSbcFill: {},
      maxSubmittedRating: 86,
    })).toEqual({
      mode: 'rating-constrained',
      lowRatedGoldMaxRating: 82,
      ratingSbcMaxCardRating: 86,
    });
  });
});
