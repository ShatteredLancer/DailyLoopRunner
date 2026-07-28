import { describe, expect, it } from 'vitest';
import { findSbcSetByPreferredId } from '../../src/sbc/set-identity.js';

describe('SBC Set identity resolution', () => {
  it('prefers scanned identity order over EA repository order', () => {
    const fallback = { id: 100, name: 'Compatibility SBC' };
    const scanned = { id: 200, name: 'Current SBC' };

    expect(findSbcSetByPreferredId([fallback, scanned], [200, 100])).toBe(scanned);
  });

  it('uses later compatibility identities only when preferred identities are unavailable', () => {
    const fallback = { id: 100, name: 'Compatibility SBC' };

    expect(findSbcSetByPreferredId([fallback], [200, 100, 100, null])).toBe(fallback);
    expect(findSbcSetByPreferredId([fallback], [200])).toBeNull();
  });
});
