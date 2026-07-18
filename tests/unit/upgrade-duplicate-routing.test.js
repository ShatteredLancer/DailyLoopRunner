import { describe, expect, it } from 'vitest';
import { classifyOpenedUpgradeDuplicates } from '../../src/pack/upgrade-duplicate-routing.js';

function classify(items) {
  return classifyOpenedUpgradeDuplicates(items, {
    isDuplicate: (item) => item.duplicate === true,
    isEligibleDuplicate: (item) => item.duplicate === true && item.lowRare === true,
    isTradeable: (item) => item.tradeable === true,
  });
}

describe('opened upgrade duplicate routing', () => {
  it('reserves three eligible rare duplicates instead of requiring three Storage slots', () => {
    const items = [
      { id: 1, duplicate: false },
      { id: 2, duplicate: false },
      { id: 3, duplicate: true, lowRare: true },
      { id: 4, duplicate: true, lowRare: true },
      { id: 5, duplicate: true, lowRare: true },
    ];
    const plan = classify(items);
    expect(plan.directClub.map((item) => item.id)).toEqual([1, 2]);
    expect(plan.reservedDuplicates.map((item) => item.id)).toEqual([3, 4, 5]);
    expect(plan.tradeableDuplicates).toEqual([]);
    expect(plan.untradeableDuplicates).toEqual([]);
  });

  it('routes ineligible duplicates by trade status', () => {
    const plan = classify([
      { id: 1, duplicate: true, lowRare: false, tradeable: true },
      { id: 2, duplicate: true, lowRare: false, tradeable: false },
      { id: 3, duplicate: true, lowRare: true, tradeable: true },
    ]);
    expect(plan.reservedDuplicates.map((item) => item.id)).toEqual([3]);
    expect(plan.tradeableDuplicates.map((item) => item.id)).toEqual([1]);
    expect(plan.untradeableDuplicates.map((item) => item.id)).toEqual([2]);
  });
});
