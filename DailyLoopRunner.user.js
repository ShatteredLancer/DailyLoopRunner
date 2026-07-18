// ==UserScript==
// @name         FC26 Daily Loop Runner - Validation
// @namespace    local.fc26.validation
// @version      0.5.01
// @description  Configurable FC26 Web App loop runner for pack/SBC validation flows.
// @match        https://www.ea.com/ea-sports-fc/ultimate-team/web-app/*
// @match        https://www.easports.com/*/ea-sports-fc/ultimate-team/web-app/*
// @match        https://www.ea.com/*/ea-sports-fc/ultimate-team/web-app/*
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @connect      localhost
// @connect      www.fut.gg
// @connect      enhancer-api.futnext.com
// @run-at       document-end
// ==/UserScript==

(() => {
  // src/config/runtime.js
  var APP_KEY = "__FCLoopRunner";
  var LOOP_CONFIG_URL = "http://127.0.0.1:8765/DailyLoopRunner.loops.json";
  var PICK_OPTIONS_KEY = "fc-loop-runner-pick-options";
  var LOOP_UI_OPTIONS_KEY = "fc-loop-runner-ui-options";
  var CFG = Object.freeze({
    sourcePackIds: [105],
    sourcePackNames: [
      "\u9AD8\u7EA7\u9752\u94DC\u7403\u5458",
      "\u9AD8\u7D1A\u9752\u9285\u7403\u54E1",
      "Premium Bronze Players",
      "Bronze Players Premium",
      "BRONZE PLAYERS PREMIUM"
    ],
    bronzeUpgradeNames: [
      "\u9752\u94DC\u5347\u7EA7",
      "\u9752\u9285\u5347\u7D1A",
      "Bronze Upgrade"
    ],
    silverRewardNames: [
      "2\u540D\u767D\u94F6\u7403\u5458",
      "2 \u540D\u767D\u94F6\u7403\u5458",
      "2\u540D\u767D\u9280\u7403\u54E1",
      "2 Silver Players"
    ],
    maxRounds: 3,
    pauseMs: 1800,
    storageMax: 100
  });
  var FSU_COMPAT_DEFAULTS = Object.freeze({
    ignorePlayerPosition: true,
    onlyUntradeable: false,
    excludeDesignatedLeagues: true,
    excludedLeagueIds: [],
    useRarityPlayer: false,
    excludeEvolution: true,
    playerPickStrictCommonRare: true,
    priorityRareWithinGoldRange: true,
    priorityNonSpecialPlayers: true,
    priorityStoragePlayers: true,
    silverBronzePrioritizeNormal: true,
    goldRange: [75, 83],
    lockedItemIds: [],
    lockedDefinitionIds: [],
    detected: false,
    source: "compat-defaults"
  });

  // src/config/selection.js
  function selectionRequirements(loopDef = {}, priorityPiles = loopDef.priorityPiles) {
    return (loopDef.requirements || []).map((requirement) => ({
      ...requirement,
      blockTradeable: requirement.blockTradeable !== void 0 ? requirement.blockTradeable : loopDef.blockTradeable,
      protectedItemIds: [...new Set([
        ...loopDef.protectedItemIds || [],
        ...requirement.protectedItemIds || []
      ].map(Number).filter(Boolean))],
      protectedDefinitionIds: [...new Set([
        ...loopDef.protectedDefinitionIds || [],
        ...requirement.protectedDefinitionIds || []
      ].map(Number).filter(Boolean))],
      priorityPiles
    }));
  }

  // src/config/recovery.js
  var ALL_INVENTORY_PILES = Object.freeze(["unassigned", "storage", "transfer", "club"]);
  function lowFodderRequirement(input) {
    return Object.freeze({
      playerOnly: true,
      allowSpecial: false,
      priorityPiles: ALL_INVENTORY_PILES,
      ...input
    });
  }
  function recipe(input) {
    return Object.freeze({
      priorityPiles: ALL_INVENTORY_PILES,
      maxSubmissions: 1,
      mustConsumeTrigger: true,
      onUnavailable: "continue",
      onInsufficient: "continue",
      onBlocked: "stop",
      ...input
    });
  }
  var RECOVERY_RECIPES = Object.freeze([
    recipe({
      id: "daily-bronze-upgrade",
      name: "Daily Bronze Upgrade",
      sbcNames: ["Daily Bronze Upgrade", "\u6BCF\u65E5\u9752\u94DC\u5347\u7EA7", "\u6BCF\u65E5\u9752\u9285\u5347\u7D1A"],
      requirements: [lowFodderRequirement({ tier: "bronze", count: 1 })]
    }),
    recipe({
      id: "daily-silver-upgrade",
      name: "Daily Silver Upgrade",
      sbcNames: ["Daily Silver Upgrade", "\u6BCF\u65E5\u767D\u94F6\u5347\u7EA7", "\u6BCF\u65E5\u767D\u9280\u5347\u7D1A"],
      requirements: [lowFodderRequirement({ tier: "silver", count: 1 })]
    }),
    recipe({
      id: "daily-common-gold-upgrade",
      name: "Daily Common Gold Upgrade",
      sbcNames: ["Daily Common Gold Upgrade", "\u6BCF\u65E5\u666E\u901A\u91D1\u724C\u5347\u7EA7", "\u6BCF\u65E5\u666E\u901A\u91D1\u724C\u5347\u7D1A"],
      requirements: [
        lowFodderRequirement({ tier: "silver", count: 5 }),
        lowFodderRequirement({ tier: "bronze", count: 5 })
      ]
    }),
    recipe({
      id: "bronze-upgrade",
      name: "Bronze Upgrade",
      sbcNames: ["Bronze Upgrade", "\u9752\u94DC\u5347\u7EA7", "\u9752\u9285\u5347\u7D1A"],
      requirements: [lowFodderRequirement({ tier: "bronze", count: 11 })]
    }),
    recipe({
      id: "silver-upgrade",
      name: "Silver Upgrade",
      sbcNames: ["Silver Upgrade", "\u767D\u94F6\u5347\u7EA7", "\u767D\u9280\u5347\u7D1A"],
      requirements: [lowFodderRequirement({ tier: "silver", count: 11 })]
    }),
    recipe({
      id: "daily-rare-gold-upgrade",
      name: "Daily Rare Gold Upgrade",
      sbcNames: ["Daily Rare Gold Upgrade", "\u6BCF\u65E5\u7A00\u6709\u91D1\u724C\u5347\u7EA7", "\u6BCF\u65E5\u7A00\u6709\u91D1\u724C\u5347\u7D1A"],
      requirements: [lowFodderRequirement({ tier: "gold", rarity: "common", count: 5, maxRating: 81, protectHighGold: true })]
    }),
    recipe({
      id: "fof-glory-hunters-crafting-upgrade",
      name: "FOF Glory Hunters Crafting Upgrade",
      sbcNames: ["FOF Glory Hunters Crafting Upgrade"],
      requirements: [lowFodderRequirement({ tier: "gold", rarity: "common", count: 9, maxRating: 81, protectHighGold: true })]
    }),
    recipe({
      id: "gold-upgrade",
      name: "Gold Upgrade",
      sbcNames: ["Gold Upgrade", "\u9EC4\u91D1\u5347\u7EA7", "\u9EC3\u91D1\u5347\u7D1A"],
      requirements: [lowFodderRequirement({ tier: "gold", rarity: "common", count: 11, maxRating: 81, protectHighGold: true })]
    }),
    recipe({
      id: "2x84-upgrade",
      name: "2x 84+ Upgrade",
      sbcNames: ["2x 84+ Upgrade", "2 x 84+ Upgrade"],
      requirements: [lowFodderRequirement({ tier: "gold", rarity: "rare", count: 6, maxRating: 81, protectHighGold: true })]
    })
  ]);
  var UNASSIGNED_RECOVERY_POLICIES = Object.freeze([
    Object.freeze({
      id: "bronze-duplicate-overflow",
      match: Object.freeze({ tier: "bronze", playerOnly: true, allowSpecial: false }),
      steps: Object.freeze([
        Object.freeze({ recipeId: "daily-bronze-upgrade" }),
        Object.freeze({ recipeId: "daily-common-gold-upgrade" }),
        Object.freeze({ recipeId: "bronze-upgrade" })
      ])
    }),
    Object.freeze({
      id: "silver-duplicate-overflow",
      match: Object.freeze({ tier: "silver", playerOnly: true, allowSpecial: false }),
      steps: Object.freeze([
        Object.freeze({ recipeId: "daily-silver-upgrade" }),
        Object.freeze({ recipeId: "daily-common-gold-upgrade" }),
        Object.freeze({ recipeId: "silver-upgrade" })
      ])
    }),
    Object.freeze({
      id: "common-gold-duplicate-overflow",
      match: Object.freeze({ tier: "gold", rarity: "common", playerOnly: true, allowSpecial: false, maxRating: 81 }),
      steps: Object.freeze([
        Object.freeze({ recipeId: "daily-rare-gold-upgrade" }),
        Object.freeze({ recipeId: "fof-glory-hunters-crafting-upgrade" }),
        Object.freeze({ recipeId: "gold-upgrade" })
      ])
    }),
    Object.freeze({
      id: "rare-gold-duplicate-overflow",
      match: Object.freeze({ tier: "gold", rarity: "rare", playerOnly: true, allowSpecial: false, maxRating: 81 }),
      steps: Object.freeze([
        Object.freeze({ recipeId: "2x84-upgrade" })
      ])
    })
  ]);
  var DEFAULT_UNASSIGNED_RECOVERY_POLICY_IDS = Object.freeze([
    "bronze-duplicate-overflow",
    "silver-duplicate-overflow",
    "common-gold-duplicate-overflow",
    "rare-gold-duplicate-overflow"
  ]);

  // src/domain/objects.js
  function cloneLoopDef(definition) {
    return JSON.parse(JSON.stringify(definition));
  }
  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  // src/domain/rating.js
  function calculateEaSquadRating(ratings = [], requiredPlayerCount = ratings.length) {
    const count = Number(requiredPlayerCount || ratings.length || 0);
    const values = (ratings || []).map(Number).filter((rating) => Number.isFinite(rating) && rating > 0);
    if (!count || values.length !== count) return 0;
    let adjustedTotal = values.reduce((sum, rating) => sum + rating, 0);
    const average = adjustedTotal / count;
    values.forEach((rating) => {
      if (rating > average) adjustedTotal += rating - average;
    });
    return Math.floor(Math.round(adjustedTotal) / count);
  }

  // src/domain/contracts.js
  var INVENTORY_PILES = Object.freeze(["unassigned", "storage", "transfer", "club"]);
  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }
  function uniqueNumbers(values = []) {
    return [...new Set((values || []).map(Number).filter((value) => Number.isFinite(value) && value > 0))];
  }
  function cloneSerializable(value) {
    return value === void 0 ? void 0 : JSON.parse(JSON.stringify(value));
  }
  function createItemRef(item = {}, pile = item.pile || "unknown") {
    return Object.freeze({
      id: finiteNumber(item.id),
      definitionId: finiteNumber(item.definitionId),
      pile: String(pile || "unknown")
    });
  }
  function createItemSnapshot(item = {}, pile = item.pile || "unknown") {
    const rating = finiteNumber(item.rating);
    const rareflag = finiteNumber(item.rareflag ?? item.rareFlag);
    const groups = uniqueNumbers(item.groups);
    const tier = item.tier || (rating > 0 && rating <= 64 ? "bronze" : rating >= 65 && rating <= 74 ? "silver" : rating >= 75 ? "gold" : null);
    const special = item.special === true || rareflag > 1;
    const rare = item.rare === true || rareflag > 0;
    return Object.freeze({
      ref: createItemRef(item, pile),
      id: finiteNumber(item.id),
      definitionId: finiteNumber(item.definitionId),
      type: String(item.type || "unknown"),
      name: String(item.name || item.commonName || item.lastName || item.definitionId || item.id || "unknown"),
      rating,
      tier,
      rare,
      special,
      rareflag,
      duplicate: item.duplicate === true || finiteNumber(item.duplicateId) > 0,
      duplicateId: finiteNumber(item.duplicateId),
      tradeable: item.tradeable === true,
      leagueId: finiteNumber(item.leagueId),
      identityIds: uniqueNumbers([item.id, item.definitionId, ...item.identityIds || []]),
      evolution: item.evolution === true,
      limitedUse: item.limitedUse === true,
      concept: item.concept === true,
      academyEnrolled: item.academyEnrolled === true,
      activeTrade: item.activeTrade === true,
      endTime: item.endTime === void 0 || item.endTime === null ? -1 : finiteNumber(item.endTime, -1),
      groups,
      pile: String(pile || "unknown")
    });
  }
  function createInventorySnapshot(input = {}) {
    const piles = {};
    for (const pile of INVENTORY_PILES) {
      piles[pile] = Object.freeze((input.piles?.[pile] || []).map(
        (item) => item?.ref ? Object.freeze({ ...cloneSerializable(item), pile, ref: createItemRef(item.ref, pile) }) : createItemSnapshot(item, pile)
      ));
    }
    const capacities = {};
    for (const pile of INVENTORY_PILES) {
      const capacity = input.capacities?.[pile] || {};
      const used = finiteNumber(capacity.used, piles[pile].length);
      const max = Number.isFinite(Number(capacity.max)) ? Number(capacity.max) : null;
      capacities[pile] = Object.freeze({ used, max, free: max === null ? null : Math.max(0, max - used) });
    }
    return Object.freeze({
      version: 1,
      capturedAt: String(input.capturedAt || (/* @__PURE__ */ new Date()).toISOString()),
      piles: Object.freeze(piles),
      capacities: Object.freeze(capacities)
    });
  }
  function createSelectionPlan(input = {}) {
    return Object.freeze({
      ok: input.ok === true,
      mode: String(input.mode || "requirements"),
      entries: Object.freeze(cloneSerializable(input.entries || [])),
      selected: Object.freeze(cloneSerializable(input.selected || [])),
      missing: cloneSerializable(input.missing ?? null),
      pileCounts: Object.freeze({ ...input.pileCounts || {} }),
      duplicateSignals: Object.freeze(cloneSerializable(input.duplicateSignals || [])),
      diagnostics: Object.freeze(cloneSerializable(input.diagnostics || [])),
      details: Object.freeze(cloneSerializable(input.details || {}))
    });
  }
  function createSubmissionResult(input = {}) {
    return Object.freeze({
      status: String(input.status || "blocked"),
      submitted: input.submitted === true,
      challengeRef: cloneSerializable(input.challengeRef ?? null),
      consumedItemRefs: Object.freeze(cloneSerializable(input.consumedItemRefs || [])),
      rewardPackId: input.rewardPackId === void 0 || input.rewardPackId === null ? null : finiteNumber(input.rewardPackId),
      reason: input.reason ? String(input.reason) : null
    });
  }
  function createOpenPackReceipt(input = {}) {
    return Object.freeze({
      status: String(input.status || "blocked"),
      packRef: cloneSerializable(input.packRef ?? null),
      openedItems: Object.freeze(cloneSerializable(input.openedItems || [])),
      reservedItemRefs: Object.freeze(cloneSerializable(input.reservedItemRefs || [])),
      routedItemRefs: Object.freeze(cloneSerializable(input.routedItemRefs || [])),
      pendingItemRefs: Object.freeze(cloneSerializable(input.pendingItemRefs || [])),
      attempts: Math.max(0, finiteNumber(input.attempts)),
      reason: input.reason ? String(input.reason) : null,
      details: Object.freeze(cloneSerializable(input.details || {}))
    });
  }

  // src/adapters/ea/inventory.js
  function collectionValues(collection) {
    if (!collection) return [];
    if (typeof collection.values === "function") return Array.from(collection.values());
    if (Array.isArray(collection._collection)) return collection._collection;
    if (collection._collection && typeof collection._collection === "object") return Object.values(collection._collection);
    if (Array.isArray(collection)) return collection;
    return [];
  }
  function callBoolean(item, method, fallback = false) {
    try {
      if (typeof item?.[method] === "function") return item[method]() === true;
    } catch {
    }
    return fallback;
  }
  function itemGroups(item) {
    const groups = item?.groups || item?._groups || item?._staticData?.groups || item?._data?.groups;
    return Array.isArray(groups) ? groups : [];
  }
  function itemLeagueId(item) {
    const values = [item?.leagueId, item?.league, item?._leagueId, item?._data?.leagueId, item?._staticData?.leagueId];
    const value = values.map(Number).find((entry) => Number.isFinite(entry) && entry > 0);
    return value || 0;
  }
  var IDENTITY_FIELDS = [
    "id",
    "itemId",
    "instanceId",
    "resourceId",
    "cardId",
    "playerId",
    "guidAssetId",
    "definitionId",
    "defId",
    "assetId",
    "_assetId",
    "baseId",
    "baseResourceId"
  ];
  var IDENTITY_HOLDERS = [
    "_data",
    "data",
    "_staticData",
    "staticData",
    "assetData",
    "_assetData",
    "_item",
    "item",
    "_player",
    "player",
    "raw",
    "rawData",
    "_rawData"
  ];
  function identityIds(item) {
    const holders = [item, ...IDENTITY_HOLDERS.map((field) => item?.[field])].filter((holder) => holder && typeof holder === "object");
    const values = holders.flatMap((holder) => IDENTITY_FIELDS.flatMap((field) => {
      const value = holder?.[field];
      if (Array.isArray(value)) return value;
      if (typeof value === "string") return value.match(/\d+/g) || [];
      return [value];
    }));
    return [...new Set(values.map(Number).filter((value) => Number.isFinite(value) && value > 0))];
  }
  function isLimitedUse(item) {
    const loans = Number(item?.loans ?? item?._data?.loans);
    if (Number.isFinite(loans) && loans >= 0) return true;
    return callBoolean(item, "isLoan") || callBoolean(item, "isLimitedUse");
  }
  function isConcept(item) {
    return callBoolean(item, "isConcept") || callBoolean(item, "isConceptItem") || item?.concept === true;
  }
  function isActiveTrade(item) {
    try {
      const auction = item?.getAuctionData?.() || item?._auction;
      if (!auction) return false;
      if (typeof auction.isActiveTrade === "function" && auction.isActiveTrade()) return true;
      if (typeof auction.isClosedTrade === "function" && auction.isClosedTrade()) return true;
    } catch {
    }
    return false;
  }
  function isAcademyEnrolled(item) {
    return callBoolean(item, "isEnrolledInAcademy");
  }
  function toSnapshot(item, pile) {
    const rating = Number(item?.rating || 0);
    const rareflag = Number(item?.rareflag ?? item?.rareFlag ?? item?._rareflag ?? 0);
    const duplicateId = Number(item?.duplicateId || 0);
    const tradeable = typeof item?.isUntradeable === "function" ? !callBoolean(item, "isUntradeable", true) : item?.untradeable === false;
    return createItemSnapshot({
      id: item?.id,
      definitionId: item?.definitionId,
      type: item?.type || (callBoolean(item, "isPlayer") ? "player" : "unknown"),
      name: item?.name || item?.commonName || item?.lastName || item?._staticData?.name,
      rating,
      rareflag,
      rare: callBoolean(item, "isRare", rareflag > 0),
      special: callBoolean(item, "isSpecial", rareflag > 1),
      duplicate: callBoolean(item, "isDuplicate", duplicateId > 0),
      duplicateId,
      tradeable,
      leagueId: itemLeagueId(item),
      identityIds: identityIds(item),
      evolution: callBoolean(item, "isEvolution") || callBoolean(item, "isEvo") || Number(item?.evolutionId || 0) > 0,
      limitedUse: isLimitedUse(item),
      concept: isConcept(item),
      academyEnrolled: isAcademyEnrolled(item),
      activeTrade: isActiveTrade(item),
      endTime: item?.endTime,
      groups: itemGroups(item)
    }, pile);
  }
  function createEaInventoryAdapter(runtime, options = {}) {
    if (!runtime?.repositories?.Item) throw new Error("EA Item repository is unavailable");
    const repository = runtime.repositories.Item;
    function readPile(pile) {
      if (pile === "unassigned") {
        try {
          return Array.from(repository.getUnassignedItems?.() || []);
        } catch {
          return [];
        }
      }
      if (pile === "storage") {
        try {
          return Array.from(repository.getStorageItems?.() || []);
        } catch {
          return collectionValues(repository.storage);
        }
      }
      if (pile === "transfer") {
        try {
          return Array.from(repository.getTransferItems?.() || []);
        } catch {
          return collectionValues(repository.transfer);
        }
      }
      if (pile === "club") {
        return collectionValues(repository.club?.items).concat(collectionValues(runtime.services?.Item?.itemDao?.itemRepo?.club?.items));
      }
      return [];
    }
    function capacity(pile, rawItems) {
      const pileValue = runtime.ItemPile?.[pile.toUpperCase()] ?? pile;
      let max = null;
      let used = rawItems.length;
      try {
        const value = Number(repository.getPileSize?.(pileValue));
        if (Number.isFinite(value)) max = value;
      } catch {
      }
      if (max === null) {
        const fallback = Number(options.capacityFallbacks?.[pile]);
        if (Number.isFinite(fallback)) max = fallback;
      }
      try {
        const value = Number(repository.numItemsInCache?.(pileValue));
        if (Number.isFinite(value)) used = value;
      } catch {
      }
      return { max, used };
    }
    function snapshot() {
      const rawPiles = Object.fromEntries(INVENTORY_PILES.map((pile) => [pile, readPile(pile)]));
      return createInventorySnapshot({
        piles: Object.fromEntries(INVENTORY_PILES.map((pile) => [pile, rawPiles[pile].map((item) => toSnapshot(item, pile))])),
        capacities: Object.fromEntries(INVENTORY_PILES.map((pile) => [pile, capacity(pile, rawPiles[pile])]))
      });
    }
    function resolveItem(ref, preferredPiles = INVENTORY_PILES) {
      const id = Number(ref?.id || 0);
      const definitionId = Number(ref?.definitionId || 0);
      const piles = [...new Set([ref?.pile, ...preferredPiles || []].filter((pile) => INVENTORY_PILES.includes(pile)))];
      for (const pile of piles) {
        const items = readPile(pile);
        const byId = id ? items.find((item) => Number(item?.id || 0) === id) : null;
        if (byId) return { item: byId, pile };
        const byDefinition = !id && definitionId ? items.find((item) => Number(item?.definitionId || 0) === definitionId) : null;
        if (byDefinition) return { item: byDefinition, pile };
      }
      return null;
    }
    return Object.freeze({ snapshot, resolveItem, readPile, snapshotItem: toSnapshot });
  }

  // src/adapters/ea/pack.js
  function collectionValues2(collection) {
    if (!collection) return [];
    if (typeof collection.values === "function") return Array.from(collection.values());
    if (Array.isArray(collection._collection)) return collection._collection;
    if (collection._collection && typeof collection._collection === "object") return Object.values(collection._collection);
    if (Array.isArray(collection)) return collection;
    return [];
  }
  function packId(pack) {
    return Number(pack?.id ?? pack?.packId ?? pack?._id ?? 0);
  }
  function createEaPackAdapter(runtime) {
    function list() {
      const repository = runtime?.repositories?.Store?.myPacks || runtime?.services?.Store?.storeDao?.storeRepo?.myPacks;
      return collectionValues2(repository);
    }
    function resolve(ref = {}) {
      const id = Number(ref.id || 0);
      if (id) {
        const byId = list().find((pack) => packId(pack) === id);
        if (byId) return byId;
      }
      const name = String(ref.name || "").trim().toLowerCase();
      return name ? list().find((pack) => String(pack?.name || pack?._name || "").trim().toLowerCase() === name) || null : null;
    }
    function open(pack) {
      if (!pack || typeof pack.open !== "function") throw new Error("Pack model cannot be opened");
      return pack.open();
    }
    return Object.freeze({ list, resolve, open });
  }

  // src/adapters/ea/sbc.js
  function createEaSbcAdapter(runtime) {
    const service = runtime?.services?.SBC;
    if (!service) throw new Error("EA SBC service is unavailable");
    function saveChallenge(challenge) {
      if (typeof service.saveChallenge !== "function") throw new Error("EA saveChallenge is unavailable");
      return service.saveChallenge(challenge);
    }
    function loadChallengeData(challenge) {
      if (typeof service.loadChallengeData !== "function") return null;
      return service.loadChallengeData(challenge);
    }
    function submitChallenge(challenge, set, options = {}) {
      if (typeof service.submitChallenge !== "function") throw new Error("EA submitChallenge is unavailable");
      return service.submitChallenge(
        challenge,
        set,
        options.skipValidation === true,
        options.chemistryEnabled !== false
      );
    }
    return Object.freeze({ saveChallenge, loadChallengeData, submitChallenge });
  }

  // src/selection/inventory.js
  function numberSet(values = []) {
    return new Set((values || []).map(Number).filter((value) => Number.isFinite(value) && value > 0));
  }
  function preferredItemRefs(refs = []) {
    return (refs || []).map((ref) => ({
      id: Number(ref?.id || 0),
      definitionId: Number(ref?.definitionId || 0)
    }));
  }
  function isPreferredItem(item, preferredRefs) {
    const id = Number(item?.id || item?.ref?.id || 0);
    const definitionId = Number(item?.definitionId || item?.ref?.definitionId || 0);
    return preferredRefs.some((ref) => ref.id ? ref.id === id : ref.definitionId > 0 && ref.definitionId === definitionId);
  }
  function applyPilePriority(piles = [], fsuPolicy = {}) {
    if (!fsuPolicy.priorityStoragePlayers || !piles.includes("storage")) return [...piles];
    const pinned = piles[0] === "unassigned" ? ["unassigned"] : [];
    const rest = piles.filter((pile) => !pinned.includes(pile) && pile !== "storage");
    return [...pinned, "storage", ...rest];
  }
  function isNormalGold(item) {
    return item.tier === "gold" && !item.special;
  }
  function itemMatchesRequirement(item, requirement = {}) {
    if (requirement.playerOnly && item.type !== "player") return false;
    if (requirement.minRating !== void 0 && item.rating < Number(requirement.minRating)) return false;
    if (requirement.maxRating !== void 0 && item.rating > Number(requirement.maxRating)) return false;
    if (requirement.blockTradeable === true && item.tradeable && !isNormalGold(item)) return false;
    if (requirement.special === true && !item.special) return false;
    if (requirement.special === false && item.special) return false;
    if (requirement.special !== true && requirement.allowSpecial !== true && item.special) return false;
    if (requirement.tier && item.tier !== requirement.tier) return false;
    if (requirement.rarity === "rare" && !item.rare) return false;
    if (requirement.rarity === "common" && item.rare) return false;
    return true;
  }
  function rejectionReasons(item, requirement, fsuPolicy, protection) {
    const reasons = [];
    if (item.type !== "player") reasons.push("not-player");
    if (protection.consumedItemIds.has(item.id)) reasons.push("consumed-item");
    if (protection.protectedItemIds.has(item.id)) reasons.push("protected-item");
    if (protection.protectedDefinitionIds.has(item.definitionId)) reasons.push("protected-definition");
    if (requirement.protectHighGold && item.tier === "gold" && item.rating >= 82) reasons.push("protected-high-gold");
    if (item.limitedUse) reasons.push("limited-use");
    if (item.concept) reasons.push("concept");
    if (item.academyEnrolled) reasons.push("academy-enrolled");
    if (item.endTime !== -1) reasons.push("limited-end-time");
    if (item.activeTrade) reasons.push("active-trade");
    const lockedIds = new Set([...fsuPolicy.lockedItemIds || [], ...fsuPolicy.lockedDefinitionIds || []].map(Number));
    if ((item.identityIds || [item.id, item.definitionId]).some((id) => lockedIds.has(Number(id)))) reasons.push("fsu-locked-player");
    if (fsuPolicy.onlyUntradeable && item.tradeable) reasons.push("fsu-only-untradeable");
    if (fsuPolicy.excludeEvolution && item.evolution) reasons.push("fsu-exclude-evolution");
    if (fsuPolicy.excludeDesignatedLeagues && (fsuPolicy.excludedLeagueIds || []).includes(item.leagueId)) reasons.push(`fsu-excluded-league-${item.leagueId}`);
    if (isNormalGold(item)) {
      const [minRating = 75, maxRating = 83] = fsuPolicy.goldRange || [75, 83];
      if (item.rating < Number(minRating) || item.rating > Number(maxRating)) reasons.push(`fsu-gold-range-${minRating}-${maxRating}`);
    }
    if (fsuPolicy.useRarityPlayer === false && requirement.special !== true && requirement.allowSpecial !== true && item.special) reasons.push("fsu-rarity-player-off");
    if (!itemMatchesRequirement(item, requirement)) reasons.push("requirement-mismatch");
    return reasons;
  }
  function sortCandidates(items, requirement, fsuPolicy, preferredRefs = []) {
    return [...items].sort((a, b) => {
      const aPreferred = isPreferredItem(a, preferredRefs);
      const bPreferred = isPreferredItem(b, preferredRefs);
      if (aPreferred !== bPreferred) return Number(bPreferred) - Number(aPreferred);
      if (fsuPolicy.priorityNonSpecialPlayers && a.special !== b.special) return Number(a.special) - Number(b.special);
      const [minRating = 75, maxRating = 83] = fsuPolicy.goldRange || [75, 83];
      const aGoldRange = a.tier === "gold" && a.rating >= minRating && a.rating <= maxRating;
      const bGoldRange = b.tier === "gold" && b.rating >= minRating && b.rating <= maxRating;
      if (fsuPolicy.priorityRareWithinGoldRange && requirement.rarity === void 0 && aGoldRange && bGoldRange && a.rare !== b.rare) {
        return Number(b.rare) - Number(a.rare);
      }
      const aLowTier = a.tier === "bronze" || a.tier === "silver";
      const bLowTier = b.tier === "bronze" || b.tier === "silver";
      if (fsuPolicy.silverBronzePrioritizeNormal && aLowTier && bLowTier && a.rare !== b.rare) return Number(a.rare) - Number(b.rare);
      return a.rating - b.rating || Number(a.rare) - Number(b.rare) || a.id - b.id;
    });
  }
  function findSubmissionItem(signal, snapshot, usedIds, requirement, fsuPolicy, protection) {
    const candidates = [...snapshot.piles.storage, ...snapshot.piles.club].filter((item) => !usedIds.has(item.id) && rejectionReasons(item, requirement, fsuPolicy, protection).length === 0);
    if (signal.duplicateId) {
      const direct = candidates.find((item) => item.id === signal.duplicateId);
      if (direct) return direct;
    }
    return sortCandidates(candidates, requirement, fsuPolicy).find((item) => item.definitionId === signal.definitionId) || null;
  }
  function selectInventoryPlayers(input = {}) {
    const snapshot = input.inventorySnapshot;
    if (!snapshot?.piles) throw new Error("inventorySnapshot is required");
    const requirements = input.requirements || [];
    const defaultPiles = input.priorityPiles || ["storage", "transfer", "club"];
    const fsuPolicy = input.fsuPolicy || {};
    const protection = {
      consumedItemIds: numberSet(input.consumedItemIds),
      protectedItemIds: numberSet(input.protectedItemIds),
      protectedDefinitionIds: numberSet(input.protectedDefinitionIds)
    };
    const selectedIds = /* @__PURE__ */ new Set();
    const selectedDefinitionIds = /* @__PURE__ */ new Set();
    const submissionIds = /* @__PURE__ */ new Set();
    const selected = [];
    const entries = [];
    const pileCounts = {};
    const duplicateSignals = [];
    const diagnostics = [];
    const preferredSignalRefs = preferredItemRefs(input.preferredSignalRefs);
    for (const requirement of requirements) {
      let need = Number(requirement.count || 0);
      const requirementProtection = {
        consumedItemIds: protection.consumedItemIds,
        protectedItemIds: /* @__PURE__ */ new Set([...protection.protectedItemIds, ...numberSet(requirement.protectedItemIds)]),
        protectedDefinitionIds: /* @__PURE__ */ new Set([...protection.protectedDefinitionIds, ...numberSet(requirement.protectedDefinitionIds)])
      };
      const piles = applyPilePriority(requirement.priorityPiles || defaultPiles, fsuPolicy).filter((pile) => INVENTORY_PILES.includes(pile));
      for (const pileName of piles) {
        if (need <= 0) break;
        const preferredRefs = pileName === "unassigned" || pileName === "transfer" ? preferredSignalRefs : [];
        const candidates = sortCandidates(snapshot.piles[pileName] || [], requirement, fsuPolicy, preferredRefs);
        for (const candidate of candidates) {
          if (need <= 0) break;
          if (selectedIds.has(candidate.id) || selectedDefinitionIds.has(candidate.definitionId)) continue;
          const reasons = rejectionReasons(candidate, requirement, fsuPolicy, requirementProtection);
          if (reasons.length) {
            diagnostics.push({ pileName, itemRef: candidate.ref, reasons });
            continue;
          }
          let item = candidate;
          let signal = null;
          if (pileName === "unassigned" || pileName === "transfer") {
            if (!candidate.duplicate) continue;
            item = findSubmissionItem(candidate, snapshot, submissionIds, requirement, fsuPolicy, requirementProtection);
            if (!item || selectedDefinitionIds.has(item.definitionId)) continue;
            signal = candidate;
            duplicateSignals.push({ pileName, signalRef: signal.ref, itemRef: item.ref });
            selectedIds.add(signal.id);
          }
          if (submissionIds.has(item.id) || selectedIds.has(item.id) || selectedDefinitionIds.has(item.definitionId)) continue;
          selectedIds.add(item.id);
          selectedDefinitionIds.add(item.definitionId);
          submissionIds.add(item.id);
          selected.push(item);
          entries.push({ pileName, signalRef: signal?.ref || null, itemRef: item.ref });
          pileCounts[pileName] = (pileCounts[pileName] || 0) + 1;
          need--;
        }
      }
      if (need > 0) {
        return createSelectionPlan({
          ok: false,
          mode: input.mode || "requirements",
          entries,
          selected,
          missing: { ...requirement, count: need },
          pileCounts,
          duplicateSignals,
          diagnostics
        });
      }
    }
    return createSelectionPlan({
      ok: true,
      mode: input.mode || "requirements",
      entries,
      selected,
      missing: null,
      pileCounts,
      duplicateSignals,
      diagnostics
    });
  }

  // src/selection/rating.js
  function comparePileSelections(a, b, piles) {
    for (const pile of piles) {
      const aCount = Number(a?.pileCounts?.[pile] || 0);
      const bCount = Number(b?.pileCounts?.[pile] || 0);
      if (aCount !== bCount) return bCount - aCount;
    }
    const aIds = (a?.entries || []).map((entry) => Number(entry.item?.id || 0)).sort((x, y) => x - y);
    const bIds = (b?.entries || []).map((entry) => Number(entry.item?.id || 0)).sort((x, y) => x - y);
    for (let index = 0; index < Math.max(aIds.length, bIds.length); index++) {
      if ((aIds[index] || 0) !== (bIds[index] || 0)) return (aIds[index] || 0) - (bIds[index] || 0);
    }
    return 0;
  }
  function mergePileCounts(a = {}, b = {}) {
    const result = { ...a };
    Object.entries(b).forEach(([pile, count]) => {
      result[pile] = Number(result[pile] || 0) + Number(count || 0);
    });
    return result;
  }
  function ratingGroupSelectionOptions(entries, count, model, piles) {
    if (!count) return [{ entries: [], progress: model.constraints.map(() => 0), specialCount: 0, pileCounts: {} }];
    const signatureCounts = /* @__PURE__ */ new Map();
    const compactEntries = entries.filter((entry) => {
      const signature = `${entry.requirementMatches.map(Number).join("")}:${Number(entry.special)}:${entry.pileName}`;
      const seen = Number(signatureCounts.get(signature) || 0);
      if (seen >= count) return false;
      signatureCounts.set(signature, seen + 1);
      return true;
    });
    let states = /* @__PURE__ */ new Map();
    states.set(`0|0|${model.constraints.map(() => 0).join(".")}`, {
      entries: [],
      progress: model.constraints.map(() => 0),
      specialCount: 0,
      pileCounts: {}
    });
    for (const entry of compactEntries) {
      const next = new Map(states);
      for (const state of states.values()) {
        if (state.entries.length >= count) continue;
        const specialCount = state.specialCount + Number(entry.special);
        if (specialCount > model.maxSpecialCount) continue;
        const progress = state.progress.map((value, index) => Math.min(
          model.constraints[index].count,
          value + Number(entry.requirementMatches[index])
        ));
        const candidate = {
          entries: [...state.entries, entry],
          progress,
          specialCount,
          pileCounts: mergePileCounts(state.pileCounts, { [entry.pileName]: 1 })
        };
        const key = `${candidate.entries.length}|${specialCount}|${progress.join(".")}`;
        const existing = next.get(key);
        if (!existing || comparePileSelections(candidate, existing, piles) < 0) next.set(key, candidate);
      }
      states = next;
    }
    return [...states.values()].filter((state) => state.entries.length === count);
  }
  function buildMaterializationContext(entries, model, piles) {
    const entriesByRating = /* @__PURE__ */ new Map();
    for (const entry of entries) {
      const rating = Number(entry.item?.rating || 0);
      if (!rating) continue;
      const group = entriesByRating.get(rating) || [];
      group.push(entry);
      entriesByRating.set(rating, group);
    }
    for (const group of entriesByRating.values()) {
      group.sort((a, b) => a.pileRank - b.pileRank || Number(a.item?.id || 0) - Number(b.item?.id || 0));
    }
    return { entriesByRating, optionCache: /* @__PURE__ */ new Map(), model, piles };
  }
  function materializeRatingVector(context, descendingRatings) {
    const { entriesByRating, optionCache, model, piles } = context;
    const counts = /* @__PURE__ */ new Map();
    descendingRatings.forEach((rating) => counts.set(rating, (counts.get(rating) || 0) + 1));
    let combined = /* @__PURE__ */ new Map();
    combined.set(`0|${model.constraints.map(() => 0).join(".")}`, {
      entries: [],
      progress: model.constraints.map(() => 0),
      specialCount: 0,
      pileCounts: {}
    });
    for (const [rating, count] of [...counts.entries()].sort((a, b) => b[0] - a[0])) {
      const cacheKey = `${rating}:${count}`;
      let options = optionCache.get(cacheKey);
      if (!options) {
        options = ratingGroupSelectionOptions(entriesByRating.get(Number(rating)) || [], count, model, piles);
        optionCache.set(cacheKey, options);
      }
      if (!options.length) return null;
      const next = /* @__PURE__ */ new Map();
      for (const base of combined.values()) {
        for (const option of options) {
          const specialCount = base.specialCount + option.specialCount;
          if (specialCount > model.maxSpecialCount) continue;
          const progress = base.progress.map((value, index) => Math.min(
            model.constraints[index].count,
            value + option.progress[index]
          ));
          const candidate = {
            entries: [...base.entries, ...option.entries],
            progress,
            specialCount,
            pileCounts: mergePileCounts(base.pileCounts, option.pileCounts)
          };
          const key = `${specialCount}|${progress.join(".")}`;
          const existing = next.get(key);
          if (!existing || comparePileSelections(candidate, existing, piles) < 0) next.set(key, candidate);
        }
      }
      combined = next;
      if (!combined.size) return null;
    }
    return [...combined.values()].filter((state) => state.progress.every((value, index) => value >= model.constraints[index].count)).sort((a, b) => comparePileSelections(a, b, piles))[0] || null;
  }
  function planEntries(entries) {
    return entries.map((entry) => ({
      pileName: entry.pileName,
      pileRank: entry.pileRank,
      itemRef: entry.item.ref,
      signalRef: entry.signal?.ref || entry.signalRef || null,
      requirementMatches: entry.requirementMatches,
      special: entry.special === true
    }));
  }
  async function selectRatingPlayers(input = {}) {
    const candidateEntries = input.candidateEntries || [];
    const model = input.ratingModel;
    const piles = input.priorityPiles || [];
    const options = input.searchOptions || {};
    const requiredCount = Number(model?.requiredPlayerCount || 0);
    if (!model || requiredCount <= 0) throw new Error("ratingModel with requiredPlayerCount is required");
    if (candidateEntries.length < requiredCount) {
      const reason2 = `only ${candidateEntries.length}/${requiredCount} safe unique player definitions are available`;
      return createSelectionPlan({ ok: false, mode: "rating", missing: { count: requiredCount - candidateEntries.length, reason: reason2 }, details: { reason: reason2, nodes: 0 } });
    }
    for (let index = 0; index < model.constraints.length; index++) {
      const constraint = model.constraints[index];
      const available = candidateEntries.reduce((count, entry) => count + Number(entry.requirementMatches[index]), 0);
      if (available < Number(constraint.count || 0)) {
        const reason2 = `${constraint.label} has only ${available}/${constraint.count} safe candidate(s)`;
        return createSelectionPlan({ ok: false, mode: "rating", missing: { count: constraint.count - available, reason: reason2 }, details: { reason: reason2, nodes: 0 } });
      }
    }
    const ratingCounts = /* @__PURE__ */ new Map();
    candidateEntries.forEach((entry) => {
      const rating = Number(entry.item?.rating || 0);
      ratingCounts.set(rating, (ratingCounts.get(rating) || 0) + 1);
    });
    const levels = [...ratingCounts.keys()].filter(Boolean).sort((a, b) => a - b);
    const usedCounts = /* @__PURE__ */ new Map();
    const descendingRatings = [];
    const maxNodes = Math.max(1e4, Math.min(2e6, Number(options.maxSearchNodes || 5e5) || 5e5));
    const maxSearchMs = Math.max(1e3, Math.min(6e4, Number(options.maxSearchMs || 15e3) || 15e3));
    const yieldEveryNodes = Math.max(50, Math.min(5e3, Number(options.yieldEveryNodes || 500) || 500));
    const now = input.control?.now || Date.now;
    const yieldControl = input.control?.yieldControl || (() => Promise.resolve());
    const shouldStop = input.control?.shouldStop || (() => false);
    const deadline = now() + maxSearchMs;
    const materializationContext = buildMaterializationContext(candidateEntries, model, piles);
    let nodes = 0;
    let exhausted = false;
    let timedOut = false;
    function highestAvailableCompletion(remaining, maxRating) {
      const completion = [];
      for (let index = levels.length - 1; index >= 0 && completion.length < remaining; index--) {
        const rating = levels[index];
        if (rating > maxRating) continue;
        const available = Number(ratingCounts.get(rating) || 0) - Number(usedCounts.get(rating) || 0);
        for (let count = 0; count < available && completion.length < remaining; count++) completion.push(rating);
      }
      return completion;
    }
    function* search(maxLevelIndex) {
      nodes++;
      if (nodes > maxNodes) {
        exhausted = true;
        return;
      }
      if ((nodes & 255) === 0 && now() > deadline) {
        timedOut = true;
        return;
      }
      if (nodes % yieldEveryNodes === 0) yield { control: true };
      const remaining = requiredCount - descendingRatings.length;
      if (!remaining) {
        if (calculateEaSquadRating(descendingRatings, requiredCount) >= model.targetRating) yield { ratings: [...descendingRatings] };
        return;
      }
      const maxRating = levels[maxLevelIndex];
      const optimistic = highestAvailableCompletion(remaining, maxRating);
      if (optimistic.length < remaining) return;
      if (calculateEaSquadRating([...descendingRatings, ...optimistic], requiredCount) < model.targetRating) return;
      for (let levelIndex = 0; levelIndex <= maxLevelIndex; levelIndex++) {
        const rating = levels[levelIndex];
        const used = Number(usedCounts.get(rating) || 0);
        if (used >= Number(ratingCounts.get(rating) || 0)) continue;
        usedCounts.set(rating, used + 1);
        descendingRatings.push(rating);
        yield* search(levelIndex);
        descendingRatings.pop();
        if (used) usedCounts.set(rating, used);
        else usedCounts.delete(rating);
        if (exhausted || timedOut) return;
      }
    }
    for (let maxLevelIndex = 0; maxLevelIndex < levels.length; maxLevelIndex++) {
      const rating = levels[maxLevelIndex];
      usedCounts.set(rating, 1);
      descendingRatings.push(rating);
      for (const step of search(maxLevelIndex)) {
        if (step.control) {
          if (shouldStop()) throw new Error("rating selection stopped");
          await yieldControl();
          if (shouldStop()) throw new Error("rating selection stopped");
          continue;
        }
        const materialized = materializeRatingVector(materializationContext, step.ratings);
        if (!materialized) continue;
        const ratingValue = calculateEaSquadRating(step.ratings, requiredCount);
        descendingRatings.pop();
        usedCounts.delete(rating);
        const selected = materialized.entries.map((entry) => entry.item);
        const duplicateSignals = materialized.entries.filter((entry) => entry.signal?.ref || entry.signalRef).map((entry) => ({ pileName: entry.pileName, signalRef: entry.signal?.ref || entry.signalRef, itemRef: entry.item.ref }));
        return createSelectionPlan({
          ok: true,
          mode: "rating",
          entries: planEntries(materialized.entries),
          selected,
          missing: null,
          pileCounts: materialized.pileCounts,
          duplicateSignals,
          details: { rating: ratingValue, ratings: step.ratings, nodes }
        });
      }
      descendingRatings.pop();
      usedCounts.delete(rating);
      if (exhausted || timedOut) break;
      if (shouldStop()) throw new Error("rating selection stopped");
      await yieldControl();
      if (shouldStop()) throw new Error("rating selection stopped");
    }
    const reason = timedOut ? `rating search exceeded ${maxSearchMs}ms` : exhausted ? `rating search exceeded ${maxNodes} states` : `no safe ${requiredCount}-player combination reaches squad rating ${model.targetRating} and all challenge constraints`;
    return createSelectionPlan({ ok: false, mode: "rating", missing: { count: 0, reason }, details: { reason, nodes } });
  }

  // src/selection/index.js
  function selectInventoryPlayers2(input = {}) {
    if (input.mode === "rating") return selectRatingPlayers(input);
    return selectInventoryPlayers({ ...input, mode: input.mode || "requirements" });
  }

  // src/selection/transient-signals.js
  function refKey(ref = {}) {
    const id = Number(ref?.id || 0);
    if (id) return `id:${id}`;
    return `definition:${Number(ref?.definitionId || 0)}:${String(ref?.pile || "unassigned")}`;
  }
  function entrySignalRef(entry = {}) {
    return entry.signalRef || entry.signal?.ref || entry.signal || null;
  }
  function mergeTransientUnassignedSignals(snapshot, signals = []) {
    if (!signals.length) return snapshot;
    const existing = snapshot?.piles?.unassigned || [];
    const transientByKey = /* @__PURE__ */ new Map();
    for (const signal of signals) {
      const normalized = createItemSnapshot(signal, "unassigned");
      transientByKey.set(refKey(normalized.ref), normalized);
    }
    const mergedExisting = existing.map((item) => {
      const transient = transientByKey.get(refKey(item.ref || item));
      if (!transient) return item;
      transientByKey.delete(refKey(item.ref || item));
      return {
        ...item,
        ...transient,
        duplicate: item.duplicate === true || transient.duplicate === true,
        duplicateId: Number(transient.duplicateId || item.duplicateId || 0),
        ref: transient.ref,
        pile: "unassigned"
      };
    });
    const additions = [];
    for (const transient of transientByKey.values()) additions.push(transient);
    return createInventorySnapshot({
      capturedAt: snapshot?.capturedAt,
      piles: {
        ...snapshot?.piles || {},
        unassigned: [...mergedExisting, ...additions]
      },
      capacities: snapshot?.capacities || {}
    });
  }
  function selectionConsumesAllSignalRefs(selection, expectedRefs = []) {
    if (!expectedRefs.length) return true;
    const consumed = new Set((selection?.entries || []).filter((entry) => entry.pileName === "unassigned" && entrySignalRef(entry)).map((entry) => refKey(entrySignalRef(entry))));
    return expectedRefs.every((ref) => consumed.has(refKey(ref)));
  }

  // src/sbc/submit-attempt.js
  async function runValidators(validators, context, phase) {
    for (const validator of validators || []) {
      const result = await validator(context);
      if (result === false) throw new Error(`${phase} validator rejected the SBC attempt`);
      if (result?.ok === false) throw new Error(result.reason || `${phase} validator rejected the SBC attempt`);
    }
  }
  async function submitSbcAttempt(options = {}) {
    const challengeContext = await options.challengeProvider?.();
    if (!challengeContext?.challenge || !challengeContext?.set) {
      return createSubmissionResult({
        status: "unavailable",
        submitted: false,
        reason: challengeContext?.reason || "no available SBC challenge"
      });
    }
    const context = {
      ...challengeContext,
      label: options.label || challengeContext.set?.name || "SBC",
      dryRun: options.dryRun === true
    };
    const squadPlan = await options.squadProvider?.(context);
    if (!squadPlan?.ok) {
      return createSubmissionResult({
        status: "blocked",
        submitted: false,
        challengeRef: context.challengeRef || { id: context.challenge?.id || null },
        reason: squadPlan?.reason || "squad provider did not produce a valid plan"
      });
    }
    context.squadPlan = squadPlan;
    context.players = squadPlan.players || [];
    await runValidators(options.preSaveValidators, context, "pre-save");
    if (context.dryRun) {
      return createSubmissionResult({
        status: "planned",
        submitted: false,
        challengeRef: context.challengeRef || { id: context.challenge?.id || null },
        consumedItemRefs: squadPlan.itemRefs || []
      });
    }
    await options.saveSquad?.(context);
    if (options.reloadSquad) await options.reloadSquad(context);
    if (options.readSavedPlayers) context.savedPlayers = await options.readSavedPlayers(context);
    await runValidators(options.postSaveValidators, context, "post-save");
    if (options.prepareOnly === true) {
      return createSubmissionResult({
        status: "prepared",
        submitted: false,
        challengeRef: context.challengeRef || { id: context.challenge?.id || null },
        consumedItemRefs: squadPlan.itemRefs || []
      });
    }
    const submitReady = options.isSubmitReady ? await options.isSubmitReady(context) : true;
    if (!submitReady) {
      return createSubmissionResult({
        status: "blocked",
        submitted: false,
        challengeRef: context.challengeRef || { id: context.challenge?.id || null },
        consumedItemRefs: squadPlan.itemRefs || [],
        reason: "saved squad is not submit ready"
      });
    }
    const transportResult = await options.submitTransport?.(context);
    if (transportResult?.submitted === false || transportResult?.ok === false) {
      return createSubmissionResult({
        status: "blocked",
        submitted: false,
        challengeRef: context.challengeRef || { id: context.challenge?.id || null },
        consumedItemRefs: squadPlan.itemRefs || [],
        reason: transportResult?.reason || "SBC submit transport failed"
      });
    }
    const result = createSubmissionResult({
      status: "submitted",
      submitted: true,
      challengeRef: context.challengeRef || { id: context.challenge?.id || null },
      consumedItemRefs: squadPlan.itemRefs || [],
      rewardPackId: transportResult?.rewardPackId
    });
    if (options.afterSubmit) await options.afterSubmit({ ...context, result, transportResult });
    return result;
  }
  function createInventorySquadProvider({ prepareSelection, selection, itemRef: itemRef2 }) {
    return async (context) => {
      const prepared = await prepareSelection(context, selection);
      if (!prepared?.ok) return { ok: false, reason: prepared?.missing ? `missing ${prepared.missing.count} player(s)` : "inventory preparation failed" };
      return {
        ok: true,
        players: prepared.selected || [],
        itemRefs: (prepared.selected || []).map(itemRef2),
        selection: prepared
      };
    };
  }
  function createExistingSquadProvider({ getPlayers, itemRef: itemRef2, source = "existing-squad" }) {
    return async (context) => {
      const players = await getPlayers(context);
      if (!Array.isArray(players) || !players.length) {
        return { ok: false, reason: `${source} did not expose any players` };
      }
      return {
        ok: true,
        players,
        itemRefs: players.map(itemRef2),
        source
      };
    };
  }
  function createFsuFillProvider({ fill, getPlayers, itemRef: itemRef2 }) {
    return async (context) => {
      const fillResult = await fill(context);
      const players = await getPlayers({ ...context, fillResult });
      if (!Array.isArray(players) || !players.length) {
        return { ok: false, reason: "FSU fill did not expose any players", fillResult };
      }
      return {
        ok: true,
        players,
        itemRefs: players.map(itemRef2),
        fillResult,
        source: "fsu-fill"
      };
    };
  }

  // src/sbc/reward-claim.js
  function finiteNumber2(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  function hasPackCountIncrease(before = /* @__PURE__ */ new Map(), after = /* @__PURE__ */ new Map()) {
    for (const [id, count] of after.entries()) {
      if (Number(count || 0) > Number(before.get(id) || 0)) return true;
    }
    return false;
  }
  function hasSbcProgressAdvanced(before = {}, after = {}) {
    if (after.setComplete === true && before.setComplete !== true) return true;
    const beforeSetCount = finiteNumber2(before.setTimesCompleted);
    const afterSetCount = finiteNumber2(after.setTimesCompleted);
    if (beforeSetCount !== null && afterSetCount !== null && afterSetCount > beforeSetCount) return true;
    const beforeChallenges = new Map((before.challenges || []).map((challenge) => [Number(challenge.id || 0), challenge]));
    return (after.challenges || []).some((challenge) => {
      const previous = beforeChallenges.get(Number(challenge.id || 0));
      if (!previous) return challenge.completed === true;
      if (challenge.completed === true && previous.completed !== true) return true;
      const beforeCount = finiteNumber2(previous.timesCompleted);
      const afterCount = finiteNumber2(challenge.timesCompleted);
      return beforeCount !== null && afterCount !== null && afterCount > beforeCount;
    });
  }

  // src/unassigned/plan.js
  function itemRef(item) {
    return item?.ref || { id: Number(item?.id || 0), definitionId: Number(item?.definitionId || 0), pile: "unassigned" };
  }
  function findClubDuplicate(item, clubItems) {
    if (item.duplicateId) {
      const direct = clubItems.find((candidate) => candidate.id === item.duplicateId);
      if (direct) return direct;
    }
    return clubItems.find((candidate) => candidate.definitionId === item.definitionId && candidate.id !== item.id) || null;
  }
  function action(type, destination, items, description) {
    return {
      status: "action",
      action: {
        type,
        destination,
        itemRefs: items.map(itemRef),
        description
      }
    };
  }
  function blocked(destination, items, free, description) {
    return {
      status: "blocked",
      blocked: {
        destination,
        required: items.length,
        free,
        itemRefs: items.map(itemRef),
        description
      }
    };
  }
  function planUnassignedActions(snapshot, options = {}) {
    const unassigned = snapshot?.piles?.unassigned || [];
    const club = snapshot?.piles?.club || [];
    const reserveItem = options.reserveItem || (() => false);
    const reserved = unassigned.filter(reserveItem);
    const items = unassigned.filter((item) => !reserveItem(item));
    if (!items.length) {
      return {
        status: reserved.length ? "preserved" : "empty",
        reservedItemRefs: reserved.map(itemRef)
      };
    }
    const nonDuplicates = items.filter((item) => !item.duplicate);
    if (nonDuplicates.length) return action("move", "club", nonDuplicates, "non-duplicate");
    const tradeableDuplicates = items.filter((item) => item.duplicate && item.tradeable);
    if (tradeableDuplicates.length) {
      const free = snapshot.capacities?.transfer?.free ?? null;
      if (free !== null && tradeableDuplicates.length > free) {
        return blocked("transfer", tradeableDuplicates, free, "tradeable duplicate");
      }
      return action("move", "transfer", tradeableDuplicates, "tradeable duplicate");
    }
    const untradeableDuplicates = items.filter((item) => item.duplicate && !item.tradeable);
    const swappable = untradeableDuplicates.filter((item) => findClubDuplicate(item, club)?.tradeable === true);
    if (swappable.length) {
      const free = snapshot.capacities?.transfer?.free ?? null;
      if (free !== null && swappable.length > free) {
        return blocked("transfer", swappable, free, "swappable duplicate");
      }
      return action("swap", "club", swappable, "swappable duplicate");
    }
    if (untradeableDuplicates.length) {
      const free = snapshot.capacities?.storage?.free ?? null;
      if (free !== null && untradeableDuplicates.length > free) {
        return blocked("storage", untradeableDuplicates, free, "untradeable duplicate");
      }
      return action("move", "storage", untradeableDuplicates, "untradeable duplicate");
    }
    return {
      status: "unclassified",
      itemRefs: items.map(itemRef),
      reservedItemRefs: reserved.map(itemRef)
    };
  }
  function unassignedFingerprint(snapshot) {
    return (snapshot?.piles?.unassigned || []).map((item) => [item.id, item.definitionId, Number(item.duplicate), item.duplicateId, Number(item.tradeable)].join(":")).sort().join("|");
  }

  // src/unassigned/resolve.js
  async function resolveUnassigned(options = {}) {
    if (typeof options.getSnapshot !== "function") throw new Error("getSnapshot is required");
    if (typeof options.executeAction !== "function") throw new Error("executeAction is required");
    const maxIterations = Math.max(1, Math.min(100, Number(options.maxIterations || 20) || 20));
    const overflowResolvers = options.overflowResolvers || [];
    const activeResolvers = options.activeResolvers || /* @__PURE__ */ new Set();
    let previousFingerprint = null;
    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      const snapshot = await options.getSnapshot();
      const fingerprint = unassignedFingerprint(snapshot);
      const plan = planUnassignedActions(snapshot, { reserveItem: options.reserveItem });
      if (plan.status === "empty" || plan.status === "preserved") {
        return {
          status: plan.status === "empty" ? "resolved" : "preserved",
          iterations: iteration,
          plan,
          snapshot
        };
      }
      if (plan.status === "action") {
        await options.executeAction(plan.action, { plan, snapshot, iteration });
        const after = await options.getSnapshot();
        const afterFingerprint = unassignedFingerprint(after);
        if (afterFingerprint === fingerprint) {
          return { status: "blocked", reason: `Unassigned action made no progress: ${plan.action.description}`, iterations: iteration, plan, snapshot: after };
        }
        previousFingerprint = afterFingerprint;
        continue;
      }
      if (plan.status === "blocked") {
        let progressed = false;
        const resolverResults = [];
        for (let index = 0; index < overflowResolvers.length; index++) {
          const resolver = overflowResolvers[index];
          const resolverId = String(resolver.id || `resolver-${index}`);
          if (activeResolvers.has(resolverId)) {
            resolverResults.push({ id: resolverId, status: "blocked", reason: "recursive resolver invocation" });
            continue;
          }
          activeResolvers.add(resolverId);
          let result;
          try {
            result = await resolver.resolve({ plan, snapshot, iteration, resolverId });
          } finally {
            activeResolvers.delete(resolverId);
          }
          result = result || { status: "unavailable" };
          resolverResults.push({ id: resolverId, ...result });
          if (result.status === "blocked" && result.terminal === true) {
            return {
              status: "blocked",
              reason: result.reason || `${resolverId} blocked Unassigned recovery`,
              iterations: iteration,
              plan,
              snapshot,
              resolverResults
            };
          }
          if (result.status !== "progress") continue;
          const after = await options.getSnapshot();
          const afterFingerprint = unassignedFingerprint(after);
          if (afterFingerprint === fingerprint) {
            resolverResults.push({ id: resolverId, status: "blocked", reason: "resolver reported progress without changing Unassigned" });
            continue;
          }
          progressed = true;
          previousFingerprint = afterFingerprint;
          break;
        }
        if (progressed) continue;
        return {
          status: options.blockedPolicy === "preserve" ? "preserved" : "blocked",
          reason: `${plan.blocked.destination} capacity ${plan.blocked.free}/${plan.blocked.required}`,
          iterations: iteration,
          plan,
          snapshot,
          resolverResults
        };
      }
      return {
        status: "blocked",
        reason: `Unassigned planner returned ${plan.status}`,
        iterations: iteration,
        plan,
        snapshot
      };
    }
    return {
      status: "blocked",
      reason: `Unassigned resolver exceeded ${maxIterations} iterations`,
      fingerprint: previousFingerprint
    };
  }

  // src/unassigned/recovery.js
  function refMatches(ref, expectedRefs = []) {
    const id = Number(ref?.id || 0);
    const definitionId = Number(ref?.definitionId || 0);
    return expectedRefs.some((expected) => {
      const expectedId = Number(expected?.id || 0);
      if (expectedId) return expectedId === id;
      return Number(expected?.definitionId || 0) > 0 && Number(expected.definitionId) === definitionId;
    });
  }
  function itemMatchesRecoverySpec(item, spec = {}) {
    if (spec.playerOnly && item?.type !== "player") return false;
    if (spec.tier && item?.tier !== spec.tier) return false;
    if (spec.rarity === "rare" && item?.rare !== true) return false;
    if (spec.rarity === "common" && item?.rare === true) return false;
    if (spec.special === true && item?.special !== true) return false;
    if (spec.special === false && item?.special === true) return false;
    if (spec.special !== true && spec.allowSpecial !== true && item?.special === true) return false;
    if (spec.minRating !== void 0 && Number(item?.rating || 0) < Number(spec.minRating)) return false;
    if (spec.maxRating !== void 0 && Number(item?.rating || 0) > Number(spec.maxRating)) return false;
    return true;
  }
  function matchingBlockedItemRefs(plan, snapshot, policy) {
    const blockedRefs = plan?.blocked?.itemRefs || [];
    const unassigned = snapshot?.piles?.unassigned || [];
    return unassigned.filter((item) => refMatches(item.ref, blockedRefs) && itemMatchesRecoverySpec(item, policy?.match || {})).map((item) => item.ref);
  }
  function selectionConsumesSignalRefs(selection, expectedRefs = []) {
    return (selection?.entries || []).some(
      (entry) => entry.pileName === "unassigned" && entry.signal && refMatches(entry.signal.ref || entry.signal, expectedRefs)
    );
  }
  function actionFor(recipe2, status) {
    if (status === "insufficient") return recipe2.onInsufficient || "continue";
    return recipe2.onUnavailable || "continue";
  }
  function createRecoveryOverflowResolvers(options = {}) {
    const recipes = new Map((options.recipes || []).map((recipe2) => [recipe2.id, recipe2]));
    const policies = new Map((options.policies || []).map((policy) => [policy.id, policy]));
    const policyIds = options.policyIds || [];
    const attemptRecipe = options.attemptRecipe;
    if (typeof attemptRecipe !== "function") throw new Error("attemptRecipe is required");
    return policyIds.map((policyId) => {
      const policy = policies.get(policyId);
      if (!policy) throw new Error(`Unassigned recovery policy not found: ${policyId}`);
      return {
        id: `unassigned-recovery:${policy.id}`,
        async resolve(context) {
          const triggerRefs = matchingBlockedItemRefs(context.plan, context.snapshot, policy);
          if (!triggerRefs.length) return { status: "unavailable", reason: "blocked items do not match policy" };
          const attempts = [];
          for (const step of policy.steps || []) {
            const recipe2 = recipes.get(step.recipeId);
            if (!recipe2) {
              return { status: "blocked", terminal: true, reason: `Recovery recipe not found: ${step.recipeId}` };
            }
            const result = await attemptRecipe({
              context,
              policy,
              recipe: recipe2,
              step,
              triggerRefs
            }) || { status: "unavailable" };
            attempts.push({ recipeId: recipe2.id, ...result });
            if (result.status === "progress") return { ...result, attempts };
            if (result.status === "blocked") {
              return {
                status: "blocked",
                terminal: true,
                reason: result.reason || `${recipe2.name || recipe2.id} recovery blocked`,
                attempts
              };
            }
            if (actionFor({ ...recipe2, ...step }, result.status) === "stop") {
              return {
                status: "blocked",
                terminal: true,
                reason: result.reason || `${recipe2.name || recipe2.id} recovery stopped`,
                attempts
              };
            }
          }
          return {
            status: "unavailable",
            reason: `No recovery recipe could consume ${triggerRefs.length} blocked item(s)`,
            attempts
          };
        }
      };
    });
  }

  // src/pack/open-transaction.js
  async function openPackTransaction(options = {}) {
    const attempts = Math.max(1, Math.min(10, Number(options.retryPolicy?.attempts || 1) || 1));
    const retryCodes = new Set((options.retryPolicy?.retryCodes || []).map(String));
    let lastReason = null;
    if (options.preOpenResolver) {
      const preOpen = await options.preOpenResolver();
      if (preOpen?.status === "blocked") {
        return createOpenPackReceipt({ status: "blocked", reason: preOpen.reason || "pre-open resolver blocked", attempts: 0 });
      }
    }
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const pack = await options.packSelector?.({ attempt, lastReason });
      if (!pack) {
        return createOpenPackReceipt({
          status: attempt === 1 ? "unavailable" : "stale",
          reason: "matching pack is unavailable",
          attempts: attempt - 1
        });
      }
      const packRef = options.packRef ? options.packRef(pack) : { id: Number(pack.id || 0), name: String(pack.name || "") };
      const result = await options.openTransport(pack, { attempt, packRef });
      if (result?.success && Array.isArray(result?.items || result?.response?.items)) {
        const rawItems = result.items || result.response.items || [];
        const normalized = options.normalizeItems ? await options.normalizeItems(rawItems, { pack, packRef, attempt, result }) : rawItems;
        const openedItems = Array.isArray(normalized) ? normalized : normalized?.items || rawItems;
        const receiptItems = Array.isArray(normalized) ? normalized : normalized?.receiptItems || openedItems;
        const policyResult = options.openedItemPolicy ? await options.openedItemPolicy(openedItems, { pack, packRef, attempt, result }) : { pendingItemRefs: openedItems };
        return createOpenPackReceipt({
          status: "opened",
          packRef,
          openedItems: receiptItems,
          reservedItemRefs: policyResult?.reservedItemRefs || [],
          routedItemRefs: policyResult?.routedItemRefs || [],
          pendingItemRefs: policyResult?.pendingItemRefs || [],
          attempts: attempt,
          details: policyResult?.details || {}
        });
      }
      const code = String(result?.error?.code || result?.status || "unknown");
      lastReason = code;
      if (options.allowGone === true && code === "404") {
        if (options.onGone) await options.onGone(pack, { attempt, packRef, result });
        return createOpenPackReceipt({ status: "stale", packRef, reason: "404", attempts: attempt });
      }
      if (!retryCodes.has(code) || attempt >= attempts) {
        return createOpenPackReceipt({ status: "blocked", packRef, reason: code, attempts: attempt });
      }
      if (options.beforeRetry) await options.beforeRetry({ attempt, code, pack, packRef, result });
    }
    return createOpenPackReceipt({ status: "blocked", reason: lastReason || "open failed", attempts });
  }

  // src/pack/opened-item-policy.js
  function itemRefKey(ref) {
    const id = Number(ref?.id || 0);
    if (id) return `id:${id}`;
    return `definition:${Number(ref?.definitionId || 0)}:${String(ref?.pile || "unknown")}`;
  }
  function uniqueRefs(items = [], defaultPile = "unassigned") {
    const refs = [];
    const seen = /* @__PURE__ */ new Set();
    for (const item of items || []) {
      const ref = item?.ref ? createItemRef(item.ref, item.ref.pile || item.pile || defaultPile) : createItemRef(item, item?.pile || defaultPile);
      const key = itemRefKey(ref);
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push(ref);
    }
    return refs;
  }
  function explicitRefs(result, itemKey, refKey2, defaultPile) {
    if (Array.isArray(result?.[refKey2])) return uniqueRefs(result[refKey2], defaultPile);
    return uniqueRefs(result?.[itemKey] || [], defaultPile);
  }
  function createOpenedItemPolicy(handler, options = {}) {
    if (typeof handler !== "function") throw new TypeError("opened item policy handler is required");
    const defaultPile = String(options.defaultPile || "unassigned");
    return async (openedItems, context = {}) => {
      const result = await handler(openedItems || [], context) || {};
      const reservedItemRefs = explicitRefs(result, "reservedItems", "reservedItemRefs", defaultPile);
      const routedItemRefs = explicitRefs(result, "routedItems", "routedItemRefs", defaultPile);
      const covered = new Set([...reservedItemRefs, ...routedItemRefs].map(itemRefKey));
      const pendingItemRefs = Array.isArray(result.pendingItemRefs) || Array.isArray(result.pendingItems) ? explicitRefs(result, "pendingItems", "pendingItemRefs", defaultPile) : uniqueRefs(openedItems, defaultPile).filter((ref) => !covered.has(itemRefKey(ref)));
      return {
        reservedItemRefs,
        routedItemRefs,
        pendingItemRefs,
        details: result.details || {}
      };
    };
  }

  // src/pack/upgrade-duplicate-routing.js
  function classifyOpenedUpgradeDuplicates(items = [], options = {}) {
    const isDuplicate = options.isDuplicate || (() => false);
    const isEligibleDuplicate = options.isEligibleDuplicate || (() => false);
    const isTradeable = options.isTradeable || (() => false);
    const directClub = [];
    const reservedDuplicates = [];
    const tradeableDuplicates = [];
    const untradeableDuplicates = [];
    for (const item of items || []) {
      if (!isDuplicate(item)) {
        directClub.push(item);
        continue;
      }
      if (isEligibleDuplicate(item)) {
        reservedDuplicates.push(item);
        continue;
      }
      if (isTradeable(item)) tradeableDuplicates.push(item);
      else untradeableDuplicates.push(item);
    }
    return Object.freeze({
      directClub: Object.freeze(directClub),
      reservedDuplicates: Object.freeze(reservedDuplicates),
      tradeableDuplicates: Object.freeze(tradeableDuplicates),
      untradeableDuplicates: Object.freeze(untradeableDuplicates)
    });
  }

  // src/workflows/supply-and-craft.js
  function positiveInteger(value, fallback = 1, max = 1e3) {
    const number = Number(value);
    return Math.max(1, Math.min(max, Number.isFinite(number) ? Math.floor(number) : fallback));
  }
  async function emit(options, event, payload = {}) {
    await options.onEvent?.(event, payload);
  }
  async function runSupplyAndCraftWorkflow(options = {}) {
    if (typeof options.challengeProvider !== "function") throw new TypeError("challengeProvider is required");
    if (typeof options.selectPrimary !== "function") throw new TypeError("selectPrimary is required");
    if (typeof options.submit !== "function") throw new TypeError("submit is required");
    const maxCompletions = positiveInteger(options.maxCompletions, 1);
    const result = {
      status: "completed",
      completions: 0,
      iterations: 0,
      supplyRuns: [],
      reason: null,
      lastSelection: null
    };
    while (result.completions < maxCompletions) {
      await options.stopPoint?.();
      result.iterations++;
      const iteration = result.iterations;
      const before = await options.beforeIteration?.({ iteration, result }) || {};
      let preserveSupply = before.preserveSupply === true;
      let challengeContext = await options.challengeProvider({ iteration, result, refresh: false });
      if (!challengeContext?.challenge || !challengeContext?.set) {
        result.status = "unavailable";
        result.reason = challengeContext?.reason || "no available SBC challenge";
        await emit(options, "challenge-unavailable", { iteration, result });
        break;
      }
      await options.refreshInventory?.({ iteration, result, challengeContext });
      let selection = await options.selectPrimary({ iteration, result, challengeContext });
      result.lastSelection = selection;
      await emit(options, "selection", { phase: "primary", iteration, selection, preserveSupply });
      let supplied = false;
      if (!selection?.ok && !preserveSupply) {
        for (const supply of options.supplies || []) {
          const maxRuns = supply.repeatUntilSatisfied === true ? positiveInteger(supply.maxRuns, 100, 1e3) : 1;
          for (let run = 1; run <= maxRuns && !selection?.ok && !preserveSupply; run++) {
            await options.stopPoint?.();
            const supplyResult = await supply.provide({
              iteration,
              result,
              challengeContext,
              selection,
              supply,
              run
            }) || { status: "unavailable" };
            const record = { id: String(supply.id || "supply"), run, ...supplyResult };
            result.supplyRuns.push(record);
            await emit(options, "supply", { iteration, supply, supplyResult: record, selection });
            if (supplyResult.status === "planned") {
              result.status = "planned";
              result.reason = supplyResult.reason || `supply ${record.id} would be opened`;
              break;
            }
            if (supplyResult.status === "blocked") {
              result.status = "blocked";
              result.reason = supplyResult.reason || `supply ${record.id} is blocked`;
              break;
            }
            if (supplyResult.status === "preserved") {
              preserveSupply = true;
              break;
            }
            if (supplyResult.status !== "provided") break;
            supplied = true;
            await options.refreshInventory?.({ iteration, result, challengeContext, supply, supplyResult });
            selection = await options.selectPrimary({ iteration, result, challengeContext, supply, supplyResult });
            result.lastSelection = selection;
            await emit(options, "selection", { phase: "after-supply", iteration, selection, supply, preserveSupply });
            preserveSupply = supplyResult.preserveSupply === true;
          }
          if (result.status === "planned" || result.status === "blocked" || selection?.ok || preserveSupply) break;
        }
      } else if (!selection?.ok && preserveSupply) {
        await emit(options, "supply-skipped", { iteration, selection, reason: "preserved-unassigned" });
      }
      if (result.status === "planned" || result.status === "blocked") break;
      if (!selection?.ok && typeof options.selectFallback === "function") {
        selection = await options.selectFallback({ iteration, result, challengeContext, preserveSupply });
        result.lastSelection = selection;
        await emit(options, "selection", { phase: "fallback", iteration, selection, preserveSupply });
      }
      if (!selection?.ok) {
        result.status = "insufficient";
        result.reason = selection?.missing ? `missing ${Number(selection.missing.count || 0)} player(s)` : "inventory selection is incomplete";
        await emit(options, "selection-insufficient", { iteration, selection, preserveSupply });
        break;
      }
      if (supplied && typeof options.challengeProvider === "function") {
        challengeContext = await options.challengeProvider({ iteration, result, refresh: true, previous: challengeContext });
        if (!challengeContext?.challenge || !challengeContext?.set) {
          result.status = "unavailable";
          result.reason = challengeContext?.reason || "no available SBC challenge after supply";
          await emit(options, "challenge-unavailable", { iteration, result, afterSupply: true });
          break;
        }
      }
      const submission = await options.submit({ iteration, result, challengeContext, selection });
      await emit(options, "submission", { iteration, submission, selection });
      if (submission?.submitted === true || submission?.status === "submitted") {
        result.completions++;
        await options.afterSubmission?.({ iteration, result, challengeContext, selection, submission });
        continue;
      }
      if (submission?.status === "planned") {
        result.status = "planned";
        result.reason = submission.reason || "submission planned";
        break;
      }
      result.status = submission?.status === "unavailable" ? "unavailable" : "blocked";
      result.reason = submission?.reason || "SBC submission did not complete";
      break;
    }
    await options.finalize?.(result);
    return result;
  }

  // src/workflows/recycle.js
  function completionLimit(value) {
    const number = Number(value);
    return Math.max(1, Math.min(1e3, Number.isFinite(number) ? Math.floor(number) : 1));
  }
  async function emit2(options, event, payload = {}) {
    await options.onEvent?.(event, payload);
  }
  function submissionOutcome(submission) {
    if (submission?.submitted === true || submission?.status === "submitted") return "submitted";
    if (submission?.status === "planned") return "planned";
    if (submission?.status === "unavailable") return "unavailable";
    return "blocked";
  }
  async function runRecycleWorkflow(options = {}) {
    for (const name of ["inspectTargets", "findPack", "consumeTarget", "openPack", "submitSeed"]) {
      if (typeof options[name] !== "function") throw new TypeError(`${name} is required`);
    }
    const result = {
      status: "completed",
      completions: 0,
      packsOpened: 0,
      lastRewardPackId: null,
      iterations: 0,
      reason: null
    };
    const maxCompletions = completionLimit(options.maxCompletions);
    while (result.completions < maxCompletions) {
      await options.stopPoint?.();
      result.iterations++;
      const targets = await options.inspectTargets({ result }) || [];
      await emit2(options, "targets", { result, targets });
      if (targets.length) {
        const submission2 = await options.consumeTarget({ result, targets, target: targets[0] });
        await emit2(options, "target-submission", { result, targets, submission: submission2 });
        const outcome3 = submissionOutcome(submission2);
        if (outcome3 === "submitted") {
          result.completions++;
          result.lastRewardPackId = submission2.rewardPackId ?? null;
          await options.afterSubmission?.({ result, submission: submission2, source: "target" });
          continue;
        }
        result.status = outcome3;
        result.reason = submission2?.reason || `target submission ${outcome3}`;
        break;
      }
      const pack = await options.findPack({ result, rewardPackId: result.lastRewardPackId });
      if (pack) {
        const receipt = await options.openPack({ result, pack });
        await emit2(options, "pack", { result, pack, receipt });
        if (receipt?.status === "opened") {
          result.packsOpened++;
          result.lastRewardPackId = null;
          await options.afterPack?.({ result, pack, receipt });
          continue;
        }
        if (receipt?.status === "planned") {
          result.status = "planned";
          result.reason = receipt.reason || "pack open planned";
          break;
        }
        if (receipt?.status === "stale" || receipt?.status === "unavailable") {
          result.lastRewardPackId = null;
          await options.afterStalePack?.({ result, pack, receipt });
          continue;
        }
        result.status = "blocked";
        result.reason = receipt?.reason || "pack open blocked";
        break;
      }
      const submission = await options.submitSeed({ result });
      await emit2(options, "seed-submission", { result, submission });
      const outcome2 = submissionOutcome(submission);
      if (outcome2 === "submitted") {
        result.completions++;
        result.lastRewardPackId = submission.rewardPackId ?? null;
        await options.afterSubmission?.({ result, submission, source: "seed" });
        continue;
      }
      result.status = outcome2;
      result.reason = submission?.reason || `seed submission ${outcome2}`;
      break;
    }
    if (result.lastRewardPackId !== null && options.openFinalReward) {
      const finalReceipt = await options.openFinalReward({ result, rewardPackId: result.lastRewardPackId });
      await emit2(options, "final-reward", { result, receipt: finalReceipt });
      if (finalReceipt?.status === "opened") {
        result.packsOpened++;
        result.lastRewardPackId = null;
      } else if (finalReceipt?.status === "blocked") {
        result.status = "blocked";
        result.reason = finalReceipt.reason || "final reward pack blocked";
      }
    }
    await options.finalize?.(result);
    return result;
  }

  // src/workflows/pack-and-craft.js
  function boundedCount(value, fallback = 1, max = 1e3) {
    const number = Number(value);
    return Math.max(1, Math.min(max, Number.isFinite(number) ? Math.floor(number) : fallback));
  }
  async function emit3(options, event, payload = {}) {
    await options.onEvent?.(event, payload);
  }
  async function runPackAndCraftWorkflow(options = {}) {
    for (const name of ["findPack", "openPack", "runStages"]) {
      if (typeof options[name] !== "function") throw new TypeError(`${name} is required`);
    }
    const result = {
      status: "completed",
      packsOpened: 0,
      stageCompletions: {},
      iterations: 0,
      reason: null
    };
    const maxPacks = boundedCount(options.maxPacks, 1);
    const recordStages = (stageResult = {}) => {
      for (const [id, count] of Object.entries(stageResult.completions || {})) {
        result.stageCompletions[id] = Number(result.stageCompletions[id] || 0) + Number(count || 0);
      }
    };
    const resumed = await options.resume?.({ result });
    if (resumed?.status === "blocked") {
      result.status = "blocked";
      result.reason = resumed.reason || "resume blocked";
    } else if (resumed?.status === "planned") {
      result.status = "planned";
      result.reason = resumed.reason || "resume planned";
    } else if (resumed?.hasItems) {
      const stageResult = await options.runStages({ result, phase: "resume", context: resumed });
      recordStages(stageResult);
      await emit3(options, "stages", { result, phase: "resume", stageResult, context: resumed });
      if (stageResult?.status === "blocked" || stageResult?.status === "planned") {
        result.status = stageResult.status;
        result.reason = stageResult.reason || `resume stages ${stageResult.status}`;
      }
      await options.afterStages?.({ result, phase: "resume", stageResult, context: resumed });
    }
    while (result.status === "completed" && result.packsOpened < maxPacks) {
      await options.stopPoint?.();
      result.iterations++;
      const before = await options.beforePack?.({ result });
      if (before?.status === "blocked" || before?.status === "planned") {
        result.status = before.status;
        result.reason = before.reason || `pre-pack ${before.status}`;
        break;
      }
      const pack = await options.findPack({ result });
      if (!pack) {
        result.status = "unavailable";
        result.reason = "no matching pack remains";
        await emit3(options, "pack-unavailable", { result });
        break;
      }
      const receipt = await options.openPack({ result, pack });
      await emit3(options, "pack", { result, pack, receipt });
      if (receipt?.status === "planned") {
        result.status = "planned";
        result.reason = receipt.reason || "pack open planned";
        break;
      }
      if (receipt?.status === "stale" || receipt?.status === "unavailable") {
        await options.afterStalePack?.({ result, pack, receipt });
        continue;
      }
      if (receipt?.status !== "opened") {
        result.status = "blocked";
        result.reason = receipt?.reason || "pack open blocked";
        break;
      }
      result.packsOpened++;
      const stageResult = await options.runStages({ result, phase: "pack", pack, receipt, context: receipt.details || {} });
      recordStages(stageResult);
      await emit3(options, "stages", { result, phase: "pack", pack, receipt, stageResult });
      if (stageResult?.status === "blocked" || stageResult?.status === "planned") {
        result.status = stageResult.status;
        result.reason = stageResult.reason || `pack stages ${stageResult.status}`;
        break;
      }
      await options.afterStages?.({ result, phase: "pack", pack, receipt, stageResult });
    }
    await options.finalize?.(result);
    return result;
  }

  // src/workflows/player-pick.js
  function pickLimit(value) {
    const number = Number(value);
    return Math.max(1, Math.min(100, Number.isFinite(number) ? Math.floor(number) : 1));
  }
  function outcome(value) {
    if (value?.status === "selected") return "selected";
    if (value?.submitted === true || value?.status === "submitted") return "submitted";
    if (value?.status === "planned") return "planned";
    if (value?.status === "unavailable") return "unavailable";
    return "blocked";
  }
  async function emit4(options, event, payload = {}) {
    await options.onEvent?.(event, payload);
  }
  async function runPlayerPickWorkflow(options = {}) {
    for (const name of ["findPendingPick", "redeemPick", "loadChallenges", "submitChallenge", "findRewardPick"]) {
      if (typeof options[name] !== "function") throw new TypeError(`${name} is required`);
    }
    const result = {
      status: "completed",
      picksCompleted: 0,
      challengesSubmitted: 0,
      challengesPlanned: 0,
      pickResults: [],
      reason: null
    };
    const maxPicks = pickLimit(options.maxPicks);
    while (result.picksCompleted < maxPicks) {
      const pendingPick = await options.findPendingPick({ result });
      if (!pendingPick) break;
      const selected = await options.redeemPick({ result, pickItem: pendingPick, resumed: true });
      await emit4(options, "pick", { result, pickItem: pendingPick, resumed: true, selected });
      const selectedOutcome = outcome(selected);
      if (selectedOutcome === "selected") {
        result.pickResults.push({ resumed: true, pickedCards: selected.pickedCards || [] });
        result.picksCompleted++;
        await options.afterPick?.({ result, resumed: true, selected });
        continue;
      }
      result.status = selectedOutcome;
      result.reason = selected?.reason || `pending Pick ${selectedOutcome}`;
      break;
    }
    while (result.status === "completed" && result.picksCompleted < maxPicks) {
      await options.stopPoint?.();
      const before = await options.beforePick?.({ result });
      if (before?.status === "blocked" || before?.status === "planned") {
        result.status = before.status;
        result.reason = before.reason || `pre-Pick ${before.status}`;
        break;
      }
      const challengeContext = await options.loadChallenges({ result });
      if (!challengeContext) {
        result.status = "unavailable";
        result.reason = "Player Pick challenge list unavailable";
        break;
      }
      const incomplete = challengeContext.incomplete || [];
      let planned = false;
      for (const entry of incomplete) {
        const submission = await options.submitChallenge({ result, challengeContext, entry });
        await emit4(options, "challenge", { result, challengeContext, entry, submission });
        const submissionOutcome2 = outcome(submission);
        if (submissionOutcome2 === "submitted") {
          result.challengesSubmitted++;
          await options.afterChallenge?.({ result, challengeContext, entry, submission });
          continue;
        }
        if (submissionOutcome2 === "planned") {
          result.challengesPlanned++;
          planned = true;
          continue;
        }
        result.status = submissionOutcome2;
        result.reason = submission?.reason || `Player Pick challenge ${submissionOutcome2}`;
        break;
      }
      if (result.status !== "completed") break;
      if (planned) {
        result.status = "planned";
        result.reason = "Player Pick challenges planned";
        break;
      }
      const rewardPick = await options.findRewardPick({ result, challengeContext });
      if (!rewardPick) {
        result.status = "unavailable";
        result.reason = "Player Pick reward was not found";
        break;
      }
      const selected = await options.redeemPick({ result, pickItem: rewardPick, resumed: false });
      await emit4(options, "pick", { result, pickItem: rewardPick, resumed: false, selected });
      const selectedOutcome = outcome(selected);
      if (selectedOutcome !== "selected") {
        result.status = selectedOutcome;
        result.reason = selected?.reason || `Player Pick selection ${selectedOutcome}`;
        break;
      }
      result.pickResults.push({ resumed: false, pickedCards: selected.pickedCards || [] });
      result.picksCompleted++;
      await options.afterPick?.({ result, resumed: false, selected });
    }
    await options.finalize?.(result);
    return result;
  }

  // src/workflows/repeated-submission.js
  function completionLimit2(value) {
    const number = Number(value);
    return Math.max(1, Math.min(1e3, Number.isFinite(number) ? Math.floor(number) : 1));
  }
  async function emit5(options, event, payload = {}) {
    await options.onEvent?.(event, payload);
  }
  async function runRepeatedSubmissionWorkflow(options = {}) {
    if (typeof options.executeAttempt !== "function") throw new TypeError("executeAttempt is required");
    const result = {
      status: "completed",
      completions: 0,
      attempts: 0,
      retries: 0,
      rewardPacksOpened: 0,
      rewardPacksPending: 0,
      reason: null,
      details: {}
    };
    const maxCompletions = completionLimit2(options.maxCompletions);
    while (result.completions < maxCompletions) {
      await options.stopPoint?.();
      result.attempts++;
      const attempt = await options.executeAttempt({ result, attemptNo: result.attempts }) || { status: "blocked" };
      await emit5(options, "attempt", { result, attempt });
      if (attempt.status === "retry") {
        result.retries++;
        await options.afterRetry?.({ result, attempt });
        continue;
      }
      if (attempt.status === "submitted" || attempt.submitted === true) {
        result.completions++;
        result.rewardPacksOpened += Number(attempt.rewardPacksOpened || 0);
        result.rewardPacksPending += Number(attempt.rewardPacksPending || 0);
        result.details = { ...result.details, ...attempt.details || {} };
        await options.afterCompletion?.({ result, attempt });
        if (attempt.stopAfterCompletion === true) {
          result.status = "stopped";
          result.reason = attempt.reason || "stopped after completion";
          break;
        }
        continue;
      }
      if (attempt.status === "planned") {
        result.status = "planned";
        result.reason = attempt.reason || "submission planned";
        result.details = { ...result.details, ...attempt.details || {} };
        break;
      }
      if (attempt.status === "unavailable") {
        result.status = "unavailable";
        result.reason = attempt.reason || "submission unavailable";
        break;
      }
      result.status = "blocked";
      result.reason = attempt.reason || "submission blocked";
      break;
    }
    await options.finalize?.(result);
    return result;
  }

  // src/workflows/sequence.js
  async function emit6(options, event, payload = {}) {
    await options.onEvent?.(event, payload);
  }
  async function runSequenceWorkflow(options = {}) {
    if (!Array.isArray(options.steps)) throw new TypeError("steps must be an array");
    if (typeof options.runStep !== "function") throw new TypeError("runStep is required");
    const result = {
      status: "completed",
      completedSteps: [],
      skippedSteps: [],
      reason: null
    };
    for (let index = 0; index < options.steps.length; index++) {
      await options.stopPoint?.();
      const baseStep = options.steps[index];
      await emit6(options, "step-start", { result, step: baseStep, index, total: options.steps.length });
      const before = await options.beforeStep?.({ result, step: baseStep, index, total: options.steps.length });
      if (before?.status === "blocked") {
        result.status = "blocked";
        result.reason = before.reason || `step ${index + 1} preflight blocked`;
        break;
      }
      const availability = await options.getAvailability?.({ result, step: baseStep, index, total: options.steps.length });
      if (availability && availability.available === false) {
        result.skippedSteps.push({ id: baseStep.id, reason: availability.reason || "unavailable" });
        await emit6(options, "step-skipped", { result, step: baseStep, index, availability });
        continue;
      }
      const step = options.configureStep ? await options.configureStep({ result, step: baseStep, index, availability }) : baseStep;
      const stepResult = await options.runStep({ result, step, index, availability });
      await emit6(options, "step-complete", { result, step, index, availability, stepResult });
      if (stepResult?.status === "blocked") {
        result.status = "blocked";
        result.reason = stepResult.reason || `step ${index + 1} blocked`;
        break;
      }
      result.completedSteps.push({ id: step.id, result: stepResult || null });
      await options.afterStep?.({ result, step, index, availability, stepResult });
    }
    await options.finalize?.(result);
    return result;
  }

  // src/ui/log-renderer.js
  function defaultSchedule(callback) {
    if (typeof requestAnimationFrame === "function") return requestAnimationFrame(callback);
    return setTimeout(callback, 0);
  }
  function defaultCancel(handle) {
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(handle);
    else clearTimeout(handle);
  }
  function formatLogHtml(lines = [], escapeHtml = String) {
    return lines.map((line) => escapeHtml(line).replace(
      /(rating:(?:9[1-9]|[1-9]\d{2,}))/g,
      '<span class="bronze-loop-log-high-rated">$1</span>'
    )).join("\n");
  }
  function createLogRenderer(options = {}) {
    const schedule = options.schedule || defaultSchedule;
    const cancel = options.cancel || defaultCancel;
    const getLines = options.getLines || (() => []);
    const getPanel = options.getPanel || (() => null);
    const getLatestBox = options.getLatestBox || (() => null);
    const getFullBox = options.getFullBox || (() => null);
    const formatFullLog = options.formatFullLog || ((lines) => lines.join("\n"));
    let pendingHandle = null;
    let fullLogDirty = true;
    function fullLogVisible(panel) {
      return !!panel && panel.classList?.contains("options-open") && !panel.classList?.contains("icon-only");
    }
    function flush() {
      pendingHandle = null;
      const lines = getLines();
      const latest = lines[lines.length - 1] || "Ready.";
      const panel = getPanel();
      const latestBox = getLatestBox();
      if (latestBox && !panel?.classList?.contains("options-open") && !panel?.classList?.contains("icon-only")) {
        if (latestBox.textContent !== latest) latestBox.textContent = latest;
      }
      if (!fullLogVisible(panel)) return;
      const fullBox = getFullBox();
      if (!fullBox || !fullLogDirty) return;
      const pinnedToBottom = fullBox.scrollHeight - fullBox.scrollTop - fullBox.clientHeight <= 8;
      fullBox.innerHTML = formatFullLog(lines);
      fullLogDirty = false;
      if (pinnedToBottom) fullBox.scrollTop = fullBox.scrollHeight;
    }
    function request() {
      fullLogDirty = true;
      if (pendingHandle !== null) return;
      pendingHandle = schedule(flush);
    }
    function flushNow() {
      fullLogDirty = true;
      if (pendingHandle !== null) {
        cancel(pendingHandle);
        pendingHandle = null;
      }
      flush();
    }
    function destroy() {
      if (pendingHandle !== null) cancel(pendingHandle);
      pendingHandle = null;
    }
    return Object.freeze({ request, flushNow, destroy });
  }

  // src/userscript-entry.js
  (function() {
    "use strict";
    const W = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    try {
      W[APP_KEY]?.destroy?.();
    } catch {
    }
    const eaSbcAdapter = () => createEaSbcAdapter(W);
    const LOOP_DEFS = [
      {
        id: "bronze-upgrade-validation",
        name: "Bronze Upgrade Validation",
        strategy: "validationBronzeUpgrade",
        sourcePackIds: [105],
        sourcePackNames: CFG.sourcePackNames,
        sbcNames: CFG.bronzeUpgradeNames,
        rewardPackNames: CFG.silverRewardNames,
        targetDuplicate: { tier: "bronze", playerOnly: true, allowSpecial: false },
        maxRounds: 3
      },
      {
        id: "daily-bronze",
        hidden: true,
        name: "Daily Bronze Loop",
        strategy: "dailySingleCardRecycle",
        sbcNames: ["Daily Bronze Upgrade", "\u6BCF\u65E5\u9752\u94DC\u5347\u7EA7", "\u6BCF\u65E5\u9752\u9285\u5347\u7D1A"],
        rewardPackIds: [105],
        rewardPackNames: ["Bronze Players Premium", "Premium Bronze Players", "BRONZE PLAYERS PREMIUM"],
        targetDuplicate: { tier: "bronze", playerOnly: true, allowSpecial: false },
        dailyCompletionLimit: 7,
        maxCompletions: 7
      },
      {
        id: "daily-bronze-mvp",
        hidden: true,
        mvp: true,
        name: "Daily Bronze MVP (1 run)",
        strategy: "dailySingleCardRecycle",
        sbcNames: ["Daily Bronze Upgrade", "\u6BCF\u65E5\u9752\u94DC\u5347\u7EA7", "\u6BCF\u65E5\u9752\u9285\u5347\u7D1A"],
        rewardPackIds: [105],
        rewardPackNames: ["Bronze Players Premium", "Premium Bronze Players", "BRONZE PLAYERS PREMIUM"],
        targetDuplicate: { tier: "bronze", playerOnly: true, allowSpecial: false },
        dailyCompletionLimit: 7,
        maxCompletions: 1
      },
      {
        id: "daily-silver",
        hidden: true,
        name: "Daily Silver Loop",
        strategy: "dailySingleCardRecycle",
        sbcNames: ["Daily Silver Upgrade", "\u6BCF\u65E5\u767D\u94F6\u5347\u7EA7", "\u6BCF\u65E5\u767D\u9280\u5347\u7D1A"],
        rewardPackIds: [205],
        rewardPackNames: ["Silver Players Premium", "SILVER PLAYERS PREMIUM"],
        targetDuplicate: { tier: "silver", playerOnly: true, allowSpecial: false },
        dailyCompletionLimit: 7,
        maxCompletions: 7
      },
      {
        id: "daily-silver-mvp",
        hidden: true,
        mvp: true,
        name: "Daily Silver MVP (1 run)",
        strategy: "dailySingleCardRecycle",
        sbcNames: ["Daily Silver Upgrade", "\u6BCF\u65E5\u767D\u94F6\u5347\u7EA7", "\u6BCF\u65E5\u767D\u9280\u5347\u7D1A"],
        rewardPackIds: [205],
        rewardPackNames: ["Silver Players Premium", "SILVER PLAYERS PREMIUM"],
        targetDuplicate: { tier: "silver", playerOnly: true, allowSpecial: false },
        dailyCompletionLimit: 7,
        maxCompletions: 1
      },
      {
        id: "daily-common",
        hidden: true,
        name: "Daily Common Loop",
        strategy: "supplyAndCraft",
        sbcNames: ["Daily Common Gold Upgrade", "\u6BCF\u65E5\u666E\u901A\u91D1\u724C\u5347\u7EA7", "\u6BCF\u65E5\u666E\u901A\u91D1\u724C\u5347\u7D1A"],
        rewardPackIds: [304],
        rewardPackNames: ["Gold Players Pack"],
        requirements: [
          { tier: "silver", count: 5, playerOnly: true, allowSpecial: false, priorityPiles: ["storage", "transfer", "club"] },
          { tier: "bronze", count: 5, playerOnly: true, allowSpecial: false, priorityPiles: ["storage", "transfer", "club"] }
        ],
        priorityPiles: ["storage", "transfer", "club"],
        primaryPiles: ["unassigned", "storage", "transfer"],
        clubFallbackPiles: ["unassigned", "storage", "transfer", "club"],
        shortagePacks: [
          { requirement: { tier: "bronze" }, packIds: [105], packNames: ["Bronze Players Premium", "Premium Bronze Players", "BRONZE PLAYERS PREMIUM"], maxOpensPerAttempt: 1 },
          { requirement: { tier: "silver" }, packIds: [205], packNames: ["Silver Players Premium", "SILVER PLAYERS PREMIUM"], maxOpensPerAttempt: 1 }
        ],
        dailyCompletionLimit: 7,
        maxCompletions: 7
      },
      {
        id: "daily-common-mvp",
        hidden: true,
        mvp: true,
        name: "Daily Common MVP (1 run)",
        strategy: "supplyAndCraft",
        sbcNames: ["Daily Common Gold Upgrade", "\u6BCF\u65E5\u666E\u901A\u91D1\u724C\u5347\u7EA7", "\u6BCF\u65E5\u666E\u901A\u91D1\u724C\u5347\u7D1A"],
        rewardPackIds: [304],
        rewardPackNames: ["Gold Players Pack"],
        requirements: [
          { tier: "silver", count: 5, playerOnly: true, allowSpecial: false, priorityPiles: ["storage", "transfer", "club"] },
          { tier: "bronze", count: 5, playerOnly: true, allowSpecial: false, priorityPiles: ["storage", "transfer", "club"] }
        ],
        priorityPiles: ["storage", "transfer", "club"],
        primaryPiles: ["unassigned", "storage", "transfer"],
        clubFallbackPiles: ["unassigned", "storage", "transfer", "club"],
        shortagePacks: [
          { requirement: { tier: "bronze" }, packIds: [105], packNames: ["Bronze Players Premium", "Premium Bronze Players", "BRONZE PLAYERS PREMIUM"], maxOpensPerAttempt: 1 },
          { requirement: { tier: "silver" }, packIds: [205], packNames: ["Silver Players Premium", "SILVER PLAYERS PREMIUM"], maxOpensPerAttempt: 1 }
        ],
        dailyCompletionLimit: 7,
        maxCompletions: 1
      },
      {
        id: "daily-rare",
        hidden: true,
        name: "Daily Rare Loop",
        strategy: "supplyAndCraft",
        sbcNames: ["Daily Rare Gold Upgrade", "\u6BCF\u65E5\u7A00\u6709\u91D1\u724C\u5347\u7EA7", "\u6BCF\u65E5\u7A00\u6709\u91D1\u724C\u5347\u7D1A"],
        sourcePackNames: ["11x Gold Players Pack", "11 x Gold Players Pack"],
        rewardPackNames: ["Max. 78 Rare Gold Players Pack", "Max 78 Rare Gold Players Pack"],
        requirements: [
          { tier: "gold", rarity: "common", count: 5, playerOnly: true, allowSpecial: false, protectHighGold: true, priorityPiles: ["unassigned", "storage", "transfer"] }
        ],
        priorityPiles: ["unassigned", "storage", "transfer"],
        clubFallbackPiles: ["unassigned", "storage", "transfer", "club"],
        deferChallengeLoad: true,
        preSelectionCleanup: false,
        shortagePacks: [
          {
            requirement: { tier: "gold", rarity: "common", playerOnly: true, allowSpecial: false, protectHighGold: true },
            packNames: ["11x Gold Players Pack", "11 x Gold Players Pack"],
            maxOpensPerAttempt: 1,
            repeatUntilSatisfied: true,
            maxRuns: 100,
            routingPolicy: "reserveMatchingDuplicates"
          }
        ],
        dailyCompletionLimit: 7,
        maxCompletions: 7
      },
      {
        id: "daily-rare-mvp",
        hidden: true,
        mvp: true,
        name: "Daily Rare MVP (1 run)",
        strategy: "supplyAndCraft",
        sbcNames: ["Daily Rare Gold Upgrade", "\u6BCF\u65E5\u7A00\u6709\u91D1\u724C\u5347\u7EA7", "\u6BCF\u65E5\u7A00\u6709\u91D1\u724C\u5347\u7D1A"],
        sourcePackNames: ["11x Gold Players Pack", "11 x Gold Players Pack"],
        rewardPackNames: ["Max. 78 Rare Gold Players Pack", "Max 78 Rare Gold Players Pack"],
        requirements: [
          { tier: "gold", rarity: "common", count: 5, playerOnly: true, allowSpecial: false, protectHighGold: true, priorityPiles: ["unassigned", "storage", "transfer"] }
        ],
        priorityPiles: ["unassigned", "storage", "transfer"],
        clubFallbackPiles: ["unassigned", "storage", "transfer", "club"],
        deferChallengeLoad: true,
        preSelectionCleanup: false,
        shortagePacks: [
          {
            requirement: { tier: "gold", rarity: "common", playerOnly: true, allowSpecial: false, protectHighGold: true },
            packNames: ["11x Gold Players Pack", "11 x Gold Players Pack"],
            maxOpensPerAttempt: 1,
            repeatUntilSatisfied: true,
            maxRuns: 100,
            routingPolicy: "reserveMatchingDuplicates"
          }
        ],
        dailyCompletionLimit: 7,
        maxCompletions: 1
      },
      {
        id: "daily-rare-pack-84",
        name: "Daily Rare Pack to 2x84+ Loop",
        strategy: "rarePackTo84Upgrade",
        sourcePackNames: [
          "5x Max.78 Rare Gold Players Pack",
          "5x Max. 78 Rare Gold Players Pack",
          "5x Max 78 Rare Gold Players Pack",
          "5 x Max.78 Rare Gold Players Pack",
          "5 x Max. 78 Rare Gold Players Pack",
          "5 x Max 78 Rare Gold Players Pack",
          "5x 80+ Rare Gold Players Pack",
          "5 x 80+ Rare Gold Players Pack"
        ],
        rareUpgrade: {
          name: "2x 84+ Upgrade",
          sbcNames: ["2x 84+ Upgrade", "2 x 84+ Upgrade"],
          requirements: [
            { tier: "gold", rarity: "rare", count: 6, playerOnly: true, allowSpecial: false, protectHighGold: true, priorityPiles: ["unassigned", "storage", "transfer", "club"] }
          ],
          priorityPiles: ["unassigned", "storage", "transfer", "club"]
        },
        maxPacks: 100
      },
      {
        id: "83-plus-player-pick-1of5",
        name: "1 of 5 83+ Player Pick",
        strategy: "playerPickSbc",
        sbcNames: ["1 of 5 83+ Player Pick", "1 of 5 83+ Player Picks"],
        pickItemNames: ["1 of 5 83+ Player Pick", "83+ Player Pick", "PlayerPickItemName25_4164"],
        requirements: [
          { tier: "gold", rarity: "rare", count: 4, maxRating: 81, playerOnly: true, allowSpecial: false, protectHighGold: true, priorityPiles: ["unassigned", "storage", "transfer", "club"] }
        ],
        priorityPiles: ["unassigned", "storage", "transfer", "club"],
        challengesPerPick: 1,
        pickCount: 1,
        maxCompletions: 1,
        useRoundsAsCompletions: true,
        pricePlatform: "pc"
      },
      {
        id: "84-plus-summer-tournament-nations-pick-1of3",
        name: "1 of 3 84+ Summer Tournament Nations Player Pick",
        strategy: "playerPickSbc",
        sbcNames: [
          "1 of 3 84+ Summer Tournament Nations Player Pick",
          "1 of 3 84+ Summer Tournament Nations Players Pick"
        ],
        pickItemNames: [
          "1 of 3 84+ Summer Tournament Nations Player Pick",
          "1 of 3 84+ Summer Tournament Nations Pick",
          "84+ Summer Tournament Nations Player Pick",
          "Summer Tournament Nations Player Pick"
        ],
        requirements: [
          { tier: "gold", rarity: "rare", count: 4, maxRating: 81, playerOnly: true, allowSpecial: false, protectHighGold: true, priorityPiles: ["unassigned", "storage", "transfer", "club"] }
        ],
        priorityPiles: ["unassigned", "storage", "transfer", "club"],
        challengesPerPick: 1,
        pickCount: 1,
        maxCompletions: 1,
        useRoundsAsCompletions: true,
        pricePlatform: "pc"
      },
      {
        id: "82-plus-player-pick-5of10",
        name: "5 of 10 82+ Players Pick",
        strategy: "playerPickSbc",
        sbcNames: ["5 of 10 82+ Players Pick", "5 of 10 82+ Player Pick", "5 of 10 82+ Player Picks"],
        pickItemNames: ["5 of 10 82+ Players Pick", "5 of 10 82+ Player Pick", "5 of 10 82+ Rare Gold Player Pick", "82+ Player Pick"],
        requirements: [
          { tier: "gold", rarity: "common", count: 11, maxRating: 81, playerOnly: true, allowSpecial: false, protectHighGold: true, priorityPiles: ["unassigned", "storage", "transfer", "club"] }
        ],
        priorityPiles: ["unassigned", "storage", "transfer", "club"],
        challengesPerPick: 2,
        pickCount: 5,
        maxCompletions: 1,
        useRoundsAsCompletions: true,
        pricePlatform: "pc"
      },
      {
        id: "one-click-daily-mvp",
        hidden: true,
        mvp: true,
        name: "One-click Daily MVP (1 each)",
        strategy: "dailyRoutine",
        steps: ["daily-bronze-mvp", "daily-silver-mvp", "daily-common-mvp", "daily-rare-mvp"],
        openRewardPacks: false
      },
      {
        id: "one-click-daily",
        name: "One-click Daily Loop (max 7 each)",
        strategy: "dailyRoutine",
        steps: ["daily-bronze", "daily-silver", "daily-common", "daily-rare", "daily-rare-pack-84"],
        openRewardPacks: false
      },
      {
        id: "2x84-fodder",
        hidden: true,
        mvp: true,
        name: "2x84+ Fodder Loop",
        strategy: "fillAndVerifySbc",
        sbcNames: ["2x 84+ Upgrade", "2 x 84+ Upgrade"],
        rewardPackNames: ["2x 84+ Rare Gold Players Pack", "2 x 84+ Rare Gold Players Pack"],
        maxCompletions: 1,
        useRoundsAsCompletions: true,
        allowMultipleCompletions: true,
        inventoryFillFirst: true,
        requirements: [
          { tier: "gold", rarity: "rare", count: 6, maxRating: 81, playerOnly: true, allowSpecial: false, protectHighGold: true, priorityPiles: ["storage", "club"] }
        ],
        priorityPiles: ["storage", "club"],
        requiredSpecialCount: 0,
        allowedSpecialCount: 0,
        maxSubmittedRating: 81,
        maxNormalGoldSubmittedRating: 81,
        blockSpecial: true,
        blockTradeable: false,
        openRewardPacks: true,
        forceOpenRewardPacks: true
      },
      {
        id: "auto-totw-upgrade",
        name: "84+ TOTW Upgrade Loop",
        strategy: "fillAndVerifySbc",
        sbcNames: ["84+ TOTW Upgrade", "84+ TOTW", "TOTW Upgrade", "84+ TOTW \u5347\u7EA7", "84+ TOTW \u5347\u7D1A"],
        rewardPackIds: [20707, 20441],
        rewardPackNames: ["84+ TOTW 1-30 Player Pack", "TOTW 1-30 Player Pack", "84+ TOTW 1-30", "TOTW 1-30", "84+ TOTW Player Pack", "TOTW Player Pack", "84+ TOTW Pack", "TOTW Pack", "TOTW Provision Refresh", "TOTW Provision Refresh Pack"],
        maxCompletions: 1,
        useRoundsAsCompletions: true,
        allowMultipleCompletions: true,
        maxSubmittedRating: 88,
        maxNormalGoldSubmittedRating: 99,
        ratingSbcFill: {
          priorityPiles: ["unassigned", "storage", "transfer", "club"]
        },
        requiredSpecialCount: 0,
        allowedSpecialCount: 0,
        blockSpecial: true,
        blockTradeable: false,
        openRewardPacks: true,
        forceOpenRewardPacks: true,
        assumeTotwRewardPack: true
      },
      {
        id: "84x10-mvp",
        hidden: true,
        mvp: true,
        name: "84x10 MVP (1 run)",
        strategy: "fillAndVerifySbc",
        sbcNames: [
          "84+ x10",
          "84+ x 10",
          "10x 84+ Upgrade",
          "10 x 84+ Upgrade",
          "10 \u540D 84+ \u5347\u7EA7",
          "10\u540D84+\u5347\u7EA7"
        ],
        maxCompletions: 1,
        maxSubmittedRating: 88,
        maxNormalGoldSubmittedRating: 99,
        ratingSbcFill: {
          priorityPiles: ["unassigned", "storage", "transfer", "club"]
        },
        requiredSpecialCount: 1,
        allowedSpecialCount: 1,
        requiredSpecialKind: "totw-tots-fof",
        requiredSpecialMinRating: 84,
        specialRequirementAdd: {
          patterns: ["Any TOTW/TOTS/FOF", "TOTW/TOTS/FOF", "TOTW", "TOTS", "FOF"],
          buttonTexts: ["Add", "\u6DFB\u52A0", "\u52A0\u5165", "\u65B0\u589E"]
        },
        autoTotwUpgrade: {
          name: "84+ TOTW Upgrade",
          sbcNames: ["84+ TOTW Upgrade", "84+ TOTW", "TOTW Upgrade", "84+ TOTW \u5347\u7EA7", "84+ TOTW \u5347\u7D1A"],
          rewardPackIds: [20707, 20441],
          rewardPackNames: ["84+ TOTW 1-30 Player Pack", "TOTW 1-30 Player Pack", "84+ TOTW 1-30", "TOTW 1-30", "84+ TOTW Player Pack", "TOTW Player Pack", "84+ TOTW Pack", "TOTW Pack", "TOTW Provision Refresh", "TOTW Provision Refresh Pack"],
          maxSubmittedRating: 88,
          maxNormalGoldSubmittedRating: 99,
          blockSpecial: true,
          blockTradeable: false,
          openRewardPacks: true
        },
        autoFodderUpgrade: {
          maxAttemptsPerCompletion: 3
        },
        blockSpecial: true,
        blockTradeable: false,
        openRewardPacks: false
      },
      {
        id: "84x10",
        name: "84x10 Loop (max 7)",
        strategy: "fillAndVerifySbc",
        sbcNames: [
          "84+ x10",
          "84+ x 10",
          "10x 84+ Upgrade",
          "10 x 84+ Upgrade",
          "10 \u540D 84+ \u5347\u7EA7",
          "10\u540D84+\u5347\u7EA7"
        ],
        maxCompletions: 7,
        allowMultipleCompletions: true,
        maxSubmittedRating: 88,
        maxNormalGoldSubmittedRating: 99,
        ratingSbcFill: {
          priorityPiles: ["unassigned", "storage", "transfer", "club"]
        },
        requiredSpecialCount: 1,
        allowedSpecialCount: 1,
        requiredSpecialKind: "totw-tots-fof",
        requiredSpecialMinRating: 84,
        specialRequirementAdd: {
          patterns: ["Any TOTW/TOTS/FOF", "TOTW/TOTS/FOF", "TOTW", "TOTS", "FOF"],
          buttonTexts: ["Add", "\u6DFB\u52A0", "\u52A0\u5165", "\u65B0\u589E"]
        },
        autoTotwUpgrade: {
          name: "84+ TOTW Upgrade",
          sbcNames: ["84+ TOTW Upgrade", "84+ TOTW", "TOTW Upgrade", "84+ TOTW \u5347\u7EA7", "84+ TOTW \u5347\u7D1A"],
          rewardPackIds: [20707, 20441],
          rewardPackNames: ["84+ TOTW 1-30 Player Pack", "TOTW 1-30 Player Pack", "84+ TOTW 1-30", "TOTW 1-30", "84+ TOTW Player Pack", "TOTW Player Pack", "84+ TOTW Pack", "TOTW Pack", "TOTW Provision Refresh", "TOTW Provision Refresh Pack"],
          maxSubmittedRating: 88,
          maxNormalGoldSubmittedRating: 99,
          blockSpecial: true,
          blockTradeable: false,
          openRewardPacks: true
        },
        autoFodderUpgrade: {
          maxAttemptsPerCompletion: 3
        },
        blockSpecial: true,
        blockTradeable: false,
        openRewardPacks: false
      },
      {
        id: "provision-crafting",
        name: "Provision Crafting Loop",
        strategy: "provisionPackCrafting",
        sourcePackIds: [20643],
        sourcePackNames: ["Provision Pack", "Provisions Pack"],
        preCraftPlayerPickLoopId: "82-plus-player-pick-5of10",
        rounds: 1,
        craftingUpgrades: [
          {
            name: "FOF Glory Hunters Crafting Upgrade",
            sbcNames: ["FOF Glory Hunters Crafting Upgrade"],
            requirements: [
              { tier: "gold", rarity: "common", count: 9, playerOnly: true, allowSpecial: false, protectHighGold: true, priorityPiles: ["unassigned", "storage", "transfer", "club"] }
            ],
            priorityPiles: ["unassigned", "storage", "transfer", "club"]
          },
          {
            name: "2x 84+ Upgrade",
            sbcNames: ["2x 84+ Upgrade", "2 x 84+ Upgrade"],
            requirements: [
              { tier: "gold", rarity: "rare", count: 6, playerOnly: true, allowSpecial: false, protectHighGold: true, priorityPiles: ["unassigned", "storage", "transfer", "club"] }
            ],
            priorityPiles: ["unassigned", "storage", "transfer", "club"]
          }
        ]
      }
    ];
    const state = {
      running: false,
      stopping: false,
      refreshing: false,
      loadingLoops: false,
      loopDefs: null,
      recoveryRecipes: null,
      unassignedRecoveryPolicies: null,
      defaultUnassignedRecoveryPolicyIds: null,
      loopConfigSource: "built-in",
      stalePackRefs: /* @__PURE__ */ new WeakSet(),
      lastStorePacks: [],
      consumedItemIds: /* @__PURE__ */ new Set(),
      pendingConsumedDuplicateSignals: /* @__PURE__ */ new Map(),
      assumedTotwItemIds: /* @__PURE__ */ new Set(),
      recentRewardItems: [],
      logLines: [],
      bootTimer: null,
      fsuSettingsOverride: null,
      fsuSettingsCache: { at: 0, settings: null },
      lastOpenPackReceipt: null,
      lastPickRecap: null,
      showMvpLoops: false,
      loopStack: [],
      logRenderer: null
    };
    function destroyRunner() {
      state.stopping = true;
      if (state.bootTimer) clearInterval(state.bootTimer);
      state.logRenderer?.destroy?.();
      document.querySelector("#bronze-loop-panel")?.remove();
      document.querySelector("#bronze-loop-pick-modal")?.remove();
      document.querySelector("#bronze-loop-recap-modal")?.remove();
      document.querySelector("#bronze-loop-style")?.remove();
    }
    W[APP_KEY] = {
      version: "0.5.01",
      destroy: destroyRunner,
      getFsuSettings: () => getFsuSettings({ force: true }),
      getPackInventory: () => getPackInventorySnapshot(),
      setFsuSettingsOverride,
      clearFsuSettingsOverride,
      calculateSquadRating: calculateEaSquadRating,
      solveRatingSbcCandidates: findOptimalRatingSbcSelection
    };
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const now = () => (/* @__PURE__ */ new Date()).toLocaleTimeString();
    function log(msg) {
      const line = `[${now()}] ${msg}`;
      console.log("[BronzeLoop]", msg);
      state.logLines.push(line);
      state.logLines = state.logLines.slice(-1e3);
      state.logRenderer?.request?.();
    }
    function escapeHtml(text) {
      return String(text).replace(/[&<>"']/g, (ch) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[ch]);
    }
    function renderLog() {
      state.logRenderer?.flushNow?.();
    }
    function clearLog() {
      state.logLines = [];
      renderLog();
      console.clear();
      console.log("[BronzeLoop] Log cleared");
    }
    function getLoopDefs() {
      return state.loopDefs?.length ? state.loopDefs : LOOP_DEFS;
    }
    function getRecoveryRecipes() {
      return state.recoveryRecipes || RECOVERY_RECIPES;
    }
    function getUnassignedRecoveryPolicies() {
      return state.unassignedRecoveryPolicies || UNASSIGNED_RECOVERY_POLICIES;
    }
    function getDefaultUnassignedRecoveryPolicyIds() {
      return state.defaultUnassignedRecoveryPolicyIds || DEFAULT_UNASSIGNED_RECOVERY_POLICY_IDS;
    }
    function isMvpLoopDef(def = {}) {
      return def.mvp === true || /(?:^|-)mvp(?:-|$)/i.test(String(def.id || ""));
    }
    function getVisibleLoopDefs() {
      const loopDefs = getLoopDefs();
      return loopDefs.filter((def) => {
        if (isMvpLoopDef(def)) return state.showMvpLoops;
        return def.hidden !== true;
      });
    }
    function findLoopDefById(id) {
      const loopDefs = getLoopDefs();
      return loopDefs.find((def) => def.id === id) || null;
    }
    function getLoopDefById(id) {
      return findLoopDefById(id) || getLoopDefs()[0] || LOOP_DEFS[0];
    }
    function validateStringArray(value, path, errors, required = false) {
      if (value === void 0 || value === null) {
        if (required) errors.push(`${path} is required`);
        return;
      }
      if (!Array.isArray(value) || !value.length) {
        errors.push(`${path} must be a non-empty array`);
        return;
      }
      value.forEach((entry, index) => {
        if (typeof entry !== "string" || !entry.trim()) {
          errors.push(`${path}[${index}] must be a non-empty string`);
        }
      });
    }
    function validateNumberArray(value, path, errors) {
      if (value === void 0 || value === null) return;
      if (!Array.isArray(value) || !value.length) {
        errors.push(`${path} must be a non-empty array`);
        return;
      }
      value.forEach((entry, index) => {
        if (!Number.isFinite(Number(entry))) {
          errors.push(`${path}[${index}] must be a number`);
        }
      });
    }
    function validatePileList(value, path, errors, required = false) {
      const allowed = ["unassigned", "storage", "transfer", "club"];
      if (value === void 0 || value === null) {
        if (required) errors.push(`${path} is required`);
        return;
      }
      if (!Array.isArray(value) || !value.length) {
        errors.push(`${path} must be a non-empty array`);
        return;
      }
      value.forEach((pile, index) => {
        if (!allowed.includes(pile)) {
          errors.push(`${path}[${index}] must be one of: ${allowed.join(", ")}`);
        }
      });
    }
    function validateCardSpec(spec, path, errors) {
      if (!isPlainObject(spec)) {
        errors.push(`${path} must be an object`);
        return;
      }
      if (spec.tier !== void 0 && !["bronze", "silver", "gold"].includes(spec.tier)) {
        errors.push(`${path}.tier must be bronze, silver, or gold`);
      }
      if (spec.rarity !== void 0 && !["common", "rare"].includes(spec.rarity)) {
        errors.push(`${path}.rarity must be common or rare`);
      }
      ["minRating", "maxRating"].forEach((field) => {
        if (spec[field] === void 0) return;
        const rating = Number(spec[field]);
        if (!Number.isFinite(rating) || rating < 1 || rating > 99) {
          errors.push(`${path}.${field} must be a number between 1 and 99`);
        }
      });
      ["playerOnly", "allowSpecial", "special", "protectHighGold"].forEach((field) => {
        if (spec[field] !== void 0 && typeof spec[field] !== "boolean") {
          errors.push(`${path}.${field} must be boolean`);
        }
      });
    }
    function validateRequirements(requirements, path, errors, required = false) {
      if (requirements === void 0 || requirements === null) {
        if (required) errors.push(`${path} is required`);
        return;
      }
      if (!Array.isArray(requirements) || !requirements.length) {
        errors.push(`${path} must be a non-empty array`);
        return;
      }
      requirements.forEach((requirement, index) => {
        const reqPath = `${path}[${index}]`;
        validateCardSpec(requirement, reqPath, errors);
        if (!Number.isFinite(Number(requirement?.count)) || Number(requirement.count) <= 0) {
          errors.push(`${reqPath}.count must be a positive number`);
        }
        validatePileList(requirement?.priorityPiles, `${reqPath}.priorityPiles`, errors);
      });
    }
    function validateUpgradeDef(upgradeDef, path, errors) {
      if (!isPlainObject(upgradeDef)) {
        errors.push(`${path} must be an object`);
        return;
      }
      if (typeof upgradeDef.name !== "string" || !upgradeDef.name.trim()) {
        errors.push(`${path}.name is required`);
      }
      validateStringArray(upgradeDef.sbcNames, `${path}.sbcNames`, errors, true);
      const hasChallengeRequirements = upgradeDef.challengeRequirements !== void 0;
      validateRequirements(upgradeDef.requirements, `${path}.requirements`, errors, !hasChallengeRequirements);
      if (hasChallengeRequirements) {
        if (!Array.isArray(upgradeDef.challengeRequirements) || !upgradeDef.challengeRequirements.length) {
          errors.push(`${path}.challengeRequirements must be a non-empty array`);
        } else {
          upgradeDef.challengeRequirements.forEach((requirements, index) => {
            validateRequirements(requirements, `${path}.challengeRequirements[${index}]`, errors, true);
          });
        }
      }
      validatePileList(upgradeDef.priorityPiles, `${path}.priorityPiles`, errors);
    }
    function validateShortagePacks(shortagePacks, path, errors) {
      if (shortagePacks === void 0 || shortagePacks === null) return;
      if (!Array.isArray(shortagePacks) || !shortagePacks.length) {
        errors.push(`${path} must be a non-empty array`);
        return;
      }
      shortagePacks.forEach((source, index) => {
        const sourcePath = `${path}[${index}]`;
        if (!isPlainObject(source)) {
          errors.push(`${sourcePath} must be an object`);
          return;
        }
        validateCardSpec(source.requirement, `${sourcePath}.requirement`, errors);
        validateNumberArray(source.packIds, `${sourcePath}.packIds`, errors);
        validateStringArray(source.packNames, `${sourcePath}.packNames`, errors);
        if (!source.packIds?.length && !source.packNames?.length) {
          errors.push(`${sourcePath}.packIds or ${sourcePath}.packNames is required`);
        }
        if (source.maxOpensPerAttempt !== void 0) {
          const maxOpens = Number(source.maxOpensPerAttempt);
          if (!Number.isFinite(maxOpens) || maxOpens <= 0) {
            errors.push(`${sourcePath}.maxOpensPerAttempt must be a positive number`);
          }
        }
      });
    }
    function validateLoopDef(loopDef, label = "loop") {
      const errors = [];
      if (!isPlainObject(loopDef)) return [`${label} must be an object`];
      const strategies = [
        "validationBronzeUpgrade",
        "dailySingleCardRecycle",
        "supplyAndCraft",
        "inventoryMixedUpgrade",
        "commonGoldToRareUpgrade",
        "provisionPackCrafting",
        "provisionPackDualCrafting",
        "rarePackTo84Upgrade",
        "playerPickSbc",
        "dailyRoutine",
        "fillAndVerifySbc"
      ];
      if (typeof loopDef.name !== "string" || !loopDef.name.trim()) {
        errors.push("name is required");
      }
      if (typeof loopDef.strategy !== "string" || !loopDef.strategy.trim()) {
        errors.push("strategy is required");
      } else if (!strategies.includes(loopDef.strategy)) {
        errors.push(`strategy must be one of: ${strategies.join(", ")}`);
      }
      if (loopDef.dryRun !== void 0 && typeof loopDef.dryRun !== "boolean") {
        errors.push("dryRun must be boolean");
      }
      ["hidden", "mvp", "openRewardPacks", "blockSpecial", "blockTradeable", "inventoryFillFirst"].forEach((field) => {
        if (loopDef[field] !== void 0 && typeof loopDef[field] !== "boolean") {
          errors.push(`${field} must be boolean`);
        }
      });
      if (loopDef.maxSubmittedRating !== void 0) {
        const maxRating = Number(loopDef.maxSubmittedRating);
        if (!Number.isFinite(maxRating) || maxRating < 1 || maxRating > 99) {
          errors.push("maxSubmittedRating must be a number between 1 and 99");
        }
      }
      if (loopDef.maxNormalGoldSubmittedRating !== void 0) {
        const maxRating = Number(loopDef.maxNormalGoldSubmittedRating);
        if (!Number.isFinite(maxRating) || maxRating < 1 || maxRating > 99) {
          errors.push("maxNormalGoldSubmittedRating must be a number between 1 and 99");
        }
      }
      if (loopDef.dailyCompletionLimit !== void 0) {
        const dailyLimit = Number(loopDef.dailyCompletionLimit);
        if (!Number.isFinite(dailyLimit) || dailyLimit < 1 || dailyLimit > 100) {
          errors.push("dailyCompletionLimit must be a number between 1 and 100");
        }
      }
      if (loopDef.requiredSpecialMinRating !== void 0) {
        const minRating = Number(loopDef.requiredSpecialMinRating);
        if (!Number.isFinite(minRating) || minRating < 1 || minRating > 99) {
          errors.push("requiredSpecialMinRating must be a number between 1 and 99");
        }
      }
      if (loopDef.requiredSpecialKind !== void 0 && !["totw", "totw-tots-fof"].includes(String(loopDef.requiredSpecialKind).toLowerCase())) {
        errors.push("requiredSpecialKind must be totw or totw-tots-fof when provided");
      }
      if (loopDef.preCraftPlayerPickLoopId !== void 0 && (typeof loopDef.preCraftPlayerPickLoopId !== "string" || !loopDef.preCraftPlayerPickLoopId.trim())) {
        errors.push("preCraftPlayerPickLoopId must be a non-empty string");
      }
      if (loopDef.unassignedRecoveryPolicyIds !== void 0) {
        if (!Array.isArray(loopDef.unassignedRecoveryPolicyIds)) {
          errors.push("unassignedRecoveryPolicyIds must be an array");
        } else {
          loopDef.unassignedRecoveryPolicyIds.forEach((id, index) => {
            if (typeof id !== "string" || !id.trim()) errors.push(`unassignedRecoveryPolicyIds[${index}] must be a non-empty string`);
          });
        }
      }
      if (loopDef.overflowRecovery !== void 0) {
        errors.push("overflowRecovery is obsolete; use top-level recoveryRecipes and unassignedRecoveryPolicies");
      }
      if (loopDef.autoTotwUpgrade !== void 0 && loopDef.autoTotwUpgrade !== false && !isPlainObject(loopDef.autoTotwUpgrade)) {
        errors.push("autoTotwUpgrade must be an object or false");
      }
      if (loopDef.autoFodderUpgrade !== void 0 && loopDef.autoFodderUpgrade !== false && !isPlainObject(loopDef.autoFodderUpgrade)) {
        errors.push("autoFodderUpgrade must be an object or false");
      }
      if (isPlainObject(loopDef.autoFodderUpgrade) && loopDef.autoFodderUpgrade.maxAttemptsPerCompletion !== void 0) {
        const attempts = Number(loopDef.autoFodderUpgrade.maxAttemptsPerCompletion);
        if (!Number.isFinite(attempts) || attempts < 1 || attempts > 10) {
          errors.push("autoFodderUpgrade.maxAttemptsPerCompletion must be a number between 1 and 10");
        }
      }
      if (loopDef.ratingSbcFill !== void 0) {
        if (!isPlainObject(loopDef.ratingSbcFill)) {
          errors.push("ratingSbcFill must be an object");
        } else {
          validatePileList(loopDef.ratingSbcFill.priorityPiles, "ratingSbcFill.priorityPiles", errors, true);
          if (loopDef.ratingSbcFill.targetRating !== void 0) {
            const targetRating = Number(loopDef.ratingSbcFill.targetRating);
            if (!Number.isFinite(targetRating) || targetRating < 1 || targetRating > 99) {
              errors.push("ratingSbcFill.targetRating must be a number between 1 and 99");
            }
          }
          if (loopDef.ratingSbcFill.maxSearchNodes !== void 0) {
            const maxSearchNodes = Number(loopDef.ratingSbcFill.maxSearchNodes);
            if (!Number.isInteger(maxSearchNodes) || maxSearchNodes < 1e4 || maxSearchNodes > 2e6) {
              errors.push("ratingSbcFill.maxSearchNodes must be an integer between 10000 and 2000000");
            }
          }
          if (loopDef.ratingSbcFill.maxSearchMs !== void 0) {
            const maxSearchMs = Number(loopDef.ratingSbcFill.maxSearchMs);
            if (!Number.isInteger(maxSearchMs) || maxSearchMs < 1e3 || maxSearchMs > 6e4) {
              errors.push("ratingSbcFill.maxSearchMs must be an integer between 1000 and 60000");
            }
          }
          if (loopDef.ratingSbcFill.yieldEveryNodes !== void 0) {
            const yieldEveryNodes = Number(loopDef.ratingSbcFill.yieldEveryNodes);
            if (!Number.isInteger(yieldEveryNodes) || yieldEveryNodes < 50 || yieldEveryNodes > 5e3) {
              errors.push("ratingSbcFill.yieldEveryNodes must be an integer between 50 and 5000");
            }
          }
        }
      }
      validateNumberArray(loopDef.sourcePackIds, "sourcePackIds", errors);
      validateNumberArray(loopDef.rewardPackIds, "rewardPackIds", errors);
      validateNumberArray(loopDef.protectedItemIds, "protectedItemIds", errors);
      validateNumberArray(loopDef.protectedDefinitionIds, "protectedDefinitionIds", errors);
      validateStringArray(loopDef.sourcePackNames, "sourcePackNames", errors);
      validateStringArray(loopDef.rewardPackNames, "rewardPackNames", errors);
      validatePileList(loopDef.priorityPiles, "priorityPiles", errors);
      validatePileList(loopDef.primaryPiles, "primaryPiles", errors);
      validatePileList(loopDef.clubFallbackPiles, "clubFallbackPiles", errors);
      validatePileList(loopDef.disabledPiles, "disabledPiles", errors);
      if (loopDef.strategy === "validationBronzeUpgrade") {
        validateStringArray(loopDef.sbcNames, "sbcNames", errors, true);
        validateCardSpec(loopDef.targetDuplicate, "targetDuplicate", errors);
      }
      if (loopDef.strategy === "dailySingleCardRecycle") {
        validateStringArray(loopDef.sbcNames, "sbcNames", errors, true);
        validateCardSpec(loopDef.targetDuplicate, "targetDuplicate", errors);
      }
      if (loopDef.strategy === "dailyRoutine") {
        validateStringArray(loopDef.steps, "steps", errors, true);
      }
      if (loopDef.strategy === "fillAndVerifySbc") {
        validateStringArray(loopDef.sbcNames, "sbcNames", errors, true);
        if (loopDef.requirements !== void 0) validateRequirements(loopDef.requirements, "requirements", errors, false);
      }
      if (["supplyAndCraft", "inventoryMixedUpgrade", "commonGoldToRareUpgrade"].includes(loopDef.strategy)) {
        validateStringArray(loopDef.sbcNames, "sbcNames", errors, true);
        validateRequirements(loopDef.requirements, "requirements", errors, true);
        if (loopDef.strategy === "supplyAndCraft" || loopDef.strategy === "inventoryMixedUpgrade") {
          validateShortagePacks(loopDef.shortagePacks, "shortagePacks", errors);
        }
      }
      if (loopDef.strategy === "provisionPackCrafting" || loopDef.strategy === "provisionPackDualCrafting") {
        if (!loopDef.sourcePackIds?.length && !loopDef.sourcePackNames?.length) {
          errors.push("sourcePackIds or sourcePackNames is required");
        }
        if (loopDef.craftingUpgrades !== void 0) {
          if (!Array.isArray(loopDef.craftingUpgrades) || !loopDef.craftingUpgrades.length) {
            errors.push("craftingUpgrades must be a non-empty array");
          } else {
            loopDef.craftingUpgrades.forEach((upgradeDef, index) => {
              validateUpgradeDef(upgradeDef, `craftingUpgrades[${index}]`, errors);
            });
          }
        } else {
          const legacyUpgrades = [loopDef.commonUpgrade, loopDef.rareUpgrade].filter((upgradeDef) => upgradeDef !== void 0);
          if (!legacyUpgrades.length) errors.push("craftingUpgrades or a legacy commonUpgrade/rareUpgrade is required");
          if (loopDef.commonUpgrade !== void 0) validateUpgradeDef(loopDef.commonUpgrade, "commonUpgrade", errors);
          if (loopDef.rareUpgrade !== void 0) validateUpgradeDef(loopDef.rareUpgrade, "rareUpgrade", errors);
        }
      }
      if (loopDef.strategy === "rarePackTo84Upgrade") {
        if (!loopDef.sourcePackIds?.length && !loopDef.sourcePackNames?.length) {
          errors.push("sourcePackIds or sourcePackNames is required");
        }
        validateUpgradeDef(loopDef.rareUpgrade, "rareUpgrade", errors);
        if (loopDef.maxPacks !== void 0) {
          const maxPacks = Number(loopDef.maxPacks);
          if (!Number.isFinite(maxPacks) || maxPacks <= 0) {
            errors.push("maxPacks must be a positive number");
          }
        }
      }
      if (loopDef.strategy === "playerPickSbc") {
        validateStringArray(loopDef.sbcNames, "sbcNames", errors, true);
        validateStringArray(loopDef.pickItemNames, "pickItemNames", errors, true);
        const hasChallengeRequirements = loopDef.challengeRequirements !== void 0;
        validateRequirements(loopDef.requirements, "requirements", errors, !hasChallengeRequirements);
        if (hasChallengeRequirements) {
          if (!Array.isArray(loopDef.challengeRequirements) || !loopDef.challengeRequirements.length) {
            errors.push("challengeRequirements must be a non-empty array");
          } else {
            loopDef.challengeRequirements.forEach((requirements, index) => {
              validateRequirements(requirements, `challengeRequirements[${index}]`, errors, true);
            });
          }
        }
        const challengesPerPick = Number(loopDef.challengesPerPick || loopDef.challengeRequirements?.length || 1);
        const pickCount = Number(loopDef.pickCount || 1);
        if (!Number.isInteger(challengesPerPick) || challengesPerPick < 1 || challengesPerPick > 10) {
          errors.push("challengesPerPick must be an integer between 1 and 10");
        }
        if (loopDef.challengesPerPick !== void 0 && Array.isArray(loopDef.challengeRequirements) && loopDef.challengeRequirements.length !== challengesPerPick) {
          errors.push("challengesPerPick must match challengeRequirements.length when both are provided");
        }
        if (!Number.isInteger(pickCount) || pickCount < 1 || pickCount > 10) {
          errors.push("pickCount must be an integer between 1 and 10");
        }
        if (loopDef.pricePlatform !== void 0 && !["pc", "ps", "xbox"].includes(String(loopDef.pricePlatform).toLowerCase())) {
          errors.push("pricePlatform must be pc, ps, or xbox when provided");
        }
      }
      return errors;
    }
    function assertValidLoopDef(loopDef, label = "Loop JSON") {
      const errors = validateLoopDef(loopDef, label);
      if (errors.length) fail(`${label} validation failed:
- ${errors.join("\n- ")}`);
    }
    function validateLoopDefList(loopDefs, label = "Loop config") {
      if (!Array.isArray(loopDefs) || !loopDefs.length) {
        fail(`${label} must be a non-empty array or an object with a loops array`);
      }
      const seen = /* @__PURE__ */ new Set();
      loopDefs.forEach((loopDef, index) => {
        assertValidLoopDef(loopDef, `${label}[${index}]`);
        if (typeof loopDef.id !== "string" || !loopDef.id.trim()) {
          fail(`${label}[${index}].id is required`);
        }
        if (loopDef.id) {
          if (seen.has(loopDef.id)) fail(`${label} has duplicate id: ${loopDef.id}`);
          seen.add(loopDef.id);
        }
      });
      loopDefs.forEach((loopDef, index) => {
        if (!loopDef.preCraftPlayerPickLoopId) return;
        const target = loopDefs.find((candidate) => candidate.id === loopDef.preCraftPlayerPickLoopId);
        if (!target) fail(`${label}[${index}].preCraftPlayerPickLoopId not found: ${loopDef.preCraftPlayerPickLoopId}`);
        if (target.strategy !== "playerPickSbc") {
          fail(`${label}[${index}].preCraftPlayerPickLoopId must reference a playerPickSbc loop`);
        }
      });
    }
    function validateRecoveryAction(value, path, errors) {
      if (value !== void 0 && !["continue", "stop"].includes(value)) {
        errors.push(`${path} must be continue or stop`);
      }
    }
    function validateRecoveryRecipeList(recipes, label = "recoveryRecipes") {
      if (!Array.isArray(recipes)) fail(`${label} must be an array`);
      const seen = /* @__PURE__ */ new Set();
      recipes.forEach((recipe2, index) => {
        const path = `${label}[${index}]`;
        const errors = [];
        if (!isPlainObject(recipe2)) fail(`${path} must be an object`);
        if (typeof recipe2.id !== "string" || !recipe2.id.trim()) errors.push(`${path}.id is required`);
        if (seen.has(recipe2.id)) errors.push(`${label} has duplicate id: ${recipe2.id}`);
        seen.add(recipe2.id);
        validateUpgradeDef(recipe2, path, errors);
        if (recipe2.maxSubmissions !== void 0 && Number(recipe2.maxSubmissions) !== 1) {
          errors.push(`${path}.maxSubmissions must be 1`);
        }
        if (recipe2.mustConsumeTrigger !== true) {
          errors.push(`${path}.mustConsumeTrigger must be true`);
        }
        validateRecoveryAction(recipe2.onUnavailable, `${path}.onUnavailable`, errors);
        validateRecoveryAction(recipe2.onInsufficient, `${path}.onInsufficient`, errors);
        if (recipe2.onBlocked !== void 0 && recipe2.onBlocked !== "stop") {
          errors.push(`${path}.onBlocked must be stop`);
        }
        if (errors.length) fail(`${path} validation failed:
- ${errors.join("\n- ")}`);
      });
    }
    function validateRecoveryPolicyList(policies, recipes, label = "unassignedRecoveryPolicies") {
      if (!Array.isArray(policies)) fail(`${label} must be an array`);
      const recipeIds = new Set(recipes.map((recipe2) => recipe2.id));
      const seen = /* @__PURE__ */ new Set();
      policies.forEach((policy, index) => {
        const path = `${label}[${index}]`;
        const errors = [];
        if (!isPlainObject(policy)) fail(`${path} must be an object`);
        if (typeof policy.id !== "string" || !policy.id.trim()) errors.push(`${path}.id is required`);
        if (seen.has(policy.id)) errors.push(`${label} has duplicate id: ${policy.id}`);
        seen.add(policy.id);
        validateCardSpec(policy.match, `${path}.match`, errors);
        if (!Array.isArray(policy.steps) || !policy.steps.length) {
          errors.push(`${path}.steps must be a non-empty array`);
        } else {
          policy.steps.forEach((step, stepIndex) => {
            const stepPath = `${path}.steps[${stepIndex}]`;
            if (!isPlainObject(step) || typeof step.recipeId !== "string" || !step.recipeId.trim()) {
              errors.push(`${stepPath}.recipeId is required`);
              return;
            }
            if (!recipeIds.has(step.recipeId)) errors.push(`${stepPath}.recipeId not found: ${step.recipeId}`);
            validateRecoveryAction(step.onUnavailable, `${stepPath}.onUnavailable`, errors);
            validateRecoveryAction(step.onInsufficient, `${stepPath}.onInsufficient`, errors);
            if (step.onBlocked !== void 0 && step.onBlocked !== "stop") {
              errors.push(`${stepPath}.onBlocked must be stop`);
            }
          });
        }
        if (errors.length) fail(`${path} validation failed:
- ${errors.join("\n- ")}`);
      });
    }
    function validateRecoveryPolicyIds(ids, policies, path, allowEmpty = true) {
      if (!Array.isArray(ids) || !allowEmpty && !ids.length) fail(`${path} must be an array${allowEmpty ? "" : " with at least one entry"}`);
      const policyIds = new Set(policies.map((policy) => policy.id));
      ids.forEach((id, index) => {
        if (typeof id !== "string" || !id.trim()) fail(`${path}[${index}] must be a non-empty string`);
        if (!policyIds.has(id)) fail(`${path}[${index}] not found: ${id}`);
      });
    }
    function normalizeLoopConfig(config) {
      const input = Array.isArray(config) ? { loops: config } : config;
      if (!isPlainObject(input) || !Array.isArray(input.loops)) {
        fail("Loop config JSON must be an array or an object with a loops array");
      }
      return {
        loops: input.loops,
        recoveryRecipes: input.recoveryRecipes === void 0 ? RECOVERY_RECIPES : input.recoveryRecipes,
        unassignedRecoveryPolicies: input.unassignedRecoveryPolicies === void 0 ? UNASSIGNED_RECOVERY_POLICIES : input.unassignedRecoveryPolicies,
        defaultUnassignedRecoveryPolicyIds: input.defaultUnassignedRecoveryPolicyIds === void 0 ? DEFAULT_UNASSIGNED_RECOVERY_POLICY_IDS : input.defaultUnassignedRecoveryPolicyIds
      };
    }
    function validateLoopConfig(config, label = "Loop config") {
      const normalized = normalizeLoopConfig(config);
      validateLoopDefList(normalized.loops, `${label}.loops`);
      validateRecoveryRecipeList(normalized.recoveryRecipes, `${label}.recoveryRecipes`);
      validateRecoveryPolicyList(normalized.unassignedRecoveryPolicies, normalized.recoveryRecipes, `${label}.unassignedRecoveryPolicies`);
      validateRecoveryPolicyIds(
        normalized.defaultUnassignedRecoveryPolicyIds,
        normalized.unassignedRecoveryPolicies,
        `${label}.defaultUnassignedRecoveryPolicyIds`
      );
      normalized.loops.forEach((loopDef, index) => {
        if (loopDef.unassignedRecoveryPolicyIds === void 0) return;
        validateRecoveryPolicyIds(
          loopDef.unassignedRecoveryPolicyIds,
          normalized.unassignedRecoveryPolicies,
          `${label}.loops[${index}].unassignedRecoveryPolicyIds`
        );
      });
      return normalized;
    }
    function setLoopConfig(config, source = "custom") {
      const normalized = validateLoopConfig(config, source);
      state.loopDefs = cloneLoopDef(normalized.loops);
      state.recoveryRecipes = cloneLoopDef(normalized.recoveryRecipes);
      state.unassignedRecoveryPolicies = cloneLoopDef(normalized.unassignedRecoveryPolicies);
      state.defaultUnassignedRecoveryPolicyIds = [...normalized.defaultUnassignedRecoveryPolicyIds];
      state.loopConfigSource = source;
      renderLoopSelect(state.loopDefs[0]?.id);
      log(`Loaded ${state.loopDefs.length} loop definition(s), ${state.recoveryRecipes.length} recovery recipe(s), and ${state.unassignedRecoveryPolicies.length} recovery policy(s) from ${source}`);
    }
    function setLoopDefs(loopDefs, source = "custom") {
      setLoopConfig({ loops: loopDefs }, source);
    }
    function resetLoopDefs() {
      state.loopDefs = null;
      state.recoveryRecipes = null;
      state.unassignedRecoveryPolicies = null;
      state.defaultUnassignedRecoveryPolicyIds = null;
      state.loopConfigSource = "built-in";
      renderLoopSelect(LOOP_DEFS[0]?.id);
      log(`Using built-in loop definitions (${LOOP_DEFS.length})`);
    }
    function parseLoopConfig(text) {
      return normalizeLoopConfig(JSON.parse(text));
    }
    function requestText(url) {
      if (typeof GM_xmlhttpRequest === "function") {
        return new Promise((resolve, reject) => {
          GM_xmlhttpRequest({
            method: "GET",
            url,
            nocache: true,
            onload: (response) => {
              if (response.status >= 200 && response.status < 300) {
                resolve(response.responseText);
              } else {
                reject(new Error(`HTTP ${response.status}`));
              }
            },
            onerror: () => reject(new Error("request failed")),
            ontimeout: () => reject(new Error("request timed out")),
            timeout: 1e4
          });
        });
      }
      if (typeof W.__FCLoopRunnerRequestText === "function") {
        return W.__FCLoopRunnerRequestText(url);
      }
      return fetch(url, { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      });
    }
    function requestPriceText(url, options = {}) {
      const headers = {
        Accept: "application/json, text/plain, */*",
        ...options.headers || {}
      };
      if (typeof GM_xmlhttpRequest === "function") {
        return new Promise((resolve, reject) => {
          GM_xmlhttpRequest({
            method: "GET",
            url,
            headers,
            anonymous: options.sendCookies === true ? false : true,
            nocache: true,
            onload: (response) => {
              if (response.status >= 200 && response.status < 300) resolve(response.responseText);
              else reject(new Error(`HTTP ${response.status}`));
            },
            onerror: () => reject(new Error("request failed")),
            ontimeout: () => reject(new Error("request timed out")),
            timeout: 1e4
          });
        });
      }
      return fetch(url, { cache: "no-store", headers, credentials: options.sendCookies ? "include" : "omit" }).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      });
    }
    async function loadLoopConfig(url = LOOP_CONFIG_URL) {
      const text = await requestText(`${url}?t=${Date.now()}`);
      const config = parseLoopConfig(text);
      setLoopConfig(config, url);
    }
    function applyDisabledPilesToList(piles, disabledPiles, path) {
      if (!Array.isArray(piles) || !piles.length || !disabledPiles?.size) return piles;
      const filtered = piles.filter((pile) => !disabledPiles.has(pile));
      if (!filtered.length) fail(`${path} has no enabled piles after disabledPiles`);
      return filtered;
    }
    function applyDisabledPilesToRequirements(requirements, disabledPiles, path) {
      if (!Array.isArray(requirements)) return;
      requirements.forEach((requirement, index) => {
        requirement.priorityPiles = applyDisabledPilesToList(
          requirement.priorityPiles,
          disabledPiles,
          `${path}[${index}].priorityPiles`
        );
      });
    }
    function applyDisabledPiles(loopDef) {
      const disabledPiles = new Set(loopDef.disabledPiles || []);
      if (!disabledPiles.size) return loopDef;
      loopDef.priorityPiles = applyDisabledPilesToList(loopDef.priorityPiles, disabledPiles, "priorityPiles");
      loopDef.primaryPiles = applyDisabledPilesToList(loopDef.primaryPiles, disabledPiles, "primaryPiles");
      loopDef.clubFallbackPiles = applyDisabledPilesToList(loopDef.clubFallbackPiles, disabledPiles, "clubFallbackPiles");
      if (isPlainObject(loopDef.ratingSbcFill)) {
        loopDef.ratingSbcFill.priorityPiles = applyDisabledPilesToList(
          loopDef.ratingSbcFill.priorityPiles,
          disabledPiles,
          "ratingSbcFill.priorityPiles"
        );
      }
      applyDisabledPilesToRequirements(loopDef.requirements, disabledPiles, "requirements");
      (loopDef.challengeRequirements || []).forEach((requirements, index) => {
        applyDisabledPilesToRequirements(requirements, disabledPiles, `challengeRequirements[${index}]`);
      });
      for (const upgradeName of ["commonUpgrade", "rareUpgrade"]) {
        const upgradeDef = loopDef[upgradeName];
        if (!isPlainObject(upgradeDef)) continue;
        upgradeDef.priorityPiles = applyDisabledPilesToList(upgradeDef.priorityPiles, disabledPiles, `${upgradeName}.priorityPiles`);
        applyDisabledPilesToRequirements(upgradeDef.requirements, disabledPiles, `${upgradeName}.requirements`);
        (upgradeDef.challengeRequirements || []).forEach((requirements, index) => {
          applyDisabledPilesToRequirements(requirements, disabledPiles, `${upgradeName}.challengeRequirements[${index}]`);
        });
      }
      (loopDef.craftingUpgrades || []).forEach((upgradeDef, index) => {
        if (!isPlainObject(upgradeDef)) return;
        upgradeDef.priorityPiles = applyDisabledPilesToList(upgradeDef.priorityPiles, disabledPiles, `craftingUpgrades[${index}].priorityPiles`);
        applyDisabledPilesToRequirements(upgradeDef.requirements, disabledPiles, `craftingUpgrades[${index}].requirements`);
        (upgradeDef.challengeRequirements || []).forEach((requirements, challengeIndex) => {
          applyDisabledPilesToRequirements(requirements, disabledPiles, `craftingUpgrades[${index}].challengeRequirements[${challengeIndex}]`);
        });
      });
      return loopDef;
    }
    function getSelectedLoopDef() {
      const select = document.querySelector("#bronze-loop-select");
      const selectedId = select?.value || getVisibleLoopDefs()[0]?.id || LOOP_DEFS[0].id;
      if (selectedId === "custom") {
        const text = document.querySelector("#bronze-loop-json")?.value || "";
        try {
          const parsed = JSON.parse(text);
          assertValidLoopDef(parsed, "Custom loop JSON");
          return applyDisabledPiles(parsed);
        } catch (e) {
          if (e instanceof SyntaxError) fail(`Invalid custom loop JSON: ${e.message || e}`);
          throw e;
        }
      }
      const loopDef = cloneLoopDef(getLoopDefById(selectedId));
      assertValidLoopDef(loopDef, loopDef.name || selectedId);
      return applyDisabledPiles(loopDef);
    }
    function setLoopJson(def) {
      const editor = document.querySelector("#bronze-loop-json");
      if (editor) editor.value = JSON.stringify(def, null, 2);
    }
    function renderLoopSelect(selectedId = null) {
      const select = document.querySelector("#bronze-loop-select");
      if (!select) return;
      const previous = selectedId || select.value;
      select.textContent = "";
      for (const def of getVisibleLoopDefs()) {
        const option = document.createElement("option");
        option.value = def.id;
        option.textContent = def.name;
        select.appendChild(option);
      }
      const custom = document.createElement("option");
      custom.value = "custom";
      custom.textContent = "Custom JSON";
      select.appendChild(custom);
      const nextValue = Array.from(select.options).some((option) => option.value === previous) ? previous : getVisibleLoopDefs()[0]?.id;
      if (nextValue) select.value = nextValue;
      if (select.value !== "custom") setLoopJson(getLoopDefById(select.value));
      updateLoopControls();
    }
    function getEditorLoopDef() {
      const selectedId = document.querySelector("#bronze-loop-select")?.value || getVisibleLoopDefs()[0]?.id || LOOP_DEFS[0].id;
      if (selectedId !== "custom") return getLoopDefById(selectedId);
      try {
        return JSON.parse(document.querySelector("#bronze-loop-json")?.value || "{}");
      } catch {
        return {};
      }
    }
    function getEditorLoopStrategy() {
      return getEditorLoopDef()?.strategy || "";
    }
    function updateLoopControls() {
      const roundsRow = document.querySelector("#bronze-loop-rounds-row");
      const roundsLabel = document.querySelector("#bronze-loop-rounds-label");
      const roundsInput = document.querySelector("#bronze-loop-rounds");
      if (!roundsLabel || !roundsInput) return;
      const editorLoop = getEditorLoopDef();
      const showRounds = editorLoop.useRoundsAsCompletions === true || ["validationBronzeUpgrade", "provisionPackCrafting", "provisionPackDualCrafting", "playerPickSbc"].includes(editorLoop.strategy);
      if (roundsRow) roundsRow.style.display = showRounds ? "" : "none";
      roundsLabel.style.display = showRounds ? "" : "none";
      roundsInput.style.display = showRounds ? "" : "none";
    }
    function updateRecapButton() {
      const btn = document.querySelector("#bronze-loop-recap-reopen");
      if (!btn) return;
      const recap = state.lastPickRecap;
      btn.style.display = recap ? "" : "none";
      if (recap) {
        const totalCards = (recap.pickResults || []).reduce(
          (sum, entry) => sum + (entry?.pickedCards || entry?.pickedItems || []).length,
          0
        );
        btn.title = `Last Player Pick recap: ${recap.name} (${totalCards} card(s))`;
      }
    }
    async function reopenLastPickRecap() {
      const btn = document.querySelector("#bronze-loop-recap-reopen");
      const existing = document.querySelector("#bronze-loop-recap-modal");
      if (existing) {
        existing.remove();
        if (btn) {
          btn.textContent = "View recap";
          btn.style.background = "";
        }
        return;
      }
      const recap = state.lastPickRecap;
      if (!recap) {
        log("No previous Player Pick recap available");
        return;
      }
      await showPickRecapModal({ name: recap.name }, recap.pickResults);
      if (btn && document.querySelector("#bronze-loop-recap-modal")) {
        btn.textContent = "Hide recap";
        btn.style.background = "#b13b3b";
      }
    }
    function fail(message) {
      throw new Error(message);
    }
    function stopPoint() {
      if (state.stopping) fail("Stopped by user");
    }
    function matchesAny(text, patterns) {
      const list = Array.isArray(patterns) ? patterns : patterns === void 0 || patterns === null ? [] : [patterns];
      if (!list.length) return false;
      const safeText = String(text || "").toLowerCase();
      return list.some((p) => safeText.includes(String(p).toLowerCase()));
    }
    function errorStackLines(error, limit = 4) {
      const stack = String(error?.stack || "").split("\n").map((line) => line.trim()).filter(Boolean);
      return stack.slice(1, Math.max(1, limit + 1));
    }
    function localize(value) {
      try {
        if (W.services?.Localization && value) {
          return W.services.Localization.localize(value);
        }
      } catch {
      }
      return String(value || "");
    }
    function packName(pack) {
      return localize(pack?.packName) || localize(pack?.name) || String(pack?.packName || pack?.name || pack?.id || "");
    }
    function uniquePacks(packs) {
      const byId = /* @__PURE__ */ new Map();
      for (const pack of packs || []) {
        const key = packIdKey(pack);
        if (!key) continue;
        const existing = byId.get(key);
        if (!existing || typeof pack?.open === "function" && typeof existing?.open !== "function") {
          byId.set(key, pack);
        }
      }
      return Array.from(byId.values());
    }
    function collectPackLikeObjects(value, out = [], depth = 0, seen = /* @__PURE__ */ new WeakSet()) {
      if (!value || depth > 5) return out;
      if (typeof value !== "object") return out;
      if (seen.has(value)) return out;
      seen.add(value);
      if (Array.isArray(value)) {
        value.slice(0, 200).forEach((entry) => collectPackLikeObjects(entry, out, depth + 1, seen));
        return out;
      }
      const id = packIdKey(value);
      const hasPackShape = id && (typeof value.open === "function" || value.packName !== void 0 || value.packId !== void 0 || value.packType !== void 0 || value.packDefinitionId !== void 0 || value.packAssetId !== void 0);
      if (hasPackShape) out.push(value);
      for (const child of Object.values(value).slice(0, 80)) {
        collectPackLikeObjects(child, out, depth + 1, seen);
      }
      return out;
    }
    function observeOnce(observable, controller, timeoutMs = 2e4, label = "observable") {
      return new Promise((resolve, reject) => {
        let done = false;
        const tid = setTimeout(() => {
          if (done) return;
          done = true;
          reject(new Error(`${label} timed out`));
        }, timeoutMs);
        try {
          observable.observe(controller || ctrl(), (sender, result) => {
            if (done) return;
            done = true;
            clearTimeout(tid);
            try {
              sender?.unobserve?.(controller || ctrl());
            } catch {
            }
            resolve(result);
          });
        } catch (e) {
          clearTimeout(tid);
          reject(e);
        }
      });
    }
    function ctrl() {
      try {
        return W.getAppMain().getRootViewController().getPresentedViewController().getCurrentViewController().getCurrentController();
      } catch {
        return null;
      }
    }
    async function waitFor(predicate, timeoutMs = 15e3, label = "condition") {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        stopPoint();
        try {
          const value = predicate();
          if (value) return value;
        } catch {
        }
        await sleep(250);
      }
      fail(`Timed out waiting for ${label}`);
    }
    async function waitAppReady() {
      await waitFor(
        () => isFutAppReady(),
        3e4,
        "FUT main UI"
      );
    }
    async function waitLoadingEnd(stableMs = 700, timeoutMs = 3e4) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        stopPoint();
        const shield = W.gClickShield;
        if (!shield || !shield.isShowing || !shield.isShowing()) {
          await sleep(stableMs);
          if (!shield || !shield.isShowing || !shield.isShowing()) return true;
        }
        await sleep(250);
      }
      log("Loading shield wait timed out; continuing");
      return false;
    }
    function areFutServicesReady() {
      return !!(W.services?.Store && W.services?.SBC && W.services?.Item && W.repositories?.Store && W.repositories?.Item);
    }
    function hasFutMainDom() {
      return [
        ".ut-tab-bar-item.icon-home",
        ".ut-navigation-container-view--content",
        ".ut-navigation-container-view",
        ".ut-navigation-bar-view",
        ".ut-tab-bar",
        ".ut-home-hub-view",
        ".ut-store-hub-view",
        ".ut-sbc-hub-view",
        ".ut-sbc-set-view",
        ".ut-sbc-challenges-view",
        ".ut-squad-hub-view",
        ".ut-club-view",
        ".ut-transfer-list-view",
        ".ut-unassigned-items-view"
      ].some((selector) => document.querySelector(selector));
    }
    function currentControllerName() {
      const controller = ctrl();
      return String(controller?.className || controller?.constructor?.name || "");
    }
    function isMainFutControllerName(name) {
      return /^UT(Home|Store|SBC|Squad|Club|Transfer|Unassigned|Evolutions|Objectives|Market|Pack)/.test(name) && !/Loading|Splash|Login|Preload|Startup/i.test(name);
    }
    function isFutAppReady() {
      return areFutServicesReady() && (hasFutMainDom() || isMainFutControllerName(currentControllerName()));
    }
    async function refreshStorePacks() {
      const controller = ctrl();
      const result = await observeOnce(
        W.services.Store.getPacks(W.PurchasePackType.ALL, true, true),
        controller,
        3e4,
        "Store.getPacks"
      );
      if (!result?.success) fail(`Store pack refresh failed: ${result?.error?.code || result?.status || "unknown"}`);
      state.lastStorePacks = uniquePacks([
        ...getRepositoryMyPacks(),
        ...collectPackLikeObjects(result),
        ...state.lastStorePacks || []
      ]).slice(0, 200);
      return result;
    }
    function mergeStorePacksFromController(controller = ctrl()) {
      const packs = uniquePacks([
        ...collectPackLikeObjects(controller),
        ...getRepositoryMyPacks(),
        ...state.lastStorePacks || []
      ]).slice(0, 300);
      if (packs.length) state.lastStorePacks = packs;
      return packs.length;
    }
    async function openStorePacksViewForRefresh(label = "reward pack lookup") {
      const before = currentControllerName();
      if (before !== "UTStorePackViewController") {
        const storeTab = document.querySelector(".ut-tab-bar-item.icon-store");
        if (!storeTab) return false;
        log(`${label}: opening Store to refresh visible packs`);
        simulateClick(storeTab);
        await waitLoadingEnd(700, 15e3);
        await sleep(800);
      }
      if (currentControllerName() !== "UTStorePackViewController") {
        const packTile = Array.from(document.querySelectorAll(".packs-tile, .ut-store-pack-tile-view, .tile.packs, .tile, .ut-store-tile-view, .store-tile, .tile-container")).filter(isClickableElement).find((el) => {
          const text = compactText(el);
          const classes = String(el.className || "");
          return /packs-tile|store-pack|tile\.packs/i.test(classes) || matchesAny(text, ["Packs", "My Packs", "\u5305"]);
        });
        if (packTile) {
          log(`${label}: opening Store Packs view`);
          simulateClick(packTile);
          await waitLoadingEnd(700, 15e3);
          await sleep(900);
        }
      }
      const controller = ctrl();
      if (currentControllerName() === "UTStorePackViewController") {
        try {
          const result = controller?.getStorePacks?.(true);
          await awaitMaybeObservable(result, "UTStorePackViewController.getStorePacks", 15e3).catch(() => null);
        } catch {
        }
        await refreshStorePacks().catch(() => null);
        const count = mergeStorePacksFromController(controller);
        log(`${label}: Store Packs view refreshed; visible pack cache ${count || getMyPacks().length}`);
        return true;
      }
      return false;
    }
    function serviceResultErrorText(result, fallback = "unknown") {
      return result?.error?.code || result?.error?.message || result?.message || result?.status || fallback;
    }
    async function refreshUnassigned(options = {}) {
      const attempts = Math.max(1, Math.min(5, Number(options.attempts ?? 3) || 3));
      const allowCacheFallback = options.allowCacheFallback !== false;
      const quiet = options.quiet === true;
      let lastError = "";
      for (let attempt = 1; attempt <= attempts; attempt++) {
        stopPoint();
        await waitLoadingEnd(250, attempt === 1 ? 6e3 : 12e3).catch(() => null);
        const controller = ctrl();
        try {
          const result = await observeOnce(
            W.services.Item.requestUnassignedItems(),
            controller,
            2e4,
            "requestUnassignedItems"
          );
          if (result?.success) {
            clearConsumedDuplicateSignals(
              [...state.pendingConsumedDuplicateSignals.values()],
              "Unassigned refresh",
              { quiet }
            );
            return result;
          }
          lastError = serviceResultErrorText(result);
        } catch (e) {
          lastError = e?.message || String(e || "unknown");
        }
        if (attempt < attempts) {
          if (!quiet) log(`Unassigned refresh failed (${lastError || "unknown"}); retrying ${attempt + 1}/${attempts}`);
          await sleep(700 * attempt);
        }
      }
      if (allowCacheFallback) {
        const cachedCount = getUnassignedItems().length;
        clearConsumedDuplicateSignals(
          [...state.pendingConsumedDuplicateSignals.values()],
          "Unassigned cache fallback",
          { quiet }
        );
        if (!quiet) log(`Unassigned refresh failed after ${attempts} attempt(s): ${lastError || "unknown"}; using existing cache (${cachedCount} item(s))`);
        return { success: false, cachedFallback: true, cachedCount, error: { message: lastError || "unknown" } };
      }
      fail(`Unassigned refresh failed: ${lastError || "unknown"}`);
    }
    function cacheSummary() {
      return [
        `packs:${getMyPacks().length}`,
        `unassigned:${getUnassignedItems().length}`,
        `storage:${getStorageItems().length}`,
        `transfer:${getTransferItems().length}`,
        `club:${getClubItems().length}`
      ].join(", ");
    }
    async function awaitMaybeObservable(value, label, timeoutMs = 2e4) {
      if (!value) return { success: true, skipped: true };
      if (typeof value.observe === "function") {
        return observeOnce(value, ctrl(), timeoutMs, label);
      }
      if (typeof value.then === "function") {
        return value;
      }
      return value;
    }
    async function tryOptionalRefresh(label, action2, options = {}) {
      const quiet = options.quiet === true;
      try {
        const result = await awaitMaybeObservable(action2(), label, options.timeoutMs || 2e4);
        if (result?.success === false) {
          const code = result?.error?.code || result?.status || "unknown";
          if (!quiet) log(`${label} refresh failed: ${code}`);
          return false;
        }
        if (!quiet) log(`${label} refreshed`);
        return true;
      } catch (e) {
        if (!quiet) log(`${label} refresh skipped: ${e.message || e}`);
        return false;
      }
    }
    async function refreshPileCacheByCandidates(pileName, pile, specificNames, options = {}) {
      const itemService = W.services?.Item || {};
      for (const methodName of specificNames) {
        if (typeof itemService[methodName] !== "function") continue;
        const ok = await tryOptionalRefresh(`Item.${methodName}`, () => itemService[methodName](), options);
        if (ok) return true;
      }
      const genericNames = [
        "requestItems",
        "requestPileItems",
        "requestItemsForPile",
        "requestItemsByPile"
      ];
      for (const methodName of genericNames) {
        if (typeof itemService[methodName] !== "function") continue;
        const ok = await tryOptionalRefresh(`${pileName} via Item.${methodName}`, () => itemService[methodName](pile), options);
        if (ok) return true;
      }
      if (!options.quiet) log(`${pileName} cache refresh method not available; using existing cache`);
      return false;
    }
    async function refreshInventoryCaches(reason = "manual refresh", options = {}) {
      await waitAppReady();
      const quiet = options.quiet === true;
      if (!quiet) log(`Refreshing caches: ${reason}`);
      if (options.includePacks !== false) {
        await refreshStorePacks().catch((e) => {
          if (!quiet) log(`Store pack refresh skipped: ${e.message || e}`);
        });
      }
      await refreshUnassigned({ quiet }).catch((e) => {
        if (!quiet) log(`Unassigned refresh skipped: ${e.message || e}`);
      });
      await refreshPileCacheByCandidates("club", W.ItemPile.CLUB, ["requestClubItems"], options);
      await refreshPileCacheByCandidates("storage", W.ItemPile.STORAGE, ["requestStorageItems", "requestSBCStorageItems"], options);
      await refreshPileCacheByCandidates("transfer", W.ItemPile.TRANSFER, ["requestTransferItems"], options);
      if (!quiet) {
        log(`Cache summary: ${cacheSummary()}`);
        log(`My Packs inventory: ${formatPackInventorySnapshot(getPackInventorySnapshot()) || "none"}`);
      }
    }
    function getUnassignedItems() {
      try {
        return W.repositories.Item.getUnassignedItems() || [];
      } catch {
        return [];
      }
    }
    function getRepositoryMyPacks() {
      const repo = W.repositories?.Store?.myPacks || W.services?.Store?.storeDao?.storeRepo?.myPacks;
      if (!repo) return [];
      if (typeof repo.values === "function") return Array.from(repo.values());
      if (Array.isArray(repo._collection)) return repo._collection;
      if (repo._collection && typeof repo._collection === "object") return Object.values(repo._collection);
      return [];
    }
    function getAvailableRepositoryMyPacks() {
      return getRepositoryMyPacks().filter((pack) => !isStalePack(pack));
    }
    function getMyPacks() {
      const instances = getAvailableRepositoryMyPacks();
      const repositoryTypeIds = new Set(instances.map(packIdKey).filter(Boolean));
      const fallbackTypes = uniquePacks(state.lastStorePacks || []).filter((pack) => !repositoryTypeIds.has(packIdKey(pack)) && !isStalePack(pack));
      return [...instances, ...fallbackTypes];
    }
    function packIdKey(packOrId) {
      const id = typeof packOrId === "object" ? packOrId?.id ?? packOrId?.packId ?? packOrId?.packDefinitionId ?? packOrId?.packAssetId : packOrId;
      const numeric = Number(id);
      return Number.isFinite(numeric) && numeric > 0 ? String(numeric) : "";
    }
    function isStalePack(pack) {
      try {
        return !!pack && state.stalePackRefs.has(pack);
      } catch {
        return false;
      }
    }
    function markStalePack(pack) {
      try {
        if (pack && typeof pack === "object") state.stalePackRefs.add(pack);
      } catch {
      }
    }
    function getAvailableMyPacks() {
      return getMyPacks().filter((pack) => !isStalePack(pack));
    }
    function findPackByName(patterns) {
      const packs = getAvailableMyPacks();
      return packs.find((p) => matchesAny(packName(p), patterns));
    }
    function findPackById(packId2) {
      if (!packId2) return null;
      return getAvailableMyPacks().find((p) => packIdKey(p) === packIdKey(packId2));
    }
    function isLikelyTotwRewardPack(pack) {
      const id = Number(packIdKey(pack) || 0);
      if ([20707, 20441].includes(id)) return true;
      const name = packName(pack);
      return /\bTOTW\b/i.test(name) && /(84\+|1-30|player|pack|provision|refresh)/i.test(name);
    }
    function findPackByPredicate(predicate) {
      if (typeof predicate !== "function") return null;
      return getAvailableMyPacks().find((pack) => {
        try {
          return !!predicate(pack);
        } catch {
          return false;
        }
      }) || null;
    }
    function summarizePacks(packs = getAvailableMyPacks()) {
      const counts = /* @__PURE__ */ new Map();
      for (const pack of packs) {
        const key = `${packName(pack)} (#${packIdKey(pack) || pack.id || "?"})`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, count]) => `${name} x${count}`).join(", ");
    }
    function getPackInventorySnapshot() {
      const instances = getAvailableRepositoryMyPacks();
      const groups = /* @__PURE__ */ new Map();
      for (const pack of instances) {
        const id = packIdKey(pack) || "?";
        const name = packName(pack) || String(id);
        const key = id === "?" ? `name:${name}` : `id:${id}`;
        const group = groups.get(key) || { id: id === "?" ? null : Number(id), name, count: 0 };
        group.count++;
        groups.set(key, group);
      }
      return {
        total: instances.length,
        groups: Array.from(groups.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      };
    }
    function formatPackInventorySnapshot(snapshot = getPackInventorySnapshot()) {
      return (snapshot?.groups || []).map((group) => `${group.name} (#${group.id || "?"}) x${group.count}`).join(", ");
    }
    function getPackCountsById(packs = getAvailableRepositoryMyPacks()) {
      const counts = /* @__PURE__ */ new Map();
      for (const pack of packs) {
        const id = packIdKey(pack);
        if (id) counts.set(id, (counts.get(id) || 0) + 1);
      }
      return counts;
    }
    async function moveItems(items, pile, allowStorage = true) {
      if (!items?.length) return null;
      const result = await observeOnce(
        W.services.Item.move(items, pile, allowStorage),
        ctrl(),
        25e3,
        `moveItems(${pile})`
      );
      if (!result?.success) fail(`Move failed: ${result?.error?.code || result?.status || "unknown"}`);
      await waitLoadingEnd();
      return result;
    }
    function isPlayer(item) {
      return item?.type === "player" || item?.isPlayer?.();
    }
    function isBronze(item) {
      try {
        if (item?.isBronzeRating?.()) return true;
      } catch {
      }
      return Number(item?.rating || 0) > 0 && Number(item.rating) <= 64;
    }
    function isSilver(item) {
      try {
        if (item?.isSilverRating?.()) return true;
      } catch {
      }
      const rating = Number(item?.rating || 0);
      return rating >= 65 && rating <= 74;
    }
    function isGold(item) {
      try {
        if (item?.isGoldRating?.()) return true;
      } catch {
      }
      return Number(item?.rating || 0) >= 75;
    }
    function isProtectedHighGold(item) {
      return isGold(item) && Number(item?.rating || 0) >= 82;
    }
    function isRare(item) {
      try {
        return !!item?.isRare?.();
      } catch {
      }
      return Number(item?.rareflag || item?.rareFlag || 0) > 0;
    }
    function isSpecial(item) {
      try {
        return !!item?.isSpecial?.();
      } catch {
      }
      const rareflag = Number(item?.rareflag || item?.rareFlag || item?._rareflag || 0);
      return rareflag > 1;
    }
    function isNormalGoldFodder(item) {
      return isGold(item) && !isSbcSpecialItem(item);
    }
    function itemMatchesSpec(item, spec = {}, settings = getFsuSettings()) {
      if (spec.playerOnly && !isPlayer(item)) return false;
      const rating = Number(item?.rating || 0);
      if (spec.minRating !== void 0 && rating < Number(spec.minRating)) return false;
      if (spec.maxRating !== void 0 && rating > Number(spec.maxRating)) return false;
      if (spec.blockTradeable === true && isTradeable(item) && !isNormalGoldFodder(item)) return false;
      if (spec.special === true && !isSpecial(item)) return false;
      if (spec.special === false && isSpecial(item)) return false;
      if (spec.special !== true && spec.allowSpecial !== true && isSpecial(item)) return false;
      if (settings.useRarityPlayer === false && spec.special !== true && spec.allowSpecial !== true && isSpecial(item)) return false;
      if (spec.tier === "bronze" && !isBronze(item)) return false;
      if (spec.tier === "silver" && !isSilver(item)) return false;
      if (spec.tier === "gold" && !isGold(item)) return false;
      if (spec.rarity === "rare" && !isRare(item)) return false;
      if (spec.rarity === "common" && isRare(item)) return false;
      return true;
    }
    function isTargetDuplicate(item, loopDef) {
      const spec = loopDef?.targetDuplicate || {};
      return isDuplicate(item) && isSbcUsablePlayer(item, spec) && itemMatchesSpec(item, spec);
    }
    function isDuplicate(item) {
      try {
        return !!item?.isDuplicate?.();
      } catch {
        return !!item?.duplicateId;
      }
    }
    function isTradeable(item) {
      try {
        if (typeof item?.isUntradeable === "function") return !item.isUntradeable();
      } catch {
      }
      if (item?.untradeable === true) return false;
      if (item?.untradeable === false) return true;
      if (item?.untradeableCount !== void 0) return Number(item.untradeableCount || 0) === 0;
      return false;
    }
    function callItemBooleanMethod(item, methodNames = []) {
      for (const name of methodNames) {
        try {
          if (typeof item?.[name] === "function" && isExplicitTrue(item[name]())) return true;
        } catch {
        }
      }
      return false;
    }
    function isExplicitTrue(value) {
      if (value === true || value === 1) return true;
      if (typeof value !== "string") return false;
      return ["true", "1", "yes", "on", "enabled", "enable"].includes(value.trim().toLowerCase());
    }
    function itemFieldValues(item, keys = []) {
      const holders = [
        item,
        safeReadField(item, "_data"),
        safeReadField(item, "_staticData"),
        safeReadField(item, "assetData"),
        safeReadField(item, "_assetData")
      ];
      const values = [];
      for (const holder of holders) {
        if (!holder || typeof holder !== "object") continue;
        for (const key of keys) values.push(safeReadField(holder, key));
      }
      return values;
    }
    function isLoanItem(item) {
      if (callItemBooleanMethod(item, ["isLoan", "isLoanItem", "isLoanPlayer"])) return true;
      const explicitLoanFlags = itemFieldValues(item, ["isLoan", "isLoanItem", "isLoanPlayer"]);
      for (const value of explicitLoanFlags) {
        if (typeof value === "function" || value === void 0 || value === null || value === "") continue;
        if (isExplicitTrue(value)) return true;
      }
      for (const value of itemFieldValues(item, ["loans"])) {
        if (typeof value === "function" || value === void 0 || value === null || value === "") continue;
        if (typeof value === "boolean") {
          if (value) return true;
          continue;
        }
        const num = Number(value);
        if (Number.isFinite(num) && num >= 0) return true;
      }
      return false;
    }
    function isLimitedUseItem(item) {
      if (isLoanItem(item)) return true;
      if (callItemBooleanMethod(item, ["isLimitedUse"])) return true;
      for (const value of itemFieldValues(item, ["limitedUse", "isLimitedUse", "limitedUses"])) {
        if (typeof value === "function" || value === void 0 || value === null || value === "") continue;
        if (isExplicitTrue(value)) return true;
        const num = Number(value);
        if (Number.isFinite(num) && num > 0) return true;
      }
      return false;
    }
    function isConceptItem(item) {
      if (callItemBooleanMethod(item, ["isConcept", "isConceptItem", "isConceptPlayer"])) return true;
      for (const value of itemFieldValues(item, [
        "concept",
        "isConcept",
        "conceptItem",
        "conceptPlayer",
        "isConceptItem",
        "isConceptPlayer",
        "itemState",
        "state",
        "status",
        "cardType"
      ])) {
        if (typeof value === "function" || value === void 0 || value === null || value === "") continue;
        const bool = boolFromAny(value);
        if (bool === true) return true;
        if (bool === false) continue;
        if (typeof value === "string" && /\bconcept\b/i.test(value)) return true;
      }
      return false;
    }
    function boolFromAny(value) {
      if (typeof value === "boolean") return value;
      if (typeof value === "number" && Number.isFinite(value)) return value !== 0;
      if (typeof value === "string") {
        const text = value.trim().toLowerCase();
        if (["true", "1", "yes", "on", "enabled", "enable"].includes(text)) return true;
        if (["false", "0", "no", "off", "disabled", "disable"].includes(text)) return false;
      }
      return null;
    }
    const FSU_SETTING_ALIASES = {
      ignorePlayerPosition: [/ignore.*player.*position/i, /ignore.*position/i, /忽略.*位置/],
      onlyUntradeable: [/only.*untrad/i, /untrad.*only/i, /仅.*不可交易/, /只.*不可交易/],
      excludeDesignatedLeagues: [/exclude.*designated.*league/i, /exclude.*league/i, /排除.*联赛/, /排除.*聯賽/],
      useRarityPlayer: [/use.*rarity.*player/i, /rarity.*player/i, /使用.*稀有/, /使用.*特殊/],
      excludeEvolution: [/exclude.*evo/i, /exclude.*evolution/i, /排除.*进化/, /排除.*進化/],
      playerPickStrictCommonRare: [/player.*pick.*strict/i, /strictly.*common.*rare/i, /球员选择.*严格/, /球員選擇.*嚴格/],
      priorityRareWithinGoldRange: [/priority.*rare.*gold.*range/i, /rare.*within.*gold.*range/i, /golden.*player.*range/i, /稀有.*金/],
      priorityNonSpecialPlayers: [/priority.*non.*special/i, /non.*special.*player/i, /优先.*非.*特殊/, /優先.*非.*特殊/],
      priorityStoragePlayers: [/priority.*storage/i, /storage.*player/i, /优先.*仓库/, /優先.*倉庫/, /storage.*priority/i],
      silverBronzePrioritizeNormal: [/silver.*bronze.*normal/i, /quality.*prioritize.*normal/i, /银.*铜.*普通/, /銀.*銅.*普通/]
    };
    const ITEM_ID_FIELD_ALIASES = Object.freeze([
      "id",
      "itemId",
      "itemid",
      "itemID",
      "instanceId",
      "instanceid",
      "resourceId",
      "resourceid",
      "resourceID",
      "cardId",
      "cardid",
      "cardID",
      "playerId",
      "playerid",
      "playerID",
      "guidAssetId",
      "guidassetid",
      "guidAssetID"
    ]);
    const DEFINITION_ID_FIELD_ALIASES = Object.freeze([
      "definitionId",
      "definitionid",
      "definitionID",
      "defId",
      "defid",
      "defID",
      "assetId",
      "assetid",
      "assetID",
      "_assetId",
      "_assetid",
      "_assetID",
      "baseId",
      "baseid",
      "baseID",
      "baseResourceId",
      "baseResourceID",
      "resourceId",
      "resourceid",
      "resourceID",
      "guidAssetId",
      "guidassetid",
      "guidAssetID"
    ]);
    const ITEM_IDENTITY_FIELD_ALIASES = Object.freeze(
      [.../* @__PURE__ */ new Set([...ITEM_ID_FIELD_ALIASES, ...DEFINITION_ID_FIELD_ALIASES])]
    );
    const ITEM_IDENTITY_HOLDER_FIELDS = Object.freeze([
      "_data",
      "data",
      "_staticData",
      "staticData",
      "assetData",
      "_assetData",
      "_item",
      "item",
      "_player",
      "player",
      "raw",
      "rawData",
      "_rawData"
    ]);
    function aliasMatches(path, aliases) {
      return aliases.some((pattern) => pattern.test(path));
    }
    function isInspectableObject(value) {
      if (!value || typeof value !== "object") return false;
      if (value === W || value === document || value === document.body) return false;
      const tag = Object.prototype.toString.call(value);
      return tag === "[object Object]" || tag === "[object Array]";
    }
    function flattenConfigValues(value, path = "", rows = [], depth = 0, seen = /* @__PURE__ */ new WeakSet()) {
      if (value === null || value === void 0 || depth > 5) return rows;
      if (typeof value !== "object") {
        rows.push({ path, value });
        return rows;
      }
      if (!isInspectableObject(value) || seen.has(value)) return rows;
      seen.add(value);
      const keys = Array.isArray(value) ? value.map((_, index) => String(index)) : Object.keys(value);
      for (const key of keys.slice(0, 250)) {
        let child;
        try {
          child = value[key];
        } catch {
          continue;
        }
        const nextPath = path ? `${path}.${key}` : key;
        if (isInspectableObject(child)) {
          flattenConfigValues(child, nextPath, rows, depth + 1, seen);
        } else {
          rows.push({ path: nextPath, value: child });
        }
      }
      return rows;
    }
    function parseJsonMaybe(value) {
      if (typeof value !== "string") return null;
      const text = value.trim();
      if (!text || !["{", "["].includes(text[0])) return null;
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    }
    function numberListFromAny(value) {
      if (Array.isArray(value)) {
        return value.flatMap((entry) => numberListFromAny(entry)).filter((entry, index, arr) => Number.isFinite(entry) && arr.indexOf(entry) === index);
      }
      if (typeof value === "number" && Number.isFinite(value)) return [Number(value)];
      if (typeof value === "string") {
        return (value.match(/\d+/g) || []).map(Number).filter(Number.isFinite);
      }
      if (isInspectableObject(value)) {
        return flattenConfigValues(value).flatMap((row) => numberListFromAny(row.value)).filter((entry, index, arr) => Number.isFinite(entry) && arr.indexOf(entry) === index);
      }
      return [];
    }
    function uniqueNumberList(values = []) {
      return values.map(Number).filter((value) => Number.isFinite(value) && value > 0).filter((value, index, arr) => arr.indexOf(value) === index);
    }
    function isLikelyLockedPlayerPath(path = "") {
      const text = String(path || "");
      if (!text || /unlock/i.test(text)) return false;
      const compact = text.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (/((lock|locked)players?|players?(lock|locked)|(lock|locked)cards?|cards?(lock|locked)|(lock|locked)items?|items?(lock|locked)|protectedplayers?|protectedcards?|protecteditems?)/i.test(compact)) {
        return true;
      }
      if (/(^|[._\-\s])(lock|locked|protect|protected)([._\-\s]|$)/i.test(text)) {
        return /player|card|item|resource|definition|asset|info[._\-\s]*lock|(^|[._\-\s])lock([._\-\s]|$)/i.test(text);
      }
      return false;
    }
    function isLikelyLockedIdValuePath(path = "", key = "") {
      const field = String(key || "").replace(/^_+/, "");
      if (/^\d+$/.test(field)) return true;
      if (/^(id|itemid|instanceid|resourceid|cardid|playerid|definitionid|defid|assetid|baseid|baseresourceid|guidassetid)$/i.test(field)) {
        return true;
      }
      return /(^|[._\-\s])(lock|locked|protect|protected)([._\-\s]|$)$/i.test(String(path || ""));
    }
    function addLockedPlayerValue(result, value, path = "", key = "") {
      const nums = numberListFromAny(value);
      if (!nums.length) return;
      const text = `${key || ""} ${path || ""}`;
      const definitionLike = /definition|defid|asset|base|resource|guid/i.test(text);
      const itemLike = !definitionLike || /(^|[^a-z])(id|item|instance|card|player)([^a-z]|$)/i.test(text);
      if (definitionLike) nums.forEach((num) => result.definitionIds.push(num));
      if (itemLike || /resource|guid/i.test(text)) nums.forEach((num) => result.itemIds.push(num));
    }
    function collectLockedPlayerIds(value, path = "", result = { itemIds: [], definitionIds: [], sources: [] }, depth = 0, seen = /* @__PURE__ */ new WeakSet(), inLockContext = false) {
      if (value === null || value === void 0 || depth > 6) return result;
      const lockContext = inLockContext || isLikelyLockedPlayerPath(path);
      if (!isInspectableObject(value)) {
        if (lockContext && isLikelyLockedIdValuePath(path)) {
          addLockedPlayerValue(result, value, path);
          if (!result.sources.includes(path)) result.sources.push(path);
        }
        return result;
      }
      if (seen.has(value)) return result;
      seen.add(value);
      const keys = Array.isArray(value) ? value.map((_, index) => String(index)) : Object.keys(value);
      for (const key of keys.slice(0, 250)) {
        let child;
        try {
          child = value[key];
        } catch {
          continue;
        }
        const nextPath = path ? `${path}.${key}` : key;
        const childLockContext = lockContext || isLikelyLockedPlayerPath(nextPath);
        if (childLockContext && !isInspectableObject(child) && isLikelyLockedIdValuePath(nextPath, key)) {
          addLockedPlayerValue(result, child, nextPath, key);
          if (!result.sources.includes(nextPath)) result.sources.push(nextPath);
        } else if (childLockContext && isInspectableObject(child)) {
          ITEM_ID_FIELD_ALIASES.forEach((field) => {
            addLockedPlayerValue(result, safeReadField(child, field), nextPath, field);
          });
          DEFINITION_ID_FIELD_ALIASES.forEach((field) => {
            addLockedPlayerValue(result, safeReadField(child, field), nextPath, field);
          });
        }
        if (isInspectableObject(child)) {
          collectLockedPlayerIds(child, nextPath, result, depth + 1, seen, childLockContext);
        }
      }
      return result;
    }
    function normalizeLockedPlayerIds(raw, source = "") {
      const result = collectLockedPlayerIds(raw, source || "lock");
      return {
        itemIds: uniqueNumberList(result.itemIds),
        definitionIds: uniqueNumberList(result.definitionIds),
        sources: [...new Set(result.sources || [])]
      };
    }
    function normalizeGoldRange(settings, rows) {
      const direct = numberListFromAny(settings.goldRange || settings.goldenRange || settings.goldRatingRange).slice(0, 2);
      if (direct.length === 2) return direct.sort((a, b) => a - b);
      if (direct.length === 1 && direct[0] >= 75 && direct[0] <= 99) return [75, direct[0]];
      let min = null;
      let max = null;
      for (const row of rows) {
        const path = row.path.toLowerCase();
        const value = Number(row.value);
        if (!Number.isFinite(value)) continue;
        if (/gold.*(min|from|start)|golden.*(min|from|start)/i.test(path)) min = value;
        if (/gold.*(max|to|end)|golden.*(max|to|end)/i.test(path)) max = value;
      }
      if (Number.isFinite(min) && Number.isFinite(max)) return [min, max].sort((a, b) => a - b);
      return FSU_COMPAT_DEFAULTS.goldRange;
    }
    function normalizeFsuSettings(raw = {}, source = "manual") {
      const rows = flattenConfigValues(raw);
      const settings = { ...FSU_COMPAT_DEFAULTS, detected: true, source };
      let matched = false;
      for (const [field, aliases] of Object.entries(FSU_SETTING_ALIASES)) {
        const row = rows.find((entry) => aliasMatches(entry.path, aliases) && boolFromAny(entry.value) !== null);
        if (row) {
          settings[field] = boolFromAny(row.value);
          matched = true;
        }
      }
      const excludedLeagueRows = rows.filter(
        (entry) => /exclude|ignore|black|ban|designated|league|联赛|聯賽/i.test(entry.path) && /league|联赛|聯賽/i.test(entry.path)
      );
      const excludedLeagueIds = excludedLeagueRows.flatMap((entry) => numberListFromAny(entry.value)).filter((entry, index, arr) => Number.isFinite(entry) && arr.indexOf(entry) === index);
      if (excludedLeagueIds.length) {
        settings.excludedLeagueIds = excludedLeagueIds;
        settings.excludeDesignatedLeagues = true;
        matched = true;
      }
      const lockedPlayers = normalizeLockedPlayerIds(raw, source);
      if (lockedPlayers.itemIds.length || lockedPlayers.definitionIds.length) {
        settings.lockedItemIds = lockedPlayers.itemIds;
        settings.lockedDefinitionIds = lockedPlayers.definitionIds;
        matched = true;
      }
      const explicitGoldRange = numberListFromAny(raw.goldRange || raw.goldenRange || raw.goldRatingRange);
      settings.goldRange = normalizeGoldRange(raw, rows);
      if (explicitGoldRange.length) matched = true;
      if (!matched) return null;
      return settings;
    }
    function likelyFsuStorageKey(key, value) {
      const text = String(key || "");
      return /fsu|enhancer|sbc.*(?:ignore|setting)|(?:ignore|rarity|untrad|league|evo|evolution|golden|player.*range).*settings?/i.test(text);
    }
    function mergeLockedPlayersIntoSettings(settings, locked, sourceLabel = "") {
      const base = settings || {
        ...FSU_COMPAT_DEFAULTS,
        excludedLeagueIds: [...FSU_COMPAT_DEFAULTS.excludedLeagueIds],
        goldRange: [...FSU_COMPAT_DEFAULTS.goldRange],
        lockedItemIds: [],
        lockedDefinitionIds: []
      };
      if (!locked || !locked.itemIds?.length && !locked.definitionIds?.length) return base;
      base.lockedItemIds = uniqueNumberList([...base.lockedItemIds || [], ...locked.itemIds || []]);
      base.lockedDefinitionIds = uniqueNumberList([...base.lockedDefinitionIds || [], ...locked.definitionIds || []]);
      base.detected = true;
      if (sourceLabel) {
        base.source = base.source && base.source !== "compat-defaults" ? `${base.source}+${sourceLabel}` : sourceLabel;
      }
      return base;
    }
    function readFsuSettingsFromStorage(storage, label) {
      if (!storage) return null;
      const exactKeys = [
        "sbcIgnorePlayerConfiguration",
        "sbcIgnorePlayerConfig",
        "sbc_ignore_player_configuration",
        "sbcIgnorePlayers",
        "sbcSettings",
        "fsuSbcSettings",
        "fsuSettings",
        "enhancerSettings",
        "fcEnhancerSettings"
      ];
      for (const key of exactKeys) {
        let value = null;
        try {
          value = storage.getItem(key);
        } catch {
        }
        if (value === null || value === void 0) continue;
        const parsed = parseJsonMaybe(value);
        const settings = normalizeFsuSettings(parsed || { [key]: value }, `${label}:${key}`);
        if (settings) return settings;
      }
      let length = 0;
      try {
        length = Number(storage.length || 0);
      } catch {
      }
      for (let index = 0; index < Math.min(length, 250); index++) {
        let key = "";
        let value = null;
        try {
          key = storage.key(index);
          value = storage.getItem(key);
        } catch {
          continue;
        }
        if (!key || !likelyFsuStorageKey(key, value)) continue;
        const parsed = parseJsonMaybe(value);
        const settings = normalizeFsuSettings(parsed || { [key]: value }, `${label}:${key}`);
        if (settings) return settings;
      }
      return null;
    }
    function fsuInfoBoolean(build, key, fallback) {
      const value = boolFromAny(safeReadField(build, key));
      return value === null ? fallback : value;
    }
    function readFsuSettingsFromInfo() {
      let info;
      try {
        info = W.info;
      } catch {
        info = null;
      }
      const build = info?.build;
      if (!isInspectableObject(build)) return null;
      const knownBuildKeys = [
        "ignorepos",
        "untradeable",
        "league",
        "flag",
        "academy",
        "strictlypcik",
        "comprange",
        "comprare",
        "firststorage",
        "sbfirstcommon"
      ];
      if (!knownBuildKeys.some((key) => safeReadField(build, key) !== void 0)) return null;
      const set = isInspectableObject(info?.set) ? info.set : {};
      const rawGoldenMax = Number(safeReadField(set, "goldenrange"));
      const goldenMax = Number.isFinite(rawGoldenMax) && rawGoldenMax >= 75 && rawGoldenMax <= 99 ? rawGoldenMax : FSU_COMPAT_DEFAULTS.goldRange[1];
      return {
        ...FSU_COMPAT_DEFAULTS,
        ignorePlayerPosition: fsuInfoBoolean(build, "ignorepos", FSU_COMPAT_DEFAULTS.ignorePlayerPosition),
        onlyUntradeable: fsuInfoBoolean(build, "untradeable", FSU_COMPAT_DEFAULTS.onlyUntradeable),
        excludeDesignatedLeagues: fsuInfoBoolean(build, "league", FSU_COMPAT_DEFAULTS.excludeDesignatedLeagues),
        excludedLeagueIds: uniqueNumberList(numberListFromAny(safeReadField(set, "shield_league"))),
        useRarityPlayer: fsuInfoBoolean(build, "flag", FSU_COMPAT_DEFAULTS.useRarityPlayer),
        excludeEvolution: fsuInfoBoolean(build, "academy", FSU_COMPAT_DEFAULTS.excludeEvolution),
        playerPickStrictCommonRare: fsuInfoBoolean(build, "strictlypcik", FSU_COMPAT_DEFAULTS.playerPickStrictCommonRare),
        priorityRareWithinGoldRange: fsuInfoBoolean(build, "comprange", FSU_COMPAT_DEFAULTS.priorityRareWithinGoldRange),
        priorityNonSpecialPlayers: fsuInfoBoolean(build, "comprare", FSU_COMPAT_DEFAULTS.priorityNonSpecialPlayers),
        priorityStoragePlayers: fsuInfoBoolean(build, "firststorage", FSU_COMPAT_DEFAULTS.priorityStoragePlayers),
        silverBronzePrioritizeNormal: fsuInfoBoolean(build, "sbfirstcommon", FSU_COMPAT_DEFAULTS.silverBronzePrioritizeNormal),
        goldRange: [75, goldenMax],
        detected: true,
        source: "window.info.build/set"
      };
    }
    function readFsuSettingsFromWindow() {
      const infoSettings = readFsuSettingsFromInfo();
      if (infoSettings) return infoSettings;
      const roots = [];
      const rootNames = [
        "FSU",
        "fsu",
        "FUTEnhancer",
        "FCEnhancer",
        "Enhancer",
        "enhancer",
        "__FSU",
        "__FUTEnhancer",
        "__FCEnhancer"
      ];
      for (const name of rootNames) {
        try {
          if (isInspectableObject(W[name])) roots.push([name, W[name]]);
        } catch {
        }
      }
      try {
        Object.keys(W).filter((key) => /fsu|enhancer/i.test(key)).slice(0, 40).forEach((key) => {
          try {
            if (isInspectableObject(W[key])) roots.push([key, W[key]]);
          } catch {
          }
        });
      } catch {
      }
      const seen = /* @__PURE__ */ new WeakSet();
      for (const [name, root] of roots) {
        if (seen.has(root)) continue;
        seen.add(root);
        const settings = normalizeFsuSettings(root, `window.${name}`);
        if (settings) return settings;
      }
      return null;
    }
    function readFsuLockedPlayersFromWindow() {
      const known = [
        ["window.info.lock", () => W.info?.lock],
        ["window.info.lockedPlayers", () => W.info?.lockedPlayers],
        ["window.info.lockPlayers", () => W.info?.lockPlayers],
        ["window.info.playerLock", () => W.info?.playerLock],
        ["window.info.protectedPlayers", () => W.info?.protectedPlayers],
        ["window.state.page.info.lock", () => W.state?.page?.info?.lock]
      ];
      const combined = { itemIds: [], definitionIds: [], sources: [] };
      for (const [path, getter] of known) {
        let value;
        try {
          value = getter();
        } catch {
          value = null;
        }
        const locked = normalizeLockedPlayerIds(value, path);
        combined.itemIds.push(...locked.itemIds);
        combined.definitionIds.push(...locked.definitionIds);
        combined.sources.push(...locked.sources);
      }
      const rootNames = ["FSU", "fsu", "FUTEnhancer", "FCEnhancer", "Enhancer", "enhancer", "__FSU", "__FUTEnhancer", "__FCEnhancer"];
      for (const name of rootNames) {
        try {
          if (!isInspectableObject(W[name])) continue;
          const locked = normalizeLockedPlayerIds(W[name], `window.${name}`);
          combined.itemIds.push(...locked.itemIds);
          combined.definitionIds.push(...locked.definitionIds);
          combined.sources.push(...locked.sources);
        } catch {
        }
      }
      return {
        itemIds: uniqueNumberList(combined.itemIds),
        definitionIds: uniqueNumberList(combined.definitionIds),
        sources: [...new Set(combined.sources)].slice(0, 8)
      };
    }
    function readFsuLockedPlayersFromStorage(storage, label) {
      const combined = { itemIds: [], definitionIds: [], sources: [] };
      if (!storage) return combined;
      let length = 0;
      try {
        length = Number(storage.length || 0);
      } catch {
      }
      for (let index = 0; index < Math.min(length, 250); index++) {
        let key = "";
        let value = null;
        try {
          key = storage.key(index);
          value = storage.getItem(key);
        } catch {
          continue;
        }
        if (!key || !isLikelyLockedPlayerPath(key)) continue;
        const parsed = parseJsonMaybe(value);
        const locked = normalizeLockedPlayerIds(parsed || { [key]: value }, `${label}:${key}`);
        combined.itemIds.push(...locked.itemIds);
        combined.definitionIds.push(...locked.definitionIds);
        combined.sources.push(...locked.sources);
      }
      return {
        itemIds: uniqueNumberList(combined.itemIds),
        definitionIds: uniqueNumberList(combined.definitionIds),
        sources: [...new Set(combined.sources)].slice(0, 8)
      };
    }
    function readFsuLockedPlayers() {
      const windowLocked = readFsuLockedPlayersFromWindow();
      const localLocked = readFsuLockedPlayersFromStorage(window.localStorage, "localStorage");
      const sessionLocked = readFsuLockedPlayersFromStorage(window.sessionStorage, "sessionStorage");
      return {
        itemIds: uniqueNumberList([...windowLocked.itemIds || [], ...localLocked.itemIds || [], ...sessionLocked.itemIds || []]),
        definitionIds: uniqueNumberList([...windowLocked.definitionIds || [], ...localLocked.definitionIds || [], ...sessionLocked.definitionIds || []]),
        sources: [.../* @__PURE__ */ new Set([...windowLocked.sources || [], ...localLocked.sources || [], ...sessionLocked.sources || []])].slice(0, 8)
      };
    }
    function detectFsuSettings() {
      const settings = state.fsuSettingsOverride || readFsuSettingsFromWindow() || readFsuSettingsFromStorage(window.localStorage, "localStorage") || readFsuSettingsFromStorage(window.sessionStorage, "sessionStorage") || { ...FSU_COMPAT_DEFAULTS, excludedLeagueIds: [...FSU_COMPAT_DEFAULTS.excludedLeagueIds], goldRange: [...FSU_COMPAT_DEFAULTS.goldRange] };
      const locked = readFsuLockedPlayers();
      return mergeLockedPlayersIntoSettings(settings, locked, locked.itemIds.length || locked.definitionIds.length ? "locked-players" : "");
    }
    function getFsuSettings(options = {}) {
      const nowMs = Date.now();
      if (!options.force && state.fsuSettingsCache.settings && nowMs - state.fsuSettingsCache.at < 2e3) {
        return state.fsuSettingsCache.settings;
      }
      const settings = detectFsuSettings();
      state.fsuSettingsCache = { at: nowMs, settings };
      return settings;
    }
    function setFsuSettingsOverride(settings) {
      state.fsuSettingsOverride = settings ? normalizeFsuSettings(settings, "manual-override") : null;
      state.fsuSettingsCache = { at: 0, settings: null };
      return getFsuSettings({ force: true });
    }
    function clearFsuSettingsOverride() {
      state.fsuSettingsOverride = null;
      state.fsuSettingsCache = { at: 0, settings: null };
      return getFsuSettings({ force: true });
    }
    function onOff(value) {
      return value ? "on" : "off";
    }
    function formatFsuSettings(settings = getFsuSettings()) {
      const leagueText = settings.excludedLeagueIds?.length ? settings.excludedLeagueIds.join("/") : "none";
      const range = settings.goldRange || FSU_COMPAT_DEFAULTS.goldRange;
      const lockedCount = uniqueNumberList([...settings.lockedItemIds || [], ...settings.lockedDefinitionIds || []]).length;
      return [
        `source:${settings.source}${settings.detected ? "" : " (compat defaults)"}`,
        `onlyUntradeable:${onOff(settings.onlyUntradeable)}`,
        `excludeLeagues:${onOff(settings.excludeDesignatedLeagues)} ids:${leagueText}`,
        `useRarity:${onOff(settings.useRarityPlayer)}`,
        `excludeEvo:${onOff(settings.excludeEvolution)}`,
        `rareGoldRange:${onOff(settings.priorityRareWithinGoldRange)} ${range[0]}-${range[1]}`,
        `nonSpecialFirst:${onOff(settings.priorityNonSpecialPlayers)}`,
        `storageFirst:${onOff(settings.priorityStoragePlayers)}`,
        `silverBronzeNormal:${onOff(settings.silverBronzePrioritizeNormal)}`,
        "normalGoldPolicy:follow-fsu",
        `locked:${lockedCount}`
      ].join("; ");
    }
    function logFsuSettingsForRun() {
      log(`FSU settings sync: ${formatFsuSettings(getFsuSettings({ force: true }))}`);
    }
    function safeReadField(holder, key) {
      try {
        return holder?.[key];
      } catch {
        return void 0;
      }
    }
    function itemIdentityHolders(item) {
      const holders = [
        item,
        ...ITEM_IDENTITY_HOLDER_FIELDS.map((field) => safeReadField(item, field))
      ];
      const seen = /* @__PURE__ */ new Set();
      return holders.filter((holder) => {
        if (!holder || typeof holder !== "object" || seen.has(holder)) return false;
        seen.add(holder);
        return true;
      });
    }
    function itemLeagueId2(item) {
      const data = safeReadField(item, "_data");
      const staticData = safeReadField(item, "_staticData");
      const assetData = safeReadField(item, "assetData");
      const values = [
        safeReadField(item, "leagueId"),
        safeReadField(item, "league"),
        safeReadField(item, "_leagueId"),
        safeReadField(data, "leagueId"),
        safeReadField(staticData, "leagueId"),
        safeReadField(assetData, "leagueId")
      ];
      for (const value of values) {
        const num = Number(value);
        if (Number.isFinite(num) && num > 0) return num;
      }
      return 0;
    }
    function itemIdentifierNumbers(item, keys = []) {
      const fields = Array.isArray(keys) && keys.length ? keys : ITEM_IDENTITY_FIELD_ALIASES;
      return uniqueNumberList(itemIdentityHolders(item).flatMap(
        (holder) => fields.flatMap((field) => numberListFromAny(safeReadField(holder, field)))
      ));
    }
    function isFsuLockedItem(item, settings = getFsuSettings(), lockContext = null) {
      const lockedItemIds = lockContext?.lockedItemIds || new Set((settings.lockedItemIds || []).map(Number).filter((id) => Number.isFinite(id) && id > 0));
      const lockedDefinitionIds = lockContext?.lockedDefinitionIds || new Set((settings.lockedDefinitionIds || []).map(Number).filter((id) => Number.isFinite(id) && id > 0));
      if (!lockedItemIds.size && !lockedDefinitionIds.size) return false;
      const itemIds = itemIdentifierNumbers(item, ITEM_ID_FIELD_ALIASES);
      const definitionIds = itemIdentifierNumbers(item, DEFINITION_ID_FIELD_ALIASES);
      if (itemIds.some((id) => lockedItemIds.has(id))) return true;
      if (definitionIds.some((id) => lockedDefinitionIds.has(id))) return true;
      const allIds = uniqueNumberList([
        ...itemIds,
        ...definitionIds,
        ...itemIdentifierNumbers(item, ITEM_IDENTITY_FIELD_ALIASES)
      ]);
      return allIds.some((id) => lockedItemIds.has(id) || lockedDefinitionIds.has(id));
    }
    function isEvolutionItem(item) {
      try {
        if (item?.isEvolution?.()) return true;
      } catch {
      }
      try {
        if (item?.isEvo?.()) return true;
      } catch {
      }
      const values = [
        item?.isEvolution,
        item?.isEvo,
        item?.evolutionId,
        item?.evoId,
        item?.evolutionLevel,
        item?.evolutionStatus,
        item?._data?.evolutionId,
        item?._staticData?.evolutionId
      ];
      return values.some((value) => {
        if (typeof value === "boolean") return value;
        if (typeof value === "number") return Number.isFinite(value) && value > 0;
        if (typeof value === "string") return value.trim() && value !== "0" && value !== "-1" && value.toLowerCase() !== "false";
        if (isInspectableObject(value)) return Object.keys(value).length > 0;
        return false;
      });
    }
    function getFsuRejectReasons(item, spec = {}, settings = getFsuSettings(), context = null) {
      const reasons = [];
      if (!isPlayer(item)) return reasons;
      if (isFsuLockedItem(item, settings, context)) reasons.push("fsu-locked-player");
      if (settings.onlyUntradeable && isTradeable(item)) reasons.push("fsu-only-untradeable");
      if (settings.excludeEvolution && isEvolutionItem(item)) reasons.push("fsu-exclude-evolution");
      const excludedLeagueIds = context?.excludedLeagueIds || (settings.excludedLeagueIds || []).map(Number).filter((id) => Number.isFinite(id) && id > 0);
      if (settings.excludeDesignatedLeagues && excludedLeagueIds.length) {
        const leagueId = itemLeagueId2(item);
        if (leagueId && excludedLeagueIds.includes(leagueId)) {
          reasons.push(`fsu-excluded-league-${leagueId}`);
        }
      }
      if (isNormalGoldFodder(item)) {
        const range = settings.goldRange || FSU_COMPAT_DEFAULTS.goldRange;
        const minRating = Number(range[0] || 75);
        const maxRating = Number(range[1] || 83);
        const rating = Number(item?.rating || 0);
        if (rating < minRating || rating > maxRating) {
          reasons.push(`fsu-gold-range-${minRating}-${maxRating}`);
        }
      }
      if (settings.useRarityPlayer === false && spec.special !== true && spec.allowSpecial !== true && isSpecial(item)) {
        reasons.push("fsu-rarity-player-off");
      }
      return reasons;
    }
    function applyFsuPilePriority(piles = [], settings = getFsuSettings()) {
      if (!settings.priorityStoragePlayers || !Array.isArray(piles) || !piles.includes("storage")) return piles;
      const pinned = piles[0] === "unassigned" ? ["unassigned"] : [];
      const rest = piles.filter((pile) => !pinned.includes(pile) && pile !== "storage");
      return [...pinned, "storage", ...rest];
    }
    function isInGoldPriorityRange(item, settings = getFsuSettings()) {
      const range = settings.goldRange || FSU_COMPAT_DEFAULTS.goldRange;
      const rating = Number(item?.rating || 0);
      return isGold(item) && rating >= Number(range[0] || 75) && rating <= Number(range[1] || 83);
    }
    function collectionValues3(collection) {
      if (!collection) return [];
      if (typeof collection.values === "function") return Array.from(collection.values());
      if (Array.isArray(collection._collection)) return collection._collection;
      if (collection._collection && typeof collection._collection === "object") return Object.values(collection._collection);
      if (typeof collection === "object") return Object.values(collection);
      return [];
    }
    function getClubItems() {
      return collectionValues3(W.repositories?.Item?.club?.items).concat(collectionValues3(W.services?.Item?.itemDao?.itemRepo?.club?.items));
    }
    function uniqueItems(items) {
      const seen = /* @__PURE__ */ new Set();
      const result = [];
      for (const item of items || []) {
        const id = Number(item?.id || 0);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        result.push(item);
      }
      return result;
    }
    function getStorageItems() {
      try {
        if (typeof W.repositories?.Item?.getStorageItems === "function") {
          return Array.from(W.repositories.Item.getStorageItems() || []);
        }
      } catch {
      }
      try {
        if (typeof W.repositories?.Item?.getStorage === "function") {
          return collectionValues3(W.repositories.Item.getStorage());
        }
      } catch {
      }
      return collectionValues3(W.repositories?.Item?.storage);
    }
    function getTransferItems() {
      try {
        if (typeof W.repositories?.Item?.getTransferItems === "function") {
          return Array.from(W.repositories.Item.getTransferItems() || []);
        }
      } catch {
      }
      return collectionValues3(W.repositories?.Item?.transfer);
    }
    function getPileItemsByName(pileName) {
      if (pileName === "unassigned") return uniqueItems(getUnassignedItems());
      if (pileName === "storage") return uniqueItems(getStorageItems());
      if (pileName === "transfer") return uniqueItems(getTransferItems());
      if (pileName === "club") return uniqueItems(getClubItems());
      return [];
    }
    function findCachedItemById(itemId, pileNames = ["storage", "club", "unassigned", "transfer"]) {
      const targetId = Number(itemId || 0);
      if (!targetId) return null;
      for (const pileName of pileNames) {
        const item = getPileItemsByName(pileName).find((entry) => Number(entry?.id || 0) === targetId);
        if (item) return { item, pileName };
      }
      return null;
    }
    function resolveRecentRewardItems(label = "recent reward item resolution") {
      if (!state.recentRewardItems?.length) return 0;
      let resolved = 0;
      const seen = /* @__PURE__ */ new Set();
      state.recentRewardItems = state.recentRewardItems.map((item) => {
        const id = Number(item?.id || 0);
        if (!id) return item;
        const live = findCachedItemById(id);
        if (!live || live.item === item) return item;
        resolved++;
        if (!seen.has(id)) {
          log(`${label}: resolved recent reward item ${itemDisplayName(item)} rating:${Number(item?.rating || 0) || "?"} id:${id} to ${live.pileName}`);
          seen.add(id);
        }
        return live.item;
      });
      return resolved;
    }
    function makeLengthSafeMetadataValue(value) {
      if (value === void 0 || value === null) return [];
      if (Array.isArray(value) || typeof value === "function") return value;
      if (typeof value === "string") return value.trim() ? [value] : [];
      if (typeof value === "number" || typeof value === "boolean") return [value];
      if (typeof value === "object" && value.length === void 0) return Object.keys(value).length ? [value] : [];
      return value;
    }
    function patchLengthSafeMetadataField(holder, key) {
      if (!holder || typeof holder !== "object") return false;
      let current;
      try {
        current = holder[key];
      } catch {
        return false;
      }
      const next = makeLengthSafeMetadataValue(current);
      if (next === current) return false;
      try {
        holder[key] = next;
        return true;
      } catch {
        return false;
      }
    }
    function patchFsuLengthSafePlayerMetadata(reason = "before FSU player scan") {
      const targetIds = new Set([
        ...Array.from(state.assumedTotwItemIds || []),
        ...(state.recentRewardItems || []).map((item) => Number(item?.id || 0))
      ].filter((id) => id && !state.consumedItemIds.has(id)));
      if (!targetIds.size) return;
      const items = uniqueItems([
        ...state.recentRewardItems || [],
        ...getPileItemsByName("unassigned"),
        ...getPileItemsByName("storage"),
        ...getPileItemsByName("transfer"),
        ...getPileItemsByName("club")
      ]);
      const keys = ["league", "leagues", "leagueIds", "club", "clubs", "clubIds", "nation", "nations", "nationIds"];
      let patchedItems = 0;
      let patchedFields = 0;
      for (const item of items) {
        if (!isPlayer(item)) continue;
        if (!targetIds.has(Number(item?.id || 0))) continue;
        let itemPatched = false;
        const holders = [item, item?._data, item?._staticData, item?.assetData, item?._assetData];
        for (const holder of holders) {
          for (const key of keys) {
            if (patchLengthSafeMetadataField(holder, key)) {
              itemPatched = true;
              patchedFields++;
            }
          }
        }
        if (itemPatched) patchedItems++;
      }
      if (patchedItems) {
        log(`FSU metadata compatibility patch (${reason}): ${patchedItems} player item(s), ${patchedFields} field(s)`);
      }
    }
    function isInactiveTrade(item) {
      try {
        const auction = item?.getAuctionData?.() || item?._auction;
        if (!auction) return true;
        if (typeof auction.isActiveTrade === "function" && auction.isActiveTrade()) return false;
        if (typeof auction.isClosedTrade === "function" && auction.isClosedTrade()) return false;
        return true;
      } catch {
        return true;
      }
    }
    function isSbcUsablePlayer(item, options = {}, context = null) {
      if (!isPlayer(item)) return false;
      const id = Number(item?.id || 0);
      const definitionId = Number(item?.definitionId || 0);
      if (id && state.consumedItemIds.has(id)) return false;
      if (id && (context?.protectedItemIds?.has(id) || options.protectedItemIds?.some((value) => Number(value) === id))) return false;
      if (definitionId && (context?.protectedDefinitionIds?.has(definitionId) || options.protectedDefinitionIds?.some((value) => Number(value) === definitionId))) return false;
      if (options.protectHighGold && isProtectedHighGold(item)) return false;
      if (isLimitedUseItem(item)) return false;
      if (isConceptItem(item)) return false;
      try {
        if (item?.isEnrolledInAcademy?.()) return false;
      } catch {
      }
      if (item?.endTime !== void 0 && Number(item.endTime) !== -1) return false;
      if (!isInactiveTrade(item)) return false;
      if (getFsuRejectReasons(item, options, context?.settings, context).length) return false;
      return true;
    }
    function findClubDuplicate2(item) {
      const duplicateId = Number(item?.duplicateId || 0);
      const clubItems = getClubItems();
      if (duplicateId) {
        const byId = clubItems.find((clubItem) => Number(clubItem?.id) === duplicateId);
        if (byId) return byId;
      }
      return clubItems.find(
        (clubItem) => Number(clubItem?.definitionId || 0) === Number(item?.definitionId || -1) && Number(clubItem?.id || 0) !== Number(item?.id || 0)
      );
    }
    function predictUnassignedDestination(item) {
      if (!item) return "unknown";
      try {
        if (!isDuplicate(item)) return "club";
        if (isTradeable(item)) return "transfer";
        const swapTarget = findClubDuplicate2(item);
        if (swapTarget && isTradeable(swapTarget)) return "club";
        return "storage";
      } catch {
        return "unknown";
      }
    }
    function pileSpaceLeft(pile, fallbackMax = null) {
      try {
        const size = Number(W.repositories.Item.getPileSize(pile));
        const used = Number(W.repositories.Item.numItemsInCache(pile));
        if (Number.isFinite(size) && Number.isFinite(used)) return size - used;
      } catch {
      }
      if (fallbackMax !== null) {
        try {
          return fallbackMax - W.repositories.Item.numItemsInCache(pile);
        } catch {
        }
      }
      return null;
    }
    function storageSpaceLeft() {
      return pileSpaceLeft(W.ItemPile.STORAGE, CFG.storageMax);
    }
    function transferSpaceLeft() {
      return pileSpaceLeft(W.ItemPile.TRANSFER, null);
    }
    function assertPileSpace(pileName, available, needed) {
      if (available !== null && needed > available) {
        fail(`${pileName} has only ${available} slot(s), but ${needed} item(s) need moving`);
      }
    }
    async function resolveRuntimeUnassigned(reason = "cleanup", options = {}) {
      await refreshUnassigned();
      let reservedIds = /* @__PURE__ */ new Set();
      let initialLogged = false;
      const adapter = createEaInventoryAdapter(W, { capacityFallbacks: { storage: CFG.storageMax } });
      const getSnapshot = async () => {
        const liveItems = getUnassignedItems();
        reservedIds = new Set(
          options.reserveItem ? liveItems.filter(options.reserveItem).map((item) => Number(item?.id || 0)).filter(Boolean) : []
        );
        if (!initialLogged) {
          const actionableCount = liveItems.length - reservedIds.size;
          if (actionableCount || reservedIds.size) {
            log(`Unassigned cleanup before ${reason}: ${actionableCount} item(s)${reservedIds.size ? `, reserved ${reservedIds.size}` : ""}`);
          }
          initialLogged = true;
        }
        return adapter.snapshot();
      };
      const activeLoopDef = options.loopDef || state.loopStack[state.loopStack.length - 1] || null;
      const recoveryPolicyIds = options.recoveryPolicyIds !== void 0 ? options.recoveryPolicyIds : activeLoopDef && Object.prototype.hasOwnProperty.call(activeLoopDef, "unassignedRecoveryPolicyIds") ? activeLoopDef.unassignedRecoveryPolicyIds : getDefaultUnassignedRecoveryPolicyIds();
      const configuredResolvers = options.blockedPolicy === "preserve" || options.enableRecovery === false ? [] : buildUnassignedRecoveryResolvers({
        loopDef: activeLoopDef,
        policyIds: recoveryPolicyIds
      });
      const result = await resolveUnassigned({
        getSnapshot,
        reserveItem: (item) => reservedIds.has(Number(item?.id || 0)),
        overflowResolvers: [...options.overflowResolvers || [], ...configuredResolvers],
        blockedPolicy: options.blockedPolicy || "fail",
        activeResolvers: options.activeResolvers,
        maxIterations: options.maxIterations || 20,
        executeAction: async (action2) => {
          stopPoint();
          const items = action2.itemRefs.map((ref) => adapter.resolveItem(ref, ["unassigned"])?.item).filter(Boolean);
          if (items.length !== action2.itemRefs.length) {
            fail(`Unassigned ${action2.description} action could resolve only ${items.length}/${action2.itemRefs.length} item(s)`);
          }
          if (action2.type === "swap") {
            log(`Swapping ${items.length} untradeable duplicate(s) with tradeable club version(s)`);
            await moveItems(items, W.ItemPile.CLUB, true);
          } else if (action2.destination === "club") {
            log(`Moving ${items.length} non-duplicate unassigned item(s) to club`);
            await moveItems(items, W.ItemPile.CLUB, true);
          } else if (action2.destination === "transfer") {
            log(`Moving ${items.length} tradeable duplicate(s) to transfer list`);
            await moveItems(items, W.ItemPile.TRANSFER, false);
          } else if (action2.destination === "storage") {
            log(`Moving ${items.length} untradeable duplicate(s) to SBC storage`);
            await moveItems(items, W.ItemPile.STORAGE, true);
          } else {
            fail(`Unsupported Unassigned action destination: ${action2.destination}`);
          }
          await refreshUnassigned();
        }
      });
      if (result.status === "blocked") {
        const blocked2 = result.plan?.blocked;
        if (blocked2?.destination === "storage") {
          fail(`SBC storage has only ${blocked2.free} slot(s), but ${blocked2.required} item(s) need moving`);
        }
        if (blocked2?.destination === "transfer") {
          fail(`Transfer list has only ${blocked2.free} slot(s), but ${blocked2.required} item(s) need moving`);
        }
        fail(result.reason || "Unassigned cleanup blocked");
      }
      const reservedCount = result.plan?.reservedItemRefs?.length || reservedIds.size;
      if (initialLogged && (result.iterations > 1 || reservedCount || result.status === "preserved")) {
        log(`Unassigned cleanup complete: ${reason}${reservedCount ? `; reserved ${reservedCount} item(s)` : ""}`);
      }
      return result;
    }
    function getUnassignedStorageOverflow() {
      const storageCandidates = getUnassignedItems().filter((item) => {
        if (!isDuplicate(item) || isTradeable(item)) return false;
        const clubDuplicate = findClubDuplicate2(item);
        return !(clubDuplicate && isTradeable(clubDuplicate));
      });
      const space = storageSpaceLeft();
      return {
        count: storageCandidates.length,
        space,
        blocked: space !== null && storageCandidates.length > space
      };
    }
    function getUnassignedCapacityOverflow() {
      const items = getUnassignedItems();
      const transferCandidates = items.filter((item) => {
        if (!isDuplicate(item)) return false;
        if (isTradeable(item)) return true;
        const clubDuplicate = findClubDuplicate2(item);
        return clubDuplicate && isTradeable(clubDuplicate);
      });
      const transferSpace = transferSpaceLeft();
      if (transferSpace !== null && transferCandidates.length > transferSpace) {
        return {
          destination: "transfer",
          count: transferCandidates.length,
          space: transferSpace,
          blocked: true
        };
      }
      const storage = getUnassignedStorageOverflow();
      return {
        destination: "storage",
        count: storage.count,
        space: storage.space,
        blocked: storage.blocked
      };
    }
    async function tryMoveOpenedRewardItems(items, pile, allowStorage, label, description) {
      if (!items?.length) return 0;
      try {
        log(`${label}: moving ${items.length} ${description} opened reward item(s)`);
        await moveItems(items, pile, allowStorage);
        return items.length;
      } catch (e) {
        log(`${label}: direct ${description} reward move skipped: ${e.message || e}`);
        return 0;
      }
    }
    async function materializeOpenedPlayerRewards(items, label = "opened reward pack") {
      const players = uniqueItems((items || []).filter((item) => isPlayer(item)));
      if (!players.length) return 0;
      let moved = 0;
      const movedIds = /* @__PURE__ */ new Set();
      const markMoved = (list) => list.forEach((item) => movedIds.add(Number(item?.id || 0)));
      const nonDuplicates = players.filter((item) => !isDuplicate(item));
      const movedNonDuplicates = await tryMoveOpenedRewardItems(nonDuplicates, W.ItemPile.CLUB, true, label, "non-duplicate");
      if (movedNonDuplicates) {
        moved += movedNonDuplicates;
        markMoved(nonDuplicates);
      }
      const remainingDuplicates = players.filter((item) => !movedIds.has(Number(item?.id || 0)) && isDuplicate(item));
      const tradeableDuplicates = remainingDuplicates.filter((item) => isTradeable(item));
      if (tradeableDuplicates.length) {
        try {
          assertPileSpace("Transfer list", transferSpaceLeft(), tradeableDuplicates.length);
          const count = await tryMoveOpenedRewardItems(tradeableDuplicates, W.ItemPile.TRANSFER, false, label, "tradeable duplicate");
          if (count) {
            moved += count;
            markMoved(tradeableDuplicates);
          }
        } catch (e) {
          log(`${label}: direct tradeable duplicate reward move skipped: ${e.message || e}`);
        }
      }
      const untradeableDuplicates = players.filter(
        (item) => !movedIds.has(Number(item?.id || 0)) && isDuplicate(item) && !isTradeable(item)
      );
      const swappable = untradeableDuplicates.filter((item) => {
        const clubDuplicate = findClubDuplicate2(item);
        return clubDuplicate && isTradeable(clubDuplicate);
      });
      const storageDuplicates = untradeableDuplicates.filter((item) => !swappable.includes(item));
      const swappedCount = await tryMoveOpenedRewardItems(swappable, W.ItemPile.CLUB, true, label, "swappable duplicate");
      if (swappedCount) {
        moved += swappedCount;
        markMoved(swappable);
      }
      if (storageDuplicates.length) {
        try {
          assertPileSpace("SBC storage", storageSpaceLeft(), storageDuplicates.length);
          const count = await tryMoveOpenedRewardItems(storageDuplicates, W.ItemPile.STORAGE, true, label, "untradeable duplicate");
          if (count) moved += count;
        } catch (e) {
          log(`${label}: direct untradeable duplicate reward move skipped: ${e.message || e}`);
        }
      }
      if (moved) {
        await refreshInventoryCaches(`${label} direct reward move`, { includePacks: false, quiet: true });
        resolveRecentRewardItems(`${label} direct reward move`);
      }
      return moved;
    }
    function openedItemRoutingResult(items, reserveItem = null, details = {}) {
      const unassignedIds = new Set(getUnassignedItems().map((item) => Number(item?.id || 0)).filter(Boolean));
      const reservedItems = [];
      const routedItems = [];
      const pendingItems = [];
      for (const item of items || []) {
        const remainsUnassigned = unassignedIds.has(Number(item?.id || 0));
        if (!remainsUnassigned) routedItems.push(item);
        else if (reserveItem?.(item)) reservedItems.push(item);
        else pendingItems.push(item);
      }
      return { reservedItems, routedItems, pendingItems, details };
    }
    async function openPack(pack, purpose, options = {}) {
      if (!pack) fail(`Pack not found for ${purpose}`);
      if (typeof options.openedItemPolicy !== "function") {
        fail(`Opened item policy is required for ${purpose}`);
      }
      const packAdapter = createEaPackAdapter(W);
      const inventoryAdapter = createEaInventoryAdapter(W, { capacityFallbacks: { storage: CFG.storageMax } });
      let currentPack = pack;
      const retryCodes = options.retryCodes || (options.retryOn471 === true ? ["471"] : []);
      const receipt = await openPackTransaction({
        preOpenResolver: () => resolveRuntimeUnassigned(`opening ${purpose}`),
        packSelector: async ({ attempt }) => {
          if (attempt === 1) return currentPack;
          if (typeof options.resolveRetryPack === "function") {
            currentPack = await options.resolveRetryPack();
          }
          return currentPack;
        },
        packRef: (selectedPack) => ({ id: Number(selectedPack?.id || 0), name: packName(selectedPack) }),
        openTransport: async (selectedPack, { attempt }) => {
          const name = packName(selectedPack);
          const attempts = retryCodes.length ? 2 : 1;
          log(`Opening pack: ${name} (#${selectedPack.id})${attempt > 1 ? ` retry ${attempt}/${attempts}` : ""}`);
          return observeOnce(packAdapter.open(selectedPack), ctrl(), 3e4, `open ${name}`);
        },
        normalizeItems: async (items, { pack: selectedPack }) => {
          markStalePack(selectedPack);
          await waitLoadingEnd();
          return {
            items,
            receiptItems: items.map((item) => inventoryAdapter.snapshotItem(item, "unassigned"))
          };
        },
        openedItemPolicy: options.openedItemPolicy,
        retryPolicy: { attempts: retryCodes.length ? 2 : 1, retryCodes },
        beforeRetry: async ({ code }) => {
          log(`${purpose}: pack open returned ${code}; synchronizing navigation and pack cache before retry`);
          log(`${purpose}: retrying pack open after navigation and unassigned recovery`);
          await sleep(CFG.pauseMs);
          await unwindSbcSquadControllers(`${purpose} pack-open recovery`);
          await showUnassignedIfAny(`${purpose} pack-open recovery sync`);
          if (isSbcControllerActive()) {
            await openStorePacksViewForRefresh(`${purpose} pack-open Store recovery`).catch((error) => {
              log(`${purpose}: pack-open Store recovery skipped: ${error?.message || error}`);
              return false;
            });
          }
          await sleep(700);
          await resolveRuntimeUnassigned(`${purpose} pack-open recovery cleanup`);
          await refreshInventoryCaches(`${purpose} pack-open recovery`, { quiet: true });
        },
        allowGone: options.allowGone === true,
        onGone: async (selectedPack) => {
          markStalePack(selectedPack);
          log(`Skipping stale pack for ${purpose}: ${packName(selectedPack)} (#${selectedPack.id}) returned 404`);
          await waitLoadingEnd().catch(() => null);
          await refreshStorePacks().catch(() => null);
        }
      });
      state.lastOpenPackReceipt = receipt;
      if (receipt.status === "opened") return receipt;
      if (receipt.status === "stale" || receipt.status === "unavailable") {
        if (receipt.status === "unavailable") log(`${purpose}: no matching pack remains after recovery`);
        return null;
      }
      fail(`Open pack failed: ${receipt.reason || "unknown"}`);
    }
    async function openSourceBronzePack() {
      await refreshStorePacks();
      const pack = CFG.sourcePackIds.map((id) => findPackById(id)).find(Boolean) || findPackByName(CFG.sourcePackNames);
      if (!pack) {
        const names = summarizePacks();
        fail(`Source pack not found. Current my packs: ${names || "none"}`);
      }
      const receipt = await openPack(pack, "source bronze pack", {
        openedItemPolicy: createOpenedItemPolicy(async (openedItems) => {
          const bronzeDuplicates = openedItems.filter((item) => isPlayer(item) && isBronze(item) && isDuplicate(item));
          const duplicateIds = new Set(bronzeDuplicates.map((item) => Number(item?.id || 0)));
          const directClub = openedItems.filter(
            (item) => !duplicateIds.has(Number(item?.id || 0)) && (!isPlayer(item) || !isDuplicate(item))
          );
          if (directClub.length) {
            log(`Moving ${directClub.length} non-duplicate source item(s) to club`);
            await moveItems(directClub, W.ItemPile.CLUB, true);
          }
          if (bronzeDuplicates.length) {
            log(`${bronzeDuplicates.length} bronze duplicate(s) left for Bronze Upgrade`);
          } else {
            log("No bronze duplicate in this source pack; Bronze Upgrade may use club bronze players if FSU completion is enabled");
          }
          await refreshUnassigned();
          return openedItemRoutingResult(openedItems, (item) => duplicateIds.has(Number(item?.id || 0)), {
            bronzeDuplicateCount: bronzeDuplicates.length
          });
        })
      });
      return receipt;
    }
    async function ensureSbcSetsLoaded() {
      const sets = W.services?.SBC?.repository?.sets?._collection || {};
      if (Object.keys(sets).length) return;
      const result = await observeOnce(W.services.SBC.requestSets(), ctrl(), 3e4, "SBC.requestSets");
      if (!result?.success) fail(`SBC set request failed: ${result?.error?.code || result?.status || "unknown"}`);
    }
    function getSbcSets() {
      const coll = W.services?.SBC?.repository?.sets?._collection || {};
      return Array.isArray(coll) ? coll : Object.values(coll);
    }
    async function findSbcSet(names, label = "SBC") {
      await ensureSbcSetsLoaded();
      const set = getSbcSets().find((s) => matchesAny(s?.name, names));
      if (!set) {
        const names2 = getSbcSets().map((s) => `${s?.name || "?"} (#${s?.id})`).slice(0, 80).join(", ");
        fail(`${label} SBC not found. First loaded SBCs: ${names2}`);
      }
      return set;
    }
    async function findSbcSetIfPresent(names) {
      await ensureSbcSetsLoaded();
      return getSbcSets().find((set) => matchesAny(set?.name, names)) || null;
    }
    async function findBronzeUpgradeSet() {
      return findSbcSet(CFG.bronzeUpgradeNames, "Bronze Upgrade");
    }
    function navController() {
      const c = ctrl();
      return c?.getNavigationController?.() || c?.navigationController || null;
    }
    function isCompletedChallenge(challenge) {
      const status = String(challenge?.status || challenge?.state || "").toUpperCase();
      return status === "COMPLETED" || status === "COMPLETE" || challenge?.completed === true;
    }
    function getCachedSbcChallenges(set) {
      const sources = [];
      sources.push(...collectionValues3(set?.challenges));
      sources.push(...collectionValues3(set?._challenges));
      const byId = /* @__PURE__ */ new Map();
      for (const challenge of sources) {
        const id = Number(challenge?.id || 0);
        if (!id || byId.has(id)) continue;
        byId.set(id, challenge);
      }
      return [...byId.values()];
    }
    function hasRatingSbcChallengeRequirements(challenge) {
      return Array.isArray(challenge?.eligibilityRequirements) && challenge.eligibilityRequirements.length > 0;
    }
    async function requestRatingSbcChallenges(set, label = set?.name || "rating SBC") {
      const cached = getCachedSbcChallenges(set);
      const cachedAvailable = cached.find(
        (challenge) => !isCompletedChallenge(challenge) && hasRatingSbcChallengeRequirements(challenge)
      );
      if (cachedAvailable || cached.length && isSbcSetComplete(set)) {
        log(`${label}: using ${cached.length} cached challenge(s); bypassed requestChallengesForSet`);
        return cached;
      }
      const dao = W.services?.SBC?.sbcDAO;
      if (typeof dao?.getChallengesForSet !== "function") {
        fail(`${label}: direct SBC challenge DAO is unavailable`);
      }
      log(`${label}: loading challenges directly through sbcDAO; bypassing requestChallengesForSet`);
      const result = await observeOnce(
        dao.getChallengesForSet(Number(set?.id || 0)),
        ctrl(),
        2e4,
        `sbcDAO.getChallengesForSet ${label}`
      );
      if (!result?.success || !Array.isArray(result?.response?.challenges)) {
        const detail = serviceResultErrorText(result) || "no challenge data returned";
        fail(`${label}: direct SBC challenge load failed: ${detail}`);
      }
      const received = result.response.challenges;
      log(`${label}: direct SBC challenge load returned ${received.length} challenge(s)`);
      return received;
    }
    async function findAvailableRatingSbcChallenge(set, label = set?.name || "rating SBC") {
      const challenges = await requestRatingSbcChallenges(set, label);
      return challenges.find((challenge) => !isCompletedChallenge(challenge)) || null;
    }
    async function loadRatingSbcChallenge(challenge, label = "rating SBC") {
      if (!challenge) return null;
      if (challenge.squad) return challenge;
      const dao = W.services?.SBC?.sbcDAO;
      if (typeof dao?.loadChallenge !== "function") {
        fail(`${label}: direct SBC challenge loader is unavailable`);
      }
      let inProgress = false;
      try {
        inProgress = challenge.isInProgress?.() === true;
      } catch {
      }
      log(`${label}: loading challenge squad directly through sbcDAO`);
      const result = await observeOnce(
        dao.loadChallenge(Number(challenge.id || 0), inProgress),
        ctrl(),
        2e4,
        `sbcDAO.loadChallenge ${label}`
      );
      const squad = result?.response?.squad;
      if (!result?.success || !squad) {
        const detail = serviceResultErrorText(result) || "no squad data returned";
        fail(`${label}: direct challenge squad load failed: ${detail}`);
      }
      challenge.squad = squad;
      log(`${label}: direct challenge squad loaded`);
      return challenge;
    }
    async function requestSbcChallenges(set, label = set?.name || "SBC", options = {}) {
      const attempts = Math.max(1, Math.min(3, Number(options.attempts || 3)));
      let lastResult = null;
      let lastError = null;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        stopPoint();
        await waitLoadingEnd(350, attempt === 1 ? 6e3 : 12e3).catch(() => null);
        try {
          const result = await observeOnce(
            W.services.SBC.requestChallengesForSet(set),
            ctrl(),
            3e4,
            `requestChallengesForSet ${label}`
          );
          lastResult = result;
          if (result?.success && result?.data?.challenges?.length) return result.data.challenges;
          lastError = new Error(serviceResultErrorText(result) || "no challenge data returned");
        } catch (error) {
          lastError = error;
        }
        if (attempt < attempts) {
          log(`${label}: challenge request failed (${lastError?.message || lastError}); retrying ${attempt + 1}/${attempts}`);
          await sleep(1500 * attempt);
        }
      }
      if (options.allowEmpty) return [];
      const detail = lastError?.message || lastResult?.error?.code || lastResult?.status || "unknown";
      fail(`No challenge loaded for ${label} after ${attempts} attempt(s): ${detail}`);
    }
    async function findAvailableSbcChallenge(set, label = set?.name || "SBC") {
      const challenges = await requestSbcChallenges(set, label);
      return challenges.find((c) => !isCompletedChallenge(c)) || null;
    }
    async function openSbcSet(set, options = {}) {
      const challenge = options.challenge || await findAvailableSbcChallenge(set, set.name);
      if (!challenge) {
        if (options.returnNullIfComplete) return null;
        fail(`No available challenge for ${set.name}`);
      }
      const controller = ctrl();
      const load = await observeOnce(
        W.services.SBC.loadChallenge(challenge),
        controller,
        3e4,
        `loadChallenge ${challenge.id}`
      );
      if (!load?.success) fail(`Challenge load failed for ${set.name}`);
      try {
        const localChallenge = set.getChallenge?.(challenge.id);
        if (localChallenge && !localChallenge.squad) localChallenge.update?.(challenge);
      } catch {
      }
      const nav = navController();
      if (!nav) fail("Navigation controller not found");
      const vc = new W.UTSBCSquadSplitViewController();
      vc.initWithSBCSet?.(set, challenge.id);
      nav.pushViewController?.(vc, true);
      const activeController = await waitFor(() => {
        const current = ctrl();
        if (!current || current?.constructor?.name !== "UTSBCSquadSplitViewController") return null;
        return current === vc || current !== controller ? current : null;
      }, 15e3, `${set.name} target SBC squad screen`);
      await waitFor(() => {
        const current = ctrl();
        if (current !== vc && current !== activeController) return null;
        return current?._squad || null;
      }, 15e3, `${set.name} target SBC squad object`);
      await waitLoadingEnd(250, 2500);
      return { set, challenge };
    }
    function simulateClick(el) {
      if (!el) return false;
      try {
        el.scrollIntoView?.({ block: "center", inline: "center" });
      } catch {
      }
      try {
        el.focus?.();
      } catch {
      }
      const fire = (Ctor, type, extra = {}) => {
        try {
          if (typeof Ctor === "function") {
            el.dispatchEvent(new Ctor(type, {
              bubbles: true,
              cancelable: true,
              composed: true,
              ...extra
            }));
            return true;
          }
        } catch {
        }
        try {
          const event = document.createEvent("MouseEvents");
          event.initMouseEvent(type, true, true, W, 1, 0, 0, 1, 1, false, false, false, false, 0, null);
          el.dispatchEvent(event);
          return true;
        } catch {
        }
        return false;
      };
      fire(W.PointerEvent || window.PointerEvent, "pointerdown", { pointerId: 1, pointerType: "mouse", isPrimary: true });
      fire(W.MouseEvent || window.MouseEvent, "mousedown", { button: 0, buttons: 1 });
      fire(W.PointerEvent || window.PointerEvent, "pointerup", { pointerId: 1, pointerType: "mouse", isPrimary: true });
      fire(W.MouseEvent || window.MouseEvent, "mouseup", { button: 0, buttons: 0 });
      fire(W.MouseEvent || window.MouseEvent, "click", { button: 0, buttons: 0 });
      try {
        el.click?.();
      } catch {
      }
      return true;
    }
    function findButtonByText(patterns) {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.find(
        (b) => matchesAny(b.textContent.trim(), patterns) && !b.classList.contains("disabled") && !b.disabled
      );
    }
    function clickButtonByText(patterns) {
      const btn = findButtonByText(patterns);
      if (!btn) return false;
      return simulateClick(btn);
    }
    function elementSearchText(el) {
      return [
        compactText(el),
        el?.getAttribute?.("aria-label"),
        el?.getAttribute?.("title"),
        el?.getAttribute?.("data-id"),
        el?.value
      ].filter(Boolean).join(" ");
    }
    function findClickableByText(patterns, root = document) {
      const selectors = [
        "button",
        '[role="button"]',
        "a",
        'input[type="button"]',
        'input[type="submit"]',
        ".call-to-action",
        '[class*="call-to-action"]',
        '[class*="btn"]',
        '[class*="Button"]'
      ].join(",");
      return Array.from(root.querySelectorAll(selectors)).filter(isClickableElement).sort((a, b) => elementSearchText(a).length - elementSearchText(b).length).find((el) => matchesAny(elementSearchText(el), patterns)) || null;
    }
    function simulateKeyStroke(key = "Alt", code = "AltRight", options = {}) {
      const init = {
        key,
        code,
        bubbles: true,
        cancelable: true,
        composed: true,
        location: code === "AltRight" ? 2 : 0,
        altKey: code === "AltRight",
        ...options
      };
      const targets = [
        document.activeElement,
        document.body,
        document,
        W
      ].filter(Boolean);
      for (const target of targets) {
        try {
          target.dispatchEvent(new KeyboardEvent("keydown", init));
        } catch {
        }
        try {
          target.dispatchEvent(new KeyboardEvent("keyup", init));
        } catch {
        }
      }
    }
    function closeFsuStuckOverlay(label = "FSU stuck overlay") {
      const patterns = [
        "If you encounter stuck",
        "click here to close",
        "encounter stuck"
      ];
      const candidates = Array.from(document.querySelectorAll("div, span, p, section")).filter((el) => isClickableElement(el) && matchesAny(compactText(el), patterns)).sort((a, b) => compactText(a).length - compactText(b).length);
      const target = candidates[0];
      if (!target) return false;
      const clickTarget = target.closest?.('button,[role="button"],a') || target;
      log(`Closing ${label}`);
      simulateClick(clickTarget);
      return true;
    }
    function compactText(el) {
      return String(el?.textContent || "").replace(/\s+/g, " ").trim();
    }
    function isClickableElement(el) {
      if (!el) return false;
      if (el.disabled || el.classList?.contains("disabled")) return false;
      const rect = el.getBoundingClientRect?.();
      if (rect && (!rect.width || !rect.height)) return false;
      return true;
    }
    function findRequirementAddControl(requirementPatterns = [], buttonTexts = ["Add"]) {
      const rows = Array.from(document.querySelectorAll("li, section, div")).filter((el) => {
        const text = compactText(el);
        return text && text.length < 500 && matchesAny(text, requirementPatterns);
      }).sort((a, b) => compactText(a).length - compactText(b).length);
      for (const row of rows) {
        const controls = Array.from(row.querySelectorAll('button, [role="button"], a, span, div')).filter(isClickableElement);
        const addControl = controls.find((el) => {
          const text = compactText(el);
          const label = String(el.getAttribute?.("aria-label") || el.getAttribute?.("title") || "");
          const classes = String(el.className || "");
          return matchesAny(text, buttonTexts) || matchesAny(label, buttonTexts) || /\badd\b/i.test(classes);
        });
        if (addControl) {
          return addControl.closest?.('button,[role="button"],a') || addControl;
        }
      }
      return null;
    }
    async function clickRequirementAddControl(config = {}, label = "SBC requirement") {
      const patterns = config.patterns || [];
      if (!patterns.length) return false;
      const btn = findRequirementAddControl(patterns, config.buttonTexts || ["Add"]);
      if (!btn) return false;
      log(`Clicked requirement Add for ${label}`);
      simulateClick(btn);
      await waitLoadingEnd();
      await sleep(CFG.pauseMs);
      return true;
    }
    function findSubmitButton() {
      return document.querySelector("button.ut-squad-tab-button-control.actionTab.right.call-to-action:not(.disabled)") || findButtonByText([
        "Exchange Players",
        "Submit SBC",
        "Submit",
        "\u5151\u6362\u7403\u5458",
        "\u4EA4\u63DB\u7403\u54E1",
        "\u63D0\u4EA4"
      ]);
    }
    function getFilledSquadSlots(squad) {
      const players = squad?.getPlayers?.() || squad?._players || [];
      return players.filter((slot) => slot?._item?.definitionId || slot?.item?.definitionId).length;
    }
    function getRequiredPlayerCount(challenge) {
      try {
        const count = Number(challenge?.squad?.getNumOfRequiredPlayers?.());
        if (Number.isFinite(count) && count > 0) return count;
      } catch {
      }
      try {
        const formation = W.repositories?.Squad?.getFormation?.(challenge?.formation);
        const count = Number(formation?.generalPositions?.length);
        if (Number.isFinite(count) && count > 0) return count;
      } catch {
      }
      return 11;
    }
    function sumRequirementPlayerCount(loopDef = {}) {
      if (!Array.isArray(loopDef.requirements)) return 0;
      return loopDef.requirements.reduce((sum, requirement) => {
        const count = Number(requirement?.count || 0);
        return Number.isFinite(count) && count > 0 ? sum + count : sum;
      }, 0);
    }
    function getPlayerPickChallengeCount(loopDef = {}) {
      return Math.max(1, Number(loopDef.challengeRequirements?.length || loopDef.challengesPerPick || 1) || 1);
    }
    function expectedSbcPlayerCount(loopDef = {}, challenge = null) {
      const values = [];
      const explicit = Number(loopDef.expectedPlayerCount || 0);
      if (Number.isFinite(explicit) && explicit > 0) values.push(explicit);
      if (loopDef.inventoryFillFirst === true) {
        const requirementCount2 = sumRequirementPlayerCount(loopDef);
        if (requirementCount2 > 0) values.push(requirementCount2);
      }
      if (challenge) {
        const required = getRequiredPlayerCount(challenge);
        if (Number.isFinite(required) && required > 0) values.push(required);
      }
      return values.length ? Math.max(...values) : 0;
    }
    function sortSbcFodder(items, spec = {}, settings = getFsuSettings()) {
      return [...items].sort((a, b) => {
        if (settings.priorityNonSpecialPlayers && isSpecial(a) !== isSpecial(b)) {
          return Number(isSpecial(a)) - Number(isSpecial(b));
        }
        const aGoldRange = isInGoldPriorityRange(a, settings);
        const bGoldRange = isInGoldPriorityRange(b, settings);
        if (settings.priorityRareWithinGoldRange && spec.rarity === void 0 && aGoldRange && bGoldRange && isRare(a) !== isRare(b)) {
          return Number(isRare(b)) - Number(isRare(a));
        }
        const aSilverBronze = isBronze(a) || isSilver(a);
        const bSilverBronze = isBronze(b) || isSilver(b);
        if (settings.silverBronzePrioritizeNormal && aSilverBronze && bSilverBronze && isRare(a) !== isRare(b)) {
          return Number(isRare(a)) - Number(isRare(b));
        }
        return Number(a?.rating || 0) - Number(b?.rating || 0) || Number(isRare(a)) - Number(isRare(b)) || Number(a?.id || 0) - Number(b?.id || 0);
      });
    }
    function itemDisplayName(item) {
      const names = [
        [item?.firstName, item?.lastName].filter(Boolean).join(" "),
        item?.name,
        item?.commonName,
        item?.lastName,
        item?._staticData?.name,
        item?._staticData?.commonName,
        item?._staticData?.lastName,
        item?.definitionId,
        item?.id
      ];
      return String(names.find((value) => value !== void 0 && value !== null && String(value).trim()) || "unknown");
    }
    function itemTierLabel(item) {
      if (isBronze(item)) return "bronze";
      if (isSilver(item)) return "silver";
      if (isGold(item)) return "gold";
      return "unknown";
    }
    function formatDryRunItem(entry, index) {
      const item = entry?.item || entry;
      const signal = entry?.signal || null;
      const parts = [
        `${index + 1}. ${itemDisplayName(item)}`,
        `rating:${Number(item?.rating || 0) || "?"}`,
        itemTierLabel(item),
        isRare(item) ? "rare" : "common",
        isTradeable(item) ? "tradeable" : "untradeable",
        `from:${entry?.pileName || "unknown"}`,
        `id:${Number(item?.id || 0) || "?"}`,
        `def:${Number(item?.definitionId || 0) || "?"}`
      ];
      if (signal && Number(signal?.id || 0) !== Number(item?.id || 0)) {
        parts.push(`signal:${Number(signal.id || 0) || "?"}`);
      }
      return parts.join(" | ");
    }
    function logDryRunSelection(label, selection, options = {}) {
      const maxItems = Number(options.maxItems || 30);
      log(`${label}: dry-run selected ${selection?.selected?.length || 0} item(s) (${formatSelectionStats(selection?.stats)})`);
      const entries = selection?.entries || (selection?.selected || []).map((item) => ({ item, pileName: "unknown" }));
      entries.slice(0, maxItems).forEach((entry, index) => log(`dry-run pick ${formatDryRunItem(entry, index)}`));
      if (entries.length > maxItems) log(`dry-run pick list truncated: ${entries.length - maxItems} more item(s)`);
      if (!selection?.ok && selection?.missing) {
        const missing = selection.missing;
        log(`${label}: dry-run missing ${missing.count} ${missing.tier || "any"} ${missing.rarity || ""} item(s)`);
        logSelectionDiagnostics(label, selection, options.priorityPiles);
      }
    }
    function addCount(counts, key) {
      counts[key] = (counts[key] || 0) + 1;
    }
    function formatCounts(counts, limit = 5) {
      const entries = Object.entries(counts || {}).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
      return entries.map(([key, count]) => `${key}:${count}`).join(", ");
    }
    function describeRequirement(requirement = {}) {
      return [
        requirement.count ? `${requirement.count}x` : "",
        requirement.tier || "any-tier",
        requirement.rarity || "",
        requirement.minRating ? `min${requirement.minRating}` : "",
        requirement.maxRating ? `max${requirement.maxRating}` : "",
        requirement.playerOnly ? "player" : "",
        requirement.allowSpecial ? "special-ok" : "no-special"
      ].filter(Boolean).join(" ");
    }
    function getUsabilityRejectReasons(item, options = {}) {
      const reasons = [];
      const id = Number(item?.id || 0);
      const definitionId = Number(item?.definitionId || 0);
      if (!isPlayer(item)) reasons.push("not-player");
      if (id && state.consumedItemIds.has(id)) reasons.push("consumed-this-run");
      if (id && options.protectedItemIds?.some((value) => Number(value) === id)) reasons.push("protected-id");
      if (definitionId && options.protectedDefinitionIds?.some((value) => Number(value) === definitionId)) reasons.push("protected-def");
      if (options.protectHighGold && isProtectedHighGold(item)) reasons.push("protected-82-plus");
      if (isLoanItem(item)) reasons.push("loan");
      else if (isLimitedUseItem(item)) reasons.push("limited-use");
      if (isConceptItem(item)) reasons.push("concept");
      try {
        if (item?.isEnrolledInAcademy?.()) reasons.push("academy");
      } catch {
      }
      if (item?.endTime !== void 0 && Number(item.endTime) !== -1) reasons.push("active-trade");
      if (!isInactiveTrade(item)) reasons.push("active-trade");
      getFsuRejectReasons(item, options).forEach((reason) => reasons.push(reason));
      return reasons;
    }
    function getSpecRejectReasons(item, spec = {}) {
      const reasons = [];
      const rating = Number(item?.rating || 0);
      if (spec.playerOnly && !isPlayer(item)) reasons.push("not-player");
      if (spec.minRating !== void 0 && rating < Number(spec.minRating)) reasons.push(`rating-under-${Number(spec.minRating)}`);
      if (spec.maxRating !== void 0 && rating > Number(spec.maxRating)) reasons.push(`rating-over-${Number(spec.maxRating)}`);
      if (spec.blockTradeable === true && isTradeable(item) && !isNormalGoldFodder(item)) reasons.push("tradeable-blocked");
      if (spec.special === true && !isSpecial(item)) reasons.push("not-special");
      if (spec.special === false && isSpecial(item)) reasons.push("special-blocked");
      if (spec.special !== true && spec.allowSpecial !== true && isSpecial(item)) reasons.push("special-blocked");
      if (spec.tier === "bronze" && !isBronze(item)) reasons.push("tier-not-bronze");
      if (spec.tier === "silver" && !isSilver(item)) reasons.push("tier-not-silver");
      if (spec.tier === "gold" && !isGold(item)) reasons.push("tier-not-gold");
      if (spec.rarity === "rare" && !isRare(item)) reasons.push("rarity-not-rare");
      if (spec.rarity === "common" && isRare(item)) reasons.push("rarity-not-common");
      return reasons;
    }
    function diagnosePileForRequirement(pileName, requirement, settings = getFsuSettings()) {
      const items = getPileItemsByName(pileName);
      const result = {
        total: items.length,
        usable: 0,
        matching: 0,
        uniqueDefinitions: 0,
        duplicateSignals: 0,
        resolvedSignals: 0,
        reasons: {}
      };
      const matchingDefinitions = /* @__PURE__ */ new Set();
      for (const item of items) {
        const usabilityRejects = getUsabilityRejectReasons(item, requirement);
        const specRejects = getSpecRejectReasons(item, requirement);
        const rejects = [...new Set(usabilityRejects.concat(specRejects))];
        if (rejects.length) {
          rejects.forEach((reason) => addCount(result.reasons, reason));
          continue;
        }
        result.usable++;
        result.matching++;
        matchingDefinitions.add(Number(item?.definitionId || 0));
        if (pileNeedsDuplicateSignalResolution(pileName)) {
          if (!isDuplicate(item)) {
            addCount(result.reasons, "duplicate-signal-required");
            continue;
          }
          result.duplicateSignals++;
          const resolved = findSubmissionItemForDuplicateSignal(item, /* @__PURE__ */ new Set(), requirement, settings);
          if (resolved) {
            result.resolvedSignals++;
          } else {
            addCount(result.reasons, "duplicate-signal-unresolved");
          }
        }
      }
      result.uniqueDefinitions = Array.from(matchingDefinitions).filter(Boolean).length;
      return result;
    }
    function logRequirementDiagnostics(label, requirement, fallbackPriorityPiles) {
      const settings = getFsuSettings();
      const piles = applyFsuPilePriority(requirement?.priorityPiles || fallbackPriorityPiles || ["storage", "transfer", "club"], settings);
      const diagnostics = [];
      log(`${label}: diagnostics for ${describeRequirement(requirement)} across ${piles.join(" > ")}`);
      for (const pileName of piles) {
        const diag = diagnosePileForRequirement(pileName, requirement, settings);
        diagnostics.push({ pileName, ...diag });
        const signalText = pileNeedsDuplicateSignalResolution(pileName) ? `, duplicate signals:${diag.duplicateSignals}, resolved:${diag.resolvedSignals}` : "";
        log(`${label}: ${pileName} total:${diag.total}, matching:${diag.matching}, unique defs:${diag.uniqueDefinitions}${signalText}`);
        const rejectText = formatCounts(diag.reasons);
        if (rejectText) log(`${label}: ${pileName} rejects ${rejectText}`);
      }
      return diagnostics;
    }
    function logActiveFsuSelectionGuards(label, diagnostics = [], settings = getFsuSettings()) {
      const fsuRejects = {};
      diagnostics.forEach((diag) => {
        Object.entries(diag?.reasons || {}).forEach(([reason, count]) => {
          if (reason.startsWith("fsu-")) {
            fsuRejects[reason] = (fsuRejects[reason] || 0) + Number(count || 0);
          }
        });
      });
      if (!Object.keys(fsuRejects).length) return;
      const active = [];
      if (settings.onlyUntradeable) active.push("Only Untradeable");
      const excludedLeagueIds = uniqueNumberList(settings.excludedLeagueIds || []);
      if (settings.excludeDesignatedLeagues && excludedLeagueIds.length) {
        active.push(`Exclude designated league (${excludedLeagueIds.join("/")})`);
      }
      if (settings.excludeEvolution) active.push("Exclude Evolution");
      if (settings.useRarityPlayer === false) active.push("Use Rarity Player off");
      if (Object.keys(fsuRejects).some((reason) => reason.startsWith("fsu-gold-range-"))) {
        const range = settings.goldRange || FSU_COMPAT_DEFAULTS.goldRange;
        active.push(`Golden Player Range (${range[0]}-${range[1]})`);
      }
      const lockedCount = uniqueNumberList([
        ...settings.lockedItemIds || [],
        ...settings.lockedDefinitionIds || []
      ]).length;
      if (lockedCount) active.push(`Lock player (${lockedCount})`);
      log(`${label}: active FSU filters affected this selection: ${formatCounts(fsuRejects, 20)}`);
      if (active.length) log(`${label}: FSU guards in force: ${active.join("; ")}`);
      log(`${label}: Runner will not bypass FSU filters; adjust FSU SBC ignore player configuration and retry if these cards should be usable`);
    }
    function logSelectionDiagnostics(label, selection, fallbackPriorityPiles) {
      if (!selection?.missing) return [];
      const diagnostics = logRequirementDiagnostics(label, selection.missing, fallbackPriorityPiles);
      logActiveFsuSelectionGuards(label, diagnostics);
      return diagnostics;
    }
    function getSubmissionCacheItems() {
      return uniqueItems(getStorageItems().concat(getClubItems()));
    }
    function duplicateSignalDiagnostic(signal, requirement = {}, settings = getFsuSettings()) {
      const signalId = Number(signal?.id || signal?.ref?.id || 0);
      const definitionId = Number(signal?.definitionId || signal?.ref?.definitionId || 0);
      const duplicateId = Number(signal?.duplicateId || 0);
      const candidates = getSubmissionCacheItems().filter((item) => Number(item?.id || 0) === duplicateId || Number(item?.definitionId || 0) === definitionId).map((item) => {
        const reasons = [.../* @__PURE__ */ new Set([
          ...getUsabilityRejectReasons(item, requirement),
          ...getSpecRejectReasons(item, requirement)
        ])];
        return {
          id: Number(item?.id || 0),
          definitionId: Number(item?.definitionId || 0),
          pile: liveItemRef(item).pile,
          rating: Number(item?.rating || 0),
          tradeable: isTradeable(item),
          consumed: state.consumedItemIds.has(Number(item?.id || 0)),
          reasons
        };
      });
      const resolved = findSubmissionItemForDuplicateSignal(signal, /* @__PURE__ */ new Set(), requirement, settings);
      const signalReasons = [.../* @__PURE__ */ new Set([
        ...getUsabilityRejectReasons(signal, requirement),
        ...getSpecRejectReasons(signal, requirement)
      ])];
      return {
        signalId,
        definitionId,
        duplicateId,
        name: itemDisplayName(signal),
        rating: Number(signal?.rating || 0),
        rareflag: itemRareFlag(signal),
        tradeable: isTradeable(signal),
        leagueId: itemLeagueId2(signal),
        evolution: isEvolutionItem(signal),
        resolvedId: Number(resolved?.id || 0),
        signalReasons,
        candidates
      };
    }
    function logDuplicateSignalDiagnostics(label, signals = [], requirement = {}, selection = null) {
      if (!signals.length) return [];
      const selectedSignalIds = new Set((selection?.entries || []).filter((entry) => entry.pileName === "unassigned" && entry.signal).map((entry) => Number(entry.signal?.id || 0)).filter(Boolean));
      const settings = getFsuSettings();
      const diagnostics = signals.map((signal) => duplicateSignalDiagnostic(signal, requirement, settings));
      log(`${label}: duplicate resolution diagnostics ${selectedSignalIds.size}/${diagnostics.length} signal(s) selected; ${formatFsuSettings(settings)}; consumed cache:${state.consumedItemIds.size}`);
      diagnostics.forEach((diag, index) => {
        log(`${label}: signal ${index + 1}/${diagnostics.length} selected:${selectedSignalIds.has(diag.signalId) ? "yes" : "no"} name:${diag.name} id:${diag.signalId || "?"} def:${diag.definitionId || "?"} duplicateId:${diag.duplicateId || "?"} rating:${diag.rating || "?"} rareflag:${diag.rareflag} tradeable:${diag.tradeable ? "yes" : "no"} league:${diag.leagueId || "?"} evo:${diag.evolution ? "yes" : "no"} signal rejects:${diag.signalReasons.join("/") || "none"} resolved:${diag.resolvedId || "none"}`);
        if (!diag.candidates.length) {
          log(`${label}: signal ${index + 1} candidate cache: none in Club/Storage`);
          return;
        }
        diag.candidates.forEach((candidate) => {
          log(`${label}: signal ${index + 1} candidate id:${candidate.id || "?"} def:${candidate.definitionId || "?"} pile:${candidate.pile} rating:${candidate.rating || "?"} tradeable:${candidate.tradeable ? "yes" : "no"} consumed:${candidate.consumed ? "yes" : "no"} rejects:${candidate.reasons.join("/") || "none"}`);
        });
      });
      return diagnostics;
    }
    function isSameDefinition(a, b) {
      return Number(a?.definitionId || 0) === Number(b?.definitionId || -1);
    }
    function findSubmissionItemForDuplicateSignal(signal, usedIds, spec = {}, settings = getFsuSettings()) {
      const duplicateId = Number(signal?.duplicateId || 0);
      const cacheItems = getSubmissionCacheItems().filter(
        (item) => isSbcUsablePlayer(item, spec) && itemMatchesSpec(item, spec, settings) && !usedIds.has(Number(item?.id || 0))
      );
      if (duplicateId) {
        const direct = cacheItems.find((item) => Number(item?.id || 0) === duplicateId);
        if (direct) return direct;
      }
      return sortSbcFodder(cacheItems, spec, settings).find((item) => isSameDefinition(item, signal)) || null;
    }
    function pileNeedsDuplicateSignalResolution(pileName) {
      return pileName === "transfer" || pileName === "unassigned";
    }
    function resolveSelectionPlanToRuntime(plan, inventoryAdapter, transientUnassignedSignals = []) {
      const resolvedByRef = (ref) => ref ? inventoryAdapter.resolveItem(ref)?.item || null : null;
      const transientById = new Map((transientUnassignedSignals || []).map((signal) => [Number(signal?.id || signal?.ref?.id || 0), signal]).filter(([id]) => id));
      const resolvedSignalByRef = (ref) => {
        const live = resolvedByRef(ref);
        if (live) return live;
        return transientById.get(Number(ref?.id || 0)) || null;
      };
      const selected = plan.selected.map((item) => resolvedByRef(item.ref));
      if (selected.some((item) => !item)) {
        return {
          ok: false,
          selected: selected.filter(Boolean),
          entries: [],
          stats: { ...plan.pileCounts },
          missing: plan.missing || { count: 1, reason: "selection-item-stale" },
          resolvedSignals: {}
        };
      }
      const entries = plan.entries.map((entry) => ({
        pileName: entry.pileName,
        signal: entry.signalRef ? resolvedSignalByRef(entry.signalRef) : null,
        item: resolvedByRef(entry.itemRef)
      }));
      if (entries.some((entry, index) => !entry.item || plan.entries[index]?.signalRef && !entry.signal)) {
        return {
          ok: false,
          selected,
          entries: entries.filter((entry) => entry.item),
          stats: { ...plan.pileCounts },
          missing: plan.missing || { count: 1, reason: "selection-signal-stale" },
          resolvedSignals: {}
        };
      }
      const resolvedSignals = plan.duplicateSignals.reduce((counts, signal) => {
        counts[signal.pileName] = (counts[signal.pileName] || 0) + 1;
        return counts;
      }, {});
      return {
        ok: plan.ok,
        selected,
        entries,
        stats: { ...plan.pileCounts },
        missing: plan.missing,
        resolvedSignals,
        diagnostics: plan.diagnostics,
        plan
      };
    }
    function selectInventoryPlayers3(requirementsOrLoopDef, priorityPiles = null, options = {}) {
      const effectivePriorityPiles = priorityPiles || (Array.isArray(requirementsOrLoopDef) ? ["storage", "transfer", "club"] : requirementsOrLoopDef?.priorityPiles || ["storage", "transfer", "club"]);
      const requirements = Array.isArray(requirementsOrLoopDef) ? requirementsOrLoopDef : selectionRequirements(requirementsOrLoopDef || {}, effectivePriorityPiles);
      const inventoryAdapter = createEaInventoryAdapter(W);
      const transientUnassignedSignals = options.transientUnassignedSignals || [];
      const inventorySnapshot = mergeTransientUnassignedSignals(
        inventoryAdapter.snapshot(),
        transientUnassignedSignals
      );
      const plan = selectInventoryPlayers2({
        inventorySnapshot,
        requirements,
        priorityPiles: effectivePriorityPiles,
        fsuPolicy: getFsuSettings(),
        consumedItemIds: [...state.consumedItemIds],
        preferredSignalRefs: options.preferredSignalRefs || []
      });
      return resolveSelectionPlanToRuntime(plan, inventoryAdapter, transientUnassignedSignals);
    }
    function eligibilityKeyName(key) {
      const keyText = String(key ?? "").trim();
      const known = Object.entries(W.SBCEligibilityKey || {}).find(([, value]) => String(value) === keyText);
      if (known) return known[0];
      if (/^[A-Z][A-Z0-9_]+$/.test(keyText)) return keyText;
      return `UNKNOWN_${keyText || "?"}`;
    }
    function requirementFirstKey(requirement) {
      try {
        const key = requirement?.getFirstKey?.();
        if (key !== void 0 && key !== null) return key;
      } catch {
      }
      const collection = requirement?.kvPairs?._collection || requirement?.kvPairs || {};
      return Object.keys(collection)[0];
    }
    function flattenRequirementValues(value) {
      if (Array.isArray(value)) return value.flat(Infinity).filter((entry) => entry !== void 0 && entry !== null);
      if (value === void 0 || value === null) return [];
      return [value];
    }
    function requirementValues(requirement, key) {
      try {
        const values = requirement?.getValue?.(key);
        const flattened = flattenRequirementValues(values);
        if (flattened.length) return flattened;
      } catch {
      }
      const collection = requirement?.kvPairs?._collection || requirement?.kvPairs || {};
      const direct = flattenRequirementValues(collection?.[key]);
      if (direct.length) return direct;
      try {
        return flattenRequirementValues(requirement?.getFirstValue?.(key));
      } catch {
        return [];
      }
    }
    function requirementCount(requirement, requiredPlayerCount) {
      const count = Number(requirement?.count);
      if (count === -1 || !Number.isFinite(count)) return requiredPlayerCount;
      return Math.max(0, Math.min(requiredPlayerCount, count));
    }
    function itemRareFlag(item) {
      return Number(item?.rareflag ?? item?.rareFlag ?? item?._rareflag ?? item?._staticData?.rareflag ?? 0);
    }
    function itemMatchesDynamicRequirement(item, requirement, keyName, rawValues) {
      try {
        if (typeof requirement?.meetsRequirements === "function") {
          const result = requirement.meetsRequirements(item);
          if (typeof result === "boolean") return result;
        }
      } catch {
      }
      const values = rawValues.map(Number).filter(Number.isFinite);
      const rating = Number(item?.rating || 0);
      switch (keyName) {
        case "PLAYER_QUALITY":
        case "PLAYER_LEVEL":
          return values.some(
            (value) => value === 1 && isBronze(item) || value === 2 && isSilver(item) || value === 3 && isGold(item) || value === 4 && isSbcSpecialItem(item)
          );
        case "PLAYER_RARITY":
          return values.includes(itemRareFlag(item));
        case "PLAYER_RARITY_GROUP":
          return values.some((value) => itemGroupNumbers(item).includes(value));
        case "PLAYER_MIN_OVR":
          return values.length > 0 && rating >= Math.min(...values);
        case "PLAYER_EXACT_OVR":
          return values.includes(rating);
        case "CLUB_ID":
          return values.includes(Number(item?.teamId ?? item?.clubId ?? item?._staticData?.teamId ?? 0));
        case "LEAGUE_ID":
          return values.includes(itemLeagueId2(item));
        case "NATION_ID":
          return values.includes(Number(item?.nationId ?? item?._staticData?.nationId ?? 0));
        default:
          return false;
      }
    }
    const RATING_SBC_PLAYER_REQUIREMENT_KEYS = /* @__PURE__ */ new Set([
      "PLAYER_QUALITY",
      "PLAYER_LEVEL",
      "PLAYER_RARITY",
      "PLAYER_RARITY_GROUP",
      "PLAYER_MIN_OVR",
      "PLAYER_EXACT_OVR",
      "CLUB_ID",
      "LEAGUE_ID",
      "NATION_ID"
    ]);
    function parseRatingSbcChallenge(loopDef, challenge) {
      const requiredPlayerCount = expectedSbcPlayerCount(loopDef, challenge) || getRequiredPlayerCount(challenge);
      const constraints = [];
      const unsupported = [];
      let targetRating = Number(loopDef.ratingSbcFill?.targetRating || 0) || 0;
      for (const requirement of challenge?.eligibilityRequirements || []) {
        const key = requirementFirstKey(requirement);
        const keyName = eligibilityKeyName(key);
        const values = requirementValues(requirement, key);
        if (keyName === "TEAM_RATING") {
          const ratings = values.map(Number).filter(Number.isFinite);
          if (ratings.length) targetRating = Math.max(targetRating, ...ratings);
          continue;
        }
        if (keyName === "CHEMISTRY_POINTS" || keyName === "ALL_PLAYERS_CHEMISTRY_POINTS") {
          unsupported.push(keyName);
          continue;
        }
        if (!RATING_SBC_PLAYER_REQUIREMENT_KEYS.has(keyName)) {
          unsupported.push(keyName);
          continue;
        }
        const count = requirementCount(requirement, requiredPlayerCount);
        if (!count || !values.length) {
          unsupported.push(`${keyName}(count:${requirement?.count ?? "?"}, values:${values.join("/") || "?"})`);
          continue;
        }
        constraints.push({
          id: `challenge-${constraints.length}`,
          label: `${keyName} ${values.join("/")} x${count}`,
          count,
          matches: (item) => itemMatchesDynamicRequirement(item, requirement, keyName, values)
        });
      }
      const configuredSpecialCount = Math.max(0, Number(loopDef.requiredSpecialCount || 0) || 0);
      if (configuredSpecialCount) {
        constraints.push({
          id: "runner-required-special",
          label: `${requiredSpecialLabel(loopDef)} rating >= ${Number(loopDef.requiredSpecialMinRating || 0) || 0} x${configuredSpecialCount}`,
          count: configuredSpecialCount,
          matches: (item) => isRequiredSpecialItem(item, loopDef) && Number(item?.rating || 0) >= Math.max(0, Number(loopDef.requiredSpecialMinRating || 0) || 0)
        });
      }
      const configuredAllowedSpecial = loopDef.allowedSpecialCount !== void 0 ? Math.max(0, Number(loopDef.allowedSpecialCount || 0) || 0) : null;
      return {
        requiredPlayerCount,
        targetRating,
        constraints,
        unsupported: [...new Set(unsupported)],
        maxSpecialCount: configuredAllowedSpecial === null ? loopDef.blockSpecial === false ? requiredPlayerCount : 0 : configuredAllowedSpecial
      };
    }
    function validateRatingSbcModelAgainstItems(model, items = [], challenge = null) {
      const players = (items || []).filter(Boolean);
      const errors = [];
      const requiredPlayerCount = Math.max(0, Number(model?.requiredPlayerCount || 0) || 0);
      const ratings = players.map((item) => Number(item?.rating || 0));
      const rating = players.length === requiredPlayerCount ? calculateEaSquadRating(ratings, requiredPlayerCount) : 0;
      const definitionIds = players.map((item) => Number(item?.definitionId || 0)).filter(Boolean);
      const uniqueDefinitionCount = new Set(definitionIds).size;
      if (players.length !== requiredPlayerCount) {
        errors.push(`player-count ${players.length}/${requiredPlayerCount}`);
      }
      if (definitionIds.length !== players.length || uniqueDefinitionCount !== players.length) {
        errors.push(`unique-definitions ${uniqueDefinitionCount}/${players.length}`);
      }
      if (players.length === requiredPlayerCount && rating < Number(model?.targetRating || 0)) {
        errors.push(`team-rating ${rating}/${Number(model?.targetRating || 0)}`);
      }
      const constraintResults = (model?.constraints || []).map((constraint) => {
        const matched = players.filter((item) => {
          try {
            return constraint.matches(item);
          } catch {
            return false;
          }
        }).length;
        const required = Math.max(0, Number(constraint.count || 0) || 0);
        if (matched < required) errors.push(`${constraint.label} ${matched}/${required}`);
        return { constraint, matched, required };
      });
      const specialCount = players.filter(isSbcSpecialItem).length;
      if (specialCount > Number(model?.maxSpecialCount || 0)) {
        errors.push(`special-count ${specialCount}/${Number(model?.maxSpecialCount || 0)}`);
      }
      let challengeReady = null;
      if (challenge && typeof challenge.meetsRequirements === "function") {
        try {
          challengeReady = !!challenge.meetsRequirements();
          if (!challengeReady) errors.push("challenge.meetsRequirements() returned false");
        } catch (error) {
          errors.push(`challenge.meetsRequirements() failed: ${error?.message || error}`);
        }
      }
      return {
        ok: errors.length === 0,
        errors,
        players,
        ratings,
        rating,
        specialCount,
        uniqueDefinitionCount,
        constraintResults,
        challengeReady
      };
    }
    function logRatingSbcValidation(loopDef, label, validation, model) {
      log(`${loopDef.name}: ${label} rating ${validation.rating}/${model.targetRating}, players ${validation.players.length}/${model.requiredPlayerCount}, special ${validation.specialCount}/${model.maxSpecialCount}, unique definitions ${validation.uniqueDefinitionCount}/${validation.players.length}`);
      validation.constraintResults.forEach(({ constraint, matched, required }) => {
        log(`${loopDef.name}: ${label} constraint ${constraint.label}: ${matched}/${required}`);
      });
      if (validation.challengeReady !== null) {
        log(`${loopDef.name}: ${label} local challenge.meetsRequirements(): ${validation.challengeReady ? "true" : "false"}`);
      }
      validation.errors.forEach((error) => log(`${loopDef.name}: ${label} validation failed: ${error}`));
    }
    function isRatingSbcCandidateSafe(item, loopDef, model = null, context = null) {
      const allowedSpecialCount = model ? model.maxSpecialCount : Math.max(0, Number(loopDef.allowedSpecialCount || 0) || 0);
      if (!isPlayer(item)) return false;
      if (isSbcSpecialItem(item)) {
        if (!allowedSpecialCount) return false;
        if (requiredSpecialKind(loopDef) && !isRequiredSpecialItem(item, loopDef)) return false;
      }
      return getSbcProtectionReasons(item, loopDef, {
        ...context || {},
        allowedSpecialCount,
        specialIndex: isSbcSpecialItem(item) ? 1 : 0
      }).length === 0;
    }
    function isResolvableRatingSbcUnassignedDuplicate(item, loopDef) {
      if (!isDuplicate(item) || !isPlayer(item)) return false;
      const resolved = findSubmissionItemForDuplicateSignal(item, /* @__PURE__ */ new Set(), {
        playerOnly: true,
        allowSpecial: true,
        protectedItemIds: loopDef.protectedItemIds,
        protectedDefinitionIds: loopDef.protectedDefinitionIds
      });
      if (!resolved) return false;
      return isRatingSbcCandidateSafe(resolved, loopDef);
    }
    function buildRatingSbcCandidateEntries(loopDef, model) {
      const startedAt = Date.now();
      const settings = getFsuSettings();
      const piles = applyFsuPilePriority(
        loopDef.ratingSbcFill?.priorityPiles || loopDef.priorityPiles || ["unassigned", "storage", "transfer", "club"],
        settings
      );
      const byItemId = /* @__PURE__ */ new Map();
      const resolvedSignals = {};
      const protectedItemIds = new Set((loopDef.protectedItemIds || []).map(Number).filter(Boolean));
      const protectedDefinitionIds = new Set((loopDef.protectedDefinitionIds || []).map(Number).filter(Boolean));
      const context = {
        settings,
        protectedItemIds,
        protectedDefinitionIds,
        lockedItemIds: new Set((settings.lockedItemIds || []).map(Number).filter(Boolean)),
        lockedDefinitionIds: new Set((settings.lockedDefinitionIds || []).map(Number).filter(Boolean)),
        excludedLeagueIds: (settings.excludedLeagueIds || []).map(Number).filter((id) => Number.isFinite(id) && id > 0)
      };
      const broadSpec = {
        playerOnly: true,
        allowSpecial: true,
        protectedItemIds: loopDef.protectedItemIds,
        protectedDefinitionIds: loopDef.protectedDefinitionIds
      };
      const safetyCache = /* @__PURE__ */ new Map();
      const isSafe = (item) => {
        const itemId = Number(item?.id || 0);
        if (!itemId) return false;
        if (!safetyCache.has(itemId)) safetyCache.set(itemId, isRatingSbcCandidateSafe(item, loopDef, model, context));
        return safetyCache.get(itemId);
      };
      const submissionItems = getSubmissionCacheItems().filter(isSafe);
      const submissionById = /* @__PURE__ */ new Map();
      const submissionByDefinition = /* @__PURE__ */ new Map();
      for (const item of submissionItems) {
        const itemId = Number(item?.id || 0);
        const definitionId = Number(item?.definitionId || 0);
        if (itemId) submissionById.set(itemId, item);
        if (!definitionId) continue;
        const entries = submissionByDefinition.get(definitionId) || [];
        entries.push(item);
        submissionByDefinition.set(definitionId, entries);
      }
      for (const entries of submissionByDefinition.values()) {
        const sorted = sortSbcFodder(entries, broadSpec, settings);
        entries.splice(0, entries.length, ...sorted);
      }
      function resolveSignal(sourceItem) {
        const duplicateId = Number(sourceItem?.duplicateId || 0);
        if (duplicateId && submissionById.has(duplicateId)) return submissionById.get(duplicateId);
        const definitionId = Number(sourceItem?.definitionId || 0);
        return submissionByDefinition.get(definitionId)?.[0] || null;
      }
      const requirementCache = /* @__PURE__ */ new Map();
      let scannedItems = 0;
      for (const pileName of piles) {
        for (const sourceItem of getPileItemsByName(pileName)) {
          scannedItems++;
          let item = sourceItem;
          let signal = null;
          if (pileNeedsDuplicateSignalResolution(pileName)) {
            if (!isDuplicate(sourceItem)) continue;
            item = resolveSignal(sourceItem);
            if (!item) continue;
            signal = sourceItem;
          }
          const itemId = Number(item?.id || 0);
          const definitionId = Number(item?.definitionId || 0);
          if (!itemId || !definitionId || byItemId.has(itemId)) continue;
          if (!isSafe(item)) continue;
          if (!requirementCache.has(itemId)) {
            requirementCache.set(itemId, model.constraints.map((constraint) => constraint.matches(item)));
          }
          const requirementMatches = requirementCache.get(itemId);
          byItemId.set(itemId, {
            item,
            signal,
            pileName,
            pileRank: piles.indexOf(pileName),
            requirementMatches,
            special: isSbcSpecialItem(item)
          });
          if (signal) resolvedSignals[pileName] = (resolvedSignals[pileName] || 0) + 1;
        }
      }
      const byDefinition = /* @__PURE__ */ new Map();
      for (const entry of byItemId.values()) {
        const definitionId = Number(entry.item?.definitionId || 0);
        const existing = byDefinition.get(definitionId);
        if (!existing || entry.pileRank < existing.pileRank || entry.pileRank === existing.pileRank && Number(entry.item?.id || 0) < Number(existing.item?.id || 0)) {
          byDefinition.set(definitionId, entry);
        }
      }
      return {
        entries: [...byDefinition.values()],
        piles,
        resolvedSignals,
        buildMs: Date.now() - startedAt,
        scannedItems
      };
    }
    function comparePileSelections2(a, b, piles) {
      for (const pile of piles) {
        const aCount = Number(a?.pileCounts?.[pile] || 0);
        const bCount = Number(b?.pileCounts?.[pile] || 0);
        if (aCount !== bCount) return bCount - aCount;
      }
      const aIds = (a?.entries || []).map((entry) => Number(entry.item?.id || 0)).sort((x, y) => x - y);
      const bIds = (b?.entries || []).map((entry) => Number(entry.item?.id || 0)).sort((x, y) => x - y);
      for (let index = 0; index < Math.max(aIds.length, bIds.length); index++) {
        if ((aIds[index] || 0) !== (bIds[index] || 0)) return (aIds[index] || 0) - (bIds[index] || 0);
      }
      return 0;
    }
    function mergePileCounts2(a = {}, b = {}) {
      const result = { ...a };
      Object.entries(b).forEach(([pile, count]) => {
        result[pile] = Number(result[pile] || 0) + Number(count || 0);
      });
      return result;
    }
    function ratingGroupSelectionOptions2(entries, count, model, piles) {
      if (!count) return [{ entries: [], progress: model.constraints.map(() => 0), specialCount: 0, pileCounts: {} }];
      const signatureCounts = /* @__PURE__ */ new Map();
      const compactEntries = entries.filter((entry) => {
        const signature = `${entry.requirementMatches.map(Number).join("")}:${Number(entry.special)}:${entry.pileName}`;
        const seen = Number(signatureCounts.get(signature) || 0);
        if (seen >= count) return false;
        signatureCounts.set(signature, seen + 1);
        return true;
      });
      let states = /* @__PURE__ */ new Map();
      states.set(`0|0|${model.constraints.map(() => 0).join(".")}`, {
        entries: [],
        progress: model.constraints.map(() => 0),
        specialCount: 0,
        pileCounts: {}
      });
      for (const entry of compactEntries) {
        const next = new Map(states);
        for (const state2 of states.values()) {
          if (state2.entries.length >= count) continue;
          const specialCount = state2.specialCount + Number(entry.special);
          if (specialCount > model.maxSpecialCount) continue;
          const progress = state2.progress.map((value, index) => Math.min(
            model.constraints[index].count,
            value + Number(entry.requirementMatches[index])
          ));
          const candidate = {
            entries: [...state2.entries, entry],
            progress,
            specialCount,
            pileCounts: mergePileCounts2(state2.pileCounts, { [entry.pileName]: 1 })
          };
          const key = `${candidate.entries.length}|${specialCount}|${progress.join(".")}`;
          const existing = next.get(key);
          if (!existing || comparePileSelections2(candidate, existing, piles) < 0) next.set(key, candidate);
        }
        states = next;
      }
      return [...states.values()].filter((state2) => state2.entries.length === count);
    }
    function buildRatingMaterializationContext(entries, model, piles) {
      const entriesByRating = /* @__PURE__ */ new Map();
      for (const entry of entries) {
        const rating = Number(entry.item?.rating || 0);
        if (!rating) continue;
        const group = entriesByRating.get(rating) || [];
        group.push(entry);
        entriesByRating.set(rating, group);
      }
      for (const group of entriesByRating.values()) {
        group.sort((a, b) => a.pileRank - b.pileRank || Number(a.item?.id || 0) - Number(b.item?.id || 0));
      }
      return { entriesByRating, optionCache: /* @__PURE__ */ new Map(), model, piles };
    }
    function materializeRatingVector2(context, descendingRatings) {
      const { entriesByRating, optionCache, model, piles } = context;
      const counts = /* @__PURE__ */ new Map();
      descendingRatings.forEach((rating) => counts.set(rating, (counts.get(rating) || 0) + 1));
      let combined = /* @__PURE__ */ new Map();
      combined.set(`0|${model.constraints.map(() => 0).join(".")}`, {
        entries: [],
        progress: model.constraints.map(() => 0),
        specialCount: 0,
        pileCounts: {}
      });
      for (const [rating, count] of [...counts.entries()].sort((a, b) => b[0] - a[0])) {
        const cacheKey = `${rating}:${count}`;
        let options = optionCache.get(cacheKey);
        if (!options) {
          options = ratingGroupSelectionOptions2(entriesByRating.get(Number(rating)) || [], count, model, piles);
          optionCache.set(cacheKey, options);
        }
        if (!options.length) return null;
        const next = /* @__PURE__ */ new Map();
        for (const base of combined.values()) {
          for (const option of options) {
            const specialCount = base.specialCount + option.specialCount;
            if (specialCount > model.maxSpecialCount) continue;
            const progress = base.progress.map((value, index) => Math.min(
              model.constraints[index].count,
              value + option.progress[index]
            ));
            const candidate = {
              entries: [...base.entries, ...option.entries],
              progress,
              specialCount,
              pileCounts: mergePileCounts2(base.pileCounts, option.pileCounts)
            };
            const key = `${specialCount}|${progress.join(".")}`;
            const existing = next.get(key);
            if (!existing || comparePileSelections2(candidate, existing, piles) < 0) next.set(key, candidate);
          }
        }
        combined = next;
        if (!combined.size) return null;
      }
      return [...combined.values()].filter((state2) => state2.progress.every((value, index) => value >= model.constraints[index].count)).sort((a, b) => comparePileSelections2(a, b, piles))[0] || null;
    }
    function ratingSelectionItemSnapshot(item, pileName) {
      return createItemSnapshot({
        id: item?.id,
        definitionId: item?.definitionId,
        type: isPlayer(item) ? "player" : item?.type,
        name: itemDisplayName(item),
        rating: item?.rating,
        rareflag: itemRareFlag(item),
        rare: isRare(item),
        special: isSbcSpecialItem(item),
        duplicate: isDuplicate(item),
        duplicateId: item?.duplicateId,
        tradeable: isTradeable(item),
        leagueId: itemLeagueId2(item),
        identityIds: itemIdentifierNumbers(item),
        evolution: isEvolutionItem(item),
        limitedUse: isLimitedUseItem(item),
        concept: isConceptItem(item),
        academyEnrolled: (() => {
          try {
            return item?.isEnrolledInAcademy?.() === true;
          } catch {
            return false;
          }
        })(),
        activeTrade: !isInactiveTrade(item),
        endTime: item?.endTime,
        groups: itemGroupNumbers(item)
      }, pileName);
    }
    async function findOptimalRatingSbcSelection(candidateEntries, model, piles, options = {}) {
      const liveById = /* @__PURE__ */ new Map();
      const snapshotEntries = candidateEntries.map((entry) => {
        const item = ratingSelectionItemSnapshot(entry.item, entry.pileName);
        const signal = entry.signal ? ratingSelectionItemSnapshot(entry.signal, entry.pileName) : null;
        liveById.set(Number(item.id), entry.item);
        if (signal) liveById.set(Number(signal.id), entry.signal);
        return {
          item,
          signal,
          pileName: entry.pileName,
          pileRank: entry.pileRank,
          requirementMatches: [...entry.requirementMatches],
          special: entry.special === true
        };
      });
      const plan = await selectInventoryPlayers2({
        mode: "rating",
        candidateEntries: snapshotEntries,
        ratingModel: model,
        priorityPiles: piles,
        searchOptions: options,
        control: {
          shouldStop: () => state.stopping,
          yieldControl: () => sleep(0)
        }
      });
      if (!plan.ok) {
        return {
          ok: false,
          reason: plan.details.reason || plan.missing?.reason || "rating selection failed",
          nodes: Number(plan.details.nodes || 0)
        };
      }
      const entries = plan.entries.map((entry) => ({
        item: liveById.get(Number(entry.itemRef?.id || 0)) || null,
        signal: entry.signalRef ? liveById.get(Number(entry.signalRef.id || 0)) || null : null,
        pileName: entry.pileName,
        pileRank: entry.pileRank,
        requirementMatches: entry.requirementMatches,
        special: entry.special
      }));
      if (entries.some((entry, index) => !entry.item || plan.entries[index]?.signalRef && !entry.signal)) {
        return { ok: false, reason: "rating selection item became stale during plan resolution", nodes: Number(plan.details.nodes || 0) };
      }
      return {
        ok: true,
        entries,
        selected: entries.map((entry) => entry.item),
        rating: Number(plan.details.rating || 0),
        ratings: [...plan.details.ratings || []],
        pileCounts: { ...plan.pileCounts },
        nodes: Number(plan.details.nodes || 0),
        plan
      };
    }
    function selectedItemsFromPile(selection, pileName) {
      const pileIds = new Set(getPileItemsByName(pileName).map((item) => Number(item?.id || 0)));
      return (selection?.selected || []).filter((item) => pileIds.has(Number(item?.id || 0)));
    }
    async function prepareInventorySelection(loopDef, selection) {
      const transferItems = selectedItemsFromPile(selection, "transfer");
      if (!transferItems.length) {
        const resolvedSignals = selection?.resolvedSignals || {};
        for (const [pileName, count] of Object.entries(resolvedSignals)) {
          if (count) log(`${loopDef.name}: resolved ${count} ${pileName} duplicate signal(s) during inventory selection`);
        }
        return selection;
      }
      const transferIds = new Set(transferItems.map((item) => Number(item?.id || 0)));
      const usedIds = new Set(
        (selection.selected || []).filter((item) => !transferIds.has(Number(item?.id || 0))).map((item) => Number(item?.id || 0))
      );
      let resolvedCount = 0;
      const selected = (selection.selected || []).map((item) => {
        const itemId = Number(item?.id || 0);
        if (!transferIds.has(itemId)) return item;
        const resolved = findSubmissionItemForDuplicateSignal(item, usedIds);
        if (!resolved) {
          const name = item?.name || item?.lastName || item?.definitionId || itemId || "unknown";
          fail(`${loopDef.name}: transfer item ${name} cannot be resolved to a club/storage duplicate for SBC submit`);
        }
        usedIds.add(Number(resolved.id));
        resolvedCount++;
        return resolved;
      });
      log(`${loopDef.name}: resolved ${resolvedCount} transfer item(s) through duplicateId to club/storage submit item(s)`);
      return { ...selection, selected, resolvedSignals: { ...selection.resolvedSignals || {}, transfer: resolvedCount } };
    }
    function buildSquadPlayerList(challenge, players) {
      const substitute = [...players];
      let slotCount = getRequiredPlayerCount(challenge);
      try {
        const formation = W.repositories?.Squad?.getFormation?.(challenge?.formation);
        slotCount = Math.max(slotCount, (formation?.generalPositions || []).length + 12);
      } catch {
      }
      const result = [];
      for (let i = 0; i < slotCount; i++) {
        const slot = challenge?.squad?.getSlot?.(i);
        if (slot && typeof slot.isBrick === "function" && slot.isBrick()) {
          result.push(null);
        } else {
          result.push(substitute.shift() || null);
        }
      }
      return result;
    }
    async function saveChallengeSquad(challenge, players, label = "SBC", options = {}) {
      const squad = challenge?.squad || ctrl()?._squad;
      if (!squad) fail(`${label}: squad object not found`);
      const playerList = buildSquadPlayerList(challenge, players);
      try {
        squad.removeAllItems?.();
      } catch {
      }
      squad.setPlayers(playerList, true);
      const save = await observeOnce(
        eaSbcAdapter().saveChallenge(challenge),
        ctrl(),
        3e4,
        `saveChallenge ${label}`
      );
      if (!save?.success) {
        const code = save?.error?.code || save?.status || "unknown";
        const msg = save?.error?.message || save?.message || "";
        const playerSummary = (players || []).slice(0, 11).map(
          (item, index) => `${index + 1}.${itemDisplayName(item)} r:${Number(item?.rating || 0) || "?"} id:${Number(item?.id || 0) || "?"} def:${Number(item?.definitionId || 0) || "?"}`
        ).join("; ");
        fail(`${label}: saveChallenge failed: ${code}${msg ? ` ${msg}` : ""}${playerSummary ? `; players ${playerSummary}` : ""}`);
      }
      if (typeof W.services.SBC.loadChallengeData === "function") {
        try {
          const loaded = await observeOnce(
            eaSbcAdapter().loadChallengeData(challenge),
            ctrl(),
            3e4,
            `loadChallengeData ${label}`
          );
          const loadedSquad = loaded?.response?.squad;
          const loadedPlayers = loadedSquad?._players?.map((p) => p?._item).filter(Boolean);
          if (loadedPlayers?.length) challenge.squad?.setPlayers?.(loadedPlayers, true);
        } catch (e) {
          log(`${label}: loadChallengeData skipped: ${e.message || e}`);
        }
      }
      await waitLoadingEnd(250, Math.max(1e3, Number(options.loadingTimeoutMs || 3e4) || 3e4));
      await sleep(700);
    }
    async function prepareSbcSquad(challenge, players, label = "SBC", options = {}) {
      const result = await submitSbcAttempt({
        label,
        prepareOnly: true,
        challengeProvider: async () => ({
          set: options.set || { id: null, name: label },
          challenge
        }),
        squadProvider: createExistingSquadProvider({
          getPlayers: async () => players,
          itemRef: liveItemRef,
          source: options.source || "prepared-squad"
        }),
        preSaveValidators: options.preSaveValidators || [],
        saveSquad: async ({ challenge: targetChallenge, players: targetPlayers }) => {
          await saveChallengeSquad(targetChallenge, targetPlayers, label, options);
        },
        readSavedPlayers: async ({ challenge: targetChallenge }) => getSquadItems(targetChallenge?.squad || ctrl()?._squad),
        postSaveValidators: options.postSaveValidators || []
      });
      if (result.status !== "prepared") fail(`${label}: squad preparation failed: ${result.reason || result.status}`);
      return result;
    }
    async function showUnassignedIfAny(reason = "final confirmation") {
      log(`Opening unassigned items view for confirmation: ${reason}`);
      try {
        const controller = ctrl();
        if (typeof controller?.gotoUnassigned === "function") {
          controller.gotoUnassigned();
        } else if (typeof W.UTStoreViewController?.prototype?.gotoUnassigned === "function") {
          W.UTStoreViewController.prototype.gotoUnassigned.call(controller);
        } else {
          clickButtonByText([
            "Unassigned Items",
            "Unassigned",
            "Assign Items",
            "\u672A\u5206\u914D",
            "\u672A\u5206\u914D\u7269\u54C1",
            "\u5206\u914D\u7269\u54C1"
          ]);
        }
      } catch (e) {
        log(`Could not open unassigned view automatically: ${e.message || e}`);
      }
      await waitLoadingEnd();
      await refreshUnassigned();
      const items = getUnassignedItems();
      if (!items.length) {
        log(`Unassigned confirmation (${reason}): empty`);
        return [];
      }
      log(`Unassigned confirmation (${reason}): ${items.length} item(s) still present`);
      return items;
    }
    function isSbcSquadControllerActive() {
      return /UTSBCSquadSplitViewController/i.test(currentControllerName());
    }
    function isSbcControllerActive() {
      return /^UTSBC/i.test(currentControllerName());
    }
    async function unwindSbcSquadControllers(label, maxPops = 20) {
      let popped = 0;
      while (isSbcSquadControllerActive() && popped < maxPops) {
        const controller = ctrl();
        const nav = navController();
        if (typeof nav?.popViewController !== "function") {
          log(`${label}: cannot exit ${currentControllerName() || "SBC squad"}; navigation pop method is unavailable`);
          break;
        }
        nav.popViewController(true);
        popped++;
        await waitLoadingEnd(350, 1e4).catch(() => null);
        for (let wait = 0; wait < 12 && ctrl() === controller; wait++) await sleep(250);
        if (ctrl() === controller) {
          log(`${label}: SBC squad controller did not change after navigation pop ${popped}`);
          break;
        }
      }
      if (popped) {
        log(`${label}: removed ${popped} stale SBC squad view(s); current controller ${currentControllerName() || "unknown"}`);
      }
      return popped;
    }
    async function syncAfterSbcSubmit(label) {
      const before = currentControllerName() || "unknown";
      await unwindSbcSquadControllers(`${label} post-submit`);
      await showUnassignedIfAny(`${label} post-submit navigation sync`);
      let after = currentControllerName() || "unknown";
      if (isSbcSquadControllerActive()) {
        await unwindSbcSquadControllers(`${label} post-unassigned`);
        after = currentControllerName() || "unknown";
      }
      if (isSbcControllerActive()) {
        log(`${label}: controller is still ${after} in the SBC area after navigation cleanup; opening Store Packs as a final fallback`);
        await openStorePacksViewForRefresh(`${label} post-submit Store sync`).catch((error) => {
          log(`${label}: post-submit Store sync skipped: ${error?.message || error}`);
          return false;
        });
        after = currentControllerName() || "unknown";
      }
      log(`${label}: post-submit controller ${before} -> ${after}`);
    }
    async function waitAfterSbcFillAction(label, squad, timeoutMs = 1e4) {
      const start = Date.now();
      const initialFilled = getFilledSquadSlots(squad);
      let closedStuckOverlay = false;
      while (Date.now() - start < timeoutMs) {
        stopPoint();
        const filled = getFilledSquadSlots(squad);
        if (findSubmitButton()) {
          await sleep(700);
          log(`${label}: submit button detected after fill action`);
          return true;
        }
        if (!closedStuckOverlay && closeFsuStuckOverlay(`${label} stuck overlay`)) {
          closedStuckOverlay = true;
          await sleep(1e3);
          continue;
        }
        const shieldShowing = (() => {
          try {
            return !!W.gClickShield?.isShowing?.();
          } catch {
            return false;
          }
        })();
        if (!shieldShowing && filled > initialFilled) {
          await sleep(700);
          log(`${label}: fill action settled; slots ${initialFilled} -> ${filled}`);
          return true;
        }
        await sleep(250);
      }
      log(`${label}: no fill progress after wait; slots ${initialFilled} -> ${getFilledSquadSlots(squad)}, submit ${findSubmitButton() ? "ready" : "not ready"}`);
      return false;
    }
    async function fillSbcSquad(label = "SBC", options = {}) {
      const requireSubmitReady = options.requireSubmitReady !== false;
      const squad = await waitFor(() => ctrl()?._squad, 15e3, "SBC squad object");
      patchFsuLengthSafePlayerMetadata(`${label} before FSU fill`);
      const existingItems = getSquadItems(squad);
      try {
        squad.removeAllItems?.();
      } catch {
      }
      await sleep(500);
      if (options.specialRequirementAdd) {
        const clicked = await clickRequirementAddControl(options.specialRequirementAdd, `${label} special requirement`);
        if (!clicked) log(`${label}: special requirement Add button not found; continuing with FSU fill`);
      }
      if (clickButtonByText(["\u91CD\u590D\u7403\u5458\u586B\u5145\u9635\u5BB9", "\u91CD\u8907\u7403\u54E1\u586B\u5145\u9663\u5BB9", "Repeat player fill squad"])) {
        log("Clicked duplicate fill");
        await waitLoadingEnd();
        await sleep(CFG.pauseMs);
      }
      if (clickButtonByText(["\u4E00\u952E\u5B8C\u6210", "\u4E00\u9375\u5B8C\u6210", "\u4E00\u952E\u586B\u5145", "\u4E00\u9375\u586B\u5145", "One-click fill"])) {
        log("Clicked FSU one-click fill/complete");
        await waitAfterSbcFillAction(`${label} FSU one-click`, squad);
        await sleep(CFG.pauseMs);
      }
      if (!findSubmitButton() && clickButtonByText(["Completion", "\u5B8C\u6210", "\u88DC\u5168", "\u8865\u5168"])) {
        log("Clicked FSU completion");
        await waitAfterSbcFillAction(`${label} FSU completion`, squad);
        await sleep(CFG.pauseMs);
      }
      if (clickButtonByText(["\u9635\u5BB9\u8865\u5168", "\u9663\u5BB9\u88DC\u5168", "Squad completion"])) {
        log("Clicked squad completion");
        await waitLoadingEnd();
        await sleep(CFG.pauseMs);
        clickButtonByText(["\u786E\u5B9A", "\u78BA\u5B9A", "Ok"]);
        await waitLoadingEnd();
      }
      if (!findSubmitButton() && getFilledSquadSlots(squad) === 0 && clickButtonByText(["One-click fill"])) {
        log("Retrying FSU one-click fill after no progress");
        await waitAfterSbcFillAction(`${label} FSU one-click retry`, squad);
        await sleep(CFG.pauseMs);
      }
      if (!findSubmitButton() && getFilledSquadSlots(squad) === 0 && existingItems.length) {
        try {
          squad.setPlayers?.(existingItems, true);
          await sleep(350);
          const restored = getFilledSquadSlots(squad);
          if (restored) {
            log(`${label}: FSU made no fill progress; restored ${restored} existing squad item(s) for safe repair`);
          }
        } catch (error) {
          log(`${label}: could not restore existing squad after FSU made no fill progress: ${error?.message || error}`);
        }
      }
      const filled = getFilledSquadSlots(squad);
      const submitReady = !!findSubmitButton();
      log(`${label} squad filled slots detected: ${filled}; submit ${submitReady ? "ready" : "not ready"}`);
      if (!submitReady && requireSubmitReady) fail(`${label} squad is not complete`);
      return { squad, filled, submitReady };
    }
    function unwrapSquadSlot(slot) {
      return slot?._item || slot?.item || slot?.player || slot || null;
    }
    function getSquadItems(squad = ctrl()?._squad) {
      const slots = squad?.getPlayers?.() || squad?._players || [];
      return slots.map(unwrapSquadSlot).filter(
        (item) => item && (Number(item?.definitionId || 0) || Number(item?.rating || 0) || item?.id)
      );
    }
    function itemGroups2(item) {
      if (Array.isArray(item?.groups)) return item.groups;
      if (Array.isArray(item?._data?.groups)) return item._data.groups;
      return [];
    }
    const TOTW_GROUP_IDS = [44];
    function itemGroupNumbers(item) {
      return itemGroups2(item).map((group) => Number(group)).filter((group) => Number.isFinite(group));
    }
    function itemHasAnyGroup(item, groupIds = []) {
      const groups = itemGroupNumbers(item);
      return groupIds.some((groupId) => groups.includes(Number(groupId)));
    }
    function formatSquadItem(item, index) {
      const groups = itemGroups2(item);
      const parts = [
        `${index + 1}. ${itemDisplayName(item)}`,
        `rating:${Number(item?.rating || 0) || "?"}`,
        isSbcSpecialItem(item) ? "special" : isRare(item) ? "rare" : "common",
        isTradeable(item) ? "tradeable" : "untradeable",
        `id:${Number(item?.id || 0) || "?"}`,
        `def:${Number(item?.definitionId || 0) || "?"}`
      ];
      if (isConceptItem(item)) parts.push("concept");
      if (groups.length) parts.push(`groups:${groups.join("/")}`);
      return parts.join(" | ");
    }
    function isSbcSpecialItem(item) {
      return isSpecial(item) || isTotwItem(item) || isTotsItem(item) || isFofItem(item);
    }
    function itemSearchText(item) {
      return [
        item?.name,
        item?.commonName,
        item?.lastName,
        item?._staticData?.name,
        item?._staticData?.commonName,
        item?.rareName,
        item?.rarityName,
        item?._staticData?.rareName,
        item?._staticData?.rarityName
      ].filter(Boolean).join(" ");
    }
    function isTotwItem(item) {
      const id = Number(item?.id || 0);
      if (id && state.consumedItemIds.has(id)) return false;
      if (id && state.assumedTotwItemIds.has(id)) return true;
      try {
        if (item?.isTOTW?.() || item?.isTotw?.()) return true;
      } catch {
      }
      if (itemHasAnyGroup(item, TOTW_GROUP_IDS)) return true;
      const text = itemSearchText(item);
      return /\bTOTW\b|Team of the Week|本周最佳|週最佳/i.test(text);
    }
    function isTotsItem(item) {
      try {
        if (item?.isTOTS?.() || item?.isTots?.()) return true;
      } catch {
      }
      return /\bTOTS\b|Team of the Season|赛季最佳|賽季最佳/i.test(itemSearchText(item));
    }
    function isFofItem(item) {
      try {
        if (item?.isFOF?.() || item?.isFof?.()) return true;
      } catch {
      }
      return /\bFOF\b|Festival of Football|Glory Hunters|荣耀猎手|榮耀獵手/i.test(itemSearchText(item));
    }
    function requiredSpecialKind(loopDef = {}) {
      return String(loopDef.requiredSpecialKind || "").trim().toLowerCase();
    }
    function requiredSpecialLabel(loopDef = {}) {
      return requiredSpecialKind(loopDef) === "totw-tots-fof" ? "TOTW/TOTS/FOF" : "TOTW";
    }
    function isRequiredSpecialItem(item, loopDef = {}) {
      const kind = requiredSpecialKind(loopDef);
      if (kind === "totw-tots-fof") return isTotwItem(item) || isTotsItem(item) || isFofItem(item);
      return isTotwItem(item);
    }
    function needsAutoTotwPreflight(loopDef = {}) {
      return ["totw", "totw-tots-fof"].includes(requiredSpecialKind(loopDef)) && Math.max(0, Number(loopDef.requiredSpecialCount || 0) || 0) > 0 && loopDef.autoTotwUpgrade !== false;
    }
    function isEligibleRequiredSpecialForLoop(item, loopDef = {}) {
      if (!isRequiredSpecialItem(item, loopDef)) return false;
      const minRating = Number(loopDef.requiredSpecialMinRating || 0);
      if (minRating && Number(item?.rating || 0) < minRating) return false;
      const reasons = getSbcProtectionReasons(item, loopDef, { specialIndex: 1 });
      return reasons.length === 0;
    }
    function isEligibleTotwForLoop(item, loopDef = {}) {
      if (!isTotwItem(item)) return false;
      return isEligibleRequiredSpecialForLoop(item, loopDef);
    }
    function getEligibleRequiredSpecialEntries(loopDef = {}, options = {}) {
      const entries = [];
      const seen = /* @__PURE__ */ new Set();
      const piles = [
        { pileName: "storage", items: getPileItemsByName("storage") },
        { pileName: "club", items: getPileItemsByName("club") }
      ];
      if (options.includeRecent !== false) piles.push({ pileName: "recent", items: state.recentRewardItems || [] });
      for (const { pileName, items } of piles) {
        for (const item of items || []) {
          const id = Number(item?.id || 0);
          if (!id || seen.has(id)) continue;
          if (state.consumedItemIds.has(id)) continue;
          seen.add(id);
          if (isEligibleRequiredSpecialForLoop(item, loopDef)) entries.push({ item, pileName });
        }
      }
      return entries;
    }
    function getSubmittableRequiredSpecialEntries(loopDef = {}) {
      return getEligibleRequiredSpecialEntries(loopDef, { includeRecent: false });
    }
    function getEligibleTotwEntries(loopDef = {}) {
      return getSubmittableRequiredSpecialEntries(loopDef).filter(({ item }) => isTotwItem(item));
    }
    function summarizeRequiredSpecialEntries(entries, limit = 3) {
      return entries.slice(0, limit).map(
        ({ item, pileName }) => `${itemDisplayName(item)} rating:${Number(item?.rating || 0) || "?"} ${requiredSpecialTypeLabel(item)} from:${pileName} id:${Number(item?.id || 0) || "?"}`
      ).join("; ");
    }
    function summarizeTotwEntries(entries, limit = 3) {
      return summarizeRequiredSpecialEntries(entries, limit);
    }
    async function waitForSubmittableRequiredSpecialEntries(loopDef = {}, required = 1, label = "required special cache sync") {
      const attempts = 4;
      let entries = [];
      for (let attempt = 1; attempt <= attempts; attempt++) {
        if (attempt > 1) {
          await sleep(900 * attempt);
          await refreshInventoryCaches(`${loopDef.name} ${label} ${attempt}/${attempts}`, { includePacks: false, quiet: true });
        }
        resolveRecentRewardItems(`${loopDef.name} ${label} ${attempt}/${attempts}`);
        entries = sortRequiredSpecialEntriesForSubmit(getSubmittableRequiredSpecialEntries(loopDef));
        if (entries.length >= required) return entries;
        const recentEntries = sortRequiredSpecialEntriesForSubmit(
          getEligibleRequiredSpecialEntries(loopDef).filter(({ pileName }) => pileName === "recent")
        );
        if (recentEntries.length && attempt < attempts) {
          log(`${loopDef.name}: waiting for opened ${requiredSpecialLabel(loopDef)} to enter submit cache (${attempt}/${attempts}); recent ${summarizeRequiredSpecialEntries(recentEntries)}`);
        }
      }
      return entries;
    }
    function sortRequiredSpecialEntriesForSubmit(entries) {
      const pileRank = { storage: 0, club: 1, recent: 2, unassigned: 3 };
      return [...entries || []].sort(
        (a, b) => Number(a?.item?.rating || 0) - Number(b?.item?.rating || 0) || (pileRank[a?.pileName] ?? 9) - (pileRank[b?.pileName] ?? 9) || Number(a?.item?.id || 0) - Number(b?.item?.id || 0)
      );
    }
    function requiredSpecialRejectReasons(item, loopDef = {}) {
      const reasons = [];
      const id = Number(item?.id || 0);
      if (!isPlayer(item)) reasons.push("not-player");
      if (id && state.consumedItemIds.has(id)) reasons.push("consumed-this-run");
      if (!isRequiredSpecialItem(item, loopDef)) reasons.push(`not-${requiredSpecialLabel(loopDef)}`);
      const minRating = Number(loopDef.requiredSpecialMinRating || 0);
      if (minRating && Number(item?.rating || 0) < minRating) reasons.push(`rating-under-${minRating}`);
      getSbcProtectionReasons(item, loopDef, { specialIndex: 1 }).forEach((reason) => {
        if (!reasons.includes(reason)) reasons.push(reason);
      });
      return reasons;
    }
    function logRequiredSpecialPreflightDiagnostics(loopDef = {}) {
      const piles = [
        { pileName: "recent", items: state.recentRewardItems || [] },
        { pileName: "unassigned", items: getPileItemsByName("unassigned") },
        { pileName: "storage", items: getPileItemsByName("storage") },
        { pileName: "club", items: getPileItemsByName("club") }
      ];
      const seen = /* @__PURE__ */ new Set();
      const candidates = [];
      const reasonCounts = {};
      for (const { pileName, items } of piles) {
        for (const item of items || []) {
          const id = Number(item?.id || 0);
          if (!id || seen.has(id) || !isPlayer(item)) continue;
          seen.add(id);
          if (!isSbcSpecialItem(item) && !isSpecial(item)) continue;
          const reasons = requiredSpecialRejectReasons(item, loopDef);
          reasons.forEach((reason) => addCount(reasonCounts, reason));
          if (reasons.length) candidates.push({ item, pileName, reasons });
        }
      }
      if (!candidates.length) {
        log(`${loopDef.name}: ${requiredSpecialLabel(loopDef)} preflight diagnostics: no special candidates detected in recent/unassigned/storage/club caches`);
        return;
      }
      log(`${loopDef.name}: ${requiredSpecialLabel(loopDef)} preflight diagnostics: ${candidates.length} special candidate(s), rejects ${formatCounts(reasonCounts, 8) || "none"}`);
      candidates.slice(0, 8).forEach(({ item, pileName, reasons }, index) => {
        log(`${loopDef.name}: ${requiredSpecialLabel(loopDef)} candidate ${index + 1}. ${rewardItemSummary(item)} from:${pileName} reject:${reasons.join(",") || "none"}`);
      });
      if (candidates.length > 8) {
        log(`${loopDef.name}: ${requiredSpecialLabel(loopDef)} candidate diagnostics truncated: ${candidates.length - 8} more`);
      }
    }
    function sortTotwEntriesForSubmit(entries) {
      return sortRequiredSpecialEntriesForSubmit(entries);
    }
    function requiredSpecialTypeLabel(item) {
      const labels = [];
      if (isTotwItem(item)) labels.push("TOTW");
      if (isTotsItem(item)) labels.push("TOTS");
      if (isFofItem(item)) labels.push("FOF");
      return labels.length ? `[${labels.join("/")}]` : "[unknown-special]";
    }
    function rewardItemSummary(item) {
      const groups = itemGroups2(item);
      const parts = [
        itemDisplayName(item),
        `rating:${Number(item?.rating || 0) || "?"}`,
        requiredSpecialTypeLabel(item),
        `id:${Number(item?.id || 0) || "?"}`,
        `def:${Number(item?.definitionId || 0) || "?"}`
      ];
      if (groups.length) parts.push(`groups:${groups.join("/")}`);
      return parts.join(" ");
    }
    function markAssumedTotwRewardItems(items = [], label = "TOTW reward pack") {
      const marked = [];
      for (const item of items || []) {
        if (!item || !isPlayer(item)) continue;
        const id = Number(item?.id || 0);
        if (id && state.consumedItemIds.has(id)) continue;
        if (id) state.assumedTotwItemIds.add(id);
        marked.push(item);
      }
      if (!marked.length) return;
      const seen = new Set((state.recentRewardItems || []).map((item) => Number(item?.id || 0)).filter(Boolean));
      for (const item of marked) {
        const id = Number(item?.id || 0);
        if (!id || seen.has(id)) continue;
        state.recentRewardItems.unshift(item);
        seen.add(id);
      }
      state.recentRewardItems = state.recentRewardItems.slice(0, 20);
      marked.slice(0, 5).forEach((item) => {
        log(`${label}: marked assumed TOTW reward item: ${rewardItemSummary(item)}`);
      });
      if (marked.length > 5) log(`${label}: marked ${marked.length - 5} more assumed TOTW reward item(s)`);
    }
    function markSbcItemsConsumed(items = [], label = "SBC submit") {
      const ids = [...new Set((items || []).map((item) => Number(item?.id || 0)).filter(Boolean))];
      if (!ids.length) return;
      for (const id of ids) {
        state.consumedItemIds.add(id);
        state.assumedTotwItemIds.delete(id);
      }
      const beforeRecent = (state.recentRewardItems || []).length;
      state.recentRewardItems = (state.recentRewardItems || []).filter((item) => !state.consumedItemIds.has(Number(item?.id || 0)));
      const removedRecent = beforeRecent - state.recentRewardItems.length;
      if (removedRecent) {
        log(`${label}: cleared ${removedRecent} consumed recent reward item reference(s)`);
      }
    }
    function needsRequiredTotwInjection(loopDef, inspection) {
      if (!needsAutoTotwPreflight(loopDef)) return false;
      return (inspection?.missingRequirements || []).some((message) => String(message).startsWith("special-count")) || (inspection?.blocked || []).some(({ reasons }) => (reasons || []).some((reason) => String(reason).startsWith("required-totw")));
    }
    function chooseTotwReplacementEntry(loopDef, inspection, totwItem) {
      const entries = inspection?.entries || [];
      const protectedIds = new Set((loopDef.protectedItemIds || []).map(Number));
      const protectedDefinitionIds = new Set((loopDef.protectedDefinitionIds || []).map(Number));
      const totwId = Number(totwItem?.id || 0);
      const candidates = entries.filter(
        ({ item }) => item && Number(item?.id || 0) !== totwId && !(isRequiredSpecialItem(item, loopDef) && isEligibleRequiredSpecialForLoop(item, loopDef))
      );
      if (!candidates.length) return null;
      const score = ({ item, reasons }) => {
        const reasonList = reasons || [];
        let value = Number(item?.rating || 0) || 0;
        if (reasonList.includes("required-totw")) value -= 1e3;
        if (reasonList.some((reason) => String(reason).startsWith("required-totw-min-"))) value -= 950;
        if (reasonList.includes("special-blocked")) value -= 800;
        if (reasonList.includes("tradeable-blocked")) value -= 700;
        if (reasonList.includes("fsu-locked-player")) value -= 680;
        if (reasonList.some((reason) => reason.startsWith("rating-over-"))) value -= 600;
        if (isSbcSpecialItem(item)) value -= 300;
        if (protectedIds.has(Number(item?.id || 0))) value -= 900;
        if (protectedDefinitionIds.has(Number(item?.definitionId || 0))) value -= 900;
        return value;
      };
      return [...candidates].sort(
        (a, b) => score(a) - score(b) || Number(a?.item?.rating || 0) - Number(b?.item?.rating || 0) || Number(a?.index || 0) - Number(b?.index || 0)
      )[0] || null;
    }
    function getSubmittedRatingLimit(item, loopDef = {}, settings = getFsuSettings()) {
      const normalGoldLimit = Number(loopDef.maxNormalGoldSubmittedRating || 0);
      if (isNormalGoldFodder(item)) {
        const fsuRange = settings.goldRange || FSU_COMPAT_DEFAULTS.goldRange;
        const fsuGoldLimit = Number(fsuRange[1] || 0);
        const limits = [normalGoldLimit, fsuGoldLimit].filter((limit) => Number.isFinite(limit) && limit > 0);
        if (limits.length) return Math.min(...limits);
      }
      return Number(loopDef.maxSubmittedRating || 0);
    }
    function isEligibleNormalRepairFiller(item, loopDef = {}) {
      if (!isPlayer(item)) return false;
      const id = Number(item?.id || 0);
      if (id && state.consumedItemIds.has(id)) return false;
      if (isSbcSpecialItem(item)) return false;
      if (isLimitedUseItem(item)) return false;
      if (isConceptItem(item)) return false;
      try {
        if (item?.isEnrolledInAcademy?.()) return false;
      } catch {
      }
      if (item?.endTime !== void 0 && Number(item.endTime) !== -1) return false;
      if (!isInactiveTrade(item)) return false;
      if (loopDef.blockTradeable === true && isTradeable(item) && !isNormalGoldFodder(item)) return false;
      const maxRating = getSubmittedRatingLimit(item, loopDef);
      if (maxRating && Number(item?.rating || 0) > maxRating) return false;
      const protectedIds = new Set((loopDef.protectedItemIds || []).map(Number));
      const protectedDefinitionIds = new Set((loopDef.protectedDefinitionIds || []).map(Number));
      if (protectedIds.has(Number(item?.id || 0))) return false;
      if (protectedDefinitionIds.has(Number(item?.definitionId || 0))) return false;
      if (getFsuRejectReasons(item, { playerOnly: true, allowSpecial: false }).length) return false;
      return true;
    }
    function getEligibleNormalRepairEntries(loopDef = {}, usedIds = /* @__PURE__ */ new Set(), options = {}) {
      const entries = [];
      const seen = /* @__PURE__ */ new Set();
      const usedDefinitionIds = options.usedDefinitionIds || /* @__PURE__ */ new Set();
      const piles = Array.isArray(options.piles) && options.piles.length ? options.piles : ["storage", "club"];
      for (const pileName of piles) {
        for (const item of getPileItemsByName(pileName)) {
          const id = Number(item?.id || 0);
          if (!id || seen.has(id) || usedIds.has(id)) continue;
          const definitionId = Number(item?.definitionId || 0);
          if (definitionId && usedDefinitionIds.has(definitionId)) continue;
          seen.add(id);
          if (isEligibleNormalRepairFiller(item, loopDef)) entries.push({ item, pileName });
        }
      }
      return entries;
    }
    function sortNormalRepairEntries(entries) {
      const pileRank = { storage: 0, club: 1, unassigned: 2 };
      return [...entries || []].sort(
        (a, b) => Number(b?.item?.rating || 0) - Number(a?.item?.rating || 0) || (pileRank[a?.pileName] ?? 9) - (pileRank[b?.pileName] ?? 9) || Number(isRare(a?.item)) - Number(isRare(b?.item)) || Number(a?.item?.id || 0) - Number(b?.item?.id || 0)
      );
    }
    function sortCurrentTotwEntriesForKeep(entries) {
      return [...entries || []].sort(
        (a, b) => Number(a?.item?.rating || 0) - Number(b?.item?.rating || 0) || Number(a?.index || 0) - Number(b?.index || 0)
      );
    }
    function isRequiredTotwRepairTarget(loopDef, entry, keepTotwId) {
      const item = entry?.item;
      if (!item) return false;
      const itemId = Number(item?.id || 0);
      if (itemId && itemId === keepTotwId) return false;
      const reasons = entry?.reasons || [];
      return isSbcSpecialItem(item) || reasons.includes("required-totw") || reasons.some((reason) => String(reason).startsWith("required-totw-min-")) || reasons.includes("special-blocked") || reasons.includes("tradeable-blocked") || reasons.includes("fsu-locked-player") || reasons.includes("protected-id") || reasons.includes("protected-def") || reasons.includes("loan") || reasons.includes("limited-use") || reasons.includes("concept") || reasons.includes("academy") || reasons.some((reason) => reason.startsWith("rating-over-")) || getFsuRejectReasons(item, { playerOnly: true, allowSpecial: false }).length > 0;
    }
    function sortRepairTargets(entries) {
      const score = ({ item, reasons }) => {
        const reasonList = reasons || [];
        let value = 0;
        if (reasonList.includes("required-totw")) value -= 1e3;
        if (reasonList.some((reason) => String(reason).startsWith("required-totw-min-"))) value -= 950;
        if (reasonList.includes("special-blocked")) value -= 900;
        if (reasonList.some((reason) => reason.startsWith("rating-over-"))) value -= 800;
        if (reasonList.includes("tradeable-blocked")) value -= 700;
        if (reasonList.includes("fsu-locked-player")) value -= 690;
        if (reasonList.includes("protected-id") || reasonList.includes("protected-def")) value -= 650;
        if (reasonList.includes("concept")) value -= 640;
        if (reasonList.includes("academy")) value -= 630;
        if (isSbcSpecialItem(item)) value -= 500;
        return value;
      };
      return [...entries || []].sort(
        (a, b) => score(a) - score(b) || Number(b?.item?.rating || 0) - Number(a?.item?.rating || 0) || Number(a?.index || 0) - Number(b?.index || 0)
      );
    }
    function buildRequiredTotwRepairPlan(loopDef, inspection) {
      if (!needsAutoTotwPreflight(loopDef)) return null;
      resolveRecentRewardItems(`${loopDef.name} required ${requiredSpecialLabel(loopDef)} repair`);
      const players = [...inspection?.items || []];
      if (!players.length) return null;
      const changes = [];
      const usedIds = new Set(players.map((item) => Number(item?.id || 0)).filter(Boolean));
      let keepTotwId = 0;
      let keepTotwMessage = "";
      const currentTotw = sortCurrentTotwEntriesForKeep(
        (inspection.entries || []).filter(({ item }) => isEligibleRequiredSpecialForLoop(item, loopDef))
      )[0] || null;
      if (currentTotw) {
        keepTotwId = Number(currentTotw.item?.id || 0);
        keepTotwMessage = `keep ${itemDisplayName(currentTotw.item)} rating:${Number(currentTotw.item?.rating || 0) || "?"} at slot ${currentTotw.index + 1}`;
      } else {
        const externalTotw = sortRequiredSpecialEntriesForSubmit(getSubmittableRequiredSpecialEntries(loopDef)).filter(({ item }) => !usedIds.has(Number(item?.id || 0)))[0] || null;
        if (!externalTotw) return null;
        const replacement = chooseTotwReplacementEntry(loopDef, inspection, externalTotw.item);
        if (!replacement) return null;
        players[replacement.index] = externalTotw.item;
        keepTotwId = Number(externalTotw.item?.id || 0);
        usedIds.add(keepTotwId);
        keepTotwMessage = `inject ${itemDisplayName(externalTotw.item)} rating:${Number(externalTotw.item?.rating || 0) || "?"} from:${externalTotw.pileName} into slot ${replacement.index + 1}`;
        changes.push({
          index: replacement.index,
          from: replacement.item,
          to: externalTotw.item,
          pileName: externalTotw.pileName,
          reason: `required ${requiredSpecialLabel(loopDef)}`
        });
      }
      let plannedInspection = inspectSbcItems(loopDef, players, { expectedPlayerCount: inspection.expectedPlayerCount });
      const targets = sortRepairTargets(
        plannedInspection.entries.filter((entry) => isRequiredTotwRepairTarget(loopDef, entry, keepTotwId))
      );
      const targetIndexes = new Set(targets.map(({ index }) => Number(index)));
      const usedDefinitionIds = new Set(players.filter((item, index) => !targetIndexes.has(index)).map((item) => Number(item?.definitionId || 0)).filter(Boolean));
      const fillers = sortNormalRepairEntries(getEligibleNormalRepairEntries(loopDef, usedIds, { usedDefinitionIds }));
      for (const target of targets) {
        const filler = fillers.shift();
        if (!filler) {
          return {
            ok: false,
            reason: `missing normal replacement for slot ${target.index + 1}`,
            players,
            changes,
            keepTotwMessage,
            inspection: plannedInspection
          };
        }
        players[target.index] = filler.item;
        usedIds.add(Number(filler.item?.id || 0));
        const fillerDefinitionId = Number(filler.item?.definitionId || 0);
        if (fillerDefinitionId) usedDefinitionIds.add(fillerDefinitionId);
        changes.push({
          index: target.index,
          from: target.item,
          to: filler.item,
          pileName: filler.pileName,
          reason: "replace invalid/extra special"
        });
      }
      plannedInspection = inspectSbcItems(loopDef, players, { expectedPlayerCount: inspection.expectedPlayerCount });
      return {
        ok: !plannedInspection.blocked.length && !(plannedInspection.missingRequirements || []).length,
        players,
        changes,
        keepTotwMessage,
        inspection: plannedInspection,
        reason: plannedInspection.blocked.length || plannedInspection.missingRequirements?.length ? "repair plan still has protected or missing requirements" : ""
      };
    }
    function formatRepairChange(change) {
      const fromLabel = change.from ? `${itemDisplayName(change.from)} rating:${Number(change.from?.rating || 0) || "?"}` : "empty";
      const toLabel = change.to ? `${itemDisplayName(change.to)} rating:${Number(change.to?.rating || 0) || "?"}` : "empty";
      return `slot ${change.index + 1}: ${fromLabel} -> ${toLabel} from:${change.pileName} (${change.reason})`;
    }
    function buildProtectedSquadRepairPlan(loopDef, inspection) {
      if (!inspection?.items?.length || !inspection.blocked?.length) return null;
      const players = [...inspection.items];
      const targets = sortRepairTargets((inspection.blocked || []).filter(
        ({ item, reasons }) => item && (reasons || []).length
      ));
      if (!targets.length) return null;
      const targetIndexes = new Set(targets.map(({ index }) => Number(index)));
      const usedIds = new Set(players.map((item) => Number(item?.id || 0)).filter(Boolean));
      const usedDefinitionIds = new Set(players.filter((item, index) => !targetIndexes.has(index)).map((item) => Number(item?.definitionId || 0)).filter(Boolean));
      const fillers = sortNormalRepairEntries(getEligibleNormalRepairEntries(loopDef, usedIds, { usedDefinitionIds }));
      const changes = [];
      for (const target of targets) {
        const fillerIndex = fillers.findIndex(({ item }) => {
          const definitionId = Number(item?.definitionId || 0);
          return !definitionId || !usedDefinitionIds.has(definitionId);
        });
        if (fillerIndex === -1) {
          return {
            ok: false,
            reason: `missing normal replacement for slot ${target.index + 1}`,
            players,
            changes,
            inspection: inspectSbcItems(loopDef, players, { expectedPlayerCount: inspection.expectedPlayerCount })
          };
        }
        const [filler] = fillers.splice(fillerIndex, 1);
        players[target.index] = filler.item;
        const fillerDefinitionId = Number(filler.item?.definitionId || 0);
        if (fillerDefinitionId) usedDefinitionIds.add(fillerDefinitionId);
        changes.push({
          index: target.index,
          from: target.item,
          to: filler.item,
          pileName: filler.pileName,
          reason: "replace protected squad item"
        });
      }
      const plannedInspection = inspectSbcItems(loopDef, players, { expectedPlayerCount: inspection.expectedPlayerCount });
      return {
        ok: !plannedInspection.blocked.length && !(plannedInspection.missingRequirements || []).length,
        players,
        changes,
        inspection: plannedInspection,
        reason: plannedInspection.blocked.length || plannedInspection.missingRequirements?.length ? "repair plan still has protected or missing requirements" : ""
      };
    }
    async function repairProtectedSquadItemsIfNeeded(loopDef, opened, fillResult, inspection) {
      if (!inspection?.blocked?.length) {
        return { fillResult, inspection, planned: false, repaired: false };
      }
      const maxAttempts = Math.max(0, Math.min(3, Number(loopDef.protectedRepairMaxAttempts ?? 1) || 0));
      if (!maxAttempts) return { fillResult, inspection, planned: false, repaired: false };
      let nextFillResult = fillResult;
      let nextInspection = inspection;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const plan = buildProtectedSquadRepairPlan(loopDef, nextInspection);
        if (!plan) {
          log(`${loopDef.name}: protected squad repair found no eligible normal replacement`);
          return { fillResult: nextFillResult, inspection: nextInspection, planned: false, repaired: false };
        }
        (plan.changes || []).forEach((change) => {
          log(`${loopDef.name}: protected squad repair ${attempt}/${maxAttempts} - ${formatRepairChange(change)}`);
        });
        if (!plan.ok) {
          log(`${loopDef.name}: protected squad repair plan incomplete: ${plan.reason || "unknown"}`);
          return { fillResult: nextFillResult, inspection: plan.inspection || nextInspection, planned: false, repaired: false };
        }
        if (loopDef.dryRun) {
          log(`${loopDef.name}: dry-run would save protected squad repair and re-check before submit`);
          return {
            fillResult: nextFillResult,
            inspection: plan.inspection,
            planned: true,
            repaired: false
          };
        }
        log(`${loopDef.name}: saving protected squad repair plan`);
        await prepareSbcSquad(opened.challenge, plan.players, `${loopDef.name} protected squad repair`);
        await waitLoadingEnd();
        await sleep(900);
        const squad = ctrl()?._squad || opened.challenge?.squad || nextFillResult?.squad;
        nextFillResult = {
          ...nextFillResult,
          squad,
          filled: getFilledSquadSlots(squad),
          submitReady: !!findSubmitButton()
        };
        nextInspection = inspectSbcSquad(loopDef, squad, { expectedPlayerCount: nextInspection.expectedPlayerCount });
        logSbcSquadInspection(loopDef, nextInspection);
        log(`${loopDef.name}: after protected squad repair submit ${nextFillResult.submitReady ? "ready" : "not ready"}`);
        if (!nextInspection.blocked.length) {
          return { fillResult: nextFillResult, inspection: nextInspection, planned: false, repaired: true };
        }
      }
      return { fillResult: nextFillResult, inspection: nextInspection, planned: false, repaired: true };
    }
    function parseMissingPlayerCount(inspection = {}) {
      const message = (inspection.missingRequirements || []).find((entry) => String(entry).startsWith("player-count "));
      if (!message) return null;
      const match = String(message).match(/player-count\s+(\d+)\/(\d+)/);
      if (!match) return null;
      const current = Number(match[1]);
      const expected = Number(match[2]);
      if (!Number.isFinite(current) || !Number.isFinite(expected) || expected <= current) return null;
      return { current, expected, missing: expected - current };
    }
    function buildMissingPlayerFillPlan(loopDef, inspection) {
      const missing = parseMissingPlayerCount(inspection);
      if (!missing) return null;
      const players = [...inspection.items || []];
      const usedIds = new Set(players.map((item) => Number(item?.id || 0)).filter(Boolean));
      const usedDefinitionIds = new Set(players.map((item) => Number(item?.definitionId || 0)).filter(Boolean));
      const fillers = sortNormalRepairEntries(getEligibleNormalRepairEntries(loopDef, usedIds, { usedDefinitionIds }));
      const changes = [];
      for (let offset = 0; offset < missing.missing; offset++) {
        const filler = fillers.find(({ item }) => {
          const definitionId2 = Number(item?.definitionId || 0);
          return !definitionId2 || !usedDefinitionIds.has(definitionId2);
        });
        if (!filler) return null;
        const fillerIndex = fillers.indexOf(filler);
        if (fillerIndex >= 0) fillers.splice(fillerIndex, 1);
        players.push(filler.item);
        usedIds.add(Number(filler.item?.id || 0));
        const definitionId = Number(filler.item?.definitionId || 0);
        if (definitionId) usedDefinitionIds.add(definitionId);
        changes.push({
          index: missing.current + offset,
          from: null,
          to: filler.item,
          pileName: filler.pileName,
          reason: "submit-ready missing player fill"
        });
      }
      const plannedInspection = inspectSbcItems(loopDef, players, { expectedPlayerCount: inspection.expectedPlayerCount });
      return {
        players,
        changes,
        inspection: plannedInspection
      };
    }
    function buildSubmitReadyNormalUpgradePlan(loopDef, inspection) {
      if (!inspection?.items?.length || inspection.blocked?.length) return null;
      const missingNonPlayerCount = (inspection.missingRequirements || []).filter((message) => !String(message).startsWith("player-count "));
      if (missingNonPlayerCount.length) return null;
      if (parseMissingPlayerCount(inspection)) {
        return buildMissingPlayerFillPlan(loopDef, inspection);
      }
      const usedIds = new Set((inspection.items || []).map((item) => Number(item?.id || 0)).filter(Boolean));
      const targets = [...inspection.entries || []].filter(({ item, reasons }) => item && !isSbcSpecialItem(item) && !(reasons || []).length).sort(
        (a, b) => Number(a?.item?.rating || 0) - Number(b?.item?.rating || 0) || Number(b?.index || 0) - Number(a?.index || 0)
      );
      if (!targets.length) return null;
      for (const target of targets) {
        const targetRating = Number(target.item?.rating || 0) || 0;
        const usedDefinitionIds = new Set((inspection.items || []).filter((item, index) => index !== target.index).map((item) => Number(item?.definitionId || 0)).filter(Boolean));
        const fillers = sortNormalRepairEntries(getEligibleNormalRepairEntries(loopDef, usedIds, { usedDefinitionIds }));
        const filler = fillers.find(({ item }) => Number(item?.rating || 0) > targetRating);
        if (!filler) continue;
        const players = [...inspection.items];
        players[target.index] = filler.item;
        return {
          players,
          changes: [{
            index: target.index,
            from: target.item,
            to: filler.item,
            pileName: filler.pileName,
            reason: "submit-ready rating repair"
          }]
        };
      }
      return null;
    }
    function summarizeSquadRatings(items = []) {
      const counts = /* @__PURE__ */ new Map();
      for (const item of items || []) {
        const rating = Number(item?.rating || 0);
        if (!rating) continue;
        counts.set(rating, (counts.get(rating) || 0) + 1);
      }
      return [...counts.entries()].sort((a, b) => b[0] - a[0]).map(([rating, count]) => `${rating}x${count}`).join(", ") || "none";
    }
    async function repairSubmitReadinessIfNeeded(loopDef, opened, fillResult, inspection) {
      const missingRequirements = inspection.missingRequirements || [];
      const hasNonPlayerCountMissing = missingRequirements.some((message) => !String(message).startsWith("player-count "));
      if (fillResult.submitReady || inspection.blocked?.length || hasNonPlayerCountMissing) {
        return { fillResult, inspection, planned: false, repaired: false };
      }
      const maxAttempts = Math.max(0, Math.min(10, Number(loopDef.submitReadyRepairMaxAttempts ?? 2) || 0));
      if (!maxAttempts) return { fillResult, inspection, planned: false, repaired: false };
      let nextFillResult = fillResult;
      let nextInspection = inspection;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const plan = buildSubmitReadyNormalUpgradePlan(loopDef, nextInspection);
        if (!plan) {
          const missingPlayers = parseMissingPlayerCount(nextInspection);
          if (missingPlayers) {
            log(`${loopDef.name}: submit-ready repair found no eligible normal gold player to fill ${missingPlayers.current}/${missingPlayers.expected} squad slots`);
          } else {
            log(`${loopDef.name}: submit-ready repair found no eligible normal gold upgrade candidate`);
          }
          const maxRating = Number(loopDef.maxNormalGoldSubmittedRating || loopDef.maxSubmittedRating || 0);
          log(`${loopDef.name}: safe fodder exhausted at squad ratings ${summarizeSquadRatings(nextInspection.items)}; no unused eligible normal gold card can raise another slot${maxRating ? ` within rating <= ${maxRating}` : ""}; special, FSU-locked, and over-cap cards remain protected`);
          return { fillResult: nextFillResult, inspection: nextInspection, planned: false, repaired: false };
        }
        const changes = plan.changes || (plan.change ? [plan.change] : []);
        changes.forEach((change) => {
          log(`${loopDef.name}: submit-ready repair ${attempt}/${maxAttempts} - ${formatRepairChange(change)}`);
        });
        if (loopDef.dryRun) {
          log(`${loopDef.name}: dry-run would save submit-ready repair and re-check before submit`);
          return {
            fillResult: nextFillResult,
            inspection: inspectSbcItems(loopDef, plan.players, { expectedPlayerCount: nextInspection.expectedPlayerCount }),
            planned: true,
            repaired: false
          };
        }
        await prepareSbcSquad(opened.challenge, plan.players, `${loopDef.name} submit-ready repair`);
        await waitLoadingEnd();
        await sleep(900);
        const squad = ctrl()?._squad || opened.challenge?.squad || nextFillResult?.squad;
        nextFillResult = {
          ...nextFillResult,
          squad,
          filled: getFilledSquadSlots(squad),
          submitReady: !!findSubmitButton()
        };
        nextInspection = inspectSbcSquad(loopDef, squad, { expectedPlayerCount: nextInspection.expectedPlayerCount });
        logSbcSquadInspection(loopDef, nextInspection);
        log(`${loopDef.name}: after submit-ready repair submit ${nextFillResult.submitReady ? "ready" : "not ready"}`);
        if (nextFillResult.submitReady || nextInspection.blocked.length || nextInspection.missingRequirements?.length) {
          return { fillResult: nextFillResult, inspection: nextInspection, planned: false, repaired: true };
        }
      }
      return { fillResult: nextFillResult, inspection: nextInspection, planned: false, repaired: true };
    }
    function getDryRunInjectableIssues(loopDef, inspection) {
      if (!needsAutoTotwPreflight(loopDef)) return {
        blocked: inspection?.blocked || [],
        missingRequirements: inspection?.missingRequirements || []
      };
      return {
        blocked: (inspection?.blocked || []).filter(
          ({ reasons }) => !(reasons || []).every((reason) => String(reason).startsWith("required-totw"))
        ),
        missingRequirements: (inspection?.missingRequirements || []).filter(
          (message) => !String(message).startsWith("special-count")
        )
      };
    }
    async function injectRequiredTotwIfNeeded(loopDef, opened, fillResult, inspection) {
      if (!needsRequiredTotwInjection(loopDef, inspection)) {
        return { fillResult, inspection, planned: false, injected: false };
      }
      const plan = buildRequiredTotwRepairPlan(loopDef, inspection);
      if (!plan) {
        log(`${loopDef.name}: no complete required ${requiredSpecialLabel(loopDef)} repair plan could be built`);
        return { fillResult, inspection, planned: false, injected: false };
      }
      if (plan.keepTotwMessage) log(`${loopDef.name}: required ${requiredSpecialLabel(loopDef)} repair plan: ${plan.keepTotwMessage}`);
      (plan.changes || []).forEach((change) => {
        log(`${loopDef.name}: required ${requiredSpecialLabel(loopDef)} repair - ${formatRepairChange(change)}`);
      });
      if (!plan.ok) {
        log(`${loopDef.name}: required ${requiredSpecialLabel(loopDef)} repair plan incomplete: ${plan.reason || "unknown"}`);
        return { fillResult, inspection: plan.inspection || inspection, planned: false, injected: false };
      }
      if (loopDef.dryRun) {
        log(`${loopDef.name}: dry-run would save required ${requiredSpecialLabel(loopDef)} repair plan and re-check before submit`);
        return { fillResult, inspection: plan.inspection, planned: true, injected: false };
      }
      log(`${loopDef.name}: saving required ${requiredSpecialLabel(loopDef)} repair plan`);
      await prepareSbcSquad(opened.challenge, plan.players, `${loopDef.name} required special repair`);
      await waitLoadingEnd();
      await sleep(900);
      const squad = ctrl()?._squad || opened.challenge?.squad || fillResult?.squad;
      const nextFillResult = {
        ...fillResult,
        squad,
        filled: getFilledSquadSlots(squad),
        submitReady: !!findSubmitButton()
      };
      const nextInspection = inspectSbcSquad(loopDef, squad, { expectedPlayerCount: inspection.expectedPlayerCount });
      logSbcSquadInspection(loopDef, nextInspection);
      log(`${loopDef.name}: after required ${requiredSpecialLabel(loopDef)} repair submit ${nextFillResult.submitReady ? "ready" : "not ready"}`);
      return { fillResult: nextFillResult, inspection: nextInspection, planned: false, injected: true };
    }
    function getAutoTotwUpgradeDef(loopDef = {}) {
      const override = isPlainObject(loopDef.autoTotwUpgrade) ? loopDef.autoTotwUpgrade : {};
      return {
        id: `${loopDef.id || "fill-and-verify"}-auto-totw-upgrade`,
        name: "84+ TOTW Upgrade",
        strategy: "fillAndVerifySbc",
        sbcNames: ["84+ TOTW Upgrade", "84+ TOTW", "TOTW Upgrade", "84+ TOTW \u5347\u7EA7", "84+ TOTW \u5347\u7D1A"],
        rewardPackIds: [20707, 20441],
        rewardPackNames: ["84+ TOTW 1-30 Player Pack", "TOTW 1-30 Player Pack", "84+ TOTW 1-30", "TOTW 1-30", "84+ TOTW Player Pack", "TOTW Player Pack", "84+ TOTW Pack", "TOTW Pack", "TOTW Provision Refresh", "TOTW Provision Refresh Pack"],
        maxCompletions: 1,
        maxSubmittedRating: 88,
        maxNormalGoldSubmittedRating: 99,
        ratingSbcFill: {
          priorityPiles: ["unassigned", "storage", "transfer", "club"]
        },
        requiredSpecialCount: 0,
        allowedSpecialCount: 0,
        blockSpecial: true,
        blockTradeable: false,
        openRewardPacks: true,
        ...override
      };
    }
    function getAutoFodderUpgradeDef(loopDef = {}) {
      const override = isPlainObject(loopDef.autoFodderUpgrade) ? loopDef.autoFodderUpgrade : {};
      return {
        id: `${loopDef.id || "fill-and-verify"}-auto-2x84-fodder`,
        name: "2x84+ Fodder Recovery",
        strategy: "fillAndVerifySbc",
        sbcNames: ["2x 84+ Upgrade", "2 x 84+ Upgrade"],
        rewardPackNames: ["2x 84+ Rare Gold Players Pack", "2 x 84+ Rare Gold Players Pack"],
        maxCompletions: 1,
        inventoryFillFirst: true,
        requirements: [
          { tier: "gold", rarity: "rare", count: 6, maxRating: 81, playerOnly: true, allowSpecial: false, protectHighGold: true, priorityPiles: ["storage", "club"] }
        ],
        priorityPiles: ["storage", "club"],
        requiredSpecialCount: 0,
        allowedSpecialCount: 0,
        maxSubmittedRating: 81,
        maxNormalGoldSubmittedRating: 81,
        blockSpecial: true,
        blockTradeable: false,
        openRewardPacks: true,
        forceOpenRewardPacks: true,
        ...override
      };
    }
    function getAutoFodderUpgradeAttemptLimit(loopDef = {}) {
      if (loopDef.autoFodderUpgrade === void 0 || loopDef.autoFodderUpgrade === false) return 0;
      const override = isPlainObject(loopDef.autoFodderUpgrade) ? loopDef.autoFodderUpgrade : {};
      return Math.max(1, Math.min(10, Number(override.maxAttemptsPerCompletion || 3) || 3));
    }
    async function craftAutoFodderUpgrade(loopDef, attempt, maxAttempts) {
      const upgradeDef = getAutoFodderUpgradeDef(loopDef);
      await refreshInventoryCaches(`${loopDef.name} ${upgradeDef.name} preflight`, { includePacks: false, quiet: true });
      const selection = selectInventoryPlayers3(upgradeDef);
      log(`${loopDef.name}: ${upgradeDef.name} attempt ${attempt}/${maxAttempts} selected ${selection.selected.length}/6 low rare gold player(s) (${formatSelectionStats(selection.stats)})`);
      if (!selection.ok) {
        logSelectionDiagnostics(`${loopDef.name} ${upgradeDef.name}`, selection, upgradeDef.priorityPiles);
        log(`${loopDef.name}: ${upgradeDef.name} recovery is unavailable; keeping the current 84x10 unsubmitted`);
        return { ok: false, reason: "not enough eligible low rare gold fodder" };
      }
      await unwindSbcSquadControllers(`${loopDef.name} before ${upgradeDef.name}`);
      log(`${loopDef.name}: safe rating fodder exhausted; submitting ${upgradeDef.name} ${attempt}/${maxAttempts} before retrying 84x10`);
      const result = await runFillAndVerifyLoop(upgradeDef);
      await unwindSbcSquadControllers(`${loopDef.name} after ${upgradeDef.name}`);
      await refreshInventoryCaches(`${loopDef.name} after ${upgradeDef.name}`, { includePacks: false, quiet: true });
      if (Number(result?.completions || 0) < 1) {
        return { ok: false, reason: `${upgradeDef.name} was not submitted` };
      }
      if (Number(result?.rewardPacksOpened || 0) < 1) {
        log(`${loopDef.name}: ${upgradeDef.name} was submitted but its reward pack was not opened; stop before consuming another six cards`);
        return { ok: false, reason: `${upgradeDef.name} reward pack was not opened` };
      }
      return { ok: true };
    }
    async function openExistingAutoTotwPackIfAvailable(loopDef, upgradeDef) {
      const pack = await findRewardPack(upgradeDef, null, {
        attempts: 2,
        delayMs: 1e3,
        fallbackPackMatcher: isLikelyTotwRewardPack
      });
      if (!pack) return false;
      log(`${loopDef.name}: opening existing ${upgradeDef.name} reward pack before crafting another ${requiredSpecialLabel(loopDef)}: ${packName(pack)} (#${pack.id})`);
      const opened = await openRewardPackAndCleanup(upgradeDef, pack.id, "existing auto TOTW reward pack", {
        assumeTotwReward: true,
        fallbackPackMatcher: isLikelyTotwRewardPack,
        openAttempts: 3
      });
      if (opened) {
        await refreshInventoryCaches(`${loopDef.name} post-existing TOTW pack`, { includePacks: false, quiet: true });
        resolveRecentRewardItems(`${loopDef.name} post-existing TOTW pack`);
      }
      return opened;
    }
    async function craftAutoTotwUpgrade(loopDef) {
      const upgradeDef = getAutoTotwUpgradeDef(loopDef);
      log(`${loopDef.name}: no eligible ${requiredSpecialLabel(loopDef)} found; submitting ${upgradeDef.name} first`);
      const result = await runFillAndVerifyLoop(upgradeDef);
      if (Number(result?.completions || 0) < 1) {
        const reason = `${upgradeDef.name} was not submitted`;
        log(`${loopDef.name}: cannot auto-craft ${requiredSpecialLabel(loopDef)} because ${reason}`);
        return { ok: false, reason };
      }
      if (Number(result?.rewardPacksOpened || 0) < 1) {
        const reason = `${upgradeDef.name} reward pack was not opened`;
        log(`${loopDef.name}: cannot auto-craft ${requiredSpecialLabel(loopDef)} because ${reason}`);
        return { ok: false, reason };
      }
      return { ok: true };
    }
    async function ensureTotwForFillAndVerify(loopDef) {
      if (!needsAutoTotwPreflight(loopDef)) return true;
      const required = Math.max(1, Number(loopDef.requiredSpecialCount || 1) || 1);
      await refreshInventoryCaches(`${loopDef.name} ${requiredSpecialLabel(loopDef)} preflight`, { includePacks: false, quiet: true });
      resolveRecentRewardItems(`${loopDef.name} ${requiredSpecialLabel(loopDef)} preflight`);
      let entries = sortRequiredSpecialEntriesForSubmit(getSubmittableRequiredSpecialEntries(loopDef));
      if (entries.length >= required) {
        log(`${loopDef.name}: ${requiredSpecialLabel(loopDef)} preflight found ${entries.length} eligible ${requiredSpecialLabel(loopDef)} card(s): ${summarizeRequiredSpecialEntries(entries)}`);
        return true;
      }
      logRequiredSpecialPreflightDiagnostics(loopDef);
      const upgradeDef = getAutoTotwUpgradeDef(loopDef);
      if (loopDef.dryRun) {
        await refreshStorePacks().catch(() => null);
        const existingPack = findRewardPackInCache(upgradeDef, null);
        if (existingPack) {
          log(`${loopDef.name}: dry-run found unopened ${upgradeDef.name} reward pack ${packName(existingPack)} (#${existingPack.id}); live run would open it before crafting another ${requiredSpecialLabel(loopDef)}`);
          return true;
        }
        const set = await findSbcSet(upgradeDef.sbcNames, upgradeDef.name);
        const challenge = shouldUseRatingSbcFill(upgradeDef) ? await findAvailableRatingSbcChallenge(set, upgradeDef.name) : await findAvailableSbcChallenge(set, upgradeDef.name);
        if (challenge) {
          log(`${loopDef.name}: dry-run found no eligible ${requiredSpecialLabel(loopDef)}; live run would submit ${upgradeDef.name} (#${set.id || "?"}) first`);
        } else {
          log(`${loopDef.name}: dry-run found no eligible ${requiredSpecialLabel(loopDef)} and no available ${upgradeDef.name} challenge remains`);
        }
        return true;
      }
      const openedExistingPack = await openExistingAutoTotwPackIfAvailable(loopDef, upgradeDef);
      if (openedExistingPack) {
        entries = await waitForSubmittableRequiredSpecialEntries(loopDef, required, "post-existing TOTW pack");
        if (entries.length >= required) {
          log(`${loopDef.name}: ${requiredSpecialLabel(loopDef)} ready after opening existing pack: ${summarizeRequiredSpecialEntries(entries)}`);
          return true;
        }
        log(`${loopDef.name}: existing ${upgradeDef.name} reward pack opened but no eligible ${requiredSpecialLabel(loopDef)} was detected; trying ${upgradeDef.name} SBC if available`);
      }
      const crafted = await craftAutoTotwUpgrade(loopDef);
      if (!crafted?.ok) {
        log(`${loopDef.name}: stopping before SBC fill because required ${requiredSpecialLabel(loopDef)} is unavailable (${crafted?.reason || "auto craft failed"})`);
        return false;
      }
      await refreshInventoryCaches(`${loopDef.name} post-TOTW craft`, { includePacks: false, quiet: true });
      resolveRecentRewardItems(`${loopDef.name} post-TOTW craft`);
      entries = await waitForSubmittableRequiredSpecialEntries(loopDef, required, "post-TOTW craft");
      if (entries.length < required) {
        fail(`${loopDef.name}: ${upgradeDef.name} completed/opened but no eligible ${requiredSpecialLabel(loopDef)} card was detected for 84x10; check the reward item log and inventory state`);
      }
      log(`${loopDef.name}: auto ${requiredSpecialLabel(loopDef)} ready: ${summarizeRequiredSpecialEntries(entries)}`);
      return true;
    }
    function getSbcProtectionReasons(item, loopDef = {}, context = {}) {
      const reasons = [];
      const rating = Number(item?.rating || 0);
      const itemId = Number(item?.id || 0);
      const settings = context.settings || getFsuSettings();
      const maxRating = getSubmittedRatingLimit(item, loopDef, settings);
      const protectedIds = context.protectedItemIds || new Set((loopDef.protectedItemIds || []).map(Number));
      const protectedDefinitionIds = context.protectedDefinitionIds || new Set((loopDef.protectedDefinitionIds || []).map(Number));
      const allowedSpecialCount = context.allowedSpecialCount !== void 0 ? Math.max(0, Number(context.allowedSpecialCount || 0) || 0) : Math.max(0, Number(loopDef.allowedSpecialCount || 0) || 0);
      const requiredSpecialCount = Math.max(0, Number(loopDef.requiredSpecialCount || 0) || 0);
      const specialIndex = Number(context.specialIndex || 0) || 0;
      const fsuSpec = {
        playerOnly: true,
        allowSpecial: requiredSpecialCount > 0 && specialIndex <= requiredSpecialCount
      };
      if (itemId && state.consumedItemIds.has(itemId)) reasons.push("consumed-this-run");
      if (isLoanItem(item)) reasons.push("loan");
      else if (isLimitedUseItem(item)) reasons.push("limited-use");
      if (isConceptItem(item)) reasons.push("concept");
      try {
        if (item?.isEnrolledInAcademy?.()) reasons.push("academy");
      } catch {
      }
      if (item?.endTime !== void 0 && Number(item.endTime) !== -1) reasons.push("active-trade");
      if (!isInactiveTrade(item)) {
        if (!reasons.includes("active-trade")) reasons.push("active-trade");
      }
      if (protectedIds.has(itemId)) reasons.push("protected-id");
      if (protectedDefinitionIds.has(Number(item?.definitionId || 0))) reasons.push("protected-def");
      if (["totw", "totw-tots-fof"].includes(requiredSpecialKind(loopDef)) && requiredSpecialCount > 0 && isSbcSpecialItem(item) && specialIndex <= requiredSpecialCount && !isRequiredSpecialItem(item, loopDef)) {
        reasons.push("required-totw");
      }
      if (["totw", "totw-tots-fof"].includes(requiredSpecialKind(loopDef)) && requiredSpecialCount > 0 && isRequiredSpecialItem(item, loopDef) && specialIndex <= requiredSpecialCount && Number(loopDef.requiredSpecialMinRating || 0) && rating < Number(loopDef.requiredSpecialMinRating || 0)) {
        reasons.push(`required-totw-min-${Number(loopDef.requiredSpecialMinRating || 0)}`);
      }
      if (loopDef.blockSpecial !== false && isSbcSpecialItem(item) && (!allowedSpecialCount || specialIndex > allowedSpecialCount)) {
        reasons.push("special-blocked");
      }
      if (loopDef.blockTradeable === true && isTradeable(item) && !isNormalGoldFodder(item)) reasons.push("tradeable-blocked");
      if (maxRating && rating > maxRating) reasons.push(`rating-over-${maxRating}`);
      getFsuRejectReasons(item, fsuSpec, settings, context).forEach((reason) => {
        if (!reasons.includes(reason)) reasons.push(reason);
      });
      return reasons;
    }
    function inspectSbcItems(loopDef, items = [], options = {}) {
      const blocked2 = [];
      const entries = [];
      let specialCount = 0;
      const requiredSpecialCount = Math.max(0, Number(loopDef.requiredSpecialCount || 0) || 0);
      const expectedPlayerCount = Math.max(
        0,
        Number(options.expectedPlayerCount || 0) || Number(loopDef.expectedPlayerCount || 0) || (loopDef.inventoryFillFirst === true ? sumRequirementPlayerCount(loopDef) : 0) || 0
      );
      items.forEach((item, index) => {
        if (isSbcSpecialItem(item)) specialCount++;
        const reasons = getSbcProtectionReasons(item, loopDef, { specialIndex: specialCount });
        entries.push({ item, index, reasons });
        if (reasons.length) blocked2.push({ item, index, reasons });
      });
      const requiredSpecialMetCount = entries.filter(
        ({ item, reasons }) => isRequiredSpecialItem(item, loopDef) && !(reasons || []).some(
          (reason) => String(reason).startsWith("required-totw") || String(reason).startsWith("rating-over-") || String(reason).startsWith("fsu-") || ["special-blocked", "tradeable-blocked", "protected-id", "protected-def", "loan", "limited-use", "concept", "academy", "active-trade", "consumed-this-run"].includes(String(reason))
        )
      ).length;
      const missingRequirements = [];
      if (expectedPlayerCount && items.length < expectedPlayerCount) {
        missingRequirements.push(`player-count ${items.length}/${expectedPlayerCount}`);
      }
      if (requiredSpecialCount && requiredSpecialMetCount < requiredSpecialCount) {
        missingRequirements.push(`special-count ${requiredSpecialMetCount}/${requiredSpecialCount}`);
      }
      return { items, entries, blocked: blocked2, specialCount, requiredSpecialMetCount, expectedPlayerCount, missingRequirements };
    }
    function inspectSbcSquad(loopDef, squad = ctrl()?._squad, options = {}) {
      return inspectSbcItems(loopDef, getSquadItems(squad), options);
    }
    function logSbcSquadInspection(loopDef, inspection, options = {}) {
      const maxItems = Number(options.maxItems || 20);
      const requiredPart = Math.max(0, Number(loopDef.requiredSpecialCount || 0) || 0) ? `, ${requiredSpecialLabel(loopDef)} ${inspection.requiredSpecialMetCount || 0}/${Number(loopDef.requiredSpecialCount || 0)}` : "";
      const playerCountPart = inspection.expectedPlayerCount ? `${inspection.items.length}/${inspection.expectedPlayerCount}` : String(inspection.items.length);
      log(`${loopDef.name}: squad inspection ${playerCountPart} item(s), special ${inspection.specialCount || 0}${requiredPart}, blocked ${inspection.blocked.length}`);
      (inspection.entries || []).slice(0, maxItems).forEach(({ item, index, reasons }) => {
        log(`${loopDef.name}: squad ${formatSquadItem(item, index)}${reasons.length ? ` | BLOCK ${reasons.join(",")}` : ""}`);
      });
      if (inspection.items.length > maxItems) {
        log(`${loopDef.name}: squad list truncated: ${inspection.items.length - maxItems} more item(s)`);
      }
      (inspection.missingRequirements || []).forEach((message) => {
        log(`${loopDef.name}: missing requirement ${message}`);
      });
    }
    function getManualSbcFixHints(loopDef, inspection) {
      const hints = [];
      const allowedSpecialCount = Math.max(0, Number(loopDef.allowedSpecialCount || 0) || 0);
      const requiredSpecialCount = Math.max(0, Number(loopDef.requiredSpecialCount || 0) || 0);
      for (const { item, index, reasons } of inspection.blocked || []) {
        const name = itemDisplayName(item);
        const rating = Number(item?.rating || 0) || "?";
        const itemId = Number(item?.id || 0) || "?";
        const definitionId = Number(item?.definitionId || 0) || "?";
        const ratingLimit = getSubmittedRatingLimit(item, loopDef);
        const prefix = `slot ${index + 1} ${name} rating:${rating} id:${itemId} def:${definitionId}`;
        if (reasons.some((reason) => reason.startsWith("rating-over-"))) {
          const replacement = isNormalGoldFodder(item) ? "normal gold card" : "untradeable card";
          hints.push(`${prefix}: replace with rating <= ${ratingLimit || "limit"} ${replacement}`);
        }
        if (reasons.includes("special-blocked")) {
          hints.push(`${prefix}: replace extra special card with a normal/rare gold card`);
        }
        if (reasons.includes("required-totw")) {
          hints.push(`${prefix}: replace this special card with a ${requiredSpecialLabel(loopDef)} card`);
        }
        const requiredTotwMinReason = reasons.find((reason) => String(reason).startsWith("required-totw-min-"));
        if (requiredTotwMinReason) {
          const minRating = requiredTotwMinReason.replace("required-totw-min-", "") || Number(loopDef.requiredSpecialMinRating || 0) || "?";
          hints.push(`${prefix}: replace with a ${requiredSpecialLabel(loopDef)} card rating >= ${minRating}`);
        }
        if (reasons.includes("tradeable-blocked")) {
          hints.push(`${prefix}: replace tradeable card with an untradeable card`);
        }
        if (reasons.includes("consumed-this-run")) {
          hints.push(`${prefix}: stale cache item was already submitted in this run; refresh/retry or replace it`);
        }
        if (reasons.includes("fsu-only-untradeable")) {
          hints.push(`${prefix}: FSU Only Untradeable is enabled; replace with an untradeable card`);
        }
        if (reasons.includes("fsu-exclude-evolution")) {
          hints.push(`${prefix}: FSU Exclude Evolution is enabled; replace this Evolution card`);
        }
        const leagueReason = reasons.find((reason) => reason.startsWith("fsu-excluded-league-"));
        if (leagueReason) {
          hints.push(`${prefix}: FSU excluded league ${leagueReason.replace("fsu-excluded-league-", "")}; replace with another league`);
        }
        const goldRangeReason = reasons.find((reason) => reason.startsWith("fsu-gold-range-"));
        if (goldRangeReason) {
          hints.push(`${prefix}: outside FSU Golden Player Range ${goldRangeReason.replace("fsu-gold-range-", "")}; replace it or change FSU settings`);
        }
        if (reasons.includes("fsu-rarity-player-off")) {
          hints.push(`${prefix}: FSU Use Rarity Player is off; replace this special/rarity card`);
        }
        if (reasons.includes("fsu-locked-player")) {
          hints.push(`${prefix}: locked in FSU Lock player; unlock it or replace this card`);
        }
        if (reasons.includes("loan") || reasons.includes("limited-use")) {
          hints.push(`${prefix}: replace loan/limited-use card with an owned card`);
        }
        if (reasons.includes("concept")) {
          hints.push(`${prefix}: replace concept card`);
        }
        if (reasons.includes("academy")) {
          hints.push(`${prefix}: replace academy/evolution locked card`);
        }
        if (reasons.includes("active-trade")) {
          hints.push(`${prefix}: remove active transfer/listed card`);
        }
        if (reasons.includes("protected-id") || reasons.includes("protected-def")) {
          hints.push(`${prefix}: protected by custom config; replace it before live submit`);
        }
      }
      if (requiredSpecialCount && (inspection.requiredSpecialMetCount || 0) < requiredSpecialCount) {
        const requiredSpecialMaxRating = Number(loopDef.maxSubmittedRating || 0);
        hints.push(`add ${requiredSpecialCount - (inspection.requiredSpecialMetCount || 0)} untradeable ${requiredSpecialLabel(loopDef)} card(s) rating <= ${requiredSpecialMaxRating || "limit"}`);
      }
      const missingPlayers = parseMissingPlayerCount(inspection);
      if (missingPlayers) {
        hints.push(`add ${missingPlayers.missing} eligible normal gold player(s) to fill ${missingPlayers.current}/${missingPlayers.expected} squad slots`);
      }
      if (allowedSpecialCount && (inspection.specialCount || 0) > allowedSpecialCount) {
        hints.push(`keep only ${allowedSpecialCount} special card(s); replace the remaining special card(s) with normal/rare gold`);
      }
      return [...new Set(hints)];
    }
    function logManualSbcFixHints(loopDef, inspection) {
      const hints = getManualSbcFixHints(loopDef, inspection);
      if (!hints.length) return;
      log(`${loopDef.name}: manual fix needed before live submit:`);
      hints.slice(0, 12).forEach((hint) => log(`${loopDef.name}: manual fix - ${hint}`));
      if (hints.length > 12) log(`${loopDef.name}: manual fix list truncated: ${hints.length - 12} more`);
    }
    function assertSbcSquadSafe(loopDef, inspection) {
      if (!inspection.items.length) fail(`${loopDef.name}: no squad items detected after fill`);
      if (inspection.missingRequirements?.length) {
        logManualSbcFixHints(loopDef, inspection);
        fail(`${loopDef.name}: missing squad requirement(s): ${inspection.missingRequirements.join(", ")}`);
      }
      if (!inspection.blocked.length) return;
      logManualSbcFixHints(loopDef, inspection);
      const summary = inspection.blocked.slice(0, 10).map(({ item, index, reasons }) => `${index + 1}. ${itemDisplayName(item)} rating:${Number(item?.rating || 0) || "?"} (${reasons.join(",")})`).join("; ");
      fail(`${loopDef.name}: protected squad item(s) detected; stop before submit: ${summary}`);
    }
    function compactModalText(text = "") {
      return String(text || "").replace(/\s+/g, " ").trim().slice(0, 220);
    }
    function findSbcSubmitErrorModal() {
      const modals = Array.from(document.querySelectorAll([
        ".view-modal-container",
        ".ut-modal-view",
        ".ea-dialog",
        ".modal-content",
        ".ut-dialog"
      ].join(",")));
      for (const modal of modals) {
        const text = compactModalText(modal.textContent || "");
        if (!text) continue;
        if (/Ineligible Squad/i.test(text) || /Concept or Loan Players/i.test(text) || /cannot be submitted in Squad Building Challenges/i.test(text) || /Squads containing .*Loan/i.test(text)) {
          return { modal, text };
        }
      }
      return null;
    }
    function dismissSubmitErrorModal(error) {
      const modal = error?.modal;
      if (!modal) return false;
      const buttons = Array.from(modal.querySelectorAll("button"));
      const button = buttons.find((btn) => /^(ok|okay|确定|確定)$/i.test(String(btn.textContent || "").trim())) || buttons.find((btn) => !btn.disabled);
      if (!button) return false;
      simulateClick(button);
      return true;
    }
    function failIfSbcSubmitError(label = "SBC submit") {
      const error = findSbcSubmitErrorModal();
      if (!error) return false;
      dismissSubmitErrorModal(error);
      fail(`${label}: submit blocked by EA modal: ${error.text}`);
    }
    async function fillBronzeUpgradeSquad() {
      await fillSbcSquad("Bronze Upgrade");
    }
    function findClaimRewardsButton() {
      const patterns = [
        "Claim Rewards",
        "Claim Reward",
        "Collect Rewards",
        "Collect Reward",
        "\u9886\u53D6\u5956\u52B1",
        "\u9818\u53D6\u734E\u52F5",
        "\u9886\u53D6",
        "\u9818\u53D6"
      ];
      return findButtonByText(patterns) || findClickableByText(patterns);
    }
    function findClaimRewardsContext() {
      const selectors = [
        ".view-modal-container",
        ".ut-modal",
        ".modal",
        '[class*="modal"]',
        '[class*="Modal"]'
      ].join(",");
      const contexts = Array.from(document.querySelectorAll(selectors)).filter(isClickableElement).map((el) => ({ el, text: compactText(el) })).filter(({ text }) => text && text.length < 2e3);
      return contexts.find(
        ({ text }) => matchesAny(text, ["Claim Rewards", "Claim Reward", "Collect Rewards", "Collect Reward", "\u9886\u53D6\u5956\u52B1", "\u9818\u53D6\u734E\u52F5"]) || matchesAny(text, ["Reward", "Rewards", "\u5956\u52B1", "\u734E\u52F5"]) && matchesAny(text, ["Pack", "Player", "Claim", "Collect", "\u5305", "\u7403\u5458", "\u7403\u54E1", "\u9886\u53D6", "\u9818\u53D6"])
      ) || null;
    }
    function controllerName(controller) {
      return String(controller?.className || controller?.constructor?.name || "");
    }
    function controllerRoot(controller) {
      try {
        return controller?.getView?.()?.getRootElement?.() || controller?.getView?.()?.getRootElement || null;
      } catch {
        return null;
      }
    }
    function isSbcRewardsController(controller) {
      if (!controller) return false;
      if (/UTGameRewardsViewController/i.test(controllerName(controller))) return true;
      const root = controllerRoot(controller);
      return !!root?.querySelector?.('.rewards-footer, .reward, [class*="game-rewards"], [class*="GameRewards"]');
    }
    function getActiveSbcRewardsController() {
      const shield = W.gPopupClickShield;
      if (!shield) return null;
      const candidates = [];
      for (const method of ["getActivePopup", "getActivePopupController", "getPopup", "getPopupController"]) {
        try {
          if (typeof shield?.[method] === "function") candidates.push(shield[method]());
        } catch {
        }
      }
      for (const property of [
        "activePopup",
        "_activePopup",
        "popup",
        "_popup",
        "popupController",
        "_popupController",
        "activeController",
        "_activeController",
        "presentedController",
        "_presentedController"
      ]) {
        try {
          candidates.push(shield?.[property]);
        } catch {
        }
      }
      try {
        candidates.push(...Object.values(shield).slice(0, 80));
      } catch {
      }
      return candidates.find(isSbcRewardsController) || null;
    }
    function findSbcRewardsDomRoot() {
      const marker = Array.from(document.querySelectorAll('.rewards-footer, [class*="game-rewards"], [class*="GameRewards"]')).find(isClickableElement);
      if (!marker) return null;
      return marker.closest?.('.view-modal-container, .ea-dialog-view, [class*="modal"], [class*="Modal"]') || marker.parentElement;
    }
    function isPopupShieldShowing() {
      try {
        return W.gPopupClickShield?.isShowing?.() === true;
      } catch {
        return false;
      }
    }
    function hasVisibleSbcRewardsUi() {
      return !!getActiveSbcRewardsController() || !!findSbcRewardsDomRoot() || !!findClaimRewardsContext();
    }
    async function dismissSbcRewardsUi(label) {
      const controller = getActiveSbcRewardsController();
      if (controller && typeof controller.onBackButton === "function") {
        log(`${label}: closing ${controllerName(controller) || "SBC reward"} overlay`);
        controller.onBackButton();
        await sleep(700);
        return true;
      }
      const root = findSbcRewardsDomRoot();
      const action2 = root?.querySelector?.("footer button.call-to-action:not(.disabled), button.call-to-action:not(.disabled), footer button:not(.disabled)");
      if (!action2) return false;
      log(`${label}: advancing SBC reward overlay${compactText(action2) ? ` (${compactText(action2)})` : ""}`);
      simulateClick(action2);
      await sleep(700);
      return true;
    }
    function getSbcProgressSnapshot(set) {
      return {
        setComplete: isSbcSetComplete(set),
        setTimesCompleted: Number.isFinite(Number(set?.timesCompleted)) ? Number(set.timesCompleted) : null,
        challenges: getCachedSbcChallenges(set).map((challenge) => ({
          id: Number(challenge?.id || 0),
          completed: isCompletedChallenge(challenge),
          timesCompleted: Number.isFinite(Number(challenge?.timesCompleted)) ? Number(challenge.timesCompleted) : null
        }))
      };
    }
    async function claimSbcRewardsIfPresent(label = "SBC submit", options = {}) {
      const start = Date.now();
      let lastHotkeyAt = 0;
      let lastPackRefreshAt = 0;
      while (Date.now() - start < 25e3) {
        stopPoint();
        failIfSbcSubmitError(label);
        if (await dismissSbcRewardsUi(label)) continue;
        const btn = findClaimRewardsButton();
        if (btn) {
          log(`${label}: claiming rewards`);
          simulateClick(btn);
          await waitLoadingEnd(900, 45e3);
          await sleep(1200);
          return true;
        }
        const elapsed = Date.now() - start;
        if (elapsed >= 1500) {
          const progressAdvanced = options.beforeProgress ? hasSbcProgressAdvanced(options.beforeProgress, getSbcProgressSnapshot(options.set)) : false;
          let packGranted = options.beforePackCounts ? hasPackCountIncrease(options.beforePackCounts, getPackCountsById()) : false;
          if (!packGranted && options.beforePackCounts && elapsed - lastPackRefreshAt >= 2500) {
            lastPackRefreshAt = elapsed;
            await refreshStorePacks().catch(() => null);
            packGranted = hasPackCountIncrease(options.beforePackCounts, getPackCountsById());
          }
          if ((progressAdvanced || packGranted) && !hasVisibleSbcRewardsUi() && !isPopupShieldShowing()) {
            log(`${label}: rewards already granted (${packGranted ? "My Packs increased" : "SBC progress advanced"}); skipping Claim Rewards wait`);
            return true;
          }
        }
        const context2 = findClaimRewardsContext();
        const now2 = Date.now();
        if (context2 && now2 - lastHotkeyAt > 2500) {
          lastHotkeyAt = now2;
          log(`${label}: Claim Rewards button not clickable; trying AltRight reward hotkey`);
          simulateKeyStroke("Alt", "AltRight", { altKey: true, location: 2 });
          simulateKeyStroke("AltRight", "AltRight", { altKey: true, location: 2 });
          await waitLoadingEnd(500, 12e3);
          await sleep(1200);
          return true;
        }
        await sleep(500);
      }
      const context = findClaimRewardsContext();
      const contextText = context?.text ? `; modal text: ${context.text.slice(0, 180)}` : "";
      log(`${label}: Claim Rewards button not detected${contextText}; continuing`);
      return false;
    }
    async function submitSbcAndGetAwardPackId(set) {
      const beforePackCounts = getPackCountsById();
      const beforeProgress = getSbcProgressSnapshot(set);
      const submitBtn = await waitFor(() => findSubmitButton(), 1e4, "submit button");
      log(`Submitting SBC: ${set.name}`);
      simulateClick(submitBtn);
      await sleep(900);
      failIfSbcSubmitError(set.name);
      const confirm = document.querySelector(".view-modal-container button.call-to-action:not(.disabled)") || findButtonByText([
        "Exchange Players",
        "Submit SBC",
        "Submit",
        "Confirm",
        "OK",
        "Ok",
        "Yes",
        "\u5151\u6362\u7403\u5458",
        "\u4EA4\u63DB\u7403\u54E1",
        "\u63D0\u4EA4",
        "\u786E\u8BA4",
        "\u78BA\u5B9A",
        "\u786E\u5B9A",
        "\u662F"
      ]);
      if (confirm && confirm !== submitBtn) {
        log(`Confirming SBC submit: ${confirm.textContent.trim() || confirm.className}`);
        simulateClick(confirm);
        await sleep(900);
        failIfSbcSubmitError(set.name);
      }
      await claimSbcRewardsIfPresent(set.name, { set, beforePackCounts, beforeProgress });
      await waitLoadingEnd(900, 45e3);
      await refreshStorePacks().catch(() => null);
      const awardId = Number(set?.awards?.[0]?.value) || null;
      let rewardPackId = awardId;
      if (!rewardPackId) {
        const afterPacks = getAvailableRepositoryMyPacks();
        const afterPackCounts = getPackCountsById(afterPacks);
        const newPack = afterPacks.find((pack) => {
          const id = packIdKey(pack);
          return id && Number(afterPackCounts.get(id) || 0) > Number(beforePackCounts.get(id) || 0);
        });
        rewardPackId = Number(packIdKey(newPack)) || null;
      }
      await syncAfterSbcSubmit(set?.name || "SBC submit");
      return rewardPackId;
    }
    function rewardPackIdFromSubmitResult(result, set) {
      const awards = result?.data?.grantedChallengeAwards || result?.response?.grantedChallengeAwards || [];
      for (const award of awards) {
        const values = [
          award?.value,
          award?.id,
          award?.packId,
          award?.packDefinitionId,
          award?.item?.id,
          award?.item?.resourceId
        ];
        const id = values.map(Number).find((value) => Number.isFinite(value) && value > 0);
        if (id) return id;
      }
      return Number(set?.awards?.[0]?.value) || null;
    }
    async function submitRatingSbcInBackground(set, challenge, label = set?.name || "rating SBC") {
      const beforePackCounts = getPackCountsById();
      let canSubmit = true;
      try {
        canSubmit = challenge?.canSubmit?.() !== false;
      } catch {
      }
      if (!canSubmit) fail(`${label}: challenge model rejected the background squad before submit`);
      const skipValidation = W.services?.UserSettings?.getSBCValidationSkip?.() || false;
      const chemistryEnabled = W.services?.Chemistry?.isFeatureEnabled?.() || false;
      log(`Submitting SBC in background: ${set.name}`);
      const result = await observeOnce(
        eaSbcAdapter().submitChallenge(challenge, set, { skipValidation, chemistryEnabled }),
        ctrl(),
        45e3,
        `submitChallenge ${label}`
      );
      if (!result?.success) {
        const detail = serviceResultErrorText(result) || result?.status || "unknown";
        fail(`${label}: background submit failed: ${detail}`);
      }
      await refreshStorePacks().catch(() => null);
      let rewardPackId = rewardPackIdFromSubmitResult(result, set);
      if (!rewardPackId) {
        const afterPacks = getAvailableRepositoryMyPacks();
        const afterPackCounts = getPackCountsById(afterPacks);
        const newPack = afterPacks.find((pack) => {
          const id = packIdKey(pack);
          return id && Number(afterPackCounts.get(id) || 0) > Number(beforePackCounts.get(id) || 0);
        });
        rewardPackId = Number(packIdKey(newPack)) || null;
      }
      log(`${label}: background submit complete; reward pack ${rewardPackId || "unknown"}`);
      return rewardPackId;
    }
    async function openRewardSilverPack(packId2) {
      await refreshStorePacks();
      let pack = findPackById(packId2);
      if (!pack) pack = findPackByName(CFG.silverRewardNames);
      if (!pack) {
        const names = getMyPacks().map((p) => `${packName(p)} (#${p.id})`).join(", ");
        fail(`Silver reward pack not found. Current my packs: ${names || "none"}`);
      }
      await openPack(pack, "Bronze Upgrade reward", {
        openedItemPolicy: createOpenedItemPolicy(async (openedItems) => {
          const silverCount = openedItems.filter((item) => isPlayer(item) && isSilver(item)).length;
          log(`Reward opened; detected ${silverCount} silver player(s)`);
          log(`Handling ${openedItems.length} reward item(s) with unassigned cleanup strategy`);
          await resolveRuntimeUnassigned("reward item handling");
          await refreshUnassigned();
          return openedItemRoutingResult(openedItems, null, { silverCount });
        })
      });
    }
    async function findLoopPack(loopDef, explicitPackId = null) {
      await refreshStorePacks();
      let pack = explicitPackId ? findPackById(explicitPackId) : null;
      if (!pack && loopDef.rewardPackIds?.length) {
        pack = loopDef.rewardPackIds.map((id) => findPackById(id)).find(Boolean);
      }
      if (!pack && loopDef.sourcePackIds?.length) {
        pack = loopDef.sourcePackIds.map((id) => findPackById(id)).find(Boolean);
      }
      if (!pack && loopDef.rewardPackNames?.length) pack = findPackByName(loopDef.rewardPackNames);
      if (!pack && loopDef.sourcePackNames?.length) pack = findPackByName(loopDef.sourcePackNames);
      return pack || null;
    }
    function findRewardPackInCache(loopDef, explicitPackId = null, options = {}) {
      let pack = explicitPackId ? findPackById(explicitPackId) : null;
      if (!pack && loopDef.rewardPackIds?.length) {
        pack = loopDef.rewardPackIds.map((id) => findPackById(id)).find(Boolean);
      }
      if (!pack && loopDef.rewardPackNames?.length) pack = findPackByName(loopDef.rewardPackNames);
      if (!pack && options.fallbackPackMatcher) pack = findPackByPredicate(options.fallbackPackMatcher);
      return pack || null;
    }
    async function findRewardPack(loopDef, explicitPackId = null, options = {}) {
      const attempts = Math.max(1, Number(options.attempts || 1) || 1);
      const delayMs = Math.max(0, Number(options.delayMs || 0) || 0);
      let storeFallbackTried = false;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        await refreshStorePacks().catch((e) => {
          if (attempt === attempts) log(`Reward pack refresh failed: ${e.message || e}`);
        });
        const pack = findRewardPackInCache(loopDef, explicitPackId, options);
        if (pack) return pack;
        if (options.openStoreFallback !== false && !storeFallbackTried && (attempt === attempts || attempt >= Math.max(2, Math.ceil(attempts / 2)))) {
          storeFallbackTried = true;
          const openedStore = await openStorePacksViewForRefresh(`${loopDef.name}: reward pack lookup`).catch((e) => {
            log(`${loopDef.name}: Store Packs fallback skipped: ${e.message || e}`);
            return false;
          });
          if (openedStore) {
            const visiblePack = findRewardPackInCache(loopDef, explicitPackId, options);
            if (visiblePack) return visiblePack;
          }
        }
        if (options.logWait && (attempt === 1 || attempt === attempts || attempt % 4 === 0)) {
          log(`${loopDef.name}: waiting for reward pack${explicitPackId ? ` #${explicitPackId}` : ""} (${attempt}/${attempts}); current packs: ${summarizePacks() || "none"}`);
        }
        if (attempt < attempts && delayMs) await sleep(delayMs);
      }
      return null;
    }
    async function openRewardPackAndCleanup(loopDef, rewardPackId, reason = "reward pack", options = {}) {
      const openAttempts = Math.max(1, Math.min(5, Number(options.openAttempts || 1) || 1));
      for (let openAttempt = 1; openAttempt <= openAttempts; openAttempt++) {
        const pack = await findRewardPack(loopDef, rewardPackId, {
          attempts: options.findAttempts || 6,
          delayMs: options.findDelayMs || 1800,
          logWait: options.logWait,
          fallbackPackMatcher: options.fallbackPackMatcher
        });
        if (!pack) {
          const packs = summarizePacks();
          log(`${loopDef.name}: reward pack not found for auto-open${rewardPackId ? ` (#${rewardPackId})` : ""}; current packs: ${packs || "none"}`);
          return false;
        }
        const receipt = await openPack(pack, `${loopDef.name} ${reason}`, {
          allowGone: true,
          retryCodes: ["471", "500"],
          resolveRetryPack: () => findRewardPack(loopDef, rewardPackId, {
            attempts: 2,
            delayMs: options.findDelayMs || 1800,
            fallbackPackMatcher: options.fallbackPackMatcher
          }),
          openedItemPolicy: createOpenedItemPolicy(async (openedItems) => {
            if (options.assumeTotwReward) {
              markAssumedTotwRewardItems(openedItems, `${loopDef.name} ${reason}`);
            }
            await materializeOpenedPlayerRewards(openedItems, `${loopDef.name} ${reason}`);
            await resolveRuntimeUnassigned(`${loopDef.name} ${reason} handling`);
            resolveRecentRewardItems(`${loopDef.name} ${reason}`);
            await refreshUnassigned();
            return openedItemRoutingResult(openedItems, null, { assumeTotwReward: options.assumeTotwReward === true });
          })
        });
        if (!receipt) {
          if (openAttempt < openAttempts) {
            log(`${loopDef.name}: retrying reward pack lookup after stale pack (${openAttempt}/${openAttempts})`);
            await sleep(900);
            continue;
          }
          return false;
        }
        log(`${loopDef.name}: auto-opened reward pack ${packName(pack)} (#${pack.id}); ${receipt.openedItems.length} item(s)`);
        return true;
      }
      return false;
    }
    async function findSourcePack(loopDef) {
      await refreshStorePacks();
      let pack = null;
      if (loopDef.sourcePackIds?.length) {
        pack = loopDef.sourcePackIds.map((id) => findPackById(id)).find(Boolean);
      }
      if (!pack && loopDef.sourcePackNames?.length) pack = findPackByName(loopDef.sourcePackNames);
      return pack || null;
    }
    async function submitConfiguredSbc(loopDef, options = {}) {
      const attempt = await submitSbcAttempt({
        label: loopDef.name,
        challengeProvider: async () => {
          const set = await findSbcSet(loopDef.sbcNames, loopDef.name);
          return openSbcSet(set, { returnNullIfComplete: options.returnNullIfComplete });
        },
        squadProvider: createFsuFillProvider({
          fill: async () => fillSbcSquad(loopDef.name),
          getPlayers: async ({ challenge }) => getSquadItems(ctrl()?._squad || challenge?.squad),
          itemRef: liveItemRef
        }),
        preSaveValidators: [({ challenge }) => {
          const inspection = inspectSbcSquad(loopDef, ctrl()?._squad || challenge?.squad);
          logSbcSquadInspection(loopDef, inspection);
          assertSbcSquadSafe(loopDef, inspection);
          return true;
        }],
        isSubmitReady: async () => !!findSubmitButton(),
        submitTransport: async ({ set }) => ({
          submitted: true,
          rewardPackId: await submitSbcAndGetAwardPackId(set)
        })
      });
      if (attempt.status === "unavailable") {
        log(`${loopDef.name}: no available SBC challenge remains`);
        return null;
      }
      if (!attempt.submitted) {
        log(`${loopDef.name}: configured SBC submit blocked: ${attempt.reason || attempt.status}`);
        return null;
      }
      log(`${loopDef.name} reward pack id: ${attempt.rewardPackId || "unknown"}`);
      return { submitted: true, rewardPackId: attempt.rewardPackId };
    }
    function getUnassignedTargetDuplicates(loopDef) {
      return getUnassignedItems().filter((item) => isTargetDuplicate(item, loopDef));
    }
    function itemRefMatchesAny(item, refs = []) {
      const id = Number(item?.id || item?.ref?.id || 0);
      if (id) return refs.some((ref) => Number(ref?.id || 0) === id);
      const definitionId = Number(item?.definitionId || item?.ref?.definitionId || 0);
      return definitionId > 0 && refs.some((ref) => !Number(ref?.id || 0) && Number(ref?.definitionId || 0) === definitionId);
    }
    function duplicateSignalRefKey(ref = {}) {
      const id = Number(ref?.id || ref?.ref?.id || 0);
      if (id) return `id:${id}`;
      return `definition:${Number(ref?.definitionId || ref?.ref?.definitionId || 0)}`;
    }
    function rememberConsumedDuplicateSignals(refs = []) {
      for (const ref of refs) {
        const key = duplicateSignalRefKey(ref);
        if (key === "definition:0") continue;
        state.pendingConsumedDuplicateSignals.set(key, {
          id: Number(ref?.id || ref?.ref?.id || 0),
          definitionId: Number(ref?.definitionId || ref?.ref?.definitionId || 0),
          duplicateId: Number(ref?.duplicateId || 0),
          pile: "unassigned"
        });
      }
    }
    function clearConsumedDuplicateSignals(triggerRefs, label, options = {}) {
      let cleared = 0;
      let resolved = 0;
      for (const item of getUnassignedItems()) {
        const triggerRef = triggerRefs.find((ref) => itemRefMatchesAny(item, [ref]));
        if (!triggerRef) continue;
        const key = duplicateSignalRefKey(triggerRef);
        if (!isDuplicate(item)) {
          state.pendingConsumedDuplicateSignals.delete(key);
          resolved++;
          continue;
        }
        const duplicateId = Number(item?.duplicateId || triggerRef?.duplicateId || 0);
        const clubDuplicate = findClubDuplicate2(item);
        const duplicateConsumed = duplicateId && state.consumedItemIds.has(duplicateId);
        const clubDuplicateConsumed = clubDuplicate && state.consumedItemIds.has(Number(clubDuplicate?.id || 0));
        if (!duplicateConsumed && !clubDuplicateConsumed) continue;
        item.duplicateId = 0;
        if (item._duplicateId !== void 0) item._duplicateId = 0;
        state.pendingConsumedDuplicateSignals.delete(key);
        cleared++;
      }
      if (cleared && options.quiet !== true) log(`${label}: cleared ${cleared} consumed duplicate signal(s) after recovery`);
      if (resolved && options.quiet !== true) log(`${label}: confirmed ${resolved} duplicate signal(s) already resolved`);
      return cleared;
    }
    async function trySubmitUnassignedRecoveryRecipe({ policy, recipe: recipe2, triggerRefs }) {
      const label = `Unassigned ${policy.id} -> ${recipe2.name}`;
      let set;
      try {
        set = await findSbcSetIfPresent(recipe2.sbcNames);
      } catch (error) {
        log(`${label}: SBC lookup failed: ${error?.message || error}`);
        return { status: "blocked", reason: error?.message || String(error) };
      }
      if (!set) {
        log(`${label}: SBC is not currently available; trying the next configured recipe`);
        return { status: "unavailable", reason: "SBC is not currently available" };
      }
      if (isSbcSetComplete(set)) {
        log(`${label}: SBC set is complete; trying the next configured recipe`);
        return { status: "unavailable", reason: "SBC set is complete" };
      }
      let challenge;
      try {
        const challenges = await requestSbcChallenges(set, label, { allowEmpty: true, attempts: 2 });
        challenge = challenges.find((candidate) => !isCompletedChallenge(candidate)) || null;
      } catch (error) {
        log(`${label}: Challenge availability check failed: ${error?.message || error}`);
        return { status: "blocked", reason: error?.message || String(error) };
      }
      if (!challenge) {
        log(`${label}: no available Challenge remains; trying the next configured recipe`);
        return { status: "unavailable", reason: "no available Challenge remains" };
      }
      await refreshInventoryCaches(`${label} pre-selection`, { includePacks: false, quiet: true });
      const piles = recipe2.priorityPiles || ["unassigned", "storage", "transfer", "club"];
      const selection = selectInventoryPlayers3(recipe2, piles, { preferredSignalRefs: triggerRefs });
      if (!selection.ok) {
        log(`${label}: inventory cannot satisfy the configured recipe (${selection.missing?.count || "?"} missing)`);
        return { status: "insufficient", reason: "inventory cannot satisfy recipe" };
      }
      if (!selectionConsumesSignalRefs(selection, triggerRefs)) {
        log(`${label}: selected squad does not consume a blocked Unassigned duplicate; trying the next configured recipe`);
        return { status: "insufficient", reason: "selection does not consume trigger" };
      }
      const countNeeded = sumRequirementPlayerCount(recipe2);
      if (triggerRefs.length <= countNeeded && !selectionConsumesAllSignalRefs(selection, triggerRefs)) {
        const triggerItems = triggerRefs.map((ref) => getUnassignedItems().find((item) => itemRefMatchesAny(item, [ref]))).filter(Boolean);
        logDuplicateSignalDiagnostics(
          label,
          triggerItems,
          selectionRequirements(recipe2, piles)[0] || {},
          selection
        );
        return {
          status: "blocked",
          reason: `selection resolved only part of ${triggerRefs.length} blocked duplicate signal(s); diagnostic logged before submit`
        };
      }
      let opened;
      try {
        opened = await openSbcSet(set, { challenge, returnNullIfComplete: true });
      } catch (error) {
        log(`${label}: Challenge load failed: ${error?.message || error}`);
        return { status: "blocked", reason: error?.message || String(error) };
      }
      if (!opened) {
        log(`${label}: SBC has no available challenge; trying the next configured recipe`);
        return { status: "unavailable", reason: "SBC has no available challenge" };
      }
      log(`${label}: submitting one recovery squad; selected ${selection.selected.length} player(s) (${formatSelectionStats(selection.stats)})`);
      let attempt;
      try {
        attempt = await submitInventorySbcAttempt(recipe2, selection, {
          label,
          markConsumed: true,
          handleReward: false,
          opened
        });
      } catch (error) {
        log(`${label}: recovery save/submit failed: ${error?.message || error}`);
        return { status: "blocked", reason: error?.message || String(error) };
      }
      if (!attempt.result.submitted) {
        const status = attempt.result.status === "unavailable" ? "unavailable" : "blocked";
        log(`${label}: recovery submit ${status}: ${attempt.result.reason || attempt.result.status}`);
        return { status, reason: attempt.result.reason || attempt.result.status };
      }
      await refreshInventoryCaches(`${label} post-submit`, { includePacks: false, quiet: true });
      clearConsumedDuplicateSignals(triggerRefs, label);
      return { status: "progress", consumedItemIds: attempt.result.consumedItemRefs.map((ref) => ref.id) };
    }
    function buildUnassignedRecoveryResolvers(options = {}) {
      const policyIds = options.policyIds || [];
      if (!policyIds.length) return [];
      return createRecoveryOverflowResolvers({
        recipes: getRecoveryRecipes(),
        policies: getUnassignedRecoveryPolicies(),
        policyIds,
        attemptRecipe: trySubmitUnassignedRecoveryRecipe
      });
    }
    async function recoverUnassignedOverflow(loopDef, reason) {
      await refreshUnassigned();
      const overflow = getUnassignedCapacityOverflow();
      if (!overflow.blocked) return { status: "not-blocked" };
      log(`${loopDef.name}: Unassigned overflow recovery before ${reason}; blocked duplicates:${overflow.count}, ${overflow.destination} slots:${overflow.space}`);
      return resolveRuntimeUnassigned(`${loopDef.name} overflow recovery`, {
        loopDef
      });
    }
    function createRecyclePackPolicy(loopDef) {
      return createOpenedItemPolicy(async (openedItems) => {
        const targetDuplicates = openedItems.filter((item) => isTargetDuplicate(item, loopDef));
        const targetIds = new Set(targetDuplicates.map((item) => Number(item?.id || 0)));
        const directClub = openedItems.filter(
          (item) => !targetIds.has(Number(item?.id || 0)) && !isDuplicate(item)
        );
        if (directClub.length) {
          log(`Moving ${directClub.length} non-duplicate item(s) to club`);
          await moveItems(directClub, W.ItemPile.CLUB, true);
        }
        await resolveRuntimeUnassigned(`${loopDef.name} pack handling`, {
          reserveItem: (item) => isTargetDuplicate(item, loopDef)
        });
        await refreshUnassigned();
        const reserved = getUnassignedTargetDuplicates(loopDef);
        if (reserved.length) log(`${reserved.length} target duplicate(s) reserved for ${loopDef.name}`);
        const reservedIds = new Set(reserved.map((item) => Number(item?.id || 0)));
        return openedItemRoutingResult(openedItems, (item) => reservedIds.has(Number(item?.id || 0)), {
          targetDuplicateCount: reserved.length
        });
      });
    }
    async function runRecycleLoop(loopDef) {
      await waitAppReady();
      const dryRun = loopDef.dryRun === true;
      const result = await runRecycleWorkflow({
        maxCompletions: Number(loopDef.maxCompletions || 7),
        stopPoint: () => stopPoint(),
        inspectTargets: async () => {
          if (dryRun) await refreshInventoryCaches(`${loopDef.name} dry-run`, { quiet: true });
          else await refreshUnassigned();
          return getUnassignedTargetDuplicates(loopDef);
        },
        findPack: async ({ rewardPackId }) => findLoopPack(loopDef, rewardPackId),
        consumeTarget: async ({ result: current, targets }) => {
          log(`${loopDef.name}: ${dryRun ? "dry-run would consume" : "consuming"} target duplicate ${current.completions + 1}/${loopDef.maxCompletions}; available:${targets.length}`);
          if (dryRun) {
            logDryRunSelection(`${loopDef.name} target duplicates`, {
              ok: true,
              selected: targets,
              entries: targets.map((item) => ({ item, pileName: "unassigned" })),
              stats: { unassigned: targets.length }
            });
            return { status: "planned", reason: "would submit target duplicate" };
          }
          return await submitConfiguredSbc(loopDef, { returnNullIfComplete: true }) || {
            status: "unavailable",
            reason: "no available SBC challenge remains"
          };
        },
        openPack: async ({ pack }) => {
          if (dryRun) {
            log(`${loopDef.name}: dry-run would open reward pack ${packName(pack)} (#${pack.id})`);
            return { status: "planned", reason: `would open ${packName(pack)}` };
          }
          const receipt = await openPack(pack, loopDef.name, {
            allowGone: true,
            openedItemPolicy: createRecyclePackPolicy(loopDef)
          });
          return receipt || { status: "stale", reason: "pack unavailable after refresh" };
        },
        submitSeed: async ({ result: current }) => {
          if (dryRun) {
            const set = await findSbcSet(loopDef.sbcNames, loopDef.name);
            const challenge = await findAvailableSbcChallenge(set, loopDef.name);
            if (!challenge) return { status: "unavailable", reason: "no available seed SBC challenge remains" };
            log(`${loopDef.name}: dry-run found no target duplicate or reward pack; seed SBC available ${set.name} (#${set.id || "?"}) challenge #${challenge.id || "?"}`);
            return { status: "planned", reason: "would submit seed SBC" };
          }
          log(`${loopDef.name}: no target duplicate or reward pack; submitting seed SBC ${current.completions + 1}/${loopDef.maxCompletions}`);
          return await submitConfiguredSbc(loopDef, { returnNullIfComplete: true }) || {
            status: "unavailable",
            reason: "no available seed SBC challenge remains"
          };
        },
        afterSubmission: async () => {
          if (!dryRun) await sleep(CFG.pauseMs);
        },
        afterPack: async () => {
          if (!dryRun) await sleep(CFG.pauseMs);
        },
        afterStalePack: async () => {
          if (!dryRun) await sleep(CFG.pauseMs);
        },
        openFinalReward: loopDef.openRewardPacks === true ? async ({ rewardPackId }) => {
          if (dryRun) return { status: "planned", reason: `would open final reward #${rewardPackId}` };
          const opened = await openRewardPackAndCleanup(loopDef, rewardPackId, "final reward pack");
          return opened ? { status: "opened" } : { status: "unavailable", reason: "final reward unavailable" };
        } : null,
        finalize: async (workflowResult) => {
          if (workflowResult.lastRewardPackId) {
            log(`${loopDef.name}: final reward pack #${workflowResult.lastRewardPackId} left unopened`);
          }
          if (dryRun) return;
          await resolveRuntimeUnassigned(`${loopDef.name} final cleanup`, {
            loopDef
          });
        }
      });
      if (dryRun) {
        log(`${loopDef.name}: dry-run result ${result.status}`);
        log(`${loopDef.name}: dry run stops before opening packs, moving items, or submitting SBCs`);
      } else {
        log(`${loopDef.name}: submitted ${result.completions} SBC(s) in this run`);
      }
      return result;
    }
    function formatSelectionStats(stats = {}) {
      return ["unassigned", "storage", "transfer", "club"].map((pile) => `${pile}:${stats[pile] || 0}`).join(", ");
    }
    function isDryRunEnabled() {
      return document.querySelector("#bronze-loop-dry-run")?.checked === true;
    }
    function isOpenRewardPacksEnabled() {
      return document.querySelector("#bronze-loop-open-rewards")?.checked === true;
    }
    function loadLoopUiOptions() {
      try {
        const saved = JSON.parse(localStorage.getItem(LOOP_UI_OPTIONS_KEY) || "{}");
        return { showMvpLoops: saved.showMvpLoops === true };
      } catch {
        return { showMvpLoops: false };
      }
    }
    function saveLoopUiOptions() {
      state.showMvpLoops = document.querySelector("#bronze-loop-show-mvp")?.checked === true;
      try {
        localStorage.setItem(LOOP_UI_OPTIONS_KEY, JSON.stringify({ showMvpLoops: state.showMvpLoops }));
      } catch {
      }
      renderLoopSelect();
    }
    function getPickRuntimeOptions() {
      const highGoldThreshold = Math.max(2, Math.min(99, Number(document.querySelector("#bronze-loop-pick-high-gold-threshold")?.value || 82) || 82));
      const autoPickThreshold = Math.max(1, Math.min(99, Number(document.querySelector("#bronze-loop-pick-auto-threshold")?.value || 90) || 90));
      return {
        protectHighGold: document.querySelector("#bronze-loop-pick-protect-high-gold")?.checked !== false,
        autoSelectBelow90: document.querySelector("#bronze-loop-pick-auto-below-90")?.checked !== false,
        highGoldThreshold,
        autoPickThreshold
      };
    }
    function loadPickRuntimeOptions() {
      try {
        const saved = JSON.parse(localStorage.getItem(PICK_OPTIONS_KEY) || "{}");
        return {
          protectHighGold: saved.protectHighGold !== false,
          autoSelectBelow90: saved.autoSelectBelow90 !== false,
          highGoldThreshold: Math.max(2, Math.min(99, Number(saved.highGoldThreshold || 82) || 82)),
          autoPickThreshold: Math.max(1, Math.min(99, Number(saved.autoPickThreshold || 90) || 90))
        };
      } catch {
        return { protectHighGold: true, autoSelectBelow90: true, highGoldThreshold: 82, autoPickThreshold: 90 };
      }
    }
    function savePickRuntimeOptions() {
      try {
        localStorage.setItem(PICK_OPTIONS_KEY, JSON.stringify(getPickRuntimeOptions()));
      } catch {
      }
    }
    function applyPickRuntimeOptions(loopDef) {
      if (loopDef.strategy !== "playerPickSbc") return;
      const options = getPickRuntimeOptions();
      loopDef.protectHighGold = options.protectHighGold;
      loopDef.autoSelectBelow90 = options.autoSelectBelow90;
      loopDef.pickHighGoldThreshold = options.highGoldThreshold;
      loopDef.autoPickRatingThreshold = options.autoPickThreshold;
      const requirementGroups = [loopDef.requirements, ...loopDef.challengeRequirements || []];
      requirementGroups.forEach((requirements) => (requirements || []).forEach((requirement) => {
        requirement.protectHighGold = options.protectHighGold;
        if (options.protectHighGold) {
          requirement.maxRating = options.highGoldThreshold - 1;
        } else if (Number(requirement.maxRating) <= 81) {
          delete requirement.maxRating;
        }
      }));
    }
    async function runValidationBronzeUpgradeDryRun(loopDef) {
      await waitAppReady();
      await refreshStorePacks();
      const pack = (loopDef.sourcePackIds || CFG.sourcePackIds).map((id) => findPackById(id)).find(Boolean) || findPackByName(loopDef.sourcePackNames || CFG.sourcePackNames);
      const set = await findSbcSet(loopDef.sbcNames || CFG.bronzeUpgradeNames, loopDef.name);
      log(`${loopDef.name}: dry-run source pack ${pack ? `${packName(pack)} (#${pack.id})` : "not found"}`);
      log(`${loopDef.name}: dry-run SBC found ${set.name} (#${set.id || "?"})`);
      log(`${loopDef.name}: dry run stops before opening packs, filling squads, or submitting SBCs`);
    }
    async function runReservedDuplicateUpgradeDryRun(loopDef, upgradeDef, duplicatePredicate, label) {
      const set = await findSbcSet(upgradeDef.sbcNames, upgradeDef.name || label);
      const duplicateCount = countUnassignedMatching(duplicatePredicate);
      log(`${loopDef.name}: dry-run ${label} SBC found ${set.name} (#${set.id || "?"})`);
      if (!duplicateCount) {
        log(`${loopDef.name}: dry-run ${label} has no reserved duplicate(s); live run would not submit this upgrade yet`);
        return;
      }
      const duplicateOnlySelection = selectInventoryPlayers3(upgradeDef, ["unassigned"]);
      const piles = duplicateOnlySelection.ok ? ["unassigned"] : upgradeDef.priorityPiles || ["unassigned", "storage", "transfer", "club"];
      const selection = selectInventoryPlayers3(upgradeDef, piles);
      log(`${loopDef.name}: dry-run ${label} reserved matching duplicates:${duplicateCount}, required players:${sumRequirementPlayerCount(upgradeDef)}, duplicate-only complete:${duplicateOnlySelection.ok ? "yes" : "no"}`);
      logDryRunSelection(`${loopDef.name} ${label}`, selection);
      if (selection.ok) {
        log(`${loopDef.name}: dry-run would submit ${label} selection`);
      }
    }
    function getRoutineStepLoopDefs(loopDef) {
      return (loopDef.steps || []).map((stepId, index) => {
        if (stepId === loopDef.id) fail(`${loopDef.name}: step ${index + 1} cannot reference itself`);
        const baseDef = findLoopDefById(stepId);
        if (!baseDef) fail(`${loopDef.name}: step ${index + 1} loop not found: ${stepId}`);
        const childDef = cloneLoopDef(baseDef);
        if (childDef.strategy === "dailyRoutine") fail(`${loopDef.name}: nested dailyRoutine steps are not supported`);
        if (loopDef.disabledPiles?.length && !childDef.disabledPiles?.length) {
          childDef.disabledPiles = [...loopDef.disabledPiles];
        }
        if (loopDef.openRewardPacks !== void 0 && childDef.openRewardPacks === void 0) {
          childDef.openRewardPacks = loopDef.openRewardPacks;
        }
        childDef.dryRun = loopDef.dryRun === true || childDef.dryRun === true;
        assertValidLoopDef(childDef, childDef.name || stepId);
        return applyDisabledPiles(childDef);
      });
    }
    function summarizeRoutineStepLimits(steps) {
      const limits = steps.map((step) => {
        const rawLimit = getLiveRunLimit(step, 1);
        const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.floor(rawLimit)) : 1;
        const unit = step.strategy === "rarePackTo84Upgrade" ? "pack(s)" : "SBC(s)";
        return {
          name: step.name || step.id || step.strategy || "step",
          limit,
          unit
        };
      });
      return {
        limits,
        max: limits.reduce((maxLimit, step) => Math.max(maxLimit, step.limit), 1),
        total: limits.reduce((sum, step) => sum + step.limit, 0),
        text: limits.map((step) => `${step.name} max ${step.limit} ${step.unit}`).join("; ")
      };
    }
    function readDailyChallengeTimesCompleted(challenge) {
      const count = Number(challenge?.timesCompleted);
      return Number.isFinite(count) && count >= 0 ? count : null;
    }
    function getDailyChallengeRemaining(challenge) {
      const completed = readDailyChallengeTimesCompleted(challenge);
      const repeats = Number(challenge?.repeats);
      if (completed === null || !Number.isFinite(repeats) || repeats < completed) return null;
      return Math.max(0, Math.floor(repeats - completed));
    }
    function getDailySetRemaining(set) {
      const completed = Number(set?.timesCompleted);
      const repeats = Number(set?.repeats);
      if (!Number.isFinite(completed) || !Number.isFinite(repeats) || repeats < completed) return null;
      return Math.max(0, Math.floor(repeats - completed));
    }
    function isSbcSetComplete(set) {
      try {
        return set?.isComplete?.() === true;
      } catch {
        return false;
      }
    }
    function describeDailyChallengeCounts(challenges) {
      return challenges.map((challenge) => {
        const completed = readDailyChallengeTimesCompleted(challenge);
        const repeats = Number(challenge?.repeats);
        const remaining = getDailyChallengeRemaining(challenge);
        return `#${challenge?.id ?? "?"}: completed=${completed === null ? "?" : completed}, repeats=${Number.isFinite(repeats) ? repeats : "?"}, remaining=${remaining === null ? "?" : remaining}`;
      }).join(", ");
    }
    async function getDailyRoutineStepAvailability(step) {
      const dailyLimit = Number(step?.dailyCompletionLimit || 0);
      if (!Number.isFinite(dailyLimit) || dailyLimit <= 0 || !step?.sbcNames?.length) return null;
      const set = await findSbcSet(step.sbcNames, step.name);
      const challenges = await requestSbcChallenges(set, step.name, { allowEmpty: true, attempts: 3 });
      const setComplete = isSbcSetComplete(set);
      const setRemaining = getDailySetRemaining(set);
      log(`${step.name}: daily preflight set #${set?.id ?? "?"} (${set?.name || "?"}) complete=${setComplete}, completed=${Number.isFinite(Number(set?.timesCompleted)) ? set.timesCompleted : "?"}, repeats=${Number.isFinite(Number(set?.repeats)) ? set.repeats : "?"}, remaining=${setRemaining === null ? "?" : setRemaining}${challenges.length ? `; challenges: ${describeDailyChallengeCounts(challenges)}` : ""}`);
      if (setComplete) {
        return { available: false, remaining: 0, completed: dailyLimit, dailyLimit, reason: "complete" };
      }
      if (!challenges.length) {
        return { available: false, remaining: null, completed: null, dailyLimit, reason: "unavailable" };
      }
      if (setRemaining === null) {
        return { available: true, remaining: null, completed: null, dailyLimit, reason: "unknown-count" };
      }
      const remaining = Math.min(dailyLimit, setRemaining);
      return {
        available: remaining > 0,
        remaining,
        completed: dailyLimit - remaining,
        dailyLimit,
        reason: remaining > 0 ? "remaining" : "complete"
      };
    }
    async function runDailySequence(loopDef) {
      await waitAppReady();
      const steps = getRoutineStepLoopDefs(loopDef);
      const limitSummary = summarizeRoutineStepLimits(steps);
      log(`${loopDef.name}: running ${steps.length} step(s): ${steps.map((step) => step.name).join(" -> ")}`);
      log(`${loopDef.name}: step limits: ${limitSummary.text}`);
      return runSequenceWorkflow({
        steps,
        stopPoint: () => stopPoint(),
        beforeStep: async ({ step }) => {
          if (!step.dryRun) {
            const recovery = await recoverUnassignedOverflow(step, `${loopDef.name} step preflight`);
            if (recovery.status === "resolved") {
              log(`${loopDef.name}: ${step.name} overflow recovery completed before daily availability check`);
            }
            if (recovery.status === "blocked") return { status: "blocked", reason: recovery.reason };
          }
          return { status: "ready" };
        },
        getAvailability: async ({ step }) => getDailyRoutineStepAvailability(step),
        configureStep: async ({ step, availability }) => {
          const configured = cloneLoopDef(step);
          if (availability && availability.remaining !== null) {
            const configuredLimit = Math.max(1, Number(configured.maxCompletions || 1) || 1);
            configured.maxCompletions = Math.min(configuredLimit, availability.remaining);
            log(`${loopDef.name}: ${configured.name} daily progress ${availability.completed}/${availability.dailyLimit}; running up to ${configured.maxCompletions}`);
          } else if (availability) {
            log(`${loopDef.name}: ${configured.name} is available; completion count unavailable, using configured limit ${configured.maxCompletions || 1}`);
          }
          return configured;
        },
        runStep: async ({ step }) => runConfiguredLoop(step, 1),
        afterStep: async () => sleep(CFG.pauseMs),
        onEvent: async (event, payload) => {
          if (event === "step-start") {
            log(`${loopDef.name}: step ${payload.index + 1}/${payload.total} ${payload.step.name}`);
          } else if (event === "step-skipped") {
            const reason = payload.availability.reason === "unavailable" ? "challenge list unavailable after retry" : "daily SBC is complete";
            log(`${loopDef.name}: skipping ${payload.step.name}; ${reason}`);
          }
        }
      });
    }
    function shouldUseInventoryFirstFill(loopDef = {}) {
      return loopDef.inventoryFillFirst === true && Array.isArray(loopDef.requirements) && loopDef.requirements.length > 0;
    }
    function shouldUseRatingSbcFill(loopDef = {}) {
      return isPlainObject(loopDef.ratingSbcFill);
    }
    function logInventorySelection(label, selection, options = {}) {
      const maxItems = Number(options.maxItems || 20);
      log(`${label}: inventory selected ${selection?.selected?.length || 0} item(s) (${formatSelectionStats(selection?.stats)})`);
      const entries = selection?.entries || (selection?.selected || []).map((item) => ({ item, pileName: "unknown" }));
      entries.slice(0, maxItems).forEach((entry, index) => log(`inventory pick ${formatDryRunItem(entry, index)}`));
      if (entries.length > maxItems) log(`${label}: inventory pick list truncated: ${entries.length - maxItems} more item(s)`);
    }
    function logRatingSbcModel(loopDef, model) {
      log(`${loopDef.name}: rating SBC model players:${model.requiredPlayerCount}, target:${model.targetRating}, max special:${model.maxSpecialCount}`);
      model.constraints.forEach((constraint) => {
        log(`${loopDef.name}: rating SBC constraint ${constraint.label}`);
      });
    }
    async function fillSbcSquadRatingOptimized(loopDef, opened, options = {}) {
      const startedAt = Date.now();
      if (options.skipInventoryRefresh) {
        log(`${loopDef.name}: reusing inventory cache refreshed by the preceding special-card preflight`);
      } else {
        log(`${loopDef.name}: refreshing inventory before rating candidate construction`);
        await refreshInventoryCaches(`${loopDef.name} rating SBC fill`, { includePacks: false, quiet: true });
        log(`${loopDef.name}: rating inventory refresh complete in ${Date.now() - startedAt}ms`);
      }
      const model = parseRatingSbcChallenge(loopDef, opened.challenge);
      logRatingSbcModel(loopDef, model);
      if (model.unsupported.length) {
        return {
          ok: false,
          reason: `unsupported dynamic SBC requirement(s): ${model.unsupported.join(", ")}`,
          unsupportedRequirements: model.unsupported
        };
      }
      if (!model.targetRating) {
        return { ok: false, reason: "dynamic SBC challenge has no TEAM_RATING requirement and no ratingSbcFill.targetRating fallback" };
      }
      if (!model.requiredPlayerCount) {
        return { ok: false, reason: "dynamic SBC challenge player count is unavailable" };
      }
      const candidates = buildRatingSbcCandidateEntries(loopDef, model);
      log(`${loopDef.name}: rating SBC candidates ${candidates.entries.length} unique definition(s) across ${candidates.piles.join(" > ")}; scanned ${candidates.scannedItems} item(s), built in ${candidates.buildMs}ms`);
      const searchStartedAt = Date.now();
      const searchMaxNodes = Math.max(1e4, Math.min(2e6, Number(loopDef.ratingSbcFill?.maxSearchNodes || 5e5) || 5e5));
      const searchMaxMs = Math.max(1e3, Math.min(6e4, Number(loopDef.ratingSbcFill?.maxSearchMs || 15e3) || 15e3));
      const searchYieldNodes = Math.max(50, Math.min(5e3, Number(loopDef.ratingSbcFill?.yieldEveryNodes || 500) || 500));
      log(`${loopDef.name}: rating search started; max states:${searchMaxNodes}, max time:${searchMaxMs}ms, UI yield every:${searchYieldNodes} states`);
      const selection = await findOptimalRatingSbcSelection(candidates.entries, model, candidates.piles, loopDef.ratingSbcFill);
      const searchMs = Date.now() - searchStartedAt;
      if (!selection.ok) {
        return {
          ok: false,
          reason: `${selection.reason} (searched ${selection.nodes || 0} states in ${searchMs}ms)`,
          ratingShortage: true,
          model,
          candidates
        };
      }
      selection.stats = selection.pileCounts;
      selection.resolvedSignals = candidates.resolvedSignals;
      log(`${loopDef.name}: optimal rating squad ${selection.rating}/${model.targetRating}; ratings ${selection.ratings.join(", ")}; search states:${selection.nodes}, search:${searchMs}ms, total:${Date.now() - startedAt}ms`);
      if (options.dryRun) {
        logDryRunSelection(`${loopDef.name} rating SBC`, selection, {
          maxItems: 30,
          priorityPiles: candidates.piles
        });
      } else {
        logInventorySelection(`${loopDef.name} rating SBC`, selection, { maxItems: 30 });
      }
      const prepared = await prepareInventorySelection(loopDef, selection);
      const plannedModelValidation = validateRatingSbcModelAgainstItems(model, prepared.selected || []);
      logRatingSbcValidation(loopDef, "planned rating squad", plannedModelValidation, model);
      if (!plannedModelValidation.ok) {
        return {
          ok: false,
          reason: `optimized rating selection failed dynamic requirement validation: ${plannedModelValidation.errors.join(", ")}`,
          selection: prepared,
          model,
          modelValidation: plannedModelValidation
        };
      }
      const plannedInspection = inspectSbcItems(loopDef, prepared.selected || [], {
        expectedPlayerCount: model.requiredPlayerCount
      });
      logSbcSquadInspection(loopDef, plannedInspection);
      if (plannedInspection.blocked.length || plannedInspection.missingRequirements?.length) {
        if (options.dryRun) {
          return { ok: false, reason: "rating SBC optimized selection failed Runner protection inspection", selection: prepared, inspection: plannedInspection };
        }
        assertSbcSquadSafe(loopDef, plannedInspection);
      }
      if (options.dryRun) {
        return { ok: true, selection: prepared, inspection: plannedInspection, model, optimizedRating: selection.rating };
      }
      const playerList = buildSquadPlayerList(opened.challenge, prepared.selected);
      const squad = opened.challenge?.squad;
      if (!squad) {
        return { ok: false, reason: "direct rating SBC challenge has no squad model", selection: prepared, inspection: plannedInspection, model };
      }
      try {
        squad.removeAllItems?.();
      } catch {
      }
      squad.setPlayers(playerList, true);
      const fillResult = {
        squad,
        filled: getFilledSquadSlots(squad),
        submitReady: false,
        background: true
      };
      const inspection = inspectSbcSquad(loopDef, squad, { expectedPlayerCount: model.requiredPlayerCount });
      logSbcSquadInspection(loopDef, inspection);
      const savedModelValidation = validateRatingSbcModelAgainstItems(model, inspection.items, opened.challenge);
      logRatingSbcValidation(loopDef, "saved rating squad", savedModelValidation, model);
      if (!savedModelValidation.ok) {
        return {
          ok: false,
          reason: `saved rating squad failed dynamic requirement validation: ${savedModelValidation.errors.join(", ")}`,
          selection: prepared,
          fillResult,
          inspection,
          model,
          modelValidation: savedModelValidation
        };
      }
      let challengeCanSubmit = true;
      try {
        challengeCanSubmit = opened.challenge?.canSubmit?.() !== false;
      } catch {
      }
      fillResult.submitReady = challengeCanSubmit;
      log(`${loopDef.name}: optimized background rating fill submit ${fillResult.submitReady ? "ready" : "not ready"} (${inspection.items.length}/${model.requiredPlayerCount} players)`);
      return {
        ok: true,
        selection: prepared,
        fillResult,
        inspection,
        model,
        modelValidation: savedModelValidation,
        optimizedRating: selection.rating
      };
    }
    async function fillConfiguredSbcSquad(loopDef, opened, options = {}) {
      if (shouldUseRatingSbcFill(loopDef)) {
        return fillSbcSquadRatingOptimized(loopDef, opened, options);
      }
      if (shouldUseInventoryFirstFill(loopDef)) {
        return fillSbcSquadInventoryFirst(loopDef, opened, options);
      }
      if (options.dryRun) {
        const expectedPlayerCount2 = expectedSbcPlayerCount(loopDef, opened.challenge);
        const squad2 = ctrl()?._squad || opened.challenge?.squad;
        const fillResult2 = {
          squad: squad2,
          filled: getFilledSquadSlots(squad2),
          submitReady: !!findSubmitButton()
        };
        const inspection2 = inspectSbcSquad(loopDef, squad2, { expectedPlayerCount: expectedPlayerCount2 });
        logSbcSquadInspection(loopDef, inspection2);
        log(`${loopDef.name}: dry-run inspects current squad only; does not click FSU fill or save`);
        return { ok: true, fillResult: fillResult2, inspection: inspection2 };
      }
      const fillResult = await fillSbcSquad(loopDef.name, {
        requireSubmitReady: false,
        specialRequirementAdd: loopDef.specialRequirementAdd
      });
      const expectedPlayerCount = expectedSbcPlayerCount(loopDef, opened.challenge);
      const squad = fillResult.squad || ctrl()?._squad || opened.challenge?.squad;
      const inspection = inspectSbcSquad(loopDef, squad, { expectedPlayerCount });
      logSbcSquadInspection(loopDef, inspection);
      if (!fillResult.submitReady) {
        log(`${loopDef.name}: submit not ready after FSU fill (${fillResult.filled}/${expectedPlayerCount || "?"} slots filled); likely SBC requirements are still unmet or FSU completion picked an invalid squad`);
      }
      return { ok: true, fillResult, inspection };
    }
    async function fillSbcSquadInventoryFirst(loopDef, opened, options = {}) {
      await refreshInventoryCaches(`${loopDef.name} inventory-first fill`, { includePacks: false, quiet: true });
      const expectedPlayerCount = expectedSbcPlayerCount(loopDef, opened.challenge);
      const selection = selectInventoryPlayers3(loopDef);
      if (options.dryRun) {
        logDryRunSelection(`${loopDef.name} inventory-first`, selection, { maxItems: 20, priorityPiles: loopDef.priorityPiles });
      } else {
        logInventorySelection(`${loopDef.name} inventory-first`, selection);
      }
      if (!selection.ok) {
        logSelectionDiagnostics(`${loopDef.name} inventory-first`, selection, loopDef.priorityPiles);
        const reason = `inventory-first fill missing ${selection.missing?.count || "?"} ${describeRequirement(selection.missing || {})}`;
        if (options.dryRun || options.stopOnMissingSelection) return { ok: false, selection, reason };
        fail(`${loopDef.name}: ${reason}`);
      }
      const prepared = await prepareInventorySelection(loopDef, selection);
      const plannedInspection = inspectSbcItems(loopDef, prepared.selected || [], { expectedPlayerCount });
      logSbcSquadInspection(loopDef, plannedInspection);
      if (options.dryRun) {
        if (plannedInspection.blocked.length || plannedInspection.missingRequirements?.length) {
          log(`${loopDef.name}: dry-run inventory-first selection has protected or missing squad requirement(s)`);
          logManualSbcFixHints(loopDef, plannedInspection);
        } else {
          log(`${loopDef.name}: dry-run inventory-first selection passed protection; live run would save this squad before submit`);
        }
        return { ok: true, selection: prepared, inspection: plannedInspection };
      }
      if (plannedInspection.blocked.length || plannedInspection.missingRequirements?.length) {
        assertSbcSquadSafe(loopDef, plannedInspection);
      }
      await prepareSbcSquad(opened.challenge, prepared.selected, `${loopDef.name} inventory-first fill`);
      await waitLoadingEnd();
      await sleep(900);
      const squad = ctrl()?._squad || opened.challenge?.squad;
      const fillResult = {
        squad,
        filled: getFilledSquadSlots(squad),
        submitReady: !!findSubmitButton()
      };
      const inspection = inspectSbcSquad(loopDef, squad, { expectedPlayerCount });
      logSbcSquadInspection(loopDef, inspection);
      log(`${loopDef.name}: inventory-first fill submit ${fillResult.submitReady ? "ready" : "not ready"} (${inspection.items.length}/${expectedPlayerCount || "?"} players)`);
      return { ok: true, selection: prepared, fillResult, inspection };
    }
    async function runFillAndVerifyLoop(loopDef) {
      await waitAppReady();
      const completionLimit3 = loopDef.allowMultipleCompletions === true ? 50 : 1;
      const maxCompletions = Math.max(1, Math.min(completionLimit3, Number(loopDef.maxCompletions || 1) || 1));
      let autoFodderAttempts = 0;
      const result = await runRepeatedSubmissionWorkflow({
        maxCompletions,
        stopPoint: () => stopPoint(),
        executeAttempt: async ({ result: workflowResult }) => {
          if (!loopDef.dryRun) {
            await resolveRuntimeUnassigned(`${loopDef.name} pre-submit cleanup`, shouldUseRatingSbcFill(loopDef) ? {
              reserveItem: (item) => isResolvableRatingSbcUnassignedDuplicate(item, loopDef)
            } : {});
          } else {
            log(`${loopDef.name}: dry-run skips unassigned cleanup (no item moves)`);
          }
          const preflightReady = await ensureTotwForFillAndVerify(loopDef);
          if (preflightReady === false) return { status: "unavailable", reason: "required TOTW preflight is unavailable" };
          patchFsuLengthSafePlayerMetadata(`${loopDef.name} before opening SBC`);
          const set = await findSbcSet(loopDef.sbcNames, loopDef.name);
          let opened;
          if (shouldUseRatingSbcFill(loopDef)) {
            log(`${loopDef.name}: reading dynamic challenge requirements through the direct rating SBC path`);
            const challenge = await findAvailableRatingSbcChallenge(set, loopDef.name);
            const loadedChallenge = challenge && !loopDef.dryRun ? await loadRatingSbcChallenge(challenge, loopDef.name) : challenge;
            opened = loadedChallenge ? { set, challenge: loadedChallenge, background: true } : null;
          } else {
            const openStartedAt = Date.now();
            log(`${loopDef.name}: opening SBC challenge screen`);
            opened = await openSbcSet(set, { returnNullIfComplete: true });
            log(`${loopDef.name}: SBC challenge screen ready in ${Date.now() - openStartedAt}ms`);
          }
          if (!opened) {
            log(`${loopDef.name}: no available SBC challenge remains`);
            return { status: "unavailable", reason: "no available SBC challenge remains" };
          }
          const expectedPlayerCount = expectedSbcPlayerCount(loopDef, opened.challenge);
          const configuredFill = await fillConfiguredSbcSquad(loopDef, opened, {
            dryRun: loopDef.dryRun,
            stopOnMissingSelection: true,
            skipInventoryRefresh: needsAutoTotwPreflight(loopDef)
          });
          if (loopDef.dryRun) {
            if (!configuredFill.ok) {
              log(`${loopDef.name}: dry-run rating/inventory fill failed: ${configuredFill.reason || "configured SBC fill failed"}`);
            }
            log(`${loopDef.name}: dry run stops before squad save or SBC submit`);
            return {
              status: "planned",
              reason: configuredFill.reason || "dry-run squad plan complete",
              details: { dryRun: true, ok: configuredFill.ok }
            };
          }
          if (!configuredFill.ok) {
            const autoFodderLimit2 = getAutoFodderUpgradeAttemptLimit(loopDef);
            if (configuredFill.ratingShortage && autoFodderAttempts < autoFodderLimit2) {
              const nextAttempt = autoFodderAttempts + 1;
              const recovery = await craftAutoFodderUpgrade(loopDef, nextAttempt, autoFodderLimit2);
              if (recovery.ok) {
                autoFodderAttempts = nextAttempt;
                log(`${loopDef.name}: ${getAutoFodderUpgradeDef(loopDef).name} opened successfully; retrying optimized rating fill`);
                return { status: "retry", reason: "automatic fodder recovery succeeded" };
              }
              log(`${loopDef.name}: automatic 2x84+ recovery stopped: ${recovery.reason || "unknown reason"}`);
            } else {
              log(`${loopDef.name}: stopping because ${configuredFill.reason || "configured SBC fill failed"}`);
            }
            return { status: "blocked", reason: configuredFill.reason || "configured SBC fill failed" };
          }
          let fillResult = configuredFill.fillResult;
          let inspection = configuredFill.inspection;
          let squad = fillResult.squad || ctrl()?._squad || opened.challenge?.squad;
          const ratingSbcFill = shouldUseRatingSbcFill(loopDef);
          const totwInjection = ratingSbcFill ? { fillResult, inspection, planned: false, injected: false } : await injectRequiredTotwIfNeeded(loopDef, opened, fillResult, inspection);
          fillResult = totwInjection.fillResult;
          inspection = totwInjection.inspection;
          squad = fillResult.squad || squad;
          const protectedRepair = !ratingSbcFill && (!loopDef.dryRun || !totwInjection.planned) ? await repairProtectedSquadItemsIfNeeded(loopDef, opened, fillResult, inspection) : { fillResult, inspection, planned: false, repaired: false };
          fillResult = protectedRepair.fillResult;
          inspection = protectedRepair.inspection;
          squad = fillResult.squad || squad;
          const submitReadyRepair = !ratingSbcFill && (!loopDef.dryRun || !totwInjection.planned && !protectedRepair.planned) ? await repairSubmitReadinessIfNeeded(loopDef, opened, fillResult, inspection) : { fillResult, inspection, planned: false, repaired: false };
          fillResult = submitReadyRepair.fillResult;
          inspection = submitReadyRepair.inspection;
          squad = fillResult.squad || squad;
          if (loopDef.dryRun) {
            const injectableIssues = getDryRunInjectableIssues(loopDef, inspection);
            if (totwInjection.planned && !injectableIssues.blocked.length && !injectableIssues.missingRequirements.length) {
              log(`${loopDef.name}: dry-run squad needs required ${requiredSpecialLabel(loopDef)} repair; live run would save the repair plan and re-check before submit`);
            } else if (protectedRepair.planned && !injectableIssues.blocked.length && !injectableIssues.missingRequirements.length) {
              log(`${loopDef.name}: dry-run squad needs protected item repair; live run would save the repair plan and re-check before submit`);
            } else if (submitReadyRepair.planned && !injectableIssues.blocked.length && !injectableIssues.missingRequirements.length) {
              log(`${loopDef.name}: dry-run squad may need submit-ready rating repair; live run would save the repair plan and re-check before submit`);
            } else if (inspection.blocked.length || inspection.missingRequirements?.length) {
              log(`${loopDef.name}: dry-run blocked by protected or missing squad requirement(s); live run would stop before submit`);
              logManualSbcFixHints(loopDef, inspection);
            } else if (!fillResult.submitReady) {
              log(`${loopDef.name}: dry-run squad passed protection, but submit is not ready; live run would stop before submit`);
            } else {
              log(`${loopDef.name}: dry-run squad passed protection; live run would submit once`);
            }
            log(`${loopDef.name}: dry run stops before SBC submit`);
            return { status: "planned", reason: "dry-run protection inspection complete", details: { dryRun: true } };
          }
          const autoFodderLimit = getAutoFodderUpgradeAttemptLimit(loopDef);
          if (!fillResult.submitReady && !inspection.blocked.length && !inspection.missingRequirements?.length && autoFodderAttempts < autoFodderLimit) {
            const nextAttempt = autoFodderAttempts + 1;
            const recovery = await craftAutoFodderUpgrade(loopDef, nextAttempt, autoFodderLimit);
            if (recovery.ok) {
              autoFodderAttempts = nextAttempt;
              log(`${loopDef.name}: ${getAutoFodderUpgradeDef(loopDef).name} opened successfully; retrying the same 84x10 completion with refreshed inventory`);
              return { status: "retry", reason: "automatic submit-ready recovery succeeded" };
            }
            log(`${loopDef.name}: automatic 2x84+ recovery stopped: ${recovery.reason || "unknown reason"}`);
            return { status: "blocked", reason: recovery.reason || "automatic 2x84+ recovery stopped" };
          } else if (!fillResult.submitReady && !inspection.blocked.length && !inspection.missingRequirements?.length && autoFodderLimit > 0 && autoFodderAttempts >= autoFodderLimit) {
            log(`${loopDef.name}: automatic 2x84+ recovery reached its ${autoFodderLimit} attempt limit for this completion`);
            return { status: "blocked", reason: "automatic 2x84+ recovery attempt limit reached" };
          }
          if (!fillResult.submitReady) fail(`${loopDef.name}: submit is not ready after protection inspection`);
          const submitAttempt = await submitSbcAttempt({
            label: loopDef.name,
            challengeProvider: async () => opened,
            squadProvider: createExistingSquadProvider({
              getPlayers: async () => inspection.items,
              itemRef: liveItemRef,
              source: ratingSbcFill ? "rating-squad" : "filled-squad"
            }),
            preSaveValidators: [() => {
              assertSbcSquadSafe(loopDef, inspection);
              if (shouldUseRatingSbcFill(loopDef)) {
                const finalModelValidation = validateRatingSbcModelAgainstItems(configuredFill.model, inspection.items, opened.challenge);
                logRatingSbcValidation(loopDef, "final rating squad", finalModelValidation, configuredFill.model);
                if (!finalModelValidation.ok) {
                  fail(`${loopDef.name}: final rating squad failed dynamic requirement validation: ${finalModelValidation.errors.join(", ")}`);
                }
              }
              return true;
            }],
            isSubmitReady: async () => fillResult.submitReady === true,
            submitTransport: async ({ set: set2, challenge }) => ({
              submitted: true,
              rewardPackId: ratingSbcFill ? await submitRatingSbcInBackground(set2, challenge, loopDef.name) : await submitSbcAndGetAwardPackId(set2)
            }),
            afterSubmit: async ({ players }) => markSbcItemsConsumed(players, loopDef.name)
          });
          if (!submitAttempt.submitted) {
            fail(`${loopDef.name}: submit transaction blocked: ${submitAttempt.reason || submitAttempt.status}`);
          }
          const rewardPackId = submitAttempt.rewardPackId;
          let stopAfterRewardFailure = false;
          let rewardPacksOpened = 0;
          let rewardPacksPending = 0;
          if (loopDef.openRewardPacks) {
            const openedReward = await openRewardPackAndCleanup(loopDef, rewardPackId, "reward pack", {
              assumeTotwReward: loopDef.assumeTotwRewardPack === true,
              fallbackPackMatcher: loopDef.assumeTotwRewardPack === true ? isLikelyTotwRewardPack : null,
              openAttempts: loopDef.assumeTotwRewardPack === true ? 3 : 1
            });
            if (openedReward) rewardPacksOpened++;
            else {
              rewardPacksPending++;
              if (loopDef.forceOpenRewardPacks === true) {
                stopAfterRewardFailure = true;
                log(`${loopDef.name}: required reward pack could not be opened; stopping before another SBC submission`);
              }
            }
          } else if (rewardPackId) {
            log(`${loopDef.name}: reward pack #${rewardPackId} left unopened`);
          }
          autoFodderAttempts = 0;
          if (!stopAfterRewardFailure) await sleep(CFG.pauseMs);
          return {
            status: "submitted",
            submitted: true,
            rewardPacksOpened,
            rewardPacksPending,
            stopAfterCompletion: stopAfterRewardFailure,
            reason: stopAfterRewardFailure ? "required reward pack could not be opened" : null,
            details: { lastRewardPackId: rewardPackId || null, completedBefore: workflowResult.completions }
          };
        }
      });
      log(`${loopDef.name}: submitted ${result.completions} SBC(s) in this run`);
      return result;
    }
    function shortageSourceMatchesRequirement(source, requirement) {
      const target = source?.requirement || {};
      return ["tier", "rarity", "special", "playerOnly", "allowSpecial"].every(
        (field) => target[field] === void 0 || target[field] === requirement?.[field]
      );
    }
    function getShortageForSource(loopDef, source, piles) {
      const requirements = (loopDef.requirements || []).filter(
        (requirement) => shortageSourceMatchesRequirement(source, requirement)
      );
      if (!requirements.length) return 0;
      return requirements.reduce((total, requirement) => {
        const scoped = { ...requirement, priorityPiles: piles };
        const selection = selectInventoryPlayers3([scoped], piles);
        return total + (selection.ok ? 0 : Number(selection.missing?.count || 0));
      }, 0);
    }
    function findShortageSourcePack(source) {
      let pack = null;
      if (source?.packIds?.length) pack = source.packIds.map((id) => findPackById(id)).find(Boolean);
      if (!pack && source?.packNames?.length) pack = findPackByName(source.packNames);
      return pack || null;
    }
    function shortageSourceLabel(source) {
      return source?.requirement?.tier || source?.requirement?.rarity || "material";
    }
    function countShortageSourcePacks(source) {
      const ids = new Set((source?.packIds || []).map(packIdKey).filter(Boolean));
      return getAvailableRepositoryMyPacks().filter(
        (pack) => ids.size && ids.has(packIdKey(pack)) || source?.packNames?.length && matchesAny(packName(pack), source.packNames)
      ).length;
    }
    function createMaterializeAndResolvePolicy(label, cleanupReason, cleanupOptions = {}) {
      return createOpenedItemPolicy(async (openedItems) => {
        await materializeOpenedPlayerRewards(openedItems, label);
        await sleep(CFG.pauseMs);
        const cleanup = await resolveRuntimeUnassigned(cleanupReason, cleanupOptions);
        await refreshInventoryCaches(`${label} resolved`, { quiet: true });
        await refreshUnassigned();
        return openedItemRoutingResult(openedItems, null, { cleanupStatus: cleanup.status });
      });
    }
    function createReserveMatchingDuplicatePackPolicy(loopDef, source) {
      return createOpenedItemPolicy(async (openedItems) => {
        const requirement = { ...source?.requirement || {} };
        delete requirement.count;
        const reserveDuplicate = (item) => isDuplicate(item) && isSbcUsablePlayer(item, requirement) && itemMatchesSpec(item, requirement);
        const reservedIds = new Set(openedItems.filter(reserveDuplicate).map((item) => Number(item?.id || 0)));
        const directClub = openedItems.filter(
          (item) => !reservedIds.has(Number(item?.id || 0)) && !isDuplicate(item)
        );
        if (directClub.length) {
          log(`${loopDef.name}: moving ${directClub.length} non-duplicate source item(s) to club`);
          await moveItems(directClub, W.ItemPile.CLUB, true);
        }
        await resolveRuntimeUnassigned(`${loopDef.name} source pack handling`, { reserveItem: reserveDuplicate });
        await refreshUnassigned();
        const reserved = getUnassignedItems().filter(reserveDuplicate);
        log(`${loopDef.name}: reserved ${reserved.length} matching duplicate(s) for SBC`);
        const liveReservedIds = new Set(reserved.map((item) => Number(item?.id || 0)));
        return openedItemRoutingResult(openedItems, (item) => liveReservedIds.has(Number(item?.id || 0)), {
          reservedMatchingDuplicateCount: reserved.length
        });
      });
    }
    async function tryOpenMixedUpgradeShortagePacks(loopDef, source, primaryPiles) {
      const label = shortageSourceLabel(source);
      const maxOpens = Math.max(1, Math.min(10, Number(source?.maxOpensPerAttempt || 1) || 1));
      let openedCount = 0;
      let lookupAttempts = 0;
      let preserveUnassigned = false;
      while (openedCount < maxOpens && getShortageForSource(loopDef, source, primaryPiles) > 0) {
        stopPoint();
        await refreshStorePacks().catch((e) => log(`${loopDef.name}: ${label} source pack refresh skipped: ${e.message || e}`));
        const shortage = getShortageForSource(loopDef, source, primaryPiles);
        const availableCount = countShortageSourcePacks(source);
        const pack = findShortageSourcePack(source);
        if (!pack) {
          log(`${loopDef.name}: missing ${shortage} ${label} player(s); no matching source pack available, skipping`);
          break;
        }
        log(`${loopDef.name}: missing ${shortage} ${label} player(s); opening ${packName(pack)} (#${packIdKey(pack) || "?"}, available:${availableCount || "?"})`);
        const receipt = await openPack(pack, `${loopDef.name} ${label} shortage`, {
          allowGone: true,
          openedItemPolicy: source.routingPolicy === "reserveMatchingDuplicates" ? createReserveMatchingDuplicatePackPolicy(loopDef, source) : createMaterializeAndResolvePolicy(
            `${loopDef.name} ${label} shortage pack`,
            `${loopDef.name} ${label} shortage pack handling`,
            { blockedPolicy: "preserve" }
          )
        });
        lookupAttempts++;
        if (!receipt) {
          if (lookupAttempts >= maxOpens + 2) break;
          continue;
        }
        openedCount++;
        if (receipt.details.cleanupStatus === "preserved") {
          const overflow = getUnassignedStorageOverflow();
          log(`${loopDef.name}: keeping ${overflow.count} unassigned duplicate(s) for the current SBC; SBC storage has ${overflow.space} slot(s), so no further shortage pack will be opened`);
          preserveUnassigned = true;
          break;
        }
      }
      return { openedCount, preserveUnassigned };
    }
    async function runSupplyAndCraftLoop(loopDef) {
      await waitAppReady();
      const dryRun = loopDef.dryRun === true;
      const shortagePacks = loopDef.shortagePacks?.length ? loopDef.shortagePacks : loopDef.strategy === "commonGoldToRareUpgrade" ? [{
        requirement: { ...loopDef.requirements?.[0] || {} },
        packIds: loopDef.sourcePackIds || [],
        packNames: loopDef.sourcePackNames || [],
        maxOpensPerAttempt: 1,
        repeatUntilSatisfied: true,
        maxRuns: 100,
        routingPolicy: "reserveMatchingDuplicates"
      }] : [];
      const primaryPiles = shortagePacks.length ? loopDef.primaryPiles || ["unassigned", "storage", "transfer"] : loopDef.priorityPiles || ["storage", "transfer", "club"];
      const fallbackPiles = loopDef.clubFallbackPiles || loopDef.priorityPiles || primaryPiles;
      const result = await runSupplyAndCraftWorkflow({
        maxCompletions: Number(loopDef.maxCompletions || 7),
        stopPoint: () => stopPoint(),
        beforeIteration: async () => {
          if (dryRun) return { preserveSupply: false };
          if (loopDef.preSelectionCleanup === false) return { preserveSupply: false };
          if (!shortagePacks.length) {
            await resolveRuntimeUnassigned(`${loopDef.name} pre-submit cleanup`);
            return { preserveSupply: false };
          }
          const cleanup = await resolveRuntimeUnassigned(`${loopDef.name} pre-submit cleanup`, { blockedPolicy: "preserve" });
          const preserveSupply = cleanup.status === "preserved";
          if (preserveSupply) {
            const overflow = getUnassignedStorageOverflow();
            log(`${loopDef.name}: keeping ${overflow.count} unassigned duplicate(s) for the current SBC; SBC storage has ${overflow.space} slot(s), so no further shortage pack will be opened`);
          }
          return { preserveSupply };
        },
        challengeProvider: async ({ refresh }) => {
          const set = await findSbcSet(loopDef.sbcNames, loopDef.name);
          if (dryRun || loopDef.deferChallengeLoad === true) {
            const challenge = await findAvailableSbcChallenge(set, loopDef.name);
            if (!challenge) return null;
            if (!refresh) {
              log(`${loopDef.name}: ${dryRun ? "dry-run" : "preflight"} SBC found ${set.name} (#${set.id || "?"}) challenge #${challenge.id || "?"}`);
            }
            return { set, challenge };
          }
          return openSbcSet(set, { returnNullIfComplete: true });
        },
        refreshInventory: async () => {
          await refreshInventoryCaches(`${loopDef.name} pre-selection`, { includePacks: false, quiet: true });
        },
        selectPrimary: async () => selectInventoryPlayers3(loopDef, primaryPiles),
        supplies: shortagePacks.map((source, index) => ({
          id: `${shortageSourceLabel(source)}-${index}`,
          source,
          repeatUntilSatisfied: source.repeatUntilSatisfied === true,
          maxRuns: Number(source.maxRuns || 100),
          provide: async () => {
            const shortage = getShortageForSource(loopDef, source, primaryPiles);
            if (shortage <= 0) return { status: "unavailable", reason: "requirement already satisfied" };
            if (dryRun) {
              await refreshStorePacks().catch(() => null);
              const pack = findShortageSourcePack(source);
              if (!pack) {
                log(`${loopDef.name}: dry-run missing ${shortage} ${shortageSourceLabel(source)} player(s); no matching source pack available`);
                return { status: "unavailable", reason: "matching source pack unavailable" };
              }
              log(`${loopDef.name}: dry-run would open ${packName(pack)} (#${pack.id}) for ${shortageSourceLabel(source)} shortage ${shortage}`);
              return { status: "planned", reason: `would open ${packName(pack)}` };
            }
            const supplied = await tryOpenMixedUpgradeShortagePacks(loopDef, source, primaryPiles);
            if (!supplied.openedCount) return { status: "unavailable", reason: "matching source pack unavailable" };
            return {
              status: "provided",
              openedCount: supplied.openedCount,
              preserveSupply: supplied.preserveUnassigned
            };
          }
        })),
        selectFallback: async () => selectInventoryPlayers3(loopDef, fallbackPiles),
        submit: async ({ challengeContext, selection }) => {
          const opened = !dryRun && loopDef.deferChallengeLoad === true ? await openSbcSet(challengeContext.set, { challenge: challengeContext.challenge, returnNullIfComplete: true }) : challengeContext;
          if (!opened) return { status: "unavailable", submitted: false, reason: "no available SBC challenge remains" };
          const attempt = await submitInventorySbcAttempt(loopDef, selection, {
            opened,
            dryRun,
            handleReward: !dryRun
          });
          return attempt.result;
        },
        afterSubmission: async () => {
          if (!dryRun) await sleep(CFG.pauseMs);
        },
        finalize: async () => {
          if (dryRun) return;
          await resolveRuntimeUnassigned(`${loopDef.name} final cleanup`, {
            loopDef
          });
        },
        onEvent: async (event, payload) => {
          if (event === "selection") {
            const phase = payload.phase;
            const selection = payload.selection;
            const label = phase === "primary" ? "primary" : phase === "fallback" ? "fallback" : `after ${shortageSourceLabel(payload.supply?.source) || "source"} source check`;
            if (dryRun) logDryRunSelection(`${loopDef.name} ${label}`, selection, { priorityPiles: phase === "fallback" ? fallbackPiles : primaryPiles });
            else log(`${loopDef.name}: ${label} selected ${selection.selected.length} player(s) (${formatSelectionStats(selection.stats)})`);
          } else if (event === "supply-skipped") {
            log(`${loopDef.name}: unassigned duplicates are reserved for this SBC; skipping additional shortage packs`);
          } else if (event === "selection-insufficient") {
            const missing = payload.selection?.missing || {};
            log(`${loopDef.name}: missing ${missing.count || "?"} ${missing.tier || "any"} ${missing.rarity || ""} player(s); stopping before submit`);
            logSelectionDiagnostics(loopDef.name, payload.selection, fallbackPiles);
          } else if (event === "challenge-unavailable") {
            log(`${loopDef.name}: no available SBC challenge remains${payload.afterSupply ? " after source pack handling" : ""}`);
          }
        }
      });
      if (dryRun) {
        log(`${loopDef.name}: dry-run result ${result.status}; planned completions:${result.completions}`);
        log(`${loopDef.name}: dry run stops before cleanup, opening packs, squad save, or SBC submit`);
      } else {
        log(`${loopDef.name}: submitted ${result.completions} SBC(s) in this run`);
      }
      return result;
    }
    function isCommonGoldPlayer(item, options = {}) {
      const spec = { tier: "gold", rarity: "common", playerOnly: true, allowSpecial: false, protectHighGold: options.protectHighGold === true };
      return !(options.protectHighGold && isProtectedHighGold(item)) && isSbcUsablePlayer(item, spec) && itemMatchesSpec(item, spec);
    }
    function isCommonGoldDuplicate(item, options = {}) {
      return isDuplicate(item) && isCommonGoldPlayer(item, options);
    }
    function isLowCommonGoldDuplicate(item) {
      return isCommonGoldDuplicate(item, { protectHighGold: true });
    }
    function isRareGoldPlayer(item, options = {}) {
      const spec = { tier: "gold", rarity: "rare", playerOnly: true, allowSpecial: false, protectHighGold: options.protectHighGold === true };
      return !(options.protectHighGold && isProtectedHighGold(item)) && isSbcUsablePlayer(item, spec) && itemMatchesSpec(item, spec);
    }
    function isRareGoldDuplicate(item, options = {}) {
      return isDuplicate(item) && isRareGoldPlayer(item, options);
    }
    function isLowRareGoldDuplicate(item) {
      return isRareGoldDuplicate(item, { protectHighGold: true });
    }
    function liveItemRef(item, pile = null) {
      const detectedPile = pile || ["unassigned", "storage", "transfer", "club"].find(
        (pileName) => getPileItemsByName(pileName).some((candidate) => Number(candidate?.id || 0) === Number(item?.id || 0))
      ) || "unknown";
      return {
        id: Number(item?.id || 0),
        definitionId: Number(item?.definitionId || 0),
        pile: detectedPile
      };
    }
    async function submitInventorySbcAttempt(loopDef, selection, options = {}) {
      let openedContext = null;
      const label = options.label || loopDef.name;
      const result = await submitSbcAttempt({
        label,
        dryRun: options.dryRun === true,
        challengeProvider: async () => {
          if (options.opened) {
            openedContext = options.opened;
            return options.opened;
          }
          const set = await findSbcSet(loopDef.sbcNames, loopDef.name);
          const opened = await openSbcSet(set, { returnNullIfComplete: true });
          if (!opened) return null;
          openedContext = opened;
          return opened;
        },
        squadProvider: createInventorySquadProvider({
          selection,
          prepareSelection: async (_context, inputSelection) => prepareInventorySelection(loopDef, inputSelection),
          itemRef: liveItemRef
        }),
        preSaveValidators: options.preSaveValidators || [],
        saveSquad: async ({ challenge, players }) => {
          await saveChallengeSquad(challenge, players, label);
        },
        readSavedPlayers: async ({ challenge }) => getSquadItems(challenge?.squad || ctrl()?._squad),
        postSaveValidators: options.postSaveValidators || [],
        isSubmitReady: async () => {
          const ready = !!findSubmitButton();
          log(`${label}: inventory squad saved; submit ${ready ? "ready" : "not ready"}`);
          return ready;
        },
        submitTransport: async ({ set }) => ({
          submitted: true,
          rewardPackId: await submitSbcAndGetAwardPackId(set)
        }),
        afterSubmit: async ({ result: submissionResult, players }) => {
          if (options.markConsumed === true) markSbcItemsConsumed(players, label);
          if (options.handleReward === false) return;
          if (submissionResult.rewardPackId && loopDef.openRewardPacks) {
            await openRewardPackAndCleanup(loopDef, submissionResult.rewardPackId);
          } else if (submissionResult.rewardPackId) {
            log(`${loopDef.name}: reward pack #${submissionResult.rewardPackId} left unopened`);
          }
        }
      });
      return { result, opened: openedContext };
    }
    async function submitInventorySelection(loopDef, selection, options = {}) {
      const attempt = await submitInventorySbcAttempt(loopDef, selection, options);
      if (attempt.result.status === "unavailable") {
        log(`${loopDef.name}: no available SBC challenge remains`);
        return null;
      }
      if (!attempt.result.submitted) {
        log(`${loopDef.name}: inventory submit blocked: ${attempt.result.reason || attempt.result.status}`);
        return null;
      }
      return { submitted: true, rewardPackId: attempt.result.rewardPackId };
    }
    function countUnassignedMatching(predicate) {
      return getUnassignedItems().filter(predicate).length;
    }
    function getProvisionPreCraftPickDef(loopDef) {
      const pickLoopId = String(loopDef.preCraftPlayerPickLoopId || "").trim();
      if (!pickLoopId) return null;
      const basePickDef = findLoopDefById(pickLoopId);
      if (!basePickDef || basePickDef.strategy !== "playerPickSbc") {
        fail(`${loopDef.name}: pre-craft Player Pick loop not found or invalid: ${pickLoopId}`);
      }
      const pickDef = cloneLoopDef(basePickDef);
      if (loopDef.disabledPiles?.length && !pickDef.disabledPiles?.length) {
        pickDef.disabledPiles = [...loopDef.disabledPiles];
      }
      applyDisabledPiles(pickDef);
      applyPickRuntimeOptions(pickDef);
      pickDef.maxCompletions = 1;
      return pickDef;
    }
    function getProvisionCraftingUpgrades(loopDef) {
      const configured = Array.isArray(loopDef.craftingUpgrades) && loopDef.craftingUpgrades.length ? loopDef.craftingUpgrades : [loopDef.commonUpgrade, loopDef.rareUpgrade].filter(isPlainObject);
      return configured.map((upgradeDef) => ({
        ...upgradeDef,
        openRewardPacks: loopDef.openRewardPacks === true || upgradeDef.openRewardPacks === true
      }));
    }
    function getChallengeMaterialDefs(loopDef) {
      if (!loopDef) return [];
      if (!Array.isArray(loopDef.challengeRequirements) || !loopDef.challengeRequirements.length) return [loopDef];
      return loopDef.challengeRequirements.map((requirements, index) => ({
        ...loopDef,
        name: `${loopDef.name} challenge ${index + 1}`,
        requirements
      }));
    }
    function itemMatchesLoopRequirements(item, loopDef) {
      const requirements = selectionRequirements(
        loopDef,
        loopDef.priorityPiles || ["unassigned", "storage", "transfer", "club"]
      );
      return requirements.some(
        (requirement) => isSbcUsablePlayer(item, requirement) && itemMatchesSpec(item, requirement)
      );
    }
    function isDuplicateForLoopRequirements(item, loopDef) {
      return isDuplicate(item) && itemMatchesLoopRequirements(item, loopDef);
    }
    function getProvisionMaterialDefs(loopDef) {
      return [
        ...getChallengeMaterialDefs(getProvisionPreCraftPickDef(loopDef)),
        ...getProvisionCraftingUpgrades(loopDef).flatMap(getChallengeMaterialDefs)
      ];
    }
    function provisionMaterialLabel(loopDef) {
      return getProvisionMaterialDefs(loopDef).map((def) => def.name).join(" -> ") || "none";
    }
    function createProvisionPackPolicy(loopDef) {
      return createOpenedItemPolicy(async (openedItems) => {
        const materialDefs = getProvisionMaterialDefs(loopDef);
        const isReservedDuplicate = (item) => materialDefs.some((def) => isDuplicateForLoopRequirements(item, def));
        await refreshInventoryCaches(`${loopDef.name} provision response classification`, { includePacks: false, quiet: true });
        const responseDuplicates = [];
        for (const item of openedItems) {
          const clubDuplicate = findClubDuplicate2(item);
          if (!isDuplicate(item) && !clubDuplicate) continue;
          if (clubDuplicate && !Number(item?.duplicateId || 0)) item.duplicateId = clubDuplicate.id;
          item.pile = W.ItemPile.PURCHASED;
          item.injuryType = W.PlayerInjury?.NONE ?? 0;
          responseDuplicates.push(item);
        }
        const responseDuplicateIds = new Set(responseDuplicates.map((item) => Number(item?.id || 0)).filter(Boolean));
        const responseReservedIds = new Set(responseDuplicates.filter(isReservedDuplicate).map((item) => Number(item?.id || 0)).filter(Boolean));
        const directClub = openedItems.filter((item) => !responseDuplicateIds.has(Number(item?.id || 0)));
        const responseDuplicateById = new Map(responseDuplicates.map((item) => [Number(item?.id || 0), item]).filter(([id]) => id));
        const restoreResponseDuplicateMetadata = () => {
          for (const item of getUnassignedItems()) {
            const responseItem = responseDuplicateById.get(Number(item?.id || 0));
            if (!responseItem) continue;
            const clubDuplicate = findClubDuplicate2(item) || findClubDuplicate2(responseItem);
            const duplicateId = Number(item?.duplicateId || responseItem?.duplicateId || clubDuplicate?.id || 0);
            if (duplicateId && !Number(item?.duplicateId || 0)) item.duplicateId = duplicateId;
            item.pile = W.ItemPile.PURCHASED;
            item.injuryType = W.PlayerInjury?.NONE ?? 0;
          }
        };
        restoreResponseDuplicateMetadata();
        if (directClub.length) {
          log(`${loopDef.name}: moving ${directClub.length} non-duplicate provision item(s) to club`);
          await moveItems(directClub, W.ItemPile.CLUB, true);
        }
        await resolveRuntimeUnassigned(`${loopDef.name} provision pack handling`, {
          reserveItem: (item) => responseReservedIds.has(Number(item?.id || 0)) || isReservedDuplicate(item)
        });
        await refreshUnassigned();
        restoreResponseDuplicateMetadata();
        const reservedItems = getUnassignedItems().filter(
          (item) => responseReservedIds.has(Number(item?.id || 0)) || isReservedDuplicate(item)
        );
        const stageCounts = materialDefs.map(
          (def) => `${def.name}:${reservedItems.filter((item) => isDuplicateForLoopRequirements(item, def)).length}`
        ).join(", ");
        log(`${loopDef.name}: classified ${responseDuplicates.length} provision duplicate(s); reserved by configured stage: ${stageCounts || "none"}`);
        const reservedIds = new Set(reservedItems.map((item) => Number(item?.id || 0)));
        return openedItemRoutingResult(openedItems, (item) => reservedIds.has(Number(item?.id || 0)), {
          reservedCount: reservedItems.length,
          reservedItemIds: reservedItems.map((item) => Number(item?.id || 0)).filter(Boolean),
          reservedDefinitionIds: reservedItems.map((item) => Number(item?.definitionId || 0)).filter(Boolean)
        });
      });
    }
    function createRarePackTo84Policy(loopDef) {
      return createOpenedItemPolicy(async (openedItems) => {
        const responseCount = openedItems.length;
        await refreshInventoryCaches(`${loopDef.name} rare pack response classification`, { includePacks: false, quiet: true });
        const responseDuplicates = [];
        for (const item of openedItems) {
          const clubDuplicate = findClubDuplicate2(item);
          if (!isDuplicate(item) && !clubDuplicate) continue;
          if (clubDuplicate && !Number(item?.duplicateId || 0)) item.duplicateId = clubDuplicate.id;
          item.pile = W.ItemPile.PURCHASED;
          item.injuryType = W.PlayerInjury?.NONE ?? 0;
          responseDuplicates.push(item);
        }
        const duplicateIds = new Set(responseDuplicates.map((item) => Number(item?.id || 0)).filter(Boolean));
        const classified = classifyOpenedUpgradeDuplicates(openedItems, {
          isDuplicate: (item) => duplicateIds.has(Number(item?.id || 0)),
          isEligibleDuplicate: (item) => isRareGoldPlayer(item, { protectHighGold: true }),
          isTradeable
        });
        if (classified.directClub.length) {
          log(`${loopDef.name}: moving ${classified.directClub.length} response-classified non-duplicate item(s) to club`);
          await moveItems(classified.directClub, W.ItemPile.CLUB, true);
        }
        if (classified.tradeableDuplicates.length) {
          assertPileSpace("Transfer list", transferSpaceLeft(), classified.tradeableDuplicates.length);
          log(`${loopDef.name}: moving ${classified.tradeableDuplicates.length} non-crafting tradeable duplicate(s) to transfer list`);
          await moveItems(classified.tradeableDuplicates, W.ItemPile.TRANSFER, false);
        }
        if (classified.untradeableDuplicates.length) {
          assertPileSpace("SBC storage", storageSpaceLeft(), classified.untradeableDuplicates.length);
          log(`${loopDef.name}: moving ${classified.untradeableDuplicates.length} non-crafting untradeable duplicate(s) to SBC storage`);
          await moveItems(classified.untradeableDuplicates, W.ItemPile.STORAGE, true);
        }
        await sleep(CFG.pauseMs);
        await refreshInventoryCaches(`${loopDef.name} rare pack response routing`, { includePacks: false, quiet: true });
        const routedItems = [
          ...classified.directClub,
          ...classified.tradeableDuplicates,
          ...classified.untradeableDuplicates
        ];
        const lowRare = classified.reservedDuplicates.length;
        const inventoryAdapter = createEaInventoryAdapter(W);
        const transientUnassignedSignals = classified.reservedDuplicates.map(
          (item) => inventoryAdapter.snapshotItem(item, "unassigned")
        );
        log(`${loopDef.name}: routed rare pack response ${responseCount} item(s) (club:${classified.directClub.length}, transfer:${classified.tradeableDuplicates.length}, storage:${classified.untradeableDuplicates.length}); reserved low rare duplicates:${lowRare}`);
        return {
          reservedItems: classified.reservedDuplicates,
          routedItems,
          details: { lowRare, transientUnassignedSignals }
        };
      });
    }
    async function submitReservedDuplicateUpgrade(loopDef, upgradeDef, duplicatePredicate, label, options = {}) {
      let completions = 0;
      let forcedAttempts = Math.max(0, Number(options.forceAttempts || 0));
      let transientUnassignedSignals = [...options.transientUnassignedSignals || []];
      const broadDuplicatePredicate = options.dynamicPredicate === false ? duplicatePredicate : (item) => getChallengeMaterialDefs(upgradeDef).some((challengeDef) => isDuplicateForLoopRequirements(item, challengeDef));
      while (true) {
        stopPoint();
        await refreshInventoryCaches(`${loopDef.name} ${label} pre-selection`, { includePacks: false, quiet: true });
        const broadDuplicateCount = countUnassignedMatching(broadDuplicatePredicate) + transientUnassignedSignals.length;
        if (!broadDuplicateCount && forcedAttempts <= 0) break;
        const set = await findSbcSet(upgradeDef.sbcNames, upgradeDef.name || label);
        const challenges = await requestSbcChallenges(set, upgradeDef.name || label, { attempts: 3, allowEmpty: true });
        const challengeIndex = challenges.findIndex((challenge) => !isCompletedChallenge(challenge));
        if (challengeIndex < 0) {
          if (transientUnassignedSignals.length) {
            fail(`${loopDef.name}: ${label} has no available challenge for ${transientUnassignedSignals.length} just-opened duplicate(s)`);
          }
          break;
        }
        const challengeDef = loopChallengeDef(upgradeDef, challengeIndex + 1);
        const countNeeded = sumRequirementPlayerCount(challengeDef);
        if (countNeeded <= 0) {
          if (transientUnassignedSignals.length) {
            fail(`${loopDef.name}: ${label} has no usable player requirement for ${transientUnassignedSignals.length} just-opened duplicate(s)`);
          }
          break;
        }
        const activeDuplicatePredicate = options.dynamicPredicate === false ? duplicatePredicate : (item) => isDuplicateForLoopRequirements(item, challengeDef);
        const duplicateCount = countUnassignedMatching(activeDuplicatePredicate) + transientUnassignedSignals.length;
        const fallbackPiles = challengeDef.priorityPiles || ["unassigned", "storage", "transfer", "club"];
        if (!duplicateCount && forcedAttempts <= 0) break;
        const transientSignalRefs = transientUnassignedSignals.map((signal) => signal.ref || signal);
        const selectionOptions = {
          transientUnassignedSignals,
          preferredSignalRefs: transientSignalRefs
        };
        const duplicateOnlySelection = fallbackPiles.includes("unassigned") ? selectInventoryPlayers3(challengeDef, ["unassigned"], selectionOptions) : { ok: false };
        const piles = duplicateOnlySelection.ok ? ["unassigned"] : fallbackPiles;
        if (forcedAttempts > 0) forcedAttempts--;
        const selection = selectInventoryPlayers3(challengeDef, piles, selectionOptions);
        log(`${loopDef.name}: ${label} selected ${selection.selected.length}/${countNeeded} (${formatSelectionStats(selection.stats)})`);
        const repositorySignals = getUnassignedItems().filter(activeDuplicatePredicate);
        const signalById = new Map([...repositorySignals, ...transientUnassignedSignals].map((signal) => [Number(signal?.id || signal?.ref?.id || 0), signal]).filter(([id]) => id));
        const selectedSignalCount = (selection.entries || []).filter((entry) => entry.pileName === "unassigned" && entry.signal).length;
        if (transientUnassignedSignals.length) {
          log(`${loopDef.name}: ${label} duplicate signal sources response:${transientUnassignedSignals.length}, repository:${repositorySignals.length}, unique:${signalById.size}, selected:${selectedSignalCount}`);
        }
        const expectedSelectedSignalCount = Math.min(signalById.size, countNeeded);
        const missedTransientSignal = !selectionConsumesAllSignalRefs(selection, transientSignalRefs);
        if (selectedSignalCount < expectedSelectedSignalCount || missedTransientSignal) {
          logDuplicateSignalDiagnostics(
            `${loopDef.name} ${label}`,
            [...signalById.values()],
            selectionRequirements(challengeDef, piles)[0] || {},
            selection
          );
        }
        if (!selection.ok) {
          const missing = selection.missing;
          log(`${loopDef.name}: ${label} missing ${missing.count} player(s) after fallback; stopping ${label}`);
          logSelectionDiagnostics(`${loopDef.name} ${label}`, selection, piles);
          if (transientSignalRefs.length) {
            fail(`${loopDef.name}: ${label} cannot consume ${transientSignalRefs.length} just-opened duplicate(s); stopping before Unassigned cleanup or another pack open`);
          }
          break;
        }
        if (!selectionConsumesAllSignalRefs(selection, transientSignalRefs)) {
          fail(`${loopDef.name}: ${label} cannot resolve every just-opened duplicate to a Club/Storage submit item; stopping before another pack is opened`);
        }
        const consumedSignalRefs = (selection.entries || []).filter((entry) => entry.pileName === "unassigned" && entry.signal).map((entry) => ({
          ...liveItemRef(entry.signal, "unassigned"),
          duplicateId: Number(entry.signal?.duplicateId || entry.item?.id || 0)
        }));
        const result = await submitInventorySelection(challengeDef, selection, { markConsumed: true });
        if (!result) {
          if (transientUnassignedSignals.length) {
            fail(`${loopDef.name}: ${label} did not submit; preserving ${transientUnassignedSignals.length} just-opened duplicate(s) and stopping`);
          }
          break;
        }
        completions++;
        rememberConsumedDuplicateSignals(consumedSignalRefs);
        await refreshInventoryCaches(`${loopDef.name} ${label} post-submit duplicate sync`, { includePacks: false, quiet: true });
        clearConsumedDuplicateSignals(consumedSignalRefs, `${loopDef.name} ${label}`);
        transientUnassignedSignals = [];
        await sleep(CFG.pauseMs);
      }
      log(`${loopDef.name}: ${label} submitted ${completions} SBC(s)`);
      return completions;
    }
    async function runProvisionCraftLoop(loopDef) {
      await waitAppReady();
      const dryRun = loopDef.dryRun === true;
      const rounds = Math.max(1, Math.min(50, Number(loopDef.rounds || loopDef.maxRounds || 1) || 1));
      const craftingUpgrades = getProvisionCraftingUpgrades(loopDef);
      const materialDefs = getProvisionMaterialDefs(loopDef);
      const isReservedDuplicate = (item) => materialDefs.some((def) => isDuplicateForLoopRequirements(item, def));
      const preCraftPickResults = [];
      const result = await runPackAndCraftWorkflow({
        maxPacks: rounds,
        stopPoint: () => stopPoint(),
        resume: async () => {
          if (dryRun) {
            await refreshInventoryCaches(`${loopDef.name} dry-run`, { quiet: true });
            const items2 = getUnassignedItems();
            log(`${loopDef.name}: dry-run only inspects current reserved duplicates; it does not open Provision Packs`);
            return { hasItems: true, itemCount: items2.length, provisionHandling: {} };
          }
          await unwindSbcSquadControllers(`${loopDef.name} resume`);
          const items = await showUnassignedIfAny(`${loopDef.name} resume sync`);
          if (!items.length) return { hasItems: false };
          await refreshInventoryCaches(`${loopDef.name} resume duplicate validation`, { includePacks: false, quiet: true });
          for (const item of items) {
            if (!isReservedDuplicate(item) || findClubDuplicate2(item)) continue;
            item.duplicateId = 0;
            if (item._duplicateId !== void 0) item._duplicateId = 0;
          }
          const reserved = items.filter((item) => findClubDuplicate2(item) && isReservedDuplicate(item));
          const provisionHandling = {
            reservedCount: reserved.length,
            reservedItemIds: reserved.map((item) => Number(item?.id || 0)).filter(Boolean),
            reservedDefinitionIds: reserved.map((item) => Number(item?.definitionId || 0)).filter(Boolean)
          };
          log(`${loopDef.name}: resume found ${items.length} unassigned item(s), ${reserved.length} duplicate(s) matching configured stages (${provisionMaterialLabel(loopDef)})`);
          return { hasItems: true, itemCount: items.length, provisionHandling };
        },
        beforePack: async ({ result: current }) => {
          if (!dryRun) await resolveRuntimeUnassigned(`${loopDef.name} round ${current.packsOpened + 1} pre-open cleanup`);
          return { status: "ready" };
        },
        findPack: async () => findSourcePack(loopDef),
        openPack: async ({ result: current, pack }) => {
          log(`${loopDef.name}: ${dryRun ? "dry-run would open" : `round ${current.packsOpened + 1}/${rounds} opening`} ${packName(pack)} (#${pack.id})`);
          if (dryRun) return { status: "planned", reason: `would open ${packName(pack)}` };
          const receipt = await openPack(pack, `${loopDef.name} round ${current.packsOpened + 1}`, {
            allowGone: true,
            retryCodes: ["471", "500"],
            resolveRetryPack: () => findSourcePack(loopDef),
            openedItemPolicy: createProvisionPackPolicy(loopDef)
          });
          return receipt || { status: "stale", reason: "source pack stale or unavailable" };
        },
        runStages: async ({ phase, context }) => {
          const handling = phase === "resume" ? context.provisionHandling || {} : context;
          if (dryRun) {
            if (loopDef.preCraftPlayerPickLoopId) {
              const pickDef = findLoopDefById(loopDef.preCraftPlayerPickLoopId);
              log(`${loopDef.name}: after each opened Provision Pack, live run checks ${pickDef?.name || loopDef.preCraftPlayerPickLoopId} only when an unassigned duplicate matches that Pick's configured requirements`);
            }
          } else {
            const pickResults = await runProvisionPreCraftPlayerPick(loopDef, handling);
            preCraftPickResults.push(...pickResults);
          }
          const completions = {};
          for (let index = 0; index < craftingUpgrades.length; index++) {
            const upgradeDef = craftingUpgrades[index];
            const label = `${phase === "resume" ? "resumed " : ""}${upgradeDef.name}`;
            if (dryRun) {
              for (const challengeDef of getChallengeMaterialDefs(upgradeDef)) {
                await runReservedDuplicateUpgradeDryRun(
                  loopDef,
                  challengeDef,
                  (item) => isDuplicateForLoopRequirements(item, challengeDef),
                  challengeDef.name
                );
              }
              completions[`stage-${index}`] = 0;
            } else {
              completions[`stage-${index}`] = await submitReservedDuplicateUpgrade(
                loopDef,
                upgradeDef,
                (item) => isDuplicateForLoopRequirements(item, upgradeDef),
                label
              );
            }
          }
          return { status: "completed", completions };
        },
        afterStages: async ({ phase, result: current }) => {
          if (dryRun) return;
          await resolveRuntimeUnassigned(`${loopDef.name} ${phase === "resume" ? "resume" : `round ${current.packsOpened}`} cleanup`);
          if (phase === "pack") await sleep(CFG.pauseMs);
        },
        afterStalePack: async () => {
          if (!dryRun) await sleep(CFG.pauseMs);
        },
        finalize: async () => {
          if (!dryRun) await resolveRuntimeUnassigned(`${loopDef.name} final cleanup`);
        },
        onEvent: async (event, payload) => {
          if (event === "pack-unavailable") {
            log(`${loopDef.name}: configured source pack not found; stopping at round ${payload.result.packsOpened + 1}/${rounds}`);
          }
        }
      });
      if (preCraftPickResults.length) {
        const pickDef = getLoopDefById(loopDef.preCraftPlayerPickLoopId);
        state.lastPickRecap = {
          name: pickDef.name,
          pickResults: preCraftPickResults,
          completedAt: Date.now()
        };
        updateRecapButton();
        await showPickRecapModal(pickDef, preCraftPickResults);
      }
      const completionSummary = craftingUpgrades.map((upgradeDef, index) => `${upgradeDef.name}:${result.stageCompletions[`stage-${index}`] || 0}`).join(", ");
      if (dryRun) {
        log(`${loopDef.name}: dry-run result ${result.status}; configured rounds:${rounds}`);
        log(`${loopDef.name}: dry run stops before opening packs, moving items, or submitting SBCs`);
      } else {
        log(`${loopDef.name}: opened ${result.packsOpened} source pack(s), submitted ${completionSummary || "no crafting stages"}`);
      }
      return result;
    }
    async function runRarePackCraftLoop(loopDef) {
      await waitAppReady();
      const dryRun = loopDef.dryRun === true;
      const maxPacks = Math.max(1, Math.min(100, Number(loopDef.maxPacks || 100) || 100));
      const result = await runPackAndCraftWorkflow({
        maxPacks,
        stopPoint: () => stopPoint(),
        resume: async () => {
          if (dryRun) {
            await refreshInventoryCaches(`${loopDef.name} dry-run`, { quiet: true });
            const items2 = getUnassignedItems();
            const usable2 = items2.filter(isLowRareGoldDuplicate);
            log(`${loopDef.name}: dry-run resume found ${items2.length} unassigned item(s), ${usable2.length} usable low rare duplicate(s)`);
            return { hasItems: usable2.length > 0, usableCount: usable2.length };
          }
          await unwindSbcSquadControllers(`${loopDef.name} resume`);
          const items = await showUnassignedIfAny(`${loopDef.name} resume sync`);
          const usable = items.filter(isLowRareGoldDuplicate);
          if (items.length) log(`${loopDef.name}: resume found ${items.length} unassigned item(s), ${usable.length} usable low rare duplicate(s)`);
          return { hasItems: usable.length > 0, usableCount: usable.length };
        },
        beforePack: async () => {
          if (!dryRun) await resolveRuntimeUnassigned(`${loopDef.name} pre-open cleanup`);
          return { status: "ready" };
        },
        findPack: async () => findSourcePack(loopDef),
        openPack: async ({ result: current, pack }) => {
          log(`${loopDef.name}: ${dryRun ? "dry-run would open" : "opening"} ${packName(pack)} (#${pack.id}) ${current.packsOpened + 1}/${maxPacks}`);
          if (dryRun) return { status: "planned", reason: `would open ${packName(pack)}` };
          const receipt = await openPack(pack, `${loopDef.name} source pack`, {
            allowGone: true,
            retryCodes: ["471", "500"],
            resolveRetryPack: () => findSourcePack(loopDef),
            openedItemPolicy: createRarePackTo84Policy(loopDef)
          });
          return receipt || { status: "stale", reason: "source pack stale or unavailable" };
        },
        runStages: async ({ phase, context }) => {
          if (dryRun) {
            await runReservedDuplicateUpgradeDryRun(
              loopDef,
              loopDef.rareUpgrade,
              isLowRareGoldDuplicate,
              `2x84+ ${phase === "resume" ? "resumed " : ""}low rare gold`
            );
            return { status: "planned", completions: { rare: 0 }, reason: "would submit 2x84+ stage" };
          }
          const completions = await submitReservedDuplicateUpgrade(
            loopDef,
            loopDef.rareUpgrade,
            isLowRareGoldDuplicate,
            `2x84+ ${phase === "resume" ? "resumed " : ""}low rare gold`,
            {
              forceAttempts: phase === "pack" && Number(context?.lowRare || 0) > 0 ? 1 : 0,
              transientUnassignedSignals: phase === "pack" ? context?.transientUnassignedSignals || [] : []
            }
          );
          return { status: "completed", completions: { rare: completions } };
        },
        afterStages: async ({ phase }) => {
          if (dryRun) return;
          await resolveRuntimeUnassigned(`${loopDef.name} ${phase === "resume" ? "resume" : "post-pack"} cleanup`);
          await sleep(CFG.pauseMs);
        },
        afterStalePack: async () => {
          if (!dryRun) await sleep(CFG.pauseMs);
        },
        finalize: async () => {
          if (!dryRun) await resolveRuntimeUnassigned(`${loopDef.name} final cleanup`);
        },
        onEvent: async (event) => {
          if (event === "pack-unavailable") log(`${loopDef.name}: no matching rare gold source pack remains`);
        }
      });
      const rareCompletions = Number(result.stageCompletions.rare || 0);
      if (dryRun) {
        log(`${loopDef.name}: dry-run result ${result.status}`);
        log(`${loopDef.name}: dry run stops before opening packs, moving items, or submitting SBCs`);
      } else {
        log(`${loopDef.name}: opened ${result.packsOpened} rare gold pack(s), submitted 2x84+:${rareCompletions}`);
      }
      return result;
    }
    function isPlayerPickItem(item) {
      try {
        if (item?.isPlayerPickItem?.()) return true;
      } catch {
      }
      return /player\s*pick/i.test(String(item?.name || item?.description || item?._staticData?.name || ""));
    }
    function pickItemName(item) {
      return String(item?._staticData?.name || item?.name || item?.description || `Player Pick #${item?.id || "?"}`);
    }
    function sameLimitedUseType(a, b) {
      const left = a?.limitedUseType ?? a?._limitedUseType ?? null;
      const right = b?.limitedUseType ?? b?._limitedUseType ?? null;
      return left === null || right === null || String(left) === String(right);
    }
    function playerPickMatchesLoop(item, loopDef) {
      return isPlayerPickItem(item) && matchesAny(pickItemName(item), loopDef.pickItemNames || []);
    }
    function getPlayerPickOwnedItems() {
      const seen = /* @__PURE__ */ new Set();
      return [
        ...getUnassignedItems(),
        ...getStorageItems(),
        ...getTransferItems(),
        ...getClubItems()
      ].filter((item) => {
        const id = Number(item?.id || 0);
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    }
    function isPlayerPickDuplicate(item) {
      const itemId = Number(item?.id || 0);
      return getPlayerPickOwnedItems().some(
        (ownedItem) => Number(ownedItem?.id || 0) !== itemId && Number(ownedItem?.definitionId || 0) === Number(item?.definitionId || -1) && sameLimitedUseType(ownedItem, item)
      );
    }
    async function getPlayerPickPrices(items, loopDef) {
      const prices = /* @__PURE__ */ new Map();
      const ids = [...new Set((items || []).map((item) => Number(item?.definitionId || 0)).filter(Boolean))];
      if (!ids.length) return prices;
      const platform = String(loopDef.pricePlatform || "pc").toLowerCase();
      try {
        const url = `https://www.fut.gg/api/fut/player-prices/26/?ids=${encodeURIComponent(ids.join(","))}&platform=${encodeURIComponent(platform)}`;
        const response = JSON.parse(await requestPriceText(url, {
          // Mirrors FSU's probe: FUT.GG accepts authenticated browser requests more
          // reliably when the site's existing cookies and browser context are present.
          sendCookies: true,
          headers: {
            Referer: W.location?.origin || location.origin,
            "X-Requested-With": "XMLHttpRequest"
          }
        }));
        for (const entry of response?.data || []) {
          const definitionId = Number(entry?.eaId || entry?.definitionId || 0);
          const price = Number(entry?.price);
          if (definitionId && Number.isFinite(price) && price > 0) prices.set(definitionId, price);
        }
        if (prices.size) {
          log(`${loopDef.name}: FUT.GG prices loaded for ${prices.size}/${ids.length} Pick candidate(s)`);
          return prices;
        }
        log(`${loopDef.name}: FUT.GG returned no usable Pick prices; trying FUTNext`);
      } catch (error) {
        log(`${loopDef.name}: FUT.GG price lookup unavailable (${error?.message || error}); trying FUTNext`);
      }
      try {
        const url = `https://enhancer-api.futnext.com/players/prices?ids=${encodeURIComponent(ids.join("_"))}&platform=${encodeURIComponent(platform)}`;
        const response = JSON.parse(await requestPriceText(url));
        for (const entry of Array.isArray(response) ? response : []) {
          const definitionId = Number(entry?.definitionId || entry?.eaId || 0);
          const price = Number(entry?.prices?.[0]);
          if (definitionId && Number.isFinite(price) && price > 0) prices.set(definitionId, price);
        }
        if (prices.size) log(`${loopDef.name}: FUTNext prices loaded for ${prices.size}/${ids.length} Pick candidate(s)`);
        else log(`${loopDef.name}: FUTNext returned no usable Pick prices; price ties require manual selection`);
      } catch (error) {
        log(`${loopDef.name}: FUTNext price lookup unavailable (${error?.message || error}); price ties require manual selection`);
      }
      return prices;
    }
    function describePlayerPickCandidate(candidate) {
      const tags = [
        candidate.special ? "special" : "normal",
        candidate.duplicate ? "duplicate" : "new",
        candidate.price === null ? "price:?" : `price:${candidate.price}`
      ];
      return `${itemDisplayName(candidate.item)} rating:${candidate.rating} ${tags.join(",")}`;
    }
    function rankPlayerPickCandidates(items, prices) {
      return (items || []).map((item, index) => ({
        item,
        index,
        rating: Number(item?.rating || 0),
        special: isSpecial(item),
        duplicate: isPlayerPickDuplicate(item),
        price: prices.has(Number(item?.definitionId || 0)) ? prices.get(Number(item.definitionId)) : null
      })).sort(
        (a, b) => b.rating - a.rating || Number(b.special) - Number(a.special) || Number(a.duplicate) - Number(b.duplicate) || (b.price ?? -1) - (a.price ?? -1) || a.index - b.index
      );
    }
    function capturePlayerPickSelections(selected, ranked) {
      return (selected || []).map((item) => {
        const candidate = ranked.find((entry) => entry.item === item);
        return {
          item,
          rating: candidate?.rating ?? Number(item?.rating || 0),
          special: candidate?.special ?? isSpecial(item),
          duplicate: candidate?.duplicate ?? isPlayerPickDuplicate(item),
          price: candidate?.price ?? null
        };
      });
    }
    function formatCompactPrice(price) {
      const value = Number(price);
      if (!Number.isFinite(value) || value <= 0) return "";
      if (value >= 1e6) return `${(value / 1e6).toFixed(value >= 1e7 ? 0 : 1)}m`;
      if (value >= 1e3) return `${(value / 1e3).toFixed(value >= 1e5 ? 0 : 1)}k`;
      return String(Math.round(value));
    }
    function getManualPickReason(ranked, pickCount) {
      const topRating = ranked[0]?.rating;
      const topSpecials = ranked.filter((candidate) => candidate.rating === topRating && candidate.special);
      if (topSpecials.length > 1) {
        return `${topSpecials.length} special card(s) share the highest rating ${topRating}`;
      }
      const groups = /* @__PURE__ */ new Map();
      ranked.forEach((candidate, index) => {
        const key = `${candidate.rating}:${candidate.special ? 1 : 0}:${candidate.duplicate ? 1 : 0}`;
        const group = groups.get(key) || { candidates: [], firstIndex: index };
        group.candidates.push(candidate);
        groups.set(key, group);
      });
      for (const group of groups.values()) {
        if (group.firstIndex >= pickCount || group.candidates.length < 2) continue;
        if (group.candidates.some((candidate) => candidate.price === null)) {
          return "price data is missing for a tie that affects the selected card(s)";
        }
      }
      return "";
    }
    function waitForManualPlayerPick(ranked, pickCount, reason) {
      return new Promise((resolve, reject) => {
        let stopTimer = null;
        const finish = (callback, value) => {
          if (stopTimer) clearInterval(stopTimer);
          overlay.remove();
          callback(value);
        };
        const overlay = document.createElement("div");
        overlay.id = "bronze-loop-pick-modal";
        Object.assign(overlay.style, {
          position: "fixed",
          inset: "0",
          zIndex: "100000",
          background: "rgba(0, 0, 0, 0.78)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
          boxSizing: "border-box"
        });
        const dialog = document.createElement("div");
        Object.assign(dialog.style, {
          width: "min(780px, 100%)",
          maxHeight: "90vh",
          overflow: "auto",
          background: "#171b21",
          color: "#f3f5f7",
          border: "1px solid #65758a",
          padding: "16px",
          boxSizing: "border-box",
          fontFamily: "Arial, sans-serif"
        });
        const title = document.createElement("div");
        title.textContent = `Manual Player Pick: ${reason}`;
        Object.assign(title.style, { fontWeight: "700", marginBottom: "8px" });
        const hint = document.createElement("div");
        hint.textContent = `Select exactly ${pickCount} player(s), then confirm.`;
        Object.assign(hint.style, { color: "#b7c2d0", marginBottom: "12px" });
        const list = document.createElement("div");
        Object.assign(list.style, { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px" });
        const selected = /* @__PURE__ */ new Set();
        const cards = [];
        const confirm = document.createElement("button");
        confirm.textContent = "Confirm selection";
        confirm.disabled = true;
        Object.assign(confirm.style, { marginTop: "14px", minHeight: "34px", padding: "0 14px" });
        const refresh = () => {
          cards.forEach(({ card, candidate }) => {
            card.style.borderColor = selected.has(candidate) ? "#64d77a" : "#536171";
            card.style.background = selected.has(candidate) ? "#243c2b" : "#202731";
          });
          confirm.disabled = selected.size !== pickCount;
        };
        ranked.forEach((candidate) => {
          const card = document.createElement("button");
          card.type = "button";
          card.textContent = describePlayerPickCandidate(candidate);
          Object.assign(card.style, {
            minHeight: "68px",
            textAlign: "left",
            color: "#f3f5f7",
            background: "#202731",
            border: "1px solid #536171",
            padding: "9px",
            cursor: "pointer",
            lineHeight: "1.35"
          });
          card.addEventListener("click", () => {
            if (selected.has(candidate)) selected.delete(candidate);
            else if (selected.size < pickCount) selected.add(candidate);
            refresh();
          });
          cards.push({ card, candidate });
          list.appendChild(card);
        });
        confirm.addEventListener("click", () => {
          if (selected.size !== pickCount) return;
          finish(resolve, [...selected].map((candidate) => candidate.item));
        });
        dialog.append(title, hint, list, confirm);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        refresh();
        stopTimer = setInterval(() => {
          if (!state.stopping) return;
          finish(reject, new Error("Stopped by user while a Player Pick selection was pending"));
        }, 250);
      });
    }
    async function redeemAndSelectPlayerPick(pickItem, loopDef, options = {}) {
      log(`${loopDef.name}: redeeming ${pickItemName(pickItem)}`);
      const redeemed = await observeOnce(W.services.Item.redeem(pickItem), ctrl(), 3e4, "redeem Player Pick");
      if (!redeemed?.success) fail(`${loopDef.name}: Player Pick redeem failed: ${serviceResultErrorText(redeemed)}`);
      const data = redeemed.data || redeemed.response || {};
      const choices = (data.playerPicks || data.items || []).filter(isPlayer);
      const pickCount = Math.max(1, Number(data.availablePicks || loopDef.pickCount || 1) || 1);
      if (choices.length < pickCount) fail(`${loopDef.name}: Player Pick returned ${choices.length} candidate(s) for ${pickCount} selection(s)`);
      const maxRating = Math.max(0, ...choices.map((item) => Number(item?.rating || 0)));
      const autoPickThreshold = Math.max(1, Math.min(99, Number(loopDef.autoPickRatingThreshold || 90) || 90));
      const autoSelectBelow90 = loopDef.autoSelectBelow90 !== false && maxRating < autoPickThreshold;
      if (autoSelectBelow90) {
        log(`${loopDef.name}: all candidates rated below ${autoPickThreshold} (max ${maxRating}); keeping automatic selection while loading prices for the recap`);
      }
      await refreshInventoryCaches(`${loopDef.name} Player Pick duplicate check`, { includePacks: false, quiet: true });
      const prices = await getPlayerPickPrices(choices, loopDef);
      const ranked = rankPlayerPickCandidates(choices, prices);
      ranked.forEach((candidate, index) => log(`${loopDef.name}: pick candidate ${index + 1}/${ranked.length} ${describePlayerPickCandidate(candidate)}`));
      const manualReason = autoSelectBelow90 ? "" : getManualPickReason(ranked, pickCount);
      const selected = manualReason ? await waitForManualPlayerPick(ranked, pickCount, manualReason) : ranked.slice(0, pickCount).map((candidate) => candidate.item);
      const selectedCards = capturePlayerPickSelections(selected, ranked);
      if (manualReason) log(`${loopDef.name}: manual Player Pick confirmed`);
      else log(`${loopDef.name}: auto-selected ${selected.map((item) => itemDisplayName(item)).join(", ")}`);
      const confirmed = await observeOnce(
        W.services.Item.confirmPlayerPickItemSelection(selected),
        ctrl(),
        3e4,
        "confirm Player Pick selection"
      );
      if (!confirmed?.success) fail(`${loopDef.name}: Player Pick confirmation failed: ${serviceResultErrorText(confirmed)}`);
      await sleep(CFG.pauseMs);
      await refreshUnassigned({ quiet: true });
      selectedCards.forEach((card) => {
        card.destination = predictUnassignedDestination(card.item);
      });
      await resolveRuntimeUnassigned(`${loopDef.name} Player Pick result`, options.cleanupOptions || {});
      return selectedCards;
    }
    async function findUnassignedPlayerPick(loopDef, attempts = 10, options = {}) {
      for (let attempt = 1; attempt <= attempts; attempt++) {
        await refreshUnassigned({ quiet: true, attempts: 1 });
        const picks = getUnassignedItems().filter(isPlayerPickItem);
        const unexpectedPick = picks.find((item) => !playerPickMatchesLoop(item, loopDef));
        if (unexpectedPick && options.failOnUnexpected) {
          fail(`${loopDef.name}: unrelated unassigned Player Pick detected (${pickItemName(unexpectedPick)}); stop without redeeming it`);
        }
        const pickItem = picks.find((item) => playerPickMatchesLoop(item, loopDef));
        if (pickItem) return pickItem;
        if (attempt < attempts) await sleep(900);
      }
      if (!options.quietMissing) log(`${loopDef.name}: Player Pick reward was not found in unassigned items`);
      return null;
    }
    function assertPlayerPickFodderProtection(loopDef, players) {
      const inspection = inspectSbcItems(loopDef, players, {
        expectedPlayerCount: sumRequirementPlayerCount(loopDef)
      });
      assertSbcSquadSafe(loopDef, inspection);
      if (loopDef.protectHighGold === false) return;
      const highGoldThreshold = Math.max(2, Math.min(99, Number(loopDef.pickHighGoldThreshold || 82) || 82));
      const protectedPlayers = (players || []).filter(
        (item) => isGold(item) && !isSpecial(item) && Number(item?.rating || 0) >= highGoldThreshold
      );
      if (!protectedPlayers.length) return;
      const details = protectedPlayers.map((item) => `${itemDisplayName(item)} rating:${Number(item?.rating || 0)}`).join(", ");
      fail(`${loopDef.name}: ${highGoldThreshold}+ normal gold protection blocked SBC submission: ${details}`);
    }
    function assertSavedPlayerPickFodderProtection(loopDef, squad) {
      const savedPlayers = getSquadItems(squad);
      if (!savedPlayers.length) {
        fail(`${loopDef.name}: cannot inspect the saved squad; stop before Player Pick submission`);
      }
      assertPlayerPickFodderProtection(loopDef, savedPlayers);
    }
    function loopChallengeDef(loopDef, challengeNo) {
      const challengeRequirements = loopDef.challengeRequirements?.[Math.max(0, Number(challengeNo || 1) - 1)];
      if (!Array.isArray(challengeRequirements) || !challengeRequirements.length) return loopDef;
      return { ...loopDef, requirements: challengeRequirements };
    }
    function playerPickChallengeDef(loopDef, challengeNo) {
      return loopChallengeDef(loopDef, challengeNo);
    }
    async function submitPlayerPickChallenge(loopDef, challengeNo, challengeTotal, options = {}) {
      const challengeDef = playerPickChallengeDef(loopDef, challengeNo);
      await refreshInventoryCaches(`${loopDef.name} challenge ${challengeNo}/${challengeTotal} pre-selection`, { includePacks: false, quiet: true });
      const selection = selectInventoryPlayers3(challengeDef, challengeDef.priorityPiles);
      log(`${loopDef.name}: challenge ${challengeNo}/${challengeTotal} selected ${selection.selected.length}/${sumRequirementPlayerCount(challengeDef)} player(s) (${formatSelectionStats(selection.stats)})`);
      if (!selection.ok) {
        log(`${loopDef.name}: challenge ${challengeNo}/${challengeTotal} missing ${selection.missing.count} ${selection.missing.rarity || selection.missing.tier || "player"}(s); stopping`);
        logSelectionDiagnostics(`${loopDef.name} challenge ${challengeNo}/${challengeTotal}`, selection, challengeDef.priorityPiles);
        return { status: "blocked", submitted: false, reason: `missing ${selection.missing.count} player(s)` };
      }
      if (options.dryRun === true) {
        logDryRunSelection(`${loopDef.name} challenge ${challengeNo} strict card ratio`, selection, {
          priorityPiles: challengeDef.priorityPiles
        });
        return { status: "planned", submitted: false, selection };
      }
      const label = `${loopDef.name} challenge ${challengeNo}/${challengeTotal}`;
      const attempt = await submitInventorySbcAttempt(challengeDef, selection, {
        label,
        handleReward: false,
        markConsumed: true,
        preSaveValidators: [({ players }) => {
          assertPlayerPickFodderProtection(challengeDef, players);
          return true;
        }],
        postSaveValidators: [({ challenge }) => {
          assertSavedPlayerPickFodderProtection(challengeDef, challenge?.squad || ctrl()?._squad);
          return true;
        }]
      });
      if (attempt.result.status === "unavailable") {
        log(`${loopDef.name}: no available SBC challenge remains`);
        return { status: "unavailable", submitted: false, reason: "no available SBC challenge remains" };
      }
      if (!attempt.result.submitted) {
        log(`${label}: submit blocked: ${attempt.result.reason || attempt.result.status}`);
        return { status: "blocked", submitted: false, reason: attempt.result.reason || attempt.result.status };
      }
      return { status: "submitted", submitted: true, rewardPackId: attempt.result.rewardPackId };
    }
    async function runProvisionPreCraftPlayerPick(loopDef, provisionHandling = {}) {
      const pickDef = getProvisionPreCraftPickDef(loopDef);
      if (!pickDef) return [];
      const materialDefs = [
        ...getChallengeMaterialDefs(pickDef),
        ...getProvisionCraftingUpgrades(loopDef).flatMap(getChallengeMaterialDefs)
      ];
      const isReservedDuplicate = (item) => materialDefs.some((def) => isDuplicateForLoopRequirements(item, def));
      const cleanupOptions = {
        reserveItem: (item) => {
          if (!isReservedDuplicate(item)) return false;
          const clubDuplicate = findClubDuplicate2(item);
          if (!clubDuplicate || state.consumedItemIds.has(Number(clubDuplicate?.id || 0))) {
            item.duplicateId = 0;
            if (item._duplicateId !== void 0) item._duplicateId = 0;
            return false;
          }
          return true;
        }
      };
      const pendingPick = await findUnassignedPlayerPick(pickDef, 1, { quietMissing: true, failOnUnexpected: true });
      if (pendingPick) {
        log(`${loopDef.name}: resolving pending ${pickItemName(pendingPick)} before crafting upgrades`);
        const pickedCards2 = await redeemAndSelectPlayerPick(pendingPick, pickDef, {
          cleanupOptions
        });
        log(`${loopDef.name}: pending ${pickDef.name} selected; continuing original crafting flow`);
        return [{ resumed: true, pickedCards: pickedCards2 || [] }];
      }
      const set = await findSbcSet(pickDef.sbcNames, pickDef.name);
      if (isSbcSetComplete(set)) {
        log(`${loopDef.name}: ${pickDef.name} is already complete; continuing original crafting flow`);
        return [];
      }
      const challenges = await requestSbcChallenges(set, pickDef.name, { attempts: 3 });
      const incompleteChallenges = challenges.filter((challenge) => !isCompletedChallenge(challenge));
      if (!incompleteChallenges.length) {
        log(`${loopDef.name}: ${pickDef.name} is already complete; continuing original crafting flow`);
        return [];
      }
      const challengeTotal = challenges.length || pickDef.challengesPerPick || incompleteChallenges.length;
      const incompleteChallengeEntries = incompleteChallenges.map((challenge) => {
        const index = challenges.findIndex((candidate) => Number(candidate?.id || 0) === Number(challenge?.id || 0));
        return { challenge, challengeNo: index >= 0 ? index + 1 : null };
      });
      const firstEntry = incompleteChallengeEntries[0];
      const firstChallengeNo = firstEntry.challengeNo || 1;
      const firstChallengeDef = playerPickChallengeDef(pickDef, firstChallengeNo);
      const reservedIds = new Set((provisionHandling.reservedItemIds || []).map(Number).filter(Boolean));
      const matchingDuplicates = getUnassignedItems().filter(
        (item) => (!reservedIds.size || reservedIds.has(Number(item?.id || 0))) && isDuplicateForLoopRequirements(item, firstChallengeDef)
      );
      if (!matchingDuplicates.length) {
        log(`${loopDef.name}: no unassigned duplicate matches ${pickDef.name} challenge ${firstChallengeNo} requirements; skipping the pre-craft Pick and continuing configured crafting stages`);
        return [];
      }
      const duplicateOnlySelection = selectInventoryPlayers3(firstChallengeDef, ["unassigned"]);
      const challengesToSubmit = incompleteChallengeEntries.length > 1 && !duplicateOnlySelection.ok ? incompleteChallengeEntries.slice(0, 1) : incompleteChallengeEntries;
      const requirementCount2 = sumRequirementPlayerCount(firstChallengeDef);
      log(`${loopDef.name}: ${matchingDuplicates.length} matching unassigned duplicate(s) triggered ${pickDef.name}; challenge ${firstChallengeNo} requires ${requirementCount2} configured player(s), duplicate-only complete:${duplicateOnlySelection.ok ? "yes" : "no"}, incomplete challenges:${incompleteChallengeEntries.length}/${challengeTotal}`);
      if (challengesToSubmit.length < incompleteChallengeEntries.length) {
        log(`${loopDef.name}: current duplicates do not independently satisfy challenge ${firstChallengeNo}; completing only this challenge with duplicate -> storage -> transfer -> club and leaving later challenge(s) for another source pack`);
      } else if (incompleteChallengeEntries.length > 1) {
        log(`${loopDef.name}: current duplicates independently satisfy challenge ${firstChallengeNo}; completing all remaining challenges in order, with shortages filled by storage -> transfer -> club`);
      }
      let submittedChallenges = 0;
      for (let index = 0; index < challengesToSubmit.length; index++) {
        const challengeNo = challengesToSubmit[index].challengeNo || index + 1;
        const submission = await submitPlayerPickChallenge(
          pickDef,
          challengeNo,
          challenges.length || pickDef.challengesPerPick || incompleteChallenges.length
        );
        if (!submission.submitted) {
          log(`${loopDef.name}: could not complete ${pickDef.name} challenge ${challengeNo}; leaving it pending and continuing original crafting flow`);
          break;
        }
        submittedChallenges++;
        await sleep(CFG.pauseMs);
      }
      if (submittedChallenges < incompleteChallenges.length) {
        const remainingChallenges = incompleteChallenges.length - submittedChallenges;
        await refreshInventoryCaches(`${loopDef.name} partial ${pickDef.name} duplicate sync`, { includePacks: false, quiet: true });
        for (const item of getUnassignedItems()) {
          const matchesPickRequirement = [pickDef.requirements, ...pickDef.challengeRequirements || []].some((requirements) => itemMatchesLoopRequirements(item, { ...pickDef, requirements }));
          if (!matchesPickRequirement) continue;
          const clubDuplicate = findClubDuplicate2(item);
          if (clubDuplicate && !state.consumedItemIds.has(Number(clubDuplicate?.id || 0))) continue;
          item.duplicateId = 0;
          if (item._duplicateId !== void 0) item._duplicateId = 0;
        }
        log(`${loopDef.name}: ${pickDef.name} remains partial with ${remainingChallenges} challenge(s) pending; a later source pack with a matching duplicate can resume it`);
        return [];
      }
      const pickItem = await findUnassignedPlayerPick(pickDef, 10, { failOnUnexpected: true });
      if (!pickItem) fail(`${loopDef.name}: ${pickDef.name} completed but its Player Pick reward was not found`);
      const pickedCards = await redeemAndSelectPlayerPick(pickItem, pickDef, {
        cleanupOptions
      });
      log(`${loopDef.name}: ${pickDef.name} completed and selected; continuing original crafting flow`);
      return [{ resumed: false, pickedCards: pickedCards || [] }];
    }
    async function runPlayerPickLoop(loopDef) {
      await waitAppReady();
      const dryRun = loopDef.dryRun === true;
      const maxPicks = Math.max(1, Math.min(50, Number(loopDef.maxCompletions || 1) || 1));
      const challengesPerPick = getPlayerPickChallengeCount(loopDef);
      const result = await runPlayerPickWorkflow({
        maxPicks,
        stopPoint: () => stopPoint(),
        findPendingPick: async () => {
          const pending = await findUnassignedPlayerPick(loopDef, 1, { quietMissing: true, failOnUnexpected: true });
          if (pending && !dryRun) log(`${loopDef.name}: resuming pending ${pickItemName(pending)}`);
          if (pending && dryRun) log(`${loopDef.name}: dry-run found pending ${pickItemName(pending)}; live run would resolve it before submitting another SBC`);
          return dryRun ? null : pending;
        },
        redeemPick: async ({ pickItem, resumed }) => {
          if (dryRun) return { status: "planned", reason: "would redeem Player Pick" };
          const pickedCards = await redeemAndSelectPlayerPick(pickItem, loopDef);
          if (resumed) log(`${loopDef.name}: resumed Player Pick selected`);
          return { status: "selected", pickedCards: pickedCards || [] };
        },
        beforePick: async ({ result: current }) => {
          if (!dryRun) await resolveRuntimeUnassigned(`${loopDef.name} pick ${current.picksCompleted + 1} pre-submit cleanup`);
          return { status: "ready" };
        },
        loadChallenges: async () => {
          if (dryRun) await refreshInventoryCaches(`${loopDef.name} dry-run`, { includePacks: false, quiet: true });
          const set = await findSbcSet(loopDef.sbcNames, loopDef.name);
          const challenges = await requestSbcChallenges(set, loopDef.name, { attempts: 3 });
          if (dryRun) {
            log(`${loopDef.name}: dry-run SBC found ${set.name} (#${set.id || "?"})`);
            log(`${loopDef.name}: dry-run requires ${challengesPerPick} challenge(s) per Pick and selects ${loopDef.pickCount || 1} player(s) from each reward`);
          }
          return {
            set,
            challenges,
            incomplete: challenges.map((challenge, index) => ({ challenge, challengeNo: index + 1 })).filter(({ challenge }) => !isCompletedChallenge(challenge))
          };
        },
        submitChallenge: async ({ challengeContext, entry }) => submitPlayerPickChallenge(
          loopDef,
          entry.challengeNo,
          challengeContext.challenges.length || challengesPerPick,
          { dryRun }
        ),
        afterChallenge: async () => {
          if (!dryRun) await sleep(CFG.pauseMs);
        },
        findRewardPick: async () => dryRun ? null : findUnassignedPlayerPick(loopDef, 10, { failOnUnexpected: true }),
        afterPick: async ({ result: current, resumed }) => {
          if (resumed) log(`${loopDef.name}: resumed Player Pick counts as ${current.picksCompleted}/${maxPicks} requested completion(s)`);
          if (!dryRun) await sleep(CFG.pauseMs);
        }
      });
      if (dryRun) {
        log(`${loopDef.name}: dry-run planned ${result.challengesPlanned} challenge(s)`);
        log(`${loopDef.name}: dry run stops before submitting SBCs, redeeming Picks, or moving items`);
      } else {
        log(`${loopDef.name}: completed ${result.picksCompleted}/${maxPicks} Player Pick(s)`);
      }
      return result;
    }
    async function showPickRecapModal(loopDef, pickResults) {
      const entries = Array.isArray(pickResults) ? pickResults : [];
      const flatCards = entries.flatMap((entry) => entry?.pickedCards || []);
      if (!flatCards.length) return;
      const destinationColors = { club: "#5cffa0", transfer: "#5c8aff", storage: "#ff9d4a", unknown: "#536171" };
      const destinationLabels = { club: "->CLUB", transfer: "->TRANSFER", storage: "->STORAGE", unknown: "->?" };
      return new Promise((resolve) => {
        let stopTimer = null;
        const overlay = document.createElement("div");
        overlay.id = "bronze-loop-recap-modal";
        Object.assign(overlay.style, {
          position: "fixed",
          inset: "0",
          zIndex: "100000",
          background: "rgba(0, 0, 0, 0.78)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
          boxSizing: "border-box"
        });
        const dialog = document.createElement("div");
        Object.assign(dialog.style, {
          width: "min(620px, 100%)",
          maxHeight: "90vh",
          overflow: "auto",
          background: "#171b21",
          color: "#f3f5f7",
          border: "1px solid #65758a",
          padding: "12px 14px",
          boxSizing: "border-box",
          fontFamily: "Arial, sans-serif"
        });
        const title = document.createElement("div");
        title.textContent = `Player Pick Recap: ${loopDef.name}`;
        Object.assign(title.style, { fontWeight: "700", marginBottom: "4px", fontSize: "16px" });
        const ratings = flatCards.map((card) => Number(card.rating || 0));
        const maxRating = Math.max(...ratings);
        const minRating = Math.min(...ratings);
        const specialCount = flatCards.filter((card) => card.special).length;
        const duplicateCount = flatCards.filter((card) => card.duplicate).length;
        const highRatedCount = flatCards.filter((card) => Number(card.rating || 0) >= 91).length;
        const resumedCount = entries.filter((entry) => entry?.resumed).length;
        const destinations = flatCards.reduce((counts, card) => {
          const destination = card.destination || "unknown";
          counts[destination] = (counts[destination] || 0) + 1;
          return counts;
        }, {});
        const summary = document.createElement("div");
        const destinationSummary = Object.entries(destinations).map(([destination, count]) => `${count} ${destinationLabels[destination] || destination}`).join(", ");
        summary.textContent = `${entries.length} pick(s), ${flatCards.length} card(s), rating ${minRating}-${maxRating}, ${specialCount} special, ${duplicateCount} duplicate, ${highRatedCount} rated 91+${destinationSummary ? `, ${destinationSummary}` : ""}${resumedCount ? `, ${resumedCount} resumed` : ""}`;
        Object.assign(summary.style, { color: "#9aa6b8", marginBottom: "8px", fontSize: "12px" });
        const list = document.createElement("div");
        Object.assign(list.style, { display: "flex", flexDirection: "column", gap: "6px" });
        const sortedRows = entries.flatMap((entry, pickIndex) => (entry?.pickedCards || []).map((card) => ({
          card,
          pickIndex: pickIndex + 1,
          resumed: !!entry?.resumed
        }))).sort((a, b) => Number(b.card.rating || 0) - Number(a.card.rating || 0) || a.pickIndex - b.pickIndex);
        sortedRows.forEach(({ card, pickIndex, resumed }) => {
          const rating = Number(card.rating || 0);
          const highRated = rating >= 91;
          const destination = card.destination || "unknown";
          const row = document.createElement("div");
          Object.assign(row.style, {
            padding: "6px 8px",
            fontSize: "13px",
            color: "#f3f5f7",
            background: highRated ? "#3a2f15" : card.special ? "#26223a" : "#1d2229",
            borderLeft: `3px solid ${highRated ? "#ffd54a" : card.special ? "#7a5cff" : destinationColors[destination] || destinationColors.unknown}`,
            display: "flex",
            gap: "8px",
            alignItems: "baseline"
          });
          const nameRating = document.createElement("span");
          Object.assign(nameRating.style, { flex: "1 1 auto", minWidth: "0", display: "flex", gap: "6px", alignItems: "baseline", overflow: "hidden" });
          const nameSpan = document.createElement("span");
          nameSpan.textContent = itemDisplayName(card.item);
          Object.assign(nameSpan.style, { fontWeight: "600", flex: "0 1 auto", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
          const ratingSpan = document.createElement("span");
          ratingSpan.textContent = `- ${rating}`;
          Object.assign(ratingSpan.style, {
            color: highRated ? "#ffd54a" : "#f3f5f7",
            fontWeight: "700",
            flex: "0 0 auto"
          });
          const pickTag = document.createElement("span");
          pickTag.textContent = `P${pickIndex}${resumed ? "r" : ""}`;
          Object.assign(pickTag.style, { color: "#7d8898", fontSize: "11px", fontWeight: "600", flex: "0 0 auto" });
          nameRating.append(nameSpan, ratingSpan, pickTag);
          const destinationTag = document.createElement("span");
          destinationTag.textContent = destinationLabels[destination] || destination;
          Object.assign(destinationTag.style, { color: destinationColors[destination] || destinationColors.unknown, fontSize: "11px", fontWeight: "600", flex: "0 0 auto" });
          const tags = document.createElement("span");
          const compactPrice = formatCompactPrice(card.price);
          tags.textContent = `${card.special ? "special" : "normal"}${card.duplicate ? ", duplicate" : ""}${compactPrice ? `, price:${compactPrice}` : ""}`;
          Object.assign(tags.style, { color: "#9aa6b8", fontSize: "11px", flex: "0 0 auto", whiteSpace: "nowrap" });
          row.append(nameRating, destinationTag, tags);
          list.appendChild(row);
        });
        const closeButton = document.createElement("button");
        closeButton.type = "button";
        closeButton.textContent = "Close";
        Object.assign(closeButton.style, {
          marginTop: "10px",
          minHeight: "30px",
          padding: "0 14px",
          background: "#2f6fde",
          color: "#fff",
          border: "none",
          borderRadius: "3px",
          cursor: "pointer",
          fontSize: "13px"
        });
        const finish = () => {
          if (stopTimer) clearInterval(stopTimer);
          overlay.remove();
          const recapBtn = document.querySelector("#bronze-loop-recap-reopen");
          if (recapBtn) {
            recapBtn.textContent = "View recap";
            recapBtn.style.background = "";
          }
          resolve();
        };
        closeButton.addEventListener("click", finish);
        overlay.addEventListener("click", (event) => {
          if (event.target === overlay) finish();
        });
        dialog.append(title, summary, list, closeButton);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        if (specialCount > 0) triggerRecapFireworks(dialog, specialCount);
        stopTimer = setInterval(() => {
          if (state.stopping) finish();
        }, 250);
      });
    }
    function triggerRecapFireworks(dialog, specialCount) {
      if (!dialog) return;
      if (getComputedStyle(dialog).position === "static") dialog.style.position = "relative";
      dialog.style.isolation = "isolate";
      const canvas = document.createElement("canvas");
      canvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:35%;pointer-events:none;z-index:-1;overflow:hidden;";
      dialog.insertBefore(canvas, dialog.firstChild);
      const W2 = Math.max(220, canvas.clientWidth);
      const H = Math.max(120, canvas.clientHeight);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W2 * dpr);
      canvas.height = Math.round(H * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        canvas.remove();
        return;
      }
      ctx.scale(dpr, dpr);
      const palette = ["#ffd54a", "#ff5c5c", "#5c8aff", "#5cffa0", "#7a5cff", "#ff9d4a", "#ff5cb1", "#5ce0ff"];
      const intensity = Math.max(1, Math.min(6, Number(specialCount) || 1));
      const bursts = 3;
      const particlesPerBurst = 70 + intensity * 14;
      const totalDuration = 3e3;
      const particles = [];
      const burstSchedule = [80, 700, 1400];
      function spawnBurst(x, y) {
        const flash = {
          x,
          y,
          life: 1,
          decay: 0.05,
          color: "#fff",
          size: 14 + Math.random() * 6,
          isFlash: true
        };
        particles.push(flash);
        for (let i = 0; i < particlesPerBurst; i++) {
          const baseAngle = i / particlesPerBurst * Math.PI * 2;
          const angleJitter = (Math.random() - 0.5) * 0.5;
          const angle = baseAngle + angleJitter;
          const speed = 1.5 + Math.random() * 3.5;
          const color = palette[Math.floor(Math.random() * palette.length)];
          particles.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1.8,
            color,
            life: 1,
            decay: 6e-3 + Math.random() * 0.012,
            size: 0.9 + Math.random() * 1.4
          });
        }
      }
      const startMs = performance.now();
      const cols = [0.22, 0.5, 0.78];
      let lastBurstIdx = -1;
      function tick(now2) {
        const elapsed = now2 - startMs;
        if (elapsed > totalDuration || !canvas.isConnected) {
          canvas.remove();
          return;
        }
        for (let b = lastBurstIdx + 1; b < bursts; b++) {
          if (elapsed >= burstSchedule[b]) {
            const ox = W2 * cols[b] + (Math.random() - 0.5) * 30;
            const oy = H * (0.18 + Math.random() * 0.12);
            spawnBurst(ox, oy);
            lastBurstIdx = b;
          }
        }
        ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
        ctx.fillRect(0, 0, W2, H);
        ctx.globalCompositeOperation = "lighter";
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.vy += 0.06;
          p.vx *= 0.985;
          p.vy *= 0.985;
          p.x += p.vx;
          p.y += p.vy;
          p.life -= p.decay;
          if (p.life <= 0 || p.y > H + 30 || p.x < -30 || p.x > W2 + 30) {
            particles.splice(i, 1);
            continue;
          }
          ctx.shadowColor = p.color;
          ctx.shadowBlur = p.isFlash ? 18 : 9;
          ctx.fillStyle = p.color;
          ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.isFlash ? p.size * (1 + (1 - p.life) * 0.6) : p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
    async function runRound(roundNo) {
      log(`Round ${roundNo} start`);
      await waitAppReady();
      await openSourceBronzePack();
      const bronzeSet = await findBronzeUpgradeSet();
      await openSbcSet(bronzeSet);
      await fillBronzeUpgradeSquad();
      const rewardPackId = await submitSbcAndGetAwardPackId(bronzeSet);
      log(`Reward pack id: ${rewardPackId || "unknown"}`);
      await openRewardSilverPack(rewardPackId);
      const remaining = await showUnassignedIfAny(`round ${roundNo} end`);
      if (remaining.length) fail(`Round ended with ${remaining.length} unassigned item(s); stop for manual inspection`);
      log(`Round ${roundNo} done`);
    }
    async function runConfiguredLoop(loopDef, roundNo = 1) {
      state.loopStack.push(loopDef);
      try {
        return await executeConfiguredLoopInternal(loopDef, roundNo);
      } finally {
        state.loopStack.pop();
      }
    }
    async function executeConfiguredLoopInternal(loopDef, roundNo = 1) {
      log(`Loop selected: ${loopDef.name} (${loopDef.strategy})`);
      if (loopDef.disabledPiles?.length) log(`Disabled piles: ${loopDef.disabledPiles.join(", ")}`);
      const dryRun = loopDef.dryRun === true;
      if (dryRun) log(`Dry run active: no items will be moved, no packs opened, no squads saved, no SBCs submitted`);
      if (loopDef.strategy === "dailyRoutine") {
        const result = await runDailySequence(loopDef);
        if (!dryRun) await showUnassignedIfAny(`${loopDef.name} end`);
        return result;
      }
      if (loopDef.strategy === "validationBronzeUpgrade") {
        if (dryRun) return runValidationBronzeUpgradeDryRun(loopDef, roundNo);
        return runRound(roundNo);
      }
      if (loopDef.strategy === "dailySingleCardRecycle") {
        const result = await runRecycleLoop(loopDef);
        if (!dryRun) await showUnassignedIfAny(`${loopDef.name} end`);
        return result;
      }
      if (["supplyAndCraft", "inventoryMixedUpgrade", "commonGoldToRareUpgrade"].includes(loopDef.strategy)) {
        const result = await runSupplyAndCraftLoop(loopDef);
        if (!dryRun) await showUnassignedIfAny(`${loopDef.name} end`);
        return result;
      }
      if (loopDef.strategy === "provisionPackCrafting" || loopDef.strategy === "provisionPackDualCrafting") {
        const result = await runProvisionCraftLoop(loopDef);
        if (!dryRun) await showUnassignedIfAny(`${loopDef.name} end`);
        return result;
      }
      if (loopDef.strategy === "rarePackTo84Upgrade") {
        const result = await runRarePackCraftLoop(loopDef);
        if (!dryRun) await showUnassignedIfAny(`${loopDef.name} end`);
        return result;
      }
      if (loopDef.strategy === "playerPickSbc") {
        const result = await runPlayerPickLoop(loopDef);
        const pickResults = result.pickResults || [];
        if (!dryRun) {
          state.lastPickRecap = {
            name: loopDef.name,
            pickResults,
            completedAt: Date.now()
          };
          updateRecapButton();
          await showPickRecapModal(loopDef, pickResults);
          await showUnassignedIfAny(`${loopDef.name} end`);
        }
        return result;
      }
      if (loopDef.strategy === "fillAndVerifySbc") {
        const result = await runFillAndVerifyLoop(loopDef);
        if (!dryRun) await showUnassignedIfAny(`${loopDef.name} end`);
        return result;
      }
      fail(`Unsupported loop strategy: ${loopDef.strategy}`);
    }
    function getLiveRunLimit(loopDef, rounds) {
      if (loopDef.strategy === "validationBronzeUpgrade") return Number(rounds || loopDef.maxRounds || 1);
      if (loopDef.strategy === "fillAndVerifySbc") {
        const completions = Number(loopDef.maxCompletions || 1);
        return completions + (needsAutoTotwPreflight(loopDef) ? completions : 0);
      }
      if (loopDef.strategy === "rarePackTo84Upgrade") return Number(loopDef.maxPacks || 100);
      if (loopDef.strategy === "playerPickSbc") {
        return Number(loopDef.maxCompletions || 1) * getPlayerPickChallengeCount(loopDef);
      }
      if (loopDef.strategy === "dailyRoutine") {
        return summarizeRoutineStepLimits(getRoutineStepLoopDefs(loopDef)).max;
      }
      return Number(loopDef.maxCompletions || loopDef.rounds || loopDef.maxRounds || 1);
    }
    async function startLoop() {
      if (state.running) return;
      let loopDef = null;
      let rounds = CFG.maxRounds;
      try {
        loopDef = getSelectedLoopDef();
        const input = document.querySelector("#bronze-loop-rounds");
        rounds = Math.max(1, Math.min(50, Number(input?.value || CFG.maxRounds) || CFG.maxRounds));
        loopDef.dryRun = isDryRunEnabled() || loopDef.dryRun === true;
        loopDef.openRewardPacks = loopDef.forceOpenRewardPacks === true || isOpenRewardPacksEnabled();
        applyPickRuntimeOptions(loopDef);
        if (loopDef.strategy === "provisionPackCrafting" || loopDef.strategy === "provisionPackDualCrafting") loopDef.rounds = rounds;
        if (loopDef.useRoundsAsCompletions === true) loopDef.maxCompletions = rounds;
        logFsuSettingsForRun();
      } catch (e) {
        log(`Stopped: ${e.message || e}`);
        errorStackLines(e).forEach((line) => log(`Error stack: ${line}`));
        console.error("[BronzeLoop]", e);
        return;
      }
      state.running = true;
      state.stopping = false;
      setPanelState();
      try {
        if (loopDef.dryRun || loopDef.strategy !== "validationBronzeUpgrade") {
          stopPoint();
          await runConfiguredLoop(loopDef, 1);
        } else {
          for (let i = 1; i <= rounds; i++) {
            stopPoint();
            await runConfiguredLoop(loopDef, i);
            await sleep(CFG.pauseMs);
          }
        }
        log("All requested rounds completed");
      } catch (e) {
        log(`Stopped: ${e.message || e}`);
        errorStackLines(e).forEach((line) => log(`Error stack: ${line}`));
        console.error("[BronzeLoop]", e);
      } finally {
        state.running = false;
        state.stopping = false;
        setPanelState();
      }
    }
    function setPanelState() {
      const start = document.querySelector("#bronze-loop-start");
      const stop = document.querySelector("#bronze-loop-stop");
      const select = document.querySelector("#bronze-loop-select");
      const edit = document.querySelector("#bronze-loop-edit");
      const refresh = document.querySelector("#bronze-loop-refresh");
      const loadJson = document.querySelector("#bronze-loop-load-json");
      const builtIn = document.querySelector("#bronze-loop-built-in");
      const dryRun = document.querySelector("#bronze-loop-dry-run");
      const openRewards = document.querySelector("#bronze-loop-open-rewards");
      const pickProtectHighGold = document.querySelector("#bronze-loop-pick-protect-high-gold");
      const pickAutoBelow90 = document.querySelector("#bronze-loop-pick-auto-below-90");
      const pickHighGoldThreshold = document.querySelector("#bronze-loop-pick-high-gold-threshold");
      const pickAutoThreshold = document.querySelector("#bronze-loop-pick-auto-threshold");
      const showMvp = document.querySelector("#bronze-loop-show-mvp");
      const rounds = document.querySelector("#bronze-loop-rounds");
      const json = document.querySelector("#bronze-loop-json");
      if (start) start.disabled = state.running;
      if (stop) stop.disabled = !state.running;
      if (select) select.disabled = state.running;
      if (edit) edit.disabled = state.running;
      if (refresh) refresh.disabled = state.running || state.refreshing;
      if (loadJson) loadJson.disabled = state.running || state.loadingLoops;
      if (builtIn) builtIn.disabled = state.running || state.loadingLoops || state.loopConfigSource === "built-in";
      if (dryRun) dryRun.disabled = state.running;
      if (openRewards) openRewards.disabled = state.running;
      if (pickProtectHighGold) pickProtectHighGold.disabled = state.running;
      if (pickAutoBelow90) pickAutoBelow90.disabled = state.running;
      if (pickHighGoldThreshold) pickHighGoldThreshold.disabled = state.running;
      if (pickAutoThreshold) pickAutoThreshold.disabled = state.running;
      if (showMvp) showMvp.disabled = state.running;
      if (rounds) rounds.disabled = state.running;
      if (json) json.disabled = state.running;
      updateLoopControls();
    }
    function getSavedPanelPos() {
      try {
        return JSON.parse(localStorage.getItem("fc-loop-panel-pos") || "null");
      } catch {
        return null;
      }
    }
    function savePanelPos(panel) {
      try {
        const rect = panel.getBoundingClientRect();
        localStorage.setItem("fc-loop-panel-pos", JSON.stringify({
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }));
      } catch {
      }
    }
    function getPanelDefaultSize(panel) {
      return panel.classList.contains("options-open") ? { width: 360, height: 620 } : { width: 300, height: 178 };
    }
    function resetPanelSize(panel) {
      const size = getPanelDefaultSize(panel);
      const width = Math.min(size.width, Math.max(220, window.innerWidth - 20));
      const height = Math.min(size.height, Math.max(180, window.innerHeight - 20));
      panel.dataset.minWidth = String(width);
      panel.dataset.minHeight = String(height);
      panel.style.width = `${width}px`;
      panel.style.height = `${height}px`;
    }
    function makePanelDraggable(panel) {
      const handle = panel.querySelector("#bronze-loop-drag");
      if (!handle) return;
      let dragging = false;
      let startX = 0;
      let startY = 0;
      let startLeft = 0;
      let startTop = 0;
      let moved = false;
      handle.addEventListener("pointerdown", (event) => {
        if (!panel.classList.contains("icon-only") && event.target.closest("button,select,input,textarea")) return;
        dragging = true;
        moved = false;
        const rect = panel.getBoundingClientRect();
        startX = event.clientX;
        startY = event.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        panel.style.left = `${rect.left}px`;
        panel.style.top = `${rect.top}px`;
        panel.style.right = "auto";
        panel.style.bottom = "auto";
        handle.setPointerCapture?.(event.pointerId);
        event.preventDefault();
      });
      handle.addEventListener("pointermove", (event) => {
        if (!dragging) return;
        const deltaX = event.clientX - startX;
        const deltaY = event.clientY - startY;
        if (Math.abs(deltaX) + Math.abs(deltaY) > 3) moved = true;
        const nextLeft = Math.max(0, Math.min(window.innerWidth - 36, startLeft + deltaX));
        const nextTop = Math.max(0, Math.min(window.innerHeight - 36, startTop + deltaY));
        panel.style.left = `${nextLeft}px`;
        panel.style.top = `${nextTop}px`;
        event.preventDefault();
      });
      const stopDrag = () => {
        if (!dragging) return;
        dragging = false;
        if (panel.classList.contains("icon-only") && !moved) {
          panel.dataset.dragJustEnded = "1";
          panel.classList.remove("icon-only");
          const optionsToggle = document.querySelector("#bronze-loop-options-toggle");
          if (optionsToggle) {
            optionsToggle.textContent = "Options";
            optionsToggle.title = "Show advanced options";
          }
          resetPanelSize(panel);
          setTimeout(() => {
            delete panel.dataset.dragJustEnded;
          }, 150);
          savePanelPos(panel);
          return;
        }
        if (moved) {
          panel.dataset.dragJustEnded = "1";
          setTimeout(() => {
            delete panel.dataset.dragJustEnded;
          }, 150);
        }
        savePanelPos(panel);
      };
      handle.addEventListener("pointerup", stopDrag);
      handle.addEventListener("pointercancel", stopDrag);
    }
    function makePanelResizable(panel) {
      const EDGE_PAD = 20;
      const DIRS = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
      let resizing = null;
      const onMove = (event) => {
        if (!resizing) return;
        const dx = event.clientX - resizing.startX;
        const dy = event.clientY - resizing.startY;
        const dir = resizing.dir;
        let newLeft = resizing.startLeft;
        let newTop = resizing.startTop;
        let newWidth = resizing.startWidth;
        let newHeight = resizing.startHeight;
        const minWidth = Number(panel.dataset.minWidth || 300);
        const minHeight = Number(panel.dataset.minHeight || 178);
        if (dir.includes("e")) newWidth = Math.max(minWidth, resizing.startWidth + dx);
        if (dir.includes("s")) newHeight = Math.max(minHeight, resizing.startHeight + dy);
        if (dir.includes("w")) {
          newWidth = Math.max(minWidth, resizing.startWidth - dx);
          if (newWidth > minWidth) newLeft = resizing.startLeft + (resizing.startWidth - newWidth);
        }
        if (dir.includes("n")) {
          newHeight = Math.max(minHeight, resizing.startHeight - dy);
          if (newHeight > minHeight) newTop = resizing.startTop + (resizing.startHeight - newHeight);
        }
        const maxW = window.innerWidth - EDGE_PAD;
        const maxH = window.innerHeight - EDGE_PAD;
        if (newWidth > maxW) {
          const overflow = newWidth - maxW;
          newWidth = maxW;
          if (dir.includes("w")) newLeft += overflow;
        }
        if (newHeight > maxH) {
          const overflow = newHeight - maxH;
          newHeight = maxH;
          if (dir.includes("n")) newTop += overflow;
        }
        newLeft = Math.max(0, Math.min(window.innerWidth - newWidth, newLeft));
        newTop = Math.max(0, Math.min(window.innerHeight - newHeight, newTop));
        panel.style.left = `${newLeft}px`;
        panel.style.top = `${newTop}px`;
        panel.style.width = `${newWidth}px`;
        panel.style.height = `${newHeight}px`;
        event.preventDefault();
      };
      const onUp = () => {
        if (!resizing) return;
        resizing = null;
        savePanelPos(panel);
      };
      DIRS.forEach((dir) => {
        const el = panel.querySelector(`#bronze-loop-resize-${dir}`);
        if (!el) return;
        el.addEventListener("pointerdown", (event) => {
          if (panel.classList.contains("icon-only")) return;
          const rect = panel.getBoundingClientRect();
          panel.style.left = `${rect.left}px`;
          panel.style.top = `${rect.top}px`;
          panel.style.right = "auto";
          panel.style.bottom = "auto";
          panel.style.width = `${rect.width}px`;
          panel.style.height = `${rect.height}px`;
          resizing = {
            dir,
            startX: event.clientX,
            startY: event.clientY,
            startLeft: rect.left,
            startTop: rect.top,
            startWidth: rect.width,
            startHeight: rect.height
          };
          el.setPointerCapture?.(event.pointerId);
          event.preventDefault();
        });
        el.addEventListener("pointermove", onMove);
        el.addEventListener("pointerup", onUp);
        el.addEventListener("pointercancel", onUp);
      });
    }
    function installPanel() {
      if (document.querySelector("#bronze-loop-panel")) return;
      document.querySelector("#bronze-loop-style")?.remove();
      const style = document.createElement("style");
      style.id = "bronze-loop-style";
      style.textContent = `
      #bronze-loop-panel {
        position: fixed;
        right: 10px;
        bottom: 10px;
        z-index: 999999;
        width: 300px;
        height: 178px;
        min-width: 300px;
        min-height: 178px;
        display: flex;
        flex-direction: column;
        background: #15181d;
        border: 1px solid #5b6f8f;
        color: #f4f6f8;
        font: 12px Arial, sans-serif;
        padding: 8px;
        box-shadow: 0 8px 30px rgba(0,0,0,.35);
        box-sizing: border-box;
      }
      #bronze-loop-panel .panel-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
      .bronze-loop-resize {
        position: absolute;
        z-index: 2;
        touch-action: none;
      }
      #bronze-loop-resize-n { top: -3px; left: 12px; right: 12px; height: 6px; cursor: ns-resize; }
      #bronze-loop-resize-s { bottom: -3px; left: 12px; right: 12px; height: 6px; cursor: ns-resize; }
      #bronze-loop-resize-e { top: 12px; bottom: 12px; right: -3px; width: 6px; cursor: ew-resize; }
      #bronze-loop-resize-w { top: 12px; bottom: 12px; left: -3px; width: 6px; cursor: ew-resize; }
      #bronze-loop-resize-ne { top: -3px; right: -3px; width: 12px; height: 12px; cursor: nesw-resize; }
      #bronze-loop-resize-nw { top: -3px; left: -3px; width: 12px; height: 12px; cursor: nwse-resize; }
      #bronze-loop-resize-se { bottom: -3px; right: -3px; width: 12px; height: 12px; cursor: nwse-resize; }
      #bronze-loop-resize-sw { bottom: -3px; left: -3px; width: 12px; height: 12px; cursor: nesw-resize; }
      #bronze-loop-panel.icon-only .bronze-loop-resize { display: none; }
      #bronze-loop-panel.icon-only {
        width: 36px;
        height: 36px;
        min-width: 0;
        min-height: 0;
        padding: 0;
        background: rgba(12,15,19,.72);
        border: 1px solid #78a6ff;
        overflow: hidden;
        box-shadow: 0 4px 16px rgba(0,0,0,.28);
      }
      #bronze-loop-panel.icon-only .panel-body,
      #bronze-loop-panel.icon-only #bronze-loop-title,
      #bronze-loop-panel.icon-only #bronze-loop-options-toggle {
        display: none;
      }
      #bronze-loop-panel.icon-only #bronze-loop-drag {
        width: 34px;
        height: 34px;
        margin: 0;
        justify-content: center;
      }
      #bronze-loop-drag {
        cursor: move;
        user-select: none;
        justify-content: space-between;
      }
      #bronze-loop-title {
        font-weight: 700;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #bronze-loop-panel .row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
      #bronze-loop-panel button { min-width: 62px; height: 26px; cursor: pointer; font-size: 11px; background: #222832; color: #fff; border: 1px solid #607089; }
      #bronze-loop-panel button:disabled { opacity: .45; cursor: default; }
      #bronze-loop-collapse { min-width: 28px !important; width: 28px; padding: 0; }
      #bronze-loop-panel.icon-only #bronze-loop-collapse {
        min-width: 34px !important;
        width: 34px;
        height: 34px;
        border: 0;
        background: transparent;
        color: #78a6ff;
        font-weight: 700;
      }
      #bronze-loop-options-toggle { min-width: 58px; }
      #bronze-loop-panel input { width: 54px; height: 24px; background: #222832; color: #fff; border: 1px solid #607089; box-sizing: border-box; }
      #bronze-loop-panel input[type="checkbox"] { width: 14px; height: 14px; accent-color: #78a6ff; }
      #bronze-loop-panel label { cursor: pointer; user-select: none; }
      #bronze-loop-panel select {
        flex: 1;
        min-width: 0;
        height: 28px;
        background: #222832;
        color: #fff;
        border: 1px solid #607089;
      }
      #bronze-loop-latest {
        min-height: 28px;
        max-height: 44px;
        overflow: hidden;
        background: #0c0f13;
        border: 1px solid #303946;
        padding: 6px;
        line-height: 16px;
        color: #d7e2f0;
        word-break: break-word;
        user-select: text;
        -webkit-user-select: text;
        cursor: text;
      }
      #bronze-loop-options {
        display: none;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid #303946;
      }
      #bronze-loop-panel.options-open #bronze-loop-options {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: 0;
        overflow: hidden;
      }
      #bronze-loop-panel.options-open #bronze-loop-latest {
        display: none;
      }
      .bronze-loop-section {
        color: #9fb2c9;
        font-size: 11px;
        margin: 8px 0 6px;
      }
      #bronze-loop-json {
        display: none;
        width: 100%;
        height: 170px;
        min-height: 60px;
        flex-shrink: 1;
        box-sizing: border-box;
        margin-bottom: 8px;
        background: #0c0f13;
        color: #f4f6f8;
        border: 1px solid #303946;
        font: 11px Consolas, monospace;
        padding: 8px;
      }
      #bronze-loop-json.show { display: block; }
      #bronze-loop-log {
        flex: 1 1 0;
        min-height: 100px;
        overflow: auto;
        white-space: pre-wrap;
        background: #0c0f13;
        border: 1px solid #303946;
        padding: 8px;
        box-sizing: border-box;
        user-select: text;
        -webkit-user-select: text;
        cursor: text;
      }
      #bronze-loop-log .bronze-loop-log-high-rated {
        color: #ffd54a;
        font-weight: 700;
      }
    `;
      document.head.appendChild(style);
      const panel = document.createElement("div");
      panel.id = "bronze-loop-panel";
      panel.innerHTML = `
      <div class="row" id="bronze-loop-drag">
        <span id="bronze-loop-title">Loop Runner</span>
        <button id="bronze-loop-options-toggle" title="Options">Options</button>
        <button id="bronze-loop-collapse" title="Compact">L</button>
      </div>
      <div class="panel-body">
        <div class="row">
          <select id="bronze-loop-select"></select>
        </div>
        <div class="row">
          <button id="bronze-loop-start">Start</button>
          <button id="bronze-loop-stop" disabled>Stop</button>
          <button id="bronze-loop-recap-reopen" style="display:none" title="View last Player Pick recap">View recap</button>
        </div>
        <div id="bronze-loop-latest">Ready.</div>
        <div id="bronze-loop-options">
          <div class="bronze-loop-section">Run options</div>
          <div class="row">
            <label id="bronze-loop-dry-run-label" title="Log planned selections without moving items, opening packs, or submitting SBCs">
              <input id="bronze-loop-dry-run" type="checkbox"> Dry run
            </label>
            <label title="Open reward packs automatically when a loop supports it">
              <input id="bronze-loop-open-rewards" type="checkbox"> Open reward packs
            </label>
          </div>
          <div class="row">
            <label title="Show MVP and one-run validation loops in the main selector">
              <input id="bronze-loop-show-mvp" type="checkbox"> Show MVP loops
            </label>
          </div>
          <div class="row">
            <label title="Player Pick SBCs will not submit normal gold players at or above this rating">
              <input id="bronze-loop-pick-protect-high-gold" type="checkbox"> Protect Pick fodder >=
              <input id="bronze-loop-pick-high-gold-threshold" type="number" min="2" max="99" value="82">
            </label>
            <label title="Player Picks whose candidates are all below this rating will be selected automatically">
              <input id="bronze-loop-pick-auto-below-90" type="checkbox"> Auto-pick below
              <input id="bronze-loop-pick-auto-threshold" type="number" min="1" max="99" value="90">
            </label>
          </div>
          <div class="row" id="bronze-loop-rounds-row">
            <span id="bronze-loop-rounds-label">rounds</span>
            <input id="bronze-loop-rounds" type="number" min="1" max="50" value="${CFG.maxRounds}">
          </div>
          <div class="bronze-loop-section">Config</div>
          <div class="row">
            <button id="bronze-loop-refresh">Refresh caches</button>
            <button id="bronze-loop-load-json">Load loops JSON</button>
          </div>
          <div class="row">
            <button id="bronze-loop-built-in" disabled>Built-in loops</button>
            <button id="bronze-loop-edit">Edit JSON</button>
          </div>
          <textarea id="bronze-loop-json" spellcheck="false"></textarea>
          <div class="bronze-loop-section">Log</div>
          <div class="row">
            <button id="bronze-loop-copy">Copy log</button>
            <button id="bronze-loop-clear">Clear log</button>
            <button id="bronze-loop-download">Save log</button>
          </div>
          <div id="bronze-loop-log"></div>
        </div>
      </div>
      <div class="bronze-loop-resize" id="bronze-loop-resize-n"></div>
      <div class="bronze-loop-resize" id="bronze-loop-resize-s"></div>
      <div class="bronze-loop-resize" id="bronze-loop-resize-e"></div>
      <div class="bronze-loop-resize" id="bronze-loop-resize-w"></div>
      <div class="bronze-loop-resize" id="bronze-loop-resize-ne"></div>
      <div class="bronze-loop-resize" id="bronze-loop-resize-nw"></div>
      <div class="bronze-loop-resize" id="bronze-loop-resize-se"></div>
      <div class="bronze-loop-resize" id="bronze-loop-resize-sw"></div>
    `;
      document.body.appendChild(panel);
      state.logRenderer = createLogRenderer({
        getLines: () => state.logLines,
        getPanel: () => document.querySelector("#bronze-loop-panel"),
        getLatestBox: () => document.querySelector("#bronze-loop-latest"),
        getFullBox: () => document.querySelector("#bronze-loop-log"),
        formatFullLog: (lines) => formatLogHtml(lines, escapeHtml)
      });
      const savedLoopUiOptions = loadLoopUiOptions();
      state.showMvpLoops = savedLoopUiOptions.showMvpLoops;
      document.querySelector("#bronze-loop-show-mvp").checked = state.showMvpLoops;
      const savedPickOptions = loadPickRuntimeOptions();
      document.querySelector("#bronze-loop-pick-protect-high-gold").checked = savedPickOptions.protectHighGold;
      document.querySelector("#bronze-loop-pick-auto-below-90").checked = savedPickOptions.autoSelectBelow90;
      document.querySelector("#bronze-loop-pick-high-gold-threshold").value = savedPickOptions.highGoldThreshold;
      document.querySelector("#bronze-loop-pick-auto-threshold").value = savedPickOptions.autoPickThreshold;
      const savedPos = getSavedPanelPos();
      if (savedPos && Number.isFinite(savedPos.left) && Number.isFinite(savedPos.top)) {
        panel.style.left = `${Math.max(0, Math.min(window.innerWidth - 80, savedPos.left))}px`;
        panel.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, savedPos.top))}px`;
        panel.style.right = "auto";
        panel.style.bottom = "auto";
      }
      resetPanelSize(panel);
      makePanelDraggable(panel);
      makePanelResizable(panel);
      renderLoopSelect();
      renderLog();
      document.querySelector("#bronze-loop-collapse").addEventListener("click", (event) => {
        if (panel.dataset.dragJustEnded === "1") {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        panel.classList.toggle("icon-only");
        if (panel.classList.contains("icon-only")) {
          panel.classList.remove("options-open");
          const optionsToggle = document.querySelector("#bronze-loop-options-toggle");
          optionsToggle.textContent = "Options";
          optionsToggle.title = "Show advanced options";
          panel.style.width = "";
          panel.style.height = "";
        } else {
          resetPanelSize(panel);
        }
        const collapseButton = document.querySelector("#bronze-loop-collapse");
        collapseButton.textContent = "L";
        collapseButton.title = panel.classList.contains("icon-only") ? "Restore panel" : "Collapse to icon";
        renderLog();
        savePanelPos(panel);
      });
      document.querySelector("#bronze-loop-options-toggle").addEventListener("click", () => {
        panel.classList.toggle("options-open");
        const optionsToggle = document.querySelector("#bronze-loop-options-toggle");
        const optionsOpen = panel.classList.contains("options-open");
        optionsToggle.textContent = optionsOpen ? "Hide" : "Options";
        optionsToggle.title = optionsOpen ? "Hide advanced options" : "Show advanced options";
        resetPanelSize(panel);
        renderLog();
        savePanelPos(panel);
      });
      document.querySelector("#bronze-loop-select").addEventListener("change", (event) => {
        const selectedId = event.target.value;
        if (selectedId !== "custom") setLoopJson(getLoopDefById(selectedId));
        updateLoopControls();
      });
      document.querySelector("#bronze-loop-edit").addEventListener("click", () => {
        const editor = document.querySelector("#bronze-loop-json");
        editor.classList.toggle("show");
        if (editor.classList.contains("show")) {
          document.querySelector("#bronze-loop-select").value = "custom";
        }
        updateLoopControls();
      });
      document.querySelector("#bronze-loop-json").addEventListener("input", () => {
        updateLoopControls();
      });
      document.querySelector("#bronze-loop-pick-protect-high-gold").addEventListener("change", savePickRuntimeOptions);
      document.querySelector("#bronze-loop-pick-auto-below-90").addEventListener("change", savePickRuntimeOptions);
      document.querySelector("#bronze-loop-pick-high-gold-threshold").addEventListener("change", savePickRuntimeOptions);
      document.querySelector("#bronze-loop-pick-auto-threshold").addEventListener("change", savePickRuntimeOptions);
      document.querySelector("#bronze-loop-show-mvp").addEventListener("change", saveLoopUiOptions);
      document.querySelector("#bronze-loop-start").addEventListener("click", startLoop);
      document.querySelector("#bronze-loop-recap-reopen").addEventListener("click", reopenLastPickRecap);
      updateRecapButton();
      document.querySelector("#bronze-loop-refresh").addEventListener("click", async () => {
        if (state.running || state.refreshing) return;
        state.refreshing = true;
        setPanelState();
        try {
          await refreshInventoryCaches("manual button");
        } catch (e) {
          log(`Cache refresh failed: ${e.message || e}`);
        } finally {
          state.refreshing = false;
          setPanelState();
        }
      });
      document.querySelector("#bronze-loop-load-json").addEventListener("click", async () => {
        if (state.running || state.loadingLoops) return;
        state.loadingLoops = true;
        setPanelState();
        try {
          log(`Loading loop definitions from ${LOOP_CONFIG_URL}`);
          await loadLoopConfig(LOOP_CONFIG_URL);
        } catch (e) {
          log(`Loop JSON load failed: ${e.message || e}`);
        } finally {
          state.loadingLoops = false;
          setPanelState();
        }
      });
      document.querySelector("#bronze-loop-built-in").addEventListener("click", () => {
        if (state.running || state.loadingLoops) return;
        resetLoopDefs();
        setPanelState();
      });
      document.querySelector("#bronze-loop-stop").addEventListener("click", () => {
        state.stopping = true;
        log("Stop requested; waiting for current safe point");
        setPanelState();
      });
      document.querySelector("#bronze-loop-copy").addEventListener("click", async () => {
        const text = state.logLines.join("\n");
        try {
          await navigator.clipboard.writeText(text);
          log("Log copied to clipboard");
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
          log("Log copied to clipboard");
        }
      });
      document.querySelector("#bronze-loop-clear").addEventListener("click", clearLog);
      document.querySelector("#bronze-loop-download").addEventListener("click", () => {
        const blob = new Blob([state.logLines.join("\n")], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `bronze-loop-${Date.now()}.log`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        log("Log download created");
      });
      log(`Ready v${W[APP_KEY]?.version || "unknown"}. Keep FSU/Enhancer enabled before starting.`);
    }
    state.bootTimer = setInterval(() => {
      if (document.body && isFutAppReady()) {
        clearInterval(state.bootTimer);
        state.bootTimer = null;
        installPanel();
      }
    }, 500);
  })();
})();
