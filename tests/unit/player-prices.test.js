import { describe, expect, it, vi } from 'vitest';
import { loadPlayerPickPrices } from '../../src/reward/player-prices.js';

const items = [{ definitionId: 10 }, { definitionId: 20 }, { definitionId: 10 }];

describe('Player Pick price fallback', () => {
  it('uses FUT.GG prices and sends browser-context request options', async () => {
    const requestText = vi.fn(async () => JSON.stringify({ data: [{ eaId: 10, price: 12345 }] }));
    const result = await loadPlayerPickPrices({ items, platform: 'pc', referer: 'https://www.ea.com', requestText });
    expect(result.source).toBe('FUT.GG');
    expect(result.prices.get(10)).toBe(12345);
    expect(requestText).toHaveBeenCalledWith(
      expect.stringContaining('ids=10%2C20'),
      expect.objectContaining({
        sendCookies: true,
        headers: expect.objectContaining({ Referer: 'https://www.ea.com', 'X-Requested-With': 'XMLHttpRequest' }),
      }),
    );
    expect(requestText).toHaveBeenCalledTimes(1);
  });

  it('falls back to FUTNext when FUT.GG fails', async () => {
    const requestText = vi.fn(async (url) => {
      if (url.includes('fut.gg')) throw new Error('HTTP 403');
      return JSON.stringify([{ definitionId: 20, prices: [45678] }]);
    });
    const result = await loadPlayerPickPrices({ items, platform: 'pc', requestText });
    expect(result.source).toBe('FUTNext');
    expect(result.prices.get(20)).toBe(45678);
    expect(result.attempts).toEqual([
      { source: 'FUT.GG', status: 'error', reason: 'HTTP 403' },
      { source: 'FUTNext', status: 'loaded' },
    ]);
  });

  it('falls back when FUT.GG returns no usable prices', async () => {
    const requestText = vi.fn(async (url) => url.includes('fut.gg')
      ? JSON.stringify({ data: [] })
      : JSON.stringify([{ eaId: 10, prices: [5000] }]));
    const result = await loadPlayerPickPrices({ items, requestText });
    expect(result.source).toBe('FUTNext');
    expect(result.attempts.map((attempt) => attempt.status)).toEqual(['empty', 'loaded']);
  });

  it('returns an empty map and both diagnostics when providers fail', async () => {
    const result = await loadPlayerPickPrices({
      items,
      requestText: async (url) => { throw new Error(url.includes('fut.gg') ? 'HTTP 403' : 'HTTP 500'); },
    });
    expect(result.source).toBeNull();
    expect(result.prices.size).toBe(0);
    expect(result.attempts).toEqual([
      { source: 'FUT.GG', status: 'error', reason: 'HTTP 403' },
      { source: 'FUTNext', status: 'error', reason: 'HTTP 500' },
    ]);
  });
});
