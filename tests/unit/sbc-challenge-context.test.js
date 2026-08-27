import { describe, expect, it } from 'vitest';
import { findRegisteredSbcChallenge } from '../../src/sbc/challenge-context.js';

describe('SBC registered Challenge context', () => {
  it('resolves a discovery DTO to the exact Challenge model registered by the Set', () => {
    const registered = { id: 3935, squad: { id: 'registered-squad' } };
    const discoveryDto = { id: 3935, squad: { id: 'dao-squad' } };
    const set = {
      getChallenge: (id) => (id === 3935 ? registered : null),
      challenges: { _collection: [registered] },
    };

    expect(findRegisteredSbcChallenge(set, discoveryDto.id)).toBe(registered);
    expect(findRegisteredSbcChallenge(set, discoveryDto.id)).not.toBe(discoveryDto);
  });

  it('never substitutes a same-name, adjacent, or mismatched Challenge', () => {
    const sameName = { id: 3936, name: 'Rare Gold Pick' };
    const set = {
      getChallenge: () => sameName,
      challenges: { _collection: [sameName] },
    };

    expect(findRegisteredSbcChallenge(set, 3935)).toBeNull();
    expect(findRegisteredSbcChallenge(set, 0)).toBeNull();
  });

  it('supports Set collections when getChallenge is unavailable', () => {
    const registered = { id: 3953 };
    const set = { _challenges: { _collection: { 3953: registered } } };

    expect(findRegisteredSbcChallenge(set, 3953)).toBe(registered);
  });
});
