import { describe, expect, it, vi } from 'vitest';
import { findPackWithRecovery } from '../../src/pack/source-lookup.js';

describe('pack source lookup', () => {
  it('waits for a delayed source pack before declaring exhaustion', async () => {
    let cachedPack = null;
    const refresh = vi.fn(async ({ attempt }) => {
      if (attempt === 2) cachedPack = { id: 20060 };
    });
    const openStorePacks = vi.fn(async () => true);

    const pack = await findPackWithRecovery({
      label: 'Daily Rare source pack lookup',
      attempts: 3,
      delayMs: 10,
      refresh,
      findCached: () => cachedPack,
      openStorePacks,
      sleep: async () => {},
    });

    expect(pack).toEqual({ id: 20060 });
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(openStorePacks).not.toHaveBeenCalled();
  });

  it('rechecks the cache after opening Store Packs', async () => {
    let cachedPack = null;
    const onExhausted = vi.fn();
    const onStoreOpened = vi.fn();
    const pack = await findPackWithRecovery({
      attempts: 3,
      refresh: async () => {},
      findCached: () => cachedPack,
      openStorePacks: async () => {
        cachedPack = { id: 20059 };
        return true;
      },
      onStoreOpened,
      sleep: async () => {},
      onExhausted,
    });

    expect(pack).toEqual({ id: 20059 });
    expect(onStoreOpened).toHaveBeenCalledOnce();
    expect(onExhausted).not.toHaveBeenCalled();
  });

  it('reports exhaustion only after refresh and Store recovery are exhausted', async () => {
    const refresh = vi.fn(async () => {});
    const openStorePacks = vi.fn(async () => true);
    const onStoreOpened = vi.fn();
    const onExhausted = vi.fn();

    await expect(findPackWithRecovery({
      attempts: 3,
      refresh,
      findCached: () => null,
      openStorePacks,
      onStoreOpened,
      sleep: async () => {},
      onExhausted,
    })).resolves.toBeNull();

    expect(refresh).toHaveBeenCalledTimes(3);
    expect(openStorePacks).toHaveBeenCalledTimes(1);
    expect(onStoreOpened).toHaveBeenCalledOnce();
    expect(onExhausted).toHaveBeenCalledWith({ attempts: 3, storeFallbackTried: true });
  });
});
