import { describe, expect, it } from 'vitest';
import {
  materializeSessionLoopDefs,
  resolveSessionLoopByActivityFamily,
} from '../../src/config/session-loops.js';

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

  it('resolves exactly one dynamic fallback by activity family', () => {
    const dynamic = {
      id: 'scanned-2x84',
      strategy: 'fillAndVerifySbc',
      dynamicSbcFamily: '2x84-upgrade',
    };
    expect(resolveSessionLoopByActivityFamily([dynamic], '2x84-upgrade')).toMatchObject({
      status: 'resolved',
      loop: dynamic,
    });
    expect(resolveSessionLoopByActivityFamily([], '2x84-upgrade').status).toBe('unavailable');
    expect(resolveSessionLoopByActivityFamily([
      dynamic,
      { ...dynamic, id: 'legacy', dynamicSbcFamily: undefined, activityBinding: { family: '2x84-upgrade' } },
    ], '2x84-upgrade').status).toBe('ambiguous');
  });
});
