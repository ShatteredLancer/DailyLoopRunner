import { describe, expect, it } from 'vitest';
import { createPackInstanceQueue } from '../../src/pack/instance-queue.js';

describe('pack instance queue', () => {
  it('returns distinct same-id instances in repository order', () => {
    const first = { id: 1031, instance: 1 };
    const second = { id: 1031, instance: 2 };
    const queue = createPackInstanceQueue([first, second, { id: 1100, instance: 3 }]);
    expect(queue.take({ packId: 1031 })).toBe(first);
    expect(queue.take({ packId: 1031 })).toBe(second);
    expect(queue.take({ packId: 1031 })).toBeNull();
  });
});
