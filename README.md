# FC26 Daily Loop Runner 使用与开发说明

本文档对应脚本版本：

- `DailyLoopRunner.user.js`: `0.2.23`
- `DailyLoopRunnerHotReload.user.js`: `0.1.1`

## 1. 文件说明

主要文件都在本仓库目录。

核心文件：

- `DailyLoopRunner.user.js`: 主脚本，包含界面、默认 loop、SBC/开包/清理逻辑。
- `DailyLoopRunner.loops.json`: 可选外部 loop 配置。开发时可通过面板加载，普通使用不依赖它。
- `BronzeUpgradeLoop.user.js`: 旧文件名兼容副本，目前内容应与 `DailyLoopRunner.user.js` 保持一致。
- `DailyLoopRunnerHotReload.user.js`: 热加载辅助脚本，给页面加 `Reload Loop` 按钮。
- `StartLoopRunnerDevServer.ps1`: 本地静态文件服务，用于不刷新页面热加载主脚本。
- `FSU\【FSU】EAFC FUT WEB 增强器-26.09.user.js`: 参考插件，尤其是 SBC 填充、storage、transfer duplicate 处理逻辑。

## 2. 使用前提

Chrome 中需要启用：

- Tampermonkey
- FSU
- FC26 Enhancer
- `DailyLoopRunner.user.js`

如果要使用热加载，还需要启用：

- `DailyLoopRunnerHotReload.user.js`

进入 EA FC Web App 后，等待 FSU 加载完成，再使用右侧或悬浮的 Loop Runner 面板。

## 3. 日常使用流程

1. 打开 Web App 并手动登录。
2. 等待页面和 FSU 完全加载。
3. 在 Loop Runner 面板选择 loop。
4. 如需刷新 packs/unassigned/storage/transfer/club 缓存，点击 `Refresh caches`。
5. 如需先检查材料选择，勾选 `Dry run`。
6. 点击 `Start`。
7. 出错时优先点击 `Save Log` 或复制日志内容，查看最后几行。

`Dry run` 模式只刷新只读缓存并打印计划动作，不会移动物品、开包、保存阵容或提交 SBC。库存型 loop 会列出选中的卡、来源 pile、rating、稀有度、交易状态、item id 和 definition id。Daily Bronze/Silver 这类日常 seed loop 在没有目标重复卡或奖励包时，会只检查 seed SBC challenge 是否仍可用，方便判断每日次数是否可能已经用完。

WK 的日常 MVP live test 推荐选择 `One-click Daily MVP (1 each)`。它会按顺序跑 Bronze / Silver / Common / Rare 的 1-run MVP loop，每个日常最多提交 1 次，并在拿到对应奖励包后自动开包、清理 unassigned。测试流程：先勾 `Dry run` 跑一遍，日志看起来正常后取消 `Dry run` 再跑一次，然后立刻停下来保存日志。

确认 MVP 稳定后，需要跑满日常可以选择 `One-click Daily Loop (max 7 each)`。它会按顺序跑 Bronze / Silver / Common / Rare，每个日常最多 7 次，并在每个子步骤开始前打印 step limit。未勾 `Dry run` 时会触发二次确认，日志会写明总上限和每个子步骤上限；如果某个日常 challenge 已经没有可用次数，或材料/奖励包不足，对应流程会停止并写日志，不会继续提交该日常。

84x100 测试推荐选择 `84x100 MVP (1 run)`。它会打开目标 SBC，让 FSU/Enhancer 填阵容，然后在提交前检查当前 squad。默认保护规则：不提交特殊卡/TOTW，不提交可交易卡，不提交 89+。`Dry run` 会打印将要提交的卡和保护命中原因；live run 最多提交 1 次，奖励包默认保留不打开。

普通 `Daily Bronze Loop` / `Daily Silver Loop` / `Daily Common Loop` / `Daily Rare Loop` 仍保留完整 `maxCompletions: 7`。这些多次 live loop 在未勾 `Dry run` 时会触发二次确认：第一次点击 `Start` 只写 `Live guard` 日志，15 秒内第二次点击 `Start` 才会真正开始。

`Refresh caches` 会优先刷新 packs 和 unassigned；club/storage/transfer 会用当前 Web App 暴露的可用方法刷新。如果某个 pile 没有可用刷新方法，脚本会保留现有缓存并写日志。

选卡不够时，日志会追加 diagnostics：每个 pile 的总数、匹配数量、unique definition 数、duplicate signal 解析数量，以及主要过滤原因。

普通使用只需要启用 `DailyLoopRunner.user.js`。开发时如果启动了本地服务，可以点击 `Load loops JSON` 从 `http://127.0.0.1:8765/DailyLoopRunner.loops.json` 加载外部 loop 配置；点击 `Built-in loops` 可切回脚本内置配置。

当前默认 loop：

- `Bronze Upgrade Validation`
  - POC 验证用。
  - 开高级青铜球员包，消耗青铜重复做 `Bronze Upgrade`，再开银卡奖励包。

- `Daily Bronze Loop`
  - 做 `Daily Bronze Upgrade`。
  - 每次消耗青铜重复或库存青铜。
  - 最后一包奖励会保留不打开。

- `Daily Bronze MVP (1 run)`
  - 逻辑同 `Daily Bronze Loop`，但 `maxCompletions` 固定为 1。
  - WK 单项测试或 one-click daily 会使用这个。

- `Daily Silver Loop`
  - 做 `Daily Silver Upgrade`。
  - 逻辑同 Daily Bronze，只是目标换成银卡。

- `Daily Silver MVP (1 run)`
  - WK 第一次 live test 用这个。
  - 逻辑同 `Daily Silver Loop`，但 `maxCompletions` 固定为 1。
  - 真跑时最多提交 1 次 `Daily Silver Upgrade`，拿到的最后一包会保留不打开。
  - 建议流程：先勾 `Dry run` 确认 seed SBC available，再关 `Dry run` 真跑一次。

- `Daily Common Loop`
  - 做 `Daily Common Gold Upgrade`。
  - 需要 5 银 + 5 铜。
  - 优先使用 `SBC storage -> transfer list -> club`。
  - transfer list 里的卡不会移动回 club，而是用 `duplicateId` 找 club/storage 中可提交实体。

- `Daily Common MVP (1 run)`
  - 逻辑同 `Daily Common Loop`，但 `maxCompletions` 固定为 1。

- `Daily Rare Loop`
  - 做 `Daily Rare Gold Upgrade`。
  - 需要 5 张普通金卡。
  - 优先使用 `unassigned -> SBC storage -> transfer list`。
  - 这三处不足时先开 `11x Gold Players Pack`。
  - `11x Gold Players Pack` 也没有时，最后才使用 club。
  - 开包后保留普通金重复作为 SBC 材料，稀有金重复和其他重复按清理规则处理。

- `Daily Rare MVP (1 run)`
  - 逻辑同 `Daily Rare Loop`，但 `maxCompletions` 固定为 1。

- `One-click Daily MVP (1 each)`
  - 顺序执行 `Daily Bronze MVP (1 run)`、`Daily Silver MVP (1 run)`、`Daily Common MVP (1 run)`、`Daily Rare MVP (1 run)`。
  - 适合 WK 的第一版 live MVP，不会一口气跑完整 7 次日常。
  - 默认 `openRewardPacks: true`，每个子步骤拿到奖励包后会自动开包并清理 unassigned。
  - 暂不包含 84x10 这类会消耗特殊卡或高评分卡的 SBC。

- `One-click Daily Loop (max 7 each)`
  - 顺序执行 `Daily Bronze Loop`、`Daily Silver Loop`、`Daily Common Loop`、`Daily Rare Loop`。
  - 每个日常最多提交 7 次，适合 MVP 验证稳定后跑满当天次数。
  - 默认 `openRewardPacks: true`，每个子步骤拿到奖励包后会自动开包并清理 unassigned。
  - live run 会先触发 `Live guard`，日志会显示总提交上限和每个子步骤上限；15 秒内第二次点 `Start` 才会真正开始。

- `84x100 MVP (1 run)`
  - 打开匹配的 84x100 / 84+ x10 / `10x 84+ Upgrade` / `10 名 84+ 升级` SBC。
  - 使用 FSU/Enhancer 填阵容，但提交前由脚本检查 squad。
  - 默认 `maxSubmittedRating: 88`、`blockSpecial: true`、`blockTradeable: true`。
  - WK 第一次只跑 `Dry run`，确认日志没有 `BLOCK` 后再考虑 live run。

- `Provision Crafting Loop`
  - 每个 round 开 1 个 `Provision Pack` / `Provisions Pack`。
  - 非重复物品放入 club。
  - 普通金重复用于 `FOF Glory Hunters Crafting Upgrade`，每次 9 张。
  - 稀有金重复用于 `2x 84+ Upgrade`，每次 6 张。
  - 每类卡最后不足一组时，从 `SBC storage -> transfer list -> club` 补齐。
  - 面板中的 `rounds` 控制开多少个 Provision Pack。

## 4. Unassigned 清理规则

通用清理策略：

1. 非重复物品放入 club。
2. 可交易重复物品放入 transfer list。
3. 不可交易重复物品：
   - 如果 club 中同卡是可交易版本，则先 swap，再把可交易版本放入 transfer list。
   - 否则放入 SBC storage。
4. transfer list 或 SBC storage 空间不足时停止。

特殊保留规则：

- Daily Bronze/Silver 会保留目标重复卡用于对应 SBC。
- Daily Rare 会保留普通金重复卡用于 `Daily Rare Gold Upgrade`。
- 82+ 金卡不会被自动用于任何 SBC。重复 82+ 金卡会按通用清理规则进入 transfer list 或 SBC storage。

## 5. 热加载使用

热加载用于修改 `DailyLoopRunner.user.js` 后，不刷新 Web App 页面直接重载脚本。

启动本地服务：

```powershell
powershell -ExecutionPolicy Bypass -File ".\StartLoopRunnerDevServer.ps1"
```

保持这个 PowerShell 窗口打开。

然后在 Web App 页面点击 `Reload Loop`。

注意：

- 如果本地服务没启动，主脚本仍然能用，但修改后需要刷新页面才能生效。
- 刷新页面可能导致重新登录和 FSU 重新 loading，所以开发时建议使用热加载。
- 热加载只加载 `DailyLoopRunner.user.js`，因此开发时优先改这个文件，再同步到 `BronzeUpgradeLoop.user.js`。
- `Load loops JSON` 读取同一服务下的 `DailyLoopRunner.loops.json`，适合只改 loop 配置时使用。

## 6. 修改默认 loop

默认 loop 定义在 `DailyLoopRunner.user.js` 顶部：

```javascript
const LOOP_DEFS = [
  ...
];
```

也可以修改仓库里的 `DailyLoopRunner.loops.json`，启动本地服务后在面板点击 `Load loops JSON`。外部 JSON 可以是 loop 数组，也可以是 `{ "loops": [...] }`。

每个 loop 常用字段：

```javascript
{
  id: 'daily-common',
  name: 'Daily Common Loop',
  strategy: 'inventoryMixedUpgrade',
  sbcNames: ['Daily Common Gold Upgrade'],
  sourcePackIds: [304],
  sourcePackNames: ['Gold Players Pack'],
  rewardPackIds: [304],
  rewardPackNames: ['Gold Players Pack'],
  requirements: [
    {
      tier: 'silver',
      rarity: 'common',
      count: 5,
      playerOnly: true,
      allowSpecial: false,
      priorityPiles: ['storage', 'transfer', 'club']
    }
  ],
  priorityPiles: ['storage', 'transfer', 'club'],
  disabledPiles: ['club'],
  maxCompletions: 7
}
```

字段含义：

- `id`: 唯一 ID。
- `name`: 面板显示名称。
- `strategy`: 执行策略，对应代码里的 runner。
- `sbcNames`: SBC 名称匹配列表，中英文都可以加。
- `sourcePackIds`: 源包 ID。
- `sourcePackNames`: 源包名称匹配列表。
- `rewardPackIds`: 奖励包 ID。
- `rewardPackNames`: 奖励包名称匹配列表。
- `requirements`: SBC 材料要求。
- `priorityPiles`: 默认取卡优先级。
- `disabledPiles`: 可选，禁用某些 pile。会应用到 `priorityPiles`、`clubFallbackPiles` 和 nested upgrade 的 requirements。
- `maxCompletions`: 最多完成次数。
- `steps`: `dailyRoutine` 使用的 loop id 列表。
- `openRewardPacks`: 可选，提交后自动打开对应奖励包并清理 unassigned。
- `maxSubmittedRating`: 可选，`fillAndVerifySbc` 提交前允许的最高 rating。
- `blockSpecial`: 可选，`fillAndVerifySbc` 是否阻止特殊卡/TOTW。
- `blockTradeable`: 可选，`fillAndVerifySbc` 是否阻止可交易卡。
- `protectedItemIds`: 可选，强制保护的 item id 列表。

## 7. requirements 写法

材料规则示例：

```javascript
{ tier: 'bronze', count: 1, playerOnly: true, allowSpecial: false }
```

```javascript
{ tier: 'gold', rarity: 'common', count: 5, playerOnly: true, allowSpecial: false }
```

支持字段：

- `tier`: `bronze` / `silver` / `gold`
- `rarity`: `common` / `rare`
- `count`: 需要数量
- `playerOnly`: 是否只允许球员
- `allowSpecial`: 是否允许特殊卡
- `special`: `true` 表示只要特殊卡，`false` 表示排除特殊卡
- `priorityPiles`: 当前 requirement 单独的取卡优先级

可用 pile：

- `unassigned`
- `storage`
- `transfer`
- `club`

注意：

- 普通铜/银/金可以安全从 transfer list 选择。
- transfer list 物品不会被直接提交；脚本会用它的 `duplicateId` 找 club/storage 中可提交的实体。
- 特殊卡默认不使用，除非 JSON 中显式允许。

## 8. 自定义 loop

面板里可以编辑自定义 JSON。推荐先复制现有 loop，改名称、SBC、包名和 requirements。

点击 `Start` 前脚本会校验自定义 JSON。校验失败时不会开包或提交 SBC，而是直接在日志里列出配置错误。

会拦截的常见错误：

- 缺少 `name` 或 `strategy`。
- `strategy` 不是脚本支持的策略。
- `sbcNames`、`requirements`、`priorityPiles` 类型不对。
- `requirements[].count` 不是正数。
- `tier` / `rarity` / `priorityPiles` 写了不支持的值。
- `disabledPiles` 把某个 requirement 的可用 pile 全部禁掉。
- `provisionPackDualCrafting` 缺少源包配置、`commonUpgrade` 或 `rareUpgrade`。

示例：只用 storage 和 club 做一个普通金升级：

```json
{
  "id": "my-common-gold",
  "name": "My Common Gold Loop",
  "strategy": "inventoryMixedUpgrade",
  "sbcNames": ["Daily Rare Gold Upgrade"],
  "requirements": [
    {
      "tier": "gold",
      "rarity": "common",
      "count": 5,
      "playerOnly": true,
      "allowSpecial": false,
      "priorityPiles": ["storage", "club"]
    }
  ],
  "priorityPiles": ["storage", "club"],
  "disabledPiles": ["transfer"],
  "maxCompletions": 7
}
```

适合直接自定义的策略：

- `inventoryMixedUpgrade`
  - 固定从库存来源选材料，然后提交 SBC。
  - 适合“消耗 N 张某类卡做 SBC”。

- `dailySingleCardRecycle`
  - 开奖励包，保留目标重复卡，循环做单卡 SBC。
  - 适合 Daily Bronze / Daily Silver。

- `dailyRoutine`
  - 按 `steps` 指定的 loop id 顺序执行多个已有 loop。
  - 适合“一键日常”这种组合流程。

- `fillAndVerifySbc`
  - 打开一个 SBC，让 FSU/Enhancer 填阵容，再由脚本在提交前检查 squad。
  - 适合 84x100 这种需要先做保护层的高风险 SBC。

- `provisionPackDualCrafting`
  - 每轮开一个源包，同时处理两类重复卡到两个不同 SBC。
  - 适合 Provision Pack 这类“普金/稀有金分流消耗”的活动包。

不建议只靠 JSON 解决的场景：

- 需要根据开包结果动态决定下一步。
- 需要同时管理多个源包和多个材料池。
- 需要根据 SBC 剩余次数、unassigned 状态、transfer/storage 容量做复杂分支。

这种情况应新增 strategy。

## 9. 添加新 strategy

新增 strategy 的步骤：

1. 在 `LOOP_DEFS` 增加配置。
2. 写一个 runner 函数，例如：

```javascript
async function runMyNewLoop(loopDef) {
  await waitAppReady();
  ...
}
```

3. 在 `runConfiguredLoop` 中接入：

```javascript
if (loopDef.strategy === 'myNewStrategy') {
  await runMyNewLoop(loopDef);
  await showUnassignedIfAny(`${loopDef.name} end`);
  return;
}
```

4. 运行语法检查：

```powershell
node --check ".\DailyLoopRunner.user.js"
```

5. 如果你仍在维护旧文件名副本，语法检查通过后同步：

```powershell
Copy-Item -LiteralPath ".\DailyLoopRunner.user.js" -Destination ".\BronzeUpgradeLoop.user.js" -Force
```

6. 热加载或刷新页面测试。

## 10. 关键函数索引

脚本里的重要函数：

- `waitAppReady()`
  - 等待 FUT services/repositories 可用。

- `refreshStorePacks()`
  - 刷新可用包列表。

- `refreshUnassigned()`
  - 刷新 unassigned items。

- `refreshInventoryCaches(reason, options)`
  - 刷新 packs、unassigned 以及可用的 club/storage/transfer 缓存。
  - 在库存选卡前会静默尝试刷新，以减少 stale cache。

- `loadLoopConfig(url)`
  - 从本地 JSON 加载 loop 定义并重绘面板下拉框。
  - 加载失败时保留当前 loop 定义。

- `clearUnassigned(reason, options)`
  - 清理 unassigned。
  - `options.reserveItem` 可保留某些卡不清理。

- `openPack(pack, purpose, options)`
  - 开包并返回 items。
  - `options.allowGone` 为 true 时，遇到 EA 返回 404 的 stale pack 会标记并跳过。

- `findSbcSet(names, label)`
  - 按名称找 SBC set。

- `openSbcSet(set, options)`
  - 打开 SBC 挑战页面。

- `selectInventoryPlayers(requirements, priorityPiles)`
  - 按规则从 pile 选材料。
  - 已处理 transfer duplicateId 解析。

- `logSelectionDiagnostics(label, selection, fallbackPriorityPiles)`
  - 选卡不够时输出每个 pile 的候选统计和过滤原因。

- `validateLoopDef(loopDef)`
  - 校验默认或自定义 loop 配置。
  - 在开包或提交 SBC 前拦截明显错误。

- `runDryRunLoop(loopDef)`
  - 只读检查 loop 会做什么。
  - 不移动物品、不开包、不保存阵容、不提交 SBC。

- `prepareInventorySelection(loopDef, selection)`
  - 提交前二次准备。

- `saveChallengeSquad(challenge, players, label)`
  - 保存 SBC 阵容。

- `submitSbcAndGetAwardPackId(set)`
  - 点击提交并尝试识别奖励包。

- `runDailySingleCardRecycle(loopDef)`
  - Daily Bronze/Silver 的策略。

- `runInventoryMixedUpgrade(loopDef)`
  - Daily Common 的策略。

- `runCommonGoldToRareUpgrade(loopDef)`
  - Daily Rare 的策略。

## 11. 调试方法

常规调试：

1. 面板点击 `Clear Log` 清空旧日志。
2. 跑一次 loop。
3. 出错后点击 `Save Log`。
4. 查看：

保存路径由浏览器下载设置决定，文件名形如 `bronze-loop-*.log`。

常见错误：

- `Source pack not found`
  - 当前没有目标源包。
  - 检查 `sourcePackIds/sourcePackNames`。

- `SBC not found`
  - SBC 名称匹配失败。
  - 在日志中的 loaded SBC 列表里找真实名称，补进 `sbcNames`。

- `saveChallenge failed: 475`
  - 通常是材料实体不可提交，或阵容不满足服务端要求。
  - 优先检查 transfer duplicateId 解析、unassigned 重复卡、同 definitionId 重复选择。

- `selected inventory players did not satisfy SBC requirements`
  - UI 提交按钮不可用。
  - 可能是材料数量、稀有度、特殊卡、同卡重复、阵型槽位映射问题。

- `diagnostics for ...`
  - 选卡不够时的候选诊断。
  - 常见过滤原因包括 `protected-82-plus`、`special-blocked`、`rarity-not-common`、`duplicate-signal-unresolved`、`active-trade`。

- `Transfer list has only ... slot(s)`
  - transfer list 满或空间不足。

- `SBC storage has only ... slot(s)`
  - SBC storage 满或空间不足。

## 12. 开发约定

建议保持以下约定：

- 先改 `DailyLoopRunner.user.js`。
- 每次修改后跑：

```powershell
node --check ".\DailyLoopRunner.user.js"
```

- 如果你仍在维护旧文件名副本，通过后同步：

```powershell
Copy-Item -LiteralPath ".\DailyLoopRunner.user.js" -Destination ".\BronzeUpgradeLoop.user.js" -Force
```

- 使用热加载测试。
- 日志要写清楚当前动作、选中数量、来源 pile、失败原因。
- 新增复杂策略时，不要把所有逻辑塞进 JSON；JSON 负责规则，strategy 负责流程。

## 13. 后续开发建议

优先级较高：

1. 把 `Daily Rare Loop` 跑稳定。

中期可以做：

1. 做一个规则编辑器，避免直接写 JSON。
2. 保存多套用户自定义 loop。
3. 增加“每步确认”模式。
4. 增加容量预检查：transfer/storage 空间不足时提前停止。
5. 增加更完整的 pack ID/name 映射表。

不建议短期做：

- 自动登录。
- 高频交易市场扫卡。
- 绕过 EA 的每日次数和购买限制。

## 14. 当前已知限制

- 脚本依赖 Web App 内部对象，EA 更新后可能失效。
- FSU 加载慢或未加载完成时，部分按钮/状态可能不可用。
- transfer list 的旧缓存可能导致候选失效，当前已在选择阶段尽量跳过，但仍可能需要刷新页面或重新进入相关页面刷新缓存。
- SBC 的服务端校验比 UI 更严格，UI 显示可提交不代表 `saveChallenge` 一定成功。
- 中文名称在脚本中可能出现编码显示异常，所以匹配时建议同时保留英文名称和包 ID。
