import { describe, expect, it } from 'vitest';
import {
  applyRewardFlow,
  resolveRewardPackOpenEnabled,
  validateRewardFlow,
} from '../../src/config/reward-flow.js';

describe('reward flow configuration', () => {
  it('projects pack matching and recovery policy choices without introducing executable actions', () => {
    const loop = {
      id: 'custom',
      name: 'Custom',
      strategy: 'fillAndVerifySbc',
      rewardPackIds: [999],
      rewardPackNames: ['Old Reward'],
    };
    applyRewardFlow(loop, {
      open: 'always',
      packIds: [123],
      packNames: ['Custom Reward'],
      unassignedRecoveryPolicyIds: ['rare-gold-duplicate-overflow'],
    });

    expect(loop).toMatchObject({
      rewardOpenMode: 'always',
      rewardPackIds: [123],
      rewardPackNames: ['Custom Reward'],
      unassignedRecoveryPolicyIds: ['rare-gold-duplicate-overflow'],
    });
    expect(resolveRewardPackOpenEnabled(loop, false)).toBe(true);
  });

  it('lets never override the panel reward checkbox while inherit follows it', () => {
    expect(resolveRewardPackOpenEnabled({ rewardOpenMode: 'never' }, true)).toBe(false);
    expect(resolveRewardPackOpenEnabled({ rewardOpenMode: 'inherit' }, true)).toBe(true);
    expect(resolveRewardPackOpenEnabled({ forceOpenRewardPacks: true }, false)).toBe(true);
    expect(resolveRewardPackOpenEnabled({ forceOpenRewardPacks: true, rewardOpenMode: 'never' }, false)).toBe(true);
  });

  it('rejects invalid flow shapes and unsupported action values', () => {
    const errors = [];
    validateRewardFlow({ open: 'run-js', packIds: [], packNames: [''] }, 'rewardFlow', errors);
    expect(errors).toEqual([
      'rewardFlow.open must be one of: inherit, always, never',
      'rewardFlow.packIds must be a non-empty array',
      'rewardFlow.packNames[0] must be a non-empty string',
    ]);
  });
});
