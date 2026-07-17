# FC26 Daily Loop Runner 使用与开发说明

本文档对应脚本版本：

- `DailyLoopRunner.user.js`: `0.4.34`
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

Runner 会读取并跟随 FSU 的 SBC ignore player configuration，例如 Only Untradeable、Exclude Evolution、排除指定联赛、Golden Player Range、storage 优先、普通/稀有优先级和 Lock player。库存型 loop 继续复用这些过滤；84x10 和 84+ TOTW 则由 Runner 的通用评分求解器选阵容，并在提交前执行动态 Challenge 与材料安全检查。

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

评分型 SBC 的 Dry run 与 live run 共用同一套动态 Challenge 解析、候选构建、评分求解和材料保护验证；Dry run 在写入 squad 之前返回，live 才会保存阵容并提交。Dry run 不能简单执行完整 live 流程后只跳过最后一次提交，因为清理 Unassigned、开材料包、自动补做 TOTW/2x84+、移动卡和保存阵容本身都会改变账号状态。

日常正常运行选择 `One-click Daily Loop (max 7 each)`，每个日常最多提交 7 次。MVP 验证入口默认隐藏；在 Options 勾选 `Show MVP loops` 后可选择 `One-click Daily MVP (1 each)`，每个日常最多提交 1 次。单项 Bronze / Silver / Common / Rare 定义始终只供 One-click 内部调用，不会因开启 MVP 开关而出现在下拉菜单。所有 loop 的 live run 都是一次点击 `Start` 直接开始；如果某个日常 challenge 已经没有可用次数，或材料/奖励包不足，对应流程会停止并写日志，不会继续提交该日常。

84x10 测试推荐在 Options 勾选 `Show MVP loops` 后选择 `84x10 MVP (1 run)`。评分型 SBC 不再依赖 FSU 猜评分组合：Runner 从当前已加载的 `challenge.eligibilityRequirements` 读取目标评分、实际球员人数和球员条件，在本地用 EA squad rating 公式求出满足条件的最低评分组合，再保存阵容。普通金卡的交易状态、联赛、Evolution、Golden Player Range 和 Lock 仍跟随 FSU；Runner 的 `maxSubmittedRating`、特殊卡类型/数量和 protected ids 继续作为硬保护。若库存没有合格的 84+ TOTW/TOTS/FOF，84x10 会先做一次使用同一通用评分求解器的 `84+ TOTW Upgrade`，领取并打开奖励包后重试目标 SBC。`Dry run` 只打印模型、评分组合、来源和动态条件命中数，不保存或提交；84x10 奖励包默认保留不打开。

通用评分求解器的优化顺序是：先最小化阵容最高评分，再最小化次高评分，直到整个评分向量确定；只有评分向量完全相同时，才按 `unassigned -> storage -> transfer -> club` 选择来源。因此 Storage 中的 89 不会仅因为来源靠前就替代足以完成 SBC 的 85。Unassigned 和 Transfer 中的卡仍作为 duplicate signal 解析为 Club/Storage 内实际可提交的对应版本。

`0.4.36` 优化了评分候选构建：Club/Storage 只扫描一次，Unassigned/Transfer duplicate signal 通过预构建的 item/definition 索引解析，FSU Lock、protected ids 和动态条件结果按 item 缓存。候选日志会显示 `scanned ... item(s), built in ...ms`；数千张库存正常应在毫秒到低秒级完成，不应再出现几十秒无日志的等待。

目标评分和 TOTW/TOTS/FOF 等 Challenge 条件来自当前页面模型，不需要在脚本中写死，也不发起远程 EA Challenge 请求。脚本内固化的评分公式支持实际 required player count；保存前、保存后和最终提交前都会校验人数、唯一 `definitionId`、计算评分、每条动态条件、特殊卡上限，并在保存后调用本地 `challenge.meetsRequirements()` 复核。遇到化学要求或无法识别的 eligibility key 会安全停止，不会忽略条件继续提交。

`84+ TOTW Upgrade Loop` 可以单独选择，`rounds` 控制提交次数；它会自动领取并打开 TOTW 奖励包，遇到 stale pack 会刷新后继续找下一个可用 TOTW 包候选。
如果保存后 squad 人数少于当前 SBC/配方需要的人数，日志会显示类似 `player-count 10/11`，评分型 live run 会停止并重新保留诊断信息，不会用旧的逐步抬高评分逻辑修复。
如果 dry-run 检测到 `rating-over-88`、额外 special、可交易卡或缺少 special requirement，日志会输出 `manual fix`，标明需要手动替换的 slot、item id、definition id 和原因。

`Refresh caches` 会优先刷新 packs 和 unassigned；club/storage/transfer 会用当前 Web App 暴露的可用方法刷新。如果某个 pile 没有可用刷新方法，脚本会保留现有缓存并写日志。

选卡不够时，日志会追加 diagnostics：每个 pile 的总数、匹配数量、unique definition 数、duplicate signal 解析数量，以及主要过滤原因。若 FSU 锁卡被识别，`FSU settings sync` 会显示 `locked:n`，被排除的卡会计入 `fsu-locked-player`。`0.2.69` 起会同时匹配 FSU lock 中的 item/resource/definition/asset/guid 类 ID，并从 `_data`、`_staticData`、`assetData`、`_item`、`player`、`rawData` 等容器读取卡片身份，避免 FSU Lock player 的卡被 FSU 填阵容或 Runner 自己的评分修复重新选上。`0.2.70` 起 unassigned 刷新遇到 EA 偶发 `unknown` 时会先重试，失败后保留并使用当前缓存继续收尾，避免 rare pack/2x84 连跑时一次刷新抖动直接中断。

普通使用只需要启用 `DailyLoopRunner.user.js`。开发时如果启动了本地服务，可以点击 `Load loops JSON` 从 `http://127.0.0.1:8765/DailyLoopRunner.loops.json` 加载外部 loop 配置；点击 `Built-in loops` 可切回脚本内置配置。

默认下拉菜单不显示任何 MVP loop。Options 中的 `Show MVP loops` 会持久化；开启后额外显示 `One-click Daily MVP (1 each)`、`84x10 MVP (1 run)` 和四个单项 Daily MVP。普通单项 Daily loop 仍保持隐藏。内置配置和 `DailyLoopRunner.loops.json` 使用相同的 `hidden` / `mvp` 元数据，加载外部 JSON 不会再把隐藏入口全部暴露出来。

默认下拉菜单可见 loop：

- `Bronze Upgrade Validation`
  - POC 验证用。
  - 开高级青铜球员包，消耗青铜重复做 `Bronze Upgrade`，再开银卡奖励包。

- `One-click Daily Loop (max 7 each)`
  - 按日常顺序执行，每个日常最多提交 7 次，并按当天实际剩余次数停止。
  - 会继续使用隐藏的单项日常定义；它们不是独立的面板入口。
  - 点击一次 `Start` 后直接按每个子步骤当天实际剩余次数执行。

- `2x84+ Fodder Loop`
  - 每次严格使用 6 张评分不高于 81 的普通金稀有，保护 82+、特殊卡、loan/limited-use 和 FSU Lock player。
  - 选卡范围为 `SBC storage -> club`，并继续遵循 FSU 的 Only Untradeable、联赛、Evolution、稀有卡和 Golden Player Range 设置。
  - `rounds` 控制提交次数；奖励包必须成功打开并完成入库处理，否则会在下一次提交前停止。

- `84x10 MVP (1 run)`（仅开启 `Show MVP loops` 后可见）
  - 打开匹配的 84x10 / 84+ x10 / `10x 84+ Upgrade` / `10 名 84+ 升级` SBC。
  - 若没有可提交的 84+ TOTW/TOTS/FOF，会先提交 1 次 `84+ TOTW Upgrade`，自动打开 TOTW 奖励包并刷新库存。
  - 从当前 Challenge 动态读取目标评分、人数和卡种条件，使用本地 EA 评分公式选择最低评分组合；84x10 默认严格需要 1 张评分至少 84 的 TOTW/TOTS/FOF，并阻止额外 special。
  - 评分组合确定后，才按 `unassigned -> storage -> transfer -> club` 选择相同评分卡的来源。所有候选仍遵守 FSU Only Untradeable、联赛、Evolution、Golden Player Range、Lock player，以及 Runner protected ids 和评分上限。
  - 若现有安全材料无法组成满足评分和动态条件的阵容，live run 每个 84x10 最多自动完成 3 次 `2x 84+ Upgrade`。每次都先确认存在 6 张合格低分普通金稀有，开包入库成功后才重新运行完整评分求解。
  - 保存前、保存后和最终提交前都会复核计算评分、人数、动态条件、特殊卡数量及本地 `challenge.meetsRequirements()`；任何一项失败都会停止，不再使用旧的逐步抬分 repair。
  - 默认 `maxSubmittedRating: 88`、`maxNormalGoldSubmittedRating: 99`、`requiredSpecialCount: 1`、`requiredSpecialKind: totw-tots-fof`、`requiredSpecialMinRating: 84`、`allowedSpecialCount: 1`、`blockTradeable: false`。普通金卡是否允许交易卡由 FSU `Only Untradeable` 决定。
  - 自动 TOTW 前置 SBC 使用同一通用评分求解器，默认 `maxSubmittedRating: 88`、`maxNormalGoldSubmittedRating: 99`、`blockSpecial: true`、`blockTradeable: false`。
  - WK 第一次只跑 `Dry run`，确认日志没有 `BLOCK` 后再考虑 live run。

- `84x10 Loop (max 7)`
  - 逻辑同 `84x10 MVP (1 run)`，但 `maxCompletions: 7` 且 `allowMultipleCompletions: true`。
  - 点击一次 `Start` 后直接执行；最多 7 次 `10x 84+ Upgrade`，并在每次缺少合格特殊卡时最多补 1 次 `84+ TOTW Upgrade`、评分材料不足时最多补 3 次 `2x 84+ Upgrade`。
  - 奖励包默认保留不打开，避免连跑时处理高价值 unassigned 结果。

- `Provision Crafting Loop`
  - 每个 round 开 1 个 `Provision Pack` / `Provisions Pack`。
  - 启动时先检查已有 Unassigned：优先恢复已生成但未选择的目标 Pick，再按配置的 crafting stages 处理遗留重复材料，之后才开本轮新包。
  - Provision pack response 会同时对照 Club 判断重复，避免 EA 尚未写入 `duplicateId` 时把实际重复卡误报为非重复。
  - `preCraftPlayerPickLoopId` 可引用任意 `playerPickSbc`。触发卡种、每阵人数和卡种比例都来自该 Pick 的 `requirements`；如果各子阵不同，可用 `challengeRequirements` 逐阵定义。实际剩余子阵数量来自 EA Challenge 状态，不依赖固定的一个阵或两个阵。
  - 当前匹配重复卡能够独立满足第一个未完成子阵时，会按顺序完成所有剩余子阵；不能独立满足时，只用 `unassigned -> storage -> transfer -> club` 补完当前子阵，后续子阵留给下一包。若只剩一个子阵则直接尝试完成。没有匹配该子阵 requirements 的重复卡时跳过前置 Pick。
  - 前置 Pick 复用独立 Pick loop 的卡种比例、FSU/锁卡过滤、高分保护阈值、价格查询和自动/人工选择设置。Pick 提交后只保留仍有有效对应版本的重复卡；已经消耗的 duplicate signal 不会进入后续 crafting stage。
  - 非重复物品放入 club。
  - `craftingUpgrades` 是有序数组，可配置一条、两条或更多条后续 SBC。每条 stage 的材料类型、数量、高分保护和 pile 优先级全部来自自己的 `requirements`；多子阵 stage 可用 `challengeRequirements` 逐阵定义。有匹配重复卡才执行，不足一阵时按该 stage 的 `priorityPiles` 补齐。
  - 当前默认数组仍是 `FOF Glory Hunters Crafting Upgrade`（9 普金）和 `2x 84+ Upgrade`（6 稀有金），但这只是当前配置，不是策略硬编码。旧的 `commonUpgrade` / `rareUpgrade` 仍可作为兼容输入。
  - `Open reward packs` 会传递给每个 crafting stage；Provision 源包遇到 `471`/`500` 时会刷新状态并重试一次。
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

## 4.1 当前 Daily 行为（0.4.34）

以下规则以当前脚本和 `DailyLoopRunner.loops.json` 为准；本文档中较早版本的行为描述如有冲突，以本节为准。

`0.4.34` 将 Provision 流程改为配置驱动：前置 Pick 的触发材料、每阵 requirements 和实际未完成 Challenge 数均动态读取；后续 SBC 改用有序 `craftingUpgrades` 数组，可替换、增删或重排任意 stage。策略不再写死 11/22、普金/稀有金、FOF 或 2x84+。

`0.4.33` 细化当时的 Provision 前置 Pick 双 Challenge 调度，并修复部分完成时错误查找未生成 Pick 奖励的问题；其固定数量判断已在 `0.4.34` 被配置驱动逻辑替代。

`0.4.32` 修正 Provision 前置 Pick：本轮重复普金会优先用于未完成的 `5 of 10 82+ Players Pick`，不足部分再按 Storage、Transfer、Club 补齐；同时增加 Provision 中断恢复、pack response Club 对照查重、子流程奖励开关继承和源包 `471`/`500` 重试。共享底层函数本版不做额外行为修改，已知问题记录在第 10.1 节。

`0.4.31` 将提交后的页面同步应用到所有 SBC 路径：脚本会先识别奖励包，再退出残留的 SBC Squad 页面并同步 Unassigned/Store，之后才允许打开奖励包或加载下一个 Challenge。自动奖励包遇到 `471` 或 `500` 时会刷新页面状态和 My Packs，并使用最新包实例重试一次，覆盖 2x84+、84x10 自动补料、TOTW、Player Pick 和 Daily 等共用提交流程。

`0.4.30` 修正 fill-and-verify SBC 的奖励包入库时序：所有自动打开的奖励包都会先按重复卡规则直接送入 club/storage/transfer，再清理残留 Unassigned，避免 2x84+ 等奖励卡还停在 Unassigned 时被后续 84x10 误判为缺料。

`0.4.29` 修正 loan / limited-use 检测：EA/FSU 的 `loans === -1` 表示普通无限使用球员，不再把整批 club/storage 普通卡误判为 loan；FSU Lock player 和真实租借卡保护继续生效。

`0.4.21` 修复 `743850a` 冲突合并造成的 Daily 回归：恢复 Daily 剩余次数预检、Daily Common 缺料补包、My Packs 实例计数、Storage 溢出保留、Rare Pack 471 恢复和非高分 SBC 的 82+ 材料保护；SBC challenge 查询临时超时时最多重试 3 次。

- 面板默认是简洁模式：loop 选择、`Start`、`Stop` 和最新日志。点击 `Options` 后展开运行选项、配置操作和完整日志，此时简洁日志会隐藏。展开按钮显示 `Hide`；两个模式切换或从 `L` 恢复时都会回到各自默认尺寸，缩放不能小于当前模式的默认尺寸。`L` 可收成可拖动的小图标。
- `0.4.43` 根据 `0.4.41` 实际耗时日志修正 84x10 卡死根因：challenge 列表在同一秒成功返回，真正阻塞的是评分向量物化时反复扫描 8,367 个候选。求解器现在一次建立按评分分组的候选索引，缓存相同评分/人数的需求匹配结果，只在找到评分向量时做紧凑物化；搜索每 500 个状态让出主线程，默认限制为 500,000 状态或 15 秒，因此 Stop、日志和页面事件不会再被长时间同步计算阻塞。恢复从真实 Challenge 动态读取目标评分/人数，并恢复 `services.SBC.submitChallenge` 的完整状态更新流程。
- `0.4.42` 的 challenge-list 冻结判断已由 `0.4.43` 撤销。`0.4.41` 日志证明 `sbcDAO.getChallengesForSet` 正常返回，不能跳过动态 Challenge 或将 84x10 目标评分写死；相关 FSU challenge-id 限制、固定评分模型和直接 DAO 提交均未保留。
- `0.4.41` 将评分型 SBC 改为全后台流程：84x10、84+ TOTW 及自动补 TOTW 直接通过 EA DAO 读取/加载 challenge，本地构造并验证 squad，再调用 `services.SBC.submitChallenge`；Dry run 只运行到验证。两种模式都不再创建 SBC 阵容 controller，因此不会触发 FSU/Enhancer 页面增强导致浏览器无响应。
- `0.4.40` 将评分 SBC 的列表加载从 `requestChallengesForSet` 改为直接 `sbcDAO.getChallengesForSet`，并复用 84x10 特殊卡预检已经刷新的库存缓存。`0.4.41` 实际日志显示该列表请求在同一秒返回，长时间无响应发生在随后的评分组合搜索阶段。
- `0.4.39` 修正评分 SBC 正式运行进入阵容页后卡住：目标 SBC controller 和 squad 已就绪时不再被 FSU 遗留的全局 loading shield 阻塞 30 秒；优化评分阵容保存后的 UI 等待也缩短为有界等待。评分选择、安全验证和提交规则不变。
- `0.4.38` 优化评分 SBC 的 Dry run：直接读取 challenge 动态要求，不再进入可视阵容页等待 FSU/loading；评分候选构建与组合搜索日志增加独立耗时，便于区分页面加载和求解性能问题。
- `0.4.37` 恢复 MVP 可见性选项：所有 MVP 默认隐藏，Options 的 `Show MVP loops` 可持久化开启；普通隐藏 Daily 内部步骤始终不显示。外部 loops JSON 同步 `hidden` / `mvp` 字段，避免加载 JSON 后回归。
- `Refresh caches` 会记录 My Packs 的实例数量。相同 pack id 的多个包会分别计数，奖励包检测也按同类包的数量变化判断。
- `One-click Daily` 会先读取每个 Daily SBC set 的 `isComplete()`、`timesCompleted` 和 `repeats`。已完成的子步骤会跳过；未完成的子步骤只运行当天实际剩余次数，而不是固定再跑 7 次。完整 One-click 顺序为 Bronze、Silver、Common、Rare、Daily Rare Pack to 2x84+。
- Inventory 型 SBC 每次提交后会清退导航栈中残留的 SBC Squad 页面，再导航到 Unassigned；如果仍无法退出，才切到 Store Packs 兜底。这样连续做 Daily Common、Daily Rare 或 `2x84+` 时，不会不断堆叠并返回更早的阵容页。
- `Daily Rare Pack to 2x84+` 每包完成 `2x84+ Upgrade` 后，会先完成上述页面同步再开下一包。开包遇到 `471` 或阵容页残留导致的 `500` 时，会刷新页面状态和 My Packs 缓存，并使用新的包实例重试一次。
- `openRewardPacks` 默认关闭。Daily Bronze/Silver 完成最后一次 SBC 后，最后的奖励包保留不打开。
- Daily Common 的材料优先级为 `unassigned -> SBC storage -> transfer list`。5 银或 5 铜不足时，依次尝试开 Bronze Players Premium 和 Silver Players Premium；仍不足时才使用 club。若未分配不可交易重复卡多于 SBC Storage 空位，会保留它们给当前 SBC、跳过后续补货包，并改用 `unassigned -> storage -> transfer -> club` 尝试填阵。
- 82+ 金卡保护适用于所有非高分 SBC 的普通金/稀有金材料路径：Daily Rare、Daily Rare Pack to 2x84+、Provision Crafting 的 FOF 普金升级和 2x84+ 稀有金升级都只会使用 81 及以下的普通金卡。82+ 重复卡按常规清理规则进入 Transfer List 或 SBC Storage。`84x10` 与 `84+ TOTW` 是明确例外，仍按各自 SBC 评分和特殊卡要求选人。

## 4.2 Player Pick Loop

`1 of 5 83+ Player Pick` 每次严格提交 4 张普通稀有金；`5 of 10 82+ Players Pick` 每次完成两个 Challenge，两个阵都严格提交 11 张普通普金。两条 Pick loop 都强制保护 82+ 普通金卡，只会使用 81 及以下材料；配置层和提交前硬校验会同时拦截高分卡、FSU 锁定卡、概念卡和不满足 FSU 设置的材料。默认各做 1 个 Pick；在 Options 中调整 `rounds` 可设定本次要做的 Pick 数量。

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
- `preCraftPlayerPickLoopId`: 可选，`provisionPackCrafting` 开包后的前置 Player Pick loop id。目标必须存在并且 `strategy` 为 `playerPickSbc`。
- `challengeRequirements`: 可选，`playerPickSbc` 或 `craftingUpgrades[]` 每个子 Challenge 各自的 requirements 数组；提供后可以省略顶层 `requirements`。Player Pick 的子阵数量可由数组长度推导。
- `craftingUpgrades`: `provisionPackCrafting` 的有序后续 SBC 数组。每个元素包含 `name`、`sbcNames`、`requirements` 和可选 `priorityPiles` / `openRewardPacks`。
- `steps`: `dailyRoutine` 使用的 loop id 列表。
- `openRewardPacks`: 可选，提交后自动打开对应奖励包并清理 unassigned。
- `maxSubmittedRating`: 可选，`fillAndVerifySbc` 提交前允许的最高 rating。
- `maxNormalGoldSubmittedRating`: 可选，普通金卡的绝对最高 rating；实际有效上限取该值与 FSU Golden Player Range 的较低值。84x10 和自动 TOTW 前置默认绝对上限为 `99`，requirement special 仍到 `88`。
- `ratingSbcFill`: 可选，对象。启用通用评分 SBC 求解器；`priorityPiles` 默认可设为 `['unassigned', 'storage', 'transfer', 'club']`，只用于同一最低评分组合内的来源选择。目标评分、人数和球员条件默认从当前 Challenge 动态读取；`targetRating` 仅作为 Challenge 没有 `TEAM_RATING` 时的显式后备值。`maxSearchNodes`、`maxSearchMs` 和 `yieldEveryNodes` 可选，默认分别为 `500000`、`15000` 和 `500`。
- `requiredSpecialKind`: 可选，目前支持 `totw` 或 `totw-tots-fof`。用于限制 requirement special 的类型，普通 special 不会被当成合格材料。
- `requiredSpecialMinRating`: 可选，要求特殊卡的最低 rating；84x10 默认用 `84`，避免把低评分 TOTW/TOTS/FOF 当成可提交材料。
- `autoTotwUpgrade`: 可选，对象或 `false`。当要求 TOTW/TOTS/FOF 但库存没有可用 requirement special 时，live run 会先打开已有的 84+ TOTW 奖励包；如果仍没有可用卡，再执行该 TOTW 前置 SBC、领取奖励、开包，并把开出的球员临时按 TOTW reward item 处理。设为 `false` 可关闭自动补 TOTW。
- `autoFodderUpgrade`: 可选，对象或 `false`。当 `fillAndVerifySbc` 已通过特殊卡保护但仍无法达到提交评分时，可用 `maxAttemptsPerCompletion` 限制每个目标 SBC 自动完成 `2x 84+ Upgrade` 的次数；每次仅使用 81 及以下普通金稀有，并要求奖励包成功打开后才继续。
- 自动 TOTW 开包会合并 Store service 返回和本地 repository 的 pack cache；领奖后 pack 入库较慢时，会等待更久再尝试开包。
- 连续运行时，提交成功后会把本次实际提交的材料标记为已消耗，并从临时 TOTW/recent 缓存中移除，避免后续轮次重复引用已经提交掉的 reward item。
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
- `provisionPackCrafting` 缺少源包配置，或既没有 `craftingUpgrades` 也没有兼容字段 `commonUpgrade` / `rareUpgrade`。

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
  - 打开一个 SBC；配置 `ratingSbcFill` 时由 Runner 动态解析 Challenge 并求解最低评分阵容，否则保留既有 FSU/库存填充路径。
  - 适合 84x10、84+ TOTW 这类同时有目标评分、特殊卡条件和高价值材料保护的 SBC。

- `provisionPackCrafting`
  - 每轮开一个源包，可先执行一个配置引用的 Player Pick，再按 `craftingUpgrades` 顺序处理任意数量、任意 requirements 的重复材料 SBC。
  - 适合 Provision Pack 这类“按开包重复材料动态分流”的活动流程；更换活动时通常只需更新 Pick loop 引用和 stage 配置。
  - 旧策略名 `provisionPackDualCrafting` 仍作为兼容别名，但新配置应使用 `provisionPackCrafting`。

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

- `calculateEaSquadRating(ratings, requiredPlayerCount)`
  - 固化 EA/FSU 使用的评分公式：先计算平均值，将高于平均值的差额加回总分，再四舍五入并除以实际 required player count。FSU 备份固定使用 11；Runner 为支持非 11 人 SBC 将人数参数化。

- `parseRatingSbcChallenge(loopDef, challenge)`
  - 从当前页面已加载的 Challenge 读取目标评分、实际人数和球员条件，不发起远程 EA 请求。

- `findOptimalRatingSbcSelection(candidateEntries, model, piles, options)`
  - 使用本地 EA squad rating 公式寻找最低评分向量；评分向量相同后才比较 pile 优先级。

- `validateRatingSbcModelAgainstItems(model, items, challenge)`
  - 在计划、保存后和最终提交前三次核验人数、评分、唯一球员版本、动态条件和特殊卡上限。

上述评分函数只由配置了 `ratingSbcFill` 的 `fillAndVerifySbc` 路径调用。目前影响范围是 `84+ TOTW Upgrade`、`84x10 MVP`、`84x10 Loop` 及 84x10 的自动 TOTW 前置；它们共用同一个求解器，只在上层特殊卡要求、自动补料和奖励包处理上存在配置差异。以后新增同类评分 SBC 通常只需增加 `ratingSbcFill` loop 配置，即会自动继承动态要求解析、Dry run/live 共享计划、搜索时间限制和 UI 让步。Daily、Provision、Rare Pack 和 Player Pick 仍走各自既有策略。

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

### 10.1 共享底层函数影响面与问题追踪

以下函数被多个 loop 共用。除非问题符合通用契约并完成对应回归检查，不应为了单个 loop 修改共享实现。本表记录的是当前职责、调用流程、已知问题和影响面。`0.4.34` 为了让 requirements 真正可配置，扩展了 `submitReservedDuplicateUpgrade()` 和 `submitPlayerPickChallenge()`；其它共享选卡、清理和提交流程未改变。

| 函数 | 功能与流程 | 已知问题/后续事项 | 主要影响面 |
| --- | --- | --- | --- |
| `clearUnassigned(reason, options)` | 刷新 Unassigned；保留 `reserveItem`；依次将非重复放 Club、可交易重复放 Transfer、可交换版本交换后放 Transfer、其余不可交易重复放 Storage；目标空间不足时停止。 | 当前分类规则正确。风险主要来自调用时机：在恢复遗留 Pick 或可用于当前 SBC 的重复卡之前调用，会过早移动材料。不要为单个 loop 改通用分类。 | 所有开包、Daily、Provision、Rare Pack、Pick 结果和最终清理。 |
| `selectInventoryPlayers(requirements, priorityPiles)` | 按 requirement 和 pile 优先级选卡；遵循 FSU 设置、锁卡、评分、稀有度、特殊卡和已消费过滤；Unassigned/Transfer 作为 duplicate signal 解析到 Club/Storage 可提交版本。 | 日志已验证 duplicate signal 解析有效。修改会直接改变材料来源和保护规则，当前不计划调整。 | Daily Common/Rare、Provision、Rare Pack、Player Pick、inventory-first SBC。 |
| `prepareInventorySelection(loopDef, selection)` | 提交前对 Transfer signal 再解析，输出已解析数量，并返回真正可保存的 Club/Storage item。 | 当前没有确认的功能错误。若改变 signal 解析，必须验证 Transfer 中普通金/银/铜、Unassigned 重复和不可交易对应版本。 | Daily Rare、Provision、Rare Pack、Player Pick 等库存提交。 |
| `submitInventorySelection(loopDef, selection)` | 查找并打开 SBC；准备选卡；保存阵容；检查 Submit；调用通用提交；按配置打开或保留奖励包。 | 提交成功后目前没有像 `fillAndVerifySbc`/Player Pick 一样调用 `markSbcItemsConsumed()`。EA 缓存延迟时理论上可能再次引用已提交 item；尚未在本次 Provision 日志中复现。若修正，需回归全部库存型 loop。 | Daily Rare、Provision 的所有 crafting stage、Daily Rare Pack to 2x84+。 |
| `submitReservedDuplicateUpgrade(loopDef, upgradeDef, duplicatePredicate, label, options)` | 有匹配 Unassigned 重复卡时执行库存型升级；使用完整 `requirements` 检查重复卡能否独立组成一阵，否则按 stage 的 pile 顺序补齐。 | `0.4.34` 不再只读取 `requirements[0].count`。Rare Pack 仍通过原有 rare predicate 调用；修改此函数需同时验证 Rare Pack 和 Provision 的多 requirement stage。 | Provision 的所有 `craftingUpgrades`、Daily Rare Pack to 2x84+。 |
| `submitPlayerPickChallenge(loopDef, challengeNo, challengeTotal)` | 按 Challenge 编号选择 `challengeRequirements[index]`，未配置时回退顶层 `requirements`；选卡、保存、保护检查和提交仍走原流程。 | Challenge 编号必须与 EA 返回顺序和配置数组顺序一致。修改时需验证只有一个阵、统一 requirements 多阵、逐阵不同 requirements 三种情况。 | 独立 Player Pick、Provision 前置 Pick。 |
| `submitSbcAndGetAwardPackId(set)` | 点击提交/确认；领取奖励；刷新 My Packs；通过 set award 或包数量增量识别奖励 ID；最后执行提交后页面同步。 | 奖励识别顺序当前正确。不要在退出 SBC 页面前丢失奖励快照。 | 所有 SBC 提交流程。 |
| `syncAfterSbcSubmit(label)` | 清退残留 SBC Squad；导航并刷新 Unassigned；若仍在 SBC 区域则打开 Store 兜底。 | 已经处于 `UTUnassignedItemsSplitViewController` 时仍会再次调用 Unassigned 导航，增加等待和请求超时概率。它不改变选卡，但日志会表现为每个 Challenge 后回到同一页面。后续优化必须验证全部 SBC loop 的页面恢复。 | Daily Bronze/Silver/Common/Rare、Provision、Rare Pack、所有 Pick、84x10、TOTW、2x84+。 |
| `redeemAndSelectPlayerPick(pickItem, loopDef, options)` | Redeem Pick；加载价格和重复状态；自动/人工选择；确认结果；刷新并按 `cleanupOptions` 清理 Unassigned。 | Pick 选中球员可能晚于第一次刷新进入 Unassigned，本次日志中 5 张结果在后续才出现。后续若增加等待，需验证独立 Pick 和 Provision 前置 Pick，且不能重复确认已完成 Pick。 | 所有 Player Pick loop、Provision 前置 Pick。 |
| `openPack(pack, purpose, options)` | 开包前清理 Unassigned；调用 EA pack.open；支持 stale 404、指定错误码重试、页面恢复和重新解析 pack 实例。 | 功能本身可复用。不同 loop 应通过现有 options 选择是否启用 `471/500` 和 `resolveRetryPack`，不要复制新的开包函数。 | 所有源包和自动奖励包。 |

后续修改共享函数时，至少执行以下回归：

- Daily Bronze/Silver：剩余次数、单卡 duplicate recycle、最后奖励包策略。
- Daily Common：Unassigned/Storage/Transfer 优先级、缺铜银补包、Storage 溢出保留。
- Daily Rare 与 Rare Pack：普通金/稀有金 duplicate signal、82+ 保护、`471/500` 恢复。
- Provision：前置 Pick requirements 触发、单阵/多阵部分进度、各 crafting stage requirements 分流、stage 顺序和中断恢复；当前默认配置还需验证普金进入 FOF、稀有金进入 2x84+。
- Player Pick：严格卡种比例、82+ 阈值、锁卡、价格排序、自动/人工选择、结果入库。
- 84x10/TOTW/2x84+：特殊卡要求、评分保护、自动补料、奖励包物化和页面同步。

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
- Rare Pack 仍支持已有 Unassigned 恢复、pack response duplicate 物化、SBC 后页面同步以及错误 `471`/`500` 重试。
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
