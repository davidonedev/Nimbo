import { afterEach, describe, expect, it, vi } from 'vitest';
import { removeLegacyServiceWorker } from './removeLegacyServiceWorker';

describe('removeLegacyServiceWorker', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('desregistra os service workers e apaga os caches antigos', async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    const del = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations: () => Promise.resolve([{ unregister }, { unregister }]) },
    });
    vi.stubGlobal('caches', { keys: () => Promise.resolve(['nimbo-api-v1', 'workbox-precache-v2']), delete: del });

    removeLegacyServiceWorker();
    await new Promise(r => setTimeout(r, 0));

    expect(unregister).toHaveBeenCalledTimes(2);
    expect(del).toHaveBeenCalledWith('nimbo-api-v1');
    expect(del).toHaveBeenCalledWith('workbox-precache-v2');
  });

  it('não quebra em navegador sem service worker nem cache', () => {
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined });
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
    vi.stubGlobal('caches', undefined);
    expect(() => removeLegacyServiceWorker()).not.toThrow();
  });
});
