import { describe, expect, it, vi } from 'vitest';
import { createHttpAdapter } from '../../src/adapters/browser/http.js';

describe('browser HTTP adapter', () => {
  it('uses GM transport with headers, cookies, timeout, and HTTP status handling', async () => {
    const gmRequest = vi.fn((request) => request.onload({ status: 200, responseText: 'ok' }));
    const adapter = createHttpAdapter({ gmRequest });
    await expect(adapter.getText('https://example.test/data', {
      sendCookies: true,
      headers: { Accept: 'application/json' },
      timeout: 5000,
    })).resolves.toBe('ok');
    expect(gmRequest).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      url: 'https://example.test/data',
      anonymous: false,
      nocache: true,
      headers: { Accept: 'application/json' },
      timeout: 5000,
    }));

    const rejected = createHttpAdapter({
      gmRequest: (request) => request.onload({ status: 403, responseText: 'forbidden' }),
    });
    await expect(rejected.getText('https://example.test/forbidden')).rejects.toThrow('HTTP 403');
  });

  it('uses the explicit runtime fallback only for callers that allow it', async () => {
    const runtimeFallback = vi.fn(async () => 'fallback');
    const fetchImpl = vi.fn(async () => ({ ok: true, text: async () => 'fetch' }));
    const adapter = createHttpAdapter({ runtimeFallback, fetchImpl });
    await expect(adapter.getText('http://127.0.0.1/config', { useRuntimeFallback: true })).resolves.toBe('fallback');
    await expect(adapter.getText('https://example.test/price')).resolves.toBe('fetch');
    expect(runtimeFallback).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('maps cookie and header options to fetch transport', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, text: async () => 'body' }));
    const adapter = createHttpAdapter({ fetchImpl });
    await adapter.getText('https://example.test/data', {
      sendCookies: false,
      headers: { Accept: 'application/json' },
    });
    expect(fetchImpl).toHaveBeenCalledWith('https://example.test/data', {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      credentials: 'omit',
    });
  });

  it('reports transport and timeout failures consistently', async () => {
    const failed = createHttpAdapter({ gmRequest: (request) => request.onerror() });
    await expect(failed.getText('https://example.test/error')).rejects.toThrow('request failed');
    const timedOut = createHttpAdapter({ gmRequest: (request) => request.ontimeout() });
    await expect(timedOut.getText('https://example.test/timeout')).rejects.toThrow('request timed out');
    await expect(createHttpAdapter().getText('https://example.test/missing')).rejects.toThrow('HTTP transport is unavailable');
  });
});
