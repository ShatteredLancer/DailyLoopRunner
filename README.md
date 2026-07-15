# FC26 Daily Loop Runner 使用与开发说明

本文档对应脚本版本：

- `DailyLoopRunner.user.js`: `0.4.21`
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

Runner 会读取并跟随 FSU 的 SBC ignore player configuration，例如 Only Untradeable、Exclude Evolution、排除指定联赛、Golden Player Range、storage 优先、普通/稀有优先级和 Lock player；84x10 等 FSU 自动填阵容的 loop 仍会在提交前执行 Runner 自己的特殊卡与阵容安全检查。

`0.2.83` 起直接读取 FSU 26.09 暴露的 `window.info.build`、`window.info.set` 和 `window.info.lock`，对应 Tampermonkey GM storage 的 `build`、`set`、`lock_26`。日志的 source 应显示 `window.info.build/set`，不再把 EA 的 `LocalStorageVersion` 误判为 FSU 设置。

`0.2.84` 增加了普通金卡和 FSU 过滤冲突的诊断；材料不足且确实受到 FSU 过滤时，日志会汇总生效的 FSU guard，并明确提示应调整哪项 FSU 设置。

`0.2.85` 将普通金卡和 84+ TOTW 前置的配置上限放宽到 `99`。`0.2.86` 起不再由 Runner 绕过普通金卡过滤，而是以 FSU 为唯一材料策略来源：`Only Untradeable`、`Exclude designated league`、`Exclude Evolution`、Golden Player Range 和 Lock player 都实时跟随 FSU。Runner 的 `99` 只是绝对上限，实际普通金卡上限取 Runner 与 FSU Golden Player Range 的较低值；特殊卡仍受类型、数量、交易状态和 `maxSubmittedRating` 保护。

Inventory-first SBC 会在选人阶段按 `definitionId` 去重，避免同一球员的两张重复卡被选入同一套 SBC 后保存时只剩 10/11 人。内置 loop 的可交易卡策略跟随 FSU `Only Untradeable` 和 Lock player；只有自定义 JSON 显式设置 `blockTradeable: true` 才会额外拦截可交易卡。

多轮 inventory-first loop 如果中途材料不足，会记录缺少的 requirement diagnostics，并正常结束本次 run，保留已经成功提交的次数。

84x10 的 TOTW/TOTS/FOF preflight 会识别 TOTW groups 标记，并在找不到 eligible 特卡时打印候选特卡被排除的原因，例如评分超过提交上限、可交易、不是指定特卡类型或本轮已被消耗。

## 3. 日常使用流程

1. 打开 Web App 并手动登录。
2. 等待页面和 FSU 完全加载。
3. 在 Loop Runner 面板选择 loop。
4. 如需刷新 packs/unassigned/storage/transfer/club 缓存，点击 `Refresh caches`。
5. 如需先检查材料选择，勾选 `Dry run`。
6. 点击 `Start`。
7. 出错时优先点击 `Save Log` 或复制日志内容，查看最后几行。

`Dry run` 模式只刷新只读缓存并打印计划动作，不会移动物品、开包、保存阵容或提交 SBC。库存型 loop 会列出选中的卡、来源 pile、rating、稀有度、交易状态、item id 和 definition id。

日常只从两个 One-click 入口运行：测试选 `One-click Daily MVP (1 each)`，每个日常最多提交 1 次；跑满当天次数选 `One-click Daily Loop (max 7 each)`，每个日常最多提交 7 次。单项 Bronze / Silver / Common / Rare 及其 1-run 版本仅供 One-click 内部调用，已从下拉菜单隐藏。所有 loop 的 live run 都是一次点击 `Start` 直接开始；如果某个日常 challenge 已经没有可用次数，或材料/奖励包不足，对应流程会停止并写日志，不会继续提交该日常。

84x10 测试推荐选择 `84x10 MVP (1 run)`。它会打开目标 SBC，让 FSU/Enhancer 填阵容，然后在提交前检查当前 squad。当前规则是：只允许挑战要求的 1 张 84-88 TOTW/TOTS/FOF，额外特殊卡和可交易特殊卡仍会拦截；普通金卡的交易状态、联赛、Evolution、评分范围和 Lock 完全跟随 FSU。如果库存里没有合格 84+ TOTW/TOTS/FOF，live run 会先做 1 次 `84+ TOTW Upgrade`、点击 `Claim Rewards` 并自动开包拿到 TOTW；如果 FSU 放错特殊卡，Runner 会优先保留已有合格卡，或注入最低评分的合格 84-88 TOTW/TOTS/FOF，再替换低于 84 或多余/违规的特殊卡。若 submit 仍不亮，live run 会最多尝试 8 次使用 FSU 允许且不超过 loop 绝对上限的普通金补分。`0.2.71` 起可在 FSU 只填 requirement special 时补齐剩余槽位；`0.2.73` 起 repair 候选只从 `storage` / `club` 取，避免 EA `saveChallenge 475`；`0.2.74` 起不再自动点击 requirement 右侧 `Add`；`0.2.75` 起不再把 FC25 的 group 23 误认成 TOTW；`0.2.77` 起可用 `AltRight` 领取奖励；`0.2.78` 起会打开 Store/Packs 刷新包缓存；`0.2.79` 至 `0.2.81` 完成了自动 TOTW 奖励对象重绑定、入库等待和新 84x10 控制器等待。MVP 通过后可选择 `84x10 Loop (max 7)` 跑满最多 7 次；点击一次 `Start` 即执行，最多 7 次目标 SBC，并在缺合格特殊卡时每次最多补 1 次自动 `84+ TOTW Upgrade`。`Dry run` 不会提交 SBC，84x10 奖励包默认保留不打开。
`0.2.82` 起，单独 `84+ TOTW Upgrade` Loop 和 84x10 的自动 TOTW 前置会在安全材料不足时打印最终评分分布并正常停止，不再抛出泛化错误栈；普通金卡的绝对上限为 `99`，实际仍受 FSU Golden Player Range 约束，requirement special 限制在 84-88。
如果 FSU 填了 11 人但提交按钮仍不可用，dry-run 会继续打印 squad inspection，并标记 live run 不会提交。
`10x 84+ Upgrade` 这类要求 1 张 TOTW/TOTS/FOF 的 SBC 会先确认可用 84+ TOTW/TOTS/FOF，不足时先做 `84+ TOTW Upgrade`；随后 Runner 自己注入最低评分的合格 special，再由 FSU/Runner 补齐其它槽位。保护层只允许这 1 张 84+ TOTW/TOTS/FOF，且仍受 `maxSubmittedRating` 和不可交易检查限制。

`84+ TOTW Upgrade Loop` 可以单独选择，`rounds` 控制提交次数；它会自动领取并打开 TOTW 奖励包，遇到 stale pack 会刷新后继续找下一个可用 TOTW 包候选。
如果保存后 squad 人数少于当前 SBC/配方需要的人数，日志会显示类似 `player-count 10/11`，live run 会优先补空位，再尝试评分修复。
如果 dry-run 检测到 `rating-over-88`、额外 special、可交易卡或缺少 special requirement，日志会输出 `manual fix`，标明需要手动替换的 slot、item id、definition id 和原因。

`Refresh caches` 会优先刷新 packs 和 unassigned；club/storage/transfer 会用当前 Web App 暴露的可用方法刷新。如果某个 pile 没有可用刷新方法，脚本会保留现有缓存并写日志。

选卡不够时，日志会追加 diagnostics：每个 pile 的总数、匹配数量、unique definition 数、duplicate signal 解析数量，以及主要过滤原因。若 FSU 锁卡被识别，`FSU settings sync` 会显示 `locked:n`，被排除的卡会计入 `fsu-locked-player`。`0.2.69` 起会同时匹配 FSU lock 中的 item/resource/definition/asset/guid 类 ID，并从 `_data`、`_staticData`、`assetData`、`_item`、`player`、`rawData` 等容器读取卡片身份，避免 FSU Lock player 的卡被 FSU 填阵容或 Runner 自己的评分修复重新选上。`0.2.70` 起 unassigned 刷新遇到 EA 偶发 `unknown` 时会先重试，失败后保留并使用当前缓存继续收尾，避免 rare pack/2x84 连跑时一次刷新抖动直接中断。

普通使用只需要启用 `DailyLoopRunner.user.js`。开发时如果启动了本地服务，可以点击 `Load loops JSON` 从 `http://127.0.0.1:8765/DailyLoopRunner.loops.json` 加载外部 loop 配置；点击 `Built-in loops` 可切回脚本内置配置。

当前下拉菜单可见 loop：

- `Bronze Upgrade Validation`
  - POC 验证用。
  - 开高级青铜球员包，消耗青铜重复做 `Bronze Upgrade`，再开银卡奖励包。

- `One-click Daily MVP (1 each)`
  - 每个日常子步骤最多执行 1 次，适合先做小范围 live 验证。
  - 单项日常定义只供本入口内部调用，不在下拉菜单中显示。
  - 暂不包含 84x10 这类会消耗特殊卡或高评分卡的 SBC。

- `One-click Daily Loop (max 7 each)`
  - 按日常顺序执行，每个日常最多提交 7 次，并按当天实际剩余次数停止。
  - 会继续使用隐藏的单项日常定义；它们不是独立的面板入口。
  - 点击一次 `Start` 后直接按每个子步骤当天实际剩余次数执行。

- `84x10 MVP (1 run)`
  - 打开匹配的 84x10 / 84+ x10 / `10x 84+ Upgrade` / `10 名 84+ 升级` SBC。
  - 若没有可提交的 84+ TOTW/TOTS/FOF，会先提交 1 次 `84+ TOTW Upgrade`，自动打开 TOTW 奖励包并刷新库存。
  - 若 FSU 补全后特殊卡不符合要求，会生成 required special repair plan：优先保留已有合格 84+ TOTW/TOTS/FOF，替换低于 84 的 requirement special 或多余/违规特殊卡，再保存并重新检查。
  - 若保护检查通过但 submit 仍不亮，会最多尝试 8 次用 FSU 允许的普通金补分并重新保存检查；有效上限取 FSU Golden Player Range 与 `99` 的较低值，唯一 requirement special 仍限制为 `<=88`。
  - 使用 FSU/Enhancer 填阵容，但提交前由脚本检查 squad。
  - 默认 `maxSubmittedRating: 88`、`maxNormalGoldSubmittedRating: 99`、`requiredSpecialCount: 1`、`requiredSpecialKind: totw-tots-fof`、`requiredSpecialMinRating: 84`、`allowedSpecialCount: 1`、`blockTradeable: true`。普通金卡是否允许交易卡由 FSU `Only Untradeable` 决定，`blockTradeable` 继续保护特殊卡/非普通金材料。
  - 自动 TOTW 前置 SBC 默认 `maxSubmittedRating: 88`、`maxNormalGoldSubmittedRating: 99`、`blockSpecial: true`、`blockTradeable: true`，rare gold 配置绝对范围为 82-99，并优先从低分材料开始；FSU 关闭 `Only Untradeable` 时，可交易普通金卡也可用于补分。
  - WK 第一次只跑 `Dry run`，确认日志没有 `BLOCK` 后再考虑 live run。

- `84x10 Loop (max 7)`
  - 逻辑同 `84x10 MVP (1 run)`，但 `maxCompletions: 7` 且 `allowMultipleCompletions: true`。
  - 点击一次 `Start` 后直接执行；最多 7 次 `10x 84+ Upgrade`，并在每次缺少合格特殊卡时最多补 1 次 `84+ TOTW Upgrade`。
  - 奖励包默认保留不打开，避免连跑时处理高价值 unassigned 结果。

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
- 82+ 金卡保护只用于日常升级 loop。特殊 SBC，例如 84x10，有自己的提交前保护：默认只允许 1 张 84-88 的 TOTW/TOTS/FOF，不允许额外特殊卡或可交易卡。

## 4.1 当前 Daily 行为（0.4.21）

以下规则以当前脚本和 `DailyLoopRunner.loops.json` 为准；本文档中较早版本的行为描述如有冲突，以本节为准。

`0.4.21` 修复 `743850a` 冲突合并造成的 Daily 回归：恢复 Daily 剩余次数预检、Daily Common 缺料补包、My Packs 实例计数、Storage 溢出保留、Rare Pack 471 恢复和非高分 SBC 的 82+ 材料保护；SBC challenge 查询临时超时时最多重试 3 次。

- 面板默认是简洁模式：loop 选择、`Start`、`Stop` 和最新日志。点击 `Options` 后展开运行选项、配置操作和完整日志，此时简洁日志会隐藏。展开按钮显示 `Hide`；两个模式切换或从 `L` 恢复时都会回到各自默认尺寸，缩放不能小于当前模式的默认尺寸。`L` 可收成可拖动的小图标。
- `Refresh caches` 会记录 My Packs 的实例数量。相同 pack id 的多个包会分别计数，奖励包检测也按同类包的数量变化判断。
- `One-click Daily` 会先读取每个 Daily SBC set 的 `isComplete()`、`timesCompleted` 和 `repeats`。已完成的子步骤会跳过；未完成的子步骤只运行当天实际剩余次数，而不是固定再跑 7 次。完整 One-click 顺序为 Bronze、Silver、Common、Rare、Daily Rare Pack to 2x84+。
- `openRewardPacks` 默认关闭。Daily Bronze/Silver 完成最后一次 SBC 后，最后的奖励包保留不打开。
- Daily Common 的材料优先级为 `unassigned -> SBC storage -> transfer list`。5 银或 5 铜不足时，依次尝试开 Bronze Players Premium 和 Silver Players Premium；仍不足时才使用 club。若未分配不可交易重复卡多于 SBC Storage 空位，会保留它们给当前 SBC、跳过后续补货包，并改用 `unassigned -> storage -> transfer -> club` 尝试填阵。
- 82+ 金卡保护适用于所有非高分 SBC 的普通金/稀有金材料路径：Daily Rare、Daily Rare Pack to 2x84+、Provision Crafting 的 FOF 普金升级和 2x84+ 稀有金升级都只会使用 81 及以下的普通金卡。82+ 重复卡按常规清理规则进入 Transfer List 或 SBC Storage。`84x10` 与 `84+ TOTW` 是明确例外，仍按各自 SBC 评分和特殊卡要求选人。

## 4.2 Player Pick Loop

`1 of 5 83+ Player Pick` 每次严格提交 4 张普通稀有金；`5 of 10 82+ Player Pick` 每次完成两个 Challenge，两个阵都严格提交 11 张普通普金。两条 Pick loop 都强制保护 82+ 普通金卡，只会使用 81 及以下材料；配置层和提交前硬校验会同时拦截高分卡、FSU 锁定卡、概念卡和不满足 FSU 设置的材料。默认各做 1 个 Pick；在 Options 中调整 `rounds` 可设定本次要做的 Pick 数量。

Pick 结果按评分、特殊卡、非重复、价格排序。价格优先尝试携带浏览器上下文访问 FUT.GG；FUT.GG 被拒绝或没有返回有效报价时自动回退 FUTNext。所有 Pick 候选都会查询价格，并在 Pick 汇总中显示已取得的报价；所有候选低于自动选择阈值时仍保持自动选择，不会因价格而弹出手动选择。Options 提供两个持久化的 Pick 开关及阈值，默认都开启：`Protect Pick fodder >= 82` 会禁止 Pick SBC 使用评分大于等于 82 的普通金材料，并在实际保存的阵容上再次校验；其阈值可设为 `2-99`，关闭后会解除内置 Pick 的材料评分上限。`Auto-pick below 90` 的阈值可设为 `1-99`；开启时，全体候选低于该值的 Pick 不需要人工选择，关闭后按标准特殊卡、重复和价格边界规则决定是否要求人工确认。最高评分档有两张或更多特殊卡时，或会影响选取边界的同类候选缺少价格时，Runner 会弹出手动选择窗口并等待确认。Runner 只会兑换与当前 loop 匹配的未分配 Pick；看到其它 Pick 会立即停止，保留给手动处理。重复检测覆盖 Club、SBC Storage、Transfer List 和 Unassigned。普通自动选择和手动选择完成后都会按既有 Unassigned 清理规则入 Club、Transfer List 或 SBC Storage。运行前应关闭其它插件的 Player Pick 自动选择，避免两个脚本同时确认同一个 Pick。

### WK 单击条款

我们曾短暂地为 WK 的手指设计过二次确认：点一次不算，十五秒内再点一次，系统才肯相信这不是一次误触。实践证明，这套制度主要拦住了真正想干活的人，风险本人毫发无伤。现已撤销。现在选好 loop，点一次 `Start`，事情就开始；该锁的卡锁好，剩下的让脚本自己承担。
- Provision Crafting 每轮开 1 个 Provision Pack，然后分别处理低分普通金重复卡到 FOF Glory Hunters Crafting Upgrade（9 张）和低分稀有金重复卡到 2x84+ Upgrade（6 张）。不足一组时才按 `unassigned -> storage -> transfer -> club` 补齐。

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
- `maxNormalGoldSubmittedRating`: 可选，普通金卡的绝对最高 rating；实际有效上限取该值与 FSU Golden Player Range 的较低值。84x10 和自动 TOTW 前置默认绝对上限为 `99`，requirement special 仍到 `88`。
- `requiredSpecialKind`: 可选，目前支持 `totw` 或 `totw-tots-fof`。用于限制 requirement special 的类型，普通 special 不会被当成合格材料。
- `requiredSpecialMinRating`: 可选，要求特殊卡的最低 rating；84x10 默认用 `84`，避免把低评分 TOTW/TOTS/FOF 当成可提交材料。
- `autoTotwUpgrade`: 可选，对象或 `false`。当要求 TOTW/TOTS/FOF 但库存没有可用 requirement special 时，live run 会先打开已有的 84+ TOTW 奖励包；如果仍没有可用卡，再执行该 TOTW 前置 SBC、领取奖励、开包，并把开出的球员临时按 TOTW reward item 处理。设为 `false` 可关闭自动补 TOTW。
- 自动 TOTW 开包会合并 Store service 返回和本地 repository 的 pack cache；领奖后 pack 入库较慢时，会等待更久再尝试开包。
- 连续运行时，提交成功后会把本次 11 张材料标记为已消耗，并从临时 TOTW/recent 缓存中移除，避免第二轮重复引用已经提交掉的 reward item。
- FSU 兼容：开出 TOTW 包后，Runner 会在调用 FSU 前补齐当前缓存球员上缺失的 league/club/nation 数组字段，避免 FSU 对新 reward item 读取 `undefined.length` 中断。
- `blockSpecial`: 可选，`fillAndVerifySbc` 是否阻止特殊卡/TOTW。
- `blockTradeable`: 可选，`fillAndVerifySbc` 是否阻止可交易卡。普通金卡是否允许交易卡跟随 FSU `Only Untradeable`；该开关继续保护可交易特殊卡和其它材料。
- `protectedItemIds`: 可选，强制保护的 item id 列表。
- `protectedDefinitionIds`: 可选，强制保护的 definition id 列表；适合 Collins 这类你不想提交的固定卡种。

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
  - 适合 84x10 这种需要先做保护层的高风险 SBC。

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

### 12.1 Git 更新与冲突合并规则

本仓库禁止把存在内容冲突的合并直接提交到 `main`。日常拉取必须优先使用：

```powershell
git pull --ff-only
```

如果 `--ff-only` 失败，说明本地与远程已经分叉。此时必须停止拉取并先审查双方提交，不能继续执行普通 `git pull` 让 Git 自动生成 merge commit，也不能用整文件 `ours` / `theirs` 覆盖冲突。需要整合双方改动时，应在独立分支逐块处理，每个冲突块都要确认两边提交的目的和需要保留的行为；审查和验证完成后才能合入 `main`。

拉取远程更新前应保存旧 HEAD，并先查看远程会带来哪些变化：

```powershell
$before = git rev-parse HEAD
git fetch origin
git log --oneline --left-right HEAD...origin/main
git diff --stat HEAD..origin/main
git diff HEAD..origin/main -- DailyLoopRunner.user.js DailyLoopRunner.loops.json README.md
git pull --ff-only
```

拉取完成后不能只确认“可以编译”，还必须检查远程改动是否覆盖了仓库里已经验证正确的行为：

```powershell
git diff --stat $before..HEAD
git diff $before..HEAD -- DailyLoopRunner.user.js DailyLoopRunner.loops.json README.md
node --check ".\DailyLoopRunner.user.js"
node -e "JSON.parse(require('fs').readFileSync('DailyLoopRunner.loops.json','utf8')); console.log('loops json ok')"
git diff --check
```

拉取后的最低回归检查清单：

- One-click Daily 仍使用 `isComplete()`、`timesCompleted` 和 `repeats` 跳过已完成阶段，并只运行实际剩余次数。
- Daily Common 仍按 `unassigned -> storage -> transfer` 取卡，缺铜/银时使用 `shortagePacks`，Storage 不足时保留 Unassigned 给当前 SBC。
- My Packs 仍按包实例计数；相同 pack id 的多个包不能被去重，奖励包按同类包数量变化识别。
- Rare Pack 仍支持已有 Unassigned 恢复、pack response duplicate 物化和错误 `471` 重试。
- Daily、Provision、2x84+ 等低分材料流程仍保护 82+ 普通金卡；84x10、84+ TOTW 等明确例外保持各自规则。
- 简洁/Options 面板、`Hide`、单日志显示、默认尺寸和 `L` 图标行为没有回退。
- Player Pick 的材料比例、高分保护、可配置阈值、价格查询、自动/人工选择和 recap 功能仍然存在。

`743850a` 是反例：该提交原本为了合入 Player Pick recap，但冲突解决时用旧代码覆盖了已经稳定的 Daily、My Packs、Storage、471 和高分保护逻辑。以后遇到类似跨功能的大冲突，禁止以“合并成功”作为完成标准，必须按上面的清单进行行为级审计。

### 12.2 代码修改约定

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
