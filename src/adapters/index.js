import { createDomAdapter } from './browser/dom.js';
import { createHttpAdapter } from './browser/http.js';
import { createNotificationAdapter } from './browser/notification.js';
import { createPageRuntimeAdapter } from './browser/page-runtime.js';
import { createStorageAdapter, createUserscriptStorageAdapter } from './browser/storage.js';
import { createUserEffectsAdapter } from './browser/user-effects.js';
import { createWaitAdapter } from './browser/wait.js';
import { createFsuAdapter } from './ea/fsu.js';
import { createEaInventoryAdapter } from './ea/inventory.js';
import { createEaLocalizationAdapter } from './ea/localization.js';
import { createEaPackAdapter } from './ea/pack.js';
import { createEaPlayerPickAdapter } from './ea/player-pick.js';
import { createEaSbcAdapter } from './ea/sbc.js';

export function createRuntimeAdapters(runtime, documentObject = runtime?.document || globalThis.document, options = {}) {
  const userscriptApi = options.userscriptApi || runtime?.__FCLoopRunnerUserscriptApi || {};
  const localStorage = createStorageAdapter(runtime?.localStorage);
  const sessionStorage = createStorageAdapter(runtime?.sessionStorage);
  const dom = createDomAdapter(documentObject, runtime);
  const page = createPageRuntimeAdapter(runtime, dom);
  const http = createHttpAdapter({
    gmRequest: options.gmRequest || userscriptApi.request,
    fetchImpl: options.fetchImpl || runtime?.fetch,
    runtimeFallback: runtime?.__FCLoopRunnerRequestText,
  });
  return Object.freeze({
    inventory: (options = {}) => createEaInventoryAdapter(runtime, options),
    localization: createEaLocalizationAdapter(runtime),
    pack: () => createEaPackAdapter(runtime),
    playerPick: () => createEaPlayerPickAdapter(runtime),
    sbc: () => createEaSbcAdapter(runtime),
    fsu: () => createFsuAdapter(runtime, { documentObject, localStorage, sessionStorage }),
    dom,
    page,
    userEffects: createUserEffectsAdapter(runtime, documentObject),
    wait: (waitOptions = {}) => createWaitAdapter({ ...waitOptions, pageRuntime: page }),
    http,
    notification: createNotificationAdapter({ gmNotification: options.gmNotification || userscriptApi.notify, http }),
    localStorage,
    sessionStorage,
    userscriptStorage: createUserscriptStorageAdapter({
      getValue: options.gmGetValue || userscriptApi.getValue,
      setValue: options.gmSetValue || userscriptApi.setValue,
      deleteValue: options.gmDeleteValue || userscriptApi.deleteValue,
    }),
  });
}
