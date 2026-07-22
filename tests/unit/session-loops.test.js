import { describe, expect, it } from 'vitest';
import { materializeSessionLoopDefs } from '../../src/config/session-loops.js';

describe('session loop materialization', () => {
  it('exports scanned overrides and pure dynamic Picks into workflow JSON', () => {
    const configured = [
      { id: 'daily', strategy: 'dailyRoutine' },
      { id: 'static-pick', strategy: 'playerPickSbc', scannedMetadata: false },
    ];
    const overridden = { id: 'static-pick', strategy: 'playerPickSbc', scannedMetadata: true };
    const dynamic = { id: 'pick-set-1256', strategy: 'playerPickSbc', discovered: true };
    expect(materializeSessionLoopDefs({
      configuredLoops: configured,
      loopOverrides: { 'static-pick': overridden },
      discoveredLoops: [dynamic, { ...dynamic }],
    })).toEqual([configured[0], overridden, dynamic]);
  });
});
