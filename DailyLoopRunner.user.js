// ==UserScript==
// @name         FC26 Daily Loop Runner - Validation
// @namespace    local.fc26.validation
// @version      0.5.53
// @description  Configurable FC26 Web App loop runner for pack/SBC validation flows.
// @match        https://www.ea.com/ea-sports-fc/ultimate-team/web-app/*
// @match        https://www.easports.com/*/ea-sports-fc/ultimate-team/web-app/*
// @match        https://www.ea.com/*/ea-sports-fc/ultimate-team/web-app/*
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      127.0.0.1
// @connect      localhost
// @connect      www.fut.gg
// @connect      enhancer-api.futnext.com
// @connect      ntfy.sh
// @run-at       document-end
// ==/UserScript==

(() => {
  // src/config/runtime.js
  var APP_KEY = "__FCLoopRunner";
  var LOOP_CONFIG_URL = "http://127.0.0.1:8765/DailyLoopRunner.loops.json";
  var PICK_OPTIONS_KEY = "fc-loop-runner-pick-options";
  var LOOP_UI_OPTIONS_KEY = "fc-loop-runner-ui-options";
  var REWARD_ALERT_SETTINGS_KEY = "fc-loop-runner-reward-alert-settings";
  var BATCH_OPEN_PLAN_KEY = "fc-loop-runner-batch-open-plan";
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

  // src/config/loops.js
  var LOOP_DEFS = [
    {
      id: "bronze-upgrade-validation",
      hidden: true,
      mvp: true,
      name: "Bronze Upgrade Validation",
      strategy: "validationBronzeUpgrade",
      sourcePackIds: [105],
      sourcePackNames: CFG.sourcePackNames,
      sbcNames: CFG.bronzeUpgradeNames,
      rewardPackNames: CFG.silverRewardNames,
      targetDuplicate: { tier: "bronze", playerOnly: true, allowSpecial: false },
      maxRounds: 3,
      runtimeQuantity: { mode: "user", target: "validationRounds", default: 3, min: 1, max: 50, label: "Validation runs" }
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
      maxCompletions: 7,
      inventoryMode: "inherit"
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
      maxCompletions: 1,
      inventoryMode: "inherit"
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
      maxCompletions: 7,
      inventoryMode: "inherit"
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
      maxCompletions: 1,
      inventoryMode: "inherit"
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
      maxPacks: 100,
      maxCompletions: 1,
      useRoundsAsCompletions: true,
      runtimeQuantity: { mode: "user", target: "maxCompletions", default: 3, min: 1, max: 50, label: "SBC completions" },
      consumeAllSourcePacks: true,
      sourceExhaustedFallbackLoopId: "2x84-fodder"
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
      name: "One-click Daily Loop",
      strategy: "dailyRoutine",
      steps: ["daily-bronze", "daily-silver", "daily-common", "daily-rare", "daily-rare-pack-84"],
      stepOverrides: {
        "daily-rare-pack-84": {
          useRoundsAsCompletions: false,
          sourceExhaustedFallbackMaxCompletions: 1
        }
      },
      openRewardPacks: false
    },
    {
      id: "inventory-fodder-exhaustion",
      name: "Bronze/Silver/FOF Glory Hunters Exhaustion Loop",
      strategy: "inventoryExhaustion",
      openRewardPacksAtEnd: true,
      rewardPackNames: [
        "5x 80+ Rare Gold Players Pack",
        "5 x 80+ Rare Gold Players Pack",
        "x1 5x 80+ Rare Gold Players Pack",
        "5x80+ Rare Gold Players Pack",
        "5x 80+ Rare Gold Players Pack (Untradeable)"
      ],
      stages: [
        {
          id: "bronze-upgrade",
          name: "Bronze Upgrade",
          sbcNames: ["Bronze Upgrade", "\u9752\u94DC\u5347\u7EA7", "\u9752\u9285\u5347\u7D1A"],
          requirements: [
            { tier: "bronze", count: 11, playerOnly: true, allowSpecial: false, priorityPiles: ["unassigned", "storage", "transfer", "club"] }
          ],
          priorityPiles: ["unassigned", "storage", "transfer", "club"],
          maxCompletions: 1e3,
          openRewardPacks: true,
          forceOpenRewardPacks: true
        },
        {
          id: "silver-upgrade",
          name: "Silver Upgrade",
          sbcNames: ["Silver Upgrade", "\u767D\u94F6\u5347\u7EA7", "\u767D\u9280\u5347\u7D1A"],
          requirements: [
            { tier: "silver", count: 11, playerOnly: true, allowSpecial: false, priorityPiles: ["unassigned", "storage", "transfer", "club"] }
          ],
          priorityPiles: ["unassigned", "storage", "transfer", "club"],
          maxCompletions: 1e3,
          openRewardPacks: true,
          forceOpenRewardPacks: true
        },
        {
          id: "fof-glory-hunters",
          name: "FOF Glory Hunters Crafting Upgrade",
          sbcNames: ["FOF Glory Hunters Crafting Upgrade"],
          requirements: [
            {
              tier: "gold",
              rarity: "common",
              count: 9,
              maxRating: 81,
              playerOnly: true,
              allowSpecial: false,
              protectHighGold: true,
              priorityPiles: ["unassigned", "storage", "transfer", "club"]
            }
          ],
          priorityPiles: ["unassigned", "storage", "transfer", "club"],
          maxCompletions: 1e3
        }
      ]
    },
    {
      id: "fof-glory-hunters-exhaustion",
      name: "FOF Glory Hunters Exhaustion Loop",
      strategy: "inventoryExhaustion",
      openRewardPacksAtEnd: true,
      rewardPackNames: [
        "5x 80+ Rare Gold Players Pack",
        "5 x 80+ Rare Gold Players Pack",
        "x1 5x 80+ Rare Gold Players Pack",
        "5x80+ Rare Gold Players Pack",
        "5x 80+ Rare Gold Players Pack (Untradeable)"
      ],
      stages: [
        {
          id: "fof-glory-hunters",
          name: "FOF Glory Hunters Crafting Upgrade",
          sbcNames: ["FOF Glory Hunters Crafting Upgrade"],
          requirements: [
            {
              tier: "gold",
              rarity: "common",
              count: 9,
              maxRating: 81,
              playerOnly: true,
              allowSpecial: false,
              protectHighGold: true,
              priorityPiles: ["unassigned", "storage", "transfer", "club"]
            }
          ],
          priorityPiles: ["unassigned", "storage", "transfer", "club"],
          maxCompletions: 1e3
        }
      ]
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
      runtimeQuantity: { mode: "user", target: "maxCompletions", default: 3, min: 1, max: 50, label: "SBC completions" },
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
      openRewardPacks: true
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
      runtimeQuantity: { mode: "user", target: "maxCompletions", default: 3, min: 1, max: 50, label: "SBC completions" },
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
      name: "84x10 Loop",
      strategy: "fillAndVerifySbc",
      sbcNames: [
        "84+ x10",
        "84+ x 10",
        "10x 84+ Upgrade",
        "10 x 84+ Upgrade",
        "10 \u540D 84+ \u5347\u7EA7",
        "10\u540D84+\u5347\u7EA7"
      ],
      maxCompletions: 50,
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
      preCraftPlayerPick: {
        sbcSetIds: [1256],
        pickItemResourceIds: [5005713]
      },
      rounds: 1,
      runtimeQuantity: { mode: "user", target: "rounds", default: 1, min: 1, max: 50, label: "Provision packs" },
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

  // src/config/selection.js
  function selectionRequirements(loopDef = {}, priorityPiles = loopDef.priorityPiles) {
    return (loopDef.requirements || []).map((requirement) => {
      const protectHighGold = requirement.protectHighGold === true || loopDef.protectHighGold === true;
      const highGoldThreshold = Number(
        requirement.highGoldThreshold ?? requirement.protectHighGoldMinRating ?? loopDef.pickHighGoldThreshold ?? 82
      );
      return {
        ...requirement,
        protectHighGold: requirement.protectHighGold !== void 0 ? requirement.protectHighGold : loopDef.protectHighGold,
        highGoldThreshold: protectHighGold ? Math.max(2, Math.min(99, Number.isFinite(highGoldThreshold) && highGoldThreshold > 0 ? highGoldThreshold : 82)) : requirement.highGoldThreshold,
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
      };
    });
  }
  function createSingleCardSelectionRequirement(loopDef = {}, cardSpec = {}, defaultPriorityPiles = ["storage", "transfer", "club"]) {
    const configuredPiles = Array.isArray(loopDef.priorityPiles) && loopDef.priorityPiles.length ? loopDef.priorityPiles : defaultPriorityPiles;
    const disabledPiles = new Set(loopDef.disabledPiles || []);
    const priorityPiles = configuredPiles.filter((pile) => !disabledPiles.has(pile));
    if (!priorityPiles.length) throw new Error(`${loopDef.name || "single-card selection"} has no enabled inventory pile`);
    const [requirement] = selectionRequirements({
      ...loopDef,
      requirements: [{ ...cardSpec, count: 1, priorityPiles }]
    }, priorityPiles);
    if (!requirement) throw new Error(`${loopDef.name || "single-card selection"} has no card requirement`);
    return { requirement, priorityPiles };
  }

  // src/domain/objects.js
  function cloneLoopDef(definition) {
    return JSON.parse(JSON.stringify(definition));
  }
  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  // src/config/loop-presentation.js
  function isMvpLoopDef(definition = {}) {
    return definition.mvp === true || /(?:^|-)mvp(?:-|$)/i.test(String(definition.id || ""));
  }
  function visibleLoopDefs(loopDefs = [], showMvpLoops = false) {
    return (loopDefs || []).filter((definition) => {
      if (isMvpLoopDef(definition)) return showMvpLoops === true;
      return definition.hidden !== true;
    });
  }
  function filterPileList(piles, disabledPiles, path) {
    if (!Array.isArray(piles) || !piles.length || !disabledPiles?.size) return piles;
    const filtered = piles.filter((pile) => !disabledPiles.has(pile));
    if (!filtered.length) throw new Error(`${path} has no enabled piles after disabledPiles`);
    return filtered;
  }
  function filterRequirements(requirements, disabledPiles, path) {
    if (!Array.isArray(requirements)) return;
    requirements.forEach((requirement, index) => {
      requirement.priorityPiles = filterPileList(
        requirement.priorityPiles,
        disabledPiles,
        `${path}[${index}].priorityPiles`
      );
    });
  }
  function applyDisabledPiles(loopDef) {
    const disabledPiles = new Set(loopDef?.disabledPiles || []);
    if (!disabledPiles.size) return loopDef;
    loopDef.priorityPiles = filterPileList(loopDef.priorityPiles, disabledPiles, "priorityPiles");
    loopDef.primaryPiles = filterPileList(loopDef.primaryPiles, disabledPiles, "primaryPiles");
    loopDef.clubFallbackPiles = filterPileList(loopDef.clubFallbackPiles, disabledPiles, "clubFallbackPiles");
    if (isPlainObject(loopDef.ratingSbcFill)) {
      loopDef.ratingSbcFill.priorityPiles = filterPileList(
        loopDef.ratingSbcFill.priorityPiles,
        disabledPiles,
        "ratingSbcFill.priorityPiles"
      );
    }
    filterRequirements(loopDef.requirements, disabledPiles, "requirements");
    (loopDef.challengeRequirements || []).forEach((requirements, index) => {
      filterRequirements(requirements, disabledPiles, `challengeRequirements[${index}]`);
    });
    for (const upgradeName of ["commonUpgrade", "rareUpgrade"]) {
      const upgradeDef = loopDef[upgradeName];
      if (!isPlainObject(upgradeDef)) continue;
      upgradeDef.priorityPiles = filterPileList(upgradeDef.priorityPiles, disabledPiles, `${upgradeName}.priorityPiles`);
      filterRequirements(upgradeDef.requirements, disabledPiles, `${upgradeName}.requirements`);
      (upgradeDef.challengeRequirements || []).forEach((requirements, index) => {
        filterRequirements(requirements, disabledPiles, `${upgradeName}.challengeRequirements[${index}]`);
      });
    }
    (loopDef.craftingUpgrades || []).forEach((upgradeDef, index) => {
      if (!isPlainObject(upgradeDef)) return;
      upgradeDef.priorityPiles = filterPileList(upgradeDef.priorityPiles, disabledPiles, `craftingUpgrades[${index}].priorityPiles`);
      filterRequirements(upgradeDef.requirements, disabledPiles, `craftingUpgrades[${index}].requirements`);
      (upgradeDef.challengeRequirements || []).forEach((requirements, challengeIndex) => {
        filterRequirements(requirements, disabledPiles, `craftingUpgrades[${index}].challengeRequirements[${challengeIndex}]`);
      });
    });
    (loopDef.stages || []).forEach((stageDef, index) => {
      if (!isPlainObject(stageDef)) return;
      stageDef.priorityPiles = filterPileList(stageDef.priorityPiles, disabledPiles, `stages[${index}].priorityPiles`);
      filterRequirements(stageDef.requirements, disabledPiles, `stages[${index}].requirements`);
      (stageDef.challengeRequirements || []).forEach((requirements, challengeIndex) => {
        filterRequirements(requirements, disabledPiles, `stages[${index}].challengeRequirements[${challengeIndex}]`);
      });
    });
    return loopDef;
  }

  // src/config/run-limits.js
  function getPlayerPickChallengeCount(loopDef = {}) {
    return Math.max(1, Number(loopDef.challengeRequirements?.length || loopDef.challengesPerPick || 1) || 1);
  }
  function resolvePlayerPickRunTarget(loopDef = {}, options = {}) {
    if (loopDef.exhaustSbcSet !== true) {
      return {
        maxPicks: Math.max(1, Math.min(50, Math.floor(Number(loopDef.maxCompletions) || 1))),
        pendingCount: 0,
        remainingCompletions: null,
        usedSafetyLimit: false
      };
    }
    const pendingCount = Math.max(0, Math.floor(Number(options.pendingCount) || 0));
    const rawRemaining = options.remainingCompletions;
    const hasKnownRemaining = rawRemaining !== null && rawRemaining !== void 0 && Number.isFinite(Number(rawRemaining));
    const safetyLimit = Math.max(
      1,
      Math.min(100, Math.floor(Number(loopDef.setCompletionSafetyLimit) || 100))
    );
    const remainingCompletions2 = hasKnownRemaining ? Math.max(0, Math.floor(Number(rawRemaining))) : safetyLimit;
    return {
      maxPicks: Math.min(200, pendingCount + remainingCompletions2),
      pendingCount,
      remainingCompletions: remainingCompletions2,
      usedSafetyLimit: !hasKnownRemaining
    };
  }
  function getLiveRunLimit(loopDef = {}, rounds = 1, options = {}) {
    if (loopDef.strategy === "validationBronzeUpgrade") {
      return Number(rounds || loopDef.maxRounds || 1);
    }
    if (loopDef.strategy === "fillAndVerifySbc") {
      const completions = Number(loopDef.maxCompletions || 1);
      return completions + (options.needsAutoTotwPreflight?.(loopDef) ? completions : 0);
    }
    if (loopDef.strategy === "rarePackTo84Upgrade") {
      return loopDef.useRoundsAsCompletions === true ? Number(loopDef.maxCompletions || 1) : Number(loopDef.maxPacks || 100);
    }
    if (loopDef.strategy === "playerPickSbc") {
      const completions = loopDef.exhaustSbcSet === true ? Number(loopDef.remainingCompletions ?? loopDef.setCompletionSafetyLimit ?? 100) : Number(loopDef.maxCompletions || 1);
      return completions * getPlayerPickChallengeCount(loopDef);
    }
    if (loopDef.strategy === "dailyRoutine" || loopDef.strategy === "workflowRoutine") {
      return summarizeRoutineStepLimits(options.getRoutineSteps?.(loopDef) || [], options).max;
    }
    if (loopDef.strategy === "inventoryExhaustion") {
      return Math.max(1, ...(loopDef.stages || []).map((stage) => Number(stage.maxCompletions || 1e3)));
    }
    return Number(loopDef.maxCompletions || loopDef.rounds || loopDef.maxRounds || 1);
  }
  function summarizeRoutineStepLimits(steps = [], options = {}) {
    const limits = steps.map((step) => {
      const rawLimit = getLiveRunLimit(step, 1, options);
      const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.floor(rawLimit)) : 1;
      const unit = "SBC(s)";
      const policy = step.consumeAllSourcePacks === true ? "all matching source packs" : Number(step.dailyCompletionLimit) > 0 ? "current EA daily remaining" : `up to ${limit} ${unit}`;
      return {
        name: step.name || step.id || step.strategy || "step",
        limit,
        unit,
        policy
      };
    });
    return {
      limits,
      max: limits.reduce((maxLimit, step) => Math.max(maxLimit, step.limit), 1),
      total: limits.reduce((sum, step) => sum + step.limit, 0),
      text: limits.map((step) => `${step.name}: ${step.policy}`).join("; ")
    };
  }

  // src/domain/strategies.js
  var INVENTORY_ONLY_CAPABILITIES = Object.freeze({
    unsupported: "unsupported",
    supported: "supported",
    intrinsic: "intrinsic",
    container: "container"
  });
  var LOOP_STRATEGY_CAPABILITIES = Object.freeze({
    validationBronzeUpgrade: Object.freeze({ inventoryOnly: INVENTORY_ONLY_CAPABILITIES.unsupported }),
    dailySingleCardRecycle: Object.freeze({ inventoryOnly: INVENTORY_ONLY_CAPABILITIES.supported }),
    supplyAndCraft: Object.freeze({ inventoryOnly: INVENTORY_ONLY_CAPABILITIES.supported }),
    inventoryMixedUpgrade: Object.freeze({ inventoryOnly: INVENTORY_ONLY_CAPABILITIES.supported }),
    commonGoldToRareUpgrade: Object.freeze({ inventoryOnly: INVENTORY_ONLY_CAPABILITIES.supported }),
    provisionPackCrafting: Object.freeze({ inventoryOnly: INVENTORY_ONLY_CAPABILITIES.unsupported }),
    provisionPackDualCrafting: Object.freeze({ inventoryOnly: INVENTORY_ONLY_CAPABILITIES.unsupported }),
    rarePackTo84Upgrade: Object.freeze({ inventoryOnly: INVENTORY_ONLY_CAPABILITIES.unsupported }),
    playerPickSbc: Object.freeze({ inventoryOnly: INVENTORY_ONLY_CAPABILITIES.intrinsic }),
    dailyRoutine: Object.freeze({ inventoryOnly: INVENTORY_ONLY_CAPABILITIES.container }),
    workflowRoutine: Object.freeze({ inventoryOnly: INVENTORY_ONLY_CAPABILITIES.container }),
    fillAndVerifySbc: Object.freeze({ inventoryOnly: INVENTORY_ONLY_CAPABILITIES.intrinsic }),
    inventoryExhaustion: Object.freeze({ inventoryOnly: INVENTORY_ONLY_CAPABILITIES.intrinsic })
  });
  var LOOP_STRATEGIES = Object.freeze(Object.keys(LOOP_STRATEGY_CAPABILITIES));
  function getLoopStrategyCapabilities(strategy) {
    return LOOP_STRATEGY_CAPABILITIES[strategy] || Object.freeze({
      inventoryOnly: INVENTORY_ONLY_CAPABILITIES.unsupported
    });
  }

  // src/config/reward-flow.js
  var REWARD_OPEN_MODES = Object.freeze(["inherit", "always", "never"]);
  function validateNumberList(value, path, errors) {
    if (value === void 0) return;
    if (!Array.isArray(value) || !value.length) {
      errors.push(`${path} must be a non-empty array`);
      return;
    }
    value.forEach((entry, index) => {
      if (!Number.isFinite(Number(entry))) errors.push(`${path}[${index}] must be a number`);
    });
  }
  function validateStringList(value, path, errors) {
    if (value === void 0) return;
    if (!Array.isArray(value) || !value.length) {
      errors.push(`${path} must be a non-empty array`);
      return;
    }
    value.forEach((entry, index) => {
      if (typeof entry !== "string" || !entry.trim()) errors.push(`${path}[${index}] must be a non-empty string`);
    });
  }
  function validateRewardFlow(value, path, errors) {
    if (value === void 0) return;
    if (!isPlainObject(value)) {
      errors.push(`${path} must be an object`);
      return;
    }
    if (value.open !== void 0 && !REWARD_OPEN_MODES.includes(value.open)) {
      errors.push(`${path}.open must be one of: ${REWARD_OPEN_MODES.join(", ")}`);
    }
    validateNumberList(value.packIds, `${path}.packIds`, errors);
    validateStringList(value.packNames, `${path}.packNames`, errors);
    validateStringList(value.unassignedRecoveryPolicyIds, `${path}.unassignedRecoveryPolicyIds`, errors);
  }
  function applyRewardFlow(loopDef = {}, rewardFlow = loopDef.rewardFlow) {
    if (!isPlainObject(rewardFlow)) return loopDef;
    if (rewardFlow.open !== void 0) loopDef.rewardOpenMode = rewardFlow.open;
    if (rewardFlow.packIds?.length || rewardFlow.packNames?.length) {
      delete loopDef.rewardPackIds;
      delete loopDef.rewardPackNames;
      if (rewardFlow.packIds?.length) loopDef.rewardPackIds = [...rewardFlow.packIds];
      if (rewardFlow.packNames?.length) loopDef.rewardPackNames = [...rewardFlow.packNames];
    }
    if (rewardFlow.unassignedRecoveryPolicyIds) {
      loopDef.unassignedRecoveryPolicyIds = [...rewardFlow.unassignedRecoveryPolicyIds];
    }
    return loopDef;
  }
  function resolveRewardPackOpenEnabled(loopDef = {}, runtimeOpenEnabled = false) {
    const mode = loopDef.rewardOpenMode || loopDef.rewardFlow?.open || "inherit";
    if (loopDef.forceOpenRewardPacks === true) return true;
    if (mode === "never") return false;
    if (mode === "always") return true;
    return runtimeOpenEnabled === true;
  }

  // src/config/runtime-options.js
  var INVENTORY_MODES = Object.freeze(["inherit", "inventory-only", "normal"]);
  var RUNTIME_QUANTITY_MODES = Object.freeze(["user", "ea-remaining", "exhaust", "fixed"]);
  var RUNTIME_QUANTITY_TARGETS = Object.freeze([
    "maxCompletions",
    "rounds",
    "maxPacks",
    "validationRounds"
  ]);
  var PICK_OPTIONS_APPLIED = Symbol("pick-options-applied");
  function boundedNumber(value, fallback, min, max) {
    const parsed = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : fallback));
  }
  function pickOptionOverrides(input = {}) {
    if (!isPlainObject(input)) return {};
    const nested = isPlainObject(input.pickOptions) ? input.pickOptions : {};
    const result = {};
    const assign = (target, ...sources) => {
      const value = sources.find((entry) => entry !== void 0);
      if (value !== void 0) result[target] = value;
    };
    assign("protectHighGold", nested.protectHighGold, input.protectHighGold);
    assign("autoSelectBelow90", nested.autoSelectBelow90, nested.autoSelect, input.autoSelectBelow90);
    assign("preferScannedMetadata", nested.preferScannedMetadata, input.preferScannedMetadata);
    assign("openPicksAtEnd", nested.openPicksAtEnd, nested.openAtEnd, input.openPicksAtEnd);
    assign("highGoldThreshold", nested.highGoldThreshold, input.pickHighGoldThreshold, input.highGoldThreshold);
    assign("autoPickThreshold", nested.autoPickThreshold, input.autoPickRatingThreshold, input.autoPickThreshold);
    return result;
  }
  function normalizePickRuntimeOptions(input = {}) {
    const highGoldThreshold = Number(input.highGoldThreshold);
    const autoPickThreshold = Number(input.autoPickThreshold);
    return {
      protectHighGold: input.protectHighGold !== false,
      autoSelectBelow90: input.autoSelectBelow90 !== false,
      preferScannedMetadata: input.preferScannedMetadata === true,
      openPicksAtEnd: input.openPicksAtEnd === true,
      highGoldThreshold: boundedNumber(highGoldThreshold > 0 ? highGoldThreshold : 82, 82, 2, 99),
      autoPickThreshold: boundedNumber(autoPickThreshold > 0 ? autoPickThreshold : 90, 90, 1, 99)
    };
  }
  function resolvePickRuntimeOptions(globalOptions = {}, ...overrides) {
    const merged = { ...normalizePickRuntimeOptions(globalOptions) };
    for (const override of overrides) Object.assign(merged, pickOptionOverrides(override));
    return normalizePickRuntimeOptions(merged);
  }
  function requirementBusinessMaxRating(requirement = {}) {
    const saved = Number(requirement.maxRatingBeforeHighGoldProtection);
    if (Number.isFinite(saved)) return saved;
    const current = Number(requirement.maxRating);
    return requirement.highGoldProtectionMaxRating === true || !Number.isFinite(current) ? null : current;
  }
  function applyPickProtectionToRequirement(requirement, options) {
    const businessMaxRating = requirementBusinessMaxRating(requirement);
    requirement.protectHighGold = options.protectHighGold;
    if (!options.protectHighGold) {
      delete requirement.highGoldThreshold;
      if (businessMaxRating === null) delete requirement.maxRating;
      else requirement.maxRating = businessMaxRating;
      delete requirement.highGoldProtectionMaxRating;
      delete requirement.maxRatingBeforeHighGoldProtection;
      return;
    }
    const protectionMaxRating = options.highGoldThreshold - 1;
    requirement.highGoldThreshold = options.highGoldThreshold;
    requirement.highGoldProtectionMaxRating = true;
    if (businessMaxRating !== null) {
      requirement.maxRatingBeforeHighGoldProtection = businessMaxRating;
      requirement.maxRating = Math.min(businessMaxRating, protectionMaxRating);
    } else {
      delete requirement.maxRatingBeforeHighGoldProtection;
      requirement.maxRating = protectionMaxRating;
    }
  }
  function applyPickRuntimeOptions(loopDef, inheritedOptions = {}) {
    if (loopDef.strategy !== "playerPickSbc") return loopDef;
    const options = loopDef[PICK_OPTIONS_APPLIED] === true ? resolvePickRuntimeOptions(inheritedOptions, { pickOptions: loopDef.pickOptions }) : resolvePickRuntimeOptions(inheritedOptions, loopDef);
    Object.defineProperty(loopDef, PICK_OPTIONS_APPLIED, {
      configurable: true,
      enumerable: false,
      value: true
    });
    loopDef.protectHighGold = options.protectHighGold;
    loopDef.autoSelectBelow90 = options.autoSelectBelow90;
    loopDef.openPicksAtEnd = options.openPicksAtEnd;
    loopDef.pickHighGoldThreshold = options.highGoldThreshold;
    loopDef.autoPickRatingThreshold = options.autoPickThreshold;
    const requirementGroups = [loopDef.requirements, ...loopDef.challengeRequirements || []];
    requirementGroups.forEach((requirements) => (requirements || []).forEach((requirement) => {
      applyPickProtectionToRequirement(requirement, options);
    }));
    return loopDef;
  }
  function normalizeInventoryMode(value, fallback = "inherit") {
    if (value === true) return "inventory-only";
    if (value === false) return "normal";
    return INVENTORY_MODES.includes(value) ? value : fallback;
  }
  function configuredInventoryMode(config = {}) {
    if (!isPlainObject(config)) return "inherit";
    if (config.inventoryMode !== void 0) return normalizeInventoryMode(config.inventoryMode);
    if (config.inventoryOnly !== void 0) return normalizeInventoryMode(config.inventoryOnly);
    if (config.dailyRecycleInventoryOnly !== void 0) {
      return normalizeInventoryMode(config.dailyRecycleInventoryOnly);
    }
    return "inherit";
  }
  function resolveInventoryMode(globalMode = "normal", ...configs) {
    let resolved = normalizeInventoryMode(globalMode, "normal");
    if (resolved === "inherit") resolved = "normal";
    for (const config of configs) {
      const mode = configuredInventoryMode(config);
      if (mode !== "inherit") resolved = mode;
    }
    return resolved;
  }
  function applyInventoryMode(loopDef, inheritedMode = "normal") {
    const capability = getLoopStrategyCapabilities(loopDef.strategy).inventoryOnly;
    const resolvedMode = resolveInventoryMode(inheritedMode, loopDef);
    loopDef.runtimeInventoryMode = resolvedMode;
    if (capability === INVENTORY_ONLY_CAPABILITIES.container) return loopDef;
    if (capability === INVENTORY_ONLY_CAPABILITIES.unsupported) {
      loopDef.inventoryOnlyIgnored = resolvedMode === "inventory-only";
      return loopDef;
    }
    if (capability === INVENTORY_ONLY_CAPABILITIES.supported) {
      loopDef.inventoryOnly = resolvedMode === "inventory-only";
      if (loopDef.inventoryOnly) loopDef.openRewardPacks = false;
    }
    return loopDef;
  }
  function legacyRuntimeQuantity(loopDef = {}) {
    if (loopDef.useRoundsAsCompletions === true) {
      return {
        mode: "user",
        target: "maxCompletions",
        default: Number(loopDef.maxCompletions || 3),
        min: 1,
        max: 50,
        label: "Rounds"
      };
    }
    if (loopDef.strategy === "provisionPackCrafting" || loopDef.strategy === "provisionPackDualCrafting") {
      return {
        mode: "user",
        target: "rounds",
        default: Number(loopDef.rounds || 3),
        min: 1,
        max: 50,
        label: "Provision packs"
      };
    }
    if (loopDef.strategy === "validationBronzeUpgrade") {
      return {
        mode: "user",
        target: "validationRounds",
        default: Number(loopDef.maxRounds || 3),
        min: 1,
        max: 50,
        label: "Validation runs"
      };
    }
    return null;
  }
  function resolveRuntimeQuantity(loopDef = {}) {
    const configured = isPlainObject(loopDef.runtimeQuantity) ? loopDef.runtimeQuantity : legacyRuntimeQuantity(loopDef);
    if (!configured) return null;
    const mode = RUNTIME_QUANTITY_MODES.includes(configured.mode) ? configured.mode : "user";
    const target = RUNTIME_QUANTITY_TARGETS.includes(configured.target) ? configured.target : "maxCompletions";
    const min = Math.max(1, Math.floor(Number(configured.min) || 1));
    const max = Math.max(min, Math.min(1e3, Math.floor(Number(configured.max) || 50)));
    const fallback = target === "rounds" ? loopDef.rounds : target === "maxPacks" ? loopDef.maxPacks : target === "validationRounds" ? loopDef.maxRounds : loopDef.maxCompletions;
    const defaultValue = Math.floor(boundedNumber(configured.default, Number(fallback || min), min, max));
    return {
      mode,
      target,
      default: defaultValue,
      min,
      max,
      label: String(configured.label || "Rounds")
    };
  }
  function loopUsesRounds(loopDef = {}) {
    return resolveRuntimeQuantity(loopDef)?.mode === "user";
  }
  function applyRuntimeQuantity(loopDef, rawValue) {
    const quantity = resolveRuntimeQuantity(loopDef);
    if (!quantity || quantity.mode !== "user") return 1;
    const value = Math.floor(boundedNumber(rawValue, quantity.default, quantity.min, quantity.max));
    if (quantity.target === "validationRounds") loopDef.runtimeRounds = value;
    else loopDef[quantity.target] = value;
    return value;
  }
  function applyLoopRuntimeOptions(loopDef, options = {}) {
    const globalPickOptions = normalizePickRuntimeOptions(options.pickOptions);
    const resolvedPickOptions = resolvePickRuntimeOptions(globalPickOptions, loopDef);
    const globalInventoryMode = options.inventoryMode !== void 0 ? options.inventoryMode : options.inventoryOnly !== void 0 ? options.inventoryOnly : options.dailyRecycleInventoryOnly;
    const resolvedInventoryMode = resolveInventoryMode(globalInventoryMode === true ? "inventory-only" : globalInventoryMode === false || globalInventoryMode === void 0 ? "normal" : globalInventoryMode, loopDef);
    loopDef.dryRun = options.dryRun === true || loopDef.dryRun === true;
    applyRewardFlow(loopDef);
    loopDef.openRewardPacks = resolveRewardPackOpenEnabled(loopDef, options.openRewardPacks === true);
    loopDef.runtimePickOptions = resolvedPickOptions;
    loopDef.runtimeInventoryMode = resolvedInventoryMode;
    applyPickRuntimeOptions(loopDef, globalPickOptions);
    applyInventoryMode(loopDef, resolvedInventoryMode);
    applyRuntimeQuantity(loopDef, options.rounds);
    return loopDef;
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

  // src/config/loop-schema.js
  var INVENTORY_PILES = Object.freeze(["unassigned", "storage", "transfer", "club"]);
  function fail(message) {
    throw new Error(message);
  }
  function validateStringArray(value, path, errors, required2 = false) {
    if (value === void 0 || value === null) {
      if (required2) errors.push(`${path} is required`);
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
  function validatePileList(value, path, errors, required2 = false) {
    if (value === void 0 || value === null) {
      if (required2) errors.push(`${path} is required`);
      return;
    }
    if (!Array.isArray(value) || !value.length) {
      errors.push(`${path} must be a non-empty array`);
      return;
    }
    value.forEach((pile, index) => {
      if (!INVENTORY_PILES.includes(pile)) {
        errors.push(`${path}[${index}] must be one of: ${INVENTORY_PILES.join(", ")}`);
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
    ["minRating", "maxRating"].forEach((field2) => {
      if (spec[field2] === void 0) return;
      const rating = Number(spec[field2]);
      if (!Number.isFinite(rating) || rating < 1 || rating > 99) {
        errors.push(`${path}.${field2} must be a number between 1 and 99`);
      }
    });
    ["playerOnly", "allowSpecial", "special", "protectHighGold", "preferCommon"].forEach((field2) => {
      if (spec[field2] !== void 0 && typeof spec[field2] !== "boolean") {
        errors.push(`${path}.${field2} must be boolean`);
      }
    });
  }
  function validateRequirements(requirements, path, errors, required2 = false) {
    if (requirements === void 0 || requirements === null) {
      if (required2) errors.push(`${path} is required`);
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
    ["openRewardPacks", "forceOpenRewardPacks"].forEach((field2) => {
      if (upgradeDef[field2] !== void 0 && typeof upgradeDef[field2] !== "boolean") {
        errors.push(`${path}.${field2} must be boolean`);
      }
    });
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
  function normalizeRoutineStepId(step) {
    return typeof step === "string" ? step : step?.loopId;
  }
  function validateRoutineSteps(steps, path, errors) {
    const allowedFields = /* @__PURE__ */ new Set(["loopId", "name", "rewardFlow"]);
    if (!Array.isArray(steps) || !steps.length) {
      errors.push(`${path} must be a non-empty array`);
      return;
    }
    steps.forEach((step, index) => {
      const stepPath = `${path}[${index}]`;
      if (typeof step === "string") {
        if (!step.trim()) errors.push(`${stepPath} must be a non-empty string`);
        return;
      }
      if (!isPlainObject(step)) {
        errors.push(`${stepPath} must be a loop id string or an object`);
        return;
      }
      if (typeof step.loopId !== "string" || !step.loopId.trim()) {
        errors.push(`${stepPath}.loopId is required`);
      }
      if (step.name !== void 0 && (typeof step.name !== "string" || !step.name.trim())) {
        errors.push(`${stepPath}.name must be a non-empty string`);
      }
      Object.keys(step).forEach((field2) => {
        if (!allowedFields.has(field2)) errors.push(`${stepPath}.${field2} belongs on the referenced child loop definition`);
      });
      validateRewardFlow(step.rewardFlow, `${stepPath}.rewardFlow`, errors);
    });
  }
  function validatePickOptions(value, path, errors) {
    if (value === void 0) return;
    if (!isPlainObject(value)) {
      errors.push(`${path} must be an object`);
      return;
    }
    const allowedFields = /* @__PURE__ */ new Set([
      "protectHighGold",
      "highGoldThreshold",
      "autoSelect",
      "autoSelectBelow90",
      "autoPickThreshold",
      "openAtEnd",
      "openPicksAtEnd",
      "preferScannedMetadata"
    ]);
    Object.keys(value).forEach((field2) => {
      if (!allowedFields.has(field2)) errors.push(`${path}.${field2} is not supported`);
    });
    ["protectHighGold", "autoSelect", "autoSelectBelow90", "openAtEnd", "openPicksAtEnd", "preferScannedMetadata"].forEach((field2) => {
      if (value[field2] !== void 0 && typeof value[field2] !== "boolean") {
        errors.push(`${path}.${field2} must be boolean`);
      }
    });
    ["highGoldThreshold", "autoPickThreshold"].forEach((field2) => {
      if (value[field2] === void 0) return;
      const number = Number(value[field2]);
      if (!Number.isFinite(number) || number < 1 || number > 99) {
        errors.push(`${path}.${field2} must be a number between 1 and 99`);
      }
    });
  }
  function validateRuntimeQuantity(value, path, errors) {
    if (value === void 0) return;
    if (!isPlainObject(value)) {
      errors.push(`${path} must be an object`);
      return;
    }
    if (value.mode !== void 0 && !RUNTIME_QUANTITY_MODES.includes(value.mode)) {
      errors.push(`${path}.mode must be one of: ${RUNTIME_QUANTITY_MODES.join(", ")}`);
    }
    if (value.target !== void 0 && !RUNTIME_QUANTITY_TARGETS.includes(value.target)) {
      errors.push(`${path}.target must be one of: ${RUNTIME_QUANTITY_TARGETS.join(", ")}`);
    }
    ["default", "min", "max"].forEach((field2) => {
      if (value[field2] === void 0) return;
      const number = Number(value[field2]);
      if (!Number.isInteger(number) || number < 1 || number > 1e3) {
        errors.push(`${path}.${field2} must be an integer between 1 and 1000`);
      }
    });
    if (Number.isFinite(Number(value.min)) && Number.isFinite(Number(value.max)) && Number(value.min) > Number(value.max)) {
      errors.push(`${path}.min must not exceed ${path}.max`);
    }
    if (value.label !== void 0 && (typeof value.label !== "string" || !value.label.trim())) {
      errors.push(`${path}.label must be a non-empty string`);
    }
  }
  function validateLoopDef(loopDef, label = "loop") {
    const errors = [];
    if (!isPlainObject(loopDef)) return [`${label} must be an object`];
    if (typeof loopDef.name !== "string" || !loopDef.name.trim()) {
      errors.push("name is required");
    }
    if (typeof loopDef.strategy !== "string" || !loopDef.strategy.trim()) {
      errors.push("strategy is required");
    } else if (!LOOP_STRATEGIES.includes(loopDef.strategy)) {
      errors.push(`strategy must be one of: ${LOOP_STRATEGIES.join(", ")}`);
    }
    if (loopDef.dryRun !== void 0 && typeof loopDef.dryRun !== "boolean") {
      errors.push("dryRun must be boolean");
    }
    ["hidden", "mvp", "openRewardPacks", "openRewardPacksAtEnd", "blockSpecial", "blockTradeable", "inventoryFillFirst", "consumeAllSourcePacks", "exhaustSbcSet", "discoveryReportedCompleted"].forEach((field2) => {
      if (loopDef[field2] !== void 0 && typeof loopDef[field2] !== "boolean") {
        errors.push(`${field2} must be boolean`);
      }
    });
    validatePickOptions(loopDef.pickOptions, "pickOptions", errors);
    validateRuntimeQuantity(loopDef.runtimeQuantity, "runtimeQuantity", errors);
    if (loopDef.inventoryMode !== void 0 && !INVENTORY_MODES.includes(loopDef.inventoryMode)) {
      errors.push(`inventoryMode must be one of: ${INVENTORY_MODES.join(", ")}`);
    }
    if (loopDef.inventoryOnly !== void 0 && typeof loopDef.inventoryOnly !== "boolean") {
      errors.push("inventoryOnly must be boolean");
    }
    if (loopDef.dailyRecycleInventoryOnly !== void 0 && typeof loopDef.dailyRecycleInventoryOnly !== "boolean") {
      errors.push("dailyRecycleInventoryOnly must be boolean");
    }
    const hasInventoryMode = loopDef.inventoryMode !== void 0 || loopDef.inventoryOnly !== void 0 || loopDef.dailyRecycleInventoryOnly !== void 0;
    if (hasInventoryMode && LOOP_STRATEGIES.includes(loopDef.strategy)) {
      const capability = getLoopStrategyCapabilities(loopDef.strategy).inventoryOnly;
      if (![INVENTORY_ONLY_CAPABILITIES.supported, INVENTORY_ONLY_CAPABILITIES.container].includes(capability)) {
        errors.push(`inventoryMode is not configurable for strategy ${loopDef.strategy}`);
      }
    }
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
    if (loopDef.setCompletionSafetyLimit !== void 0) {
      const safetyLimit = Number(loopDef.setCompletionSafetyLimit);
      if (!Number.isInteger(safetyLimit) || safetyLimit < 1 || safetyLimit > 100) {
        errors.push("setCompletionSafetyLimit must be an integer between 1 and 100");
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
    if (loopDef.preCraftPlayerPick !== void 0) {
      if (!isPlainObject(loopDef.preCraftPlayerPick)) {
        errors.push("preCraftPlayerPick must be an object");
      } else {
        validateNumberArray(loopDef.preCraftPlayerPick.sbcSetIds, "preCraftPlayerPick.sbcSetIds", errors);
        validateNumberArray(loopDef.preCraftPlayerPick.pickItemResourceIds, "preCraftPlayerPick.pickItemResourceIds", errors);
        if (!loopDef.preCraftPlayerPick.sbcSetIds?.length && !loopDef.preCraftPlayerPick.pickItemResourceIds?.length) {
          errors.push("preCraftPlayerPick.sbcSetIds or preCraftPlayerPick.pickItemResourceIds is required");
        }
      }
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
    validateRewardFlow(loopDef.rewardFlow, "rewardFlow", errors);
    if (loopDef.strategy === "validationBronzeUpgrade") {
      validateStringArray(loopDef.sbcNames, "sbcNames", errors, true);
      validateCardSpec(loopDef.targetDuplicate, "targetDuplicate", errors);
    }
    if (loopDef.strategy === "dailySingleCardRecycle") {
      validateStringArray(loopDef.sbcNames, "sbcNames", errors, true);
      validateCardSpec(loopDef.targetDuplicate, "targetDuplicate", errors);
    }
    if (["dailyRoutine", "workflowRoutine"].includes(loopDef.strategy)) {
      validateRoutineSteps(loopDef.steps, "steps", errors);
      if (loopDef.strategy === "workflowRoutine" && loopDef.stepOverrides !== void 0) {
        errors.push("stepOverrides is only supported by dailyRoutine compatibility flows; configure a dedicated child loop instead");
      }
      if (loopDef.stepOverrides !== void 0) {
        if (!isPlainObject(loopDef.stepOverrides)) {
          errors.push("stepOverrides must be an object");
        } else {
          Object.entries(loopDef.stepOverrides).forEach(([stepId, override]) => {
            if (!isPlainObject(override)) errors.push(`stepOverrides.${stepId} must be an object`);
          });
        }
      }
    }
    if (loopDef.strategy === "fillAndVerifySbc") {
      validateStringArray(loopDef.sbcNames, "sbcNames", errors, true);
      if (loopDef.requirements !== void 0) validateRequirements(loopDef.requirements, "requirements", errors, false);
    }
    if (loopDef.strategy === "inventoryExhaustion") {
      if (!Array.isArray(loopDef.stages) || !loopDef.stages.length) {
        errors.push("stages must be a non-empty array");
      } else {
        loopDef.stages.forEach((stage, index) => {
          validateUpgradeDef(stage, `stages[${index}]`, errors);
          if (stage.maxCompletions !== void 0) {
            const maxCompletions = Number(stage.maxCompletions);
            if (!Number.isInteger(maxCompletions) || maxCompletions < 1 || maxCompletions > 1e3) {
              errors.push(`stages[${index}].maxCompletions must be an integer between 1 and 1000`);
            }
          }
        });
      }
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
      if (loopDef.sourceExhaustedFallbackLoopId !== void 0 && (typeof loopDef.sourceExhaustedFallbackLoopId !== "string" || !loopDef.sourceExhaustedFallbackLoopId.trim())) {
        errors.push("sourceExhaustedFallbackLoopId must be a non-empty string");
      }
      if (loopDef.sourceExhaustedFallbackMaxCompletions !== void 0) {
        const fallbackLimit = Number(loopDef.sourceExhaustedFallbackMaxCompletions);
        if (!Number.isFinite(fallbackLimit) || fallbackLimit <= 0) {
          errors.push("sourceExhaustedFallbackMaxCompletions must be a positive number");
        }
      }
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
      validateNumberArray(loopDef.sbcSetIds, "sbcSetIds", errors);
      validateNumberArray(loopDef.pickItemResourceIds, "pickItemResourceIds", errors);
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
      const pickCandidateCount = loopDef.pickCandidateCount === void 0 ? null : Number(loopDef.pickCandidateCount);
      if (!Number.isInteger(challengesPerPick) || challengesPerPick < 1 || challengesPerPick > 10) {
        errors.push("challengesPerPick must be an integer between 1 and 10");
      }
      if (loopDef.challengesPerPick !== void 0 && Array.isArray(loopDef.challengeRequirements) && loopDef.challengeRequirements.length !== challengesPerPick) {
        errors.push("challengesPerPick must match challengeRequirements.length when both are provided");
      }
      if (!Number.isInteger(pickCount) || pickCount < 1 || pickCount > 10) {
        errors.push("pickCount must be an integer between 1 and 10");
      }
      if (pickCandidateCount !== null && (!Number.isInteger(pickCandidateCount) || pickCandidateCount < 1 || pickCandidateCount > 20)) {
        errors.push("pickCandidateCount must be an integer between 1 and 20");
      } else if (pickCandidateCount !== null && pickCandidateCount < pickCount) {
        errors.push("pickCandidateCount must be greater than or equal to pickCount");
      }
      if (loopDef.pricePlatform !== void 0 && !["pc", "ps", "xbox"].includes(String(loopDef.pricePlatform).toLowerCase())) {
        errors.push("pricePlatform must be pc, ps, or xbox when provided");
      }
      if (loopDef.exhaustSbcSet === true && loopDef.useRoundsAsCompletions === true) {
        errors.push("exhaustSbcSet cannot be combined with useRoundsAsCompletions");
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
    loopDefs.forEach((loopDef, index) => {
      if (["dailyRoutine", "workflowRoutine"].includes(loopDef.strategy) && isPlainObject(loopDef.stepOverrides)) {
        const stepIds = new Set((loopDef.steps || []).map(normalizeRoutineStepId).filter(Boolean));
        Object.keys(loopDef.stepOverrides).forEach((stepId) => {
          if (!stepIds.has(stepId)) fail(`${label}[${index}].stepOverrides references a non-step loop: ${stepId}`);
        });
      }
      if (!loopDef.sourceExhaustedFallbackLoopId) return;
      const target = loopDefs.find((candidate) => candidate.id === loopDef.sourceExhaustedFallbackLoopId);
      if (!target) fail(`${label}[${index}].sourceExhaustedFallbackLoopId not found: ${loopDef.sourceExhaustedFallbackLoopId}`);
      if (target.strategy !== "fillAndVerifySbc") {
        fail(`${label}[${index}].sourceExhaustedFallbackLoopId must reference a fillAndVerifySbc loop`);
      }
    });
  }
  function validateRoutineReferences(loopDefs, label) {
    const byId = new Map(loopDefs.map((loopDef) => [loopDef.id, loopDef]));
    loopDefs.forEach((loopDef, loopIndex) => {
      if (!["dailyRoutine", "workflowRoutine"].includes(loopDef.strategy)) return;
      (loopDef.steps || []).forEach((step, stepIndex) => {
        const stepId = normalizeRoutineStepId(step);
        const path = `${label}.loops[${loopIndex}].steps[${stepIndex}]`;
        if (!stepId || !byId.has(stepId)) fail(`${path} loop not found: ${stepId || "?"}`);
        if (stepId === loopDef.id) fail(`${path} cannot reference itself`);
        const target = byId.get(stepId);
        if (target?.strategy === "dailyRoutine" || target?.strategy === "workflowRoutine") {
          fail(`${path} cannot reference another routine; flatten its child steps instead`);
        }
      });
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
    if (!Array.isArray(ids) || !allowEmpty && !ids.length) {
      fail(`${path} must be an array${allowEmpty ? "" : " with at least one entry"}`);
    }
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
    validateRecoveryPolicyList(
      normalized.unassignedRecoveryPolicies,
      normalized.recoveryRecipes,
      `${label}.unassignedRecoveryPolicies`
    );
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
    normalized.loops.forEach((loopDef, index) => {
      const flowPolicies = loopDef.rewardFlow?.unassignedRecoveryPolicyIds;
      if (flowPolicies === void 0) return;
      validateRecoveryPolicyIds(
        flowPolicies,
        normalized.unassignedRecoveryPolicies,
        `${label}.loops[${index}].rewardFlow.unassignedRecoveryPolicyIds`
      );
    });
    normalized.loops.forEach((loopDef, loopIndex) => {
      if (!["dailyRoutine", "workflowRoutine"].includes(loopDef.strategy)) return;
      (loopDef.steps || []).forEach((step, stepIndex) => {
        const flowPolicies = typeof step === "object" ? step.rewardFlow?.unassignedRecoveryPolicyIds : void 0;
        if (flowPolicies === void 0) return;
        validateRecoveryPolicyIds(
          flowPolicies,
          normalized.unassignedRecoveryPolicies,
          `${label}.loops[${loopIndex}].steps[${stepIndex}].rewardFlow.unassignedRecoveryPolicyIds`
        );
      });
    });
    validateRoutineReferences(normalized.loops, label);
    return normalized;
  }
  function parseLoopConfig(text) {
    return normalizeLoopConfig(JSON.parse(text));
  }

  // src/config/routine-steps.js
  function normalizeRoutineStep(step = {}) {
    return typeof step === "string" ? { loopId: step } : step;
  }
  function resolveRoutineStepLoopDefs(loopDef = {}, loopDefs = []) {
    return (loopDef.steps || []).map((rawStep, index) => {
      const step = normalizeRoutineStep(rawStep);
      const stepId = step.loopId;
      if (stepId === loopDef.id) {
        throw new Error(`${loopDef.name}: step ${index + 1} cannot reference itself`);
      }
      const baseDef = loopDefs.find((definition) => definition.id === stepId);
      if (!baseDef) {
        throw new Error(`${loopDef.name}: step ${index + 1} loop not found: ${stepId}`);
      }
      const childDef = cloneLoopDef(baseDef);
      const stepOverride = loopDef.stepOverrides?.[stepId];
      if (stepOverride && typeof stepOverride === "object" && !Array.isArray(stepOverride)) {
        Object.assign(childDef, cloneLoopDef(stepOverride));
        childDef.id = baseDef.id;
        childDef.strategy = baseDef.strategy;
      }
      if (childDef.strategy === "dailyRoutine" || childDef.strategy === "workflowRoutine") {
        throw new Error(`${loopDef.name}: nested routine steps are not supported`);
      }
      applyRewardFlow(childDef);
      if (step.name) childDef.name = step.name;
      applyRewardFlow(childDef, step.rewardFlow);
      if (loopDef.disabledPiles?.length) {
        childDef.disabledPiles = [.../* @__PURE__ */ new Set([
          ...childDef.disabledPiles || [],
          ...loopDef.disabledPiles
        ])];
      }
      if (childDef.unassignedRecoveryPolicyIds === void 0 && loopDef.unassignedRecoveryPolicyIds !== void 0) {
        childDef.unassignedRecoveryPolicyIds = [...loopDef.unassignedRecoveryPolicyIds];
      }
      childDef.openRewardPacks = resolveRewardPackOpenEnabled(
        childDef,
        loopDef.openRewardPacks === true
      );
      const parentPickOptions = isPlainObject(loopDef.runtimePickOptions) ? loopDef.runtimePickOptions : loopDef.pickOptions;
      if (isPlainObject(parentPickOptions)) {
        applyPickRuntimeOptions(childDef, parentPickOptions);
      }
      const parentInventoryMode = loopDef.runtimeInventoryMode || resolveInventoryMode("normal", loopDef);
      applyInventoryMode(childDef, parentInventoryMode);
      childDef.dryRun = loopDef.dryRun === true || childDef.dryRun === true;
      assertValidLoopDef(childDef, childDef.name || stepId);
      return applyDisabledPiles(childDef);
    });
  }
  function configureRoutineStepForAvailability(step = {}, availability = null) {
    const configured = cloneLoopDef(step);
    if (availability && availability.remaining !== null && availability.remaining !== void 0) {
      const remaining = Math.max(1, Math.floor(Number(availability.remaining) || 1));
      configured.maxCompletions = configured.mvp === true ? Math.min(remaining, Math.max(1, Math.floor(Number(configured.maxCompletions) || 1))) : remaining;
    } else if (availability?.available === true && configured.mvp !== true) {
      configured.maxCompletions = Math.max(1, Math.floor(Number(availability.safetyLimit) || 100));
    }
    return configured;
  }

  // src/config/fsu-compat.js
  var FSU_SETTING_ALIASES = {
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
  var ITEM_ID_FIELDS = [
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
  ];
  var DEFINITION_ID_FIELDS = [
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
  ];
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
  function safeRead(holder, key) {
    try {
      return holder?.[key];
    } catch {
      return void 0;
    }
  }
  function isInspectableObject(value) {
    if (!value || typeof value !== "object") return false;
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
      const child = safeRead(value, key);
      const nextPath = path ? `${path}.${key}` : key;
      if (isInspectableObject(child)) flattenConfigValues(child, nextPath, rows, depth + 1, seen);
      else rows.push({ path: nextPath, value: child });
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
      return value.flatMap((entry) => numberListFromAny(entry)).filter((entry, index, list) => Number.isFinite(entry) && list.indexOf(entry) === index);
    }
    if (typeof value === "number" && Number.isFinite(value)) return [Number(value)];
    if (typeof value === "string") return (value.match(/\d+/g) || []).map(Number).filter(Number.isFinite);
    if (isInspectableObject(value)) {
      return flattenConfigValues(value).flatMap((row) => numberListFromAny(row.value)).filter((entry, index, list) => Number.isFinite(entry) && list.indexOf(entry) === index);
    }
    return [];
  }
  function uniquePositiveNumbers(values = []) {
    return values.map(Number).filter((value) => Number.isFinite(value) && value > 0).filter((value, index, list) => list.indexOf(value) === index);
  }
  function isLikelyLockedPlayerPath(path = "") {
    const text = String(path || "");
    if (!text || /unlock/i.test(text)) return false;
    const compact = text.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (/((lock|locked)players?|players?(lock|locked)|(lock|locked)cards?|cards?(lock|locked)|(lock|locked)items?|items?(lock|locked)|protectedplayers?|protectedcards?|protecteditems?)/i.test(compact)) return true;
    return /(^|[._\-\s])(lock|locked|protect|protected)([._\-\s]|$)/i.test(text) && /player|card|item|resource|definition|asset|info[._\-\s]*lock|(^|[._\-\s])lock([._\-\s]|$)/i.test(text);
  }
  function isLikelyLockedIdValuePath(path = "", key = "") {
    const field2 = String(key || "").replace(/^_+/, "");
    if (/^\d+$/.test(field2)) return true;
    if (/^(id|itemid|instanceid|resourceid|cardid|playerid|definitionid|defid|assetid|baseid|baseresourceid|guidassetid)$/i.test(field2)) return true;
    return /(^|[._\-\s])(lock|locked|protect|protected)([._\-\s]|$)$/i.test(String(path || ""));
  }
  function addLockedPlayerValue(result, value, path = "", key = "") {
    const numbers = numberListFromAny(value);
    if (!numbers.length) return;
    const text = `${key || ""} ${path || ""}`;
    const definitionLike = /definition|defid|asset|base|resource|guid/i.test(text);
    const itemLike = !definitionLike || /(^|[^a-z])(id|item|instance|card|player)([^a-z]|$)/i.test(text);
    if (definitionLike) numbers.forEach((number) => result.definitionIds.push(number));
    if (itemLike || /resource|guid/i.test(text)) numbers.forEach((number) => result.itemIds.push(number));
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
      const child = safeRead(value, key);
      const nextPath = path ? `${path}.${key}` : key;
      const childLockContext = lockContext || isLikelyLockedPlayerPath(nextPath);
      if (childLockContext && !isInspectableObject(child) && isLikelyLockedIdValuePath(nextPath, key)) {
        addLockedPlayerValue(result, child, nextPath, key);
        if (!result.sources.includes(nextPath)) result.sources.push(nextPath);
      } else if (childLockContext && isInspectableObject(child)) {
        ITEM_ID_FIELDS.forEach((field2) => addLockedPlayerValue(result, safeRead(child, field2), nextPath, field2));
        DEFINITION_ID_FIELDS.forEach((field2) => addLockedPlayerValue(result, safeRead(child, field2), nextPath, field2));
      }
      if (isInspectableObject(child)) collectLockedPlayerIds(child, nextPath, result, depth + 1, seen, childLockContext);
    }
    return result;
  }
  function normalizeLockedPlayerIds(raw, source = "") {
    const result = collectLockedPlayerIds(raw, source || "lock");
    return {
      itemIds: uniquePositiveNumbers(result.itemIds),
      definitionIds: uniquePositiveNumbers(result.definitionIds),
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
    return [...FSU_COMPAT_DEFAULTS.goldRange];
  }
  function normalizeFsuSettings(raw = {}, source = "manual") {
    const rows = flattenConfigValues(raw);
    const settings = { ...FSU_COMPAT_DEFAULTS, detected: true, source };
    let matched = false;
    for (const [field2, aliases] of Object.entries(FSU_SETTING_ALIASES)) {
      const row = rows.find((entry) => aliases.some((pattern) => pattern.test(entry.path)) && boolFromAny(entry.value) !== null);
      if (!row) continue;
      settings[field2] = boolFromAny(row.value);
      matched = true;
    }
    const excludedLeagueRows = rows.filter(
      (entry) => /exclude|ignore|black|ban|designated|league|联赛|聯賽/i.test(entry.path) && /league|联赛|聯賽/i.test(entry.path)
    );
    const excludedLeagueIds = excludedLeagueRows.flatMap((entry) => numberListFromAny(entry.value)).filter((entry, index, list) => Number.isFinite(entry) && list.indexOf(entry) === index);
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
    return matched ? settings : null;
  }
  function likelyFsuStorageKey(key) {
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
    base.lockedItemIds = uniquePositiveNumbers([...base.lockedItemIds || [], ...locked.itemIds || []]);
    base.lockedDefinitionIds = uniquePositiveNumbers([...base.lockedDefinitionIds || [], ...locked.definitionIds || []]);
    base.detected = true;
    if (sourceLabel) base.source = base.source && base.source !== "compat-defaults" ? `${base.source}+${sourceLabel}` : sourceLabel;
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
      const value = storage.get(key, null);
      if (value === null || value === void 0) continue;
      const parsed = parseJsonMaybe(value);
      const settings = normalizeFsuSettings(parsed || { [key]: value }, `${label}:${key}`);
      if (settings) return settings;
    }
    for (const [key, value] of storage.entries(250)) {
      if (!key || !likelyFsuStorageKey(key)) continue;
      const parsed = parseJsonMaybe(value);
      const settings = normalizeFsuSettings(parsed || { [key]: value }, `${label}:${key}`);
      if (settings) return settings;
    }
    return null;
  }
  function readFsuLockedPlayersFromStorage(storage, label) {
    const combined = { itemIds: [], definitionIds: [], sources: [] };
    if (!storage) return combined;
    for (const [key, value] of storage.entries(250)) {
      if (!key || !isLikelyLockedPlayerPath(key)) continue;
      const parsed = parseJsonMaybe(value);
      const locked = normalizeLockedPlayerIds(parsed || { [key]: value }, `${label}:${key}`);
      combined.itemIds.push(...locked.itemIds);
      combined.definitionIds.push(...locked.definitionIds);
      combined.sources.push(...locked.sources);
    }
    return {
      itemIds: uniquePositiveNumbers(combined.itemIds),
      definitionIds: uniquePositiveNumbers(combined.definitionIds),
      sources: [...new Set(combined.sources)].slice(0, 8)
    };
  }

  // src/config/batch-open.js
  var MAX_BATCH_QUANTITY = 999;
  function normalizedText(value) {
    return String(value || "").trim();
  }
  function normalizedPackId(value) {
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? id : null;
  }
  function normalizedQuantity(value) {
    return Math.max(1, Math.min(MAX_BATCH_QUANTITY, Math.floor(Number(value) || 1)));
  }
  function batchOpenEntryKey(entry = {}) {
    const packId2 = normalizedPackId(entry.packId ?? entry.id);
    if (packId2) return `id:${packId2}`;
    const packName = normalizedText(entry.packName ?? entry.name).toLowerCase();
    return packName ? `name:${packName}` : "";
  }
  function normalizeBatchOpenEntry(entry = {}) {
    const packId2 = normalizedPackId(entry.packId ?? entry.id);
    const packName = normalizedText(entry.packName ?? entry.name);
    if (!packId2 && !packName) return null;
    return Object.freeze({
      packId: packId2,
      packName,
      quantity: normalizedQuantity(entry.quantity),
      quantityMode: entry.quantityMode === "all" ? "all" : "fixed"
    });
  }
  function normalizeBatchOpenPlan(input = {}) {
    const entries = [];
    const indexes = /* @__PURE__ */ new Map();
    for (const rawEntry of input?.entries || []) {
      const entry = normalizeBatchOpenEntry(rawEntry);
      if (!entry) continue;
      const key = batchOpenEntryKey(entry);
      if (!key) continue;
      if (indexes.has(key)) {
        entries[indexes.get(key)] = entry;
      } else {
        indexes.set(key, entries.length);
        entries.push(entry);
      }
    }
    return Object.freeze({ version: 1, entries: Object.freeze(entries) });
  }
  function createBatchOpenAvailability(planInput = {}, snapshot = {}) {
    const plan = normalizeBatchOpenPlan(planInput);
    const groups = (snapshot?.groups || []).map((group) => ({
      packId: normalizedPackId(group.id ?? group.packId),
      packName: normalizedText(group.name ?? group.packName),
      available: Math.max(0, Math.floor(Number(group.count) || 0))
    }));
    const byKey = new Map(groups.map((group) => [batchOpenEntryKey(group), group]));
    return plan.entries.map((entry) => Object.freeze({
      ...entry,
      available: byKey.get(batchOpenEntryKey(entry))?.available || 0,
      effectiveQuantity: entry.quantityMode === "all" ? byKey.get(batchOpenEntryKey(entry))?.available || 0 : entry.quantity
    }));
  }
  function materializeBatchOpenPlan(planInput = {}, snapshot = {}) {
    const rows = createBatchOpenAvailability(planInput, snapshot);
    return normalizeBatchOpenPlan({
      entries: rows.filter((entry) => entry.quantityMode !== "all" || entry.available > 0).map((entry) => ({
        ...entry,
        quantity: entry.quantityMode === "all" ? entry.available : entry.quantity
      }))
    });
  }

  // src/config/session-loops.js
  function materializeSessionLoopDefs(options = {}) {
    const configuredLoops = Array.isArray(options.configuredLoops) ? options.configuredLoops : [];
    const loopOverrides = options.loopOverrides || {};
    const discoveredLoops = Array.isArray(options.discoveredLoops) ? options.discoveredLoops : [];
    const result = configuredLoops.map((loop) => loopOverrides[loop?.id] || loop);
    const ids = new Set(result.map((loop) => loop?.id).filter(Boolean));
    for (const loop of discoveredLoops) {
      if (loop?.id && ids.has(loop.id)) continue;
      result.push(loop);
      if (loop?.id) ids.add(loop.id);
    }
    return result;
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

  // src/selection/rating-model.js
  var PLAYER_REQUIREMENT_KEYS = /* @__PURE__ */ new Set([
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
  function firstRequirementKey(requirement) {
    if (requirement?.key !== void 0 && requirement?.key !== null) return requirement.key;
    try {
      const key = requirement?.getFirstKey?.();
      if (key !== void 0 && key !== null) return key;
    } catch {
    }
    const collection = requirement?.kvPairs?._collection || requirement?.kvPairs || {};
    return Object.keys(collection)[0];
  }
  function flattenValues(value) {
    if (Array.isArray(value)) return value.flat(Infinity).filter((entry) => entry !== void 0 && entry !== null);
    if (value === void 0 || value === null) return [];
    return [value];
  }
  function requirementValues(requirement, key) {
    const normalized = flattenValues(requirement?.values);
    if (normalized.length) return normalized;
    try {
      const values = flattenValues(requirement?.getValue?.(key));
      if (values.length) return values;
    } catch {
    }
    const collection = requirement?.kvPairs?._collection || requirement?.kvPairs || {};
    const direct = flattenValues(collection?.[key]);
    if (direct.length) return direct;
    try {
      return flattenValues(requirement?.getFirstValue?.(key));
    } catch {
      return [];
    }
  }
  function requirementCount(requirement, requiredPlayerCount) {
    const count = Number(requirement?.count);
    if (count === -1 || !Number.isFinite(count)) return requiredPlayerCount;
    return Math.max(0, Math.min(requiredPlayerCount, count));
  }
  function readEligibilityRequirements(challenge, options = {}) {
    const requiredPlayerCount = Math.max(0, Number(options.requiredPlayerCount || 0) || 0);
    const eligibilityKeyName = options.eligibilityKeyName || ((key) => String(key || ""));
    return (challenge?.eligibilityRequirements || []).map((requirement) => {
      const key = firstRequirementKey(requirement);
      return {
        requirement,
        key,
        keyName: eligibilityKeyName(key),
        values: requirementValues(requirement, key),
        count: requirementCount(requirement, requiredPlayerCount)
      };
    });
  }
  function rareFlag(item) {
    return Number(item?.rareflag ?? item?.rareFlag ?? item?._rareflag ?? item?._staticData?.rareflag ?? 0);
  }
  function matchesDynamicRequirement(item, requirement, keyName, rawValues, matchers) {
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
          (value) => value === 1 && matchers.isBronze(item) || value === 2 && matchers.isSilver(item) || value === 3 && matchers.isGold(item) || value === 4 && matchers.isSpecialItem(item)
        );
      case "PLAYER_RARITY":
        return values.includes(rareFlag(item));
      case "PLAYER_RARITY_GROUP":
        return values.some((value) => matchers.itemGroupNumbers(item).includes(value));
      case "PLAYER_MIN_OVR":
        return values.length > 0 && rating >= Math.min(...values);
      case "PLAYER_EXACT_OVR":
        return values.includes(rating);
      case "CLUB_ID":
        return values.includes(Number(item?.teamId ?? item?.clubId ?? item?._staticData?.teamId ?? 0));
      case "LEAGUE_ID":
        return values.includes(matchers.itemLeagueId(item));
      case "NATION_ID":
        return values.includes(Number(item?.nationId ?? item?._staticData?.nationId ?? 0));
      default:
        return false;
    }
  }
  function parseRatingSbcChallenge(input = {}) {
    const loopDef = input.loopDef || {};
    const challenge = input.challenge || null;
    const requiredPlayerCount = Math.max(0, Number(input.requiredPlayerCount || 0) || 0);
    const eligibilityKeyName = input.eligibilityKeyName || ((key) => String(key || ""));
    const matchers = {
      isBronze: input.isBronze || (() => false),
      isSilver: input.isSilver || (() => false),
      isGold: input.isGold || (() => false),
      isSpecialItem: input.isSpecialItem || (() => false),
      itemGroupNumbers: input.itemGroupNumbers || (() => []),
      itemLeagueId: input.itemLeagueId || (() => 0)
    };
    const constraints = [];
    const unsupported = [];
    let targetRating = Number(loopDef.ratingSbcFill?.targetRating || 0) || 0;
    for (const entry of readEligibilityRequirements(challenge, { requiredPlayerCount, eligibilityKeyName })) {
      const { requirement, keyName, values, count } = entry;
      if (keyName === "TEAM_RATING") {
        const ratings = values.map(Number).filter(Number.isFinite);
        if (ratings.length) targetRating = Math.max(targetRating, ...ratings);
        continue;
      }
      if (keyName === "CHEMISTRY_POINTS" || keyName === "ALL_PLAYERS_CHEMISTRY_POINTS") {
        unsupported.push(keyName);
        continue;
      }
      if (!PLAYER_REQUIREMENT_KEYS.has(keyName)) {
        unsupported.push(keyName);
        continue;
      }
      if (!count || !values.length) {
        unsupported.push(`${keyName}(count:${requirement?.count ?? "?"}, values:${values.join("/") || "?"})`);
        continue;
      }
      constraints.push({
        id: `challenge-${constraints.length}`,
        label: `${keyName} ${values.join("/")} x${count}`,
        count,
        matches: (item) => matchesDynamicRequirement(item, requirement, keyName, values, matchers)
      });
    }
    const configuredSpecialCount = Math.max(0, Number(loopDef.requiredSpecialCount || 0) || 0);
    if (configuredSpecialCount) {
      const minimumRating = Math.max(0, Number(loopDef.requiredSpecialMinRating || 0) || 0);
      const label = input.requiredSpecialLabel?.(loopDef) || "special";
      constraints.push({
        id: "runner-required-special",
        label: `${label} rating >= ${minimumRating} x${configuredSpecialCount}`,
        count: configuredSpecialCount,
        matches: (item) => input.isRequiredSpecialItem?.(item, loopDef) === true && Number(item?.rating || 0) >= minimumRating
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
  function validateRatingSbcModelAgainstItems(model, items = [], challenge = null, options = {}) {
    const players = (items || []).filter(Boolean);
    const errors = [];
    const requiredPlayerCount = Math.max(0, Number(model?.requiredPlayerCount || 0) || 0);
    const ratings = players.map((item) => Number(item?.rating || 0));
    const rating = players.length === requiredPlayerCount ? (options.calculateSquadRating || calculateEaSquadRating)(ratings, requiredPlayerCount) : 0;
    const definitionIds2 = players.map((item) => Number(item?.definitionId || 0)).filter(Boolean);
    const uniqueDefinitionCount = new Set(definitionIds2).size;
    if (players.length !== requiredPlayerCount) errors.push(`player-count ${players.length}/${requiredPlayerCount}`);
    if (definitionIds2.length !== players.length || uniqueDefinitionCount !== players.length) {
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
      const required2 = Math.max(0, Number(constraint.count || 0) || 0);
      if (matched < required2) errors.push(`${constraint.label} ${matched}/${required2}`);
      return { constraint, matched, required: required2 };
    });
    const specialCount = players.filter(options.isSpecialItem || (() => false)).length;
    if (specialCount > Number(model?.maxSpecialCount || 0)) {
      errors.push(`special-count ${specialCount}/${Number(model?.maxSpecialCount || 0)}`);
    }
    let challengeReady = null;
    if (challenge && typeof challenge.meetsRequirements === "function") {
      try {
        challengeReady = challenge.meetsRequirements() === true;
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

  // src/config/player-pick-discovery.js
  var DEFAULT_PRIORITY_PILES = Object.freeze(["unassigned", "storage", "transfer", "club"]);
  var SUPPORTED_REQUIREMENT_KEYS = /* @__PURE__ */ new Set([
    "PLAYER_QUALITY",
    "PLAYER_LEVEL",
    "PLAYER_RARITY",
    "PLAYER_RARITY_GROUP"
  ]);
  function positiveInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
  }
  function normalizedText2(value) {
    return String(value ?? "").trim();
  }
  function unique(values = []) {
    return [...new Set(values.filter((value) => value !== void 0 && value !== null && value !== ""))];
  }
  function isCompleted(value) {
    const status = normalizedText2(value?.status || value?.state).toUpperCase();
    return value?.complete === true || value?.completed === true || status === "COMPLETE" || status === "COMPLETED";
  }
  function rewardType(reward) {
    return normalizedText2(reward?.type || reward?.rewardType || reward?.kind).toUpperCase().replaceAll(/[^A-Z0-9]+/g, "_");
  }
  function isPlayerPickReward(reward) {
    return reward?.playerPick === true || ["PLAYER_PICK", "PLAYERPICK"].includes(rewardType(reward));
  }
  function rewardIdentityValues(reward) {
    return unique([
      reward?.resourceId,
      reward?.itemResourceId,
      reward?.definitionId,
      reward?.itemDefinitionId
    ].map(normalizedText2));
  }
  function rewardIdentityKey(reward) {
    const values = rewardIdentityValues(reward);
    return values.length ? values.join("|") : "";
  }
  function readPlayerPickRewardCounts(reward = {}) {
    const explicitCandidateCount = positiveInteger(reward.candidateCount ?? reward.totalCandidates);
    const explicitSelectionCount = positiveInteger(reward.selectionCount ?? reward.availablePicks);
    if (explicitCandidateCount && explicitSelectionCount) {
      return { candidateCount: explicitCandidateCount, selectionCount: explicitSelectionCount, source: "fields" };
    }
    const description = normalizedText2(reward.description);
    const match = /^(\d+)\s+of\s+(\d+)(?:\s|$)/i.exec(description);
    if (!match) {
      return {
        candidateCount: explicitCandidateCount,
        selectionCount: explicitSelectionCount,
        source: explicitCandidateCount || explicitSelectionCount ? "partial-fields" : null
      };
    }
    return {
      candidateCount: explicitCandidateCount || positiveInteger(match[2]),
      selectionCount: explicitSelectionCount || positiveInteger(match[1]),
      source: explicitCandidateCount || explicitSelectionCount ? "fields-and-description" : "description"
    };
  }
  function canonicalQuality(value, options = {}) {
    const text = normalizedText2(value).toUpperCase();
    if (["GOLD", "QUALITY_GOLD", "LEVEL_GOLD"].includes(text)) return "gold";
    const goldValues = new Set((options.goldQualityValues || [3]).map((entry) => normalizedText2(entry)));
    return goldValues.has(normalizedText2(value)) ? "gold" : null;
  }
  function canonicalRarity(value, options = {}, keyName = "PLAYER_RARITY") {
    if (keyName === "PLAYER_RARITY_GROUP") {
      const rareGroupValues = new Set((options.rareRarityGroupValues || [4]).map((entry) => normalizedText2(entry)));
      return rareGroupValues.has(normalizedText2(value)) ? "rare" : null;
    }
    const text = normalizedText2(value).toUpperCase();
    if (["COMMON", "NORMAL", "NON_RARE", "NONRARE"].includes(text)) return "common";
    if (["RARE"].includes(text)) return "rare";
    const commonValues = new Set((options.commonRarityValues || [0]).map((entry) => normalizedText2(entry)));
    const rareValues = new Set((options.rareRarityValues || [1]).map((entry) => normalizedText2(entry)));
    if (commonValues.has(normalizedText2(value))) return "common";
    if (rareValues.has(normalizedText2(value))) return "rare";
    return null;
  }
  function requirementSummary(entry) {
    return `${entry.keyName || "?"}(count:${entry.count || "?"}, values:${entry.values.join("/") || "?"})`;
  }
  function parseChallengeRequirements(challenge, challengeIndex, options = {}) {
    const challengeLabel = `challenge ${challengeIndex + 1}${challenge?.id ? ` (#${challenge.id})` : ""}`;
    const requiredPlayerCount = positiveInteger(challenge?.requiredPlayerCount);
    if (!requiredPlayerCount) {
      return { ok: false, diagnostics: [`${challengeLabel}: required player count is missing or invalid`] };
    }
    const entries = readEligibilityRequirements(challenge, {
      requiredPlayerCount,
      eligibilityKeyName: options.eligibilityKeyName
    });
    const diagnostics = [];
    const qualityEntries = [];
    const rarityEntries = [];
    if (!entries.length) diagnostics.push(`${challengeLabel}: eligibility requirements are missing`);
    for (const entry of entries) {
      if (!SUPPORTED_REQUIREMENT_KEYS.has(entry.keyName)) {
        diagnostics.push(`${challengeLabel}: unsupported eligibility condition ${requirementSummary(entry)}`);
        continue;
      }
      if (!entry.values.length || !entry.count) {
        diagnostics.push(`${challengeLabel}: incomplete eligibility condition ${requirementSummary(entry)}`);
        continue;
      }
      if (entry.keyName === "PLAYER_RARITY" || entry.keyName === "PLAYER_RARITY_GROUP") rarityEntries.push(entry);
      else qualityEntries.push(entry);
    }
    if (qualityEntries.length !== 1) {
      diagnostics.push(`${challengeLabel}: exactly one all-player gold quality condition is required`);
    } else {
      const quality = qualityEntries[0];
      const values = unique(quality.values.map((value) => canonicalQuality(value, options)));
      if (values.length !== 1 || values[0] !== "gold" || quality.count !== requiredPlayerCount) {
        diagnostics.push(`${challengeLabel}: quality condition does not prove that all ${requiredPlayerCount} players are gold`);
      }
    }
    const rarityCounts = { common: null, rare: null };
    for (const entry of rarityEntries) {
      if (entry.values.length !== 1) {
        diagnostics.push(`${challengeLabel}: rarity condition is ambiguous: ${requirementSummary(entry)}`);
        continue;
      }
      const rarity = canonicalRarity(entry.values[0], options, entry.keyName);
      if (!rarity) {
        diagnostics.push(`${challengeLabel}: unknown ${entry.keyName} encoding ${normalizedText2(entry.values[0]) || "?"}`);
        continue;
      }
      if (rarityCounts[rarity] !== null) {
        diagnostics.push(`${challengeLabel}: duplicate ${rarity} rarity conditions are unsupported`);
        continue;
      }
      rarityCounts[rarity] = entry.count;
    }
    if (rarityEntries.length && rarityCounts.common !== null && rarityCounts.rare !== null) {
      if (rarityCounts.common + rarityCounts.rare !== requiredPlayerCount) {
        diagnostics.push(`${challengeLabel}: common/rare counts do not equal required player count`);
      }
    } else if (rarityCounts.common !== null) {
      rarityCounts.rare = requiredPlayerCount - rarityCounts.common;
    } else if (rarityCounts.rare !== null) {
      rarityCounts.common = requiredPlayerCount - rarityCounts.rare;
    }
    if (rarityCounts.common < 0 || rarityCounts.rare < 0) {
      diagnostics.push(`${challengeLabel}: rarity count exceeds required player count`);
    }
    if (diagnostics.length) return { ok: false, diagnostics };
    const highGoldThreshold = Math.max(2, Math.min(99, Number(options.highGoldThreshold || 82) || 82));
    const maxRating = highGoldThreshold - 1;
    const requirement = (rarity, count) => ({
      tier: "gold",
      rarity,
      count,
      maxRating,
      playerOnly: true,
      allowSpecial: false,
      protectHighGold: true,
      highGoldThreshold,
      highGoldProtectionMaxRating: true,
      priorityPiles: [...options.priorityPiles || DEFAULT_PRIORITY_PILES]
    });
    const requirements = [];
    if (!rarityEntries.length) {
      const unrestricted = requirement(void 0, requiredPlayerCount);
      delete unrestricted.rarity;
      unrestricted.preferCommon = true;
      requirements.push(unrestricted);
    } else {
      if (rarityCounts.rare > 0) requirements.push(requirement("rare", rarityCounts.rare));
      if (rarityCounts.common > 0) requirements.push(requirement("common", rarityCounts.common));
    }
    return { ok: true, requiredPlayerCount, requirements };
  }
  function remainingCompletions(set) {
    if (set?.timesCompleted === void 0 || set?.timesCompleted === null || set?.repeats === void 0 || set?.repeats === null) return null;
    const completed = Number(set?.timesCompleted);
    const repeats = Number(set?.repeats);
    if (!Number.isFinite(completed) || !Number.isFinite(repeats) || repeats <= 0 || repeats < completed) return null;
    return Math.max(0, Math.floor(repeats - completed));
  }
  function discoveryIdentity(set, reward) {
    return Object.freeze({
      setId: positiveInteger(set?.id),
      rewardKey: rewardIdentityKey(reward),
      rewardIdentityValues: Object.freeze(rewardIdentityValues(reward))
    });
  }
  function parsePlayerPickSbcSnapshot(input = {}) {
    const set = input.set || {};
    const setId = positiveInteger(set.id);
    const setName = normalizedText2(set.name);
    const diagnostics = [];
    if (!setId) diagnostics.push("stable SBC Set id is missing");
    if (!setName) diagnostics.push("SBC Set display name is missing");
    const playerPickRewards = (set.rewards || []).filter(isPlayerPickReward);
    if (!playerPickRewards.length) {
      return { status: "ignored", setId, diagnostics: ["SBC Set has no Player Pick reward"] };
    }
    if (playerPickRewards.length !== 1) diagnostics.push(`SBC Set exposes ${playerPickRewards.length} Player Pick rewards`);
    const reward = playerPickRewards[0] || {};
    const identity = discoveryIdentity(set, reward);
    if (!identity.rewardKey) diagnostics.push("stable Player Pick reward identity is missing");
    const rewardName = normalizedText2(reward.name || reward.displayName);
    if (!rewardName) diagnostics.push("Player Pick reward display name is missing");
    const rewardCounts = readPlayerPickRewardCounts(reward);
    const candidateCount = rewardCounts.candidateCount;
    const selectionCount = rewardCounts.selectionCount;
    if (!candidateCount) diagnostics.push("Player Pick candidate count is missing or invalid");
    if (!selectionCount) diagnostics.push("Player Pick selection count is missing or invalid");
    if (candidateCount && selectionCount && selectionCount > candidateCount) {
      diagnostics.push("Player Pick selection count exceeds candidate count");
    }
    const setRemaining = remainingCompletions(set);
    const reportedCompleted = isCompleted(set) || setRemaining === 0;
    const boundedSet = positiveInteger(set?.repeats) !== null;
    const challenges = Array.isArray(set.challenges) ? set.challenges : [];
    if (!challenges.length) diagnostics.push("SBC Set challenge list is missing");
    const challengeRequirements = [];
    for (let index = 0; index < challenges.length; index++) {
      const parsed = parseChallengeRequirements(challenges[index], index, input);
      if (parsed.ok) challengeRequirements.push(parsed.requirements);
      else diagnostics.push(...parsed.diagnostics);
    }
    if (diagnostics.length) {
      return {
        status: "unsupported",
        setId,
        identity,
        pickCandidateCount: candidateCount,
        pickCount: selectionCount,
        diagnostics: unique(diagnostics)
      };
    }
    const priorityPiles = [...input.priorityPiles || DEFAULT_PRIORITY_PILES];
    const loop = {
      id: `discovered-player-pick-${setId}-${identity.rewardIdentityValues[0]}`,
      name: setName,
      strategy: "playerPickSbc",
      discovered: true,
      sbcSetIds: [setId],
      sbcNames: [setName],
      pickItemResourceIds: [...identity.rewardIdentityValues],
      pickItemNames: [rewardName],
      challengeRequirements,
      priorityPiles,
      challengesPerPick: challenges.length,
      pickCandidateCount: candidateCount,
      pickCount: selectionCount,
      remainingCompletions: setRemaining,
      maxCompletions: 1,
      useRoundsAsCompletions: !reportedCompleted && !boundedSet,
      discoveryReportedCompleted: reportedCompleted,
      pricePlatform: normalizedText2(input.pricePlatform || "pc").toLowerCase(),
      discoveryIdentity: identity
    };
    if (loop.useRoundsAsCompletions) {
      loop.runtimeQuantity = {
        mode: "user",
        target: "maxCompletions",
        default: 3,
        min: 1,
        max: 50,
        label: "Pick completions"
      };
    }
    if (!reportedCompleted && boundedSet) {
      loop.exhaustSbcSet = true;
      loop.setCompletionSafetyLimit = Math.max(1, Math.min(100, Number(set.repeats) || 100));
    }
    if (challengeRequirements.length === 1) {
      loop.requirements = challengeRequirements[0];
      delete loop.challengeRequirements;
    }
    return {
      status: "supported",
      setId,
      identity,
      loop,
      pickCandidateCount: candidateCount,
      pickCount: selectionCount,
      reportedCompleted,
      remainingCompletions: setRemaining,
      diagnostics: []
    };
  }
  function loopSetIds(loop) {
    return new Set((loop?.sbcSetIds || []).map(positiveInteger).filter(Boolean));
  }
  function loopRewardIds(loop) {
    return new Set((loop?.pickItemResourceIds || []).map(normalizedText2).filter(Boolean));
  }
  function matchingPlayerPickLoops(loop, existingLoops = []) {
    const setIds = loopSetIds(loop);
    const rewardIds = loopRewardIds(loop);
    return (existingLoops || []).filter((existing) => {
      if (existing === loop) return false;
      const existingSetIds = loopSetIds(existing);
      const existingRewardIds = loopRewardIds(existing);
      return [...setIds].some((id) => existingSetIds.has(id)) || [...rewardIds].some((id) => existingRewardIds.has(id));
    });
  }
  function resolvePlayerPickLoopReference(reference = {}, loops = []) {
    const target = {
      sbcSetIds: reference.sbcSetIds || [],
      pickItemResourceIds: reference.pickItemResourceIds || []
    };
    const hasIdentity = loopSetIds(target).size > 0 || loopRewardIds(target).size > 0;
    if (!hasIdentity) return { status: "invalid", loop: null, matches: [] };
    const matches = matchingPlayerPickLoops(target, loops).filter((loop) => loop?.strategy === "playerPickSbc");
    if (matches.length === 1) return { status: "matched", loop: matches[0], matches };
    return {
      status: matches.length ? "ambiguous" : "missing",
      loop: null,
      matches
    };
  }
  function discoverPlayerPickSbcLoops(input = {}) {
    const loops = [];
    const results = [];
    const existingLoops = [...input.existingLoops || []];
    for (const set of input.sets || []) {
      const result = parsePlayerPickSbcSnapshot({ ...input, set });
      const matches = result.status === "supported" ? matchingPlayerPickLoops(result.loop, [...existingLoops, ...loops]) : [];
      if (matches.length) {
        results.push({
          ...result,
          status: "duplicate",
          loop: null,
          discoveredLoop: result.loop,
          matchingLoopIds: matches.map((loop) => normalizedText2(loop?.id)).filter(Boolean),
          diagnostics: ["matching static or discovered Player Pick already exists"]
        });
        continue;
      }
      results.push(result);
      if (result.status === "supported") loops.push(result.loop);
    }
    return { loops, results };
  }
  function mergeScannedPlayerPickMetadata(configuredLoop, discoveredLoop) {
    if (configuredLoop?.strategy !== "playerPickSbc" || discoveredLoop?.strategy !== "playerPickSbc") return null;
    const merged = {
      ...configuredLoop,
      sbcSetIds: [...discoveredLoop.sbcSetIds || []],
      sbcNames: unique([...discoveredLoop.sbcNames || [], ...configuredLoop.sbcNames || []]),
      pickItemResourceIds: [...discoveredLoop.pickItemResourceIds || []],
      pickItemNames: unique([...discoveredLoop.pickItemNames || [], ...configuredLoop.pickItemNames || []]),
      priorityPiles: [...discoveredLoop.priorityPiles || configuredLoop.priorityPiles || DEFAULT_PRIORITY_PILES],
      challengesPerPick: discoveredLoop.challengesPerPick,
      pickCandidateCount: discoveredLoop.pickCandidateCount,
      pickCount: discoveredLoop.pickCount,
      remainingCompletions: discoveredLoop.remainingCompletions,
      pricePlatform: discoveredLoop.pricePlatform || configuredLoop.pricePlatform,
      discoveryIdentity: discoveredLoop.discoveryIdentity,
      scannedMetadata: true
    };
    if (Array.isArray(discoveredLoop.challengeRequirements)) {
      merged.challengeRequirements = discoveredLoop.challengeRequirements.map(
        (requirements) => requirements.map((requirement) => ({ ...requirement, priorityPiles: [...requirement.priorityPiles || []] }))
      );
      delete merged.requirements;
    } else {
      merged.requirements = (discoveredLoop.requirements || []).map((requirement) => ({
        ...requirement,
        priorityPiles: [...requirement.priorityPiles || []]
      }));
      delete merged.challengeRequirements;
    }
    return merged;
  }
  function buildPlayerPickDiscoverySession(input = {}) {
    const configuredLoops = [...input.configuredLoops || []];
    const discovery = discoverPlayerPickSbcLoops({
      ...input,
      existingLoops: configuredLoops
    });
    const loopOverrides = {};
    const overrideDiagnostics = [];
    if (input.preferScannedMetadata === true) {
      for (const result of discovery.results) {
        if (result.status !== "duplicate" || !result.discoveredLoop) continue;
        const matches = matchingPlayerPickLoops(result.discoveredLoop, configuredLoops).filter((loop) => loop?.strategy === "playerPickSbc");
        if (matches.length !== 1) {
          if (matches.length > 1) {
            overrideDiagnostics.push(`scanned Pick #${result.setId || "?"} matches multiple configured loops: ${matches.map((loop) => loop.id).join(", ")}`);
          }
          continue;
        }
        const merged = mergeScannedPlayerPickMetadata(matches[0], result.discoveredLoop);
        if (merged) loopOverrides[matches[0].id] = merged;
      }
    }
    const configuredSessionLoops = configuredLoops.map((loop) => loopOverrides[loop?.id] || loop);
    const discoveredLoops = [...discovery.loops];
    const loopDefs = [...configuredSessionLoops, ...discoveredLoops];
    const requestedSelection = normalizedText2(input.selectedId);
    const selectedId = requestedSelection === "custom" || loopDefs.some((loop) => loop?.id === requestedSelection) ? requestedSelection : loopDefs[0]?.id || null;
    return {
      ...discovery,
      configuredSessionLoops,
      discoveredLoops,
      loopOverrides,
      overrideDiagnostics,
      loopDefs,
      selectedId
    };
  }

  // src/adapters/browser/dom.js
  function createDomAdapter(documentObject = globalThis.document, runtime = globalThis) {
    function query2(selector) {
      return documentObject?.querySelector?.(selector) || null;
    }
    function queryAll(selector) {
      return Array.from(documentObject?.querySelectorAll?.(selector) || []);
    }
    function create(tagName) {
      if (!documentObject?.createElement) throw new Error("DOM createElement is unavailable");
      return documentObject.createElement(tagName);
    }
    function appendToBody(element) {
      if (!documentObject?.body?.appendChild) throw new Error("DOM body is unavailable");
      documentObject.body.appendChild(element);
    }
    function appendToHead(element) {
      if (!documentObject?.head?.appendChild) throw new Error("DOM head is unavailable");
      documentObject.head.appendChild(element);
    }
    function eventConstructor(type) {
      return type === "pointer" ? runtime?.PointerEvent || globalThis.PointerEvent : runtime?.MouseEvent || globalThis.MouseEvent;
    }
    function createLegacyMouseEvent(type) {
      const event = documentObject?.createEvent?.("MouseEvents");
      if (!event) return null;
      event.initMouseEvent(type, true, true, runtime, 1, 0, 0, 1, 1, false, false, false, false, 0, null);
      return event;
    }
    function compactText(element) {
      return String(element?.textContent || "").replace(/\s+/g, " ").trim();
    }
    function isClickable(element) {
      if (!element) return false;
      if (element.disabled || element.classList?.contains?.("disabled")) return false;
      const rect = element.getBoundingClientRect?.();
      if (rect && (!rect.width || !rect.height)) return false;
      return true;
    }
    function click(element) {
      if (!element) return false;
      try {
        element.scrollIntoView?.({ block: "center", inline: "center" });
      } catch {
      }
      try {
        element.focus?.();
      } catch {
      }
      const fire = (Constructor, type, extra = {}) => {
        try {
          if (typeof Constructor === "function") {
            element.dispatchEvent(new Constructor(type, {
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
          const event = createLegacyMouseEvent(type);
          if (!event) return false;
          element.dispatchEvent(event);
          return true;
        } catch {
          return false;
        }
      };
      fire(eventConstructor("pointer"), "pointerdown", { pointerId: 1, pointerType: "mouse", isPrimary: true });
      fire(eventConstructor("mouse"), "mousedown", { button: 0, buttons: 1 });
      fire(eventConstructor("pointer"), "pointerup", { pointerId: 1, pointerType: "mouse", isPrimary: true });
      fire(eventConstructor("mouse"), "mouseup", { button: 0, buttons: 0 });
      fire(eventConstructor("mouse"), "click", { button: 0, buttons: 0 });
      try {
        element.click?.();
      } catch {
      }
      return true;
    }
    function searchText(element) {
      return [
        compactText(element),
        element?.getAttribute?.("aria-label"),
        element?.getAttribute?.("title"),
        element?.getAttribute?.("data-id"),
        element?.value
      ].filter(Boolean).join(" ");
    }
    function findButtonByText(patterns, matches) {
      return queryAll("button").find(
        (button3) => matches(compactText(button3), patterns) && isClickable(button3)
      ) || null;
    }
    function findClickableByText(patterns, matches, root = documentObject) {
      const selector = [
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
      return Array.from(root?.querySelectorAll?.(selector) || []).filter(isClickable).sort((a, b) => searchText(a).length - searchText(b).length).find((element) => matches(searchText(element), patterns)) || null;
    }
    function keyStroke(key = "Alt", code = "AltRight", options = {}) {
      const KeyboardEventConstructor = runtime?.KeyboardEvent || globalThis.KeyboardEvent;
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
      for (const target of [documentObject?.activeElement, documentObject?.body, documentObject, runtime].filter(Boolean)) {
        try {
          target.dispatchEvent(new KeyboardEventConstructor("keydown", init));
        } catch {
        }
        try {
          target.dispatchEvent(new KeyboardEventConstructor("keyup", init));
        } catch {
        }
      }
    }
    return Object.freeze({
      appendToBody,
      appendToHead,
      click,
      compactText,
      create,
      createLegacyMouseEvent,
      eventConstructor,
      findButtonByText,
      findClickableByText,
      isClickable,
      keyStroke,
      query: query2,
      queryAll,
      searchText
    });
  }

  // src/adapters/browser/http.js
  function responseError(status) {
    return new Error(`HTTP ${status}`);
  }
  function createHttpAdapter(options = {}) {
    const gmRequest = options.gmRequest;
    const fetchImpl = options.fetchImpl;
    const runtimeFallback = options.runtimeFallback;
    function requestText(method, url, requestOptions = {}) {
      const headers = requestOptions.headers || void 0;
      const timeout = Math.max(1, Number(requestOptions.timeout || 1e4) || 1e4);
      if (typeof gmRequest === "function") {
        return new Promise((resolve, reject) => {
          const request = {
            method,
            url,
            nocache: method === "GET",
            onload: (response) => {
              if (response.status >= 200 && response.status < 300) resolve(response.responseText);
              else reject(responseError(response.status));
            },
            onerror: () => reject(new Error("request failed")),
            ontimeout: () => reject(new Error("request timed out")),
            timeout
          };
          if (headers) request.headers = headers;
          if (requestOptions.data !== void 0) request.data = requestOptions.data;
          if (requestOptions.sendCookies !== void 0) request.anonymous = requestOptions.sendCookies !== true;
          gmRequest(request);
        });
      }
      if (requestOptions.useRuntimeFallback === true && typeof runtimeFallback === "function") {
        return Promise.resolve(runtimeFallback(url, requestOptions));
      }
      if (typeof fetchImpl !== "function") return Promise.reject(new Error("HTTP transport is unavailable"));
      const fetchOptions = { cache: "no-store" };
      if (method !== "GET") fetchOptions.method = method;
      if (headers) fetchOptions.headers = headers;
      if (requestOptions.data !== void 0) fetchOptions.body = requestOptions.data;
      if (requestOptions.sendCookies !== void 0) {
        fetchOptions.credentials = requestOptions.sendCookies === true ? "include" : "omit";
      }
      return fetchImpl(url, fetchOptions).then((response) => {
        if (!response.ok) throw responseError(response.status);
        return response.text();
      });
    }
    function getText(url, requestOptions = {}) {
      return requestText("GET", url, requestOptions);
    }
    function postText(url, data, requestOptions = {}) {
      return requestText("POST", url, { ...requestOptions, data });
    }
    return Object.freeze({ getText, postText, requestText });
  }

  // src/adapters/browser/notification.js
  function normalizedServer(value) {
    const url = new URL(String(value || "https://ntfy.sh"));
    if (url.protocol !== "https:") throw new Error("ntfy server must use HTTPS");
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  }
  function createNotificationAdapter(options = {}) {
    const gmNotification = options.gmNotification;
    const http = options.http;
    async function desktop(message = {}) {
      if (typeof gmNotification !== "function") throw new Error("GM_notification is unavailable");
      gmNotification({
        title: String(message.title || "Daily Loop Runner"),
        text: String(message.body || ""),
        timeout: Math.max(1e3, Number(message.timeout || 8e3) || 8e3),
        silent: message.silent === true
      });
      return true;
    }
    async function ntfy(message = {}, config = {}) {
      if (!http?.postText) throw new Error("HTTP transport is unavailable");
      const topic = String(config.topic || "").trim();
      if (!topic) throw new Error("ntfy topic is required");
      if (!/^[-_A-Za-z0-9]{1,64}$/.test(topic)) throw new Error("ntfy topic contains unsupported characters");
      const server = normalizedServer(config.server);
      const headers = {
        "Content-Type": "text/plain; charset=UTF-8",
        "X-Title": String(message.title || "Daily Loop Runner"),
        "X-Tags": "tada,soccer",
        "X-Priority": "high"
      };
      const token = String(config.token || "").trim();
      if (token) headers.Authorization = `Bearer ${token}`;
      await http.postText(`${server}/${encodeURIComponent(topic)}`, String(message.body || ""), {
        headers,
        sendCookies: false,
        timeout: Math.max(1e3, Number(config.timeout || 15e3) || 15e3)
      });
      return true;
    }
    return Object.freeze({ desktop, ntfy });
  }

  // src/adapters/browser/page-runtime.js
  var MAIN_FUT_SELECTORS = [
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
  ];
  function controllerName(controller) {
    return String(controller?.className || controller?.constructor?.name || "");
  }
  function isMainFutControllerName(name) {
    return /^UT(Home|Store|SBC|Squad|Club|Transfer|Unassigned|Evolutions|Objectives|Market|Pack)/.test(String(name || "")) && !/Loading|Splash|Login|Preload|Startup/i.test(String(name || ""));
  }
  function createPageRuntimeAdapter(runtime, dom) {
    function currentController() {
      try {
        return runtime.getAppMain().getRootViewController().getPresentedViewController().getCurrentViewController().getCurrentController();
      } catch {
        return null;
      }
    }
    function currentControllerName() {
      return controllerName(currentController());
    }
    function navigationController(controller = currentController()) {
      try {
        return controller?.getNavigationController?.() || controller?.navigationController || null;
      } catch {
        return null;
      }
    }
    function controllerRoot(controller) {
      try {
        return controller?.getView?.()?.getRootElement?.() || controller?.getView?.()?.getRootElement || null;
      } catch {
        return null;
      }
    }
    function shieldShowing(shieldName) {
      try {
        return runtime?.[shieldName]?.isShowing?.() === true;
      } catch {
        return false;
      }
    }
    function loadingShieldShowing() {
      return shieldShowing("gClickShield");
    }
    function popupShieldShowing() {
      return shieldShowing("gPopupClickShield");
    }
    function popupControllerCandidates() {
      const shield = runtime?.gPopupClickShield;
      if (!shield) return [];
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
      return candidates.filter(Boolean);
    }
    function gotoUnassigned(controller = currentController()) {
      if (typeof controller?.gotoUnassigned === "function") {
        controller.gotoUnassigned();
        return true;
      }
      const fallback = runtime?.UTStoreViewController?.prototype?.gotoUnassigned;
      if (typeof fallback === "function") {
        fallback.call(controller);
        return true;
      }
      return false;
    }
    function popViewController(animated = true, controller = currentController()) {
      const navigation = navigationController(controller);
      if (typeof navigation?.popViewController !== "function") return false;
      navigation.popViewController(animated);
      return true;
    }
    function origin() {
      return String(runtime?.location?.origin || globalThis.location?.origin || "");
    }
    function servicesReady() {
      return !!(runtime?.services?.Store && runtime?.services?.SBC && runtime?.services?.Item && runtime?.repositories?.Store && runtime?.repositories?.Item);
    }
    function hasMainDom() {
      return MAIN_FUT_SELECTORS.some((selector) => dom?.query?.(selector));
    }
    function isReady() {
      return servicesReady() && (hasMainDom() || isMainFutControllerName(currentControllerName()));
    }
    return Object.freeze({
      controllerName,
      controllerRoot,
      currentController,
      currentControllerName,
      hasMainDom,
      isMainFutControllerName,
      isReady,
      loadingShieldShowing,
      navigationController,
      popViewController,
      gotoUnassigned,
      origin,
      popupControllerCandidates,
      popupShieldShowing,
      servicesReady
    });
  }

  // src/adapters/browser/storage.js
  function createStorageAdapter(storage) {
    if (!storage) throw new Error("Browser storage is unavailable");
    function get(key, fallback = null) {
      const value = storage.getItem(String(key));
      return value === null ? fallback : value;
    }
    function set(key, value) {
      storage.setItem(String(key), String(value));
    }
    function remove(key) {
      storage.removeItem(String(key));
    }
    function getJson(key, fallback = null) {
      const value = get(key, null);
      if (value === null) return fallback;
      try {
        return JSON.parse(value);
      } catch {
        return fallback;
      }
    }
    function setJson(key, value) {
      set(key, JSON.stringify(value));
    }
    function entries(limit = 250) {
      const result = [];
      const max = Math.max(0, Math.min(1e3, Number(limit) || 0));
      let length = 0;
      try {
        length = Number(storage.length || 0);
      } catch {
      }
      for (let index = 0; index < Math.min(length, max); index++) {
        try {
          const key = storage.key(index);
          if (key === null || key === void 0) continue;
          result.push([String(key), storage.getItem(key)]);
        } catch {
        }
      }
      return result;
    }
    return Object.freeze({ get, set, remove, getJson, setJson, entries });
  }
  function createUserscriptStorageAdapter(options = {}) {
    const getValue = options.getValue;
    const setValue = options.setValue;
    const deleteValue = options.deleteValue;
    function get(key, fallback = null) {
      if (typeof getValue !== "function") return fallback;
      try {
        return getValue(String(key), fallback);
      } catch {
        return fallback;
      }
    }
    function set(key, value) {
      if (typeof setValue !== "function") throw new Error("Userscript storage is unavailable");
      setValue(String(key), value);
    }
    function remove(key) {
      if (typeof deleteValue !== "function") return false;
      deleteValue(String(key));
      return true;
    }
    return Object.freeze({ get, set, remove });
  }

  // src/adapters/browser/user-effects.js
  function createUserEffectsAdapter(runtime = globalThis, documentObject = runtime?.document || globalThis.document) {
    async function copyText(text) {
      const value = String(text || "");
      try {
        await runtime?.navigator?.clipboard?.writeText?.(value);
        if (typeof runtime?.navigator?.clipboard?.writeText === "function") return true;
      } catch {
      }
      if (!documentObject?.createElement || !documentObject?.body?.appendChild) {
        throw new Error("Clipboard fallback is unavailable");
      }
      const textarea = documentObject.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      documentObject.body.appendChild(textarea);
      textarea.select?.();
      const copied = documentObject.execCommand?.("copy") !== false;
      textarea.remove?.();
      if (!copied) throw new Error("Clipboard copy failed");
      return true;
    }
    function downloadText(text, filename) {
      const BlobConstructor = runtime?.Blob || globalThis.Blob;
      const urlApi = runtime?.URL || globalThis.URL;
      if (!BlobConstructor || !urlApi?.createObjectURL || !documentObject?.createElement || !documentObject?.body?.appendChild) {
        throw new Error("Download is unavailable");
      }
      const blob = new BlobConstructor([String(text || "")], { type: "text/plain;charset=utf-8" });
      const url = urlApi.createObjectURL(blob);
      const anchor = documentObject.createElement("a");
      anchor.href = url;
      anchor.download = String(filename || "download.txt");
      documentObject.body.appendChild(anchor);
      try {
        anchor.click?.();
      } finally {
        anchor.remove?.();
        urlApi.revokeObjectURL?.(url);
      }
      return true;
    }
    return Object.freeze({ copyText, downloadText });
  }

  // src/adapters/browser/wait.js
  function createWaitAdapter(options = {}) {
    const now = options.now || Date.now;
    const sleep = options.sleep;
    const stopPoint = options.stopPoint;
    const pageRuntime = options.pageRuntime;
    const log = options.log || (() => {
    });
    if (typeof sleep !== "function") throw new TypeError("sleep is required");
    if (typeof stopPoint !== "function") throw new TypeError("stopPoint is required");
    async function until(predicate, timeoutMs = 15e3, label = "condition") {
      const start = now();
      while (now() - start < timeoutMs) {
        stopPoint();
        try {
          const value = predicate();
          if (value) return value;
        } catch {
        }
        await sleep(250);
      }
      throw new Error(`Timed out waiting for ${label}`);
    }
    async function appReady() {
      return until(() => pageRuntime?.isReady?.(), 3e4, "FUT main UI");
    }
    async function loadingEnd(stableMs = 700, timeoutMs = 3e4) {
      const start = now();
      while (now() - start < timeoutMs) {
        stopPoint();
        if (!pageRuntime?.loadingShieldShowing?.()) {
          await sleep(stableMs);
          if (!pageRuntime?.loadingShieldShowing?.()) return true;
        }
        await sleep(250);
      }
      log("Loading shield wait timed out; continuing");
      return false;
    }
    function observableOnce(observable, controller, timeoutMs = 2e4, label = "observable") {
      return new Promise((resolve, reject) => {
        let done = false;
        const timeoutId = setTimeout(() => {
          if (done) return;
          done = true;
          reject(new Error(`${label} timed out`));
        }, timeoutMs);
        try {
          const observedController = controller || pageRuntime?.currentController?.();
          observable.observe(observedController, (sender, result) => {
            if (done) return;
            done = true;
            clearTimeout(timeoutId);
            try {
              sender?.unobserve?.(controller || pageRuntime?.currentController?.());
            } catch {
            }
            resolve(result);
          });
        } catch (error) {
          clearTimeout(timeoutId);
          reject(error);
        }
      });
    }
    return Object.freeze({ appReady, loadingEnd, observableOnce, until });
  }

  // src/adapters/ea/fsu.js
  var ROOT_NAMES = [
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
  function safeRead2(holder, key) {
    try {
      return holder?.[key];
    } catch {
      return void 0;
    }
  }
  function boolFromAny2(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value !== 0;
    if (typeof value === "string") {
      const text = value.trim().toLowerCase();
      if (["true", "1", "yes", "on", "enabled", "enable"].includes(text)) return true;
      if (["false", "0", "no", "off", "disabled", "disable"].includes(text)) return false;
    }
    return null;
  }
  function numberListFromAny2(value, isInspectableObject2, depth = 0, seen = /* @__PURE__ */ new WeakSet()) {
    if (depth > 5) return [];
    if (Array.isArray(value)) {
      if (seen.has(value)) return [];
      seen.add(value);
      return value.flatMap((entry) => numberListFromAny2(entry, isInspectableObject2, depth + 1, seen)).filter((entry, index, list) => Number.isFinite(entry) && list.indexOf(entry) === index);
    }
    if (typeof value === "number" && Number.isFinite(value)) return [Number(value)];
    if (typeof value === "string") return (value.match(/\d+/g) || []).map(Number).filter(Number.isFinite);
    if (!isInspectableObject2(value)) return [];
    if (seen.has(value)) return [];
    seen.add(value);
    return Object.keys(value).slice(0, 250).flatMap((key) => numberListFromAny2(safeRead2(value, key), isInspectableObject2, depth + 1, seen)).filter((entry, index, list) => Number.isFinite(entry) && list.indexOf(entry) === index);
  }
  function uniquePositiveNumbers2(values = []) {
    return values.map(Number).filter((value) => Number.isFinite(value) && value > 0).filter((value, index, list) => list.indexOf(value) === index);
  }
  function cloneDefaults() {
    return {
      ...FSU_COMPAT_DEFAULTS,
      excludedLeagueIds: [...FSU_COMPAT_DEFAULTS.excludedLeagueIds],
      goldRange: [...FSU_COMPAT_DEFAULTS.goldRange],
      lockedItemIds: [...FSU_COMPAT_DEFAULTS.lockedItemIds],
      lockedDefinitionIds: [...FSU_COMPAT_DEFAULTS.lockedDefinitionIds]
    };
  }
  function createFsuAdapter(runtime, options = {}) {
    const documentObject = options.documentObject || runtime?.document || globalThis.document;
    const localStorage = options.localStorage || null;
    const sessionStorage = options.sessionStorage || null;
    function isInspectableObject2(value) {
      if (!value || typeof value !== "object") return false;
      if (value === runtime || value === documentObject || value === documentObject?.body) return false;
      const tag = Object.prototype.toString.call(value);
      return tag === "[object Object]" || tag === "[object Array]";
    }
    function readInfoSettings() {
      const info = safeRead2(runtime, "info");
      const build = safeRead2(info, "build");
      if (!isInspectableObject2(build)) return null;
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
      if (!knownBuildKeys.some((key) => safeRead2(build, key) !== void 0)) return null;
      const setCandidate = safeRead2(info, "set");
      const set = isInspectableObject2(setCandidate) ? setCandidate : {};
      const rawGoldenMax = Number(safeRead2(set, "goldenrange"));
      const goldenMax = Number.isFinite(rawGoldenMax) && rawGoldenMax >= 75 && rawGoldenMax <= 99 ? rawGoldenMax : FSU_COMPAT_DEFAULTS.goldRange[1];
      const readBoolean = (key, fallback) => {
        const value = boolFromAny2(safeRead2(build, key));
        return value === null ? fallback : value;
      };
      return {
        ...cloneDefaults(),
        ignorePlayerPosition: readBoolean("ignorepos", FSU_COMPAT_DEFAULTS.ignorePlayerPosition),
        onlyUntradeable: readBoolean("untradeable", FSU_COMPAT_DEFAULTS.onlyUntradeable),
        excludeDesignatedLeagues: readBoolean("league", FSU_COMPAT_DEFAULTS.excludeDesignatedLeagues),
        excludedLeagueIds: uniquePositiveNumbers2(numberListFromAny2(safeRead2(set, "shield_league"), isInspectableObject2)),
        useRarityPlayer: readBoolean("flag", FSU_COMPAT_DEFAULTS.useRarityPlayer),
        excludeEvolution: readBoolean("academy", FSU_COMPAT_DEFAULTS.excludeEvolution),
        playerPickStrictCommonRare: readBoolean("strictlypcik", FSU_COMPAT_DEFAULTS.playerPickStrictCommonRare),
        priorityRareWithinGoldRange: readBoolean("comprange", FSU_COMPAT_DEFAULTS.priorityRareWithinGoldRange),
        priorityNonSpecialPlayers: readBoolean("comprare", FSU_COMPAT_DEFAULTS.priorityNonSpecialPlayers),
        priorityStoragePlayers: readBoolean("firststorage", FSU_COMPAT_DEFAULTS.priorityStoragePlayers),
        silverBronzePrioritizeNormal: readBoolean("sbfirstcommon", FSU_COMPAT_DEFAULTS.silverBronzePrioritizeNormal),
        goldRange: [75, goldenMax],
        detected: true,
        source: "window.info.build/set"
      };
    }
    function namedRoots(includeDynamic = true) {
      const roots = [];
      for (const name of ROOT_NAMES) {
        const value = safeRead2(runtime, name);
        if (isInspectableObject2(value)) roots.push([name, value]);
      }
      if (includeDynamic) {
        let keys = [];
        try {
          keys = Object.keys(runtime);
        } catch {
        }
        keys.filter((key) => /fsu|enhancer/i.test(key)).slice(0, 40).forEach((key) => {
          const value = safeRead2(runtime, key);
          if (isInspectableObject2(value)) roots.push([key, value]);
        });
      }
      return roots;
    }
    function readWindowSettings() {
      const infoSettings = readInfoSettings();
      if (infoSettings) return infoSettings;
      const seen = /* @__PURE__ */ new WeakSet();
      for (const [name, root] of namedRoots(true)) {
        if (seen.has(root)) continue;
        seen.add(root);
        const settings = normalizeFsuSettings(root, `window.${name}`);
        if (settings) return settings;
      }
      return null;
    }
    function readWindowLockedPlayers() {
      const info = safeRead2(runtime, "info");
      const state = safeRead2(runtime, "state");
      const page = safeRead2(state, "page");
      const pageInfo = safeRead2(page, "info");
      const known = [
        ["window.info.lock", safeRead2(info, "lock")],
        ["window.info.lockedPlayers", safeRead2(info, "lockedPlayers")],
        ["window.info.lockPlayers", safeRead2(info, "lockPlayers")],
        ["window.info.playerLock", safeRead2(info, "playerLock")],
        ["window.info.protectedPlayers", safeRead2(info, "protectedPlayers")],
        ["window.state.page.info.lock", safeRead2(pageInfo, "lock")]
      ];
      const combined = { itemIds: [], definitionIds: [], sources: [] };
      for (const [path, value] of known) {
        const locked = normalizeLockedPlayerIds(value, path);
        combined.itemIds.push(...locked.itemIds);
        combined.definitionIds.push(...locked.definitionIds);
        combined.sources.push(...locked.sources);
      }
      for (const [name, root] of namedRoots(false)) {
        const locked = normalizeLockedPlayerIds(root, `window.${name}`);
        combined.itemIds.push(...locked.itemIds);
        combined.definitionIds.push(...locked.definitionIds);
        combined.sources.push(...locked.sources);
      }
      return {
        itemIds: uniquePositiveNumbers2(combined.itemIds),
        definitionIds: uniquePositiveNumbers2(combined.definitionIds),
        sources: [...new Set(combined.sources)].slice(0, 8)
      };
    }
    function readLockedPlayers() {
      const windowLocked = readWindowLockedPlayers();
      const localLocked = readFsuLockedPlayersFromStorage(localStorage, "localStorage");
      const sessionLocked = readFsuLockedPlayersFromStorage(sessionStorage, "sessionStorage");
      return {
        itemIds: uniquePositiveNumbers2([
          ...windowLocked.itemIds || [],
          ...localLocked.itemIds || [],
          ...sessionLocked.itemIds || []
        ]),
        definitionIds: uniquePositiveNumbers2([
          ...windowLocked.definitionIds || [],
          ...localLocked.definitionIds || [],
          ...sessionLocked.definitionIds || []
        ]),
        sources: [.../* @__PURE__ */ new Set([
          ...windowLocked.sources || [],
          ...localLocked.sources || [],
          ...sessionLocked.sources || []
        ])].slice(0, 8)
      };
    }
    function snapshot(settingsOverride = null) {
      const settings = settingsOverride || readWindowSettings() || readFsuSettingsFromStorage(localStorage, "localStorage") || readFsuSettingsFromStorage(sessionStorage, "sessionStorage") || cloneDefaults();
      const locked = readLockedPlayers();
      return mergeLockedPlayersIntoSettings(
        settings,
        locked,
        locked.itemIds.length || locked.definitionIds.length ? "locked-players" : ""
      );
    }
    function readiness() {
      const info = safeRead2(runtime, "info");
      const build = safeRead2(info, "build");
      if (!isInspectableObject2(build)) {
        return { detected: false, ready: true, state: "not-detected" };
      }
      const base = safeRead2(info, "base");
      const rawState = safeRead2(base, "state");
      const cacheStatus = String(safeRead2(safeRead2(base, "clubCache"), "status") || "");
      if (cacheStatus === "finalizing") {
        return {
          detected: true,
          ready: true,
          fullyValidated: true,
          state: "ready",
          cacheStatus
        };
      }
      if (["validating", "trusted-provisional", "validation-failed"].includes(cacheStatus)) {
        return {
          detected: true,
          ready: true,
          fullyValidated: false,
          state: "provisional",
          cacheStatus
        };
      }
      if (rawState === false) {
        return {
          detected: true,
          ready: false,
          fullyValidated: false,
          state: safeRead2(base, "reloadPlayersPromise") ? "loading" : "not-ready"
        };
      }
      return {
        detected: true,
        ready: true,
        fullyValidated: true,
        state: "ready"
      };
    }
    async function validateClubPlayers(refs = [], options2 = {}) {
      const events = safeRead2(runtime, "events");
      const validate = safeRead2(events, "validateClubPlayers");
      if (typeof validate !== "function") {
        return {
          ok: readiness().fullyValidated !== false,
          items: [],
          missing: refs,
          reason: "FSU targeted Club validation is unavailable"
        };
      }
      return validate(refs, options2);
    }
    function beginProvisionalClubAccess() {
      const begin = safeRead2(safeRead2(runtime, "events"), "beginProvisionalClubAccess");
      return typeof begin === "function" ? begin() : null;
    }
    function endProvisionalClubAccess() {
      const end = safeRead2(safeRead2(runtime, "events"), "endProvisionalClubAccess");
      return typeof end === "function" ? end() : null;
    }
    return Object.freeze({
      snapshot,
      readiness,
      validateClubPlayers,
      beginProvisionalClubAccess,
      endProvisionalClubAccess
    });
  }

  // src/domain/contracts.js
  var INVENTORY_PILES2 = Object.freeze(["unassigned", "storage", "transfer", "club"]);
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
    for (const pile of INVENTORY_PILES2) {
      piles[pile] = Object.freeze((input.piles?.[pile] || []).map(
        (item) => item?.ref ? Object.freeze({ ...cloneSerializable(item), pile, ref: createItemRef(item.ref, pile) }) : createItemSnapshot(item, pile)
      ));
    }
    const capacities = {};
    for (const pile of INVENTORY_PILES2) {
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
    const holders = [item, ...IDENTITY_HOLDERS.map((field2) => item?.[field2])].filter((holder) => holder && typeof holder === "object");
    const values = holders.flatMap((holder) => IDENTITY_FIELDS.flatMap((field2) => {
      const value = holder?.[field2];
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
    let fullName = "";
    try {
      fullName = String(item?._staticData?.getFullName?.() || item?.getFullName?.() || "").trim();
    } catch {
    }
    return createItemSnapshot({
      id: item?.id,
      definitionId: item?.definitionId,
      type: item?.type || (callBoolean(item, "isPlayer") ? "player" : "unknown"),
      name: fullName || item?.name || item?.commonName || item?.lastName || item?._staticData?.name,
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
    const service = runtime?.services?.Item;
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
          if (typeof repository.getStorageItems === "function") {
            return Array.from(repository.getStorageItems() || []);
          }
        } catch {
        }
        try {
          if (typeof repository.getStorage === "function") {
            return collectionValues(repository.getStorage());
          }
        } catch {
        }
        return collectionValues(repository.storage);
      }
      if (pile === "transfer") {
        try {
          if (typeof repository.getTransferItems === "function") {
            return Array.from(repository.getTransferItems() || []);
          }
        } catch {
        }
        return collectionValues(repository.transfer);
      }
      if (pile === "club") {
        return collectionValues(repository.club?.items).concat(collectionValues(runtime.services?.Item?.itemDao?.itemRepo?.club?.items));
      }
      return [];
    }
    function pileValue(pile) {
      return runtime.ItemPile?.[String(pile || "").toUpperCase()] ?? pile;
    }
    function preparePurchasedItem(item) {
      if (!item || typeof item !== "object") return item;
      item.pile = pileValue("purchased");
      item.injuryType = runtime.PlayerInjury?.NONE ?? 0;
      return item;
    }
    function capacity(pile, rawItems = readPile(pile)) {
      const resolvedPile = pileValue(pile);
      let max = null;
      let used = rawItems.length;
      try {
        const value = Number(repository.getPileSize?.(resolvedPile));
        if (Number.isFinite(value)) max = value;
      } catch {
      }
      if (max === null) {
        const fallback = Number(options.capacityFallbacks?.[pile]);
        if (Number.isFinite(fallback)) max = fallback;
      }
      try {
        const value = Number(repository.numItemsInCache?.(resolvedPile));
        if (Number.isFinite(value)) used = value;
      } catch {
      }
      return { max, used, free: max === null ? null : Math.max(0, max - used) };
    }
    function requestUnassigned() {
      if (typeof service?.requestUnassignedItems !== "function") {
        throw new Error("EA Unassigned refresh is unavailable");
      }
      return service.requestUnassignedItems();
    }
    function refreshActions(pile) {
      const resolvedPile = pileValue(pile);
      const specificNames = {
        club: ["requestClubItems"],
        storage: ["requestStorageItems", "requestSBCStorageItems"],
        transfer: ["requestTransferItems"]
      }[pile] || [];
      const genericNames = ["requestItems", "requestPileItems", "requestItemsForPile", "requestItemsByPile"];
      return [
        ...specificNames.map((methodName) => ({
          label: `Item.${methodName}`,
          methodName,
          invoke: () => service[methodName]()
        })),
        ...genericNames.map((methodName) => ({
          label: `${pile} via Item.${methodName}`,
          methodName,
          invoke: () => service[methodName](resolvedPile)
        }))
      ].filter((action2) => typeof service?.[action2.methodName] === "function");
    }
    function move(items, pile, allowStorage = true) {
      if (typeof service?.move !== "function") throw new Error("EA Item move is unavailable");
      return service.move(items, pile, allowStorage);
    }
    function snapshot() {
      const rawPiles = Object.fromEntries(INVENTORY_PILES2.map((pile) => [pile, readPile(pile)]));
      return createInventorySnapshot({
        piles: Object.fromEntries(INVENTORY_PILES2.map((pile) => [pile, rawPiles[pile].map((item) => toSnapshot(item, pile))])),
        capacities: Object.fromEntries(INVENTORY_PILES2.map((pile) => [pile, capacity(pile, rawPiles[pile])]))
      });
    }
    function resolveItem(ref, preferredPiles = INVENTORY_PILES2) {
      const id = Number(ref?.id || 0);
      const definitionId2 = Number(ref?.definitionId || 0);
      const piles = [...new Set([ref?.pile, ...preferredPiles || []].filter((pile) => INVENTORY_PILES2.includes(pile)))];
      for (const pile of piles) {
        const items = readPile(pile);
        const byId = id ? items.find((item) => Number(item?.id || 0) === id) : null;
        if (byId) return { item: byId, pile };
        const byDefinition = !id && definitionId2 ? items.find((item) => Number(item?.definitionId || 0) === definitionId2) : null;
        if (byDefinition) return { item: byDefinition, pile };
      }
      return null;
    }
    return Object.freeze({
      snapshot,
      resolveItem,
      readPile,
      pileValue,
      preparePurchasedItem,
      capacity,
      requestUnassigned,
      refreshActions,
      move,
      snapshotItem: toSnapshot
    });
  }

  // src/adapters/ea/localization.js
  function createEaLocalizationAdapter(runtime) {
    function localize(value) {
      if (!value) return "";
      try {
        const service = runtime?.services?.Localization;
        if (typeof service?.localize === "function") return service.localize(value);
      } catch {
      }
      return String(value || "");
    }
    return Object.freeze({ localize });
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
    function refreshAll() {
      const service = runtime?.services?.Store;
      if (typeof service?.getPacks !== "function") throw new Error("EA Store pack refresh is unavailable");
      return service.getPacks(runtime?.PurchasePackType?.ALL, true, true);
    }
    return Object.freeze({ list, resolve, open, refreshAll });
  }

  // src/adapters/ea/player-pick.js
  function createEaPlayerPickAdapter(runtime) {
    const service = runtime?.services?.Item;
    if (!service) throw new Error("EA Item service is unavailable");
    function collectionValues3(collection) {
      if (!collection) return [];
      if (typeof collection.values === "function") return Array.from(collection.values());
      if (Array.isArray(collection._collection)) return collection._collection;
      if (collection._collection && typeof collection._collection === "object") return Object.values(collection._collection);
      if (typeof collection === "object") return Object.values(collection);
      return [];
    }
    function unassignedItems() {
      try {
        return Array.from(runtime?.repositories?.Item?.getUnassignedItems?.() || []);
      } catch {
        return [];
      }
    }
    function storageItems() {
      try {
        if (typeof runtime?.repositories?.Item?.getStorageItems === "function") {
          return Array.from(runtime.repositories.Item.getStorageItems() || []);
        }
      } catch {
      }
      try {
        if (typeof runtime?.repositories?.Item?.getStorage === "function") {
          return collectionValues3(runtime.repositories.Item.getStorage());
        }
      } catch {
      }
      return collectionValues3(runtime?.repositories?.Item?.storage);
    }
    function transferItems() {
      try {
        if (typeof runtime?.repositories?.Item?.getTransferItems === "function") {
          return Array.from(runtime.repositories.Item.getTransferItems() || []);
        }
      } catch {
      }
      return collectionValues3(runtime?.repositories?.Item?.transfer);
    }
    function clubItems() {
      return collectionValues3(runtime?.repositories?.Item?.club?.items).concat(collectionValues3(service?.itemDao?.itemRepo?.club?.items));
    }
    function uniqueOwnedItems() {
      const seen = /* @__PURE__ */ new Set();
      return [
        ...unassignedItems(),
        ...storageItems(),
        ...transferItems(),
        ...clubItems()
      ].filter((item) => {
        const id = Number(item?.id || 0);
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    }
    function isPlayerPickItem(item) {
      try {
        if (item?.isPlayerPickItem?.()) return true;
      } catch {
      }
      return /player\s*pick/i.test(String(item?.name || item?.description || item?._staticData?.name || ""));
    }
    function sameLimitedUseType(left, right) {
      const leftType = left?.limitedUseType ?? left?._limitedUseType ?? null;
      const rightType = right?.limitedUseType ?? right?._limitedUseType ?? null;
      return leftType === null || rightType === null || String(leftType) === String(rightType);
    }
    function listUnassignedPlayerPicks() {
      return unassignedItems().filter(isPlayerPickItem);
    }
    function isOwnedDuplicate(item) {
      const itemId2 = Number(item?.id || 0);
      return uniqueOwnedItems().some(
        (ownedItem) => Number(ownedItem?.id || 0) !== itemId2 && Number(ownedItem?.definitionId || 0) === Number(item?.definitionId || -1) && sameLimitedUseType(ownedItem, item)
      );
    }
    function redeem(pickItem) {
      if (typeof service.redeem !== "function") throw new Error("EA Player Pick redeem is unavailable");
      return service.redeem(pickItem);
    }
    function confirmSelection(items) {
      if (typeof service.confirmPlayerPickItemSelection !== "function") {
        throw new Error("EA Player Pick confirmation is unavailable");
      }
      return service.confirmPlayerPickItemSelection(items);
    }
    return Object.freeze({ redeem, confirmSelection, listUnassignedPlayerPicks, isOwnedDuplicate });
  }

  // src/adapters/ea/rarity.js
  function safeRead3(holder, key) {
    try {
      return holder?.[key];
    } catch {
      return void 0;
    }
  }
  function call(holder, method, ...args) {
    try {
      return typeof holder?.[method] === "function" ? holder[method](...args) : null;
    } catch {
      return null;
    }
  }
  function colorValue(value) {
    if (!value) return null;
    if (typeof value === "string") return value;
    const channels = [value.r, value.g, value.b].map(Number);
    if (channels.every(Number.isFinite)) return { r: channels[0], g: channels[1], b: channels[2] };
    return null;
  }
  function firstColorMap(collection, tier) {
    if (!collection) return null;
    const candidates = [tier, Number(tier), 0, "0"].filter(
      (value, index, values) => value !== void 0 && value !== null && values.indexOf(value) === index
    );
    for (const key of candidates) {
      const value = call(collection, "get", key);
      if (value) return value;
    }
    try {
      if (typeof collection.values === "function") return Array.from(collection.values())[0] || null;
    } catch {
    }
    if (Array.isArray(collection)) return collection[0] || null;
    if (Array.isArray(collection._collection)) return collection._collection[0] || null;
    return null;
  }
  function createEaRarityAdapter(runtime) {
    const repository = safeRead3(safeRead3(runtime, "repositories"), "Rarity");
    function playerTheme(item = {}) {
      const rareflag = Number(item?.rareflag ?? item?.rareFlag ?? item?._rareflag ?? 0);
      if (!repository || rareflag <= 1) return null;
      const rarity = call(repository, "get", rareflag);
      if (!rarity) return null;
      const tier = item?.tier ?? call(item, "getTier") ?? 0;
      const map = call(rarity, "getExpColorMap", tier) || firstColorMap(safeRead3(rarity, "largeColorMaps"), tier) || firstColorMap(safeRead3(rarity, "colorMaps"), tier);
      if (!map) return null;
      const background = colorValue(safeRead3(map, "background"));
      const foreground = colorValue(safeRead3(map, "name"));
      if (!background) return null;
      return Object.freeze({
        background,
        foreground,
        accent: foreground,
        rareflag,
        source: "EA Rarity"
      });
    }
    return Object.freeze({ playerTheme });
  }

  // src/adapters/ea/sbc.js
  function createEaSbcAdapter(runtime) {
    const service = runtime?.services?.SBC;
    if (!service) throw new Error("EA SBC service is unavailable");
    function collectionValues3(collection) {
      if (!collection) return [];
      if (typeof collection.values === "function") return Array.from(collection.values());
      if (Array.isArray(collection._collection)) return collection._collection;
      if (collection._collection && typeof collection._collection === "object") return Object.values(collection._collection);
      if (Array.isArray(collection)) return collection;
      if (typeof collection === "object") return Object.values(collection);
      return [];
    }
    function listSets() {
      return collectionValues3(service?.repository?.sets?._collection);
    }
    function requestSets() {
      if (typeof service.requestSets !== "function") throw new Error("EA SBC set request is unavailable");
      return service.requestSets();
    }
    function requestChallengesForSet(set) {
      if (typeof service.requestChallengesForSet !== "function") {
        throw new Error("EA SBC challenge request is unavailable");
      }
      return service.requestChallengesForSet(set);
    }
    function loadChallenge(challenge) {
      if (typeof service.loadChallenge !== "function") throw new Error("EA SBC challenge load is unavailable");
      return service.loadChallenge(challenge);
    }
    function hasDaoGetChallengesForSet() {
      return typeof service?.sbcDAO?.getChallengesForSet === "function";
    }
    function getChallengesForSet(setId) {
      if (!hasDaoGetChallengesForSet()) throw new Error("EA SBC challenge DAO is unavailable");
      return service.sbcDAO.getChallengesForSet(Number(setId || 0));
    }
    function hasDaoLoadChallenge() {
      return typeof service?.sbcDAO?.loadChallenge === "function";
    }
    function loadDaoChallenge(challengeId, inProgress = false) {
      if (!hasDaoLoadChallenge()) throw new Error("EA SBC challenge DAO loader is unavailable");
      return service.sbcDAO.loadChallenge(Number(challengeId || 0), inProgress === true);
    }
    function formation(formationId) {
      try {
        return runtime?.repositories?.Squad?.getFormation?.(formationId) || null;
      } catch {
        return null;
      }
    }
    function createSquadController() {
      if (typeof runtime?.UTSBCSquadSplitViewController !== "function") {
        throw new Error("EA SBC squad controller is unavailable");
      }
      return new runtime.UTSBCSquadSplitViewController();
    }
    function eligibilityKeyName(key) {
      const keyText = String(key ?? "").trim();
      const known = Object.entries(runtime?.SBCEligibilityKey || {}).find(([, value]) => String(value) === keyText);
      if (known) return known[0];
      if (/^[A-Z][A-Z0-9_]+$/.test(keyText)) return keyText;
      return `UNKNOWN_${keyText || "?"}`;
    }
    function firstRequirementKey2(requirement) {
      if (requirement?.key !== void 0 && requirement?.key !== null) return requirement.key;
      try {
        const key = requirement?.getFirstKey?.();
        if (key !== void 0 && key !== null) return key;
      } catch {
      }
      const collection = requirement?.kvPairs?._collection || requirement?.kvPairs || {};
      return Object.keys(collection)[0];
    }
    function flattenValues2(value) {
      if (Array.isArray(value)) return value.flat(Infinity).filter((entry) => entry !== void 0 && entry !== null);
      if (value === void 0 || value === null) return [];
      return [value];
    }
    function requirementValues2(requirement, key) {
      const normalized = flattenValues2(requirement?.values);
      if (normalized.length) return normalized;
      try {
        const values = flattenValues2(requirement?.getValue?.(key));
        if (values.length) return values;
      } catch {
      }
      const collection = requirement?.kvPairs?._collection || requirement?.kvPairs || {};
      const direct = flattenValues2(collection?.[key]);
      if (direct.length) return direct;
      try {
        return flattenValues2(requirement?.getFirstValue?.(key));
      } catch {
        return [];
      }
    }
    function positiveInteger3(value) {
      const number = Number(value);
      return Number.isInteger(number) && number > 0 ? number : null;
    }
    function finiteNumberOrNull(value) {
      if (value === void 0 || value === null || value === "") return null;
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    }
    function firstPositiveInteger(values = []) {
      for (const value of values) {
        const number = positiveInteger3(value);
        if (number) return number;
      }
      return null;
    }
    function staticItemData(item) {
      try {
        return item?.getStaticData?.() || item?._staticData || item?.staticData || {};
      } catch {
        return item?._staticData || {};
      }
    }
    function isPlayerPickItem(item) {
      try {
        return item?.isPlayerPickItem?.() === true;
      } catch {
        return false;
      }
    }
    function metadataFieldHints(value) {
      if (!value || typeof value !== "object") return { keys: [], prototypeKeys: [], values: {} };
      let keys = [];
      let prototypeKeys = [];
      try {
        keys = Object.getOwnPropertyNames(value).sort().slice(0, 80);
      } catch {
      }
      try {
        const prototype = Object.getPrototypeOf(value);
        prototypeKeys = Object.getOwnPropertyNames(prototype || {}).filter((key) => key !== "constructor" && /(pick|choice|select|count|amount|option|resource|definition|asset|item)/i.test(key)).sort().slice(0, 40);
      } catch {
      }
      const values = {};
      for (const key of keys) {
        if (!/(pick|choice|select|count|amount|option|resource|definition|asset|item|name|description|id)/i.test(key)) continue;
        let field2;
        try {
          field2 = value[key];
        } catch {
          continue;
        }
        if (!["string", "number", "boolean"].includes(typeof field2)) continue;
        values[key] = typeof field2 === "string" ? field2.slice(0, 160) : field2;
      }
      return { keys, prototypeKeys, values };
    }
    function normalizeDiscoveryReward(award) {
      const item = award?.item || award?.utItem || award?.data?.item || null;
      if (!item || !isPlayerPickItem(item)) return null;
      const staticData = staticItemData(item);
      const definitionId2 = firstPositiveInteger([
        item?.definitionId,
        item?._data?.definitionId,
        staticData?.definitionId
      ]);
      const itemId2 = positiveInteger3(item?.id);
      return {
        type: "PLAYER_PICK",
        name: String(item?.name || staticData?.name || staticData?.description || "").trim(),
        description: String(item?.description || staticData?.description || "").trim(),
        resourceId: firstPositiveInteger([
          item?.resourceId,
          item?._data?.resourceId,
          staticData?.resourceId,
          itemId2 && definitionId2 && itemId2 === definitionId2 ? itemId2 : null
        ]),
        definitionId: definitionId2,
        candidateCount: firstPositiveInteger([
          item?.candidateCount,
          item?.totalCandidates,
          item?.numberOfChoices,
          item?.numChoices,
          staticData?.candidateCount,
          staticData?.totalCandidates,
          staticData?.numberOfChoices,
          staticData?.numChoices
        ]),
        selectionCount: firstPositiveInteger([
          item?.selectionCount,
          item?.availablePicks,
          item?.numberToSelect,
          staticData?.selectionCount,
          staticData?.availablePicks,
          staticData?.numberToSelect
        ]),
        metadataHints: {
          award: metadataFieldHints(award),
          item: metadataFieldHints(item),
          data: metadataFieldHints(item?._data || item?.data),
          staticData: metadataFieldHints(staticData)
        }
      };
    }
    function discoveryRequiredPlayerCount(challenge) {
      const explicit = firstPositiveInteger([
        challenge?.requiredPlayerCount,
        challenge?.playerCount,
        challenge?.numPlayers
      ]);
      if (explicit) return explicit;
      try {
        const squadCount = positiveInteger3(challenge?.squad?.getNumOfRequiredPlayers?.());
        if (squadCount) return squadCount;
      } catch {
      }
      if (!challenge?.squad) return null;
      const challengeFormation = formation(challenge?.formation);
      const formationCount = positiveInteger3(challengeFormation?.generalPositions?.length);
      if (!formationCount) return null;
      try {
        const brickCount = challenge.squad.getAllBrickIndices?.()?.length;
        if (Number.isInteger(brickCount) && brickCount >= 0 && brickCount < formationCount) {
          return formationCount - brickCount;
        }
      } catch {
      }
      const simpleBrickCount = Array.isArray(challenge.squad?.simpleBrickIndices) ? challenge.squad.simpleBrickIndices.length : null;
      if (Number.isInteger(simpleBrickCount) && simpleBrickCount >= 0 && simpleBrickCount < formationCount) {
        return formationCount - simpleBrickCount;
      }
      return null;
    }
    function normalizeDiscoveryChallenge(challenge) {
      return {
        id: positiveInteger3(challenge?.id),
        status: String(challenge?.status || challenge?.state || ""),
        completed: challenge?.completed === true || (() => {
          try {
            return challenge?.isCompleted?.() === true;
          } catch {
            return false;
          }
        })(),
        requiredPlayerCount: discoveryRequiredPlayerCount(challenge),
        eligibilityRequirements: (challenge?.eligibilityRequirements || []).map((requirement) => {
          const key = firstRequirementKey2(requirement);
          return {
            key: eligibilityKeyName(key),
            values: requirementValues2(requirement, key),
            count: Number.isFinite(Number(requirement?.count)) ? Number(requirement.count) : null
          };
        })
      };
    }
    function snapshotDiscoverySet(set, challenges = null) {
      const rawAwards = collectionValues3(set?.awards || set?.data?.awards);
      const rawChallenges = challenges === null ? collectionValues3(set?.challenges || set?._challenges) : collectionValues3(challenges);
      return {
        id: positiveInteger3(set?.id),
        name: String(set?.name || set?.data?.name || "").trim(),
        status: String(set?.status || set?.state || ""),
        complete: (() => {
          try {
            return set?.isComplete?.() === true || set?.complete === true || set?.completed === true;
          } catch {
            return false;
          }
        })(),
        timesCompleted: finiteNumberOrNull(set?.timesCompleted),
        repeats: finiteNumberOrNull(set?.repeats),
        rewards: rawAwards.map(normalizeDiscoveryReward).filter(Boolean),
        challenges: rawChallenges.map(normalizeDiscoveryChallenge)
      };
    }
    function canLoadChallengeData() {
      return typeof service.loadChallengeData === "function";
    }
    function submissionOptions() {
      let skipValidation = false;
      let chemistryEnabled = false;
      try {
        skipValidation = runtime?.services?.UserSettings?.getSBCValidationSkip?.() || false;
      } catch {
      }
      try {
        chemistryEnabled = runtime?.services?.Chemistry?.isFeatureEnabled?.() || false;
      } catch {
      }
      return { skipValidation: skipValidation === true, chemistryEnabled: chemistryEnabled === true };
    }
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
    return Object.freeze({
      listSets,
      requestSets,
      requestChallengesForSet,
      loadChallenge,
      hasDaoGetChallengesForSet,
      getChallengesForSet,
      hasDaoLoadChallenge,
      loadDaoChallenge,
      formation,
      createSquadController,
      eligibilityKeyName,
      snapshotDiscoverySet,
      canLoadChallengeData,
      submissionOptions,
      saveChallenge,
      loadChallengeData,
      submitChallenge
    });
  }

  // src/adapters/index.js
  function createRuntimeAdapters(runtime, documentObject = runtime?.document || globalThis.document, options = {}) {
    const userscriptApi = options.userscriptApi || runtime?.__FCLoopRunnerUserscriptApi || {};
    const localStorage = createStorageAdapter(runtime?.localStorage);
    const sessionStorage = createStorageAdapter(runtime?.sessionStorage);
    const dom = createDomAdapter(documentObject, runtime);
    const page = createPageRuntimeAdapter(runtime, dom);
    const http = createHttpAdapter({
      gmRequest: options.gmRequest || userscriptApi.request,
      fetchImpl: options.fetchImpl || runtime?.fetch,
      runtimeFallback: runtime?.__FCLoopRunnerRequestText
    });
    return Object.freeze({
      inventory: (options2 = {}) => createEaInventoryAdapter(runtime, options2),
      localization: createEaLocalizationAdapter(runtime),
      pack: () => createEaPackAdapter(runtime),
      playerPick: () => createEaPlayerPickAdapter(runtime),
      rarity: createEaRarityAdapter(runtime),
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
        deleteValue: options.gmDeleteValue || userscriptApi.deleteValue
      })
    });
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
    const definitionId2 = Number(item?.definitionId || item?.ref?.definitionId || 0);
    return preferredRefs.some((ref) => ref.id ? ref.id === id : ref.definitionId > 0 && ref.definitionId === definitionId2);
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
  function resolveHighGoldThreshold(requirement = {}) {
    const raw = requirement.highGoldThreshold ?? requirement.protectHighGoldMinRating ?? 82;
    const value = Number(raw);
    return Math.max(2, Math.min(99, Number.isFinite(value) && value > 0 ? value : 82));
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
    if (requirement.protectHighGold && item.tier === "gold" && item.rating >= resolveHighGoldThreshold(requirement)) {
      reasons.push("protected-high-gold");
    }
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
  function requirementSelectionPhases(requirement = {}) {
    const preferCommon = requirement.preferCommon === true && requirement.tier === "gold" && requirement.rarity === void 0;
    if (!preferCommon) return [requirement];
    return [
      { ...requirement, rarity: "common" },
      { ...requirement, rarity: "rare" }
    ];
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
      const piles = applyPilePriority(requirement.priorityPiles || defaultPiles, fsuPolicy).filter((pile) => INVENTORY_PILES2.includes(pile));
      for (const phaseRequirement of requirementSelectionPhases(requirement)) {
        if (need <= 0) break;
        for (const pileName of piles) {
          if (need <= 0) break;
          const preferredRefs = pileName === "unassigned" || pileName === "transfer" ? preferredSignalRefs : [];
          const candidates = sortCandidates(snapshot.piles[pileName] || [], phaseRequirement, fsuPolicy, preferredRefs);
          for (const candidate of candidates) {
            if (need <= 0) break;
            if (selectedIds.has(candidate.id) || selectedDefinitionIds.has(candidate.definitionId)) continue;
            const reasons = rejectionReasons(candidate, phaseRequirement, fsuPolicy, requirementProtection);
            if (reasons.length) {
              diagnostics.push({ pileName, itemRef: candidate.ref, reasons });
              continue;
            }
            let item = candidate;
            let signal = null;
            if (pileName === "unassigned" || pileName === "transfer") {
              if (!candidate.duplicate) continue;
              item = findSubmissionItem(candidate, snapshot, submissionIds, phaseRequirement, fsuPolicy, requirementProtection);
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

  // src/selection/rating-candidates.js
  function buildRatingCandidateEntries(options = {}) {
    const {
      model,
      settings,
      piles = [],
      getPileItems,
      submissionItems = [],
      isSafe,
      isDuplicate,
      pileNeedsDuplicateSignalResolution,
      sortFodder,
      isSpecialItem,
      broadSpec = {},
      now = Date.now
    } = options;
    const startedAt = now();
    const byItemId = /* @__PURE__ */ new Map();
    const resolvedSignals = {};
    const safetyCache = /* @__PURE__ */ new Map();
    const cachedIsSafe = (item) => {
      const itemId2 = Number(item?.id || 0);
      if (!itemId2) return false;
      if (!safetyCache.has(itemId2)) safetyCache.set(itemId2, isSafe(item));
      return safetyCache.get(itemId2);
    };
    const safeSubmissionItems = submissionItems.filter(cachedIsSafe);
    const submissionById = /* @__PURE__ */ new Map();
    const submissionByDefinition = /* @__PURE__ */ new Map();
    for (const item of safeSubmissionItems) {
      const itemId2 = Number(item?.id || 0);
      const definitionId2 = Number(item?.definitionId || 0);
      if (itemId2) submissionById.set(itemId2, item);
      if (!definitionId2) continue;
      const entries = submissionByDefinition.get(definitionId2) || [];
      entries.push(item);
      submissionByDefinition.set(definitionId2, entries);
    }
    for (const entries of submissionByDefinition.values()) {
      const sorted = sortFodder(entries, broadSpec, settings);
      entries.splice(0, entries.length, ...sorted);
    }
    function resolveSignal(sourceItem) {
      const duplicateId = Number(sourceItem?.duplicateId || 0);
      if (duplicateId && submissionById.has(duplicateId)) return submissionById.get(duplicateId);
      const definitionId2 = Number(sourceItem?.definitionId || 0);
      return submissionByDefinition.get(definitionId2)?.[0] || null;
    }
    const requirementCache = /* @__PURE__ */ new Map();
    let scannedItems = 0;
    for (const [pileRank, pileName] of piles.entries()) {
      for (const sourceItem of getPileItems(pileName)) {
        scannedItems++;
        let item = sourceItem;
        let signal = null;
        if (pileNeedsDuplicateSignalResolution(pileName)) {
          if (!isDuplicate(sourceItem)) continue;
          item = resolveSignal(sourceItem);
          if (!item) continue;
          signal = sourceItem;
        }
        const itemId2 = Number(item?.id || 0);
        const definitionId2 = Number(item?.definitionId || 0);
        if (!itemId2 || !definitionId2 || byItemId.has(itemId2)) continue;
        if (!cachedIsSafe(item)) continue;
        if (!requirementCache.has(itemId2)) {
          requirementCache.set(itemId2, model.constraints.map((constraint) => constraint.matches(item)));
        }
        const requirementMatches = requirementCache.get(itemId2);
        byItemId.set(itemId2, {
          item,
          signal,
          pileName,
          pileRank,
          requirementMatches,
          special: isSpecialItem(item)
        });
        if (signal) resolvedSignals[pileName] = (resolvedSignals[pileName] || 0) + 1;
      }
    }
    const byDefinition = /* @__PURE__ */ new Map();
    for (const entry of byItemId.values()) {
      const definitionId2 = Number(entry.item?.definitionId || 0);
      const existing = byDefinition.get(definitionId2);
      if (!existing || entry.pileRank < existing.pileRank || entry.pileRank === existing.pileRank && Number(entry.item?.id || 0) < Number(existing.item?.id || 0)) {
        byDefinition.set(definitionId2, entry);
      }
    }
    return {
      entries: [...byDefinition.values()],
      piles,
      resolvedSignals,
      buildMs: now() - startedAt,
      scannedItems
    };
  }
  async function selectRatingCandidateEntries(options = {}) {
    const {
      candidateEntries = [],
      model,
      piles = [],
      searchOptions = {},
      createSnapshot,
      selectPlayers,
      control
    } = options;
    const liveById = /* @__PURE__ */ new Map();
    const snapshotEntries = candidateEntries.map((entry) => {
      const item = createSnapshot(entry.item, entry.pileName);
      const signal = entry.signal ? createSnapshot(entry.signal, entry.pileName) : null;
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
    const plan = await selectPlayers({
      mode: "rating",
      candidateEntries: snapshotEntries,
      ratingModel: model,
      priorityPiles: piles,
      searchOptions,
      control
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
      return {
        ok: false,
        reason: "rating selection item became stale during plan resolution",
        nodes: Number(plan.details.nodes || 0)
      };
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

  // src/selection/transient-signals.js
  function refKey(ref = {}) {
    const id = Number(ref?.id || 0);
    if (id) return `id:${id}`;
    return `definition:${Number(ref?.definitionId || 0)}:${String(ref?.pile || "unassigned")}`;
  }
  function entrySignalRef(entry = {}) {
    return entry.signalRef || entry.signal?.ref || entry.signal || null;
  }
  function entryItemRef(entry = {}) {
    return entry.itemRef || entry.item?.ref || entry.item || null;
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
  function selectedUnassignedSignalRefs(selection) {
    return (selection?.entries || []).filter((entry) => entry.pileName === "unassigned" && entrySignalRef(entry)).map((entry) => {
      const signal = entrySignalRef(entry);
      const item = entryItemRef(entry);
      return {
        id: Number(signal?.id || 0),
        definitionId: Number(signal?.definitionId || 0),
        duplicateId: Number(entry.signal?.duplicateId || signal?.duplicateId || item?.id || 0),
        pile: "unassigned"
      };
    });
  }
  function submittedUnassignedSignalRefs(selection, submittedItemRefs = []) {
    const submittedIds = new Set((submittedItemRefs || []).map((ref) => Number(ref?.id || ref?.ref?.id || 0)).filter(Boolean));
    if (!submittedIds.size) return [];
    return selectedUnassignedSignalRefs(selection).filter((ref) => submittedIds.has(Number(ref.duplicateId || 0)));
  }
  function evaluateUnassignedSignalCoverage(selection, availableCount, capacity) {
    const available = Math.max(0, Number(availableCount || 0));
    const slotCapacity = Math.max(0, Number(capacity || 0));
    const expectedCount = Math.min(available, slotCapacity);
    const selectedCount = selectedUnassignedSignalRefs(selection).length;
    return {
      availableCount: available,
      capacity: slotCapacity,
      expectedCount,
      selectedCount,
      sufficient: expectedCount === 0 || selectedCount >= expectedCount
    };
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
    if (context.dryRun) {
      await runValidators(options.preSaveValidators, context, "pre-save");
      return createSubmissionResult({
        status: "planned",
        submitted: false,
        challengeRef: context.challengeRef || { id: context.challenge?.id || null },
        consumedItemRefs: squadPlan.itemRefs || []
      });
    }
    let accessToken;
    try {
      if (options.prepareRuntimeAccess) {
        const access = await options.prepareRuntimeAccess(context);
        context.runtimeAccess = access || null;
        if (access?.ok === false) {
          return createSubmissionResult({
            status: "blocked",
            submitted: false,
            challengeRef: context.challengeRef || { id: context.challenge?.id || null },
            consumedItemRefs: squadPlan.itemRefs || [],
            reason: access.reason || "runtime inventory validation failed"
          });
        }
        if (Array.isArray(access?.players)) {
          context.players = access.players;
          context.squadPlan = {
            ...context.squadPlan,
            players: access.players,
            itemRefs: access.itemRefs || context.squadPlan.itemRefs
          };
        }
        accessToken = access?.token;
      }
      await runValidators(options.preSaveValidators, context, "pre-save");
      await options.saveSquad?.(context);
      if (options.reloadSquad) await options.reloadSquad(context);
      if (options.readSavedPlayers) context.savedPlayers = await options.readSavedPlayers(context);
      await runValidators(options.postSaveValidators, context, "post-save");
      if (options.prepareOnly === true) {
        return createSubmissionResult({
          status: "prepared",
          submitted: false,
          challengeRef: context.challengeRef || { id: context.challenge?.id || null },
          consumedItemRefs: context.squadPlan.itemRefs || []
        });
      }
      const submitReady = options.isSubmitReady ? await options.isSubmitReady(context) : true;
      if (!submitReady) {
        return createSubmissionResult({
          status: "blocked",
          submitted: false,
          challengeRef: context.challengeRef || { id: context.challenge?.id || null },
          consumedItemRefs: context.squadPlan.itemRefs || [],
          reason: "saved squad is not submit ready"
        });
      }
      const transportResult = await options.submitTransport?.(context);
      if (transportResult?.submitted === false || transportResult?.ok === false) {
        return createSubmissionResult({
          status: "blocked",
          submitted: false,
          challengeRef: context.challengeRef || { id: context.challenge?.id || null },
          consumedItemRefs: context.squadPlan.itemRefs || [],
          reason: transportResult?.reason || "SBC submit transport failed"
        });
      }
      const result = createSubmissionResult({
        status: "submitted",
        submitted: true,
        challengeRef: context.challengeRef || { id: context.challenge?.id || null },
        consumedItemRefs: context.squadPlan.itemRefs || [],
        rewardPackId: transportResult?.rewardPackId
      });
      if (options.afterSubmit) await options.afterSubmit({ ...context, result, transportResult });
      return result;
    } finally {
      if (options.releaseRuntimeAccess) await options.releaseRuntimeAccess({ ...context, token: accessToken });
    }
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

  // src/sbc/fsu-runtime-access.js
  var CRITICAL_SNAPSHOT_FIELDS = Object.freeze([
    "id",
    "definitionId",
    "rating",
    "rareflag",
    "rare",
    "special",
    "tradeable",
    "leagueId",
    "evolution",
    "limitedUse",
    "concept",
    "academyEnrolled",
    "activeTrade",
    "endTime"
  ]);
  function itemRefKey(ref = {}) {
    return `${Number(ref.id || 0)}:${Number(ref.definitionId || 0)}`;
  }
  function describeRef(ref = {}) {
    const id = Number(ref.id || 0) || "?";
    const definitionId2 = Number(ref.definitionId || 0) || "?";
    return `#${id}/def:${definitionId2}`;
  }
  function criticalSnapshotSignature(snapshot = {}) {
    const critical = Object.fromEntries(
      CRITICAL_SNAPSHOT_FIELDS.map((field2) => [field2, snapshot[field2]])
    );
    critical.groups = [...snapshot.groups || []].map(Number).sort((a, b) => a - b);
    return JSON.stringify(critical);
  }
  async function prepareFsuProvisionalClubAccess(options = {}) {
    const readiness = options.readiness || {};
    if (!readiness.detected || readiness.fullyValidated !== false) return { ok: true };
    const players = Array.isArray(options.players) ? options.players : [];
    const itemRefs = Array.isArray(options.itemRefs) ? options.itemRefs : [];
    const clubEntries = itemRefs.map((ref, index) => ({ ref, index, player: players[index] })).filter((entry) => entry.ref?.pile === "club");
    if (!clubEntries.length) return { ok: true };
    const label = options.label || "SBC";
    const snapshotItem = options.snapshotItem;
    if (typeof snapshotItem !== "function") throw new TypeError("snapshotItem is required");
    if (typeof options.validateClubPlayers !== "function") throw new TypeError("validateClubPlayers is required");
    const clubRefs = clubEntries.map((entry) => entry.ref);
    options.log?.(`${label}: validating ${clubRefs.length} provisional Club player(s) against EA before save`);
    const validation = await options.validateClubPlayers(clubRefs, {
      label: `${label} targeted Club validation`
    });
    if (!validation?.ok) {
      const missing2 = (validation?.missing || []).map(describeRef).join(", ");
      return {
        ok: false,
        reason: validation?.reason || `FSU provisional Club validation failed${missing2 ? ` for ${missing2}` : ""}`
      };
    }
    const validatedByRef = new Map(
      (validation.items || []).map((item) => [itemRefKey(item), item])
    );
    const missing = clubEntries.filter((entry) => !validatedByRef.has(itemRefKey(entry.ref)));
    if (missing.length) {
      return {
        ok: false,
        reason: `FSU provisional Club validation did not return ${missing.map((entry) => describeRef(entry.ref)).join(", ")}`
      };
    }
    const changed = clubEntries.filter((entry) => {
      if (!entry.player) return true;
      const refreshed = validatedByRef.get(itemRefKey(entry.ref));
      const before = snapshotItem(entry.player, "club");
      const after = snapshotItem(refreshed, "club");
      return criticalSnapshotSignature(before) !== criticalSnapshotSignature(after);
    });
    if (changed.length) {
      return {
        ok: false,
        reason: `FSU provisional Club data changed for ${changed.map((entry) => describeRef(entry.ref)).join(", ")}; restart the Loop so selection uses the refreshed items`
      };
    }
    const refreshedPlayers = players.map((player, index) => {
      const ref = itemRefs[index];
      return ref?.pile === "club" ? validatedByRef.get(itemRefKey(ref)) : player;
    });
    options.log?.(`${label}: provisional Club validation passed in ${Number(validation.elapsed || 0)}ms`);
    return {
      ok: true,
      players: refreshedPlayers,
      itemRefs,
      refreshedClubPlayers: true,
      validatedClubRefs: clubRefs
    };
  }

  // src/sbc/navigation-sync.js
  function isSbcSquadControllerName(name) {
    return /UTSBCSquadSplitViewController/i.test(String(name || ""));
  }
  function isSbcControllerName(name) {
    return /^UTSBC/i.test(String(name || ""));
  }
  async function unwindSbcSquadControllers(options = {}) {
    const label = String(options.label || "SBC navigation");
    const maxPops = Math.max(0, Number(options.maxPops ?? 20) || 0);
    const currentController = options.currentController;
    const currentControllerName = options.currentControllerName;
    const popController = options.popController;
    const waitLoadingEnd = options.waitLoadingEnd;
    const sleep = options.sleep;
    const log = options.log || (() => {
    });
    if (typeof currentController !== "function") throw new TypeError("currentController is required");
    if (typeof currentControllerName !== "function") throw new TypeError("currentControllerName is required");
    if (typeof popController !== "function") throw new TypeError("popController is required");
    if (typeof waitLoadingEnd !== "function") throw new TypeError("waitLoadingEnd is required");
    if (typeof sleep !== "function") throw new TypeError("sleep is required");
    let popped = 0;
    while (isSbcSquadControllerName(currentControllerName()) && popped < maxPops) {
      const controller = currentController();
      if (popController(true) !== true) {
        log(`${label}: cannot exit ${currentControllerName() || "SBC squad"}; navigation pop method is unavailable`);
        break;
      }
      popped++;
      await waitLoadingEnd(350, 1e4).catch(() => null);
      for (let wait = 0; wait < 12 && currentController() === controller; wait++) await sleep(250);
      if (currentController() === controller) {
        log(`${label}: SBC squad controller did not change after navigation pop ${popped}`);
        break;
      }
    }
    if (popped) {
      log(`${label}: removed ${popped} stale SBC squad view(s); current controller ${currentControllerName() || "unknown"}`);
    }
    return popped;
  }
  async function synchronizeAfterSbcSubmit(options = {}) {
    const label = String(options.label || "SBC submit");
    const currentControllerName = options.currentControllerName;
    const unwind = options.unwind;
    const showUnassigned = options.showUnassigned;
    const openStorePacks = options.openStorePacks;
    const log = options.log || (() => {
    });
    if (typeof currentControllerName !== "function") throw new TypeError("currentControllerName is required");
    if (typeof unwind !== "function") throw new TypeError("unwind is required");
    if (typeof showUnassigned !== "function") throw new TypeError("showUnassigned is required");
    if (typeof openStorePacks !== "function") throw new TypeError("openStorePacks is required");
    const before = currentControllerName() || "unknown";
    await unwind(`${label} post-submit`);
    await showUnassigned(`${label} post-submit navigation sync`);
    let after = currentControllerName() || "unknown";
    if (isSbcSquadControllerName(after)) {
      await unwind(`${label} post-unassigned`);
      after = currentControllerName() || "unknown";
    }
    if (isSbcControllerName(after)) {
      log(`${label}: controller is still ${after} in the SBC area after navigation cleanup; opening Store Packs as a final fallback`);
      await openStorePacks(`${label} post-submit Store sync`).catch((error) => {
        log(`${label}: post-submit Store sync skipped: ${error?.message || error}`);
        return false;
      });
      after = currentControllerName() || "unknown";
    }
    log(`${label}: post-submit controller ${before} -> ${after}`);
    return { before, after };
  }

  // src/sbc/player-pick-discovery-scan.js
  async function scanPlayerPickSbcSnapshots(options = {}) {
    if (typeof options.refreshSets !== "function") throw new TypeError("refreshSets is required");
    if (typeof options.listSets !== "function") throw new TypeError("listSets is required");
    if (typeof options.snapshotSet !== "function") throw new TypeError("snapshotSet is required");
    if (typeof options.loadChallenges !== "function") throw new TypeError("loadChallenges is required");
    if (typeof options.parseSnapshot !== "function") throw new TypeError("parseSnapshot is required");
    await options.refreshSets();
    const sets = options.listSets() || [];
    const results = [];
    for (const set of sets) {
      const initial = options.snapshotSet(set);
      const hasPlayerPickReward = (initial?.rewards || []).some((reward) => reward?.type === "PLAYER_PICK");
      if (!hasPlayerPickReward) continue;
      let challenges = initial?.challenges || [];
      let loadError = null;
      if (initial?.complete !== true) {
        try {
          challenges = await options.loadChallenges(set, initial);
        } catch (error) {
          loadError = error;
        }
      }
      const snapshot = options.snapshotSet(set, challenges);
      const parsed = options.parseSnapshot(snapshot);
      const result = {
        set,
        snapshot,
        parsed: loadError && parsed.status === "supported" ? { ...parsed, status: "unsupported", loop: null, diagnostics: [`challenge metadata load failed: ${loadError?.message || loadError}`] } : parsed,
        loadError
      };
      results.push(result);
      await options.onResult?.(result);
    }
    return { setsScanned: sets.length, pickSets: results.length, results };
  }

  // src/reward/sbc-claim.js
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
  async function claimSbcRewards(options = {}) {
    const {
      label = "SBC submit",
      beforePackCounts,
      beforeProgress,
      overlay,
      getPackCounts,
      getProgress,
      refreshPacks,
      popupShieldShowing,
      click,
      keyStroke,
      waitLoadingEnd,
      sleep,
      stopPoint,
      failIfSubmitError,
      log,
      now = Date.now
    } = options;
    const startedAt = now();
    let lastHotkeyAt = 0;
    let lastPackRefreshAt = 0;
    while (now() - startedAt < 25e3) {
      stopPoint();
      failIfSubmitError(label);
      if (await overlay.dismiss(label)) continue;
      const button3 = overlay.findClaimButton();
      if (button3) {
        log(`${label}: claiming rewards`);
        click(button3);
        await waitLoadingEnd(900, 45e3);
        await sleep(1200);
        return true;
      }
      const elapsed = now() - startedAt;
      if (elapsed >= 1500) {
        const progressAdvanced = beforeProgress ? hasSbcProgressAdvanced(beforeProgress, getProgress()) : false;
        let packGranted = beforePackCounts ? hasPackCountIncrease(beforePackCounts, getPackCounts()) : false;
        if (!packGranted && beforePackCounts && elapsed - lastPackRefreshAt >= 2500) {
          lastPackRefreshAt = elapsed;
          await refreshPacks().catch(() => null);
          packGranted = hasPackCountIncrease(beforePackCounts, getPackCounts());
        }
        if ((progressAdvanced || packGranted) && !overlay.isVisible() && !popupShieldShowing()) {
          log(`${label}: rewards already granted (${packGranted ? "My Packs increased" : "SBC progress advanced"}); skipping Claim Rewards wait`);
          return true;
        }
      }
      const context2 = overlay.findClaimContext();
      const currentTime = now();
      if (context2 && currentTime - lastHotkeyAt > 2500) {
        lastHotkeyAt = currentTime;
        log(`${label}: Claim Rewards button not clickable; trying AltRight reward hotkey`);
        keyStroke("Alt", "AltRight", { altKey: true, location: 2 });
        keyStroke("AltRight", "AltRight", { altKey: true, location: 2 });
        await waitLoadingEnd(500, 12e3);
        await sleep(1200);
        return true;
      }
      await sleep(500);
    }
    const context = overlay.findClaimContext();
    const contextText = context?.text ? `; modal text: ${context.text.slice(0, 180)}` : "";
    log(`${label}: Claim Rewards button not detected${contextText}; continuing`);
    return false;
  }

  // src/reward/player-pick.js
  function itemDefinitionId(item) {
    return Number(item?.definitionId || 0);
  }
  function itemIdentityIds(item) {
    const definitionId2 = Number(item?.definitionId || 0);
    const itemId2 = Number(item?.id || 0);
    return [...new Set([
      definitionId2,
      Number(item?.resourceId || 0),
      Number(item?._data?.resourceId || 0),
      Number(item?._staticData?.resourceId || 0),
      itemId2 && definitionId2 && itemId2 === definitionId2 ? itemId2 : 0
    ].filter((value) => Number.isFinite(value) && value > 0))];
  }
  function playerPickItemName(item) {
    return String(item?._staticData?.name || item?.name || item?.description || `Player Pick #${item?.id || "?"}`);
  }
  function playerPickMatchesReward(item, acceptedNames = [], acceptedResourceIds = []) {
    const patterns = Array.isArray(acceptedNames) ? acceptedNames : acceptedNames === void 0 || acceptedNames === null ? [] : [acceptedNames];
    const resourceIds = new Set((acceptedResourceIds || []).map(Number).filter((value) => Number.isFinite(value) && value > 0));
    if (resourceIds.size) return itemIdentityIds(item).some((id) => resourceIds.has(id));
    const name = playerPickItemName(item).toLowerCase();
    return patterns.some((pattern) => name.includes(String(pattern).toLowerCase()));
  }
  function partitionPendingPlayerPicks(items, acceptedNames = [], acceptedResourceIds = []) {
    const matches = (item) => playerPickMatchesReward(item, acceptedNames, acceptedResourceIds);
    const picks = items || [];
    return {
      matching: picks.filter(matches),
      unexpected: picks.filter((item) => !matches(item))
    };
  }
  function classifyPendingPlayerPicks(items, acceptedNames = [], acceptedResourceIds = []) {
    const partitioned = partitionPendingPlayerPicks(items, acceptedNames, acceptedResourceIds);
    return {
      matching: partitioned.matching[0] || null,
      unexpected: partitioned.unexpected[0] || null
    };
  }
  function rankPlayerPickCandidates(items, prices = /* @__PURE__ */ new Map(), options = {}) {
    const isSpecial2 = options.isSpecial || (() => false);
    const isDuplicate = options.isDuplicate || (() => false);
    return (items || []).map((item, index) => ({
      item,
      index,
      rating: Number(item?.rating || 0),
      special: isSpecial2(item) === true,
      duplicate: isDuplicate(item) === true,
      price: prices.has(itemDefinitionId(item)) ? prices.get(itemDefinitionId(item)) : null
    })).sort(
      (a, b) => b.rating - a.rating || Number(b.special) - Number(a.special) || Number(a.duplicate) - Number(b.duplicate) || (b.price ?? -1) - (a.price ?? -1) || a.index - b.index
    );
  }
  function capturePlayerPickSelections(selected, ranked, options = {}) {
    const isSpecial2 = options.isSpecial || (() => false);
    const isDuplicate = options.isDuplicate || (() => false);
    return (selected || []).map((item) => {
      const candidate = ranked.find((entry) => entry.item === item);
      return {
        item,
        rating: candidate?.rating ?? Number(item?.rating || 0),
        special: candidate?.special ?? isSpecial2(item) === true,
        duplicate: candidate?.duplicate ?? isDuplicate(item) === true,
        price: candidate?.price ?? null
      };
    });
  }
  function getManualPlayerPickReason(ranked, pickCount) {
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

  // src/reward/player-prices.js
  function definitionIds(items) {
    return [...new Set((items || []).map((item) => Number(item?.definitionId || 0)).filter(Boolean))];
  }
  function parseJson(text, source) {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`${source} returned invalid JSON`);
    }
  }
  function futGgPrices(text) {
    const prices = /* @__PURE__ */ new Map();
    const response = parseJson(text, "FUT.GG");
    for (const entry of response?.data || []) {
      const definitionId2 = Number(entry?.eaId || entry?.definitionId || 0);
      const price = Number(entry?.price);
      if (definitionId2 && Number.isFinite(price) && price > 0) prices.set(definitionId2, price);
    }
    return prices;
  }
  function futNextPrices(text) {
    const prices = /* @__PURE__ */ new Map();
    const response = parseJson(text, "FUTNext");
    for (const entry of Array.isArray(response) ? response : []) {
      const definitionId2 = Number(entry?.definitionId || entry?.eaId || 0);
      const price = Number(entry?.prices?.[0]);
      if (definitionId2 && Number.isFinite(price) && price > 0) prices.set(definitionId2, price);
    }
    return prices;
  }
  async function loadPlayerPickPrices(options = {}) {
    if (typeof options.requestText !== "function") throw new TypeError("requestText is required");
    const ids = definitionIds(options.items);
    const platform = String(options.platform || "pc").toLowerCase();
    const result = {
      prices: /* @__PURE__ */ new Map(),
      ids,
      source: null,
      attempts: []
    };
    if (!ids.length) return result;
    const futGgUrl = `https://www.fut.gg/api/fut/player-prices/26/?ids=${encodeURIComponent(ids.join(","))}&platform=${encodeURIComponent(platform)}`;
    try {
      const text = await options.requestText(futGgUrl, {
        sendCookies: true,
        headers: {
          Accept: "application/json, text/plain, */*",
          Referer: options.referer || "",
          "X-Requested-With": "XMLHttpRequest"
        }
      });
      result.prices = futGgPrices(text);
      result.attempts.push({ source: "FUT.GG", status: result.prices.size ? "loaded" : "empty" });
      if (result.prices.size) {
        result.source = "FUT.GG";
        return result;
      }
    } catch (error) {
      result.attempts.push({ source: "FUT.GG", status: "error", reason: error?.message || String(error) });
    }
    const futNextUrl = `https://enhancer-api.futnext.com/players/prices?ids=${encodeURIComponent(ids.join("_"))}&platform=${encodeURIComponent(platform)}`;
    try {
      const text = await options.requestText(futNextUrl, {
        sendCookies: false,
        headers: { Accept: "application/json, text/plain, */*" }
      });
      result.prices = futNextPrices(text);
      result.attempts.push({ source: "FUTNext", status: result.prices.size ? "loaded" : "empty" });
      if (result.prices.size) result.source = "FUTNext";
    } catch (error) {
      result.attempts.push({ source: "FUTNext", status: "error", reason: error?.message || String(error) });
    }
    return result;
  }

  // src/reward/pack-highlight.js
  var DEFAULT_REWARD_ALERT_SETTINGS = Object.freeze({
    enabled: true,
    minimumRating: 94,
    highlightEnabled: true,
    desktopEnabled: false,
    ntfyEnabled: false,
    ntfyServer: "https://ntfy.sh",
    ntfyTopic: "",
    ntfyToken: ""
  });
  function boundedRating(value, fallback = 94) {
    const rating = Number(value);
    return Number.isFinite(rating) ? Math.max(1, Math.min(99, Math.floor(rating))) : fallback;
  }
  function normalizedText3(value) {
    return String(value || "").trim();
  }
  function normalizeRewardAlertSettings(input = {}) {
    return Object.freeze({
      enabled: input.enabled !== false,
      minimumRating: boundedRating(input.minimumRating, DEFAULT_REWARD_ALERT_SETTINGS.minimumRating),
      highlightEnabled: input.highlightEnabled !== false,
      desktopEnabled: input.desktopEnabled === true,
      ntfyEnabled: input.ntfyEnabled === true,
      ntfyServer: normalizedText3(input.ntfyServer) || DEFAULT_REWARD_ALERT_SETTINGS.ntfyServer,
      ntfyTopic: normalizedText3(input.ntfyTopic),
      ntfyToken: normalizedText3(input.ntfyToken)
    });
  }
  function displayName(item = {}) {
    return normalizedText3(item.name || item.commonName || item.lastName || item.definitionId || item.id) || "Unknown player";
  }
  function createPackHighlightModel(receipt = {}, settingsInput = {}, context = {}) {
    const settings = normalizeRewardAlertSettings(settingsInput);
    if (!settings.enabled) return null;
    const assumedSpecial = context.assumeSpecialPlayers === true || receipt.details?.assumeTotwReward === true;
    const cards = (receipt.openedItems || []).filter((item) => String(item?.type || "").toLowerCase() === "player").map((item) => ({
      id: Number(item.id || 0),
      definitionId: Number(item.definitionId || 0),
      name: displayName(item),
      rating: Number(item.rating || 0),
      special: item.special === true || assumedSpecial,
      duplicate: item.duplicate === true,
      tradeable: item.tradeable === true
    })).filter((card) => card.special && card.rating >= settings.minimumRating).sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
    if (!cards.length) return null;
    return Object.freeze({
      pack: Object.freeze({
        id: Number(receipt.packRef?.id || 0),
        name: normalizedText3(receipt.packRef?.name) || normalizedText3(context.purpose) || "Opened pack"
      }),
      purpose: normalizedText3(context.purpose),
      threshold: settings.minimumRating,
      cards: Object.freeze(cards.map((card) => Object.freeze(card))),
      maxRating: Math.max(...cards.map((card) => card.rating))
    });
  }
  function formatPackHighlightNotification(model = {}) {
    const cards = model.cards || [];
    const title = cards.length === 1 ? `${cards[0].rating} special card opened` : `${cards.length} high-rated special cards opened`;
    const lines = [model.pack?.name || model.purpose || "Opened pack"];
    for (const card of cards.slice(0, 8)) {
      const tags = [card.duplicate ? "duplicate" : null, card.tradeable ? "tradeable" : "untradeable"].filter(Boolean).join(", ");
      lines.push(`${card.name} - ${card.rating}${tags ? ` (${tags})` : ""}`);
    }
    if (cards.length > 8) lines.push(`+${cards.length - 8} more`);
    return Object.freeze({ title, body: lines.join("\n") });
  }

  // src/reward/recap.js
  var RECAP_PAGE_SIZE = 20;
  var BASE_BACKGROUND = "#171B21";
  var DEFAULT_FOREGROUND = "#F4F6F8";
  var DEFAULT_MUTED = "#AAB4C2";
  var RECAP_TIER_COLORS = Object.freeze({
    bronze: Object.freeze({ label: "Bronze", accent: "#B7793E" }),
    silver: Object.freeze({ label: "Silver", accent: "#AEB7C2" }),
    commonGold: Object.freeze({ label: "Common Gold", accent: "#A88638" }),
    rareGoldLow: Object.freeze({ label: "Rare Gold 85-", accent: "#D6AA35" }),
    rareGoldMid: Object.freeze({ label: "Rare Gold 86-88", accent: "#F0C34E" }),
    rareGoldHigh: Object.freeze({ label: "Rare Gold 89+", accent: "#F3D98B" }),
    specialLow: Object.freeze({ label: "Special 94-", accent: "#B45BD2" }),
    specialMid: Object.freeze({ label: "Special 95-97", accent: "#2FC6C4" }),
    specialHigh: Object.freeze({ label: "Special 98-99", accent: "#8E7CFF" }),
    unknown: Object.freeze({ label: "Player", accent: "#64748B" })
  });
  function clampByte(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.max(0, Math.min(255, Math.round(number)));
  }
  function rgbToHex(red, green, blue) {
    const values = [red, green, blue].map(clampByte);
    if (values.some((value) => value === null)) return null;
    return `#${values.map((value) => value.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  }
  function normalizeRecapColor(value) {
    if (value && typeof value === "object") return rgbToHex(value.r, value.g, value.b);
    const text = String(value || "").trim();
    const shortHex = text.match(/^#([0-9a-f]{3})$/i);
    if (shortHex) return `#${shortHex[1].split("").map((part) => `${part}${part}`).join("")}`.toUpperCase();
    const hex = text.match(/^#([0-9a-f]{6})$/i);
    if (hex) return `#${hex[1].toUpperCase()}`;
    const rgb = text.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,[^)]*)?\)$/i);
    return rgb ? rgbToHex(rgb[1], rgb[2], rgb[3]) : null;
  }
  function hexChannels(color) {
    const normalized = normalizeRecapColor(color);
    if (!normalized) return null;
    return [1, 3, 5].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16));
  }
  function luminance(color) {
    const channels = hexChannels(color);
    if (!channels) return null;
    const linear = channels.map((value) => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  }
  function recapContrastRatio(first, second) {
    const a = luminance(first);
    const b = luminance(second);
    if (a === null || b === null) return 0;
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }
  function mixColors(foreground, background = BASE_BACKGROUND, weight = 0.18) {
    const front = hexChannels(foreground);
    const back = hexChannels(background);
    if (!front || !back) return BASE_BACKGROUND;
    return rgbToHex(...front.map((value, index) => value * weight + back[index] * (1 - weight)));
  }
  function localTierKey(card = {}) {
    const rating = Number(card.rating || 0);
    if (card.special === true) {
      if (rating >= 98) return "specialHigh";
      if (rating >= 95) return "specialMid";
      return "specialLow";
    }
    const tier = String(card.tier || "").toLowerCase();
    if (tier === "bronze" || rating > 0 && rating <= 64) return "bronze";
    if (tier === "silver" || rating >= 65 && rating <= 74) return "silver";
    if (tier === "gold" || rating >= 75) {
      if (card.rare !== true) return "commonGold";
      if (rating >= 89) return "rareGoldHigh";
      if (rating >= 86) return "rareGoldMid";
      return "rareGoldLow";
    }
    return "unknown";
  }
  function localTheme(card) {
    const key = localTierKey(card);
    const tier = RECAP_TIER_COLORS[key];
    const background = mixColors(tier.accent);
    return Object.freeze({
      key,
      label: tier.label,
      source: "local",
      accent: tier.accent,
      background,
      foreground: DEFAULT_FOREGROUND,
      muted: DEFAULT_MUTED,
      rating: recapContrastRatio(background, tier.accent) >= 4.5 ? tier.accent : DEFAULT_FOREGROUND
    });
  }
  function recapCardTypeLabel(card = {}, theme = null) {
    if (card.special === true) return theme?.label || localTheme(card).label;
    const rating = Number(card.rating || 0);
    const tier = String(card.tier || (rating >= 75 ? "gold" : rating >= 65 ? "silver" : rating > 0 ? "bronze" : "player"));
    const normalizedTier = `${tier.slice(0, 1).toUpperCase()}${tier.slice(1).toLowerCase()}`;
    if (!["Gold", "Silver", "Bronze"].includes(normalizedTier)) return theme?.label || "Player";
    return `${card.rare === true ? "Rare" : "Common"} ${normalizedTier}`;
  }
  function resolveRecapCardTheme(card = {}, nativeTheme = null) {
    const fallback = localTheme(card);
    if (card.special !== true || !nativeTheme) return fallback;
    const background = normalizeRecapColor(nativeTheme.background);
    const requestedForeground = normalizeRecapColor(nativeTheme.foreground || nativeTheme.name);
    if (!background) return fallback;
    const automaticForeground = recapContrastRatio(background, "#FFFFFF") >= recapContrastRatio(background, "#111318") ? "#FFFFFF" : "#111318";
    const foreground = requestedForeground && recapContrastRatio(background, requestedForeground) >= 4.5 ? requestedForeground : automaticForeground;
    if (recapContrastRatio(background, foreground) < 4.5) return fallback;
    const accent = normalizeRecapColor(nativeTheme.accent || nativeTheme.name) || fallback.accent;
    return Object.freeze({
      ...fallback,
      source: "ea",
      accent,
      background,
      foreground,
      muted: foreground,
      rating: foreground
    });
  }
  function createRecapModel(input = {}) {
    const rows = (input.rows || []).map((row, index) => Object.freeze({ ...row, order: Number(row.order ?? index) }));
    rows.sort(
      (a, b) => Number(b.rating || 0) - Number(a.rating || 0) || Number(b.special === true) - Number(a.special === true) || a.order - b.order
    );
    const status = String(input.status || "completed");
    return Object.freeze({
      kind: String(input.kind || "recap"),
      title: String(input.title || "Recap"),
      modalId: String(input.modalId || "bronze-loop-recap-modal"),
      status,
      reason: input.reason ? String(input.reason) : null,
      summary: String(input.summary || ""),
      rows: Object.freeze(rows),
      totalRows: rows.length,
      pageSize: RECAP_PAGE_SIZE,
      pageCount: Math.max(1, Math.ceil(rows.length / RECAP_PAGE_SIZE)),
      specialCount: rows.filter((row) => row.special === true).length,
      meta: Object.freeze({ ...input.meta || {} })
    });
  }
  function getRecapPage(model, requestedPage = 1) {
    const pageCount = Math.max(1, Number(model?.pageCount || 1));
    const page = Math.max(1, Math.min(pageCount, Math.floor(Number(requestedPage || 1))));
    const pageSize = Math.max(1, Number(model?.pageSize || RECAP_PAGE_SIZE));
    const start = (page - 1) * pageSize;
    const rows = (model?.rows || []).slice(start, start + pageSize);
    return Object.freeze({
      page,
      pageCount,
      pageSize,
      totalRows: Number(model?.totalRows || 0),
      start: rows.length ? start + 1 : 0,
      end: start + rows.length,
      rows,
      hasPrevious: page > 1,
      hasNext: page < pageCount
    });
  }

  // src/reward/batch-open-recap.js
  function itemName(item = {}) {
    return String(item.name || item.commonName || item.lastName || item.definitionId || item.id || "Unknown player");
  }
  function isPlayer(item = {}) {
    return String(item.type || "").toLowerCase() === "player";
  }
  function isSpecial(item = {}) {
    return item.special === true || Number(item.rareflag ?? item.rareFlag ?? 0) > 1;
  }
  function playerTier(item = {}) {
    const explicit = String(item.tier || "").toLowerCase();
    if (["gold", "silver", "bronze"].includes(explicit)) return explicit;
    const rating = Number(item.rating || 0);
    if (rating >= 75) return "gold";
    if (rating >= 65) return "silver";
    if (rating > 0) return "bronze";
    return null;
  }
  function createBatchOpenRecapModel(input = {}) {
    const receipts = input.receipts || [];
    const items = input.openedItems || receipts.flatMap((receipt) => receipt?.openedItems || []);
    const prices = input.prices instanceof Map ? input.prices : new Map(Object.entries(input.prices || {}).map(([key, value]) => [Number(key), Number(value)]));
    let playerCount = 0;
    let specialCount = 0;
    let normalGoldCount = 0;
    let normalSilverCount = 0;
    let normalBronzeCount = 0;
    const rows = [];
    for (const item of items) {
      if (!isPlayer(item)) continue;
      playerCount++;
      const rating = Number(item.rating || 0);
      const special = isSpecial(item);
      const tier = playerTier(item);
      const rare = item.rare === true || Number(item.rareflag ?? item.rareFlag ?? 0) > 0;
      if (special) specialCount++;
      else if (tier === "gold") normalGoldCount++;
      else if (tier === "silver") normalSilverCount++;
      else if (tier === "bronze") normalBronzeCount++;
      const row = {
        name: itemName(item),
        rating,
        tier,
        rare,
        special,
        duplicate: item.duplicate === true || Number(item.duplicateId || 0) > 0,
        tradeable: item.tradeable === true,
        price: special ? prices.get(Number(item.definitionId || 0)) || null : null,
        showPrice: special,
        sourceLabel: item.packName || item.sourceLabel || null,
        item
      };
      row.theme = resolveRecapCardTheme(row, input.resolveNativeTheme?.(item));
      row.tierLabel = recapCardTypeLabel(row, row.theme);
      rows.push(row);
    }
    const status = String(input.status || "completed");
    const requestedPacks = Number(input.requestedPacks || receipts.length);
    const packsOpened = Number(input.packsOpened ?? receipts.length);
    const skippedPacks = Number(input.skippedPacks || 0);
    const omittedCount = Math.max(0, items.length - playerCount);
    const model = createRecapModel({
      kind: "batch",
      title: status === "preview" ? "Batch Open Recap Preview" : "Batch Open Recap",
      modalId: "bronze-loop-batch-recap-modal",
      status,
      reason: input.reason,
      summary: `${packsOpened}/${requestedPacks} pack(s) opened, ${items.length} item(s), ${specialCount} special, ${normalGoldCount} gold, ${normalSilverCount} silver, ${normalBronzeCount} bronze${skippedPacks ? `, ${skippedPacks} skipped` : ""}${omittedCount ? `, ${omittedCount} other item(s)` : ""}`,
      rows
    });
    return Object.freeze({
      ...model,
      requestedPacks,
      packsOpened,
      skippedPacks,
      itemCount: items.length,
      playerCount,
      normalGoldCount,
      normalSilverCount,
      normalBronzeCount,
      groupedPlayerCount: playerCount - specialCount,
      omittedCount
    });
  }
  function createBatchOpenRecapPreviewModel(options = {}) {
    const samples = [
      { rating: 99, rareflag: 9, special: true },
      { rating: 97, rareflag: 8, special: true },
      { rating: 94, rareflag: 7, special: true },
      { rating: 91, rareflag: 1 },
      { rating: 88, rareflag: 1 },
      { rating: 85, rareflag: 1 },
      { rating: 84, rareflag: 0 },
      { rating: 74, rareflag: 1 },
      { rating: 63, rareflag: 0 }
    ];
    const openedItems = Array.from({ length: 23 }, (_, index) => {
      const sample = samples[index % samples.length];
      return {
        id: index + 1,
        definitionId: 101 + index,
        type: "player",
        name: `Preview Player ${String(index + 1).padStart(2, "0")}`,
        rating: sample.rating,
        rareflag: sample.rareflag,
        rare: sample.rareflag > 0,
        special: sample.special === true,
        tier: sample.rating >= 75 ? "gold" : sample.rating >= 65 ? "silver" : "bronze",
        duplicate: index % 5 === 0,
        tradeable: index % 3 === 0
      };
    });
    return createBatchOpenRecapModel({
      status: "preview",
      reason: "Preview data only; no pack was opened",
      requestedPacks: 12,
      packsOpened: 12,
      openedItems,
      prices: new Map(openedItems.filter((item) => item.special).map((item, index) => [item.definitionId, 125e4 - index * 35e3])),
      resolveNativeTheme: options.resolveNativeTheme
    });
  }

  // src/reward/player-pick-recap.js
  function itemName2(item, displayName2) {
    if (typeof displayName2 === "function") return String(displayName2(item));
    return String(item?.name || item?.commonName || item?.lastName || item?.definitionId || item?.id || "Unknown player");
  }
  function createPlayerPickRecapModel(pickResults = [], options = {}) {
    const entries = Array.isArray(pickResults) ? pickResults : [];
    const cards = entries.flatMap((entry) => entry?.pickedCards || []);
    const status = String(options.status || "completed");
    if (!cards.length && status === "completed" && !options.reason) return null;
    const ratings = cards.map((card) => Number(card.rating || card.item?.rating || 0));
    const destinations = {};
    const rows = entries.flatMap((entry, pickIndex) => (entry?.pickedCards || []).map((card) => {
      const item = card.item || {};
      const destination = card.destination || "unknown";
      destinations[destination] = (destinations[destination] || 0) + 1;
      const row = {
        name: itemName2(item, options.itemDisplayName),
        rating: Number(card.rating || item.rating || 0),
        tier: item.tier,
        rare: item.rare === true || Number(item.rareflag ?? item.rareFlag ?? 0) > 0,
        special: card.special === true,
        duplicate: card.duplicate === true,
        tradeable: typeof card.tradeable === "boolean" ? card.tradeable : item.tradeable,
        price: card.price ?? null,
        showPrice: true,
        destination,
        sourceLabel: `P${pickIndex + 1}${entry?.resumed === true ? "r" : ""}`,
        card,
        pickIndex: pickIndex + 1,
        resumed: entry?.resumed === true,
        item
      };
      row.theme = resolveRecapCardTheme(row, options.resolveNativeTheme?.(item));
      row.tierLabel = recapCardTypeLabel(row, row.theme);
      return row;
    }));
    const specialCount = rows.filter((row) => row.special).length;
    const duplicateCount = rows.filter((row) => row.duplicate).length;
    const highRatedCount = rows.filter((row) => row.rating >= 91).length;
    const resumedCount = entries.filter((entry) => entry?.resumed).length;
    const destinationSummary = Object.entries(destinations).map(([destination, count]) => `${count} ->${destination.toUpperCase()}`).join(", ");
    const model = createRecapModel({
      kind: "pick",
      title: status === "preview" ? "Player Pick Recap Preview" : `Player Pick Recap: ${String(options.name || "")}`,
      modalId: "bronze-loop-recap-modal",
      status,
      reason: options.reason,
      summary: `${entries.length} pick(s), ${cards.length} card(s)${ratings.length ? `, rating ${Math.min(...ratings)}-${Math.max(...ratings)}` : ""}, ${specialCount} special, ${duplicateCount} duplicate, ${highRatedCount} rated 91+${destinationSummary ? `, ${destinationSummary}` : ""}${resumedCount ? `, ${resumedCount} resumed` : ""}`,
      rows
    });
    return Object.freeze({
      ...model,
      cards,
      entries,
      minRating: ratings.length ? Math.min(...ratings) : 0,
      maxRating: ratings.length ? Math.max(...ratings) : 0,
      duplicateCount,
      highRatedCount,
      resumedCount,
      destinations
    });
  }
  function createPlayerPickRecapPreviewModel(options = {}) {
    const tiers = [
      { rating: 99, rareflag: 9, special: true },
      { rating: 97, rareflag: 8, special: true },
      { rating: 94, rareflag: 7, special: true },
      { rating: 91, rareflag: 1 },
      { rating: 88, rareflag: 1 },
      { rating: 85, rareflag: 1 },
      { rating: 84, rareflag: 0 },
      { rating: 74, rareflag: 1 },
      { rating: 63, rareflag: 0 }
    ];
    const pickResults = Array.from({ length: 23 }, (_, index) => {
      const sample = tiers[index % tiers.length];
      const item = {
        id: index + 1,
        definitionId: 1e3 + index,
        type: "player",
        name: `Preview Player ${String(index + 1).padStart(2, "0")}`,
        rating: sample.rating,
        rareflag: sample.rareflag,
        rare: sample.rareflag > 0,
        special: sample.special === true,
        tier: sample.rating >= 75 ? "gold" : sample.rating >= 65 ? "silver" : "bronze",
        tradeable: index % 3 === 0
      };
      return {
        resumed: index % 7 === 0,
        pickedCards: [{
          item,
          rating: item.rating,
          special: item.special,
          duplicate: index % 4 === 0,
          destination: ["club", "storage", "transfer"][index % 3],
          price: item.special ? 1e5 + index * 25e3 : 5e3 + index * 1e3
        }]
      };
    });
    return createPlayerPickRecapModel(pickResults, {
      ...options,
      name: "Preview",
      status: "preview",
      reason: "Preview data only; no Player Pick was redeemed"
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
    const actionProgressAttempts = Math.max(1, Math.min(10, Number(options.actionProgressAttempts || 1) || 1));
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
        let after = null;
        let afterFingerprint = fingerprint;
        for (let attempt = 1; attempt <= actionProgressAttempts; attempt++) {
          after = await options.getSnapshot();
          afterFingerprint = unassignedFingerprint(after);
          if (afterFingerprint !== fingerprint || attempt >= actionProgressAttempts) break;
          await options.onActionProgressRetry?.({
            action: plan.action,
            attempt,
            maxAttempts: actionProgressAttempts,
            iteration,
            snapshot: after
          });
        }
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

  // src/unassigned/confirmation.js
  async function confirmUnassignedView(options = {}) {
    const reason = String(options.reason || "final confirmation");
    const log = options.log || (() => {
    });
    if (typeof options.openUnassigned !== "function") throw new TypeError("openUnassigned is required");
    if (typeof options.clickFallback !== "function") throw new TypeError("clickFallback is required");
    if (typeof options.waitLoadingEnd !== "function") throw new TypeError("waitLoadingEnd is required");
    if (typeof options.refreshUnassigned !== "function") throw new TypeError("refreshUnassigned is required");
    if (typeof options.getItems !== "function") throw new TypeError("getItems is required");
    const stableEmptyReads = Math.max(1, Math.min(5, Number(options.stableEmptyReads || 1) || 1));
    const emptyReadDelayMs = Math.max(0, Number(options.emptyReadDelayMs || 0));
    const diagnostic = options.diagnostic === true;
    const controllerName2 = () => {
      try {
        return String(options.getControllerName?.() || "?");
      } catch {
        return "?";
      }
    };
    log(`Opening unassigned items view for confirmation: ${reason}`);
    const controllerBefore = controllerName2();
    let navigationMethod = "none";
    try {
      if (options.openUnassigned() === true) {
        navigationMethod = "controller";
      } else {
        const fallbackResult = options.clickFallback();
        navigationMethod = fallbackResult === false ? "unavailable" : "text-fallback";
      }
    } catch (error) {
      navigationMethod = "error";
      log(`Could not open unassigned view automatically: ${error?.message || error}`);
    }
    await options.waitLoadingEnd();
    if (diagnostic) {
      log(`Unassigned navigation (${reason}): method:${navigationMethod}; controller:${controllerBefore}->${controllerName2()}`);
    }
    for (let read = 1; read <= stableEmptyReads; read++) {
      const refreshResult = await options.refreshUnassigned();
      const items = options.getItems() || [];
      if (diagnostic) {
        const refreshState = refreshResult?.success === true ? "success" : refreshResult?.cachedFallback ? `cache-fallback:${refreshResult.cachedCount ?? "?"}` : String(refreshResult?.error?.message || refreshResult?.status || "unknown");
        log(`Unassigned read (${reason}) ${read}/${stableEmptyReads}: items:${items.length}; refresh:${refreshState}; controller:${controllerName2()}`);
      }
      if (items.length) {
        log(`Unassigned confirmation (${reason}): ${items.length} item(s) still present`);
        return items;
      }
      if (read < stableEmptyReads) {
        await options.sleep?.(emptyReadDelayMs);
      }
    }
    log(`Unassigned confirmation (${reason}): empty after ${stableEmptyReads} stable read(s)`);
    return [];
  }

  // src/unassigned/recovery.js
  function refMatches(ref, expectedRefs = []) {
    const id = Number(ref?.id || 0);
    const definitionId2 = Number(ref?.definitionId || 0);
    return expectedRefs.some((expected) => {
      const expectedId = Number(expected?.id || 0);
      if (expectedId) return expectedId === id;
      return Number(expected?.definitionId || 0) > 0 && Number(expected.definitionId) === definitionId2;
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
  function specialMode(spec = {}) {
    if (spec.special === true) return "special";
    if (spec.allowSpecial === true) return "any";
    return "normal";
  }
  function requirementAcceptsRecoveryMatch(requirement = {}, match = {}) {
    if (requirement.playerOnly && match.playerOnly !== true) return false;
    if (requirement.tier && requirement.tier !== match.tier) return false;
    if (requirement.rarity && requirement.rarity !== match.rarity) return false;
    const requirementSpecialMode = specialMode(requirement);
    const matchSpecialMode = specialMode(match);
    if (requirementSpecialMode !== "any" && requirementSpecialMode !== matchSpecialMode) return false;
    if (requirement.minRating !== void 0) {
      if (match.minRating === void 0 || Number(match.minRating) < Number(requirement.minRating)) return false;
    }
    if (requirement.maxRating !== void 0) {
      if (match.maxRating === void 0 || Number(match.maxRating) > Number(requirement.maxRating)) return false;
    }
    return true;
  }
  function recoveryTriggerCapacity(recipe2 = {}, policy = {}) {
    return (recipe2.requirements || []).reduce((total, requirement) => {
      if (!requirementAcceptsRecoveryMatch(requirement, policy.match || {})) return total;
      return total + Math.max(0, Number(requirement.count || 0));
    }, 0);
  }
  function selectedRecoveryTriggerCount(selection, expectedRefs = []) {
    const selectedKeys = /* @__PURE__ */ new Set();
    for (const entry of selection?.entries || []) {
      if (entry.pileName !== "unassigned" || !entry.signal) continue;
      const signalRef = entry.signal.ref || entry.signal;
      if (!refMatches(signalRef, expectedRefs)) continue;
      const id = Number(signalRef?.id || 0);
      const definitionId2 = Number(signalRef?.definitionId || 0);
      selectedKeys.add(id ? `id:${id}` : `definition:${definitionId2}`);
    }
    return selectedKeys.size;
  }
  function evaluateRecoveryTriggerSelection(recipe2, policy, selection, expectedRefs = []) {
    const capacity = recoveryTriggerCapacity(recipe2, policy);
    const expectedCount = Math.min(expectedRefs.length, capacity);
    const selectedCount = selectedRecoveryTriggerCount(selection, expectedRefs);
    return {
      capacity,
      expectedCount,
      selectedCount,
      sufficient: expectedRefs.length === 0 || expectedCount > 0 && selectedCount >= expectedCount
    };
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
        if (typeof options.onItemsOpened === "function") {
          try {
            Promise.resolve(options.onItemsOpened({
              pack,
              packRef,
              attempt,
              result,
              openedItems: receiptItems
            })).catch((error) => options.onItemsOpenedError?.(error));
          } catch (error) {
            options.onItemsOpenedError?.(error);
          }
        }
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

  // src/pack/opened-item-materialization.js
  function itemId(item) {
    return Number(item?.id || item?.ref?.id || 0);
  }
  function definitionId(item) {
    return Number(item?.definitionId || item?.ref?.definitionId || 0);
  }
  function itemIds(items = []) {
    return new Set((items || []).map(itemId).filter(Boolean));
  }
  function itemRoutingSignature(item) {
    const definition = definitionId(item);
    if (!definition) return null;
    const type = String(item?.type || item?._itemType || item?._type || "unknown").toLowerCase();
    const rating = Number(item?.rating ?? item?._rating ?? item?._staticData?.rating ?? 0);
    const rareflag = Number(item?.rareflag ?? item?.rareFlag ?? item?._rareflag ?? item?._staticData?.rareflag ?? 0);
    let untradeable = "unknown";
    try {
      if (typeof item?.isUntradeable === "function") untradeable = item.isUntradeable() ? "yes" : "no";
    } catch {
    }
    if (untradeable === "unknown" && item?.untradeable === true) untradeable = "yes";
    if (untradeable === "unknown" && item?.untradeable === false) untradeable = "no";
    if (untradeable === "unknown" && item?.untradeableCount !== void 0) {
      untradeable = Number(item.untradeableCount || 0) > 0 ? "yes" : "no";
    }
    return `${type}:${definition}:${rating}:${rareflag}:${untradeable}`;
  }
  function itemStaticRoutingSignature(item) {
    const definition = definitionId(item);
    if (!definition) return null;
    const type = String(item?.type || item?._itemType || item?._type || "unknown").toLowerCase();
    const rating = Number(item?.rating ?? item?._rating ?? item?._staticData?.rating ?? 0);
    const rareflag = Number(item?.rareflag ?? item?.rareFlag ?? item?._rareflag ?? item?._staticData?.rareflag ?? 0);
    return `${type}:${definition}:${rating}:${rareflag}`;
  }
  function destinationEntries(piles = {}) {
    return ["club", "storage", "transfer"].flatMap(
      (pile) => (piles[pile] || []).map((item) => ({ pile, item }))
    );
  }
  function createOpenedItemRoutingBaseline(piles = {}) {
    return {
      destinationIds: [...itemIds(destinationEntries(piles).map((entry) => entry.item))],
      unassignedIds: [...itemIds(piles.unassigned)]
    };
  }
  function matchOpenedItemsToNewPileAliases(options = {}) {
    const items = options.items || [];
    const pileItems = options.pileItems || [];
    const baselineIds = new Set(options.baselineIds || []);
    const currentPileIds = itemIds(pileItems);
    const openedIds = itemIds(items);
    const sourcesBySignature = /* @__PURE__ */ new Map();
    const aliasesBySignature = /* @__PURE__ */ new Map();
    for (const item of items) {
      const id = itemId(item);
      if (!id || currentPileIds.has(id)) continue;
      const signature = itemStaticRoutingSignature(item);
      if (!signature) continue;
      const matches = sourcesBySignature.get(signature) || [];
      matches.push(item);
      sourcesBySignature.set(signature, matches);
    }
    for (const item of pileItems) {
      const id = itemId(item);
      if (!id || baselineIds.has(id) || openedIds.has(id)) continue;
      const signature = itemStaticRoutingSignature(item);
      if (!signature) continue;
      const matches = aliasesBySignature.get(signature) || [];
      matches.push(item);
      aliasesBySignature.set(signature, matches);
    }
    const aliases = [];
    for (const [signature, sources] of sourcesBySignature) {
      const candidates = aliasesBySignature.get(signature) || [];
      if (!candidates.length || candidates.length !== sources.length) continue;
      const orderedSources = [...sources].sort((a, b) => itemId(a) - itemId(b));
      const orderedCandidates = [...candidates].sort((a, b) => itemId(a) - itemId(b));
      orderedSources.forEach((item, index) => aliases.push({ item, alias: orderedCandidates[index] }));
    }
    return aliases;
  }
  function materializeOpenedPlayerDuplicates(options = {}) {
    const items = options.items || [];
    const clubItems = options.clubItems || [];
    const isPlayer2 = options.isPlayer || ((item) => item?.type === "player");
    const isDuplicate = options.isDuplicate || ((item) => Number(item?.duplicateId || 0) > 0);
    const preparePurchasedItem = options.preparePurchasedItem || (() => {
    });
    const clubById = new Map(clubItems.map((item) => [itemId(item), item]).filter(([id]) => id));
    const clubByDefinition = /* @__PURE__ */ new Map();
    for (const item of clubItems) {
      const key = definitionId(item);
      if (!key) continue;
      const matches = clubByDefinition.get(key) || [];
      matches.push(item);
      clubByDefinition.set(key, matches);
    }
    const duplicates = [];
    const nonDuplicates = [];
    const inferredDuplicates = [];
    for (const item of items) {
      if (!isPlayer2(item)) continue;
      const duplicateId = Number(item?.duplicateId || 0);
      const clubDuplicate = duplicateId && clubById.get(duplicateId) || (clubByDefinition.get(definitionId(item)) || []).find((candidate) => itemId(candidate) !== itemId(item)) || null;
      if (!isDuplicate(item) && !clubDuplicate) {
        nonDuplicates.push(item);
        continue;
      }
      if (!duplicateId && clubDuplicate) {
        item.duplicateId = itemId(clubDuplicate);
        if (item._duplicateId !== void 0) item._duplicateId = itemId(clubDuplicate);
        inferredDuplicates.push(item);
      }
      preparePurchasedItem(item);
      duplicates.push(item);
    }
    return {
      duplicates,
      nonDuplicates,
      inferredDuplicates,
      directItems: nonDuplicates,
      deferredDuplicates: duplicates
    };
  }
  function needsUnassignedViewMaterialization(materialized = {}) {
    return (materialized.deferredDuplicates || []).length > 0 && (materialized.directItems || []).length === 0;
  }
  function planUnmaterializedDuplicateFallback(options = {}) {
    const items = options.items || [];
    const isTradeable = options.isTradeable || ((item) => item?.tradeable === true);
    const findClubDuplicate2 = options.findClubDuplicate || (() => null);
    const capacities = options.capacities || {};
    const groups = /* @__PURE__ */ new Map();
    const capacityNeeds = /* @__PURE__ */ new Map();
    for (const item of items) {
      let route;
      if (isTradeable(item)) {
        route = {
          key: "transfer",
          capacityKey: "transfer",
          allowStorage: false,
          description: "tradeable duplicate fallback"
        };
      } else {
        const clubDuplicate = findClubDuplicate2(item);
        route = clubDuplicate && isTradeable(clubDuplicate) ? {
          key: "club",
          capacityKey: "transfer",
          allowStorage: true,
          description: "untradeable duplicate swap fallback"
        } : {
          key: "storage",
          capacityKey: "storage",
          allowStorage: true,
          description: "untradeable duplicate fallback"
        };
      }
      const group = groups.get(route.key) || { ...route, items: [] };
      group.items.push(item);
      groups.set(route.key, group);
      capacityNeeds.set(route.capacityKey, (capacityNeeds.get(route.capacityKey) || 0) + 1);
    }
    for (const [destination, required2] of capacityNeeds) {
      const rawFree = capacities[destination];
      const free = rawFree === null || rawFree === void 0 || !Number.isFinite(Number(rawFree)) ? null : Math.max(0, Number(rawFree));
      if (free !== null && required2 > free) {
        return {
          status: "blocked",
          blocked: { destination, required: required2, free },
          groups: [...groups.values()]
        };
      }
    }
    return { status: "ready", blocked: null, groups: [...groups.values()] };
  }
  function classifyOpenedItemRouting(options = {}) {
    const items = options.items || [];
    const piles = options.piles || {};
    const reserveItem = options.reserveItem || (() => false);
    const unassignedIds = itemIds(piles.unassigned);
    const destinations = destinationEntries(piles);
    const destinationIds = itemIds(destinations.map((entry) => entry.item));
    const reservedItems = [];
    const routedItems = [];
    const pendingItems = [];
    for (const item of items) {
      const id = itemId(item);
      if (id && unassignedIds.has(id)) {
        if (reserveItem(item)) reservedItems.push(item);
        else pendingItems.push(item);
      } else if (id && destinationIds.has(id)) {
        routedItems.push(item);
      } else {
        pendingItems.push(item);
      }
    }
    const hasRoutingBaseline = Array.isArray(options.routingBaseline?.destinationIds);
    const baselineIds = new Set(options.routingBaseline?.destinationIds || []);
    const openedIds = itemIds(items);
    const aliasesBySignature = /* @__PURE__ */ new Map();
    for (const entry of destinations) {
      const id = itemId(entry.item);
      if (!id || baselineIds.has(id) || openedIds.has(id)) continue;
      const signature = itemRoutingSignature(entry.item);
      if (!signature) continue;
      const matches = aliasesBySignature.get(signature) || [];
      matches.push(entry);
      aliasesBySignature.set(signature, matches);
    }
    const pendingBySignature = /* @__PURE__ */ new Map();
    for (const item of pendingItems) {
      const id = itemId(item);
      if (!id || unassignedIds.has(id)) continue;
      const signature = itemRoutingSignature(item);
      if (!signature) continue;
      const matches = pendingBySignature.get(signature) || [];
      matches.push(item);
      pendingBySignature.set(signature, matches);
    }
    const aliasRoutes = [];
    if (hasRoutingBaseline) {
      for (const [signature, pending] of pendingBySignature) {
        const destinationsForSignature = aliasesBySignature.get(signature) || [];
        if (!destinationsForSignature.length || destinationsForSignature.length !== pending.length) continue;
        pending.forEach((item, index) => aliasRoutes.push({ item, destination: destinationsForSignature[index] }));
      }
      const strictSourceIds = new Set(aliasRoutes.map((route) => itemId(route.item)));
      const strictDestinationIds = new Set(aliasRoutes.map((route) => itemId(route.destination.item)));
      const staticAliases = matchOpenedItemsToNewPileAliases({
        items: pendingItems.filter((item) => {
          const id = itemId(item);
          return !strictSourceIds.has(id) && !unassignedIds.has(id);
        }),
        pileItems: destinations.filter((entry) => !strictDestinationIds.has(itemId(entry.item))).map((entry) => entry.item),
        baselineIds: options.routingBaseline?.destinationIds || []
      });
      const destinationById = new Map(destinations.map((entry) => [itemId(entry.item), entry]));
      for (const { item, alias } of staticAliases) {
        const destination = destinationById.get(itemId(alias));
        if (destination) aliasRoutes.push({ item, destination });
      }
    }
    const routedAliasItems = new Set(aliasRoutes.map((route) => route.item));
    return {
      reservedItems,
      routedItems: [...routedItems, ...aliasRoutes.map((route) => route.item)],
      pendingItems: pendingItems.filter((item) => !routedAliasItems.has(item)),
      aliasRoutes
    };
  }

  // src/pack/instance-queue.js
  function normalizedId(value) {
    const id = typeof value === "object" ? value?.id ?? value?.packId ?? value?.packDefinitionId ?? value?.packAssetId : value;
    const number = Number(id);
    return Number.isFinite(number) && number > 0 ? String(number) : "";
  }
  function createPackInstanceQueue(packs = [], options = {}) {
    const queue = [...packs || []];
    const getName = options.getName || ((pack) => String(pack?.name || pack?.packName || ""));
    return {
      take(entry = {}) {
        const entryId = normalizedId(entry.packId);
        const entryName = String(entry.packName || "").trim().toLowerCase();
        const index = queue.findIndex((pack) => entryId ? normalizedId(pack) === entryId : entryName && getName(pack).trim().toLowerCase() === entryName);
        if (index < 0) return null;
        return queue.splice(index, 1)[0] || null;
      },
      remaining(entry = {}) {
        const entryId = normalizedId(entry.packId);
        const entryName = String(entry.packName || "").trim().toLowerCase();
        return queue.filter((pack) => entryId ? normalizedId(pack) === entryId : entryName && getName(pack).trim().toLowerCase() === entryName).length;
      }
    };
  }

  // src/pack/opened-item-settlement.js
  function boundedAttempts(value, fallback = 3) {
    const number = Number(value);
    return Math.max(1, Math.min(10, Number.isFinite(number) ? Math.floor(number) : fallback));
  }
  async function settleOpenedItems(options = {}) {
    if (typeof options.materialize !== "function") throw new TypeError("materialize is required");
    if (typeof options.cleanup !== "function") throw new TypeError("cleanup is required");
    if (typeof options.confirmRouting !== "function") throw new TypeError("confirmRouting is required");
    const attempts = boundedAttempts(options.attempts, 3);
    const materialized = await options.materialize();
    let cleanup = null;
    let routing = { reservedItems: [], routedItems: [], pendingItems: [] };
    for (let attempt = 1; attempt <= attempts; attempt++) {
      cleanup = await options.cleanup({ attempt, materialized });
      routing = await options.confirmRouting({ attempt, materialized, cleanup }) || routing;
      if (!(routing.pendingItems || []).length) {
        return { status: cleanup?.status || "resolved", attempts: attempt, materialized, cleanup, routing };
      }
      if (cleanup?.status === "preserved") {
        return { status: "preserved", attempts: attempt, materialized, cleanup, routing };
      }
      if (attempt < attempts) {
        await options.onRetry?.({ attempt, materialized, cleanup, routing });
      }
    }
    const pendingCount = (routing.pendingItems || []).length;
    return {
      status: "pending",
      reason: `${pendingCount} opened item(s) remain unresolved after ${attempts} settlement attempt(s)`,
      attempts,
      materialized,
      cleanup,
      routing
    };
  }

  // src/pack/retry-recovery.js
  function normalizedCode(value) {
    return String(value ?? "").trim();
  }
  function shouldDiscardFailedPack(code) {
    return normalizedCode(code) === "471";
  }
  async function recoverPackOpenRetry(options = {}) {
    const label = String(options.label || "Pack open");
    const code = normalizedCode(options.code) || "unknown";
    const pack = options.pack || null;
    const packId2 = Number(pack?.id ?? pack?.packId ?? pack?.packDefinitionId ?? pack?.packAssetId ?? 0) || null;
    const log = typeof options.log === "function" ? options.log : () => {
    };
    log(`${label}: pack open returned ${code}; synchronizing navigation and pack cache before retry`);
    if (shouldDiscardFailedPack(code)) {
      options.markFailedPack?.(pack);
      log(`${label}: excluding failed pack instance${packId2 ? ` #${packId2}` : ""} before retry`);
    }
    log(`${label}: retrying pack open after navigation and unassigned recovery`);
    await options.sleep?.(Math.max(0, Number(options.pauseMs || 0)));
    await options.unwind?.();
    await options.showUnassigned?.();
    await options.resolveUnassigned?.();
    let storeRefreshed = false;
    try {
      storeRefreshed = await options.openStorePacks?.() === true;
    } catch (error) {
      log(`${label}: pack-open Store recovery skipped: ${error?.message || error}`);
    }
    if (!storeRefreshed) {
      log(`${label}: Store Packs view refresh unavailable; continuing with repository refresh`);
    }
    await options.sleep?.(Math.max(0, Number(options.settleMs ?? 700)));
    await options.refreshInventory?.({ storeRefreshed });
    return { code, discarded: shouldDiscardFailedPack(code), storeRefreshed };
  }

  // src/pack/stale-pack-tracker.js
  function createStalePackTracker() {
    const objectRefs = /* @__PURE__ */ new WeakSet();
    const goneIds = /* @__PURE__ */ new Set();
    function packIdKey(packOrId) {
      const id = typeof packOrId === "object" ? packOrId?.id ?? packOrId?.packId ?? packOrId?.packDefinitionId ?? packOrId?.packAssetId : packOrId;
      const numeric = Number(id);
      return Number.isFinite(numeric) && numeric > 0 ? String(numeric) : "";
    }
    return {
      markObject(pack) {
        try {
          if (pack && typeof pack === "object") objectRefs.add(pack);
        } catch {
        }
      },
      markGone(packOrId) {
        this.markObject(typeof packOrId === "object" ? packOrId : null);
        const id = packIdKey(packOrId);
        if (!id) return { id: "", added: false };
        const added = !goneIds.has(id);
        goneIds.add(id);
        return { id, added };
      },
      isStale(pack) {
        try {
          if (pack && objectRefs.has(pack)) return true;
        } catch {
        }
        const id = packIdKey(pack);
        return !!(id && goneIds.has(id));
      },
      hasGoneId(packOrId) {
        const id = packIdKey(packOrId);
        return !!(id && goneIds.has(id));
      },
      goneIds() {
        return [...goneIds];
      },
      clearGoneIds() {
        goneIds.clear();
      }
    };
  }

  // src/pack/opened-item-policy.js
  function itemRefKey2(ref) {
    const id = Number(ref?.id || 0);
    if (id) return `id:${id}`;
    return `definition:${Number(ref?.definitionId || 0)}:${String(ref?.pile || "unknown")}`;
  }
  function uniqueRefs(items = [], defaultPile = "unassigned") {
    const refs = [];
    const seen = /* @__PURE__ */ new Set();
    for (const item of items || []) {
      const ref = item?.ref ? createItemRef(item.ref, item.ref.pile || item.pile || defaultPile) : createItemRef(item, item?.pile || defaultPile);
      const key = itemRefKey2(ref);
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
      const covered = new Set([...reservedItemRefs, ...routedItemRefs].map(itemRefKey2));
      const pendingItemRefs = Array.isArray(result.pendingItemRefs) || Array.isArray(result.pendingItems) ? explicitRefs(result, "pendingItems", "pendingItemRefs", defaultPile) : uniqueRefs(openedItems, defaultPile).filter((ref) => !covered.has(itemRefKey2(ref)));
      return {
        reservedItemRefs,
        routedItemRefs,
        pendingItemRefs,
        details: result.details || {}
      };
    };
  }

  // src/sbc/background-submit-retry.js
  function normalizeSubmitErrorCode(detail) {
    const text = String(detail ?? "").trim();
    if (!text) return "";
    const exact = text.match(/^(409|429)$/);
    if (exact) return exact[1];
    const embedded = text.match(/\b(409|429)\b/);
    return embedded ? embedded[1] : text;
  }
  function isRetryableBackgroundSubmitError(detail) {
    const code = normalizeSubmitErrorCode(detail);
    return code === "409" || code === "429";
  }
  function planBackgroundSubmitRetry({
    attempt = 1,
    maxAttempts = 3,
    detail = "",
    baseDelayMs = 800
  } = {}) {
    const max = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
    const current = Math.max(1, Number(attempt) || 1);
    const code = normalizeSubmitErrorCode(detail);
    if (!isRetryableBackgroundSubmitError(code)) {
      return { retry: false, delayMs: 0, reason: "non-retryable" };
    }
    if (current >= max) {
      return { retry: false, delayMs: 0, reason: "attempts-exhausted" };
    }
    const base = Math.max(200, Math.min(5e3, Number(baseDelayMs) || 800));
    const delayMs = Math.min(3e3, base + current * 500);
    return { retry: true, delayMs, reason: code };
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
  function positiveInteger2(value, fallback = 1, max = 1e3) {
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
    const maxCompletions = positiveInteger2(options.maxCompletions, 1);
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
          const maxRuns = supply.repeatUntilSatisfied === true ? positiveInteger2(supply.maxRuns, 100, 1e3) : 1;
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
    const packOpeningEnabled = options.packOpeningEnabled !== false;
    while (result.completions < maxCompletions) {
      await options.stopPoint?.();
      result.iterations++;
      const targets = await options.inspectTargets({ result }) || [];
      await emit2(options, "targets", { result, targets });
      if (targets.length) {
        const submission2 = await options.consumeTarget({ result, targets, target: targets[0] });
        await emit2(options, "target-submission", { result, targets, submission: submission2 });
        const outcome4 = submissionOutcome(submission2);
        if (outcome4 === "submitted") {
          result.completions++;
          result.lastRewardPackId = submission2.rewardPackId ?? null;
          await options.afterSubmission?.({ result, submission: submission2, source: "target" });
          continue;
        }
        result.status = outcome4;
        result.reason = submission2?.reason || `target submission ${outcome4}`;
        break;
      }
      const pack = packOpeningEnabled ? await options.findPack({ result, rewardPackId: result.lastRewardPackId }) : null;
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
      const outcome3 = submissionOutcome(submission);
      if (outcome3 === "submitted") {
        result.completions++;
        result.lastRewardPackId = submission.rewardPackId ?? null;
        await options.afterSubmission?.({ result, submission, source: "seed" });
        continue;
      }
      result.status = outcome3;
      result.reason = submission?.reason || `seed submission ${outcome3}`;
      break;
    }
    if (packOpeningEnabled && result.lastRewardPackId !== null && options.openFinalReward) {
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
    const completionTarget = options.completionTarget?.id ? {
      id: String(options.completionTarget.id),
      max: boundedCount(options.completionTarget.max, 1)
    } : null;
    const recordStages = (stageResult = {}) => {
      for (const [id, count] of Object.entries(stageResult.completions || {})) {
        result.stageCompletions[id] = Number(result.stageCompletions[id] || 0) + Number(count || 0);
      }
    };
    const targetCompleted = () => completionTarget ? Number(result.stageCompletions[completionTarget.id] || 0) : 0;
    const targetRemaining = () => completionTarget ? Math.max(0, completionTarget.max - targetCompleted()) : null;
    const targetReached = () => completionTarget !== null && targetRemaining() === 0;
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
    while (result.status === "completed" && result.packsOpened < maxPacks && (!targetReached() || options.requireSourceExhaustion === true)) {
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
        await emit3(options, "pack-unavailable", { result });
        if (targetReached()) {
          result.reason = null;
        } else if (typeof options.onSourceExhausted === "function") {
          const fallbackResult = await options.onSourceExhausted({
            result,
            completionTarget,
            remainingCompletions: targetRemaining()
          }) || { status: "unavailable", reason: "source-exhausted fallback returned no result" };
          recordStages(fallbackResult);
          await emit3(options, "source-exhausted", { result, fallbackResult, completionTarget });
          if (fallbackResult.status === "blocked" || fallbackResult.status === "planned") {
            result.status = fallbackResult.status;
          } else if (fallbackResult.status === "unavailable" && !targetReached()) {
            result.status = "unavailable";
          } else if (completionTarget && !targetReached()) {
            result.status = "unavailable";
          }
          result.reason = targetReached() ? null : fallbackResult.reason || (!completionTarget ? null : "source-exhausted fallback did not reach the completion target");
        } else {
          result.status = "unavailable";
          result.reason = "no matching pack remains";
        }
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
    if (result.status === "completed" && completionTarget && !targetReached() && result.packsOpened >= maxPacks) {
      result.status = "unavailable";
      result.reason = `source pack limit ${maxPacks} reached before the completion target`;
    } else if (result.status === "completed" && options.requireSourceExhaustion === true && result.packsOpened >= maxPacks) {
      result.status = "unavailable";
      result.reason = `source pack safety limit ${maxPacks} reached before source exhaustion`;
    }
    await options.finalize?.(result);
    return result;
  }

  // src/workflows/player-pick.js
  function pickLimit(value) {
    const number = Number(value);
    return Math.max(1, Math.min(200, Number.isFinite(number) ? Math.floor(number) : 1));
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
  async function submitPickChallenges(options, result) {
    await options.stopPoint?.();
    const before = await options.beforePick?.({ result });
    if (before?.status === "blocked" || before?.status === "planned") {
      return {
        status: before.status,
        reason: before.reason || `pre-Pick ${before.status}`
      };
    }
    const challengeContext = await options.loadChallenges({ result });
    if (!challengeContext) {
      return { status: "unavailable", reason: "Player Pick challenge list unavailable" };
    }
    const incomplete = challengeContext.incomplete || [];
    let planned = false;
    let submittedCount = 0;
    for (const entry of incomplete) {
      const submission = await options.submitChallenge({ result, challengeContext, entry });
      await emit4(options, "challenge", { result, challengeContext, entry, submission });
      const submissionOutcome2 = outcome(submission);
      if (submissionOutcome2 === "submitted") {
        result.challengesSubmitted++;
        submittedCount++;
        await options.afterChallenge?.({ result, challengeContext, entry, submission });
        continue;
      }
      if (submissionOutcome2 === "planned") {
        result.challengesPlanned++;
        planned = true;
        continue;
      }
      return {
        status: submissionOutcome2,
        reason: submission?.reason || `Player Pick challenge ${submissionOutcome2}`,
        challengeContext
      };
    }
    if (planned) {
      return { status: "planned", reason: "Player Pick challenges planned", challengeContext };
    }
    return { status: "submitted", challengeContext, submittedCount };
  }
  async function selectPick(options, result, pickItem, metadata = {}) {
    const selected = await options.redeemPick({ result, pickItem, ...metadata });
    await emit4(options, "pick", { result, pickItem, ...metadata, selected });
    const selectedOutcome = outcome(selected);
    if (selectedOutcome !== "selected") {
      return {
        status: selectedOutcome,
        reason: selected?.reason || `Player Pick selection ${selectedOutcome}`
      };
    }
    result.pickResults.push({ ...metadata, pickedCards: selected.pickedCards || [] });
    result.picksCompleted++;
    await options.afterPick?.({ result, ...metadata, selected });
    return { status: "selected" };
  }
  async function runDeferredPlayerPicks(options, result, maxPicks) {
    if (typeof options.listPendingPicks !== "function") throw new TypeError("listPendingPicks is required");
    let pending = await options.listPendingPicks({ result, minimumCount: 0, phase: "initial" });
    pending = Array.isArray(pending) ? pending : [];
    let queuedCount = Math.min(maxPicks, pending.length);
    const initialQueuedCount = queuedCount;
    result.picksQueued = queuedCount;
    if (queuedCount) await emit4(options, "queue", { result, queuedCount, maxPicks, initial: true });
    while (result.status === "completed" && queuedCount < maxPicks) {
      const submission = await submitPickChallenges(options, result);
      if (submission.status !== "submitted") {
        result.status = submission.status;
        result.reason = submission.reason;
        break;
      }
      const noIncompleteChallenge = !submission.submittedCount && !submission.challengeContext?.incomplete?.length;
      pending = await options.listPendingPicks({
        result,
        minimumCount: queuedCount + 1,
        phase: "queued-reward"
      });
      pending = Array.isArray(pending) ? pending : [];
      if (pending.length <= queuedCount) {
        if (noIncompleteChallenge && options.completeWhenNoChallengeRemains === true) {
          result.reason = null;
        } else {
          result.status = "unavailable";
          result.reason = noIncompleteChallenge ? "No incomplete Player Pick challenge remains" : "Player Pick reward was not found";
        }
        break;
      }
      const previousCount = queuedCount;
      queuedCount = Math.min(maxPicks, pending.length);
      result.picksQueued = Math.max(result.picksQueued, queuedCount);
      await emit4(options, "queue", {
        result,
        queuedCount,
        added: queuedCount - previousCount,
        maxPicks,
        initial: false
      });
    }
    const queuedStatus = result.status;
    const queuedReason = result.reason;
    if (queuedCount) await emit4(options, "batch-open", { result, queuedCount, maxPicks });
    while (result.picksCompleted < queuedCount) {
      await options.stopPoint?.();
      pending = await options.listPendingPicks({ result, minimumCount: 1, phase: "redeem" });
      pending = Array.isArray(pending) ? pending : [];
      if (!pending.length) {
        result.status = "unavailable";
        result.reason = "Queued Player Pick reward was not found";
        break;
      }
      const selected = await selectPick(options, result, pending[0], {
        resumed: result.picksCompleted < initialQueuedCount,
        deferred: true
      });
      if (selected.status !== "selected") {
        result.status = selected.status;
        result.reason = selected.reason;
        break;
      }
    }
    if (result.picksCompleted === queuedCount && queuedStatus !== "completed") {
      result.status = queuedStatus;
      result.reason = queuedReason;
    }
  }
  async function runPlayerPickWorkflow(options = {}) {
    const deferred = options.openPicksAtEnd === true;
    const requiredCallbacks = deferred ? ["listPendingPicks", "redeemPick", "loadChallenges", "submitChallenge"] : ["findPendingPick", "redeemPick", "loadChallenges", "submitChallenge", "findRewardPick"];
    for (const name of requiredCallbacks) {
      if (typeof options[name] !== "function") throw new TypeError(`${name} is required`);
    }
    const result = {
      status: "completed",
      picksCompleted: 0,
      challengesSubmitted: 0,
      challengesPlanned: 0,
      picksQueued: 0,
      pickResults: [],
      reason: null
    };
    const maxPicks = pickLimit(options.maxPicks);
    try {
      if (deferred) {
        await runDeferredPlayerPicks(options, result, maxPicks);
        await options.finalize?.(result);
        return result;
      }
      while (result.picksCompleted < maxPicks) {
        const pendingPick = await options.findPendingPick({ result });
        if (!pendingPick) break;
        const selected = await selectPick(options, result, pendingPick, { resumed: true, deferred: false });
        if (selected.status === "selected") continue;
        result.status = selected.status;
        result.reason = selected.reason || `pending Pick ${selected.status}`;
        break;
      }
      while (result.status === "completed" && result.picksCompleted < maxPicks) {
        const submission = await submitPickChallenges(options, result);
        if (submission.status !== "submitted") {
          result.status = submission.status;
          result.reason = submission.reason;
          break;
        }
        if (!submission.submittedCount && !submission.challengeContext?.incomplete?.length) {
          if (options.completeWhenNoChallengeRemains === true) {
            result.reason = null;
            break;
          }
          result.status = "unavailable";
          result.reason = "No incomplete Player Pick challenge remains";
          break;
        }
        const rewardPick = await options.findRewardPick({ result, challengeContext: submission.challengeContext });
        if (!rewardPick) {
          result.status = "unavailable";
          result.reason = "Player Pick reward was not found";
          break;
        }
        const selected = await selectPick(options, result, rewardPick, { resumed: false, deferred: false });
        if (selected.status !== "selected") {
          result.status = selected.status;
          result.reason = selected.reason;
          break;
        }
      }
      await options.finalize?.(result);
      return result;
    } catch (error) {
      if (!/stopped by user/i.test(String(error?.message || error))) throw error;
      result.status = "stopped";
      result.reason = "stopped by user";
      await options.finalize?.(result);
      return result;
    }
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

  // src/workflows/reserved-duplicate-crafting.js
  function completionLimit3(value) {
    const number = Number(value);
    return Math.max(1, Math.min(1e3, Number.isFinite(number) ? Math.floor(number) : 100));
  }
  function forcedAttemptCount(value) {
    const number = Number(value);
    return Math.max(0, Math.min(100, Number.isFinite(number) ? Math.floor(number) : 0));
  }
  function outcome2(value) {
    if (value?.submitted === true || value?.status === "submitted") return "submitted";
    if (value?.status === "planned") return "planned";
    if (value?.status === "blocked") return "blocked";
    if (value?.status === "unavailable") return "unavailable";
    if (value?.status === "done" || value?.status === "insufficient") return "done";
    return "blocked";
  }
  async function runReservedDuplicateCraftingWorkflow(options = {}) {
    if (typeof options.planAttempt !== "function") throw new TypeError("planAttempt is required");
    if (typeof options.executeAttempt !== "function") throw new TypeError("executeAttempt is required");
    const result = {
      status: "completed",
      completions: 0,
      attempts: 0,
      forcedAttemptsRemaining: forcedAttemptCount(options.forceAttempts),
      transientSignals: [...options.transientSignals || []],
      reason: null
    };
    const maxCompletions = completionLimit3(options.maxCompletions);
    while (result.completions < maxCompletions) {
      await options.stopPoint?.();
      const forceAttempt = result.forcedAttemptsRemaining > 0;
      const plan = await options.planAttempt({
        result,
        forceAttempt,
        transientSignals: result.transientSignals
      }) || { status: "blocked", reason: "attempt planning returned no result" };
      const planOutcome = outcome2(plan);
      if (planOutcome === "done") {
        result.reason = plan.reason || null;
        break;
      }
      if (planOutcome !== "submitted" && plan.status !== "ready") {
        result.status = planOutcome;
        result.reason = plan.reason || `attempt planning ${planOutcome}`;
        break;
      }
      result.attempts++;
      if (forceAttempt && plan.consumeForcedAttempt !== false) result.forcedAttemptsRemaining--;
      const attempt = await options.executeAttempt({
        result,
        plan,
        forceAttempt,
        transientSignals: result.transientSignals
      }) || { status: "blocked", reason: "attempt execution returned no result" };
      const attemptOutcome = outcome2(attempt);
      if (attemptOutcome === "submitted") {
        result.completions++;
        result.transientSignals = [...attempt.transientSignals || []];
        await options.afterCompletion?.({ result, plan, attempt });
        continue;
      }
      if (attemptOutcome === "done") {
        result.reason = attempt.reason || null;
        break;
      }
      result.status = attemptOutcome;
      result.reason = attempt.reason || `attempt execution ${attemptOutcome}`;
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

  // src/workflows/validation-round.js
  function unavailableReason(value, fallback) {
    return value?.reason || fallback;
  }
  async function runValidationRoundWorkflow(options = {}) {
    for (const name of ["inspectSourcePack", "inspectSbc"]) {
      if (typeof options[name] !== "function") throw new TypeError(`${name} is required`);
    }
    const result = {
      status: "completed",
      sourcePack: null,
      sbc: null,
      rewardPackId: null,
      reason: null
    };
    result.sourcePack = await options.inspectSourcePack({ result });
    result.sbc = await options.inspectSbc({ result });
    if (!result.sourcePack) {
      result.status = "unavailable";
      result.reason = "source pack unavailable";
      await options.finalize?.(result);
      return result;
    }
    if (!result.sbc) {
      result.status = "unavailable";
      result.reason = "SBC unavailable";
      await options.finalize?.(result);
      return result;
    }
    if (options.dryRun === true) {
      result.status = "planned";
      result.reason = "validation round planned";
      await options.finalize?.(result);
      return result;
    }
    for (const name of ["openSourcePack", "submitSbc", "openReward"]) {
      if (typeof options[name] !== "function") throw new TypeError(`${name} is required for live validation`);
    }
    const opened = await options.openSourcePack({ result, sourcePack: result.sourcePack });
    if (opened?.status && opened.status !== "opened") {
      result.status = opened.status === "unavailable" ? "unavailable" : "blocked";
      result.reason = unavailableReason(opened, "source pack open failed");
      await options.finalize?.(result);
      return result;
    }
    const submission = await options.submitSbc({ result, sbc: result.sbc });
    if (!submission?.submitted && submission?.status !== "submitted") {
      result.status = submission?.status === "unavailable" ? "unavailable" : "blocked";
      result.reason = unavailableReason(submission, "SBC submit failed");
      await options.finalize?.(result);
      return result;
    }
    result.rewardPackId = submission.rewardPackId ?? null;
    const reward = await options.openReward({ result, rewardPackId: result.rewardPackId });
    if (reward?.status && reward.status !== "opened") {
      result.status = reward.status === "unavailable" ? "unavailable" : "blocked";
      result.reason = unavailableReason(reward, "reward pack open failed");
    }
    await options.finalize?.(result);
    return result;
  }

  // src/workflows/batch-open.js
  function createResult(input = {}) {
    return Object.freeze({
      status: String(input.status || "completed"),
      reason: input.reason ? String(input.reason) : null,
      requestedPacks: Number(input.requestedPacks || 0),
      packsOpened: Number(input.packsOpened || 0),
      skippedPacks: Number(input.skippedPacks || 0),
      openedItems: Object.freeze([...input.openedItems || []]),
      receipts: Object.freeze([...input.receipts || []]),
      entries: Object.freeze((input.entries || []).map((entry) => Object.freeze({ ...entry })))
    });
  }
  async function runBatchOpenWorkflow(options = {}) {
    if (typeof options.resolvePack !== "function") throw new TypeError("resolvePack is required");
    if (typeof options.openPack !== "function") throw new TypeError("openPack is required");
    const plan = normalizeBatchOpenPlan(options.plan);
    const requestedPacks = plan.entries.reduce((sum, entry) => sum + entry.quantity, 0);
    const receipts = [];
    const openedItems = [];
    const entries = [];
    let packsOpened = 0;
    let skippedPacks = 0;
    const skipFollowingEntries = (startIndex, reason) => {
      for (let index = startIndex; index < plan.entries.length; index++) {
        const pending = plan.entries[index];
        entries.push({
          packId: pending.packId,
          packName: pending.packName,
          requested: pending.quantity,
          opened: 0,
          skipped: pending.quantity,
          reason
        });
        skippedPacks += pending.quantity;
      }
    };
    const finish = (status = "completed", reason = null) => createResult({
      status,
      reason,
      requestedPacks,
      packsOpened,
      skippedPacks,
      openedItems,
      receipts,
      entries
    });
    if (typeof options.beforeStart === "function") {
      const preflight = await options.beforeStart();
      if (preflight?.status === "preserved" || preflight?.status === "blocked") {
        skipFollowingEntries(0, preflight.reason || "Unassigned items must be resolved before opening packs");
        await options.onEvent?.("preflight-preserved", { preflight, requestedPacks });
        return finish("preserved", preflight.reason || "Unassigned items must be resolved before opening packs");
      }
    }
    for (let entryIndex = 0; entryIndex < plan.entries.length; entryIndex++) {
      const entry = plan.entries[entryIndex];
      const entryResult = {
        packId: entry.packId,
        packName: entry.packName,
        requested: entry.quantity,
        opened: 0,
        skipped: 0,
        reason: null
      };
      entries.push(entryResult);
      for (let openIndex = 0; openIndex < entry.quantity; openIndex++) {
        if (options.shouldStop?.() === true) {
          const remaining = entry.quantity - openIndex;
          entryResult.skipped += remaining;
          entryResult.reason = "stopped by user";
          skippedPacks += remaining;
          skipFollowingEntries(entryIndex + 1, "stopped by user");
          return finish("stopped", "stopped by user");
        }
        let receipt = null;
        let foundPack = false;
        try {
          for (let resolveAttempt = 1; resolveAttempt <= 2 && !receipt; resolveAttempt++) {
            const pack = await options.resolvePack(entry, { entryIndex, openIndex, resolveAttempt });
            if (!pack) break;
            foundPack = true;
            receipt = await options.openPack({
              entry,
              entryIndex,
              openIndex,
              resolveAttempt,
              pack
            });
          }
        } catch (error) {
          const remaining = entry.quantity - openIndex;
          entryResult.skipped += remaining;
          entryResult.reason = error?.message || String(error || "open failed");
          skippedPacks += remaining;
          if (options.shouldStop?.() === true || /stopped by user/i.test(entryResult.reason)) {
            skipFollowingEntries(entryIndex + 1, "stopped by user");
            return finish("stopped", "stopped by user");
          }
          await options.onEvent?.("blocked", { entry, entryResult, error });
          skipFollowingEntries(entryIndex + 1, "not attempted after blocked pack");
          return finish("blocked", entryResult.reason);
        }
        if (!receipt || receipt.status !== "opened") {
          const remaining = entry.quantity - openIndex;
          entryResult.skipped += remaining;
          entryResult.reason = foundPack ? "matching pack became unavailable" : "matching pack is unavailable";
          skippedPacks += remaining;
          await options.onEvent?.("unavailable", { entry, entryResult, remaining });
          break;
        }
        receipts.push(receipt);
        openedItems.push(...receipt.openedItems || []);
        packsOpened++;
        entryResult.opened++;
        await options.onEvent?.("opened", {
          entry,
          entryResult,
          receipt,
          packsOpened,
          requestedPacks
        });
        if ((receipt.pendingItemRefs || []).length) {
          const remaining = entry.quantity - openIndex - 1;
          entryResult.skipped += remaining;
          entryResult.reason = receipt.details?.cleanupReason || `${receipt.pendingItemRefs.length} opened item(s) remain unresolved`;
          skippedPacks += remaining;
          skipFollowingEntries(entryIndex + 1, "not attempted while opened items remain unresolved");
          await options.onEvent?.("pending", {
            entry,
            entryResult,
            receipt,
            remaining,
            packsOpened,
            requestedPacks
          });
          return finish("preserved", entryResult.reason);
        }
        if (receipt.details?.cleanupStatus === "preserved") {
          const remaining = entry.quantity - openIndex - 1;
          entryResult.skipped += remaining;
          entryResult.reason = receipt.details.cleanupReason || "Unassigned items were preserved";
          skippedPacks += remaining;
          skipFollowingEntries(entryIndex + 1, "not attempted while Unassigned is preserved");
          await options.onEvent?.("preserved", {
            entry,
            entryResult,
            receipt,
            remaining,
            packsOpened,
            requestedPacks
          });
          return finish("preserved", entryResult.reason);
        }
      }
    }
    return finish("completed");
  }

  // src/workflows/inventory-exhaustion.js
  async function emit7(options, event, payload = {}) {
    await options.onEvent?.(event, payload);
  }
  async function runInventoryExhaustionWorkflow(options = {}) {
    if (!Array.isArray(options.stages) || !options.stages.length) {
      throw new TypeError("stages must be a non-empty array");
    }
    if (typeof options.runStage !== "function") throw new TypeError("runStage is required");
    const result = {
      status: "completed",
      completedStages: [],
      totalCompletions: 0,
      reason: null
    };
    for (let index = 0; index < options.stages.length; index++) {
      await options.stopPoint?.();
      const stage = options.stages[index];
      await emit7(options, "stage-start", { result, stage, index, total: options.stages.length });
      const stageResult = await options.runStage({ result, stage, index }) || { status: "blocked" };
      await emit7(options, "stage-complete", { result, stage, index, stageResult });
      result.completedStages.push({ id: stage.id || `stage-${index + 1}`, result: stageResult });
      result.totalCompletions += Number(stageResult.completions || 0);
      if (stageResult.status === "planned") {
        result.status = "planned";
        result.reason ||= stageResult.reason || "inventory exhaustion plan complete";
        continue;
      }
      if (stageResult.status === "blocked" || stageResult.status === "stopped") {
        result.status = stageResult.status;
        result.reason = stageResult.reason || `${stage.name || `stage ${index + 1}`} stopped`;
        break;
      }
    }
    if (!["blocked", "stopped"].includes(result.status)) await options.finalize?.(result);
    return result;
  }

  // src/workflows/dispatch.js
  var STRATEGY_RUNNER_KEYS = Object.freeze({
    validationBronzeUpgrade: "validationBronzeUpgrade",
    dailySingleCardRecycle: "dailySingleCardRecycle",
    supplyAndCraft: "supplyAndCraft",
    inventoryMixedUpgrade: "supplyAndCraft",
    commonGoldToRareUpgrade: "supplyAndCraft",
    provisionPackCrafting: "provisionPackCrafting",
    provisionPackDualCrafting: "provisionPackCrafting",
    rarePackTo84Upgrade: "rarePackTo84Upgrade",
    playerPickSbc: "playerPickSbc",
    dailyRoutine: "dailyRoutine",
    workflowRoutine: "workflowRoutine",
    fillAndVerifySbc: "fillAndVerifySbc",
    inventoryExhaustion: "inventoryExhaustion"
  });
  var STANDARD_FINALIZATION_STRATEGIES = /* @__PURE__ */ new Set([
    "dailyRoutine",
    "workflowRoutine",
    "dailySingleCardRecycle",
    "supplyAndCraft",
    "inventoryMixedUpgrade",
    "commonGoldToRareUpgrade",
    "provisionPackCrafting",
    "provisionPackDualCrafting",
    "rarePackTo84Upgrade",
    "fillAndVerifySbc",
    "inventoryExhaustion"
  ]);
  var DISPATCHED_LOOP_STRATEGIES = Object.freeze(Object.keys(STRATEGY_RUNNER_KEYS));
  if (LOOP_STRATEGIES.some((strategy) => !STRATEGY_RUNNER_KEYS[strategy])) {
    throw new Error("Loop strategy registry and workflow dispatch are out of sync");
  }
  async function dispatchConfiguredWorkflow(options = {}) {
    const {
      loopDef,
      roundNo = 1,
      runners = {},
      log,
      afterStandardRun,
      afterPlayerPickRun
    } = options;
    const strategy = loopDef.strategy;
    const dryRun = loopDef.dryRun === true;
    log(`Loop selected: ${loopDef.name} (${strategy})`);
    if (loopDef.disabledPiles?.length) log(`Disabled piles: ${loopDef.disabledPiles.join(", ")}`);
    if (loopDef.inventoryOnlyIgnored === true) {
      log(`${loopDef.name}: global inventory-only mode is not supported by ${strategy}; using the Loop's normal workflow`);
    }
    if (dryRun) log("Dry run active: no items will be moved, no packs opened, no squads saved, no SBCs submitted");
    let result;
    if (strategy === "validationBronzeUpgrade") {
      return runners.validationBronzeUpgrade(loopDef, roundNo);
    }
    const runnerKey = STRATEGY_RUNNER_KEYS[strategy];
    const runner = runnerKey ? runners[runnerKey] : null;
    if (typeof runner !== "function") {
      if (!runnerKey) throw new Error(`Unsupported loop strategy: ${strategy}`);
      throw new Error(`Missing runner for loop strategy: ${strategy}`);
    }
    result = await runner(loopDef);
    if (strategy === "playerPickSbc") {
      if (!dryRun) await afterPlayerPickRun(loopDef, result);
      return result;
    }
    if (!dryRun && STANDARD_FINALIZATION_STRATEGIES.has(strategy)) {
      await afterStandardRun(loopDef, result);
    }
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
  function escapeLogHtml(text) {
    return String(text).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[ch]);
  }
  function formatLogHtml(lines = [], escapeHtml = escapeLogHtml) {
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
    const formatFullLog = options.formatFullLog || ((lines) => formatLogHtml(lines));
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
        if (latestBox.textContent !== latest) {
          latestBox.textContent = latest;
          latestBox.scrollTop = 0;
        }
        if (latestBox.title !== latest) latestBox.title = latest;
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

  // src/ui/main-panel-bindings.js
  var PICK_OPTION_IDS = [
    "bronze-loop-pick-protect-high-gold",
    "bronze-loop-pick-auto-below-90",
    "bronze-loop-pick-prefer-scanned",
    "bronze-loop-pick-open-at-end",
    "bronze-loop-pick-high-gold-threshold",
    "bronze-loop-pick-auto-threshold"
  ];
  function required(panel, selector) {
    const element = panel?.querySelector?.(selector);
    if (!element) throw new Error(`Main panel control is missing: ${selector}`);
    return element;
  }
  function bindMainPanelCommands(options = {}) {
    const panel = options.panel;
    const commands = options.commands || {};
    if (!panel?.querySelector) throw new TypeError("panel element is required");
    const select = required(panel, "#bronze-loop-select");
    const editor = required(panel, "#bronze-loop-json");
    select.addEventListener("change", (event) => commands.selectLoop?.(event.target?.value, event));
    required(panel, "#bronze-loop-edit").addEventListener("click", (event) => {
      editor.classList.toggle("show");
      if (editor.classList.contains("show")) select.value = "custom";
      commands.editJson?.({ visible: editor.classList.contains("show"), event });
    });
    required(panel, "#bronze-loop-edit-config").addEventListener("click", (event) => commands.editConfig?.(event));
    required(panel, "#bronze-loop-apply-config").addEventListener("click", (event) => commands.applyConfig?.(event));
    editor.addEventListener("input", (event) => commands.jsonInput?.(event));
    PICK_OPTION_IDS.forEach((id) => {
      required(panel, `#${id}`).addEventListener("change", (event) => commands.savePickOptions?.(event));
    });
    required(panel, "#bronze-loop-daily-inventory-only").addEventListener("change", (event) => commands.saveLoopOptions?.(event));
    required(panel, "#bronze-loop-show-mvp").addEventListener("change", (event) => commands.saveLoopOptions?.(event));
    required(panel, "#bronze-loop-reward-alert-enabled").addEventListener("change", (event) => commands.saveRewardAlertEnabled?.(event));
    required(panel, "#bronze-loop-reward-alert-settings").addEventListener("click", (event) => commands.openRewardAlertSettings?.(event));
    required(panel, "#bronze-loop-start").addEventListener("click", (event) => commands.start?.(event));
    required(panel, "#bronze-loop-batch-open").addEventListener("click", (event) => commands.openBatch?.(event));
    required(panel, "#bronze-loop-recap-reopen").addEventListener("click", (event) => commands.reopenRecap?.(event));
    required(panel, "#bronze-loop-refresh").addEventListener("click", (event) => commands.refresh?.(event));
    required(panel, "#bronze-loop-scan-picks").addEventListener("click", (event) => commands.scanPicks?.(event));
    required(panel, "#bronze-loop-preview-pick-recap").addEventListener("click", (event) => commands.previewPickRecap?.(event));
    required(panel, "#bronze-loop-load-json").addEventListener("click", (event) => commands.loadJson?.(event));
    required(panel, "#bronze-loop-built-in").addEventListener("click", (event) => commands.useBuiltIn?.(event));
    required(panel, "#bronze-loop-stop").addEventListener("click", (event) => commands.stop?.(event));
    required(panel, "#bronze-loop-copy").addEventListener("click", (event) => commands.copyLog?.(event));
    required(panel, "#bronze-loop-clear").addEventListener("click", (event) => commands.clearLog?.(event));
    required(panel, "#bronze-loop-download").addEventListener("click", (event) => commands.downloadLog?.(event));
  }
  function hydrateMainPanelOptions(options = {}) {
    const panel = options.panel;
    if (!panel?.querySelector) throw new TypeError("panel element is required");
    const loopOptions = options.loopOptions || {};
    const pickOptions = options.pickOptions || {};
    const rewardAlertSettings = options.rewardAlertSettings || {};
    required(panel, "#bronze-loop-show-mvp").checked = loopOptions.showMvpLoops === true;
    required(panel, "#bronze-loop-daily-inventory-only").checked = loopOptions.inventoryOnly === true || loopOptions.dailyRecycleInventoryOnly === true;
    required(panel, "#bronze-loop-pick-protect-high-gold").checked = pickOptions.protectHighGold === true;
    required(panel, "#bronze-loop-pick-auto-below-90").checked = pickOptions.autoSelectBelow90 === true;
    required(panel, "#bronze-loop-pick-prefer-scanned").checked = pickOptions.preferScannedMetadata === true;
    required(panel, "#bronze-loop-pick-open-at-end").checked = pickOptions.openPicksAtEnd === true;
    required(panel, "#bronze-loop-pick-high-gold-threshold").value = pickOptions.highGoldThreshold;
    required(panel, "#bronze-loop-pick-auto-threshold").value = pickOptions.autoPickThreshold;
    required(panel, "#bronze-loop-reward-alert-enabled").checked = rewardAlertSettings.enabled !== false;
  }

  // src/ui/main-panel-commands.js
  function createMainPanelCommands(options = {}) {
    const state = options.state;
    if (!state) throw new TypeError("runtime state is required");
    const log = options.log || (() => {
    });
    const setPanelState = options.setPanelState || (() => {
    });
    const commands = {
      selectLoop(selectedId) {
        if (selectedId !== "custom") options.setLoopJson?.(options.getLoopDefById?.(selectedId));
        options.updateLoopControls?.();
      },
      editJson: options.updateLoopControls,
      editConfig() {
        if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops) return false;
        options.editLoopConfig?.();
        return true;
      },
      applyConfig() {
        if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops) return false;
        state.loadingLoops = true;
        setPanelState();
        try {
          options.applyLoopConfigEditor?.();
          return true;
        } catch (error) {
          log(`Workflow JSON apply failed: ${error?.message || error}`);
          return false;
        } finally {
          state.loadingLoops = false;
          setPanelState();
        }
      },
      jsonInput: options.updateLoopControls,
      async savePickOptions(event) {
        options.savePickOptions?.(event);
        if (event?.target?.id !== "bronze-loop-pick-prefer-scanned" || event.target.checked !== true) return true;
        return commands.scanPicks();
      },
      saveLoopOptions: options.saveLoopOptions,
      saveRewardAlertEnabled: options.saveRewardAlertEnabled,
      openRewardAlertSettings: options.openRewardAlertSettings,
      start() {
        if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops) return false;
        options.start?.();
        return true;
      },
      openBatch() {
        if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops) return false;
        options.openBatch?.();
        return true;
      },
      reopenRecap: options.reopenRecap,
      previewPickRecap() {
        if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops) return false;
        options.previewPickRecap?.();
        return true;
      },
      async refresh() {
        if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops) return false;
        state.refreshing = true;
        setPanelState();
        try {
          await options.refreshInventoryCaches?.("manual button");
          return true;
        } catch (error) {
          log(`Cache refresh failed: ${error?.message || error}`);
          return false;
        } finally {
          state.refreshing = false;
          setPanelState();
        }
      },
      async scanPicks() {
        if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops) return false;
        state.scanningPicks = true;
        setPanelState();
        try {
          await options.scanPlayerPicks?.();
          return true;
        } catch (error) {
          log(`Player Pick scan failed: ${error?.message || error}`);
          return false;
        } finally {
          state.scanningPicks = false;
          setPanelState();
        }
      },
      async loadJson() {
        if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops) return false;
        state.loadingLoops = true;
        setPanelState();
        try {
          log(`Loading loop definitions from ${options.loopConfigUrl}`);
          await options.loadLoopConfig?.(options.loopConfigUrl);
          return true;
        } catch (error) {
          log(`Loop JSON load failed: ${error?.message || error}`);
          return false;
        } finally {
          state.loadingLoops = false;
          setPanelState();
        }
      },
      useBuiltIn() {
        if (state.running || state.refreshing || state.scanningPicks || state.loadingLoops) return false;
        options.resetLoopDefs?.();
        setPanelState();
        return true;
      },
      stop() {
        state.stopping = true;
        log("Stop requested; waiting for current safe point");
        setPanelState();
      },
      async copyLog() {
        await options.userEffects?.copyText?.(options.getLogText?.() || "");
        log("Log copied to clipboard");
      },
      clearLog: options.clearLog,
      downloadLog() {
        const timestamp = Number(options.now?.() || Date.now());
        options.userEffects?.downloadText?.(options.getLogText?.() || "", `bronze-loop-${timestamp}.log`);
        log("Log download created");
      }
    };
    return Object.freeze(commands);
  }

  // src/ui/main-panel-geometry.js
  var DEFAULT_SIZES = Object.freeze({
    compact: Object.freeze({ width: 300, height: 178 }),
    options: Object.freeze({ width: 360, height: 620 })
  });
  function viewportSize(getViewport) {
    const value = getViewport?.() || {};
    return {
      width: Math.max(0, Number(value.width || 0)),
      height: Math.max(0, Number(value.height || 0))
    };
  }
  function getMainPanelDefaultSize(optionsOpen = false) {
    return optionsOpen ? { ...DEFAULT_SIZES.options } : { ...DEFAULT_SIZES.compact };
  }
  function clampMainPanelDefaultSize(size, viewport) {
    return {
      width: Math.min(Number(size.width), Math.max(220, Number(viewport.width) - 20)),
      height: Math.min(Number(size.height), Math.max(180, Number(viewport.height) - 20))
    };
  }
  function createMainPanelGeometry(options = {}) {
    const panel = options.panel;
    if (!panel?.querySelector || !panel?.classList) throw new TypeError("panel element is required");
    const getViewport = options.getViewport || (() => ({ width: 0, height: 0 }));
    const savePosition = options.savePosition || (() => {
    });
    const loadPosition = options.loadPosition || (() => null);
    const onModeChange = options.onModeChange || (() => {
    });
    const schedule = options.schedule || ((callback, delay) => setTimeout(callback, delay));
    function persistPosition() {
      try {
        const rect = panel.getBoundingClientRect();
        savePosition({
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        });
      } catch {
      }
    }
    function resetSize() {
      const size = getMainPanelDefaultSize(panel.classList.contains("options-open"));
      const clamped = clampMainPanelDefaultSize(size, viewportSize(getViewport));
      panel.dataset.minWidth = String(clamped.width);
      panel.dataset.minHeight = String(clamped.height);
      panel.style.width = `${clamped.width}px`;
      panel.style.height = `${clamped.height}px`;
      return clamped;
    }
    function updateOptionsButton() {
      const button3 = panel.querySelector("#bronze-loop-options-toggle");
      if (!button3) return;
      const open = panel.classList.contains("options-open");
      button3.textContent = open ? "Hide" : "Options";
      button3.title = open ? "Hide advanced options" : "Show advanced options";
    }
    function updateCollapseButton() {
      const button3 = panel.querySelector("#bronze-loop-collapse");
      if (!button3) return;
      button3.textContent = "L";
      button3.title = panel.classList.contains("icon-only") ? "Restore panel" : "Collapse to icon";
    }
    function notifyModeChange() {
      updateOptionsButton();
      updateCollapseButton();
      onModeChange({
        iconOnly: panel.classList.contains("icon-only"),
        optionsOpen: panel.classList.contains("options-open")
      });
    }
    function restorePanel() {
      panel.classList.remove("icon-only");
      resetSize();
      notifyModeChange();
      persistPosition();
    }
    function toggleIconOnly(event) {
      if (panel.dataset.dragJustEnded === "1") {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        return;
      }
      panel.classList.toggle("icon-only");
      if (panel.classList.contains("icon-only")) {
        panel.classList.remove("options-open");
        panel.style.width = "";
        panel.style.height = "";
      } else {
        resetSize();
      }
      notifyModeChange();
      persistPosition();
    }
    function toggleOptions() {
      panel.classList.toggle("options-open");
      resetSize();
      notifyModeChange();
      persistPosition();
    }
    function restoreSavedPosition() {
      const saved = loadPosition();
      if (!saved || !Number.isFinite(saved.left) || !Number.isFinite(saved.top)) return;
      const viewport = viewportSize(getViewport);
      panel.style.left = `${Math.max(0, Math.min(viewport.width - 80, saved.left))}px`;
      panel.style.top = `${Math.max(0, Math.min(viewport.height - 40, saved.top))}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    }
    function makeDraggable() {
      const handle = panel.querySelector("#bronze-loop-drag");
      if (!handle) return;
      let dragging = false;
      let startX = 0;
      let startY = 0;
      let startLeft = 0;
      let startTop = 0;
      let moved = false;
      handle.addEventListener("pointerdown", (event) => {
        if (!panel.classList.contains("icon-only") && event.target?.closest?.("button,select,input,textarea")) return;
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
        event.preventDefault?.();
      });
      handle.addEventListener("pointermove", (event) => {
        if (!dragging) return;
        const deltaX = event.clientX - startX;
        const deltaY = event.clientY - startY;
        if (Math.abs(deltaX) + Math.abs(deltaY) > 3) moved = true;
        const viewport = viewportSize(getViewport);
        panel.style.left = `${Math.max(0, Math.min(viewport.width - 36, startLeft + deltaX))}px`;
        panel.style.top = `${Math.max(0, Math.min(viewport.height - 36, startTop + deltaY))}px`;
        event.preventDefault?.();
      });
      const stopDrag = () => {
        if (!dragging) return;
        dragging = false;
        if (panel.classList.contains("icon-only") && !moved) {
          panel.dataset.dragJustEnded = "1";
          restorePanel();
          schedule(() => {
            delete panel.dataset.dragJustEnded;
          }, 150);
          return;
        }
        if (moved) {
          panel.dataset.dragJustEnded = "1";
          schedule(() => {
            delete panel.dataset.dragJustEnded;
          }, 150);
        }
        persistPosition();
      };
      handle.addEventListener("pointerup", stopDrag);
      handle.addEventListener("pointercancel", stopDrag);
    }
    function makeResizable() {
      const edgePad = 20;
      const directions = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
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
        const minWidth = Number(panel.dataset.minWidth || DEFAULT_SIZES.compact.width);
        const minHeight = Number(panel.dataset.minHeight || DEFAULT_SIZES.compact.height);
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
        const viewport = viewportSize(getViewport);
        const maxWidth = viewport.width - edgePad;
        const maxHeight = viewport.height - edgePad;
        if (newWidth > maxWidth) {
          const overflow = newWidth - maxWidth;
          newWidth = maxWidth;
          if (dir.includes("w")) newLeft += overflow;
        }
        if (newHeight > maxHeight) {
          const overflow = newHeight - maxHeight;
          newHeight = maxHeight;
          if (dir.includes("n")) newTop += overflow;
        }
        newLeft = Math.max(0, Math.min(viewport.width - newWidth, newLeft));
        newTop = Math.max(0, Math.min(viewport.height - newHeight, newTop));
        panel.style.left = `${newLeft}px`;
        panel.style.top = `${newTop}px`;
        panel.style.width = `${newWidth}px`;
        panel.style.height = `${newHeight}px`;
        event.preventDefault?.();
      };
      const onUp = () => {
        if (!resizing) return;
        resizing = null;
        persistPosition();
      };
      directions.forEach((dir) => {
        const element = panel.querySelector(`#bronze-loop-resize-${dir}`);
        if (!element) return;
        element.addEventListener("pointerdown", (event) => {
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
          element.setPointerCapture?.(event.pointerId);
          event.preventDefault?.();
        });
        element.addEventListener("pointermove", onMove);
        element.addEventListener("pointerup", onUp);
        element.addEventListener("pointercancel", onUp);
      });
    }
    restoreSavedPosition();
    resetSize();
    makeDraggable();
    makeResizable();
    panel.querySelector("#bronze-loop-collapse")?.addEventListener("click", toggleIconOnly);
    panel.querySelector("#bronze-loop-options-toggle")?.addEventListener("click", toggleOptions);
    notifyModeChange();
    return Object.freeze({ resetSize, restorePanel, toggleIconOnly, toggleOptions, persistPosition });
  }

  // src/ui/main-panel-state.js
  function query(panel, selector) {
    return panel?.querySelector?.(selector) || null;
  }
  function renderMainPanelLoopOptions(options = {}) {
    const panel = options.panel;
    const createOption = options.createOption;
    const select = query(panel, "#bronze-loop-select");
    if (!select || typeof createOption !== "function") return null;
    const loops = options.loops || [];
    const previous = String(options.selectedId || select.value || "");
    select.textContent = "";
    for (const loop of loops) {
      const option = createOption();
      option.value = loop.id;
      option.textContent = loop.name;
      select.appendChild(option);
    }
    const custom = createOption();
    custom.value = "custom";
    custom.textContent = "Custom JSON";
    select.appendChild(custom);
    const values = Array.from(select.options || []).map((option) => option.value);
    const nextValue = values.includes(previous) ? previous : loops[0]?.id;
    if (nextValue) select.value = nextValue;
    return select.value || null;
  }
  function renderMainPanelRounds(options = {}) {
    const panel = options.panel;
    const display = options.show === true ? "" : "none";
    for (const selector of ["#bronze-loop-rounds-row", "#bronze-loop-rounds-label", "#bronze-loop-rounds"]) {
      const element = query(panel, selector);
      if (element) element.style.display = display;
    }
    if (display === "none") return;
    const quantity = options.quantity || {};
    const label = query(panel, "#bronze-loop-rounds-label");
    const input = query(panel, "#bronze-loop-rounds");
    if (label) label.textContent = quantity.label || "Rounds";
    if (!input) return;
    input.min = String(quantity.min || 1);
    input.max = String(quantity.max || 50);
    const quantityKey = String(options.quantityKey || "");
    if (input.dataset?.quantityKey !== quantityKey) {
      input.value = String(quantity.default || 1);
      if (input.dataset) input.dataset.quantityKey = quantityKey;
    }
  }
  function renderMainPanelRecap(options = {}) {
    const button3 = query(options.panel, "#bronze-loop-recap-reopen");
    if (!button3) return;
    const recap = options.recap;
    button3.style.display = recap ? "" : "none";
    if (recap) {
      const label = recap.type === "batch" ? "Batch Open" : "Player Pick";
      button3.title = `Last ${label} recap: ${recap.name} (${Number(recap.totalCards || 0)} card(s))`;
    }
  }
  function renderRewardAlertSummary(options = {}) {
    const panel = options.panel;
    const settings = options.settings || {};
    const summary = query(panel, "#bronze-loop-reward-alert-summary");
    const enabled = query(panel, "#bronze-loop-reward-alert-enabled");
    if (enabled) enabled.checked = settings.enabled !== false;
    if (!summary) return;
    if (settings.enabled === false) {
      summary.textContent = "Off";
      return;
    }
    const channels = [];
    if (settings.highlightEnabled !== false) channels.push("highlight");
    if (settings.desktopEnabled === true) channels.push("desktop");
    if (settings.ntfyEnabled === true) channels.push("ntfy");
    summary.textContent = `${Number(settings.minimumRating || 94)}+ special${channels.length ? ` | ${channels.join(" | ")}` : ""}`;
  }
  function renderMainPanelRuntimeState(options = {}) {
    const panel = options.panel;
    const state = options.state || {};
    const busy = state.running === true || state.refreshing === true || state.scanningPicks === true || state.loadingLoops === true;
    const disabled = {
      "bronze-loop-start": busy,
      "bronze-loop-batch-open": busy,
      "bronze-loop-stop": state.running !== true,
      "bronze-loop-select": state.running === true || state.scanningPicks === true || state.loadingLoops === true,
      "bronze-loop-edit": state.running === true || state.scanningPicks === true || state.loadingLoops === true,
      "bronze-loop-edit-config": busy,
      "bronze-loop-apply-config": busy,
      "bronze-loop-refresh": busy,
      "bronze-loop-scan-picks": busy,
      "bronze-loop-load-json": busy,
      "bronze-loop-built-in": busy || state.usingBuiltIn === true,
      "bronze-loop-dry-run": state.running === true,
      "bronze-loop-open-rewards": state.running === true,
      "bronze-loop-daily-inventory-only": state.running === true,
      "bronze-loop-pick-protect-high-gold": state.running === true,
      "bronze-loop-pick-auto-below-90": state.running === true,
      "bronze-loop-pick-prefer-scanned": state.running === true || state.scanningPicks === true,
      "bronze-loop-pick-open-at-end": state.running === true,
      "bronze-loop-pick-high-gold-threshold": state.running === true,
      "bronze-loop-pick-auto-threshold": state.running === true,
      "bronze-loop-show-mvp": state.running === true,
      "bronze-loop-reward-alert-settings": state.running === true,
      "bronze-loop-rounds": state.running === true,
      "bronze-loop-json": state.running === true
    };
    for (const [id, value] of Object.entries(disabled)) {
      const element = query(panel, `#${id}`);
      if (element) element.disabled = value;
    }
  }

  // src/ui/main-panel-view.js
  var MAIN_PANEL_STYLE = `
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
  #bronze-loop-panel.startup-hidden {
    visibility: hidden;
    pointer-events: none;
  }
  #bronze-loop-panel .panel-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  .bronze-loop-resize { position: absolute; z-index: 2; touch-action: none; }
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
  #bronze-loop-panel.icon-only #bronze-loop-options-toggle { display: none; }
  #bronze-loop-panel.icon-only #bronze-loop-drag { width: 34px; height: 34px; margin: 0; justify-content: center; }
  #bronze-loop-drag { cursor: move; user-select: none; justify-content: space-between; }
  #bronze-loop-title { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
  #bronze-loop-panel .bronze-loop-option-summary { color: #9fb2c9; font-size: 11px; flex: 1 1 auto; min-width: 100px; }
  #bronze-loop-panel select { flex: 1; min-width: 0; height: 28px; background: #222832; color: #fff; border: 1px solid #607089; }
  #bronze-loop-latest {
    flex: 1 1 auto;
    min-height: 28px;
    overflow-x: hidden;
    overflow-y: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background: #0c0f13;
    border: 1px solid #303946;
    padding: 6px;
    box-sizing: border-box;
    line-height: 16px;
    color: #d7e2f0;
    word-break: break-word;
    user-select: text;
    -webkit-user-select: text;
    cursor: text;
  }
  #bronze-loop-options { display: none; margin-top: 8px; padding-top: 8px; border-top: 1px solid #303946; }
  #bronze-loop-panel.options-open #bronze-loop-options { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; overflow: hidden; }
  #bronze-loop-panel.options-open #bronze-loop-latest { display: none; }
  .bronze-loop-section { color: #9fb2c9; font-size: 11px; margin: 8px 0 6px; }
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
    flex: 1 1 64px;
    min-height: 0;
    overflow-x: auto;
    overflow-y: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
    scrollbar-gutter: stable;
    overscroll-behavior: contain;
    background: #0c0f13;
    border: 1px solid #303946;
    padding: 8px;
    box-sizing: border-box;
    user-select: text;
    -webkit-user-select: text;
    cursor: text;
  }
  #bronze-loop-log .bronze-loop-log-high-rated { color: #ffd54a; font-weight: 700; }
`;
  function mainPanelHtml(maxRounds = 3) {
    const rounds = Math.max(1, Number(maxRounds) || 3);
    const resizeHandles = ["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((dir) => `<div class="bronze-loop-resize" id="bronze-loop-resize-${dir}"></div>`).join("\n");
    return `
    <div class="row" id="bronze-loop-drag">
      <span id="bronze-loop-title">Loop Runner</span>
      <button id="bronze-loop-options-toggle" title="Options">Options</button>
      <button id="bronze-loop-collapse" title="Compact">L</button>
    </div>
    <div class="panel-body">
      <div class="row"><select id="bronze-loop-select"></select></div>
      <div class="row">
        <button id="bronze-loop-start">Start</button>
        <button id="bronze-loop-stop" disabled>Stop</button>
        <button id="bronze-loop-batch-open" title="Scan My Packs and open a saved batch">Batch Open</button>
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
          <label title="Use current inventory instead of opening supply or reward packs for Loops whose strategy supports inventory-only mode">
            <input id="bronze-loop-daily-inventory-only" type="checkbox"> Inventory only
          </label>
        </div>
        <div class="row"><label title="Show MVP and one-run validation loops in the main selector"><input id="bronze-loop-show-mvp" type="checkbox"> Show MVP loops</label></div>
        <div class="row" id="bronze-loop-reward-alert-row">
          <label title="Enable high-rated special-card alerts"><input id="bronze-loop-reward-alert-enabled" type="checkbox"> Reward alerts</label>
          <span id="bronze-loop-reward-alert-summary" class="bronze-loop-option-summary">94+ special | highlight</span>
          <button id="bronze-loop-reward-alert-settings" title="Reward alert settings">Settings</button>
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
        <div class="row">
          <label title="Use fully supported scanned Pick requirements and stable identities while keeping static loop IDs as fallback">
            <input id="bronze-loop-pick-prefer-scanned" type="checkbox"> Use scanned Pick metadata
          </label>
          <label title="Complete the requested Player Pick SBC count first, then open the matching Picks together">
            <input id="bronze-loop-pick-open-at-end" type="checkbox"> Open Picks at end
          </label>
        </div>
        <div class="row" id="bronze-loop-rounds-row">
          <span id="bronze-loop-rounds-label">Rounds</span>
          <input id="bronze-loop-rounds" type="number" min="1" max="50" value="${rounds}">
        </div>
        <div class="bronze-loop-section">Config</div>
        <div class="row"><button id="bronze-loop-refresh">Refresh caches</button><button id="bronze-loop-scan-picks">Scan Picks</button><button id="bronze-loop-preview-pick-recap">Preview Pick recap</button><button id="bronze-loop-load-json">Load loops JSON</button></div>
        <div class="row"><button id="bronze-loop-built-in" disabled>Built-in loops</button><button id="bronze-loop-edit">Edit loop JSON</button></div>
        <div class="row"><button id="bronze-loop-edit-config" title="Edit every loop, workflow step, and recovery policy as one configuration">Edit workflow JSON</button><button id="bronze-loop-apply-config" title="Validate and apply the full workflow configuration in the editor">Apply workflow JSON</button></div>
        <textarea id="bronze-loop-json" spellcheck="false"></textarea>
        <div class="bronze-loop-section">Log</div>
        <div class="row"><button id="bronze-loop-copy">Copy log</button><button id="bronze-loop-clear">Clear log</button><button id="bronze-loop-download">Save log</button></div>
        <div id="bronze-loop-log"></div>
      </div>
    </div>
    ${resizeHandles}
  `;
  }
  function mountMainPanel(options = {}) {
    const dom = options.dom;
    if (!dom?.query || !dom?.create || !dom?.appendToHead || !dom?.appendToBody) {
      throw new TypeError("dom adapter is required");
    }
    const existing = dom.query("#bronze-loop-panel");
    if (existing) return { panel: existing, created: false };
    dom.query("#bronze-loop-style")?.remove?.();
    const style = dom.create("style");
    style.id = "bronze-loop-style";
    style.textContent = MAIN_PANEL_STYLE;
    dom.appendToHead(style);
    const panel = dom.create("div");
    panel.id = "bronze-loop-panel";
    if (options.startupHidden === true) panel.classList?.add?.("startup-hidden");
    panel.innerHTML = mainPanelHtml(options.maxRounds);
    dom.appendToBody(panel);
    return { panel, style, created: true };
  }
  function setMainPanelStartupHidden(panel, hidden) {
    if (!panel?.classList) return;
    panel.classList.toggle("startup-hidden", hidden === true);
    if (hidden === true) panel.setAttribute?.("aria-hidden", "true");
    else panel.removeAttribute?.("aria-hidden");
  }

  // src/ui/player-pick-modal.js
  function applyStyles(element, styles) {
    Object.assign(element.style, styles);
  }
  function waitForManualPlayerPickSelection(options = {}) {
    if (!options.dom?.create || !options.dom?.appendToBody) throw new TypeError("dom adapter is required");
    if (typeof options.describeCandidate !== "function") throw new TypeError("describeCandidate is required");
    if (typeof options.scheduleStopCheck !== "function") throw new TypeError("scheduleStopCheck is required");
    if (typeof options.cancelStopCheck !== "function") throw new TypeError("cancelStopCheck is required");
    const ranked = options.ranked || [];
    const pickCount = Math.max(1, Number(options.pickCount || 1) || 1);
    const reason = String(options.reason || "manual selection required");
    return new Promise((resolve, reject) => {
      let stopTimer = null;
      const overlay = options.dom.create("div");
      const finish = (callback, value) => {
        if (stopTimer !== null) options.cancelStopCheck(stopTimer);
        overlay.remove();
        callback(value);
      };
      overlay.id = "bronze-loop-pick-modal";
      applyStyles(overlay, {
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
      const dialog = options.dom.create("div");
      applyStyles(dialog, {
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
      const title = options.dom.create("div");
      title.textContent = `Manual Player Pick: ${reason}`;
      applyStyles(title, { fontWeight: "700", marginBottom: "8px" });
      const hint = options.dom.create("div");
      hint.textContent = `Select exactly ${pickCount} player(s), then confirm.`;
      applyStyles(hint, { color: "#b7c2d0", marginBottom: "12px" });
      const list = options.dom.create("div");
      applyStyles(list, { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px" });
      const selected = /* @__PURE__ */ new Set();
      const cards = [];
      const confirm = options.dom.create("button");
      confirm.textContent = "Confirm selection";
      confirm.disabled = true;
      applyStyles(confirm, { marginTop: "14px", minHeight: "34px", padding: "0 14px" });
      const refresh = () => {
        cards.forEach(({ card, candidate }) => {
          card.style.borderColor = selected.has(candidate) ? "#64d77a" : "#536171";
          card.style.background = selected.has(candidate) ? "#243c2b" : "#202731";
        });
        confirm.disabled = selected.size !== pickCount;
      };
      ranked.forEach((candidate) => {
        const card = options.dom.create("button");
        card.type = "button";
        card.textContent = options.describeCandidate(candidate);
        applyStyles(card, {
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
      options.dom.appendToBody(overlay);
      refresh();
      stopTimer = options.scheduleStopCheck(() => {
        if (!options.isStopping?.()) return;
        finish(reject, new Error("Stopped by user while a Player Pick selection was pending"));
      }, 250);
    });
  }

  // src/ui/card-recap.js
  var DESTINATION_LABELS = Object.freeze({
    club: "->CLUB",
    transfer: "->TRANSFER",
    storage: "->STORAGE",
    unknown: "->?"
  });
  function applyStyles2(element, styles) {
    Object.assign(element.style, styles);
  }
  function button(dom, text, title) {
    const element = dom.create("button");
    element.type = "button";
    element.textContent = text;
    if (title) element.title = title;
    applyStyles2(element, {
      minHeight: "30px",
      padding: "0 12px",
      background: "#2F6FDE",
      color: "#FFF",
      border: "none",
      borderRadius: "3px",
      cursor: "pointer",
      fontSize: "13px"
    });
    return element;
  }
  function setButtonEnabled(element, enabled) {
    element.disabled = !enabled;
    element.style.opacity = enabled ? "1" : "0.42";
    element.style.cursor = enabled ? "pointer" : "default";
  }
  function rowTags(row, formatPrice) {
    const tags = [row.tierLabel || row.theme?.label || null];
    if (row.special) tags.push("special");
    if (row.duplicate) tags.push("duplicate");
    if (typeof row.tradeable === "boolean") tags.push(row.tradeable ? "tradeable" : "untradeable");
    const price = formatPrice?.(row.price) || "";
    if (row.showPrice === true || price) tags.push(`price:${price || "?"}`);
    return tags.filter(Boolean).join(", ");
  }
  function renderCardRow(dom, row, formatPrice) {
    const theme = row.theme || {};
    const element = dom.create("div");
    applyStyles2(element, {
      minHeight: "38px",
      padding: "6px 8px",
      boxSizing: "border-box",
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "8px",
      color: theme.foreground || "#F4F6F8",
      background: theme.background || "#1D2229",
      borderLeft: `4px solid ${theme.accent || "#64748B"}`
    });
    const rating = dom.create("span");
    rating.textContent = String(Number(row.rating || 0));
    applyStyles2(rating, {
      minWidth: "30px",
      color: theme.rating || theme.accent || "#F4F6F8",
      fontWeight: "700",
      fontSize: "14px"
    });
    const identity = dom.create("span");
    applyStyles2(identity, {
      flex: "1 1 220px",
      minWidth: "0",
      display: "flex",
      gap: "6px",
      alignItems: "baseline",
      overflow: "hidden"
    });
    const name = dom.create("span");
    name.textContent = String(row.name || "Unknown player");
    applyStyles2(name, {
      fontWeight: "600",
      minWidth: "0",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    });
    identity.appendChild(name);
    if (row.sourceLabel) {
      const source = dom.create("span");
      source.textContent = row.sourceLabel;
      applyStyles2(source, { color: theme.muted || "#AAB4C2", fontSize: "11px", fontWeight: "600", flex: "0 0 auto" });
      identity.appendChild(source);
    }
    element.append(rating, identity);
    if (row.destination) {
      const destination = dom.create("span");
      destination.textContent = DESTINATION_LABELS[row.destination] || String(row.destination);
      applyStyles2(destination, { color: theme.accent || "#AAB4C2", fontSize: "11px", fontWeight: "600", flex: "0 0 auto" });
      element.appendChild(destination);
    }
    const tags = dom.create("span");
    tags.textContent = rowTags(row, formatPrice);
    applyStyles2(tags, {
      color: theme.muted || "#AAB4C2",
      fontSize: "11px",
      flex: "0 1 auto",
      maxWidth: "100%",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    });
    element.appendChild(tags);
    return element;
  }
  function showCardRecap(options = {}) {
    const dom = options.dom;
    const model = options.model;
    if (!dom?.create || !dom?.appendToBody) throw new TypeError("dom adapter is required");
    if (!model) return Promise.resolve(false);
    dom.query?.(`#${model.modalId}`)?.remove?.();
    return new Promise((resolve) => {
      let stopTimer = null;
      let currentPage = 1;
      let finished = false;
      const overlay = dom.create("div");
      overlay.id = model.modalId;
      applyStyles2(overlay, {
        position: "fixed",
        inset: "0",
        zIndex: "1000001",
        background: "rgba(0,0,0,.76)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        boxSizing: "border-box"
      });
      const dialog = dom.create("div");
      applyStyles2(dialog, {
        width: "min(720px, 100%)",
        maxHeight: "90vh",
        overflow: "auto",
        background: "#171B21",
        color: "#F4F6F8",
        border: "1px solid #65758A",
        padding: "14px",
        boxSizing: "border-box",
        fontFamily: "Arial, sans-serif"
      });
      const title = dom.create("div");
      title.textContent = model.title;
      applyStyles2(title, { fontSize: "16px", fontWeight: "700", marginBottom: "5px" });
      const summary = dom.create("div");
      summary.textContent = model.summary;
      applyStyles2(summary, { color: "#9AA6B8", marginBottom: "9px", fontSize: "12px" });
      const reason = model.reason ? dom.create("div") : null;
      if (reason) {
        reason.textContent = `${model.status}: ${model.reason}`;
        applyStyles2(reason, {
          color: model.status === "preserved" ? "#FFD27A" : "#E3A7A7",
          marginBottom: "10px",
          fontSize: "12px",
          padding: "7px 8px",
          background: "#241F1A",
          borderLeft: "3px solid #C48A3A",
          overflowWrap: "anywhere"
        });
      }
      const list = dom.create("div");
      applyStyles2(list, { display: "flex", flexDirection: "column", gap: "6px" });
      const footer = dom.create("div");
      applyStyles2(footer, {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "8px",
        marginTop: "12px"
      });
      const previous = button(dom, "Previous", "Previous recap page");
      const pageLabel = dom.create("span");
      applyStyles2(pageLabel, { color: "#AAB4C2", fontSize: "12px", flex: "1 1 auto", textAlign: "center" });
      const next = button(dom, "Next", "Next recap page");
      const close = button(dom, "Close");
      const renderPage = () => {
        const page = getRecapPage(model, currentPage);
        currentPage = page.page;
        list.textContent = "";
        if (!page.rows.length) {
          const empty = dom.create("div");
          empty.textContent = "No player rows to display.";
          applyStyles2(empty, { padding: "10px", color: "#9AA6B8", background: "#1D2229" });
          list.appendChild(empty);
        } else {
          page.rows.forEach((row) => list.appendChild(renderCardRow(dom, row, options.formatPrice)));
        }
        pageLabel.textContent = page.totalRows ? `Page ${page.page}/${page.pageCount} | ${page.start}-${page.end} of ${page.totalRows}` : "Page 1/1 | 0 cards";
        setButtonEnabled(previous, page.hasPrevious);
        setButtonEnabled(next, page.hasNext);
        previous.style.display = page.pageCount > 1 ? "" : "none";
        next.style.display = page.pageCount > 1 ? "" : "none";
      };
      const finish = () => {
        if (finished) return;
        finished = true;
        if (stopTimer !== null) options.cancelStopCheck?.(stopTimer);
        overlay.remove?.();
        options.onClose?.();
        resolve(true);
      };
      previous.addEventListener("click", () => {
        if (currentPage > 1) {
          currentPage--;
          renderPage();
        }
      });
      next.addEventListener("click", () => {
        if (currentPage < model.pageCount) {
          currentPage++;
          renderPage();
        }
      });
      close.addEventListener("click", finish);
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) finish();
      });
      footer.append(previous, pageLabel, next, close);
      dialog.append(title, summary);
      if (reason) dialog.appendChild(reason);
      dialog.append(list, footer);
      overlay.appendChild(dialog);
      dom.appendToBody(overlay);
      renderPage();
      if (model.specialCount > 0) options.celebrate?.(dialog, model.specialCount);
      if (typeof options.scheduleStopCheck === "function") {
        stopTimer = options.scheduleStopCheck(() => {
          if (options.isStopping?.()) finish();
        }, 250);
      }
    });
  }

  // src/ui/player-pick-recap.js
  function showPlayerPickRecap(options = {}) {
    const model = options.model || createPlayerPickRecapModel(options.pickResults, {
      name: options.name,
      status: options.status,
      reason: options.reason,
      itemDisplayName: options.itemDisplayName,
      resolveNativeTheme: options.resolveNativeTheme
    });
    return showCardRecap({ ...options, model });
  }

  // src/ui/reward-celebration.js
  function triggerRewardFireworks(container, intensityValue, runtime = {}) {
    if (!container || !runtime.dom?.create || typeof runtime.requestFrame !== "function") return;
    if (runtime.getComputedStyle?.(container)?.position === "static") container.style.position = "relative";
    container.style.isolation = "isolate";
    const canvas = runtime.dom.create("canvas");
    canvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:35%;pointer-events:none;z-index:-1;overflow:hidden;";
    container.insertBefore(canvas, container.firstChild);
    const width = Math.max(220, canvas.clientWidth);
    const height = Math.max(120, canvas.clientHeight);
    const dpr = Math.min(2, Number(runtime.devicePixelRatio?.() || 1));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const context = canvas.getContext?.("2d");
    if (!context) {
      canvas.remove();
      return;
    }
    context.scale(dpr, dpr);
    const palette = ["#ffd54a", "#ff5c5c", "#5c8aff", "#5cffa0", "#7a5cff", "#ff9d4a", "#ff5cb1", "#5ce0ff"];
    const random = runtime.random || Math.random;
    const intensity = Math.max(1, Math.min(6, Number(intensityValue) || 1));
    const particlesPerBurst = 70 + intensity * 14;
    const particles = [];
    const burstSchedule = [80, 700, 1400];
    const columns = [0.22, 0.5, 0.78];
    const startMs = runtime.now?.() || 0;
    let lastBurstIndex = -1;
    function spawnBurst(x, y) {
      particles.push({ x, y, life: 1, decay: 0.05, color: "#fff", size: 14 + random() * 6, isFlash: true });
      for (let index = 0; index < particlesPerBurst; index++) {
        const angle = index / particlesPerBurst * Math.PI * 2 + (random() - 0.5) * 0.5;
        const speed = 1.5 + random() * 3.5;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.8,
          color: palette[Math.floor(random() * palette.length)],
          life: 1,
          decay: 6e-3 + random() * 0.012,
          size: 0.9 + random() * 1.4
        });
      }
    }
    function tick(now) {
      const elapsed = now - startMs;
      if (elapsed > 3e3 || !canvas.isConnected) {
        canvas.remove();
        return;
      }
      for (let burst = lastBurstIndex + 1; burst < burstSchedule.length; burst++) {
        if (elapsed < burstSchedule[burst]) break;
        spawnBurst(width * columns[burst] + (random() - 0.5) * 30, height * (0.18 + random() * 0.12));
        lastBurstIndex = burst;
      }
      context.fillStyle = "rgba(0, 0, 0, 0.18)";
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";
      for (let index = particles.length - 1; index >= 0; index--) {
        const particle = particles[index];
        particle.vy = Number(particle.vy || 0) + 0.06;
        particle.vx = Number(particle.vx || 0) * 0.985;
        particle.vy *= 0.985;
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.life -= particle.decay;
        if (particle.life <= 0 || particle.y > height + 30 || particle.x < -30 || particle.x > width + 30) {
          particles.splice(index, 1);
          continue;
        }
        context.shadowColor = particle.color;
        context.shadowBlur = particle.isFlash ? 18 : 9;
        context.fillStyle = particle.color;
        context.globalAlpha = Math.max(0, Math.min(1, particle.life));
        context.beginPath();
        context.arc(particle.x, particle.y, particle.isFlash ? particle.size * (1 + (1 - particle.life) * 0.6) : particle.size, 0, Math.PI * 2);
        context.fill();
      }
      context.shadowBlur = 0;
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
      runtime.requestFrame(tick);
    }
    runtime.requestFrame(tick);
  }

  // src/ui/sbc-reward-overlay.js
  var CLAIM_REWARD_PATTERNS = Object.freeze([
    "Claim Rewards",
    "Claim Reward",
    "Collect Rewards",
    "Collect Reward",
    "\u9886\u53D6\u5956\u52B1",
    "\u9818\u53D6\u734E\u52F5",
    "\u9886\u53D6",
    "\u9818\u53D6"
  ]);
  var REWARD_CONTEXT_SELECTOR = [
    ".view-modal-container",
    ".ut-modal",
    ".modal",
    '[class*="modal"]',
    '[class*="Modal"]'
  ].join(",");
  var REWARD_CONTROLLER_MARKER_SELECTOR = '.rewards-footer, .reward, [class*="game-rewards"], [class*="GameRewards"]';
  var REWARD_MARKER_SELECTOR = '.rewards-footer, [class*="game-rewards"], [class*="GameRewards"]';
  var REWARD_ROOT_SELECTOR = '.view-modal-container, .ea-dialog-view, [class*="modal"], [class*="Modal"]';
  var REWARD_ACTION_SELECTOR = "footer button.call-to-action:not(.disabled), button.call-to-action:not(.disabled), footer button:not(.disabled)";
  var SUBMIT_ERROR_SELECTOR = [
    ".view-modal-container",
    ".ut-modal-view",
    ".ea-dialog",
    ".modal-content",
    ".ut-dialog"
  ].join(",");
  function createSbcRewardOverlay({
    dom,
    pageRuntime,
    findButtonByText,
    findClickableByText,
    isClickableElement,
    compactText,
    matchesAny,
    click,
    sleep,
    log
  }) {
    function findClaimButton() {
      return findButtonByText(CLAIM_REWARD_PATTERNS) || findClickableByText(CLAIM_REWARD_PATTERNS);
    }
    function findSubmitError() {
      for (const modal of dom.queryAll(SUBMIT_ERROR_SELECTOR)) {
        const text = String(modal?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 220);
        if (!text) continue;
        if (/Ineligible Squad/i.test(text) || /Concept or Loan Players/i.test(text) || /cannot be submitted in Squad Building Challenges/i.test(text) || /Squads containing .*Loan/i.test(text)) {
          return { modal, text };
        }
      }
      return null;
    }
    function dismissSubmitError(error) {
      const modal = error?.modal;
      if (!modal) return false;
      const buttons = Array.from(modal.querySelectorAll?.("button") || []);
      const button3 = buttons.find((candidate) => /^(ok|okay|确定|確定)$/i.test(String(candidate?.textContent || "").trim())) || buttons.find((candidate) => !candidate?.disabled);
      if (!button3) return false;
      click(button3);
      return true;
    }
    function findClaimContext() {
      const contexts = dom.queryAll(REWARD_CONTEXT_SELECTOR).filter(isClickableElement).map((element) => ({ element, text: compactText(element) })).filter(({ text }) => text && text.length < 2e3);
      return contexts.find(
        ({ text }) => matchesAny(text, ["Claim Rewards", "Claim Reward", "Collect Rewards", "Collect Reward", "\u9886\u53D6\u5956\u52B1", "\u9818\u53D6\u734E\u52F5"]) || matchesAny(text, ["Reward", "Rewards", "\u5956\u52B1", "\u734E\u52F5"]) && matchesAny(text, ["Pack", "Player", "Claim", "Collect", "\u5305", "\u7403\u5458", "\u7403\u54E1", "\u9886\u53D6", "\u9818\u53D6"])
      ) || null;
    }
    function isRewardsController(controller) {
      if (!controller) return false;
      if (/UTGameRewardsViewController/i.test(pageRuntime.controllerName(controller))) return true;
      const root = pageRuntime.controllerRoot(controller);
      return !!root?.querySelector?.(REWARD_CONTROLLER_MARKER_SELECTOR);
    }
    function activeController() {
      return pageRuntime.popupControllerCandidates().find(isRewardsController) || null;
    }
    function findDomRoot() {
      const marker = dom.queryAll(REWARD_MARKER_SELECTOR).find(isClickableElement);
      if (!marker) return null;
      return marker.closest?.(REWARD_ROOT_SELECTOR) || marker.parentElement;
    }
    function isVisible() {
      return !!activeController() || !!findDomRoot() || !!findClaimContext();
    }
    async function dismiss(label) {
      const controller = activeController();
      if (controller && typeof controller.onBackButton === "function") {
        log(`${label}: closing ${pageRuntime.controllerName(controller) || "SBC reward"} overlay`);
        controller.onBackButton();
        await sleep(700);
        return true;
      }
      const root = findDomRoot();
      const action2 = root?.querySelector?.(REWARD_ACTION_SELECTOR);
      if (!action2) return false;
      const actionText = compactText(action2);
      log(`${label}: advancing SBC reward overlay${actionText ? ` (${actionText})` : ""}`);
      click(action2);
      await sleep(700);
      return true;
    }
    return Object.freeze({
      activeController,
      dismiss,
      dismissSubmitError,
      findClaimButton,
      findClaimContext,
      findDomRoot,
      findSubmitError,
      isRewardsController,
      isVisible
    });
  }

  // src/ui/reward-highlight.js
  function applyStyles3(element, styles) {
    Object.assign(element.style, styles);
  }
  function positionStack(stack, panel, viewport = {}) {
    const rect = panel?.getBoundingClientRect?.();
    const viewportWidth = Math.max(0, Number(viewport.width || 0));
    const viewportHeight = Math.max(0, Number(viewport.height || 0));
    const width = Math.max(220, Math.min(420, viewportWidth > 0 ? viewportWidth - 20 : 360));
    stack.style.width = `${width}px`;
    if (!rect) {
      stack.style.right = "10px";
      stack.style.bottom = "198px";
      stack.style.top = "auto";
      return;
    }
    stack.style.right = `${Math.max(10, viewportWidth - Number(rect.right || 0))}px`;
    if (Number(rect.top || 0) >= 180) {
      stack.style.top = "auto";
      stack.style.bottom = `${Math.max(10, viewportHeight - Number(rect.top || 0) + 10)}px`;
    } else {
      stack.style.top = `${Math.max(10, Number(rect.bottom || 0) + 10)}px`;
      stack.style.bottom = "auto";
    }
  }
  function showPackHighlightToast(options = {}) {
    const dom = options.dom;
    const model = options.model;
    if (!dom?.create || !dom?.appendToBody || !model?.cards?.length) return false;
    let stack = dom.query?.("#bronze-loop-reward-highlight-stack");
    if (!stack) {
      stack = dom.create("div");
      stack.id = "bronze-loop-reward-highlight-stack";
      applyStyles3(stack, {
        position: "fixed",
        zIndex: "1000000",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        pointerEvents: "none",
        fontFamily: "Arial, sans-serif",
        boxSizing: "border-box"
      });
      dom.appendToBody(stack);
    }
    positionStack(stack, options.panel, options.viewport?.() || {});
    const toast = dom.create("div");
    applyStyles3(toast, {
      position: "relative",
      overflow: "hidden",
      isolation: "isolate",
      pointerEvents: "auto",
      background: "rgba(20, 24, 30, 0.97)",
      color: "#f4f6f8",
      border: "1px solid #d4af37",
      borderLeft: "4px solid #ffd54a",
      boxShadow: "0 8px 24px rgba(0,0,0,.42)",
      padding: "10px 34px 10px 12px",
      boxSizing: "border-box",
      opacity: "1",
      transition: "opacity .25s ease, transform .25s ease"
    });
    const title = dom.create("div");
    title.textContent = `${model.maxRating} Special Highlight`;
    applyStyles3(title, { color: "#ffd54a", fontSize: "14px", fontWeight: "700", marginBottom: "3px" });
    const pack = dom.create("div");
    pack.textContent = model.pack?.name || model.purpose || "Opened pack";
    applyStyles3(pack, { color: "#9fb2c9", fontSize: "11px", marginBottom: "6px" });
    const list = dom.create("div");
    applyStyles3(list, { display: "flex", flexDirection: "column", gap: "3px" });
    for (const card of model.cards.slice(0, 5)) {
      const row = dom.create("div");
      row.textContent = `${card.name} - ${card.rating}${card.duplicate ? " | duplicate" : ""}${card.tradeable ? " | tradeable" : ""}`;
      applyStyles3(row, { fontSize: "12px", lineHeight: "16px", overflowWrap: "anywhere" });
      list.appendChild(row);
    }
    if (model.cards.length > 5) {
      const more = dom.create("div");
      more.textContent = `+${model.cards.length - 5} more`;
      applyStyles3(more, { color: "#9fb2c9", fontSize: "11px" });
      list.appendChild(more);
    }
    const close = dom.create("button");
    close.type = "button";
    close.textContent = "x";
    close.title = "Dismiss highlight";
    applyStyles3(close, {
      position: "absolute",
      top: "4px",
      right: "5px",
      width: "24px",
      height: "24px",
      padding: "0",
      border: "0",
      background: "transparent",
      color: "#d7e2f0",
      cursor: "pointer",
      fontSize: "18px"
    });
    let timer = null;
    const finish = () => {
      if (timer !== null) options.cancel?.(timer);
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
      (options.schedule || setTimeout)(() => {
        toast.remove?.();
        if (!stack.children?.length) stack.remove?.();
      }, 260);
    };
    close.addEventListener("click", finish);
    toast.append(title, pack, list, close);
    stack.appendChild(toast);
    while (stack.children?.length > 3) stack.firstChild?.remove?.();
    options.celebrate?.(toast, model.cards.length);
    timer = (options.schedule || setTimeout)(finish, Math.max(3e3, Number(options.durationMs || 7e3) || 7e3));
    return true;
  }

  // src/ui/reward-alert-settings.js
  function applyStyles4(element, styles) {
    Object.assign(element.style, styles);
  }
  function inputStyles(input) {
    applyStyles4(input, {
      width: "100%",
      minWidth: "0",
      height: "30px",
      boxSizing: "border-box",
      background: "#222832",
      color: "#f4f6f8",
      border: "1px solid #607089",
      padding: "0 8px"
    });
    return input;
  }
  function field(dom, labelText, input) {
    const label = dom.create("label");
    applyStyles4(label, { display: "grid", gridTemplateColumns: "140px minmax(0, 1fr)", alignItems: "center", gap: "10px" });
    const text = dom.create("span");
    text.textContent = labelText;
    applyStyles4(text, { color: "#b8c3d2", fontSize: "12px" });
    label.append(text, input);
    return label;
  }
  function checkbox(dom, id, labelText, checked) {
    const label = dom.create("label");
    applyStyles4(label, { display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" });
    const input = dom.create("input");
    input.id = id;
    input.type = "checkbox";
    input.checked = checked === true;
    input.style.accentColor = "#78a6ff";
    const text = dom.create("span");
    text.textContent = labelText;
    label.append(input, text);
    return { label, input };
  }
  function validNtfyTopic(value) {
    return /^[-_A-Za-z0-9]{1,64}$/.test(String(value || "").trim());
  }
  function showRewardAlertSettings(options = {}) {
    const dom = options.dom;
    if (!dom?.create || !dom?.appendToBody) throw new TypeError("dom adapter is required");
    dom.query?.("#bronze-loop-reward-alert-modal")?.remove?.();
    const initial = normalizeRewardAlertSettings(options.settings);
    const overlay = dom.create("div");
    overlay.id = "bronze-loop-reward-alert-modal";
    applyStyles4(overlay, {
      position: "fixed",
      inset: "0",
      zIndex: "1000001",
      background: "rgba(0,0,0,.72)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      boxSizing: "border-box"
    });
    const dialog = dom.create("div");
    applyStyles4(dialog, {
      width: "min(520px, 100%)",
      maxHeight: "90vh",
      overflow: "auto",
      background: "#171b21",
      color: "#f4f6f8",
      border: "1px solid #65758a",
      padding: "14px",
      boxSizing: "border-box",
      fontFamily: "Arial, sans-serif"
    });
    const title = dom.create("div");
    title.textContent = "Reward Alerts";
    applyStyles4(title, { fontSize: "16px", fontWeight: "700", marginBottom: "12px" });
    const form = dom.create("div");
    applyStyles4(form, { display: "flex", flexDirection: "column", gap: "10px" });
    const enabled = checkbox(dom, "bronze-loop-alert-enabled-modal", "Enable reward alerts", initial.enabled);
    const highlight = checkbox(dom, "bronze-loop-alert-highlight-enabled", "Show pack highlight", initial.highlightEnabled);
    const desktop = checkbox(dom, "bronze-loop-alert-desktop-enabled", "Desktop notification", initial.desktopEnabled);
    const ntfy = checkbox(dom, "bronze-loop-alert-ntfy-enabled", "ntfy remote notification", initial.ntfyEnabled);
    const threshold = inputStyles(dom.create("input"));
    threshold.id = "bronze-loop-alert-minimum-rating";
    threshold.type = "number";
    threshold.min = "1";
    threshold.max = "99";
    threshold.value = String(initial.minimumRating);
    const server = inputStyles(dom.create("input"));
    server.id = "bronze-loop-alert-ntfy-server";
    server.type = "url";
    server.value = initial.ntfyServer;
    server.readOnly = true;
    const topic = inputStyles(dom.create("input"));
    topic.id = "bronze-loop-alert-ntfy-topic";
    topic.type = "text";
    topic.value = initial.ntfyTopic;
    topic.autocomplete = "off";
    const token = inputStyles(dom.create("input"));
    token.id = "bronze-loop-alert-ntfy-token";
    token.type = "password";
    token.value = initial.ntfyToken;
    token.autocomplete = "off";
    form.append(
      enabled.label,
      highlight.label,
      field(dom, "Minimum rating", threshold),
      desktop.label,
      ntfy.label,
      field(dom, "ntfy server", server),
      field(dom, "ntfy topic", topic),
      field(dom, "ntfy token", token)
    );
    const status = dom.create("div");
    applyStyles4(status, { minHeight: "16px", marginTop: "10px", color: "#9fb2c9", fontSize: "11px" });
    const tests = dom.create("div");
    applyStyles4(tests, { display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" });
    const actions = dom.create("div");
    applyStyles4(actions, { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "14px" });
    const button3 = (id, text, primary = false) => {
      const value = dom.create("button");
      value.id = id;
      value.type = "button";
      value.textContent = text;
      applyStyles4(value, {
        minHeight: "30px",
        padding: "0 12px",
        cursor: "pointer",
        color: "#fff",
        background: primary ? "#2f6fde" : "#222832",
        border: `1px solid ${primary ? "#4f8cff" : "#607089"}`
      });
      return value;
    };
    const preview = button3("bronze-loop-alert-preview", "Preview highlight");
    const desktopTest = button3("bronze-loop-alert-test-desktop", "Send desktop test");
    const ntfyTest = button3("bronze-loop-alert-test-ntfy", "Send ntfy test");
    const cancel = button3("bronze-loop-alert-cancel", "Cancel");
    const save = button3("bronze-loop-alert-save", "Save", true);
    tests.append(preview, desktopTest, ntfyTest);
    actions.append(cancel, save);
    const updateNtfyTestState = () => {
      const valid = validNtfyTopic(topic.value);
      ntfyTest.disabled = !valid;
      ntfyTest.title = valid ? "Send a test notification through ntfy" : "Enter a valid ntfy topic first";
    };
    topic.addEventListener("input", updateNtfyTestState);
    updateNtfyTestState();
    const draft = () => normalizeRewardAlertSettings({
      enabled: enabled.input.checked,
      highlightEnabled: highlight.input.checked,
      minimumRating: threshold.value,
      desktopEnabled: desktop.input.checked,
      ntfyEnabled: ntfy.input.checked,
      ntfyServer: server.value,
      ntfyTopic: topic.value,
      ntfyToken: token.value
    });
    const runTest = async (callback, pendingText, successText) => {
      status.textContent = pendingText;
      try {
        await callback(draft());
        status.textContent = successText;
      } catch (error) {
        status.textContent = `Failed: ${error?.message || error}`;
      }
    };
    preview.addEventListener("click", () => runTest(options.onPreview || (() => true), "Showing preview...", "Preview shown"));
    desktopTest.addEventListener("click", () => runTest(options.onTestDesktop || (() => true), "Sending desktop test...", "Desktop test sent"));
    ntfyTest.addEventListener("click", () => runTest(options.onTestNtfy || (() => true), "Sending ntfy test...", "ntfy test sent"));
    const close = () => overlay.remove?.();
    cancel.addEventListener("click", close);
    save.addEventListener("click", async () => {
      try {
        const settings = draft();
        if (settings.ntfyEnabled && !validNtfyTopic(settings.ntfyTopic)) {
          throw new Error("A valid ntfy topic is required when ntfy is enabled");
        }
        await options.onSave?.(settings);
        close();
      } catch (error) {
        status.textContent = `Save failed: ${error?.message || error}`;
      }
    });
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    dialog.append(title, form, tests, status, actions);
    overlay.appendChild(dialog);
    dom.appendToBody(overlay);
    return overlay;
  }

  // src/ui/batch-open-dialog.js
  function applyStyles5(element, styles) {
    Object.assign(element.style, styles);
  }
  function button2(dom, text, primary = false) {
    const value = dom.create("button");
    value.type = "button";
    value.textContent = text;
    applyStyles5(value, {
      minHeight: "30px",
      padding: "0 12px",
      cursor: "pointer",
      color: "#fff",
      background: primary ? "#2f6fde" : "#222832",
      border: `1px solid ${primary ? "#4f8cff" : "#607089"}`
    });
    return value;
  }
  function quantityInput(dom, quantity) {
    const input = dom.create("input");
    input.type = "number";
    input.min = "1";
    input.max = "999";
    input.value = String(quantity);
    applyStyles5(input, {
      width: "70px",
      height: "30px",
      boxSizing: "border-box",
      background: "#222832",
      color: "#fff",
      border: "1px solid #607089",
      padding: "0 6px"
    });
    return input;
  }
  function showBatchOpenDialog(options = {}) {
    const dom = options.dom;
    if (!dom?.create || !dom?.appendToBody) throw new TypeError("dom adapter is required");
    dom.query?.("#bronze-loop-batch-open-modal")?.remove?.();
    const overlay = dom.create("div");
    overlay.id = "bronze-loop-batch-open-modal";
    applyStyles5(overlay, {
      position: "fixed",
      inset: "0",
      zIndex: "1000001",
      background: "rgba(0,0,0,.72)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      boxSizing: "border-box"
    });
    const dialog = dom.create("div");
    applyStyles5(dialog, {
      width: "min(700px, 100%)",
      maxHeight: "90vh",
      overflow: "auto",
      background: "#171b21",
      color: "#f4f6f8",
      border: "1px solid #65758a",
      padding: "14px",
      boxSizing: "border-box",
      fontFamily: "Arial, sans-serif"
    });
    const title = dom.create("div");
    title.textContent = "Batch Open Packs";
    applyStyles5(title, { fontSize: "16px", fontWeight: "700" });
    const note = dom.create("div");
    note.textContent = "Choose pack types and quantities. The saved list is reused next time; unavailable remembered types are skipped.";
    applyStyles5(note, { color: "#9aa6b8", fontSize: "11px", margin: "6px 0 10px" });
    const status = dom.create("div");
    applyStyles5(status, { minHeight: "16px", color: "#9fb2c9", fontSize: "11px", marginTop: "8px" });
    const availableTitle = dom.create("div");
    availableTitle.textContent = "My Packs";
    applyStyles5(availableTitle, { color: "#b8c3d2", fontSize: "12px", fontWeight: "700", marginBottom: "6px" });
    const availableList = dom.create("div");
    applyStyles5(availableList, { display: "flex", flexDirection: "column", gap: "5px", marginBottom: "12px" });
    const planTitle = dom.create("div");
    planTitle.textContent = "Batch list";
    applyStyles5(planTitle, { color: "#b8c3d2", fontSize: "12px", fontWeight: "700", marginBottom: "6px" });
    const planList = dom.create("div");
    applyStyles5(planList, { display: "flex", flexDirection: "column", gap: "5px" });
    let snapshot = options.snapshot || { total: 0, groups: [] };
    let plan = normalizeBatchOpenPlan(options.plan);
    const notifyPlanChange = () => options.onPlanChange?.(plan);
    const currentPlan = () => normalizeBatchOpenPlan({
      entries: Array.from(planList.children || []).map((row) => ({
        packId: row.dataset?.packId || null,
        packName: row.dataset?.packName || "",
        quantity: row.querySelector?.("input")?.value || 1,
        quantityMode: row.dataset?.quantityMode || "fixed"
      }))
    });
    const render = () => {
      availableList.textContent = "";
      const selectedKeys = new Set(plan.entries.map(batchOpenEntryKey));
      for (const group of snapshot.groups || []) {
        const row = dom.create("div");
        applyStyles5(row, { position: "relative", display: "flex", alignItems: "center", gap: "8px", padding: "5px 7px", background: "#1d2229" });
        const label = dom.create("span");
        label.textContent = `${group.name} (#${group.id || "?"}) x${group.count}`;
        applyStyles5(label, { flex: "1 1 auto", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
        const selected = selectedKeys.has(batchOpenEntryKey({ packId: group.id, packName: group.name }));
        const addMenu = dom.create("div");
        applyStyles5(addMenu, { position: "relative", flex: "0 0 auto" });
        const add = button2(dom, selected ? "Added v" : "Add v");
        add.setAttribute?.("aria-label", `Add ${group.name} to batch`);
        add.setAttribute?.("aria-expanded", "false");
        const menu = dom.create("div");
        applyStyles5(menu, {
          display: "none",
          position: "absolute",
          right: "0",
          top: "34px",
          zIndex: "4",
          minWidth: "130px",
          padding: "4px",
          background: "#171b21",
          border: "1px solid #607089",
          boxShadow: "0 6px 18px rgba(0,0,0,.35)"
        });
        const setQuantity = (quantity, quantityMode = "fixed") => {
          plan = currentPlan();
          const key = batchOpenEntryKey({ packId: group.id, packName: group.name });
          const exists = plan.entries.some((entry) => batchOpenEntryKey(entry) === key);
          const entries = exists ? plan.entries.map((entry) => batchOpenEntryKey(entry) === key ? { packId: group.id, packName: group.name, quantity, quantityMode } : entry) : [...plan.entries, { packId: group.id, packName: group.name, quantity, quantityMode }];
          plan = normalizeBatchOpenPlan({ entries });
          notifyPlanChange();
          render();
        };
        const addOne = button2(dom, selected ? "Set to 1" : "Add 1");
        const addAll = button2(dom, `${selected ? "Set to all" : "Add all"} (${group.count})`);
        for (const option of [addOne, addAll]) {
          applyStyles5(option, { display: "block", width: "100%", minWidth: "0", textAlign: "left", border: "0" });
        }
        addOne.addEventListener("click", () => setQuantity(1, "fixed"));
        addAll.addEventListener("click", () => setQuantity(Math.max(1, Number(group.count) || 1), "all"));
        add.addEventListener("click", () => {
          const open = menu.style.display === "none";
          menu.style.display = open ? "block" : "none";
          add.setAttribute?.("aria-expanded", open ? "true" : "false");
        });
        menu.append(addOne, addAll);
        addMenu.append(add, menu);
        row.append(label, addMenu);
        availableList.appendChild(row);
      }
      if (!(snapshot.groups || []).length) {
        const empty = dom.create("div");
        empty.textContent = "No packs found. Use Scan My Packs to refresh.";
        applyStyles5(empty, { color: "#9aa6b8", padding: "8px" });
        availableList.appendChild(empty);
      }
      planList.textContent = "";
      const rows = createBatchOpenAvailability(plan, snapshot);
      for (const entry of rows) {
        const row = dom.create("div");
        row.dataset.packId = entry.packId ? String(entry.packId) : "";
        row.dataset.packName = entry.packName;
        row.dataset.quantityMode = entry.quantityMode;
        applyStyles5(row, { display: "flex", alignItems: "center", gap: "8px", padding: "5px 7px", background: "#1d2229" });
        const label = dom.create("span");
        label.textContent = `${entry.packName || `Pack #${entry.packId}`} (#${entry.packId || "?"})`;
        applyStyles5(label, { flex: "1 1 auto", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
        const availability = dom.create("span");
        availability.textContent = entry.available ? `${entry.quantityMode === "all" ? "all: " : ""}${entry.available} available` : "unavailable";
        applyStyles5(availability, { color: entry.available ? "#8fd19e" : "#e3a7a7", fontSize: "11px", flex: "0 0 auto" });
        const quantity = quantityInput(dom, entry.effectiveQuantity);
        quantity.setAttribute?.("aria-label", `Quantity for ${entry.packName}`);
        quantity.disabled = entry.quantityMode === "all";
        quantity.title = entry.quantityMode === "all" ? `All available packs (${entry.available || "currently unavailable"})` : "Fixed quantity";
        quantity.addEventListener("change", () => {
          row.dataset.quantityMode = "fixed";
          plan = currentPlan();
          notifyPlanChange();
        });
        const remove = button2(dom, "Remove");
        remove.addEventListener("click", () => {
          const key = batchOpenEntryKey(entry);
          plan = normalizeBatchOpenPlan({ entries: currentPlan().entries.filter((candidate) => batchOpenEntryKey(candidate) !== key) });
          notifyPlanChange();
          render();
        });
        row.append(label, availability, quantity, remove);
        planList.appendChild(row);
      }
      if (!rows.length) {
        const empty = dom.create("div");
        empty.textContent = "No pack types in the batch list.";
        applyStyles5(empty, { color: "#9aa6b8", padding: "8px" });
        planList.appendChild(empty);
      }
    };
    const toolbar = dom.create("div");
    applyStyles5(toolbar, { display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" });
    const scan = button2(dom, "Scan My Packs");
    const preview = button2(dom, "Preview recap");
    toolbar.append(scan, preview);
    const actions = dom.create("div");
    applyStyles5(actions, { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "14px" });
    const cancel = button2(dom, "Cancel");
    const start = button2(dom, "Start batch", true);
    actions.append(cancel, start);
    const setPending = (pending) => {
      scan.disabled = pending;
      preview.disabled = pending;
      start.disabled = pending;
    };
    scan.addEventListener("click", async () => {
      setPending(true);
      status.textContent = "Scanning My Packs...";
      try {
        plan = currentPlan();
        snapshot = await options.onScan?.() || snapshot;
        status.textContent = `${Number(snapshot.total || 0)} pack(s) found`;
        render();
      } catch (error) {
        status.textContent = `Scan failed: ${error?.message || error}`;
      } finally {
        setPending(false);
      }
    });
    preview.addEventListener("click", () => options.onPreview?.());
    const close = () => overlay.remove?.();
    cancel.addEventListener("click", close);
    start.addEventListener("click", async () => {
      const selected = currentPlan();
      if (!selected.entries.length) {
        status.textContent = "Add at least one pack type first";
        return;
      }
      setPending(true);
      status.textContent = "Starting batch...";
      try {
        await options.onStart?.(selected);
        close();
      } catch (error) {
        status.textContent = `Start failed: ${error?.message || error}`;
        setPending(false);
      }
    });
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    dialog.append(title, note, toolbar, availableTitle, availableList, planTitle, planList, status, actions);
    overlay.appendChild(dialog);
    dom.appendToBody(overlay);
    render();
    return overlay;
  }

  // src/ui/batch-open-recap.js
  function showBatchOpenRecap(options = {}) {
    return showCardRecap(options);
  }

  // src/userscript-entry.js
  (function() {
    "use strict";
    const W = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    try {
      W[APP_KEY]?.destroy?.();
    } catch {
    }
    const adapters = createRuntimeAdapters(W, document, {
      gmRequest: typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : null,
      gmNotification: typeof GM_notification === "function" ? GM_notification : null,
      gmGetValue: typeof GM_getValue === "function" ? GM_getValue : null,
      gmSetValue: typeof GM_setValue === "function" ? GM_setValue : null,
      gmDeleteValue: typeof GM_deleteValue === "function" ? GM_deleteValue : null,
      fetchImpl: typeof fetch === "function" ? fetch.bind(globalThis) : null
    });
    const eaPackAdapter = () => adapters.pack();
    const eaInventoryAdapter = () => adapters.inventory({ capacityFallbacks: { storage: CFG.storageMax } });
    const inventoryPile = (pileName) => eaInventoryAdapter().pileValue(pileName);
    const eaPlayerPickAdapter = () => adapters.playerPick();
    const eaRarityAdapter = adapters.rarity;
    const eaSbcAdapter = () => adapters.sbc();
    const fsuAdapter = () => adapters.fsu();
    const localizationAdapter = adapters.localization;
    const pageRuntime = adapters.page;
    const state = {
      running: false,
      stopping: false,
      refreshing: false,
      scanningPicks: false,
      loadingLoops: false,
      loopDefs: null,
      discoveredLoopDefs: [],
      discoveredLoopOverrides: {},
      recoveryRecipes: null,
      unassignedRecoveryPolicies: null,
      defaultUnassignedRecoveryPolicyIds: null,
      loopConfigSource: "built-in",
      stalePackTracker: createStalePackTracker(),
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
      lastBatchRecap: null,
      lastRecapType: null,
      showMvpLoops: false,
      loopStack: [],
      logRenderer: null,
      rewardAlertSettings: normalizeRewardAlertSettings()
    };
    function destroyRunner() {
      state.stopping = true;
      if (state.bootTimer) clearInterval(state.bootTimer);
      state.logRenderer?.destroy?.();
      document.querySelector("#bronze-loop-panel")?.remove();
      document.querySelector("#bronze-loop-pick-modal")?.remove();
      document.querySelector("#bronze-loop-recap-modal")?.remove();
      document.querySelector("#bronze-loop-reward-alert-modal")?.remove();
      document.querySelector("#bronze-loop-batch-open-modal")?.remove();
      document.querySelector("#bronze-loop-batch-recap-modal")?.remove();
      document.querySelector("#bronze-loop-reward-highlight-stack")?.remove();
      document.querySelector("#bronze-loop-style")?.remove();
    }
    W[APP_KEY] = {
      version: "0.5.53",
      destroy: destroyRunner,
      getFsuSettings: () => getFsuSettings({ force: true }),
      getPackInventory: () => getPackInventorySnapshot(),
      setFsuSettingsOverride,
      clearFsuSettingsOverride,
      calculateSquadRating: calculateEaSquadRating,
      solveRatingSbcCandidates: findOptimalRatingSbcSelection,
      scanPlayerPicks: () => scanAvailablePlayerPickSbcs(),
      previewPackHighlight: (input = {}) => previewPackHighlight(input),
      previewBatchOpenRecap: () => previewBatchOpenRecap()
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
    const waitAdapter = adapters.wait({ sleep, stopPoint, log });
    const sbcRewardOverlay = createSbcRewardOverlay({
      dom: adapters.dom,
      pageRuntime,
      findButtonByText,
      findClickableByText,
      isClickableElement,
      compactText,
      matchesAny,
      click: simulateClick,
      sleep,
      log
    });
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
      const configured = state.loopDefs?.length ? state.loopDefs : LOOP_DEFS;
      const effectiveConfigured = configured.map((loopDef) => state.discoveredLoopOverrides?.[loopDef.id] || loopDef);
      return [...effectiveConfigured, ...state.discoveredLoopDefs || []];
    }
    function getConfiguredLoopDefs() {
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
    function getVisibleLoopDefs() {
      return visibleLoopDefs(getLoopDefs(), state.showMvpLoops);
    }
    function findLoopDefById(id) {
      const loopDefs = getLoopDefs();
      return loopDefs.find((def) => def.id === id) || null;
    }
    function getLoopDefById(id) {
      return findLoopDefById(id) || getLoopDefs()[0] || LOOP_DEFS[0];
    }
    function validateLoopDef2(loopDef, label = "loop") {
      return validateLoopDef(loopDef, label);
    }
    function assertValidLoopDef2(loopDef, label = "Loop JSON") {
      return assertValidLoopDef(loopDef, label);
    }
    function validateLoopDefList2(loopDefs, label = "Loop config") {
      return validateLoopDefList(loopDefs, label);
    }
    function normalizeLoopConfig2(config) {
      return normalizeLoopConfig(config);
    }
    function validateLoopConfig2(config, label = "Loop config") {
      return validateLoopConfig(config, label);
    }
    function setLoopConfig(config, source = "custom") {
      const normalized = validateLoopConfig2(config, source);
      state.loopDefs = cloneLoopDef(normalized.loops);
      state.recoveryRecipes = cloneLoopDef(normalized.recoveryRecipes);
      state.unassignedRecoveryPolicies = cloneLoopDef(normalized.unassignedRecoveryPolicies);
      state.defaultUnassignedRecoveryPolicyIds = [...normalized.defaultUnassignedRecoveryPolicyIds];
      state.loopConfigSource = source;
      state.discoveredLoopDefs = [];
      state.discoveredLoopOverrides = {};
      renderLoopSelect(state.loopDefs[0]?.id);
      log(`Loaded ${state.loopDefs.length} loop definition(s), ${state.recoveryRecipes.length} recovery recipe(s), and ${state.unassignedRecoveryPolicies.length} recovery policy(s) from ${source}`);
    }
    function resetLoopDefs() {
      state.loopDefs = null;
      state.recoveryRecipes = null;
      state.unassignedRecoveryPolicies = null;
      state.defaultUnassignedRecoveryPolicyIds = null;
      state.loopConfigSource = "built-in";
      state.discoveredLoopDefs = [];
      state.discoveredLoopOverrides = {};
      renderLoopSelect(LOOP_DEFS[0]?.id);
      log(`Using built-in loop definitions (${LOOP_DEFS.length})`);
    }
    function parseLoopConfig2(text) {
      return parseLoopConfig(text);
    }
    async function loadLoopConfig(url = LOOP_CONFIG_URL) {
      const text = await adapters.http.getText(`${url}?t=${Date.now()}`, { useRuntimeFallback: true });
      const config = parseLoopConfig2(text);
      setLoopConfig(config, url);
    }
    function getSelectedLoopDef() {
      const select = document.querySelector("#bronze-loop-select");
      const selectedId = select?.value || getVisibleLoopDefs()[0]?.id || LOOP_DEFS[0].id;
      if (selectedId === "custom") {
        const text = document.querySelector("#bronze-loop-json")?.value || "";
        try {
          const parsed = JSON.parse(text);
          assertValidLoopDef2(parsed, "Custom loop JSON");
          return applyDisabledPiles(parsed);
        } catch (e) {
          if (e instanceof SyntaxError) fail2(`Invalid custom loop JSON: ${e.message || e}`);
          throw e;
        }
      }
      const loopDef = cloneLoopDef(getLoopDefById(selectedId));
      assertValidLoopDef2(loopDef, loopDef.name || selectedId);
      return applyDisabledPiles(loopDef);
    }
    function setLoopJson(def) {
      const editor = document.querySelector("#bronze-loop-json");
      if (editor) editor.value = JSON.stringify(def, null, 2);
    }
    function editWorkflowConfig() {
      const editor = document.querySelector("#bronze-loop-json");
      if (!editor) return;
      const sessionLoops = materializeSessionLoopDefs({
        configuredLoops: getConfiguredLoopDefs(),
        loopOverrides: state.discoveredLoopOverrides,
        discoveredLoops: state.discoveredLoopDefs
      });
      editor.value = JSON.stringify({
        loops: sessionLoops,
        recoveryRecipes: getRecoveryRecipes(),
        unassignedRecoveryPolicies: getUnassignedRecoveryPolicies(),
        defaultUnassignedRecoveryPolicyIds: getDefaultUnassignedRecoveryPolicyIds()
      }, null, 2);
      editor.classList.add("show");
      log(`Editing full workflow JSON with ${sessionLoops.length} current session Loop(s), including scanned Pick metadata. Apply workflow JSON validates every loop and step before replacing the current session configuration.`);
    }
    function applyWorkflowConfigEditor() {
      const text = document.querySelector("#bronze-loop-json")?.value || "";
      let config;
      try {
        config = parseLoopConfig2(text);
      } catch (error) {
        if (error instanceof SyntaxError) fail2(`Invalid workflow JSON: ${error.message || error}`);
        throw error;
      }
      setLoopConfig(config, "panel workflow JSON");
      log("Applied panel workflow JSON. Built-in loops remain available through Built-in loops.");
    }
    function renderLoopSelect(selectedId = null) {
      const panel = document.querySelector("#bronze-loop-panel");
      const nextValue = renderMainPanelLoopOptions({
        panel,
        loops: getVisibleLoopDefs().map((def) => ({ id: def.id, name: def.name })),
        selectedId,
        createOption: () => document.createElement("option")
      });
      if (nextValue && nextValue !== "custom") setLoopJson(getLoopDefById(nextValue));
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
    function updateLoopControls() {
      const editorLoop = getEditorLoopDef();
      const quantity = resolveRuntimeQuantity(editorLoop);
      renderMainPanelRounds({
        panel: document.querySelector("#bronze-loop-panel"),
        show: loopUsesRounds(editorLoop),
        quantity,
        quantityKey: [
          editorLoop.id || editorLoop.name || editorLoop.strategy || "custom",
          quantity?.mode || "none",
          quantity?.target || "none",
          quantity?.default || 0,
          quantity?.min || 0,
          quantity?.max || 0
        ].join(":")
      });
    }
    function updateRecapButton() {
      const batch = state.lastRecapType === "batch" ? state.lastBatchRecap : null;
      const pick = state.lastRecapType === "pick" ? state.lastPickRecap : null;
      const totalCards = batch?.model?.itemCount || (pick ? (pick.pickResults || []).reduce(
        (sum, entry) => sum + (entry?.pickedCards || entry?.pickedItems || []).length,
        0
      ) : 0);
      renderMainPanelRecap({
        panel: document.querySelector("#bronze-loop-panel"),
        recap: batch ? { type: "batch", name: "Batch Open", totalCards } : pick ? { type: "pick", name: pick.name, totalCards } : null
      });
    }
    async function reopenLastRecap() {
      const btn = document.querySelector("#bronze-loop-recap-reopen");
      const existing = document.querySelector("#bronze-loop-recap-modal") || document.querySelector("#bronze-loop-batch-recap-modal");
      if (existing) {
        existing.remove();
        if (btn) {
          btn.textContent = "View recap";
          btn.style.background = "";
        }
        return;
      }
      if (state.lastRecapType === "batch" && state.lastBatchRecap?.model) {
        await showBatchRecapModal(state.lastBatchRecap.model);
        return;
      }
      const recap = state.lastRecapType === "pick" ? state.lastPickRecap : null;
      if (!recap) {
        log("No previous recap available");
        return;
      }
      await showPickRecapModal({ name: recap.name }, recap.pickResults, recap);
      if (btn && document.querySelector("#bronze-loop-recap-modal")) {
        btn.textContent = "Hide recap";
        btn.style.background = "#b13b3b";
      }
    }
    function fail2(message) {
      throw new Error(message);
    }
    function stopPoint() {
      if (state.stopping) fail2("Stopped by user");
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
      return localizationAdapter.localize(value);
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
      return waitAdapter.observableOnce(observable, controller, timeoutMs, label);
    }
    function ctrl() {
      return pageRuntime.currentController();
    }
    async function waitFor(predicate, timeoutMs = 15e3, label = "condition") {
      return waitAdapter.until(predicate, timeoutMs, label);
    }
    async function waitAppReady() {
      return waitAdapter.appReady();
    }
    async function waitLoadingEnd(stableMs = 700, timeoutMs = 3e4) {
      return waitAdapter.loadingEnd(stableMs, timeoutMs);
    }
    function currentControllerName() {
      return pageRuntime.currentControllerName();
    }
    function isFutAppReady() {
      return pageRuntime.isReady();
    }
    async function refreshStorePacks() {
      const controller = ctrl();
      const result = await observeOnce(
        eaPackAdapter().refreshAll(),
        controller,
        3e4,
        "Store.getPacks"
      );
      if (!result?.success) fail2(`Store pack refresh failed: ${result?.error?.code || result?.status || "unknown"}`);
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
            eaInventoryAdapter().requestUnassigned(),
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
      fail2(`Unassigned refresh failed: ${lastError || "unknown"}`);
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
    async function refreshPileCacheByCandidates(pileName, options = {}) {
      const actions = eaInventoryAdapter().refreshActions(pileName);
      for (const action2 of actions) {
        const ok = await tryOptionalRefresh(action2.label, action2.invoke, options);
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
      await refreshPileCacheByCandidates("club", options);
      await refreshPileCacheByCandidates("storage", options);
      await refreshPileCacheByCandidates("transfer", options);
      if (!quiet) {
        log(`Cache summary: ${cacheSummary()}`);
        log(`My Packs inventory: ${formatPackInventorySnapshot(getPackInventorySnapshot()) || "none"}`);
      }
    }
    function getUnassignedItems() {
      return readInventoryPile("unassigned");
    }
    function getRepositoryMyPacks() {
      return eaPackAdapter().list();
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
      return state.stalePackTracker.isStale(pack);
    }
    function markStalePack(pack, options = {}) {
      if (options.gone === true) {
        const marked = state.stalePackTracker.markGone(pack);
        if (marked.added && marked.id) {
          log(`Pack #${marked.id} marked gone for this session after 404; further lookups will skip it`);
        }
        return;
      }
      state.stalePackTracker.markObject(pack);
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
        eaInventoryAdapter().move(items, pile, allowStorage),
        ctrl(),
        25e3,
        `moveItems(${pile})`
      );
      if (!result?.success) fail2(`Move failed: ${result?.error?.code || result?.status || "unknown"}`);
      await waitLoadingEnd();
      return result;
    }
    function isPlayer2(item) {
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
    function isProtectedHighGold(item, threshold = 82) {
      const minRating = Math.max(2, Math.min(99, Number(threshold) || 82));
      return isGold(item) && Number(item?.rating || 0) >= minRating;
    }
    function resolveProtectHighGoldThreshold(options = {}) {
      const raw = options.highGoldThreshold ?? options.pickHighGoldThreshold ?? options.protectHighGoldMinRating ?? 82;
      const value = Number(raw);
      return Math.max(2, Math.min(99, Number.isFinite(value) && value > 0 ? value : 82));
    }
    function isRare(item) {
      try {
        return !!item?.isRare?.();
      } catch {
      }
      return Number(item?.rareflag || item?.rareFlag || 0) > 0;
    }
    function itemRareFlag(item) {
      return Number(item?.rareflag ?? item?.rareFlag ?? item?._rareflag ?? item?._staticData?.rareflag ?? 0);
    }
    function isSpecial2(item) {
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
      if (spec.playerOnly && !isPlayer2(item)) return false;
      const rating = Number(item?.rating || 0);
      if (spec.minRating !== void 0 && rating < Number(spec.minRating)) return false;
      if (spec.maxRating !== void 0 && rating > Number(spec.maxRating)) return false;
      if (spec.blockTradeable === true && isTradeable(item) && !isNormalGoldFodder(item)) return false;
      if (spec.special === true && !isSpecial2(item)) return false;
      if (spec.special === false && isSpecial2(item)) return false;
      if (spec.special !== true && spec.allowSpecial !== true && isSpecial2(item)) return false;
      if (settings.useRarityPlayer === false && spec.special !== true && spec.allowSpecial !== true && isSpecial2(item)) return false;
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
        const bool = boolFromAny3(value);
        if (bool === true) return true;
        if (bool === false) continue;
        if (typeof value === "string" && /\bconcept\b/i.test(value)) return true;
      }
      return false;
    }
    function boolFromAny3(value) {
      if (typeof value === "boolean") return value;
      if (typeof value === "number" && Number.isFinite(value)) return value !== 0;
      if (typeof value === "string") {
        const text = value.trim().toLowerCase();
        if (["true", "1", "yes", "on", "enabled", "enable"].includes(text)) return true;
        if (["false", "0", "no", "off", "disabled", "disable"].includes(text)) return false;
      }
      return null;
    }
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
    function isInspectableObject2(value) {
      if (!value || typeof value !== "object") return false;
      if (value === W || value === document || value === document.body) return false;
      const tag = Object.prototype.toString.call(value);
      return tag === "[object Object]" || tag === "[object Array]";
    }
    function flattenConfigValues2(value, path = "", rows = [], depth = 0, seen = /* @__PURE__ */ new WeakSet()) {
      if (value === null || value === void 0 || depth > 5) return rows;
      if (typeof value !== "object") {
        rows.push({ path, value });
        return rows;
      }
      if (!isInspectableObject2(value) || seen.has(value)) return rows;
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
        if (isInspectableObject2(child)) {
          flattenConfigValues2(child, nextPath, rows, depth + 1, seen);
        } else {
          rows.push({ path: nextPath, value: child });
        }
      }
      return rows;
    }
    function numberListFromAny3(value) {
      if (Array.isArray(value)) {
        return value.flatMap((entry) => numberListFromAny3(entry)).filter((entry, index, arr) => Number.isFinite(entry) && arr.indexOf(entry) === index);
      }
      if (typeof value === "number" && Number.isFinite(value)) return [Number(value)];
      if (typeof value === "string") {
        return (value.match(/\d+/g) || []).map(Number).filter(Number.isFinite);
      }
      if (isInspectableObject2(value)) {
        return flattenConfigValues2(value).flatMap((row) => numberListFromAny3(row.value)).filter((entry, index, arr) => Number.isFinite(entry) && arr.indexOf(entry) === index);
      }
      return [];
    }
    function uniqueNumberList(values = []) {
      return values.map(Number).filter((value) => Number.isFinite(value) && value > 0).filter((value, index, arr) => arr.indexOf(value) === index);
    }
    function detectFsuSettings() {
      return fsuAdapter().snapshot(state.fsuSettingsOverride);
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
        ...ITEM_IDENTITY_HOLDER_FIELDS.map((field2) => safeReadField(item, field2))
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
        (holder) => fields.flatMap((field2) => numberListFromAny3(safeReadField(holder, field2)))
      ));
    }
    function isFsuLockedItem(item, settings = getFsuSettings(), lockContext = null) {
      const lockedItemIds = lockContext?.lockedItemIds || new Set((settings.lockedItemIds || []).map(Number).filter((id) => Number.isFinite(id) && id > 0));
      const lockedDefinitionIds = lockContext?.lockedDefinitionIds || new Set((settings.lockedDefinitionIds || []).map(Number).filter((id) => Number.isFinite(id) && id > 0));
      if (!lockedItemIds.size && !lockedDefinitionIds.size) return false;
      const itemIds2 = itemIdentifierNumbers(item, ITEM_ID_FIELD_ALIASES);
      const definitionIds2 = itemIdentifierNumbers(item, DEFINITION_ID_FIELD_ALIASES);
      if (itemIds2.some((id) => lockedItemIds.has(id))) return true;
      if (definitionIds2.some((id) => lockedDefinitionIds.has(id))) return true;
      const allIds = uniqueNumberList([
        ...itemIds2,
        ...definitionIds2,
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
        if (isInspectableObject2(value)) return Object.keys(value).length > 0;
        return false;
      });
    }
    function getFsuRejectReasons(item, spec = {}, settings = getFsuSettings(), context = null) {
      const reasons = [];
      if (!isPlayer2(item)) return reasons;
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
      if (settings.useRarityPlayer === false && spec.special !== true && spec.allowSpecial !== true && isSpecial2(item)) {
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
      return readInventoryPile("club");
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
      return readInventoryPile("storage");
    }
    function getTransferItems() {
      return readInventoryPile("transfer");
    }
    function readInventoryPile(pileName) {
      try {
        return eaInventoryAdapter().readPile(pileName);
      } catch {
        return [];
      }
    }
    function getPileItemsByName(pileName) {
      if (pileName === "unassigned") return uniqueItems(getUnassignedItems());
      if (pileName === "storage") return uniqueItems(getStorageItems());
      if (pileName === "transfer") return uniqueItems(getTransferItems());
      if (pileName === "club") return uniqueItems(getClubItems());
      return [];
    }
    function findCachedItemById(itemId2, pileNames = ["storage", "club", "unassigned", "transfer"]) {
      const targetId = Number(itemId2 || 0);
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
        if (!isPlayer2(item)) continue;
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
      if (!isPlayer2(item)) return false;
      const id = Number(item?.id || 0);
      const definitionId2 = Number(item?.definitionId || 0);
      if (id && state.consumedItemIds.has(id)) return false;
      if (id && (context?.protectedItemIds?.has(id) || options.protectedItemIds?.some((value) => Number(value) === id))) return false;
      if (definitionId2 && (context?.protectedDefinitionIds?.has(definitionId2) || options.protectedDefinitionIds?.some((value) => Number(value) === definitionId2))) return false;
      if (options.protectHighGold && isProtectedHighGold(item, resolveProtectHighGoldThreshold(options))) return false;
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
    function pileSpaceLeft(pileName) {
      try {
        return eaInventoryAdapter().capacity(pileName).free;
      } catch {
        return null;
      }
    }
    function storageSpaceLeft() {
      return pileSpaceLeft("storage");
    }
    function transferSpaceLeft() {
      return pileSpaceLeft("transfer");
    }
    function assertPileSpace(pileName, available, needed) {
      if (available !== null && needed > available) {
        fail2(`${pileName} has only ${available} slot(s), but ${needed} item(s) need moving`);
      }
    }
    async function resolveRuntimeUnassigned(reason = "cleanup", options = {}) {
      await refreshUnassigned();
      let reservedIds = /* @__PURE__ */ new Set();
      let initialLogged = false;
      const adapter = adapters.inventory({ capacityFallbacks: { storage: CFG.storageMax } });
      const getSnapshot = async () => {
        await options.beforeSnapshot?.();
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
      const configuredResolvers = options.blockedPolicy === "preserve" && options.enableRecovery !== true || options.enableRecovery === false ? [] : buildUnassignedRecoveryResolvers({
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
        actionProgressAttempts: options.actionProgressAttempts || 6,
        onActionProgressRetry: async ({ action: action2, attempt, maxAttempts }) => {
          if (attempt === 1) {
            log(`Unassigned ${action2.description} move is waiting for EA repository settlement (${attempt + 1}/${maxAttempts})`);
          }
          await sleep(Math.min(1800, 500 + attempt * 250));
        },
        executeAction: async (action2) => {
          stopPoint();
          const items = action2.itemRefs.map((ref) => adapter.resolveItem(ref, ["unassigned"])?.item).filter(Boolean);
          if (items.length !== action2.itemRefs.length) {
            fail2(`Unassigned ${action2.description} action could resolve only ${items.length}/${action2.itemRefs.length} item(s)`);
          }
          if (action2.type === "swap") {
            log(`Swapping ${items.length} untradeable duplicate(s) with tradeable club version(s)`);
            await moveItems(items, inventoryPile("club"), true);
          } else if (action2.destination === "club") {
            log(`Moving ${items.length} non-duplicate unassigned item(s) to club`);
            await moveItems(items, inventoryPile("club"), true);
          } else if (action2.destination === "transfer") {
            log(`Moving ${items.length} tradeable duplicate(s) to transfer list`);
            await moveItems(items, inventoryPile("transfer"), false);
          } else if (action2.destination === "storage") {
            log(`Moving ${items.length} untradeable duplicate(s) to SBC storage`);
            await moveItems(items, inventoryPile("storage"), true);
          } else {
            fail2(`Unsupported Unassigned action destination: ${action2.destination}`);
          }
          await refreshUnassigned();
        }
      });
      if (result.status === "blocked") {
        const blocked2 = result.plan?.blocked;
        if (blocked2?.destination === "storage") {
          fail2(`SBC storage has only ${blocked2.free} slot(s), but ${blocked2.required} item(s) need moving`);
        }
        if (blocked2?.destination === "transfer") {
          fail2(`Transfer list has only ${blocked2.free} slot(s), but ${blocked2.required} item(s) need moving`);
        }
        fail2(result.reason || "Unassigned cleanup blocked");
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
    function materializeOpenedResponsePlayerDuplicates(items, label = "opened reward pack") {
      const result = materializeOpenedPlayerDuplicates({
        items,
        clubItems: getClubItems(),
        isPlayer: isPlayer2,
        isDuplicate,
        preparePurchasedItem: (item) => eaInventoryAdapter().preparePurchasedItem(item)
      });
      if (result.inferredDuplicates.length) {
        log(`${label}: restored delayed duplicate metadata for ${result.inferredDuplicates.length} opened player(s) from matching Club entities`);
      }
      return result;
    }
    function restoreOpenedUnassignedDuplicateMetadata(items, label = "opened reward pack", options = {}) {
      const unassignedItems = getUnassignedItems();
      const responseDuplicates = (items || []).filter((item) => isDuplicate(item));
      const responseById = new Map((items || []).map((item) => [Number(item?.id || 0), item]).filter(([id]) => id));
      let restored = 0;
      let remapped = 0;
      const restore = (item, responseItem) => {
        if (!responseItem) return;
        const clubDuplicate = findClubDuplicate2(item) || findClubDuplicate2(responseItem);
        const duplicateId = Number(item?.duplicateId || responseItem?.duplicateId || clubDuplicate?.id || 0);
        if (duplicateId && !Number(item?.duplicateId || 0)) {
          item.duplicateId = duplicateId;
          if (item._duplicateId !== void 0) item._duplicateId = duplicateId;
          restored++;
        }
        eaInventoryAdapter().preparePurchasedItem(item);
      };
      for (const item of unassignedItems) {
        const responseItem = responseById.get(Number(item?.id || 0));
        restore(item, responseItem);
      }
      const baselineUnassignedIds = options.routingBaseline?.unassignedIds;
      const aliases = Array.isArray(baselineUnassignedIds) ? matchOpenedItemsToNewPileAliases({
        items: (items || []).filter((item) => isDuplicate(item)),
        pileItems: unassignedItems,
        baselineIds: baselineUnassignedIds
      }) : [];
      for (const { item: responseItem, alias } of aliases) {
        if (Number(alias?.id || 0) === Number(responseItem?.id || 0)) continue;
        const before = restored;
        restore(alias, responseItem);
        if (restored > before) remapped++;
      }
      if (restored) {
        log(`${label}: restored delayed duplicate metadata on ${restored} live Unassigned item(s)${remapped ? ` (${remapped} remapped response id(s))` : ""}`);
      } else if (responseDuplicates.length) {
        const describe = (item) => `id:${Number(item?.id || 0) || "?"} def:${Number(item?.definitionId || 0) || "?"} rating:${Number(item?.rating || 0) || "?"} dup:${Number(item?.duplicateId || 0) || "?"}`;
        log(`${label}: duplicate metadata restore snapshot response:${responseDuplicates.length} [${responseDuplicates.map(describe).join("; ")}] liveUnassigned:${unassignedItems.length} [${unassignedItems.map(describe).join("; ")}] baselineUnassigned:${Array.isArray(baselineUnassignedIds) ? baselineUnassignedIds.length : "?"}`);
      }
      return restored;
    }
    async function materializeOpenedPlayerRewards(items, label = "opened reward pack") {
      const players = uniqueItems((items || []).filter((item) => isPlayer2(item)));
      if (!players.length) return { moved: 0, deferredDuplicates: [] };
      const materialized = materializeOpenedResponsePlayerDuplicates(players, label);
      const moved = await tryMoveOpenedRewardItems(
        materialized.directItems,
        inventoryPile("club"),
        true,
        label,
        "non-duplicate"
      );
      if (materialized.deferredDuplicates.length) {
        log(`${label}: waiting for ${materialized.deferredDuplicates.length} duplicate opened reward item(s) to materialize in Unassigned`);
      }
      if (needsUnassignedViewMaterialization(materialized)) {
        log(`${label}: all opened player item(s) are duplicates; opening Unassigned to materialize live EA entities`);
        await showUnassignedIfAny(`${label} all-duplicate materialization`, {
          stableEmptyReads: 3,
          emptyReadDelayMs: 450,
          diagnostic: true
        });
      }
      if (moved) {
        await refreshInventoryCaches(`${label} direct reward move`, { includePacks: false, quiet: true });
        resolveRecentRewardItems(`${label} direct reward move`);
      }
      return { ...materialized, moved };
    }
    function hasNewUnassignedOpenedDuplicateEntity(items, routingBaseline = null) {
      const baselineIds = new Set((routingBaseline?.unassignedIds || []).map((id) => Number(id || 0)).filter(Boolean));
      const definitionIds2 = new Set((items || []).map((item) => Number(item?.definitionId || item?.ref?.definitionId || 0)).filter(Boolean));
      if (!definitionIds2.size) return false;
      return getUnassignedItems().some((item) => {
        const id = Number(item?.id || item?.ref?.id || 0);
        const definitionId2 = Number(item?.definitionId || item?.ref?.definitionId || 0);
        return id && !baselineIds.has(id) && definitionIds2.has(definitionId2);
      });
    }
    async function tryDirectlySettleUnmaterializedOpenedDuplicates({
      openedItems,
      materialized,
      routing,
      label,
      routingBaseline
    }) {
      const pendingIds = new Set((routing?.pendingItems || []).map((item) => Number(item?.id || 0)).filter(Boolean));
      const duplicates = uniqueItems((materialized?.deferredDuplicates || []).filter((item) => pendingIds.has(Number(item?.id || 0))));
      if (!duplicates.length) return null;
      await refreshInventoryCaches(`${label} direct duplicate fallback preflight`, { includePacks: false, quiet: true });
      if (hasNewUnassignedOpenedDuplicateEntity(duplicates, routingBaseline)) {
        log(`${label}: direct duplicate fallback skipped because a matching live Unassigned entity appeared`);
        return null;
      }
      const fallbackPlan = planUnmaterializedDuplicateFallback({
        items: duplicates,
        isTradeable,
        findClubDuplicate: findClubDuplicate2,
        capacities: {
          storage: storageSpaceLeft(),
          transfer: transferSpaceLeft()
        }
      });
      if (fallbackPlan.status === "blocked") {
        const blocked2 = fallbackPlan.blocked;
        const reason = `direct duplicate fallback blocked: ${blocked2.destination} has only ${blocked2.free} slot(s) for ${blocked2.required} item(s)`;
        log(`${label}: ${reason}`);
        return {
          status: "preserved",
          reason,
          cleanup: { status: "preserved", reason, plan: { blocked: blocked2 } },
          routing,
          moved: 0
        };
      }
      log(`${label}: no matching live Unassigned entity after bounded settlement; attempting direct routing for ${duplicates.length} duplicate response item(s)`);
      let moved = 0;
      for (const group of fallbackPlan.groups) {
        moved += await tryMoveOpenedRewardItems(
          group.items,
          inventoryPile(group.key),
          group.allowStorage,
          label,
          group.description
        );
      }
      if (moved !== duplicates.length) {
        log(`${label}: direct duplicate fallback moved ${moved}/${duplicates.length}; preserving unresolved response item(s)`);
        return null;
      }
      await sleep(CFG.pauseMs);
      await refreshInventoryCaches(`${label} direct duplicate fallback`, { includePacks: false, quiet: true });
      if (hasNewUnassignedOpenedDuplicateEntity(duplicates, routingBaseline)) {
        const pending = openedItemRoutingResult(openedItems, null, {}, routingBaseline);
        log(`${label}: direct duplicate fallback detected a new live Unassigned entity after move; preserving it to avoid a second route`);
        return {
          status: "preserved",
          reason: "direct duplicate fallback left a live Unassigned entity for manual resolution",
          cleanup: { status: "preserved", reason: "direct duplicate fallback left a live Unassigned entity for manual resolution" },
          routing: pending,
          moved
        };
      }
      const confirmed = await confirmOpenedItemRouting(openedItems, label, { routingBaseline });
      if (confirmed.pendingItems.length) {
        log(`${label}: direct duplicate fallback moved ${moved} item(s), but EA did not confirm every destination; preserving`);
        return { status: "pending", cleanup: null, routing: confirmed, moved };
      }
      log(`${label}: direct duplicate fallback confirmed ${moved} routed response item(s)`);
      return { status: "resolved", cleanup: { status: "resolved" }, routing: confirmed, moved };
    }
    function openedItemRoutingResult(items, reserveItem = null, details = {}, routingBaseline = null) {
      return {
        ...classifyOpenedItemRouting({
          items,
          reserveItem,
          routingBaseline,
          piles: {
            unassigned: getUnassignedItems(),
            club: getClubItems(),
            storage: getStorageItems(),
            transfer: getTransferItems()
          }
        }),
        details
      };
    }
    async function confirmOpenedItemRouting(items, label, options = {}) {
      const attempts = Math.max(1, Math.min(8, Number(options.attempts || 4) || 4));
      const delayMs = Math.max(0, Number(options.delayMs ?? 500));
      let routing = openedItemRoutingResult(items, options.reserveItem || null, {}, options.routingBaseline || null);
      for (let attempt = 1; attempt <= attempts && routing.pendingItems.length; attempt++) {
        await refreshUnassigned({ quiet: true });
        await refreshPileCacheByCandidates("storage", { quiet: true });
        await refreshPileCacheByCandidates("transfer", { quiet: true });
        routing = openedItemRoutingResult(items, options.reserveItem || null, {}, options.routingBaseline || null);
        if (!routing.pendingItems.length || attempt >= attempts) break;
        await sleep(delayMs);
      }
      for (const route of routing.aliasRoutes || []) {
        log(`${label}: confirmed opened item via new ${route.destination.pile} entity ${Number(route.destination.item?.id || 0) || "?"} for response id:${Number(route.item?.id || 0) || "?"} def:${Number(route.item?.definitionId || 0) || "?"}`);
      }
      if (routing.pendingItems.length) {
        const ids = routing.pendingItems.map((item) => Number(item?.id || 0) || "?").join(", ");
        log(`${label}: ${routing.pendingItems.length} opened item(s) still have no confirmed destination after ${attempts} check(s); ids:${ids}`);
        const describe = (item) => `id:${Number(item?.id || 0) || "?"} def:${Number(item?.definitionId || 0) || "?"} rating:${Number(item?.rating || 0) || "?"} dup:${Number(item?.duplicateId || 0) || "?"}`;
        const baseline = options.routingBaseline || {};
        log(`${label}: routing snapshot pending:[${routing.pendingItems.map(describe).join("; ")}]; piles unassigned:${getUnassignedItems().length} storage:${getStorageItems().length} transfer:${getTransferItems().length} club:${getClubItems().length}; baseline destinations:${Array.isArray(baseline.destinationIds) ? baseline.destinationIds.length : "?"} unassigned:${Array.isArray(baseline.unassignedIds) ? baseline.unassignedIds.length : "?"}`);
      }
      return routing;
    }
    async function openPack(pack, purpose, options = {}) {
      if (!pack) fail2(`Pack not found for ${purpose}`);
      if (typeof options.openedItemPolicy !== "function") {
        fail2(`Opened item policy is required for ${purpose}`);
      }
      const packAdapter = adapters.pack();
      const inventoryAdapter = adapters.inventory({ capacityFallbacks: { storage: CFG.storageMax } });
      let currentPack = pack;
      let routingBaseline = null;
      const retryCodes = options.retryCodes || (options.retryOn471 === true ? ["471"] : []);
      const receipt = await openPackTransaction({
        preOpenResolver: () => resolveRuntimeUnassigned(`opening ${purpose}`),
        packSelector: async ({ attempt, lastReason }) => {
          if (attempt === 1) return currentPack;
          const reuseCurrentPack = String(lastReason || "") === "471" && options.reusePackOn471 === true;
          if (!reuseCurrentPack && typeof options.resolveRetryPack === "function") {
            currentPack = await options.resolveRetryPack();
          }
          return currentPack;
        },
        packRef: (selectedPack) => ({ id: Number(selectedPack?.id || 0), name: packName(selectedPack) }),
        openTransport: async (selectedPack, { attempt }) => {
          routingBaseline = createOpenedItemRoutingBaseline({
            unassigned: getUnassignedItems(),
            club: getClubItems(),
            storage: getStorageItems(),
            transfer: getTransferItems()
          });
          const name = packName(selectedPack);
          const attempts = retryCodes.length ? 2 : 1;
          log(`Opening pack: ${name} (#${selectedPack.id})${attempt > 1 ? ` retry ${attempt}/${attempts}` : ""}`);
          return observeOnce(packAdapter.open(selectedPack), ctrl(), 3e4, `open ${name}`);
        },
        normalizeItems: async (items, { pack: selectedPack }) => {
          markStalePack(selectedPack);
          await waitLoadingEnd();
          materializeOpenedResponsePlayerDuplicates(items, purpose);
          return {
            items,
            receiptItems: items.map((item) => inventoryAdapter.snapshotItem(item, "unassigned"))
          };
        },
        onItemsOpened: ({ packRef, openedItems }) => publishPackHighlight(openedItems, {
          packRef,
          purpose,
          assumeSpecialPlayers: options.assumeSpecialPlayers === true
        }),
        onItemsOpenedError: (error) => log(`${purpose}: reward highlight failed: ${error?.message || error}`),
        openedItemPolicy: (openedItems, context) => options.openedItemPolicy(openedItems, {
          ...context,
          routingBaseline
        }),
        retryPolicy: { attempts: retryCodes.length ? 2 : 1, retryCodes },
        beforeRetry: async ({ code, pack: failedPack }) => {
          if (String(code) === "471") {
            log(`${purpose}: pack open returned 471; rechecking delayed Unassigned state before retry`);
            await sleep(CFG.pauseMs);
            await unwindSbcSquadControllers2(`${purpose} pack-open recovery`);
            await showUnassignedIfAny(`${purpose} pack-open recovery sync`, {
              stableEmptyReads: 3,
              emptyReadDelayMs: 450
            });
            await resolveRuntimeUnassigned(`${purpose} pack-open recovery cleanup`);
            await refreshInventoryCaches(`${purpose} pack-open recovery`, {
              quiet: true,
              includePacks: false
            });
            return;
          }
          await recoverPackOpenRetry({
            label: purpose,
            code,
            pack: failedPack,
            log,
            markFailedPack: (item) => markStalePack(item),
            sleep,
            pauseMs: CFG.pauseMs,
            settleMs: 700,
            unwind: () => unwindSbcSquadControllers2(`${purpose} pack-open recovery`),
            showUnassigned: () => showUnassignedIfAny(`${purpose} pack-open recovery sync`),
            openStorePacks: () => openStorePacksViewForRefresh(`${purpose} pack-open Store recovery`),
            resolveUnassigned: () => resolveRuntimeUnassigned(`${purpose} pack-open recovery cleanup`),
            refreshInventory: ({ storeRefreshed }) => refreshInventoryCaches(`${purpose} pack-open recovery`, {
              quiet: true,
              includePacks: !storeRefreshed
            })
          });
        },
        allowGone: options.allowGone === true,
        onGone: async (selectedPack) => {
          markStalePack(selectedPack, { gone: true });
          log(`Skipping stale pack for ${purpose}: ${packName(selectedPack)} (#${selectedPack.id}) returned 404`);
          await waitLoadingEnd().catch(() => null);
          await refreshStorePacks().catch(() => null);
        }
      });
      state.lastOpenPackReceipt = receipt;
      if (receipt.status === "opened") {
        if (receipt.pendingItemRefs.length && options.allowPendingItems !== true) {
          fail2(`${purpose}: ${receipt.pendingItemRefs.length} opened item(s) remain unresolved; stopping before another pack or SBC action`);
        }
        return receipt;
      }
      if (receipt.status === "stale" || receipt.status === "unavailable") {
        if (receipt.status === "unavailable") log(`${purpose}: no matching pack remains after recovery`);
        return null;
      }
      log(`${purpose}: pack open blocked after ${receipt.attempts} attempt(s); reason:${receipt.reason || "unknown"}`);
      fail2(`Open pack failed: ${receipt.reason || "unknown"}`);
    }
    async function findValidationSourcePack(loopDef) {
      await refreshStorePacks();
      return (loopDef.sourcePackIds || CFG.sourcePackIds).map((id) => findPackById(id)).find(Boolean) || findPackByName(loopDef.sourcePackNames || CFG.sourcePackNames) || null;
    }
    async function openSourceBronzePack(loopDef, selectedPack = null) {
      const pack = selectedPack || await findValidationSourcePack(loopDef);
      if (!pack) {
        const names = summarizePacks();
        fail2(`Source pack not found. Current my packs: ${names || "none"}`);
      }
      const receipt = await openPack(pack, "source bronze pack", {
        openedItemPolicy: createOpenedItemPolicy(async (openedItems) => {
          const bronzeDuplicates = openedItems.filter((item) => isPlayer2(item) && isBronze(item) && isDuplicate(item));
          const duplicateIds = new Set(bronzeDuplicates.map((item) => Number(item?.id || 0)));
          const directClub = openedItems.filter(
            (item) => !duplicateIds.has(Number(item?.id || 0)) && (!isPlayer2(item) || !isDuplicate(item))
          );
          if (directClub.length) {
            log(`Moving ${directClub.length} non-duplicate source item(s) to club`);
            await moveItems(directClub, inventoryPile("club"), true);
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
      if (eaSbcAdapter().listSets().length) return;
      const result = await observeOnce(eaSbcAdapter().requestSets(), ctrl(), 3e4, "SBC.requestSets");
      if (!result?.success) fail2(`SBC set request failed: ${result?.error?.code || result?.status || "unknown"}`);
    }
    function getSbcSets() {
      return eaSbcAdapter().listSets();
    }
    async function findSbcSet(names, label = "SBC") {
      await ensureSbcSetsLoaded();
      const set = getSbcSets().find((s) => matchesAny(s?.name, names));
      if (!set) {
        const names2 = getSbcSets().map((s) => `${s?.name || "?"} (#${s?.id})`).slice(0, 80).join(", ");
        fail2(`${label} SBC not found. First loaded SBCs: ${names2}`);
      }
      return set;
    }
    async function findSbcSetIfPresent(names) {
      await ensureSbcSetsLoaded();
      return getSbcSets().find((set) => matchesAny(set?.name, names)) || null;
    }
    async function findSbcSetForLoopDef(loopDef, label = loopDef?.name || "SBC") {
      await ensureSbcSetsLoaded();
      const setIds = new Set((loopDef?.sbcSetIds || []).map(Number).filter(Boolean));
      if (setIds.size) {
        const byId = getSbcSets().find((set) => setIds.has(Number(set?.id || 0)));
        if (byId) return byId;
        fail2(`${label} SBC not found by configured Set id(s): ${[...setIds].join(", ")}`);
      }
      return findSbcSet(loopDef?.sbcNames, label);
    }
    function navController() {
      return pageRuntime.navigationController();
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
      if (!eaSbcAdapter().hasDaoGetChallengesForSet()) {
        fail2(`${label}: direct SBC challenge DAO is unavailable`);
      }
      log(`${label}: loading challenges directly through sbcDAO; bypassing requestChallengesForSet`);
      const result = await observeOnce(
        eaSbcAdapter().getChallengesForSet(set?.id),
        ctrl(),
        2e4,
        `sbcDAO.getChallengesForSet ${label}`
      );
      if (!result?.success || !Array.isArray(result?.response?.challenges)) {
        const detail = serviceResultErrorText(result) || "no challenge data returned";
        fail2(`${label}: direct SBC challenge load failed: ${detail}`);
      }
      const received = result.response.challenges;
      log(`${label}: direct SBC challenge load returned ${received.length} challenge(s)`);
      return received;
    }
    async function findAvailableRatingSbcChallenge(set, label = set?.name || "rating SBC") {
      const challenges = await requestRatingSbcChallenges(set, label);
      return challenges.find((challenge) => !isCompletedChallenge(challenge)) || null;
    }
    async function loadRatingSbcChallenge(challenge, label = "rating SBC", options = {}) {
      if (!challenge) return null;
      if (challenge.squad && options.force !== true) return challenge;
      if (!eaSbcAdapter().hasDaoLoadChallenge()) {
        fail2(`${label}: direct SBC challenge loader is unavailable`);
      }
      let inProgress = false;
      try {
        inProgress = challenge.isInProgress?.() === true;
      } catch {
      }
      log(`${label}: loading challenge squad directly through sbcDAO`);
      const result = await observeOnce(
        eaSbcAdapter().loadDaoChallenge(challenge.id, inProgress),
        ctrl(),
        2e4,
        `sbcDAO.loadChallenge ${label}`
      );
      const squad = result?.response?.squad;
      if (!result?.success || !squad) {
        const detail = serviceResultErrorText(result) || "no squad data returned";
        fail2(`${label}: direct challenge squad load failed: ${detail}`);
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
            eaSbcAdapter().requestChallengesForSet(set),
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
      fail2(`No challenge loaded for ${label} after ${attempts} attempt(s): ${detail}`);
    }
    async function loadPlayerPickDiscoveryChallenges(set) {
      const label = `Player Pick scan ${set?.name || `#${set?.id || "?"}`}`;
      let challenges = null;
      if (eaSbcAdapter().hasDaoGetChallengesForSet()) {
        const result = await observeOnce(
          eaSbcAdapter().getChallengesForSet(set?.id),
          ctrl(),
          2e4,
          `sbcDAO.getChallengesForSet ${label}`
        );
        if (result?.success && Array.isArray(result?.response?.challenges)) {
          challenges = result.response.challenges;
        } else {
          log(`${label}: direct Challenge metadata unavailable (${serviceResultErrorText(result) || "unknown"}); trying standard request`);
        }
      }
      if (!challenges) challenges = await requestSbcChallenges(set, label, { attempts: 1 });
      const loaded = [];
      for (const challenge of challenges) {
        if (challenge?.squad || !eaSbcAdapter().hasDaoLoadChallenge()) {
          loaded.push(challenge);
          continue;
        }
        let inProgress = false;
        try {
          inProgress = challenge.isInProgress?.() === true;
        } catch {
        }
        try {
          const result = await observeOnce(
            eaSbcAdapter().loadDaoChallenge(challenge.id, inProgress),
            ctrl(),
            2e4,
            `sbcDAO.loadChallenge ${label} #${challenge.id || "?"}`
          );
          const squad = result?.response?.squad;
          if (!result?.success || !squad) throw new Error(serviceResultErrorText(result) || "squad unavailable");
          challenge.squad = squad;
        } catch (error) {
          log(`${label}: Challenge #${challenge?.id || "?"} squad metadata unavailable (${error?.message || error}); player count will remain unsupported`);
        }
        loaded.push(challenge);
      }
      return loaded;
    }
    function describePlayerPickDiscoveryReward(reward = {}, parsed = {}) {
      return [
        reward.name || "?",
        `resource:${reward.resourceId || "?"}`,
        `definition:${reward.definitionId || "?"}`,
        `candidates:${parsed.pickCandidateCount || reward.candidateCount || "?"}`,
        `select:${parsed.pickCount || reward.selectionCount || "?"}`
      ].join(", ");
    }
    function describePlayerPickDiscoveryRequirement(requirement = {}) {
      return `${requirement.key || "?"}=${(requirement.values || []).join("/") || "?"} x${requirement.count ?? "?"}`;
    }
    function logPlayerPickDiscoveryMetadataHints(reward = {}) {
      for (const [source, hint] of Object.entries(reward.metadataHints || {})) {
        const keys = (hint?.keys || []).join(",") || "none";
        const prototypeKeys = (hint?.prototypeKeys || []).join(",") || "none";
        const values = Object.keys(hint?.values || {}).length ? JSON.stringify(hint.values) : "{}";
        log(`Player Pick scan: reward ${source} keys: ${keys}; related prototype keys: ${prototypeKeys}; related scalar values: ${values}`);
      }
    }
    async function scanAvailablePlayerPickSbcs() {
      log("Player Pick scan: refreshing SBC Sets and reading metadata; only fully supported non-duplicate Picks will be added as session Loops, nothing will be executed");
      const pickOptions = getPickRuntimeOptions();
      const summary = await scanPlayerPickSbcSnapshots({
        refreshSets: async () => {
          const result = await observeOnce(eaSbcAdapter().requestSets(), ctrl(), 3e4, "Player Pick scan SBC.requestSets");
          if (!result?.success) throw new Error(serviceResultErrorText(result) || "SBC Set request failed");
        },
        listSets: getSbcSets,
        snapshotSet: (set, challenges) => eaSbcAdapter().snapshotDiscoverySet(set, challenges),
        loadChallenges: loadPlayerPickDiscoveryChallenges,
        parseSnapshot: (snapshot) => parsePlayerPickSbcSnapshot({
          set: snapshot,
          highGoldThreshold: pickOptions.highGoldThreshold,
          pricePlatform: "pc"
        }),
        onResult: async ({ snapshot, parsed, loadError }) => {
          const reward = snapshot.rewards?.[0] || {};
          const remaining = parsed.remainingCompletions ?? (() => {
            if (parsed.loop?.useRoundsAsCompletions === true) return "user rounds";
            const completed = snapshot.timesCompleted;
            const repeats = snapshot.repeats;
            if (completed === null || completed === void 0 || repeats === null || repeats === void 0) return null;
            if (!Number.isFinite(Number(repeats)) || Number(repeats) <= 0) return null;
            return Math.max(0, Number(repeats) - Number(completed));
          })();
          log(`Player Pick scan: set #${snapshot.id || "?"} ${snapshot.name || "?"}; reward ${describePlayerPickDiscoveryReward(reward, parsed)}; challenges:${snapshot.challenges?.length || 0}; set complete:${snapshot.complete ? "yes" : "no"}, state:${snapshot.status || "?"}, completed:${snapshot.timesCompleted ?? "?"}, repeats:${snapshot.repeats ?? "?"}, remaining:${remaining ?? "?"}; status:${parsed.status}${parsed.reportedCompleted ? " (reported completed; runtime probe enabled)" : ""}`);
          if (!parsed.pickCandidateCount || !parsed.pickCount) logPlayerPickDiscoveryMetadataHints(reward);
          for (const [index, challenge] of (snapshot.challenges || []).entries()) {
            const requirements = (challenge.eligibilityRequirements || []).map(describePlayerPickDiscoveryRequirement).join(", ");
            log(`Player Pick scan: challenge ${index + 1} #${challenge.id || "?"} players:${challenge.requiredPlayerCount || "?"} completed:${challenge.completed ? "yes" : "no"}; ${requirements || "requirements unavailable"}`);
          }
          if (loadError) log(`Player Pick scan: challenge load warning: ${loadError?.message || loadError}`);
          for (const diagnostic of parsed.diagnostics || []) log(`Player Pick scan: diagnostic: ${diagnostic}`);
        }
      });
      const session = buildPlayerPickDiscoverySession({
        sets: summary.results.map((result) => result.snapshot),
        configuredLoops: getConfiguredLoopDefs(),
        selectedId: document.querySelector("#bronze-loop-select")?.value || null,
        preferScannedMetadata: pickOptions.preferScannedMetadata,
        highGoldThreshold: pickOptions.highGoldThreshold,
        pricePlatform: "pc"
      });
      state.discoveredLoopDefs = cloneLoopDef(session.discoveredLoops);
      state.discoveredLoopOverrides = cloneLoopDef(session.loopOverrides);
      renderLoopSelect(session.selectedId);
      const duplicateCount = session.results.filter((result) => result.status === "duplicate").length;
      for (const [loopId, loopDef] of Object.entries(state.discoveredLoopOverrides)) {
        const ratios = (loopDef.challengeRequirements || [loopDef.requirements || []]).map((requirements, index) => `challenge ${index + 1}: ${(requirements || []).map((requirement) => `${requirement.count} ${requirement.rarity || requirement.tier}${requirement.preferCommon ? " (common first)" : ""}`).join(" + ")}`).join("; ");
        log(`Player Pick scan: using scanned metadata for configured Loop ${loopId} (Set #${loopDef.sbcSetIds?.[0] || "?"}, reward #${loopDef.pickItemResourceIds?.[0] || "?"}, select ${loopDef.pickCount}/${loopDef.pickCandidateCount}; ${ratios})`);
      }
      for (const diagnostic of session.overrideDiagnostics) log(`Player Pick scan: override skipped: ${diagnostic}`);
      for (const loopDef of state.discoveredLoopDefs) {
        const ratios = (loopDef.challengeRequirements || [loopDef.requirements || []]).map((requirements, index) => `challenge ${index + 1}: ${(requirements || []).map((requirement) => `${requirement.count} ${requirement.rarity || requirement.tier}${requirement.preferCommon ? " (common first)" : ""}`).join(" + ")}`).join("; ");
        log(`Player Pick scan: added session Loop ${loopDef.name} (Set #${loopDef.sbcSetIds?.[0] || "?"}, reward #${loopDef.pickItemResourceIds?.[0] || "?"}, select ${loopDef.pickCount}/${loopDef.pickCandidateCount}; ${ratios}${loopDef.discoveryReportedCompleted ? "; reported completed, one runtime probe" : ""})`);
      }
      log(`Player Pick scan complete: ${summary.pickSets} Pick Set(s) found among ${summary.setsScanned} SBC Set(s); ${state.discoveredLoopDefs.length} supported session Loop(s) added, ${Object.keys(state.discoveredLoopOverrides).length} configured Loop(s) using scanned metadata, ${duplicateCount} static/discovered duplicate(s) skipped`);
      return summary;
    }
    async function findAvailableSbcChallenge(set, label = set?.name || "SBC") {
      const challenges = await requestSbcChallenges(set, label);
      return challenges.find((c) => !isCompletedChallenge(c)) || null;
    }
    async function openSbcSet(set, options = {}) {
      const challenge = options.challenge || await findAvailableSbcChallenge(set, set.name);
      if (!challenge) {
        if (options.returnNullIfComplete) return null;
        fail2(`No available challenge for ${set.name}`);
      }
      const controller = ctrl();
      const load = await observeOnce(
        eaSbcAdapter().loadChallenge(challenge),
        controller,
        3e4,
        `loadChallenge ${challenge.id}`
      );
      if (!load?.success) fail2(`Challenge load failed for ${set.name}`);
      try {
        const localChallenge = set.getChallenge?.(challenge.id);
        if (localChallenge && !localChallenge.squad) localChallenge.update?.(challenge);
      } catch {
      }
      const nav = navController();
      if (!nav) fail2("Navigation controller not found");
      const vc = eaSbcAdapter().createSquadController();
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
      return adapters.dom.click(el);
    }
    function findButtonByText(patterns) {
      return adapters.dom.findButtonByText(patterns, matchesAny);
    }
    function clickButtonByText(patterns) {
      const btn = findButtonByText(patterns);
      if (!btn) return false;
      return simulateClick(btn);
    }
    function findClickableByText(patterns, root = document) {
      return adapters.dom.findClickableByText(patterns, matchesAny, root);
    }
    function simulateKeyStroke(key = "Alt", code = "AltRight", options = {}) {
      adapters.dom.keyStroke(key, code, options);
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
      return adapters.dom.compactText(el);
    }
    function isClickableElement(el) {
      return adapters.dom.isClickable(el);
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
        const formation = eaSbcAdapter().formation(challenge?.formation);
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
    function expectedSbcPlayerCount(loopDef = {}, challenge = null) {
      const values = [];
      const explicit = Number(loopDef.expectedPlayerCount || 0);
      if (Number.isFinite(explicit) && explicit > 0) values.push(explicit);
      if (loopDef.inventoryFillFirst === true) {
        const requirementCount2 = sumRequirementPlayerCount(loopDef);
        if (requirementCount2 > 0) values.push(requirementCount2);
      }
      if (challenge) {
        const required2 = getRequiredPlayerCount(challenge);
        if (Number.isFinite(required2) && required2 > 0) values.push(required2);
      }
      return values.length ? Math.max(...values) : 0;
    }
    function sortSbcFodder(items, spec = {}, settings = getFsuSettings()) {
      return [...items].sort((a, b) => {
        if (settings.priorityNonSpecialPlayers && isSpecial2(a) !== isSpecial2(b)) {
          return Number(isSpecial2(a)) - Number(isSpecial2(b));
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
      const definitionId2 = Number(item?.definitionId || 0);
      if (!isPlayer2(item)) reasons.push("not-player");
      if (id && state.consumedItemIds.has(id)) reasons.push("consumed-this-run");
      if (id && options.protectedItemIds?.some((value) => Number(value) === id)) reasons.push("protected-id");
      if (definitionId2 && options.protectedDefinitionIds?.some((value) => Number(value) === definitionId2)) reasons.push("protected-def");
      if (options.protectHighGold && isProtectedHighGold(item, resolveProtectHighGoldThreshold(options))) {
        reasons.push("protected-high-gold");
      }
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
      if (spec.playerOnly && !isPlayer2(item)) reasons.push("not-player");
      if (spec.minRating !== void 0 && rating < Number(spec.minRating)) reasons.push(`rating-under-${Number(spec.minRating)}`);
      if (spec.maxRating !== void 0 && rating > Number(spec.maxRating)) reasons.push(`rating-over-${Number(spec.maxRating)}`);
      if (spec.blockTradeable === true && isTradeable(item) && !isNormalGoldFodder(item)) reasons.push("tradeable-blocked");
      if (spec.special === true && !isSpecial2(item)) reasons.push("not-special");
      if (spec.special === false && isSpecial2(item)) reasons.push("special-blocked");
      if (spec.special !== true && spec.allowSpecial !== true && isSpecial2(item)) reasons.push("special-blocked");
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
      const definitionId2 = Number(signal?.definitionId || signal?.ref?.definitionId || 0);
      const duplicateId = Number(signal?.duplicateId || 0);
      const candidates = getSubmissionCacheItems().filter((item) => Number(item?.id || 0) === duplicateId || Number(item?.definitionId || 0) === definitionId2).map((item) => {
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
        definitionId: definitionId2,
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
      const inventoryAdapter = adapters.inventory();
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
    function parseRatingSbcChallenge2(loopDef, challenge) {
      return parseRatingSbcChallenge({
        loopDef,
        challenge,
        requiredPlayerCount: expectedSbcPlayerCount(loopDef, challenge) || getRequiredPlayerCount(challenge),
        eligibilityKeyName: (key) => eaSbcAdapter().eligibilityKeyName(key),
        isBronze,
        isSilver,
        isGold,
        isSpecialItem: isSbcSpecialItem,
        itemGroupNumbers,
        itemLeagueId: itemLeagueId2,
        requiredSpecialLabel,
        isRequiredSpecialItem
      });
    }
    function validateRatingSbcModelAgainstItems2(model, items = [], challenge = null) {
      return validateRatingSbcModelAgainstItems(model, items, challenge, {
        calculateSquadRating: calculateEaSquadRating,
        isSpecialItem: isSbcSpecialItem
      });
    }
    function logRatingSbcValidation(loopDef, label, validation, model) {
      log(`${loopDef.name}: ${label} rating ${validation.rating}/${model.targetRating}, players ${validation.players.length}/${model.requiredPlayerCount}, special ${validation.specialCount}/${model.maxSpecialCount}, unique definitions ${validation.uniqueDefinitionCount}/${validation.players.length}`);
      validation.constraintResults.forEach(({ constraint, matched, required: required2 }) => {
        log(`${loopDef.name}: ${label} constraint ${constraint.label}: ${matched}/${required2}`);
      });
      if (validation.challengeReady !== null) {
        log(`${loopDef.name}: ${label} local challenge.meetsRequirements(): ${validation.challengeReady ? "true" : "false"}`);
      }
      validation.errors.forEach((error) => log(`${loopDef.name}: ${label} validation failed: ${error}`));
    }
    function isRatingSbcCandidateSafe(item, loopDef, model = null, context = null) {
      const allowedSpecialCount = model ? model.maxSpecialCount : Math.max(0, Number(loopDef.allowedSpecialCount || 0) || 0);
      if (!isPlayer2(item)) return false;
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
      if (!isDuplicate(item) || !isPlayer2(item)) return false;
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
      const settings = getFsuSettings();
      const piles = applyFsuPilePriority(
        loopDef.ratingSbcFill?.priorityPiles || loopDef.priorityPiles || ["unassigned", "storage", "transfer", "club"],
        settings
      );
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
      return buildRatingCandidateEntries({
        model,
        settings,
        piles,
        getPileItems: getPileItemsByName,
        submissionItems: getSubmissionCacheItems(),
        isSafe: (item) => isRatingSbcCandidateSafe(item, loopDef, model, context),
        isDuplicate,
        pileNeedsDuplicateSignalResolution,
        sortFodder: sortSbcFodder,
        isSpecialItem: isSbcSpecialItem,
        broadSpec
      });
    }
    function ratingSelectionItemSnapshot(item, pileName) {
      return createItemSnapshot({
        id: item?.id,
        definitionId: item?.definitionId,
        type: isPlayer2(item) ? "player" : item?.type,
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
      return selectRatingCandidateEntries({
        candidateEntries,
        model,
        piles,
        searchOptions: options,
        createSnapshot: ratingSelectionItemSnapshot,
        selectPlayers: selectInventoryPlayers2,
        control: {
          shouldStop: () => state.stopping,
          yieldControl: () => sleep(0)
        }
      });
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
        const itemId2 = Number(item?.id || 0);
        if (!transferIds.has(itemId2)) return item;
        const resolved = findSubmissionItemForDuplicateSignal(item, usedIds);
        if (!resolved) {
          const name = item?.name || item?.lastName || item?.definitionId || itemId2 || "unknown";
          fail2(`${loopDef.name}: transfer item ${name} cannot be resolved to a club/storage duplicate for SBC submit`);
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
        const formation = eaSbcAdapter().formation(challenge?.formation);
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
      if (!squad) fail2(`${label}: squad object not found`);
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
        fail2(`${label}: saveChallenge failed: ${code}${msg ? ` ${msg}` : ""}${playerSummary ? `; players ${playerSummary}` : ""}`);
      }
      if (eaSbcAdapter().canLoadChallengeData()) {
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
        prepareRuntimeAccess: prepareFsuRuntimeAccess,
        preSaveValidators: options.preSaveValidators || [],
        saveSquad: async ({ challenge: targetChallenge, players: targetPlayers }) => {
          await saveChallengeSquad(targetChallenge, targetPlayers, label, options);
        },
        readSavedPlayers: async ({ challenge: targetChallenge }) => getSquadItems(targetChallenge?.squad || ctrl()?._squad),
        postSaveValidators: options.postSaveValidators || []
      });
      if (result.status !== "prepared") fail2(`${label}: squad preparation failed: ${result.reason || result.status}`);
      return result;
    }
    async function showUnassignedIfAny(reason = "final confirmation", options = {}) {
      return confirmUnassignedView({
        reason,
        openUnassigned: () => pageRuntime.gotoUnassigned(ctrl()),
        clickFallback: () => clickButtonByText([
          "Unassigned Items",
          "Unassigned",
          "Assign Items",
          "\u672A\u5206\u914D",
          "\u672A\u5206\u914D\u7269\u54C1",
          "\u5206\u914D\u7269\u54C1"
        ]),
        waitLoadingEnd,
        refreshUnassigned,
        getItems: getUnassignedItems,
        stableEmptyReads: options.stableEmptyReads || 1,
        emptyReadDelayMs: options.emptyReadDelayMs || 0,
        diagnostic: options.diagnostic === true,
        getControllerName: currentControllerName,
        sleep,
        log
      });
    }
    async function unwindSbcSquadControllers2(label, maxPops = 20) {
      return unwindSbcSquadControllers({
        label,
        maxPops,
        currentController: ctrl,
        currentControllerName,
        popController: (animated) => pageRuntime.popViewController(animated),
        waitLoadingEnd,
        sleep,
        log
      });
    }
    async function syncAfterSbcSubmit(label) {
      return synchronizeAfterSbcSubmit({
        label,
        currentControllerName,
        unwind: unwindSbcSquadControllers2,
        showUnassigned: showUnassignedIfAny,
        openStorePacks: openStorePacksViewForRefresh,
        log
      });
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
        const shieldShowing = pageRuntime.loadingShieldShowing();
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
      const provisionalAccess = fsuAdapter().readiness().state === "provisional";
      if (provisionalAccess) fsuAdapter().beginProvisionalClubAccess();
      try {
        const requireSubmitReady = options.requireSubmitReady !== false;
        const squad = await waitFor(() => ctrl()?._squad, 15e3, "SBC squad object");
        patchFsuLengthSafePlayerMetadata(`${label} before FSU fill`);
        const fsuRepeatFillTexts = ["\u91CD\u590D\u7403\u5458\u586B\u5145\u9635\u5BB9", "\u91CD\u8907\u7403\u54E1\u586B\u5145\u9663\u5BB9", "Repeat player fill squad"];
        const fsuOneClickFillTexts = ["\u4E00\u952E\u5B8C\u6210", "\u4E00\u9375\u5B8C\u6210", "\u4E00\u952E\u586B\u5145", "\u4E00\u9375\u586B\u5145", "One-click fill"];
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
        if (clickButtonByText(fsuRepeatFillTexts)) {
          log("Clicked duplicate fill");
          await waitLoadingEnd();
          await sleep(CFG.pauseMs);
        }
        if (clickButtonByText(fsuOneClickFillTexts)) {
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
        if (!findSubmitButton() && getFilledSquadSlots(squad) === 0 && clickButtonByText(fsuOneClickFillTexts)) {
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
        if (!submitReady && filled === 0) {
          log(`${label}: FSU did not place any players after the supported fill attempts; no squad was saved and no SBC was submitted. Check the FSU fill overlay and its lock/rarity/range settings.`);
        }
        if (!submitReady && requireSubmitReady) fail2(`${label} squad is not complete`);
        return { squad, filled, submitReady };
      } finally {
        if (provisionalAccess) fsuAdapter().endProvisionalClubAccess();
      }
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
      return isSpecial2(item) || isTotwItem(item) || isTotsItem(item) || isFofItem(item);
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
    function summarizeRequiredSpecialEntries(entries, limit = 3) {
      return entries.slice(0, limit).map(
        ({ item, pileName }) => `${itemDisplayName(item)} rating:${Number(item?.rating || 0) || "?"} ${requiredSpecialTypeLabel(item)} from:${pileName} id:${Number(item?.id || 0) || "?"}`
      ).join("; ");
    }
    async function waitForSubmittableRequiredSpecialEntries(loopDef = {}, required2 = 1, label = "required special cache sync") {
      const attempts = 4;
      let entries = [];
      for (let attempt = 1; attempt <= attempts; attempt++) {
        if (attempt > 1) {
          await sleep(900 * attempt);
          await refreshInventoryCaches(`${loopDef.name} ${label} ${attempt}/${attempts}`, { includePacks: false, quiet: true });
        }
        resolveRecentRewardItems(`${loopDef.name} ${label} ${attempt}/${attempts}`);
        entries = sortRequiredSpecialEntriesForSubmit(getSubmittableRequiredSpecialEntries(loopDef));
        if (entries.length >= required2) return entries;
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
      if (!isPlayer2(item)) reasons.push("not-player");
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
          if (!id || seen.has(id) || !isPlayer2(item)) continue;
          seen.add(id);
          if (!isSbcSpecialItem(item) && !isSpecial2(item)) continue;
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
        if (!item || !isPlayer2(item)) continue;
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
      if (!isPlayer2(item)) return false;
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
          const definitionId2 = Number(item?.definitionId || 0);
          if (definitionId2 && usedDefinitionIds.has(definitionId2)) continue;
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
      const itemId2 = Number(item?.id || 0);
      if (itemId2 && itemId2 === keepTotwId) return false;
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
          const definitionId2 = Number(item?.definitionId || 0);
          return !definitionId2 || !usedDefinitionIds.has(definitionId2);
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
          const definitionId3 = Number(item?.definitionId || 0);
          return !definitionId3 || !usedDefinitionIds.has(definitionId3);
        });
        if (!filler) return null;
        const fillerIndex = fillers.indexOf(filler);
        if (fillerIndex >= 0) fillers.splice(fillerIndex, 1);
        players.push(filler.item);
        usedIds.add(Number(filler.item?.id || 0));
        const definitionId2 = Number(filler.item?.definitionId || 0);
        if (definitionId2) usedDefinitionIds.add(definitionId2);
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
      await unwindSbcSquadControllers2(`${loopDef.name} before ${upgradeDef.name}`);
      log(`${loopDef.name}: safe rating fodder exhausted; submitting ${upgradeDef.name} ${attempt}/${maxAttempts} before retrying 84x10`);
      const result = await runFillAndVerifyLoop(upgradeDef);
      await unwindSbcSquadControllers2(`${loopDef.name} after ${upgradeDef.name}`);
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
      const required2 = Math.max(1, Number(loopDef.requiredSpecialCount || 1) || 1);
      await refreshInventoryCaches(`${loopDef.name} ${requiredSpecialLabel(loopDef)} preflight`, { includePacks: false, quiet: true });
      resolveRecentRewardItems(`${loopDef.name} ${requiredSpecialLabel(loopDef)} preflight`);
      let entries = sortRequiredSpecialEntriesForSubmit(getSubmittableRequiredSpecialEntries(loopDef));
      if (entries.length >= required2) {
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
        entries = await waitForSubmittableRequiredSpecialEntries(loopDef, required2, "post-existing TOTW pack");
        if (entries.length >= required2) {
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
      entries = await waitForSubmittableRequiredSpecialEntries(loopDef, required2, "post-TOTW craft");
      if (entries.length < required2) {
        fail2(`${loopDef.name}: ${upgradeDef.name} completed/opened but no eligible ${requiredSpecialLabel(loopDef)} card was detected for 84x10; check the reward item log and inventory state`);
      }
      log(`${loopDef.name}: auto ${requiredSpecialLabel(loopDef)} ready: ${summarizeRequiredSpecialEntries(entries)}`);
      return true;
    }
    function getSbcProtectionReasons(item, loopDef = {}, context = {}) {
      const reasons = [];
      const rating = Number(item?.rating || 0);
      const itemId2 = Number(item?.id || 0);
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
      if (itemId2 && state.consumedItemIds.has(itemId2)) reasons.push("consumed-this-run");
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
      if (protectedIds.has(itemId2)) reasons.push("protected-id");
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
        const itemId2 = Number(item?.id || 0) || "?";
        const definitionId2 = Number(item?.definitionId || 0) || "?";
        const ratingLimit = getSubmittedRatingLimit(item, loopDef);
        const prefix = `slot ${index + 1} ${name} rating:${rating} id:${itemId2} def:${definitionId2}`;
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
      if (!inspection.items.length) fail2(`${loopDef.name}: no squad items detected after fill`);
      if (inspection.missingRequirements?.length) {
        logManualSbcFixHints(loopDef, inspection);
        fail2(`${loopDef.name}: missing squad requirement(s): ${inspection.missingRequirements.join(", ")}`);
      }
      if (!inspection.blocked.length) return;
      logManualSbcFixHints(loopDef, inspection);
      const summary = inspection.blocked.slice(0, 10).map(({ item, index, reasons }) => `${index + 1}. ${itemDisplayName(item)} rating:${Number(item?.rating || 0) || "?"} (${reasons.join(",")})`).join("; ");
      fail2(`${loopDef.name}: protected squad item(s) detected; stop before submit: ${summary}`);
    }
    function failIfSbcSubmitError(label = "SBC submit") {
      const error = sbcRewardOverlay.findSubmitError();
      if (!error) return false;
      sbcRewardOverlay.dismissSubmitError(error);
      fail2(`${label}: submit blocked by EA modal: ${error.text}`);
    }
    async function fillBronzeUpgradeSquad() {
      await fillSbcSquad("Bronze Upgrade");
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
      return claimSbcRewards({
        label,
        beforePackCounts: options.beforePackCounts,
        beforeProgress: options.beforeProgress,
        overlay: sbcRewardOverlay,
        getPackCounts: getPackCountsById,
        getProgress: () => getSbcProgressSnapshot(options.set),
        refreshPacks: refreshStorePacks,
        popupShieldShowing: () => pageRuntime.popupShieldShowing(),
        click: simulateClick,
        keyStroke: simulateKeyStroke,
        waitLoadingEnd,
        sleep,
        stopPoint,
        failIfSubmitError: failIfSbcSubmitError,
        log
      });
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
    async function applyPlayersToRatingChallenge(challenge, players, label = "rating SBC") {
      const squad = challenge?.squad;
      if (!squad) fail2(`${label}: challenge squad missing while applying background players`);
      const list = Array.isArray(players) ? players.filter(Boolean) : [];
      if (!list.length) fail2(`${label}: no players available to apply before background submit`);
      const playerList = buildSquadPlayerList(challenge, list);
      try {
        squad.removeAllItems?.();
      } catch {
      }
      squad.setPlayers(playerList, true);
      return list;
    }
    async function submitRatingSbcInBackground(set, challenge, label = set?.name || "rating SBC", options = {}) {
      const beforePackCounts = getPackCountsById();
      const players = Array.isArray(options.players) ? options.players.filter(Boolean) : [];
      const maxAttempts = Math.max(1, Math.min(5, Number(options.maxAttempts || 3) || 3));
      let currentChallenge = challenge;
      let lastDetail = "unknown";
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        let canSubmit = true;
        if (players.length) {
          try {
            await applyPlayersToRatingChallenge(currentChallenge, players, `${label} attempt ${attempt}`);
          } catch (error) {
            lastDetail = error?.message || String(error);
            if (attempt >= maxAttempts) fail2(`${label}: ${lastDetail}`);
            log(`${label}: could not apply background squad before submit attempt ${attempt}/${maxAttempts}: ${lastDetail}`);
            await sleep(Math.min(3e3, (Number(CFG.pauseMs) || 800) + attempt * 500));
            try {
              currentChallenge = await loadRatingSbcChallenge(currentChallenge, `${label} submit-retry`, { force: true }) || currentChallenge;
            } catch (reloadError) {
              log(`${label}: challenge reload after apply failure: ${reloadError?.message || reloadError}`);
            }
            continue;
          }
        }
        try {
          canSubmit = currentChallenge?.canSubmit?.() !== false;
        } catch {
        }
        if (!canSubmit) {
          lastDetail = "challenge model rejected the background squad before submit";
          if (attempt >= maxAttempts) fail2(`${label}: ${lastDetail}`);
          log(`${label}: ${lastDetail}; reloading before retry (${attempt}/${maxAttempts})`);
        } else {
          const { skipValidation, chemistryEnabled } = eaSbcAdapter().submissionOptions();
          log(`Submitting SBC in background: ${set.name}${attempt > 1 ? ` (retry ${attempt}/${maxAttempts})` : ""}`);
          const result = await observeOnce(
            eaSbcAdapter().submitChallenge(currentChallenge, set, { skipValidation, chemistryEnabled }),
            ctrl(),
            45e3,
            `submitChallenge ${label}`
          );
          if (result?.success) {
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
          lastDetail = serviceResultErrorText(result) || result?.status || "unknown";
          const plan = planBackgroundSubmitRetry({
            attempt,
            maxAttempts,
            detail: lastDetail,
            baseDelayMs: Number(CFG.pauseMs) || 800
          });
          if (!plan.retry) {
            fail2(`${label}: background submit failed: ${lastDetail}`);
          }
          log(`${label}: background submit returned ${lastDetail}; reloading challenge before retry (${attempt}/${maxAttempts})`);
          await sleep(plan.delayMs);
        }
        try {
          const reloaded = await loadRatingSbcChallenge(currentChallenge, `${label} submit-retry`, { force: true });
          if (reloaded) currentChallenge = reloaded;
          else {
            const next = await findAvailableRatingSbcChallenge(set, `${label} submit-retry`);
            if (next) {
              currentChallenge = await loadRatingSbcChallenge(next, `${label} submit-retry`, { force: true }) || next;
            }
          }
        } catch (error) {
          log(`${label}: challenge reload after submit conflict failed: ${error?.message || error}`);
        }
        if (!canSubmit && attempt < maxAttempts) {
          await sleep(Math.min(3e3, (Number(CFG.pauseMs) || 800) + attempt * 500));
        }
      }
      fail2(`${label}: background submit failed after ${maxAttempts} attempt(s): ${lastDetail}`);
    }
    async function openRewardSilverPack(packId2) {
      await refreshStorePacks();
      let pack = findPackById(packId2);
      if (!pack) pack = findPackByName(CFG.silverRewardNames);
      if (!pack) {
        const names = getMyPacks().map((p) => `${packName(p)} (#${p.id})`).join(", ");
        fail2(`Silver reward pack not found. Current my packs: ${names || "none"}`);
      }
      await openPack(pack, "Bronze Upgrade reward", {
        openedItemPolicy: createOpenedItemPolicy(async (openedItems) => {
          const silverCount = openedItems.filter((item) => isPlayer2(item) && isSilver(item)).length;
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
          assumeSpecialPlayers: options.assumeTotwReward === true,
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
      const selection = options.selection || null;
      const attempt = await submitSbcAttempt({
        label: loopDef.name,
        challengeProvider: async () => {
          const set = await findSbcSet(loopDef.sbcNames, loopDef.name);
          return openSbcSet(set, { returnNullIfComplete: options.returnNullIfComplete });
        },
        squadProvider: selection ? createInventorySquadProvider({
          selection,
          prepareSelection: async (_context, inputSelection) => prepareInventorySelection(loopDef, inputSelection),
          itemRef: liveItemRef
        }) : createFsuFillProvider({
          fill: async () => fillSbcSquad(loopDef.name),
          getPlayers: async ({ challenge }) => getSquadItems(ctrl()?._squad || challenge?.squad),
          itemRef: liveItemRef
        }),
        prepareRuntimeAccess: prepareFsuRuntimeAccess,
        saveSquad: async ({ challenge, players, runtimeAccess }) => {
          if (!selection && !runtimeAccess?.refreshedClubPlayers) return;
          const reason = selection ? "inventory selection" : "provisional Club refresh";
          if (selection) log(`${loopDef.name}: applying inventory selection before submit`);
          else log(`${loopDef.name}: applying freshly validated Club entities before submit`);
          await saveChallengeSquad(challenge, players, `${loopDef.name} ${reason}`);
        },
        preSaveValidators: [({ challenge, players }) => {
          const inspection = selection ? inspectSbcItems(loopDef, players, { expectedPlayerCount: expectedSbcPlayerCount(loopDef, challenge) }) : inspectSbcSquad(loopDef, ctrl()?._squad || challenge?.squad);
          logSbcSquadInspection(loopDef, inspection);
          assertSbcSquadSafe(loopDef, inspection);
          return true;
        }],
        readSavedPlayers: selection ? async ({ challenge }) => getSquadItems(challenge?.squad || ctrl()?._squad) : void 0,
        postSaveValidators: selection ? [({ challenge }) => {
          const inspection = inspectSbcSquad(loopDef, challenge?.squad || ctrl()?._squad);
          logSbcSquadInspection(loopDef, inspection);
          assertSbcSquadSafe(loopDef, inspection);
          return true;
        }] : [],
        isSubmitReady: async () => !!findSubmitButton(),
        submitTransport: async ({ set }) => ({
          submitted: true,
          rewardPackId: await submitSbcAndGetAwardPackId(set)
        }),
        afterSubmit: selection ? async ({ players, savedPlayers, squadPlan }) => finalizeSubmittedInventorySelection(
          squadPlan?.selection || selection,
          loopDef.name,
          savedPlayers?.length ? savedPlayers : players
        ) : void 0
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
    async function selectDailySeedInventory(loopDef) {
      const { requirement, priorityPiles } = createSingleCardSelectionRequirement(
        loopDef,
        loopDef.targetDuplicate
      );
      await refreshInventoryCaches(`${loopDef.name} seed inventory selection`, { includePacks: false, quiet: true });
      return {
        requirement,
        selection: selectInventoryPlayers3([requirement], priorityPiles)
      };
    }
    function itemRefMatchesAny(item, refs = []) {
      const id = Number(item?.id || item?.ref?.id || 0);
      if (id) return refs.some((ref) => Number(ref?.id || 0) === id);
      const definitionId2 = Number(item?.definitionId || item?.ref?.definitionId || 0);
      return definitionId2 > 0 && refs.some((ref) => !Number(ref?.id || 0) && Number(ref?.definitionId || 0) === definitionId2);
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
    async function reconcileSubmittedDuplicateSignals(selection, label, submittedItems = []) {
      const selectedSignalRefs = selectedUnassignedSignalRefs(selection);
      if (!selectedSignalRefs.length) return 0;
      const submittedIds = (submittedItems || []).map((item) => Number(item?.id || item?.ref?.id || 0)).filter(Boolean);
      if (!submittedIds.length) {
        log(`${label}: could not confirm submitted item IDs for ${selectedSignalRefs.length} Unassigned duplicate signal(s); preserving them for the next inventory refresh`);
        return 0;
      }
      const consumedSignalRefs = submittedUnassignedSignalRefs(selection, submittedItems);
      if (!consumedSignalRefs.length) return 0;
      rememberConsumedDuplicateSignals(consumedSignalRefs);
      log(`${label}: consumed ${consumedSignalRefs.length} Unassigned duplicate signal(s) by submitting their matching Club/Storage item(s)`);
      await refreshInventoryCaches(`${label} post-submit duplicate sync`, { includePacks: false, quiet: true });
      clearConsumedDuplicateSignals(consumedSignalRefs, label);
      return consumedSignalRefs.length;
    }
    async function finalizeSubmittedInventorySelection(selection, label, players = []) {
      const submittedPlayers = (players || []).filter((item) => Number(item?.id || 0));
      if (!submittedPlayers.length) {
        log(`${label}: submitted squad item IDs are unavailable; preserving inventory and Unassigned duplicate state for refresh`);
        return;
      }
      markSbcItemsConsumed(submittedPlayers, label);
      await reconcileSubmittedDuplicateSignals(selection, label, submittedPlayers);
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
      const triggerCoverage = evaluateRecoveryTriggerSelection(recipe2, policy, selection, triggerRefs);
      if (!triggerCoverage.sufficient) {
        const triggerItems = triggerRefs.map((ref) => getUnassignedItems().find((item) => itemRefMatchesAny(item, [ref]))).filter(Boolean);
        logDuplicateSignalDiagnostics(
          label,
          triggerItems,
          selectionRequirements(recipe2, piles)[0] || {},
          selection
        );
        return {
          status: "blocked",
          reason: `selection resolved ${triggerCoverage.selectedCount}/${triggerCoverage.expectedCount} expected blocked duplicate signal(s) for ${triggerCoverage.capacity} matching recipe slot(s); diagnostic logged before submit`
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
          await moveItems(directClub, inventoryPile("club"), true);
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
      const inventoryOnly = loopDef.inventoryOnly === true;
      if (inventoryOnly) {
        const tier = String(loopDef.targetDuplicate?.tier || "target");
        log(`${loopDef.name}: inventory-only mode; ${tier} packs will remain unopened and SBCs will use current inventory`);
      }
      const result = await runRecycleWorkflow({
        maxCompletions: Number(loopDef.maxCompletions || 7),
        packOpeningEnabled: !inventoryOnly,
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
          const selection = selectInventoryPlayers3([
            { ...loopDef.targetDuplicate, count: 1, priorityPiles: ["unassigned"] }
          ], ["unassigned"], {
            preferredSignalRefs: targets.map((item) => liveItemRef(item, "unassigned"))
          });
          if (!selection.ok) {
            logSelectionDiagnostics(`${loopDef.name} target duplicate`, selection, ["unassigned"]);
            return { status: "blocked", reason: "target Unassigned duplicate cannot be resolved to a submit-ready Club/Storage item" };
          }
          return await submitConfiguredSbc(loopDef, { returnNullIfComplete: true, selection }) || {
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
            const { requirement: requirement2, selection: selection2 } = await selectDailySeedInventory(loopDef);
            logDryRunSelection(`${loopDef.name} seed inventory`, selection2, { priorityPiles: requirement2.priorityPiles });
            if (!selection2.ok) {
              return { status: "blocked", reason: "no FSU-compatible daily seed player is available" };
            }
            const reason2 = inventoryOnly ? "inventory-only mode" : "no target duplicate or reward pack";
            log(`${loopDef.name}: dry-run ${reason2}; seed SBC available ${set.name} (#${set.id || "?"}) challenge #${challenge.id || "?"}`);
            return { status: "planned", reason: "would submit seed SBC" };
          }
          const reason = inventoryOnly ? "inventory-only mode" : "no target duplicate or reward pack";
          const { requirement, selection } = await selectDailySeedInventory(loopDef);
          log(`${loopDef.name}: seed inventory selected ${selection.selected.length}/1 player(s) (${formatSelectionStats(selection.stats)})`);
          if (!selection.ok) {
            logSelectionDiagnostics(`${loopDef.name} seed inventory`, selection, requirement.priorityPiles);
            return { status: "blocked", reason: "no FSU-compatible daily seed player is available" };
          }
          log(`${loopDef.name}: ${reason}; submitting seed SBC ${current.completions + 1}/${loopDef.maxCompletions}`);
          return await submitConfiguredSbc(loopDef, { returnNullIfComplete: true, selection }) || {
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
        openFinalReward: !inventoryOnly && loopDef.openRewardPacks === true ? async ({ rewardPackId }) => {
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
        const saved = adapters.localStorage.getJson(LOOP_UI_OPTIONS_KEY, {});
        return {
          showMvpLoops: saved.showMvpLoops === true,
          inventoryOnly: saved.inventoryOnly === true || saved.dailyRecycleInventoryOnly === true
        };
      } catch {
        return { showMvpLoops: false, inventoryOnly: false };
      }
    }
    function saveLoopUiOptions() {
      state.showMvpLoops = document.querySelector("#bronze-loop-show-mvp")?.checked === true;
      const inventoryOnly = document.querySelector("#bronze-loop-daily-inventory-only")?.checked === true;
      try {
        adapters.localStorage.setJson(LOOP_UI_OPTIONS_KEY, {
          showMvpLoops: state.showMvpLoops,
          inventoryOnly
        });
      } catch {
      }
      renderLoopSelect();
    }
    function getPickRuntimeOptions() {
      return normalizePickRuntimeOptions({
        protectHighGold: document.querySelector("#bronze-loop-pick-protect-high-gold")?.checked !== false,
        autoSelectBelow90: document.querySelector("#bronze-loop-pick-auto-below-90")?.checked !== false,
        preferScannedMetadata: document.querySelector("#bronze-loop-pick-prefer-scanned")?.checked === true,
        openPicksAtEnd: document.querySelector("#bronze-loop-pick-open-at-end")?.checked === true,
        highGoldThreshold: document.querySelector("#bronze-loop-pick-high-gold-threshold")?.value,
        autoPickThreshold: document.querySelector("#bronze-loop-pick-auto-threshold")?.value
      });
    }
    function loadPickRuntimeOptions() {
      try {
        return normalizePickRuntimeOptions(adapters.localStorage.getJson(PICK_OPTIONS_KEY, {}));
      } catch {
        return normalizePickRuntimeOptions();
      }
    }
    function savePickRuntimeOptions() {
      const options = getPickRuntimeOptions();
      try {
        adapters.localStorage.setJson(PICK_OPTIONS_KEY, options);
      } catch {
      }
      if (!options.preferScannedMetadata && Object.keys(state.discoveredLoopOverrides).length) {
        state.discoveredLoopOverrides = {};
        renderLoopSelect(document.querySelector("#bronze-loop-select")?.value || null);
        log("Player Pick scan: scanned metadata preference disabled; configured Pick Loops reverted to static fallback");
      }
    }
    function getRoutineStepLoopDefs(loopDef) {
      return resolveRoutineStepLoopDefs(loopDef, getLoopDefs());
    }
    function summarizeRoutineStepLimits2(steps) {
      return summarizeRoutineStepLimits(steps, {
        needsAutoTotwPreflight,
        getRoutineSteps: getRoutineStepLoopDefs
      });
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
      const configuredDailyLimit = Number(step?.dailyCompletionLimit || 0);
      if (!Number.isFinite(configuredDailyLimit) || configuredDailyLimit <= 0 || !step?.sbcNames?.length) return null;
      const set = await findSbcSet(step.sbcNames, step.name);
      const challenges = await requestSbcChallenges(set, step.name, { allowEmpty: true, attempts: 3 });
      const setComplete = isSbcSetComplete(set);
      const setRemaining = getDailySetRemaining(set);
      const setRepeats = Number(set?.repeats);
      const dailyLimit = Number.isFinite(setRepeats) && setRepeats > 0 ? Math.floor(setRepeats) : Math.floor(configuredDailyLimit);
      log(`${step.name}: daily preflight set #${set?.id ?? "?"} (${set?.name || "?"}) complete=${setComplete}, completed=${Number.isFinite(Number(set?.timesCompleted)) ? set.timesCompleted : "?"}, repeats=${Number.isFinite(Number(set?.repeats)) ? set.repeats : "?"}, remaining=${setRemaining === null ? "?" : setRemaining}${challenges.length ? `; challenges: ${describeDailyChallengeCounts(challenges)}` : ""}`);
      if (setComplete) {
        return { available: false, remaining: 0, completed: dailyLimit, dailyLimit, reason: "complete" };
      }
      if (!challenges.length) {
        return { available: false, remaining: null, completed: null, dailyLimit, reason: "unavailable" };
      }
      if (setRemaining === null) {
        return {
          available: true,
          remaining: null,
          completed: null,
          dailyLimit,
          safetyLimit: 100,
          reason: "unknown-count"
        };
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
      const limitSummary = summarizeRoutineStepLimits2(steps);
      log(`${loopDef.name}: running ${steps.length} step(s): ${steps.map((step) => step.name).join(" -> ")}`);
      log(`${loopDef.name}: step policy: ${limitSummary.text}`);
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
          const configured = configureRoutineStepForAvailability(step, availability);
          if (availability && availability.remaining !== null) {
            log(`${loopDef.name}: ${configured.name} daily progress ${availability.completed}/${availability.dailyLimit}; running up to ${configured.maxCompletions}`);
          } else if (availability) {
            log(`${loopDef.name}: ${configured.name} is available; completion count unavailable, running until the challenge is unavailable (safety cap ${configured.maxCompletions || 100})`);
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
    async function runWorkflowRoutine(loopDef) {
      await waitAppReady();
      const steps = getRoutineStepLoopDefs(loopDef);
      const limitSummary = summarizeRoutineStepLimits2(steps);
      log(`${loopDef.name}: running configurable workflow with ${steps.length} step(s): ${steps.map((step) => step.name).join(" -> ")}`);
      log(`${loopDef.name}: step policy: ${limitSummary.text}`);
      return runSequenceWorkflow({
        steps,
        stopPoint: () => stopPoint(),
        beforeStep: async ({ step }) => {
          if (step.dryRun) return { status: "ready" };
          const recovery = await recoverUnassignedOverflow(step, `${loopDef.name} step preflight`);
          if (recovery.status === "resolved") {
            log(`${loopDef.name}: ${step.name} overflow recovery completed before step`);
          }
          if (recovery.status === "blocked") return { status: "blocked", reason: recovery.reason };
          return { status: "ready" };
        },
        runStep: async ({ step }) => runConfiguredLoop(step, 1),
        afterStep: async () => sleep(CFG.pauseMs),
        onEvent: async (event, payload) => {
          if (event === "step-start") {
            log(`${loopDef.name}: step ${payload.index + 1}/${payload.total} ${payload.step.name}`);
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
      const model = parseRatingSbcChallenge2(loopDef, opened.challenge);
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
      const plannedModelValidation = validateRatingSbcModelAgainstItems2(model, prepared.selected || []);
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
      const savedModelValidation = validateRatingSbcModelAgainstItems2(model, inspection.items, opened.challenge);
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
        fail2(`${loopDef.name}: ${reason}`);
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
      const completionLimit4 = loopDef.allowMultipleCompletions === true ? 50 : 1;
      const maxCompletions = Math.max(1, Math.min(completionLimit4, Number(loopDef.maxCompletions || 1) || 1));
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
              log(`${loopDef.name}: rating shortage before automatic 2x84+ recovery: ${configuredFill.reason || "unknown reason"}`);
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
            log(`${loopDef.name}: submit not ready before automatic 2x84+ recovery (${inspection.items?.length || fillResult.filled || 0} filled)`);
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
          if (!fillResult.submitReady) fail2(`${loopDef.name}: submit is not ready after protection inspection`);
          const submitAttempt = await submitSbcAttempt({
            label: loopDef.name,
            challengeProvider: async () => opened,
            squadProvider: createExistingSquadProvider({
              getPlayers: async () => inspection.items,
              itemRef: liveItemRef,
              source: ratingSbcFill ? "rating-squad" : "filled-squad"
            }),
            prepareRuntimeAccess: prepareFsuRuntimeAccess,
            saveSquad: async ({ challenge, players, runtimeAccess }) => {
              if (ratingSbcFill || !runtimeAccess?.refreshedClubPlayers) return;
              log(`${loopDef.name}: applying freshly validated Club entities before submit`);
              await saveChallengeSquad(challenge, players, `${loopDef.name} provisional Club refresh`);
            },
            preSaveValidators: [() => {
              assertSbcSquadSafe(loopDef, inspection);
              if (shouldUseRatingSbcFill(loopDef)) {
                const finalModelValidation = validateRatingSbcModelAgainstItems2(configuredFill.model, inspection.items, opened.challenge);
                logRatingSbcValidation(loopDef, "final rating squad", finalModelValidation, configuredFill.model);
                if (!finalModelValidation.ok) {
                  fail2(`${loopDef.name}: final rating squad failed dynamic requirement validation: ${finalModelValidation.errors.join(", ")}`);
                }
              }
              return true;
            }],
            isSubmitReady: async () => fillResult.submitReady === true,
            submitTransport: async (context) => ({
              submitted: true,
              rewardPackId: ratingSbcFill ? await submitRatingSbcInBackground(context.set, context.challenge, loopDef.name, {
                players: context.players || inspection.items || []
              }) : await submitSbcAndGetAwardPackId(context.set)
            }),
            afterSubmit: async ({ players, savedPlayers, squadPlan }) => finalizeSubmittedInventorySelection(
              squadPlan?.selection || configuredFill.selection,
              loopDef.name,
              savedPlayers?.length ? savedPlayers : players
            )
          });
          if (!submitAttempt.submitted) {
            fail2(`${loopDef.name}: submit transaction blocked: ${submitAttempt.reason || submitAttempt.status}`);
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
        (field2) => target[field2] === void 0 || target[field2] === requirement?.[field2]
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
      return createOpenedItemPolicy(async (openedItems, context = {}) => {
        const { directDuplicateFallback = false, ...unassignedCleanupOptions } = cleanupOptions;
        const settlement = await settleOpenedItems({
          attempts: 3,
          materialize: async () => {
            const materialized = await materializeOpenedPlayerRewards(openedItems, label);
            await sleep(CFG.pauseMs);
            return materialized;
          },
          cleanup: async ({ attempt }) => resolveRuntimeUnassigned(
            attempt === 1 ? cleanupReason : `${cleanupReason} delayed response retry ${attempt}/3`,
            {
              ...unassignedCleanupOptions,
              beforeSnapshot: () => restoreOpenedUnassignedDuplicateMetadata(openedItems, label, {
                routingBaseline: context.routingBaseline || null
              })
            }
          ),
          confirmRouting: async () => confirmOpenedItemRouting(openedItems, label, {
            routingBaseline: context.routingBaseline || null
          }),
          onRetry: async ({ attempt, routing: routing2 }) => {
            log(`${label}: ${routing2.pendingItems.length} opened item(s) appeared after initial cleanup; retrying Unassigned settlement ${attempt + 1}/3`);
            await sleep(CFG.pauseMs);
            await showUnassignedIfAny(`${label} delayed materialization retry ${attempt + 1}/3`, {
              stableEmptyReads: 3,
              emptyReadDelayMs: 450,
              diagnostic: true
            });
          }
        });
        const fallback = settlement.status === "pending" && directDuplicateFallback ? await tryDirectlySettleUnmaterializedOpenedDuplicates({
          openedItems,
          materialized: settlement.materialized,
          routing: settlement.routing,
          label,
          routingBaseline: context.routingBaseline || null
        }) : null;
        const finalSettlement = fallback ? { ...settlement, ...fallback } : settlement;
        const cleanup = finalSettlement.cleanup || {};
        const routing = finalSettlement.routing || { reservedItems: [], routedItems: [], pendingItems: openedItems };
        return {
          ...routing,
          details: {
            cleanupStatus: finalSettlement.status === "pending" ? "preserved" : cleanup.status,
            cleanupReason: finalSettlement.reason || cleanup.reason || null,
            settlementAttempts: finalSettlement.attempts,
            blockedDestination: cleanup.plan?.blocked?.destination || null,
            blockedFree: cleanup.plan?.blocked?.free ?? null,
            blockedRequired: cleanup.plan?.blocked?.required ?? null,
            resolvedAliasCount: routing.aliasRoutes?.length || 0,
            directDuplicateFallback: fallback?.status || null
          }
        };
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
          await moveItems(directClub, inventoryPile("club"), true);
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
    async function runSupplyAndCraftLoop(loopDef, workflowOptions = {}) {
      await waitAppReady();
      const dryRun = loopDef.dryRun === true;
      const inventoryOnly = loopDef.inventoryOnly === true;
      const shortagePacks = inventoryOnly ? [] : loopDef.shortagePacks?.length ? loopDef.shortagePacks : loopDef.strategy === "commonGoldToRareUpgrade" ? [{
        requirement: { ...loopDef.requirements?.[0] || {} },
        packIds: loopDef.sourcePackIds || [],
        packNames: loopDef.sourcePackNames || [],
        maxOpensPerAttempt: 1,
        repeatUntilSatisfied: true,
        maxRuns: 100,
        routingPolicy: "reserveMatchingDuplicates"
      }] : [];
      if (inventoryOnly) {
        log(`${loopDef.name}: inventory-only mode; supply packs and reward packs will remain unopened`);
      }
      const primaryPiles = inventoryOnly ? loopDef.primaryPiles || loopDef.priorityPiles || ["unassigned", "storage", "transfer", "club"] : shortagePacks.length ? loopDef.primaryPiles || ["unassigned", "storage", "transfer"] : loopDef.priorityPiles || ["storage", "transfer", "club"];
      const fallbackPiles = loopDef.clubFallbackPiles || loopDef.priorityPiles || primaryPiles;
      const reservePrimaryUnassigned = primaryPiles.includes("unassigned") ? (item) => isDuplicateForLoopRequirements(item, loopDef) : null;
      const result = await runSupplyAndCraftWorkflow({
        maxCompletions: Number(loopDef.maxCompletions || 7),
        stopPoint: () => stopPoint(),
        beforeIteration: async () => {
          if (dryRun) return { preserveSupply: false };
          if (loopDef.preSelectionCleanup === false) return { preserveSupply: false };
          if (!shortagePacks.length && !reservePrimaryUnassigned) {
            await resolveRuntimeUnassigned(`${loopDef.name} pre-submit cleanup`);
            return { preserveSupply: false };
          }
          const cleanup = await resolveRuntimeUnassigned(`${loopDef.name} pre-submit cleanup`, {
            blockedPolicy: "preserve",
            reserveItem: reservePrimaryUnassigned
          });
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
          if (workflowOptions.skipFinalUnassignedCleanup === true) return;
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
    async function openMatchingRewardPacksUntilEmpty(loopDef, reason = "deferred reward pack") {
      const maxOpens = Math.max(1, Math.min(500, Number(loopDef.maxDeferredRewardPackOpens || 200) || 200));
      let opened = 0;
      let failures = 0;
      while (opened < maxOpens && failures < 3) {
        await stopPoint();
        await refreshStorePacks().catch(() => null);
        const pack = findRewardPackInCache(loopDef, null);
        if (!pack) break;
        log(`${loopDef.name}: opening deferred reward pack ${opened + 1}: ${packName(pack)} (#${pack.id})`);
        const ok = await openRewardPackAndCleanup(loopDef, pack.id, reason, {
          openAttempts: 2,
          findAttempts: 3,
          findDelayMs: 900
        });
        if (!ok) {
          failures += 1;
          markStalePack(pack, { gone: true });
          log(`${loopDef.name}: deferred reward pack open failed (${failures}/3); skipping #${pack.id}`);
          continue;
        }
        opened += 1;
        failures = 0;
        await sleep(CFG.pauseMs);
      }
      log(`${loopDef.name}: opened ${opened} deferred reward pack(s)${opened >= maxOpens ? " (hit safety cap)" : ""}`);
      return opened;
    }
    async function runInventoryExhaustionLoop(loopDef) {
      await waitAppReady();
      const openAtEnd = loopDef.openRewardPacksAtEnd === true;
      const shouldOpenAtEnd = openAtEnd && loopDef.openRewardPacks === true;
      if (openAtEnd) {
        log(`${loopDef.name}: reward packs deferred until stages finish${shouldOpenAtEnd ? "" : " (end open disabled by options)"}`);
      }
      log(`${loopDef.name}: exhausting stages in order: ${loopDef.stages.map((stage) => stage.name).join(" -> ")}`);
      const result = await runInventoryExhaustionWorkflow({
        stages: loopDef.stages,
        stopPoint: () => stopPoint(),
        runStage: async ({ stage }) => {
          const stageOpensRewards = stage.forceOpenRewardPacks === true || stage.openRewardPacks === true || !openAtEnd && loopDef.openRewardPacks === true;
          const stageDef = {
            ...cloneLoopDef(stage),
            strategy: "supplyAndCraft",
            dryRun: loopDef.dryRun === true,
            openRewardPacks: stageOpensRewards,
            forceOpenRewardPacks: stage.forceOpenRewardPacks === true,
            // Keep deferred end-open names on the parent loop only.
            rewardPackNames: stage.rewardPackNames?.length ? [...stage.rewardPackNames] : void 0,
            rewardPackIds: stage.rewardPackIds?.length ? [...stage.rewardPackIds] : void 0,
            disabledPiles: loopDef.disabledPiles?.length ? [...loopDef.disabledPiles] : void 0,
            preSelectionCleanup: false
          };
          applyDisabledPiles(stageDef);
          return runSupplyAndCraftLoop(stageDef, { skipFinalUnassignedCleanup: true });
        },
        onEvent: async (event, payload) => {
          if (event === "stage-start") {
            log(`${loopDef.name}: stage ${payload.index + 1}/${payload.total} ${payload.stage.name}`);
          } else if (event === "stage-complete") {
            const stageResult = payload.stageResult;
            if (stageResult.status === "insufficient") {
              log(`${loopDef.name}: ${payload.stage.name} exhausted; fewer than one complete safe squad remains`);
            } else if (stageResult.status === "unavailable") {
              log(`${loopDef.name}: ${payload.stage.name} unavailable; continuing to the next stage`);
            } else {
              log(`${loopDef.name}: ${payload.stage.name} finished with ${stageResult.completions || 0} submission(s), status ${stageResult.status}`);
            }
          }
        },
        finalize: async (workflowResult) => {
          if (loopDef.dryRun === true || !shouldOpenAtEnd) return;
          if (Number(workflowResult?.totalCompletions || 0) < 1 && !findRewardPackInCache(loopDef, null)) {
            log(`${loopDef.name}: no deferred reward packs to open`);
            return;
          }
          log(`${loopDef.name}: stages complete; opening deferred reward packs`);
          const opened = await openMatchingRewardPacksUntilEmpty(loopDef, "deferred stage reward pack");
          workflowResult.deferredRewardPacksOpened = opened;
          await resolveRuntimeUnassigned(`${loopDef.name} post-deferred-reward cleanup`, { loopDef });
        }
      });
      log(`${loopDef.name}: submitted ${result.totalCompletions} SBC(s) across ${result.completedStages.length} stage(s)${Number(result.deferredRewardPacksOpened || 0) ? `; opened ${result.deferredRewardPacksOpened} deferred reward pack(s)` : ""}`);
      return result;
    }
    function isRareGoldPlayer(item, options = {}) {
      const highGoldThreshold = resolveProtectHighGoldThreshold(options);
      const spec = {
        tier: "gold",
        rarity: "rare",
        playerOnly: true,
        allowSpecial: false,
        protectHighGold: options.protectHighGold === true,
        highGoldThreshold
      };
      return !(options.protectHighGold && isProtectedHighGold(item, highGoldThreshold)) && isSbcUsablePlayer(item, spec) && itemMatchesSpec(item, spec);
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
    async function prepareFsuRuntimeAccess(context) {
      const adapter = fsuAdapter();
      return prepareFsuProvisionalClubAccess({
        readiness: adapter.readiness(),
        label: context.label,
        players: context.players,
        itemRefs: context?.squadPlan?.itemRefs || [],
        snapshotItem: adapters.inventory().snapshotItem,
        validateClubPlayers: (refs, options) => adapter.validateClubPlayers(refs, options),
        log
      });
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
        prepareRuntimeAccess: prepareFsuRuntimeAccess,
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
        afterSubmit: async ({ result: submissionResult, players, savedPlayers, squadPlan }) => {
          await finalizeSubmittedInventorySelection(
            squadPlan?.selection || selection,
            label,
            savedPlayers?.length ? savedPlayers : players
          );
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
      let basePickDef = null;
      if (pickLoopId) {
        basePickDef = findLoopDefById(pickLoopId);
        if (!basePickDef || basePickDef.strategy !== "playerPickSbc") {
          fail2(`${loopDef.name}: pre-craft Player Pick loop not found or invalid: ${pickLoopId}`);
        }
      } else if (loopDef.preCraftPlayerPick) {
        const resolved = resolvePlayerPickLoopReference(loopDef.preCraftPlayerPick, getLoopDefs());
        if (resolved.status === "ambiguous") {
          fail2(`${loopDef.name}: pre-craft Player Pick identity is ambiguous: ${resolved.matches.map((loop) => loop.id).join(", ")}`);
        }
        basePickDef = resolved.loop;
      }
      if (!basePickDef) return null;
      const pickDef = cloneLoopDef(basePickDef);
      if (loopDef.disabledPiles?.length && !pickDef.disabledPiles?.length) {
        pickDef.disabledPiles = [...loopDef.disabledPiles];
      }
      applyDisabledPiles(pickDef);
      applyPickRuntimeOptions(pickDef, loopDef.runtimePickOptions || getPickRuntimeOptions());
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
        const responseDuplicates = materializeOpenedResponsePlayerDuplicates(
          openedItems,
          `${loopDef.name} provision response classification`
        ).duplicates;
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
            eaInventoryAdapter().preparePurchasedItem(item);
          }
        };
        restoreResponseDuplicateMetadata();
        if (directClub.length) {
          log(`${loopDef.name}: moving ${directClub.length} non-duplicate provision item(s) to club`);
          await moveItems(directClub, inventoryPile("club"), true);
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
        const responseDuplicates = materializeOpenedResponsePlayerDuplicates(
          openedItems,
          `${loopDef.name} rare pack response classification`
        ).duplicates;
        const duplicateIds = new Set(responseDuplicates.map((item) => Number(item?.id || 0)).filter(Boolean));
        const classified = classifyOpenedUpgradeDuplicates(openedItems, {
          isDuplicate: (item) => duplicateIds.has(Number(item?.id || 0)),
          isEligibleDuplicate: (item) => isRareGoldPlayer(item, { protectHighGold: true }),
          isTradeable
        });
        if (classified.directClub.length) {
          log(`${loopDef.name}: moving ${classified.directClub.length} response-classified non-duplicate item(s) to club`);
          await moveItems(classified.directClub, inventoryPile("club"), true);
        }
        if (classified.tradeableDuplicates.length) {
          assertPileSpace("Transfer list", transferSpaceLeft(), classified.tradeableDuplicates.length);
          log(`${loopDef.name}: moving ${classified.tradeableDuplicates.length} non-crafting tradeable duplicate(s) to transfer list`);
          await moveItems(classified.tradeableDuplicates, inventoryPile("transfer"), false);
        }
        if (classified.untradeableDuplicates.length) {
          assertPileSpace("SBC storage", storageSpaceLeft(), classified.untradeableDuplicates.length);
          log(`${loopDef.name}: moving ${classified.untradeableDuplicates.length} non-crafting untradeable duplicate(s) to SBC storage`);
          await moveItems(classified.untradeableDuplicates, inventoryPile("storage"), true);
        }
        await sleep(CFG.pauseMs);
        await refreshInventoryCaches(`${loopDef.name} rare pack response routing`, { includePacks: false, quiet: true });
        const routedItems = [
          ...classified.directClub,
          ...classified.tradeableDuplicates,
          ...classified.untradeableDuplicates
        ];
        const lowRare = classified.reservedDuplicates.length;
        const inventoryAdapter = adapters.inventory();
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
    async function runReservedDuplicateCraftingStage(loopDef, upgradeDef, duplicatePredicate, label, options = {}) {
      const dryRun = loopDef.dryRun === true;
      const broadDuplicatePredicate = options.dynamicPredicate === false ? duplicatePredicate : (item) => getChallengeMaterialDefs(upgradeDef).some((challengeDef) => isDuplicateForLoopRequirements(item, challengeDef));
      const workflowResult = await runReservedDuplicateCraftingWorkflow({
        maxCompletions: Number(options.maxCompletions || 100),
        forceAttempts: options.forceAttempts,
        transientSignals: options.transientUnassignedSignals,
        stopPoint: () => stopPoint(),
        planAttempt: async ({ forceAttempt, transientSignals }) => {
          await refreshInventoryCaches(`${loopDef.name} ${label} pre-selection`, { includePacks: false, quiet: true });
          const broadDuplicateCount = countUnassignedMatching(broadDuplicatePredicate) + transientSignals.length;
          if (!broadDuplicateCount && !forceAttempt) return { status: "done", reason: "no reserved duplicate remains" };
          const set = await findSbcSet(upgradeDef.sbcNames, upgradeDef.name || label);
          const challenges = await requestSbcChallenges(set, upgradeDef.name || label, { attempts: 3, allowEmpty: true });
          const challengeIndex = challenges.findIndex((challenge) => !isCompletedChallenge(challenge));
          if (challengeIndex < 0) {
            if (transientSignals.length) {
              fail2(`${loopDef.name}: ${label} has no available challenge for ${transientSignals.length} just-opened duplicate(s)`);
            }
            return { status: "done", reason: "no available challenge remains" };
          }
          const challengeDef = loopChallengeDef(upgradeDef, challengeIndex + 1);
          const countNeeded = sumRequirementPlayerCount(challengeDef);
          if (countNeeded <= 0) {
            if (transientSignals.length) {
              fail2(`${loopDef.name}: ${label} has no usable player requirement for ${transientSignals.length} just-opened duplicate(s)`);
            }
            return { status: "done", reason: "challenge has no usable player requirement" };
          }
          const activeDuplicatePredicate = options.dynamicPredicate === false ? duplicatePredicate : (item) => isDuplicateForLoopRequirements(item, challengeDef);
          const duplicateCount = countUnassignedMatching(activeDuplicatePredicate) + transientSignals.length;
          if (!duplicateCount && !forceAttempt) return { status: "done", reason: "no challenge-matching duplicate remains" };
          const fallbackPiles = challengeDef.priorityPiles || ["unassigned", "storage", "transfer", "club"];
          const transientSignalRefs = transientSignals.map((signal) => signal.ref || signal);
          const selectionOptions = {
            transientUnassignedSignals: transientSignals,
            preferredSignalRefs: transientSignalRefs
          };
          const duplicateOnlySelection = fallbackPiles.includes("unassigned") ? selectInventoryPlayers3(challengeDef, ["unassigned"], selectionOptions) : { ok: false };
          const piles = duplicateOnlySelection.ok ? ["unassigned"] : fallbackPiles;
          const selection = selectInventoryPlayers3(challengeDef, piles, selectionOptions);
          log(`${loopDef.name}: ${label} selected ${selection.selected.length}/${countNeeded} (${formatSelectionStats(selection.stats)})`);
          const repositorySignals = getUnassignedItems().filter(activeDuplicatePredicate);
          const signalById = new Map([...repositorySignals, ...transientSignals].map((signal) => [Number(signal?.id || signal?.ref?.id || 0), signal]).filter(([id]) => id));
          const selectedSignalCount = (selection.entries || []).filter((entry) => entry.pileName === "unassigned" && entry.signal).length;
          if (transientSignals.length) {
            log(`${loopDef.name}: ${label} duplicate signal sources response:${transientSignals.length}, repository:${repositorySignals.length}, unique:${signalById.size}, selected:${selectedSignalCount}`);
          }
          const signalRefs = [...signalById.values()].map((signal) => signal.ref || signal);
          const signalCoverage = evaluateUnassignedSignalCoverage(selection, signalById.size, countNeeded);
          const expectedSelectedSignalCount = signalCoverage.expectedCount;
          const missedTransientSignal = !selectionConsumesAllSignalRefs(selection, transientSignalRefs);
          if (selectedSignalCount < expectedSelectedSignalCount || missedTransientSignal) {
            logDuplicateSignalDiagnostics(
              `${loopDef.name} ${label}`,
              [...signalById.values()],
              selectionRequirements(challengeDef, piles)[0] || {},
              selection
            );
          }
          if (options.requireFullSignalCoverage === true && selection.ok && !signalCoverage.sufficient) {
            return {
              status: "blocked",
              reason: `${label} found ${signalRefs.length} matching Unassigned duplicate signal(s), but the selected squad would consume only ${selectedSignalCount}/${expectedSelectedSignalCount}; refusing a fallback that skips Unassigned cards`
            };
          }
          if (!selection.ok) {
            const missing = selection.missing;
            log(`${loopDef.name}: ${label} missing ${missing.count} player(s) after fallback; stopping ${label}`);
            logSelectionDiagnostics(`${loopDef.name} ${label}`, selection, piles);
            if (transientSignalRefs.length) {
              fail2(`${loopDef.name}: ${label} cannot consume ${transientSignalRefs.length} just-opened duplicate(s); stopping before Unassigned cleanup or another pack open`);
            }
            return { status: "done", reason: "inventory selection is insufficient" };
          }
          if (!selectionConsumesAllSignalRefs(selection, transientSignalRefs)) {
            fail2(`${loopDef.name}: ${label} cannot resolve every just-opened duplicate to a Club/Storage submit item; stopping before another pack is opened`);
          }
          return {
            status: "ready",
            challengeDef,
            selection,
            transientSignalRefs,
            transientSignalCount: transientSignals.length
          };
        },
        executeAttempt: async ({ plan }) => {
          if (dryRun) {
            logDryRunSelection(`${loopDef.name} ${label}`, plan.selection);
            log(`${loopDef.name}: dry-run would submit ${label} selection`);
            return { status: "planned", reason: `would submit ${label}` };
          }
          const submitted = await submitInventorySelection(plan.challengeDef, plan.selection);
          if (!submitted) {
            if (plan.transientSignalCount) {
              fail2(`${loopDef.name}: ${label} did not submit; preserving ${plan.transientSignalCount} just-opened duplicate(s) and stopping`);
            }
            return { status: "done", reason: "SBC was not submitted" };
          }
          await sleep(CFG.pauseMs);
          return { status: "submitted", submitted: true, transientSignals: [] };
        }
      });
      log(`${loopDef.name}: ${dryRun ? "dry-run planned" : "submitted"} ${workflowResult.completions} ${label} SBC(s)`);
      return workflowResult;
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
          await unwindSbcSquadControllers2(`${loopDef.name} resume`);
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
            if (loopDef.preCraftPlayerPickLoopId || loopDef.preCraftPlayerPick) {
              const pickDef = getProvisionPreCraftPickDef(loopDef);
              if (pickDef) {
                log(`${loopDef.name}: after each opened Provision Pack, live run checks ${pickDef.name} only when an unassigned duplicate matches that Pick's configured requirements`);
              } else {
                log(`${loopDef.name}: configured dynamic pre-craft Player Pick is not available in the current scan; live run would skip it and continue crafting stages`);
              }
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
              await runReservedDuplicateCraftingStage(
                loopDef,
                upgradeDef,
                (item) => isDuplicateForLoopRequirements(item, upgradeDef),
                label,
                { maxCompletions: 1, requireFullSignalCoverage: true }
              );
              completions[`stage-${index}`] = 0;
            } else {
              const stageResult = await runReservedDuplicateCraftingStage(
                loopDef,
                upgradeDef,
                (item) => isDuplicateForLoopRequirements(item, upgradeDef),
                label,
                { requireFullSignalCoverage: true }
              );
              completions[`stage-${index}`] = stageResult.completions;
              if (stageResult.status === "blocked" || stageResult.status === "planned") {
                return {
                  status: stageResult.status,
                  completions,
                  reason: stageResult.reason || `${label} ${stageResult.status}`
                };
              }
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
        const pickDef = getProvisionPreCraftPickDef(loopDef);
        state.lastPickRecap = {
          name: pickDef?.name || "Provision pre-craft Player Pick",
          pickResults: preCraftPickResults,
          status: result.status,
          reason: result.reason,
          completedAt: Date.now()
        };
        state.lastRecapType = "pick";
        updateRecapButton();
        if (pickDef) await showPickRecapModal(pickDef, preCraftPickResults, result);
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
      const consumeAllSourcePacks = loopDef.consumeAllSourcePacks === true;
      const fillRemainingRoundsFromInventory = consumeAllSourcePacks && loopDef.useRoundsAsCompletions === true;
      const maxPacks = Math.max(1, Math.min(100, Number(loopDef.maxPacks || 100) || 100));
      const maxCompletions = Math.max(1, Math.min(100, Number(loopDef.maxCompletions || 1) || 1));
      const rareUpgradeDef = {
        ...loopDef.rareUpgrade,
        openRewardPacks: loopDef.openRewardPacks === true
      };
      const result = await runPackAndCraftWorkflow({
        maxPacks,
        completionTarget: fillRemainingRoundsFromInventory || !consumeAllSourcePacks ? { id: "rare", max: maxCompletions } : null,
        requireSourceExhaustion: consumeAllSourcePacks,
        stopPoint: () => stopPoint(),
        resume: async () => {
          if (dryRun) {
            await refreshInventoryCaches(`${loopDef.name} dry-run`, { quiet: true });
            const items2 = getUnassignedItems();
            const usable2 = items2.filter(isLowRareGoldDuplicate);
            log(`${loopDef.name}: dry-run resume found ${items2.length} unassigned item(s), ${usable2.length} usable low rare duplicate(s)`);
            return { hasItems: usable2.length > 0, usableCount: usable2.length };
          }
          await unwindSbcSquadControllers2(`${loopDef.name} resume`);
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
          const packProgress = consumeAllSourcePacks ? `source pack ${current.packsOpened + 1}` : `${current.packsOpened + 1}/${maxPacks}`;
          log(`${loopDef.name}: ${dryRun ? "dry-run would open" : "opening"} ${packName(pack)} (#${pack.id}) ${packProgress}`);
          if (dryRun) return { status: "planned", reason: `would open ${packName(pack)}` };
          const receipt = await openPack(pack, `${loopDef.name} source pack`, {
            allowGone: true,
            retryCodes: ["471", "500"],
            resolveRetryPack: () => findSourcePack(loopDef),
            openedItemPolicy: createRarePackTo84Policy(loopDef)
          });
          return receipt || { status: "stale", reason: "source pack stale or unavailable" };
        },
        runStages: async ({ result: current, phase, context }) => {
          const remainingCompletions2 = consumeAllSourcePacks ? null : Math.max(0, maxCompletions - Number(current.stageCompletions.rare || 0));
          if (remainingCompletions2 === 0) {
            return { status: "completed", completions: { rare: 0 }, reason: "completion target reached" };
          }
          if (dryRun) {
            await runReservedDuplicateCraftingStage(
              loopDef,
              rareUpgradeDef,
              isLowRareGoldDuplicate,
              `2x84+ ${phase === "resume" ? "resumed " : ""}low rare gold`,
              { maxCompletions: 1 }
            );
            return { status: "planned", completions: { rare: 0 }, reason: "would submit 2x84+ stage" };
          }
          const stageResult = await runReservedDuplicateCraftingStage(
            loopDef,
            rareUpgradeDef,
            isLowRareGoldDuplicate,
            `2x84+ ${phase === "resume" ? "resumed " : ""}low rare gold`,
            {
              maxCompletions: remainingCompletions2 ?? 100,
              forceAttempts: phase === "pack" && Number(context?.lowRare || 0) > 0 ? 1 : 0,
              transientUnassignedSignals: phase === "pack" ? context?.transientUnassignedSignals || [] : []
            }
          );
          return { status: "completed", completions: { rare: stageResult.completions } };
        },
        afterStages: async ({ phase }) => {
          if (dryRun) return;
          await resolveRuntimeUnassigned(`${loopDef.name} ${phase === "resume" ? "resume" : "post-pack"} cleanup`);
          await sleep(CFG.pauseMs);
        },
        afterStalePack: async () => {
          if (!dryRun) await sleep(CFG.pauseMs);
        },
        onSourceExhausted: async ({ remainingCompletions: remainingCompletions2 }) => {
          const fallbackLoopId = String(loopDef.sourceExhaustedFallbackLoopId || "").trim();
          const requestedFallbackCompletions = fillRemainingRoundsFromInventory ? Number(remainingCompletions2 || 0) : consumeAllSourcePacks ? Number(loopDef.sourceExhaustedFallbackMaxCompletions || 1) : Number(remainingCompletions2 || 0);
          if (fillRemainingRoundsFromInventory && requestedFallbackCompletions === 0) {
            log(`${loopDef.name}: source packs completed the requested ${maxCompletions} round(s); no inventory fallback needed`);
            return { status: "completed", completions: { rare: 0 }, reason: null };
          }
          if (!fallbackLoopId || requestedFallbackCompletions <= 0) {
            return { status: "unavailable", completions: { rare: 0 }, reason: "no source-exhausted fallback configured" };
          }
          const baseFallbackDef = findLoopDefById(fallbackLoopId);
          if (!baseFallbackDef || baseFallbackDef.strategy !== "fillAndVerifySbc") {
            fail2(`${loopDef.name}: source-exhausted fallback loop not found or invalid: ${fallbackLoopId}`);
          }
          const configuredFallbackLimit = Number(loopDef.sourceExhaustedFallbackMaxCompletions || requestedFallbackCompletions);
          const fallbackCompletions = Math.max(1, Math.min(requestedFallbackCompletions, configuredFallbackLimit));
          const fallbackDef = cloneLoopDef(baseFallbackDef);
          if (loopDef.disabledPiles?.length && !fallbackDef.disabledPiles?.length) {
            fallbackDef.disabledPiles = [...loopDef.disabledPiles];
          }
          fallbackDef.dryRun = dryRun;
          fallbackDef.maxCompletions = fallbackCompletions;
          fallbackDef.allowMultipleCompletions = fallbackCompletions > 1 || fallbackDef.allowMultipleCompletions === true;
          fallbackDef.openRewardPacks = loopDef.openRewardPacks === true;
          fallbackDef.forceOpenRewardPacks = false;
          applyDisabledPiles(fallbackDef);
          log(`${loopDef.name}: no matching source pack remains; running ${fallbackDef.name} for up to ${fallbackCompletions} remaining 2x84+ completion(s)`);
          const fallbackResult = await runFillAndVerifyLoop(fallbackDef);
          const fallbackUnavailableIsExhausted = consumeAllSourcePacks && !fillRemainingRoundsFromInventory && fallbackResult.status === "unavailable";
          return {
            status: fallbackUnavailableIsExhausted ? "completed" : fallbackResult.status,
            completions: { rare: Number(fallbackResult.completions || 0) },
            reason: fallbackUnavailableIsExhausted ? null : fallbackResult.reason || null
          };
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
        const completionSummary = fillRemainingRoundsFromInventory || !consumeAllSourcePacks ? `${rareCompletions}/${maxCompletions}` : `${rareCompletions}`;
        log(`${loopDef.name}: opened ${result.packsOpened} rare gold pack(s), submitted 2x84+:${completionSummary}`);
      }
      return result;
    }
    function isPlayerPickDuplicate(item) {
      return eaPlayerPickAdapter().isOwnedDuplicate(item);
    }
    async function getPlayerPickPrices(items, loopDef) {
      const result = await loadPlayerPickPrices({
        items,
        platform: loopDef.pricePlatform,
        referer: pageRuntime.origin(),
        requestText: adapters.http.getText
      });
      for (const attempt of result.attempts) {
        if (attempt.source === "FUT.GG" && attempt.status === "loaded") {
          log(`${loopDef.name}: FUT.GG prices loaded for ${result.prices.size}/${result.ids.length} Pick candidate(s)`);
        } else if (attempt.source === "FUT.GG" && attempt.status === "empty") {
          log(`${loopDef.name}: FUT.GG returned no usable Pick prices; trying FUTNext`);
        } else if (attempt.source === "FUT.GG") {
          log(`${loopDef.name}: FUT.GG price lookup unavailable (${attempt.reason}); trying FUTNext`);
        } else if (attempt.source === "FUTNext" && attempt.status === "loaded") {
          log(`${loopDef.name}: FUTNext prices loaded for ${result.prices.size}/${result.ids.length} Pick candidate(s)`);
        } else if (attempt.source === "FUTNext" && attempt.status === "empty") {
          log(`${loopDef.name}: FUTNext returned no usable Pick prices; price ties require manual selection`);
        } else {
          log(`${loopDef.name}: FUTNext price lookup unavailable (${attempt.reason}); price ties require manual selection`);
        }
      }
      return result.prices;
    }
    function describePlayerPickCandidate(candidate) {
      const tags = [
        candidate.special ? "special" : "normal",
        candidate.duplicate ? "duplicate" : "new",
        candidate.price === null ? "price:?" : `price:${candidate.price}`
      ];
      return `${itemDisplayName(candidate.item)} rating:${candidate.rating} ${tags.join(",")}`;
    }
    function formatCompactPrice(price) {
      const value = Number(price);
      if (!Number.isFinite(value) || value <= 0) return "";
      if (value >= 1e6) return `${(value / 1e6).toFixed(value >= 1e7 ? 0 : 1)}m`;
      if (value >= 1e3) return `${(value / 1e3).toFixed(value >= 1e5 ? 0 : 1)}k`;
      return String(Math.round(value));
    }
    async function redeemAndSelectPlayerPick(pickItem, loopDef, options = {}) {
      log(`${loopDef.name}: redeeming ${playerPickItemName(pickItem)}`);
      const redeemed = await observeOnce(eaPlayerPickAdapter().redeem(pickItem), ctrl(), 3e4, "redeem Player Pick");
      if (!redeemed?.success) fail2(`${loopDef.name}: Player Pick redeem failed: ${serviceResultErrorText(redeemed)}`);
      const data = redeemed.data || redeemed.response || {};
      const choices = (data.playerPicks || data.items || []).filter(isPlayer2);
      const pickCount = Math.max(1, Number(data.availablePicks || loopDef.pickCount || 1) || 1);
      if (choices.length < pickCount) fail2(`${loopDef.name}: Player Pick returned ${choices.length} candidate(s) for ${pickCount} selection(s)`);
      const maxRating = Math.max(0, ...choices.map((item) => Number(item?.rating || 0)));
      const autoPickThreshold = Math.max(1, Math.min(99, Number(loopDef.autoPickRatingThreshold || 90) || 90));
      const autoSelectBelow90 = loopDef.autoSelectBelow90 !== false && maxRating < autoPickThreshold;
      if (autoSelectBelow90) {
        log(`${loopDef.name}: all candidates rated below ${autoPickThreshold} (max ${maxRating}); keeping automatic selection while loading prices for the recap`);
      }
      await refreshInventoryCaches(`${loopDef.name} Player Pick duplicate check`, { includePacks: false, quiet: true });
      const prices = await getPlayerPickPrices(choices, loopDef);
      const pickRewardOptions = {
        isSpecial: isSpecial2,
        isDuplicate: isPlayerPickDuplicate
      };
      const ranked = rankPlayerPickCandidates(choices, prices, pickRewardOptions);
      ranked.forEach((candidate, index) => log(`${loopDef.name}: pick candidate ${index + 1}/${ranked.length} ${describePlayerPickCandidate(candidate)}`));
      const manualReason = autoSelectBelow90 ? "" : getManualPlayerPickReason(ranked, pickCount);
      const selected = manualReason ? await waitForManualPlayerPickSelection({
        dom: adapters.dom,
        ranked,
        pickCount,
        reason: manualReason,
        describeCandidate: describePlayerPickCandidate,
        scheduleStopCheck: setInterval,
        cancelStopCheck: clearInterval,
        isStopping: () => state.stopping
      }) : ranked.slice(0, pickCount).map((candidate) => candidate.item);
      const selectedCards = capturePlayerPickSelections(selected, ranked, pickRewardOptions);
      if (manualReason) log(`${loopDef.name}: manual Player Pick confirmed`);
      else log(`${loopDef.name}: auto-selected ${selected.map((item) => itemDisplayName(item)).join(", ")}`);
      const confirmed = await observeOnce(
        eaPlayerPickAdapter().confirmSelection(selected),
        ctrl(),
        3e4,
        "confirm Player Pick selection"
      );
      if (!confirmed?.success) fail2(`${loopDef.name}: Player Pick confirmation failed: ${serviceResultErrorText(confirmed)}`);
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
        const picks = eaPlayerPickAdapter().listUnassignedPlayerPicks();
        const pending = classifyPendingPlayerPicks(
          picks,
          loopDef.pickItemNames || [],
          loopDef.pickItemResourceIds || []
        );
        if (pending.unexpected && options.failOnUnexpected) {
          fail2(`${loopDef.name}: unrelated unassigned Player Pick detected (${playerPickItemName(pending.unexpected)}); stop without redeeming it`);
        }
        if (pending.matching) return pending.matching;
        if (attempt < attempts) await sleep(900);
      }
      if (!options.quietMissing) log(`${loopDef.name}: Player Pick reward was not found in unassigned items`);
      return null;
    }
    function saveRewardAlertEnabled(event) {
      const enabled = event?.target?.checked === true;
      try {
        persistRewardAlertSettings({ ...state.rewardAlertSettings, enabled });
        log(`Reward alerts ${enabled ? "enabled" : "disabled"}`);
      } catch (error) {
        log(`Reward alert setting failed: ${error?.message || error}`);
        renderRewardAlertSummary({
          panel: document.querySelector("#bronze-loop-panel"),
          settings: state.rewardAlertSettings
        });
      }
    }
    function loadRewardAlertSettings() {
      return normalizeRewardAlertSettings(adapters.userscriptStorage.get(REWARD_ALERT_SETTINGS_KEY, {}));
    }
    function persistRewardAlertSettings(settings) {
      state.rewardAlertSettings = normalizeRewardAlertSettings(settings);
      adapters.userscriptStorage.set(REWARD_ALERT_SETTINGS_KEY, state.rewardAlertSettings);
      renderRewardAlertSummary({
        panel: document.querySelector("#bronze-loop-panel"),
        settings: state.rewardAlertSettings
      });
      return state.rewardAlertSettings;
    }
    function previewPackHighlight(input = {}) {
      const rating = Math.max(1, Math.min(99, Number(input.rating || input.cards?.[0]?.rating || 96) || 96));
      const cards = input.cards || [{
        id: 1,
        definitionId: 1,
        type: "player",
        name: "Reward Alert Preview",
        rating,
        special: true,
        duplicate: false,
        tradeable: false
      }];
      const model = createPackHighlightModel({
        packRef: { id: 0, name: input.packName || "Preview Pack" },
        openedItems: cards
      }, { ...state.rewardAlertSettings, ...input.settings, enabled: true, highlightEnabled: true });
      if (!model) return false;
      return showPackHighlightToast({
        dom: adapters.dom,
        panel: document.querySelector("#bronze-loop-panel"),
        viewport: () => ({ width: window.innerWidth, height: window.innerHeight }),
        model,
        durationMs: 7e3,
        schedule: setTimeout,
        cancel: clearTimeout,
        celebrate: (container, count) => triggerRewardFireworks(container, count, {
          dom: adapters.dom,
          getComputedStyle: (element) => getComputedStyle(element),
          devicePixelRatio: () => window.devicePixelRatio || 1,
          now: () => performance.now(),
          requestFrame: (callback) => requestAnimationFrame(callback)
        })
      });
    }
    function publishPackHighlight(openedItems, context = {}) {
      const settings = state.rewardAlertSettings;
      const model = createPackHighlightModel({
        packRef: context.packRef,
        openedItems,
        details: { assumeTotwReward: context.assumeSpecialPlayers === true }
      }, settings, {
        purpose: context.purpose,
        assumeSpecialPlayers: context.assumeSpecialPlayers
      });
      if (!model) return;
      log(`Reward highlight: ${model.cards.map((card) => `${card.name} rating:${card.rating}${card.duplicate ? " duplicate" : ""}`).join("; ")}`);
      if (settings.highlightEnabled) previewPackHighlight({
        packName: model.pack.name,
        cards: model.cards.map((card) => ({ ...card, type: "player" })),
        settings
      });
      const message = formatPackHighlightNotification(model);
      if (settings.desktopEnabled) {
        void adapters.notification.desktop(message).catch((error) => {
          log(`Reward desktop notification failed: ${error?.message || error}`);
        });
      }
      if (settings.ntfyEnabled) {
        void adapters.notification.ntfy(message, {
          server: settings.ntfyServer,
          topic: settings.ntfyTopic,
          token: settings.ntfyToken
        }).catch((error) => {
          log(`Reward ntfy notification failed: ${error?.message || error}`);
        });
      }
    }
    function openRewardAlertSettingsModal() {
      return showRewardAlertSettings({
        dom: adapters.dom,
        settings: state.rewardAlertSettings,
        onPreview: async (settings) => {
          previewPackHighlight({ rating: Math.max(96, settings.minimumRating), settings });
        },
        onTestDesktop: async (settings) => adapters.notification.desktop({
          title: "Daily Loop Runner test",
          body: `${Math.max(96, settings.minimumRating)} special card desktop notification test`
        }),
        onTestNtfy: async (settings) => adapters.notification.ntfy({
          title: "Daily Loop Runner test",
          body: `${Math.max(96, settings.minimumRating)} special card ntfy notification test`
        }, {
          server: settings.ntfyServer,
          topic: settings.ntfyTopic,
          token: settings.ntfyToken
        }),
        onSave: async (settings) => {
          persistRewardAlertSettings(settings);
          log(`Reward alerts updated: ${settings.enabled ? `${settings.minimumRating}+ special` : "off"}`);
        }
      });
    }
    function pendingPlayerPickQuantity(item) {
      return Math.max(
        1,
        Number(item?.stackCount || 0) || 0,
        Number(item?.untradeableCount || 0) || 0
      );
    }
    async function listUnassignedPlayerPicksForLoop(loopDef, attempts = 1, options = {}) {
      const minimumCount = Math.max(0, Number(options.minimumCount || 0) || 0);
      let matching = [];
      for (let attempt = 1; attempt <= attempts; attempt++) {
        await refreshUnassigned({ quiet: true, attempts: 1 });
        const partitioned = partitionPendingPlayerPicks(
          eaPlayerPickAdapter().listUnassignedPlayerPicks(),
          loopDef.pickItemNames || [],
          loopDef.pickItemResourceIds || []
        );
        if (partitioned.unexpected.length && options.failOnUnexpected) {
          fail2(`${loopDef.name}: unrelated unassigned Player Pick detected (${playerPickItemName(partitioned.unexpected[0])}); stop without redeeming it`);
        }
        matching = partitioned.matching.flatMap(
          (item) => Array.from({ length: pendingPlayerPickQuantity(item) }, () => item)
        );
        if (matching.length >= minimumCount) return matching;
        if (attempt < attempts) await sleep(900);
      }
      if (!options.quietMissing && matching.length < minimumCount) {
        log(`${loopDef.name}: found ${matching.length}/${minimumCount} expected pending Player Pick reward(s)`);
      }
      return matching;
    }
    async function reservePendingPlayerPicksDuringCleanup(loopDef, reason) {
      const matching = await listUnassignedPlayerPicksForLoop(loopDef, 1, {
        minimumCount: 0,
        quietMissing: true,
        failOnUnexpected: true
      });
      const reservedIds = new Set(matching.map((item) => Number(item?.id || 0)).filter(Boolean));
      await resolveRuntimeUnassigned(reason, {
        reserveItem: (item) => reservedIds.has(Number(item?.id || 0))
      });
    }
    function assertPlayerPickFodderProtection(loopDef, players) {
      const inspection = inspectSbcItems(loopDef, players, {
        expectedPlayerCount: sumRequirementPlayerCount(loopDef)
      });
      assertSbcSquadSafe(loopDef, inspection);
      if (loopDef.protectHighGold === false) return;
      const highGoldThreshold = Math.max(2, Math.min(99, Number(loopDef.pickHighGoldThreshold || 82) || 82));
      const protectedPlayers = (players || []).filter(
        (item) => isGold(item) && !isSpecial2(item) && Number(item?.rating || 0) >= highGoldThreshold
      );
      if (!protectedPlayers.length) return;
      const details = protectedPlayers.map((item) => `${itemDisplayName(item)} rating:${Number(item?.rating || 0)}`).join(", ");
      fail2(`${loopDef.name}: ${highGoldThreshold}+ normal gold protection blocked SBC submission: ${details}`);
    }
    function assertSavedPlayerPickFodderProtection(loopDef, squad) {
      const savedPlayers = getSquadItems(squad);
      if (!savedPlayers.length) {
        fail2(`${loopDef.name}: cannot inspect the saved squad; stop before Player Pick submission`);
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
      if (!pickDef) {
        if (loopDef.preCraftPlayerPick) {
          log(`${loopDef.name}: configured dynamic pre-craft Player Pick is unavailable; skipping it and continuing crafting stages`);
        }
        return [];
      }
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
        log(`${loopDef.name}: resolving pending ${playerPickItemName(pendingPick)} before crafting upgrades`);
        const pickedCards2 = await redeemAndSelectPlayerPick(pendingPick, pickDef, {
          cleanupOptions
        });
        log(`${loopDef.name}: pending ${pickDef.name} selected; continuing original crafting flow`);
        return [{ resumed: true, pickedCards: pickedCards2 || [] }];
      }
      const set = await findSbcSetForLoopDef(pickDef, pickDef.name);
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
      if (!pickItem) fail2(`${loopDef.name}: ${pickDef.name} completed but its Player Pick reward was not found`);
      const pickedCards = await redeemAndSelectPlayerPick(pickItem, pickDef, {
        cleanupOptions
      });
      log(`${loopDef.name}: ${pickDef.name} completed and selected; continuing original crafting flow`);
      return [{ resumed: false, pickedCards: pickedCards || [] }];
    }
    async function runPlayerPickLoop(loopDef) {
      await waitAppReady();
      const dryRun = loopDef.dryRun === true;
      let pickTarget = resolvePlayerPickRunTarget(loopDef);
      if (loopDef.exhaustSbcSet === true) {
        const pending = await listUnassignedPlayerPicksForLoop(loopDef, 1, {
          minimumCount: 0,
          quietMissing: true,
          failOnUnexpected: true
        });
        const set = await findSbcSetForLoopDef(loopDef, loopDef.name);
        const remainingCompletions2 = getDailySetRemaining(set);
        pickTarget = resolvePlayerPickRunTarget(loopDef, {
          pendingCount: pending.length,
          remainingCompletions: remainingCompletions2
        });
        const remainingLabel = pickTarget.usedSafetyLimit ? `unknown; running until unavailable (safety cap ${pickTarget.remainingCompletions})` : `${pickTarget.remainingCompletions}`;
        log(`${loopDef.name}: limited Set progress completed:${Number.isFinite(Number(set?.timesCompleted)) ? set.timesCompleted : "?"}, repeats:${Number.isFinite(Number(set?.repeats)) ? set.repeats : "?"}, remaining:${remainingLabel}; pending Pick(s):${pickTarget.pendingCount}`);
      }
      const maxPicks = dryRun && loopDef.exhaustSbcSet === true ? pickTarget.remainingCompletions : pickTarget.maxPicks;
      const challengesPerPick = getPlayerPickChallengeCount(loopDef);
      const openPicksAtEnd = !dryRun && loopDef.openPicksAtEnd === true;
      if (!maxPicks) {
        if (dryRun && pickTarget.pendingCount) {
          log(`${loopDef.name}: dry-run found ${pickTarget.pendingCount} pending Pick(s), but the SBC Set has no remaining completion`);
        } else {
          log(`${loopDef.name}: no pending Pick and the SBC Set is complete`);
        }
        return {
          status: "completed",
          picksCompleted: 0,
          challengesSubmitted: 0,
          challengesPlanned: 0,
          picksQueued: 0,
          pickResults: [],
          reason: null
        };
      }
      if (openPicksAtEnd) {
        const targetLabel = loopDef.exhaustSbcSet === true ? "all available" : `up to ${maxPicks}`;
        log(`${loopDef.name}: batch Pick mode enabled; complete ${targetLabel} Pick(s), then open matching rewards together`);
      }
      const result = await runPlayerPickWorkflow({
        maxPicks,
        openPicksAtEnd,
        completeWhenNoChallengeRemains: loopDef.exhaustSbcSet === true,
        stopPoint: () => stopPoint(),
        findPendingPick: async () => {
          const pending = await findUnassignedPlayerPick(loopDef, 1, { quietMissing: true, failOnUnexpected: true });
          if (pending && !dryRun) log(`${loopDef.name}: resuming pending ${playerPickItemName(pending)}`);
          if (pending && dryRun) log(`${loopDef.name}: dry-run found pending ${playerPickItemName(pending)}; live run would resolve it before submitting another SBC`);
          return dryRun ? null : pending;
        },
        redeemPick: async ({ pickItem, resumed }) => {
          if (dryRun) return { status: "planned", reason: "would redeem Player Pick" };
          const pickedCards = await redeemAndSelectPlayerPick(pickItem, loopDef, openPicksAtEnd ? {
            cleanupOptions: {
              reserveItem: (item) => playerPickMatchesReward(
                item,
                loopDef.pickItemNames || [],
                loopDef.pickItemResourceIds || []
              )
            }
          } : {});
          if (resumed) log(`${loopDef.name}: resumed Player Pick selected`);
          return { status: "selected", pickedCards: pickedCards || [] };
        },
        beforePick: async ({ result: current }) => {
          if (!dryRun && openPicksAtEnd) {
            await reservePendingPlayerPicksDuringCleanup(
              loopDef,
              `${loopDef.name} queued pick ${current.picksQueued + 1} pre-submit cleanup`
            );
          } else if (!dryRun) {
            await resolveRuntimeUnassigned(`${loopDef.name} pick ${current.picksCompleted + 1} pre-submit cleanup`);
          }
          return { status: "ready" };
        },
        loadChallenges: async () => {
          if (dryRun) await refreshInventoryCaches(`${loopDef.name} dry-run`, { includePacks: false, quiet: true });
          const set = await findSbcSetForLoopDef(loopDef, loopDef.name);
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
        listPendingPicks: async ({ minimumCount, phase }) => listUnassignedPlayerPicksForLoop(
          loopDef,
          phase === "initial" ? 1 : 10,
          {
            minimumCount,
            quietMissing: phase === "initial",
            failOnUnexpected: true
          }
        ),
        onEvent: async (event, payload) => {
          if (event === "queue") {
            log(`${loopDef.name}: queued ${payload.queuedCount}/${maxPicks} matching Player Pick reward(s)`);
          } else if (event === "batch-open") {
            log(`${loopDef.name}: submission phase ended; opening ${payload.queuedCount} queued Player Pick reward(s)`);
          }
        },
        afterPick: async ({ result: current, resumed }) => {
          if (resumed) {
            const targetLabel = loopDef.exhaustSbcSet === true ? "available Pick(s)" : `${maxPicks} requested completion(s)`;
            log(`${loopDef.name}: resumed Player Pick ${current.picksCompleted}/${maxPicks} ${targetLabel}`);
          }
          if (!dryRun) await sleep(CFG.pauseMs);
        }
      });
      if (dryRun) {
        log(`${loopDef.name}: dry-run planned ${result.challengesPlanned} challenge(s)`);
        log(`${loopDef.name}: dry run stops before submitting SBCs, redeeming Picks, or moving items`);
      } else if (result.status !== "completed") {
        log(`${loopDef.name}: failed (${result.status}): ${result.reason || "unknown Player Pick failure"}`);
      } else {
        const targetLabel = loopDef.exhaustSbcSet === true ? "available" : "requested";
        log(`${loopDef.name}: completed ${result.picksCompleted}/${maxPicks} ${targetLabel} Player Pick(s)${openPicksAtEnd ? `; queued ${result.picksQueued}` : ""}`);
      }
      return result;
    }
    function showPickRecapModal(loopDef, pickResults, result = {}) {
      return showPlayerPickRecap({
        dom: adapters.dom,
        name: loopDef?.name,
        pickResults,
        status: result.status,
        reason: result.reason,
        itemDisplayName,
        resolveNativeTheme: (item) => eaRarityAdapter.playerTheme(item),
        formatPrice: formatCompactPrice,
        scheduleStopCheck: setInterval,
        cancelStopCheck: clearInterval,
        isStopping: () => state.stopping,
        onClose: () => {
          const recapButton = document.querySelector("#bronze-loop-recap-reopen");
          if (recapButton) {
            recapButton.textContent = "View recap";
            recapButton.style.background = "";
          }
        },
        celebrate: (dialog, specialCount) => triggerRewardFireworks(dialog, specialCount, {
          dom: adapters.dom,
          getComputedStyle: (element) => getComputedStyle(element),
          devicePixelRatio: () => window.devicePixelRatio || 1,
          now: () => performance.now(),
          requestFrame: (callback) => requestAnimationFrame(callback)
        })
      });
    }
    function showBatchRecapModal(model) {
      return showBatchOpenRecap({
        dom: adapters.dom,
        model,
        formatPrice: formatCompactPrice,
        onClose: () => {
          const recapButton = document.querySelector("#bronze-loop-recap-reopen");
          if (recapButton) {
            recapButton.textContent = "View recap";
            recapButton.style.background = "";
          }
        },
        celebrate: (dialog, specialCount) => triggerRewardFireworks(dialog, specialCount, {
          dom: adapters.dom,
          getComputedStyle: (element) => getComputedStyle(element),
          devicePixelRatio: () => window.devicePixelRatio || 1,
          now: () => performance.now(),
          requestFrame: (callback) => requestAnimationFrame(callback)
        })
      });
    }
    function previewBatchOpenRecap() {
      return showBatchRecapModal(createBatchOpenRecapPreviewModel());
    }
    function previewPlayerPickRecap() {
      return showPlayerPickRecap({
        dom: adapters.dom,
        model: createPlayerPickRecapPreviewModel({
          itemDisplayName
        }),
        formatPrice: formatCompactPrice,
        scheduleStopCheck: setInterval,
        cancelStopCheck: clearInterval,
        isStopping: () => false,
        celebrate: (dialog, specialCount) => triggerRewardFireworks(dialog, specialCount, {
          dom: adapters.dom,
          getComputedStyle: (element) => getComputedStyle(element),
          devicePixelRatio: () => window.devicePixelRatio || 1,
          now: () => performance.now(),
          requestFrame: (callback) => requestAnimationFrame(callback)
        })
      });
    }
    async function getBatchOpenSpecialPrices(items) {
      const specialItems = (items || []).filter((item) => item?.special === true || Number(item?.rareflag ?? item?.rareFlag ?? 0) > 1);
      if (!specialItems.length) return /* @__PURE__ */ new Map();
      let result;
      try {
        result = await loadPlayerPickPrices({
          items: specialItems,
          platform: "pc",
          referer: pageRuntime.origin(),
          requestText: adapters.http.getText
        });
      } catch (error) {
        log(`Batch Open: special card price lookup failed (${error?.message || error}); recap will show price:?`);
        return /* @__PURE__ */ new Map();
      }
      for (const attempt of result.attempts) {
        if (attempt.status === "loaded") {
          log(`Batch Open: ${attempt.source} prices loaded for ${result.prices.size}/${result.ids.length} special card(s)`);
        } else if (attempt.source === "FUT.GG") {
          log(`Batch Open: FUT.GG price lookup ${attempt.status}${attempt.reason ? ` (${attempt.reason})` : ""}; trying FUTNext`);
        } else {
          log(`Batch Open: FUTNext price lookup ${attempt.status}${attempt.reason ? ` (${attempt.reason})` : ""}; unavailable prices will show as ?`);
        }
      }
      return result.prices;
    }
    function loadBatchOpenPlan() {
      try {
        return normalizeBatchOpenPlan(adapters.localStorage.getJson(BATCH_OPEN_PLAN_KEY, {}));
      } catch {
        return normalizeBatchOpenPlan();
      }
    }
    function persistBatchOpenPlan(plan) {
      const normalized = normalizeBatchOpenPlan(plan);
      adapters.localStorage.setJson(BATCH_OPEN_PLAN_KEY, normalized);
      return normalized;
    }
    async function executeBatchOpen(planInput) {
      if (state.running) return null;
      const savedPlan = persistBatchOpenPlan(planInput);
      state.running = true;
      state.stopping = false;
      setPanelState();
      let result = null;
      let recapModel = null;
      try {
        await refreshStorePacks().catch((error) => {
          log(`Batch Open: start-time My Packs refresh failed; using current cache (${error?.message || error})`);
        });
        const plan = materializeBatchOpenPlan(savedPlan, getPackInventorySnapshot());
        const requested = plan.entries.reduce((sum, entry) => sum + entry.quantity, 0);
        let packQueue = null;
        log(`Batch Open: starting ${requested} requested pack(s) across ${plan.entries.length} pack type(s)`);
        result = await runBatchOpenWorkflow({
          plan,
          shouldStop: () => state.stopping,
          beforeStart: async () => resolveRuntimeUnassigned("Batch Open preflight", {
            blockedPolicy: "preserve",
            enableRecovery: true
          }),
          resolvePack: async (entry) => {
            if (!packQueue) {
              packQueue = createPackInstanceQueue(getAvailableRepositoryMyPacks(), { getName: packName });
            }
            return packQueue.take(entry);
          },
          openPack: async ({ entry, pack, openIndex }) => await openPack(
            pack,
            `Batch Open ${entry.packName || `#${entry.packId}`} ${openIndex + 1}/${entry.quantity}`,
            {
              allowGone: true,
              allowPendingItems: true,
              reusePackOn471: true,
              retryCodes: ["471", "500"],
              openedItemPolicy: createMaterializeAndResolvePolicy(
                `Batch Open ${entry.packName || `#${entry.packId}`}`,
                `Batch Open ${entry.packName || `#${entry.packId}`} cleanup`,
                { blockedPolicy: "preserve", enableRecovery: true, directDuplicateFallback: true }
              )
            }
          ),
          onEvent: async (event, payload) => {
            if (event === "opened") {
              log(`Batch Open: ${payload.packsOpened}/${payload.requestedPacks} pack(s) opened`);
            } else if (event === "unavailable") {
              log(`Batch Open: ${payload.entry.packName || `#${payload.entry.packId}`} unavailable; skipped ${payload.remaining} requested pack(s)`);
            } else if (event === "preserved") {
              log(`Batch Open: Unassigned items were preserved after ${payload.entry.packName || `#${payload.entry.packId}`}; stopping before ${payload.remaining} remaining pack(s) in this type`);
            } else if (event === "preflight-preserved") {
              log(`Batch Open: existing Unassigned items cannot be safely resolved (${payload.preflight.reason || "capacity blocked"}); no pack will be opened`);
            } else if (event === "pending") {
              log(`Batch Open: opened items remain unresolved after ${payload.entry.packName || `#${payload.entry.packId}`}; stopping before ${payload.remaining} remaining pack(s)`);
            } else if (event === "blocked") {
              log(`Batch Open: blocked at ${payload.entry.packName || `#${payload.entry.packId}`}; ${payload.entryResult.reason || "pack open failed"}`);
            }
          }
        });
        const prices = await getBatchOpenSpecialPrices(result.openedItems);
        recapModel = createBatchOpenRecapModel({
          ...result,
          prices,
          resolveNativeTheme: (item) => eaRarityAdapter.playerTheme(item)
        });
        state.lastBatchRecap = { model: recapModel, completedAt: Date.now() };
        state.lastRecapType = "batch";
        log(`Batch Open: ${result.status}${result.reason ? ` (${result.reason})` : ""}; opened ${result.packsOpened}/${result.requestedPacks}, skipped ${result.skippedPacks}`);
        updateRecapButton();
        return recapModel;
      } catch (error) {
        log(`Batch Open stopped: ${error?.message || error}`);
        errorStackLines(error).forEach((line) => log(`Error stack: ${line}`));
        console.error("[BronzeLoop]", error);
        const fallbackPlan = materializeBatchOpenPlan(savedPlan, getPackInventorySnapshot());
        const requestedPacks = fallbackPlan.entries.reduce((sum, entry) => sum + entry.quantity, 0);
        recapModel = createBatchOpenRecapModel({
          ...result || {},
          requestedPacks: result?.requestedPacks ?? requestedPacks,
          status: "blocked",
          reason: error?.message || error,
          resolveNativeTheme: (item) => eaRarityAdapter.playerTheme(item)
        });
        state.lastBatchRecap = { model: recapModel, completedAt: Date.now() };
        state.lastRecapType = "batch";
        updateRecapButton();
        return null;
      } finally {
        state.running = false;
        state.stopping = false;
        setPanelState();
        if (recapModel) void showBatchRecapModal(recapModel);
      }
    }
    async function openBatchOpenDialogModal() {
      if (state.running || state.refreshing) return false;
      state.refreshing = true;
      setPanelState();
      log("Batch Open: scanning My Packs");
      try {
        await refreshStorePacks();
      } catch (error) {
        log(`Batch Open: pack scan refresh failed; using current cache (${error?.message || error})`);
      } finally {
        state.refreshing = false;
        setPanelState();
      }
      showBatchOpenDialog({
        dom: adapters.dom,
        plan: loadBatchOpenPlan(),
        snapshot: getPackInventorySnapshot(),
        onScan: async () => {
          await refreshStorePacks();
          return getPackInventorySnapshot();
        },
        onPreview: () => previewBatchOpenRecap(),
        onPlanChange: (plan) => persistBatchOpenPlan(plan),
        onStart: (plan) => {
          persistBatchOpenPlan(plan);
          void executeBatchOpen(plan);
        }
      });
      return true;
    }
    async function runValidationBronzeUpgrade(loopDef, roundNo) {
      const dryRun = loopDef.dryRun === true;
      log(`Round ${roundNo} ${dryRun ? "dry-run " : ""}start`);
      await waitAppReady();
      const result = await runValidationRoundWorkflow({
        dryRun,
        inspectSourcePack: async () => {
          const pack = await findValidationSourcePack(loopDef);
          if (dryRun) log(`${loopDef.name}: dry-run source pack ${pack ? `${packName(pack)} (#${pack.id})` : "not found"}`);
          return pack;
        },
        inspectSbc: async () => {
          const set = await findSbcSet(loopDef.sbcNames || CFG.bronzeUpgradeNames, loopDef.name);
          const challenge = await findAvailableSbcChallenge(set, loopDef.name);
          if (!challenge) return null;
          if (dryRun) log(`${loopDef.name}: dry-run SBC found ${set.name} (#${set.id || "?"}) challenge #${challenge.id || "?"}`);
          return { set, challenge };
        },
        openSourcePack: async ({ sourcePack }) => {
          const receipt = await openSourceBronzePack(loopDef, sourcePack);
          return receipt || { status: "unavailable", reason: "source pack unavailable after refresh" };
        },
        submitSbc: async ({ sbc }) => {
          await openSbcSet(sbc.set, { challenge: sbc.challenge });
          await fillBronzeUpgradeSquad();
          const rewardPackId = await submitSbcAndGetAwardPackId(sbc.set);
          log(`Reward pack id: ${rewardPackId || "unknown"}`);
          return { status: "submitted", submitted: true, rewardPackId };
        },
        openReward: async ({ rewardPackId }) => {
          await openRewardSilverPack(rewardPackId);
          return { status: "opened" };
        },
        finalize: async (workflowResult) => {
          if (dryRun) {
            log(`${loopDef.name}: dry run stops before opening packs, filling squads, or submitting SBCs`);
            return;
          }
          if (workflowResult.status !== "completed") return;
          const remaining = await showUnassignedIfAny(`round ${roundNo} end`);
          if (remaining.length) fail2(`Round ended with ${remaining.length} unassigned item(s); stop for manual inspection`);
          log(`Round ${roundNo} done`);
        }
      });
      if (!dryRun && result.status !== "completed") {
        fail2(`${loopDef.name}: validation round ${result.status}: ${result.reason || "unknown"}`);
      }
      return result;
    }
    async function runConfiguredLoop(loopDef, roundNo = 1) {
      state.loopStack.push(loopDef);
      try {
        return await dispatchConfiguredWorkflow({
          loopDef,
          roundNo,
          log,
          runners: {
            validationBronzeUpgrade: runValidationBronzeUpgrade,
            dailyRoutine: runDailySequence,
            workflowRoutine: runWorkflowRoutine,
            dailySingleCardRecycle: runRecycleLoop,
            supplyAndCraft: runSupplyAndCraftLoop,
            provisionPackCrafting: runProvisionCraftLoop,
            rarePackTo84Upgrade: runRarePackCraftLoop,
            playerPickSbc: runPlayerPickLoop,
            fillAndVerifySbc: runFillAndVerifyLoop,
            inventoryExhaustion: runInventoryExhaustionLoop
          },
          afterStandardRun: async (definition) => {
            await showUnassignedIfAny(`${definition.name} end`);
          },
          afterPlayerPickRun: async (definition, result) => {
            const pickResults = result.pickResults || [];
            if (!pickResults.length && result.status === "completed" && !result.reason) {
              await showUnassignedIfAny(`${definition.name} end`);
              return;
            }
            state.lastPickRecap = {
              name: definition.name,
              pickResults,
              status: result.status,
              reason: result.reason,
              completedAt: Date.now()
            };
            state.lastRecapType = "pick";
            updateRecapButton();
            await showPickRecapModal(definition, pickResults, result);
            await showUnassignedIfAny(`${definition.name} end`);
          }
        });
      } finally {
        state.loopStack.pop();
      }
    }
    function getLiveRunLimit2(loopDef, rounds) {
      return getLiveRunLimit(loopDef, rounds, {
        needsAutoTotwPreflight,
        getRoutineSteps: getRoutineStepLoopDefs
      });
    }
    async function startLoop() {
      if (state.running) return;
      let loopDef = null;
      let rounds = CFG.maxRounds;
      let fsuReadiness = null;
      try {
        loopDef = getSelectedLoopDef();
        const quantity = resolveRuntimeQuantity(loopDef);
        const input = document.querySelector("#bronze-loop-rounds");
        rounds = quantity?.mode === "user" ? Math.max(quantity.min, Math.min(quantity.max, Number(input?.value || quantity.default) || quantity.default)) : 1;
        applyLoopRuntimeOptions(loopDef, {
          rounds,
          dryRun: isDryRunEnabled(),
          openRewardPacks: isOpenRewardPacksEnabled(),
          inventoryOnly: document.querySelector("#bronze-loop-daily-inventory-only")?.checked === true,
          pickOptions: getPickRuntimeOptions()
        });
        if (Number(loopDef.runtimeRounds) > 0) {
          rounds = Number(loopDef.runtimeRounds || rounds || 1);
        }
        logFsuSettingsForRun();
        fsuReadiness = fsuAdapter().readiness();
        if (fsuReadiness.detected && !fsuReadiness.ready) {
          fail2(`FSU Club player data is ${fsuReadiness.state === "loading" ? "still loading in the background" : "not ready"}; wait for the FSU player-data success notice, then click Start again`);
        }
      } catch (e) {
        log(`Stopped: ${e.message || e}`);
        errorStackLines(e).forEach((line) => log(`Error stack: ${line}`));
        console.error("[BronzeLoop]", e);
        return;
      }
      state.running = true;
      state.stopping = false;
      if (fsuReadiness?.state === "provisional") {
        log(`FSU Club cache is provisional (${fsuReadiness.cacheStatus}); selected Club players will be validated against EA before each SBC save`);
      }
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
      renderMainPanelRuntimeState({
        panel: document.querySelector("#bronze-loop-panel"),
        state: {
          running: state.running,
          refreshing: state.refreshing,
          scanningPicks: state.scanningPicks,
          loadingLoops: state.loadingLoops,
          usingBuiltIn: state.loopConfigSource === "built-in"
        }
      });
      updateLoopControls();
    }
    function installPanel() {
      const mounted = mountMainPanel({
        dom: adapters.dom,
        maxRounds: CFG.maxRounds,
        startupHidden: true
      });
      if (!mounted.created) return;
      const { panel } = mounted;
      state.logRenderer = createLogRenderer({
        getLines: () => state.logLines,
        getPanel: () => document.querySelector("#bronze-loop-panel"),
        getLatestBox: () => document.querySelector("#bronze-loop-latest"),
        getFullBox: () => document.querySelector("#bronze-loop-log"),
        formatFullLog: (lines) => formatLogHtml(lines, escapeHtml)
      });
      const savedLoopUiOptions = loadLoopUiOptions();
      state.showMvpLoops = savedLoopUiOptions.showMvpLoops;
      const savedPickOptions = loadPickRuntimeOptions();
      state.rewardAlertSettings = loadRewardAlertSettings();
      hydrateMainPanelOptions({
        panel,
        loopOptions: savedLoopUiOptions,
        pickOptions: savedPickOptions,
        rewardAlertSettings: state.rewardAlertSettings
      });
      renderRewardAlertSummary({ panel, settings: state.rewardAlertSettings });
      createMainPanelGeometry({
        panel,
        getViewport: () => ({ width: window.innerWidth, height: window.innerHeight }),
        loadPosition: () => {
          try {
            return adapters.localStorage.getJson("fc-loop-panel-pos", null);
          } catch {
            return null;
          }
        },
        savePosition: (position) => {
          try {
            adapters.localStorage.setJson("fc-loop-panel-pos", position);
          } catch {
          }
        },
        onModeChange: renderLog
      });
      renderLoopSelect();
      renderLog();
      const panelCommands = createMainPanelCommands({
        state,
        log,
        setPanelState,
        getLoopDefById,
        setLoopJson,
        editLoopConfig: editWorkflowConfig,
        applyLoopConfigEditor: applyWorkflowConfigEditor,
        updateLoopControls,
        savePickOptions: savePickRuntimeOptions,
        saveLoopOptions: saveLoopUiOptions,
        saveRewardAlertEnabled,
        openRewardAlertSettings: openRewardAlertSettingsModal,
        start: startLoop,
        openBatch: openBatchOpenDialogModal,
        reopenRecap: reopenLastRecap,
        previewPickRecap: previewPlayerPickRecap,
        refreshInventoryCaches,
        scanPlayerPicks: scanAvailablePlayerPickSbcs,
        loopConfigUrl: LOOP_CONFIG_URL,
        loadLoopConfig,
        resetLoopDefs,
        userEffects: adapters.userEffects,
        getLogText: () => state.logLines.join("\n"),
        clearLog,
        now: Date.now
      });
      bindMainPanelCommands({
        panel,
        commands: panelCommands
      });
      updateRecapButton();
      log(`Ready v${W[APP_KEY]?.version || "unknown"}. Keep FSU/Enhancer enabled before starting.`);
      setTimeout(async () => {
        try {
          await panelCommands.scanPicks();
        } finally {
          setMainPanelStartupHidden(panel, false);
        }
      }, 900);
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
