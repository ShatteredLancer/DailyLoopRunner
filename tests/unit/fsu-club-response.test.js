import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const fsuSource = readFileSync(
  new URL('../../FSU_mod/【FSU】EAFC FUT WEB 增强器-26.09_mod.user.js', import.meta.url),
  'utf8',
);

function loadResponseHelpers() {
  const start = fsuSource.indexOf('            const summarizeClubResponseMetadata =');
  const end = fsuSource.indexOf('            const registerClubPayloadCaptureSession =', start);
  if (start < 0 || end < 0) throw new Error('FSU Club response helpers are missing');
  return Function(`${fsuSource.slice(start, end)}; return { summarizeClubResponseMetadata, isAuthoritativeEmptyClubResponse };`)();
}

const { summarizeClubResponseMetadata, isAuthoritativeEmptyClubResponse } = loadResponseHelpers();

function session(responseText, overrides = {}) {
  return {
    claimed: true,
    completed: true,
    responseParsed: true,
    responseParseError: null,
    responseStatus: 200,
    responseMetadata: summarizeClubResponseMetadata(responseText),
    ...overrides,
  };
}

describe('FSU scoped Club response classification', () => {
  it('records recognized collections and all top-level arrays', () => {
    expect(summarizeClubResponseMetadata(JSON.stringify({ items: [], players: [], cursor: 'next' })))
      .toMatchObject({
        collectionCounts: { items: 0, players: 0 },
        arrayCounts: { items: 0, players: 0 },
      });
  });

  it('accepts a completed 2xx response with an explicitly empty Club collection', () => {
    expect(isAuthoritativeEmptyClubResponse(session(JSON.stringify({ data: { items: [] } })))).toBe(true);
    expect(isAuthoritativeEmptyClubResponse(session(JSON.stringify({ players: [] })))).toBe(true);
  });

  it('rejects an empty capture when request ownership or response structure is uncertain', () => {
    expect(isAuthoritativeEmptyClubResponse(session(JSON.stringify({ items: [] }), { claimed: false }))).toBe(false);
    expect(isAuthoritativeEmptyClubResponse(session(JSON.stringify({ items: [] }), { completed: false }))).toBe(false);
    expect(isAuthoritativeEmptyClubResponse(session(JSON.stringify({ items: [] }), { responseStatus: 500 }))).toBe(false);
    expect(isAuthoritativeEmptyClubResponse(session(JSON.stringify({ items: [] }), { responseParseError: 'invalid JSON' }))).toBe(false);
    expect(isAuthoritativeEmptyClubResponse(session(JSON.stringify({})))).toBe(false);
  });

  it('rejects nonempty recognized or unknown collections', () => {
    expect(isAuthoritativeEmptyClubResponse(session(JSON.stringify({ items: [{ id: 1 }] })))).toBe(false);
    expect(isAuthoritativeEmptyClubResponse(session(JSON.stringify({ items: [], unknown: [{ id: 1 }] })))).toBe(false);
    expect(isAuthoritativeEmptyClubResponse(session(JSON.stringify({ data: { players: [], metadataRows: [1] } })))).toBe(false);
  });
});
