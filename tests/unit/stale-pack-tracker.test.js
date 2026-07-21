import { describe, expect, it } from 'vitest';
import { createStalePackTracker } from '../../src/pack/stale-pack-tracker.js';

describe('stale pack tracker', () => {
  it('marks object refs as stale after successful open semantics', () => {
    const tracker = createStalePackTracker();
    const pack = { id: 20441, name: 'TOTW Provision Refresh' };
    tracker.markObject(pack);
    expect(tracker.isStale(pack)).toBe(true);
    expect(tracker.isStale({ id: 20441, name: 'fresh object same id' })).toBe(false);
  });

  it('blacklists gone pack ids across refreshed object instances', () => {
    const tracker = createStalePackTracker();
    const first = { id: 20441, name: 'TOTW Provision Refresh' };
    const second = { id: 20441, name: 'TOTW Provision Refresh after refresh' };
    const realOther = { id: 20707, name: '84+ TOTW 1-30 Player Pack' };

    const marked = tracker.markGone(first);
    expect(marked).toEqual({ id: '20441', added: true });
    expect(tracker.isStale(first)).toBe(true);
    expect(tracker.isStale(second)).toBe(true);
    expect(tracker.hasGoneId(20441)).toBe(true);
    expect(tracker.isStale(realOther)).toBe(false);

    expect(tracker.markGone(second).added).toBe(false);
    expect(tracker.goneIds()).toEqual(['20441']);
  });
});
