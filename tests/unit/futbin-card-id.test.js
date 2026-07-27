import { describe, expect, it, vi } from 'vitest';
import {
  cacheFutbinPlayerId,
  createFutbinFilteredPlayersUrl,
  getCachedFutbinPlayerId,
  normalizeFutbinCardIdCache,
  parseFutbinFilteredPlayerId,
  resolveFutbinCardIds,
} from '../../src/reward/futbin-card-id.js';

const CONTEXT = {
  definitionId: 886062903293,
  season: 26,
  platform: 'PS',
  nationId: 38,
  leagueId: 13,
  teamId: 243,
  rating: 91,
  position: 'CB',
};

describe('FUTBIN card ID resolver', () => {
  it('builds the same metadata-filtered endpoint used for an exact EA definition match', () => {
    const url = createFutbinFilteredPlayersUrl(CONTEXT);
    expect(url).toContain('https://www.futbin.org/futbin/api/26/getFilteredPlayers?');
    const query = new URL(url).searchParams;
    expect(Object.fromEntries(query.entries())).toEqual({
      platform: 'PS', nation: '38', league: '13', rating: '91-91', club: '243',
      sort: 'rating', position: 'CB', order: 'desc', page: '1',
    });
    expect(createFutbinFilteredPlayersUrl({ ...CONTEXT, position: '' })).toBeNull();
  });

  it('accepts only the FUTBIN row whose resource ID exactly matches the EA definition ID', () => {
    const response = JSON.stringify({
      data: [
        { resource_id: '886062903294', ID: 11111 },
        { resource_id: '886062903293', ID: '51234' },
      ],
    });
    expect(parseFutbinFilteredPlayerId(response, CONTEXT.definitionId)).toBe(51234);
    expect(parseFutbinFilteredPlayerId(response, 886062903299)).toBeNull();
    expect(parseFutbinFilteredPlayerId('not json', CONTEXT.definitionId)).toBeNull();
  });

  it('keeps cache entries scoped by season, platform, and EA definition ID', () => {
    const cache = normalizeFutbinCardIdCache({
      version: 1,
      entries: {
        '26:PS:886062903293': '51234',
        '26:PC:886062903293': 61234,
        'bad:key': 99999,
      },
    });
    expect(getCachedFutbinPlayerId(cache, CONTEXT)).toBe(51234);
    expect(getCachedFutbinPlayerId(cache, { ...CONTEXT, platform: 'PC' })).toBe(61234);
    expect(cacheFutbinPlayerId(cache, { ...CONTEXT, definitionId: 900000000001 }, 71234)).toBe(true);
    expect(getCachedFutbinPlayerId(cache, { ...CONTEXT, definitionId: 900000000001 })).toBe(71234);
  });

  it('uses FSU-known IDs first, then caches only exact special-card matches', async () => {
    const normal = { definitionId: 1001, special: false };
    const special = { definitionId: CONTEXT.definitionId, special: true };
    const requestText = vi.fn(async () => JSON.stringify({
      data: [{ resource_id: CONTEXT.definitionId, ID: 51234 }],
    }));
    const result = await resolveFutbinCardIds({
      items: [normal, special],
      cache: null,
      resolveKnownId: (item) => item.definitionId === normal.definitionId ? 16453 : null,
      getLookupContext: (item) => item.definitionId === special.definitionId ? CONTEXT : null,
      shouldResolve: (item) => item.special === true,
      requestText,
    });
    expect(requestText).toHaveBeenCalledTimes(1);
    expect(requestText).toHaveBeenCalledWith(expect.stringContaining('getFilteredPlayers'), expect.objectContaining({
      sendCookies: false,
      headers: { Accept: 'application/json' },
    }));
    expect(result.ids.get(normal.definitionId)).toBe(16453);
    expect(result.ids.get(special.definitionId)).toBe(51234);
    expect(result).toMatchObject({ queried: 1, resolved: 1, failed: 0, unmatched: 0 });
    expect(getCachedFutbinPlayerId(result.cache, CONTEXT)).toBe(51234);
  });

  it('keeps the link hidden when FUTBIN has no exact matching special-card resource ID', async () => {
    const result = await resolveFutbinCardIds({
      items: [{ definitionId: CONTEXT.definitionId, special: true }],
      getLookupContext: () => CONTEXT,
      shouldResolve: () => true,
      requestText: async () => JSON.stringify({ data: [{ resource_id: 123, ID: 51234 }] }),
    });
    expect(result.ids.has(CONTEXT.definitionId)).toBe(false);
    expect(result).toMatchObject({ queried: 1, resolved: 0, failed: 0, unmatched: 1 });
  });
});
