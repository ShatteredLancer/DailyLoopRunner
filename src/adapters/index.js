import { createDomAdapter } from './browser/dom.js';
import { createStorageAdapter } from './browser/storage.js';
import { createFsuAdapter } from './ea/fsu.js';
import { createEaInventoryAdapter } from './ea/inventory.js';
import { createEaPackAdapter } from './ea/pack.js';
import { createEaSbcAdapter } from './ea/sbc.js';

export function createRuntimeAdapters(runtime, documentObject = runtime?.document || globalThis.document) {
  return Object.freeze({
    inventory: createEaInventoryAdapter(runtime),
    pack: createEaPackAdapter(runtime),
    sbc: createEaSbcAdapter(runtime),
    fsu: createFsuAdapter(runtime),
    dom: createDomAdapter(documentObject),
    localStorage: createStorageAdapter(runtime?.localStorage),
    sessionStorage: createStorageAdapter(runtime?.sessionStorage),
  });
}
