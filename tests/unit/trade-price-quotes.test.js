import { describe, expect, it, vi } from 'vitest';
import {
  createPriceQuoteProvider,
  buildFutGgPriceUrl,
  loadPriceQuotes,
  normalizeFutGgProxy,
  parseFutGgPriceResponse,
  parseFutNextPriceResponse,
} from '../../src/trade/price-quotes.js';

describe('Trade Price Quote Provider', () => {
  it('normalizes an HTTPS proxy and emits the FSU-compatible forwarding query', () => {
    expect(normalizeFutGgProxy(' https://prices.example/api/ ')).toBe('https://prices.example/api');
    expect(buildFutGgPriceUrl({
      proxy: 'https://prices.example/api/', definitionIds: [10, 20], platform: 'pc',
    })).toBe('https://prices.example/api?futggapi=player-prices/26/?ids=10%2C20&platform=pc');
    expect(() => normalizeFutGgProxy('http://prices.example')).toThrow('HTTPS');
    expect(() => normalizeFutGgProxy('https://user:pass@prices.example')).toThrow('username');
  });

  it('uses the configured proxy without forwarding FUT.GG cookies', async () => {
    const requestText = vi.fn(async () => JSON.stringify({ data: [{ eaId: 10, price: 1000 }] }));
    const result = await loadPriceQuotes({
      definitionIds: [10], platform: 'pc', provider: 'futgg', futGgProxy: 'https://prices.example/', requestText,
    });
    expect(result.source).toBe('FUT.GG');
    expect(requestText).toHaveBeenCalledWith(
      'https://prices.example?futggapi=player-prices/26/?ids=10&platform=pc',
      expect.objectContaining({ sendCookies: false, headers: expect.not.objectContaining({ Referer: expect.anything() }) }),
    );
  });

  it('parses provider responses into validated definition prices', () => {
    expect(parseFutGgPriceResponse(JSON.stringify({ data: [
      { eaId: 10, price: 1000 },
      { eaId: 0, price: 1 },
    ] }))).toEqual([{ definitionId: 10, price: 1000 }]);
    expect(parseFutNextPriceResponse(JSON.stringify([
      { definitionId: 20, prices: [2000] },
      { definitionId: 30, prices: [0] },
    ]))).toEqual([{ definitionId: 20, price: 2000 }]);
  });

  it('fills missing FUT.GG quotes from FUTNext while retaining per-card sources', async () => {
    const requestText = vi.fn(async (url) => url.includes('fut.gg')
      ? JSON.stringify({ data: [{ eaId: 10, price: 1000 }] })
      : JSON.stringify([{ definitionId: 20, prices: [2000] }]));
    const result = await loadPriceQuotes({
      definitionIds: [10, 20],
      platform: 'pc',
      requestText,
      now: 5000,
      ttlMs: 1000,
    });
    expect(result.source).toBe('mixed');
    expect(result.quotes).toEqual([
      expect.objectContaining({ definitionId: 10, price: 1000, source: 'FUT.GG', quotedAt: 5000, expiresAt: 6000 }),
      expect.objectContaining({ definitionId: 20, price: 2000, source: 'FUTNext', quotedAt: 5000, expiresAt: 6000 }),
    ]);
    expect(requestText.mock.calls[1][0]).toContain('ids=20');
  });

  it('uses fresh provider cache and refreshes it after expiry', async () => {
    let time = 1000;
    const requestText = vi.fn(async () => JSON.stringify({ data: [{ eaId: 10, price: 1000 }] }));
    const provider = createPriceQuoteProvider({ requestText, now: () => time, ttlMs: 100 });
    expect((await provider.load({ definitionIds: [10], provider: 'futgg' })).quotes[0].price).toBe(1000);
    await provider.load({ definitionIds: [10], provider: 'futgg' });
    expect(requestText).toHaveBeenCalledTimes(1);
    time = 1200;
    await provider.load({ definitionIds: [10], provider: 'futgg' });
    expect(requestText).toHaveBeenCalledTimes(2);
    expect(provider.snapshot()).toHaveLength(1);
  });

  it('isolates cached quotes by EA platform', async () => {
    const requestText = vi.fn(async (url) => JSON.stringify({ data: [{ eaId: 10, price: url.includes('platform=ps') ? 2000 : 1000 }] }));
    const provider = createPriceQuoteProvider({ requestText, now: () => 1000 });
    expect((await provider.load({ definitionIds: [10], provider: 'futgg', platform: 'pc' })).quotes[0].price).toBe(1000);
    expect((await provider.load({ definitionIds: [10], provider: 'futgg', platform: 'ps' })).quotes[0].price).toBe(2000);
    expect(requestText).toHaveBeenCalledTimes(2);
    expect(provider.snapshot()).toHaveLength(2);
  });

  it('exposes network-free allowlisted health and explicit cache invalidation', async () => {
    let time = 1000;
    const requestText = vi.fn(async () => JSON.stringify({ data: [{ eaId: 10, price: 1000 }] }));
    const provider = createPriceQuoteProvider({ requestText, now: () => time, ttlMs: 100 });
    expect(provider.inspect()).toMatchObject({
      schemaVersion: 1,
      status: 'empty',
      cache: { entries: 0, freshEntries: 0, expiredEntries: 0, bySource: {}, byPlatform: {} },
      activity: { loadCount: 0, lastLoad: null, lastClearedAt: null },
    });
    expect(requestText).not.toHaveBeenCalled();
    await provider.load({ definitionIds: [10], provider: 'futgg', platform: 'pc' });
    const health = provider.inspect();
    expect(health).toMatchObject({
      status: 'fresh',
      cache: { entries: 1, freshEntries: 1, expiredEntries: 0, bySource: { 'FUT.GG': 1 }, byPlatform: { pc: 1 } },
      activity: {
        loadCount: 1,
        lastLoad: { provider: 'futgg', platform: 'pc', requested: 1, returned: 1 },
      },
    });
    expect(JSON.stringify(health)).not.toContain('definitionId');
    expect(JSON.stringify(health)).not.toContain('"price"');
    expect(requestText).toHaveBeenCalledTimes(1);
    time = 1200;
    expect(provider.inspect()).toMatchObject({ status: 'stale', cache: { freshEntries: 0, expiredEntries: 1 } });
    expect(requestText).toHaveBeenCalledTimes(1);
    provider.clear();
    expect(provider.inspect()).toMatchObject({
      status: 'empty',
      cache: { entries: 0 },
      activity: { loadCount: 1, lastClearedAt: 1200 },
      futGgCircuit: { state: 'closed', blockedUntil: null, reason: null },
    });
  });

  it('opens an Auto-only FUT.GG cooldown after Cloudflare 403 and resets it on clear', async () => {
    let time = 1000;
    const requestText = vi.fn(async (url) => {
      if (url.includes('fut.gg')) throw new Error('HTTP 403');
      const id = url.includes('ids=20') ? 20 : 10;
      return JSON.stringify([{ definitionId: id, prices: [id * 100] }]);
    });
    const provider = createPriceQuoteProvider({ requestText, now: () => time, futGgCircuitTtlMs: 1000 });

    const first = await provider.load({ definitionIds: [10], provider: 'auto' });
    expect(first.quotes).toEqual([expect.objectContaining({ definitionId: 10, source: 'FUTNext' })]);
    expect(first.attempts).toEqual([
      { source: 'FUT.GG', status: 'error', reason: 'HTTP 403' },
      { source: 'FUTNext', status: 'loaded' },
    ]);
    expect(provider.inspect()).toMatchObject({
      futGgCircuit: {
        state: 'open',
        blockedUntil: 2000,
        reason: expect.stringContaining('HTTP 403'),
      },
    });

    time = 1100;
    const second = await provider.load({ definitionIds: [20], provider: 'auto' });
    expect(second.attempts).toEqual([
      { source: 'FUT.GG', status: 'skipped', reason: expect.stringContaining('using FUTNext') },
      { source: 'FUTNext', status: 'loaded' },
    ]);
    expect(requestText.mock.calls.filter(([url]) => url.includes('fut.gg'))).toHaveLength(1);

    await provider.load({ definitionIds: [20], provider: 'futgg', forceRefresh: true });
    expect(requestText.mock.calls.filter(([url]) => url.includes('fut.gg'))).toHaveLength(2);

    provider.clear();
    expect(provider.inspect().futGgCircuit).toEqual({ state: 'closed', blockedUntil: null, reason: null });
    await provider.load({ definitionIds: [20], provider: 'auto' });
    expect(requestText.mock.calls.filter(([url]) => url.includes('fut.gg'))).toHaveLength(3);
  });
});
