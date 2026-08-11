# Trade Scheduler 操作、安全与故障排查

本文描述 Trade Scheduler 当前版本的可用边界、运行前检查、诊断证据和故障恢复方式。它不是 EA 接口说明，也不替代 EA、FSU 或 Enhancer 的使用条款。

## 当前边界

当前实现按门禁逐步开放，以下能力已经通过自动化测试和对应的实机验证：

- 手动有界 Listing：Club 单一来源、1-2 张、Transfer 刷新、价格限制、挂牌后 Transfer 回执核验。
- 只读 Listing Preview：可观察 Club、Transfer List 或两者；Transfer 中 `inactive` 的过期卡可选择跳过或纳入 Preview。
- 手动有界 Transfer reprice：仅限 Transfer-only、1-2 张 `inactive` 过期卡及精确输入 `REPRICE N`；挂牌前后均刷新并核对同一 item。
- 定时有界 Listing/reprice：单个 `once` 任务、单一来源、1-2 张、页面恢复、跨标签页互斥、Loop/Trade operation 互斥和过期租约 fail-closed。
- 手动和定时有界 Buy：Rare Gold、一个评分或两个相邻评分、数量 1-2、每卡不超过 2000、总预算不超过 4000；支持 Club 和重复卡 Transfer 路由，定时 Buy 还要求显式最低保留金币。
- Listing/Buy bounded Journal：逐项记录 mutation boundary 和终态；第一项成功后第二项失败或不明确时保留部分成功并停止剩余项。
- Summary、History、Job-only 配置导入/导出、Provider 健康状态和显式缓存清理。

TS8 的 `0.7.70` 六项有序实机 campaign 已完成；上述 1-2 项门禁仍是硬上限，不代表 Bulk 或 recurring 自动交易已开放。

以下能力仍受门禁或未完成独立实机验证，不应通过修改配置绕过：

- 第三张及更多卡、Buy 非相邻或三个评分、其它 Buy 卡类、周期/窗口/下次登录任务。
- 无上限 Bulk Buy/Bulk Listing、自动改价、自动刷新 Provider、后台 Companion。
- 周期 Transfer 改价、Bulk relist，以及 Club + Transfer 混合来源的 Prepare/执行。
- 任何没有明确候选、身份、价格或库存去向的交易动作。

## 运行前检查

1. 使用正式版 Runner，并确认日志显示 `Ready v...`。
2. 保持 EA Web App 登录，确认 FSU 已加载并完成 Club readiness；FSU 为 provisional 或缓存未验证时，交易任务可能停在 `waiting-session`。
3. 关闭 Enhancer Trader、其它自动买入/挂牌工具和会修改 Transfer/Club 的脚本。
4. 确认没有 Loop、Batch Open、SBC 提交、开包或其它 Runner operation 正在运行。
5. 检查 Trade Scheduler 的 `Providers`、`Summary` 和 `Jobs`：缓存不是空的，任务参数在当前门禁内，Job 只有在确认后才 Armed。
6. 为 Buy 设置全局最低保留金币。Job 局部值只能提高该底线，不能降低它。
7. 普通使用只采用已实机验证的 1-2 项范围；一次只激活一个小额 `once` Job，不得通过导入 JSON 绕过数量、来源、评分、价格或调度门禁。

## TS8 一次性双卡验证记录

以下步骤是候选 `0.7.70` 已完成的 V8 campaign，可用于后续兼容性复核，不需要在普通使用前重复执行。复核前安装仓库根目录的 `DailyLoopRunner.user.js`，刷新并确认日志为 `Ready v0.7.70`。关闭 Enhancer Trader 和其它自动交易工具，清空或处理正常可移动的 Unassigned，停止所有 Loop/Batch/SBC 操作，并保证 Transfer List 有足够空间。

### 基线

1. 打开 Trade Scheduler，确认 `paused`、Automatic execution 为 `locked`、Circuit 为 `closed`，没有 armed Job，也没有未处理的 Listing/Buy Journal。
2. 在 Summary 确认请求预算为 30/30；如果不足，保持页面不操作并等到窗口自然恢复。
3. 设置可接受的 `Global minimum retained coins`。准备两张低价值 Club 可交易卡；Transfer reprice 可复用自然到期的低价值卡，不要使用高价值卡制造测试条件。
4. 点击 Trade Scheduler 的 `Save diagnostics` 保存一份基线。正常完成全部步骤后统一提供文件，不需要此时单独发送。

Scheduler 对话框会每秒读取一次最新 Job Store；定时任务到点、开始、回锁或完成后，banner、Job 状态和 History 应在约 1 秒内原地更新，不需要关闭再打开。正在编辑 Job 或导入 JSON 时不会重建表单，以免覆盖未保存输入。如果 D/E/F 仍出现任务已触发但 UI 长时间不更新，保存当时截图和 Scheduler diagnostics，并记录关闭重开后显示的状态。

### A. 手动双卡 Club Listing

推荐字段：

| 字段 | 值 |
| --- | --- |
| Source | `Club` |
| Card class | `Common Gold` |
| Rating rule Min / Max | `75` / `82`；若 Preview 不是两张已确认的低价值卡，缩小范围后重做 |
| Rating rule Buy Now | 建议从 `700` 开始，Prepare 若按 EA 下限调整必须重新核对 |
| Use market quote when higher | 关闭，避免把 Provider 报价变量混入本轮事务验证 |
| Quote provider / Markup / Quote max age | market quote 关闭时不生效，保持默认即可 |
| Start price | `One step below Buy Now` |
| Duration | `1 hour` |
| Expired Transfer items | `Skip expired` |

1. 点击 `Manual listing`，Source 选 Club，Card class 和 Rating rules 只覆盖确认愿意挂牌的两张低价值卡；关闭 market quote 或逐项核对其报价。
2. 先点 `Preview`，再点 `Prepare`。必须看到恰好两张卡，逐项核对名称/评分、item、Buy Now、Start price 和 duration；如果只准备到一张，不执行并调整规则重新 Prepare。
3. 输入界面要求的精确文本 `LIST 2`，执行一次。完成后点该窗口的 `Save diagnostics`。
4. 任一 item、价格或状态不符合 Prepare，立即停止整个 campaign。

等待要求：点击执行后保持窗口打开，直到 Recap 显示 `completed | 2 listed | 0 failed | 0 skipped`。通常少于 1 分钟；按钮仍显示运行中时不要关闭、刷新或开始下一步。

### B. 手动双卡 Transfer reprice

推荐字段：

| 字段 | 值 |
| --- | --- |
| Source | `Transfer List`；不要选 `Club + Transfer List` |
| Card class | 与两张 expired 卡一致；推荐复用步骤 A 的 `Common Gold` |
| Rating rule Min / Max | 覆盖且只接受目标 expired 卡的低分范围，通常 `75` / `82` |
| Rating rule Buy Now | 与准备采用的低价一致，例如 `700`；以 Prepare 后 EA 合法值为准 |
| Use market quote when higher | 关闭 |
| Start price | `One step below Buy Now` |
| Duration | `1 hour`，便于后续再次自然到期供步骤 E 使用 |
| Expired Transfer items | `Include expired in Preview` |

1. 等 Summary 显示至少 12 个可用请求槽。需要 Transfer List 中恰好两张自然到期且愿意重挂的低价值 inactive/expired 卡。
2. 打开 `Manual listing`，Source 选 Transfer，Expired Transfer items 选 `Include expired in Preview`；规则只覆盖目标卡。
3. 依次执行 `Preview`、`Prepare reprice`，核对恰好两张卡和 EA Bid/Buy Now 双下限。
4. 输入 `REPRICE 2` 并只执行一次。确认同一两个 item 变为 Active，Transfer 容量没有增加，然后保存 Listing diagnostics。

等待要求：如果开始时没有两张 expired 卡，可等步骤 A 的 1 小时挂牌自然到期；不要连续刷新 Transfer。执行后等待 Recap 为 `completed | 2 listed`，再到 EA Transfer List 确认两张均为 Active。

### C. 手动双评分、数量二 Buy

先定义价格 `P`：在运行 campaign 前手动了解两个相邻评分的当前低价，选择确实愿意支付且 `P <= 2000` 的上限。之后停止其它市场操作并等本地请求预算恢复。推荐字段：

| 字段 | 值 |
| --- | --- |
| Name | `V8 Manual Buy 2` |
| Enabled / Armed | Enabled 开；Armed 关，Manual Job 也会强制保持 unarmed |
| Schedule Type | `Manual` |
| Misfire / Grace | Manual 不使用；保持 `Grace interval` / `15` 即可 |
| Card class | `Rare Gold` |
| Rating min / max | 推荐 `84` / `85`；也可选其它两个相邻评分 |
| Max Buy Now | `P`，必须不超过 2000 |
| Rating prices | 留空表示两个评分共用 `P`；不要加入高于 `P` 的 override |
| Quantity | `2` |
| Total budget | `2 * P`，且不超过 4000 |
| Job minimum retained coins | Manual gate 不使用，可留空 |
| Max runtime min / Empty search limit | `5` / `5` |
| Search delay min / max | `8` / `15` |

1. 等 Summary 恢复到至少 28 个可用请求槽；双卡 Buy 在容量不足时应保持阻塞，不能通过刷新或清存储绕过。
2. 创建一个 `New Buy Job`：Schedule 为 Manual、Enabled 开、Armed 关、Card class 为 Rare Gold、两个相邻评分、Quantity 2、每卡上限不超过 2000、Total budget 不超过 4000、运行时间不超过 5 分钟、Empty search limit 不超过 5。
3. 价格上限应采用当前愿意真实支付的金额；示例评分 84-85 只表示相邻 lane，不保证当前市场能在 1000 或其它示例价格成交。
4. 保存 Job，先点 `Preview`；Preview ready 后点 `Buy 2`。Expected route 保持 Auto，输入窗口实际提示的 `BUY 2 MAX <price>` 并执行一次。
5. 核对最多两次购买、实际金币变化以及 Club/重复 Transfer 去向，然后保存 Buy diagnostics。

等待要求：Buy 可能因为不同 definition lane 和 8-15 秒搜索间隔运行数分钟。保持窗口打开，直到 Recap 显示 `completed | 2 purchased`，或明确显示 blocked/stopped 原因；运行中不要点击 Preview、Buy 或其它市场功能。如果连续 5 次搜索没有合格结果，本步不算通过，需要保存诊断后重新评估 `P`，不能立即重复执行。

### D. 单次定时双卡 Club Listing

创建 Job 时先把 Schedule Type 改为 `Once`，出现 `Run at` 后再勾 Armed。推荐字段：

| 字段 | 值 |
| --- | --- |
| Name | `V8 Once Club List 2` |
| Enabled / Armed | 均开启；确认其它所有 Job 的 Armed 都已关闭 |
| Schedule Type / Run at | `Once`；当前本地时间未来 2-5 分钟，且必须位于未来 15 秒至 15 分钟 |
| Misfire / Grace minutes | `Grace interval` / `15` |
| Card class | `Common Gold` |
| Club source / Transfer source | Club 开；Transfer 关 |
| Rating Min / Max / Buy Now | `75` / `82`；若计划复用这两张卡做步骤 E，可设置明显不具竞争力但仍符合 EA 上限的高价，例如普通低分金卡常见的 `10000`，以 EA 实际限制为准 |
| Use higher market quote | 关闭 |
| Start price / Duration | 为保留步骤 E 的测试卡，推荐 `Same as Buy Now` / `1 hour`；若不复用则可用 `One step below` |
| Max listings | `2` |
| Listing delay min / max | `4` / `8` |
| Expired items | `Skip expired` |

1. 等 Summary 至少有 12 个可用请求槽，确认没有其它 armed Job。
2. 创建一个 `New listing Job`：Schedule 为 Once、时间设在未来 2-5 分钟、Enabled 和 Armed 开、只勾 Club source、Expired items 为 Skip expired、Max listings 为 2；规则仍只覆盖两张低价值卡。若当前没有其它 expired 卡，建议把这两张卡按 EA 合法高价挂牌并把 Start price 设为 Same，使其一小时后成为步骤 E 的候选。
3. 保存后可点该 Job 的 `Run now`，在 Listing 窗口只做一次 `Preview` 核对将匹配两张低价值卡，然后关闭；不要点 Prepare/List。返回 Scheduler 后再次确认 Job 仍为 Armed。
4. 确认 guarded gate 要求 `RUN ONCE 2`。输入该文本并点击 `Enable guarded schedule` 一次；这一步会自动把 Scheduler 从 paused 切为 running，不需要再点其它 Start。
5. 保持页面登录且不运行其它 Loop/Trade 动作。到 `Run at` 时 Job 开始后会立即自动回锁；继续等待 History 写入结果。
6. 完成后确认 banner 为 `Scheduler: paused | Automatic execution: locked`、Job 已 disarmed、History 只有一个 `listing | completed | 2/2`，再保存一份 Scheduler diagnostics。至少再观察一个 tick，确认没有再次挂牌。

等待要求：从点击 Enable 起一直等到计划时间；到点后双卡 Listing 通常 1 分钟内完成。计划时间过去 2 分钟仍无 History，或显示 blocked，不要重新 Arm，直接保存诊断。

### E. 单次定时双卡 Transfer reprice

推荐字段与步骤 D 相同，但以下字段必须改为：

| 字段 | 值 |
| --- | --- |
| Name | `V8 Once Transfer Reprice 2` |
| Run at | 当前时间未来 2-5 分钟 |
| Club source / Transfer source | Club 关；Transfer 开 |
| Card class / Rating rule | 与两张目标 expired 卡一致，推荐 `Common Gold`、`75-82` |
| Duration / Max listings | `1 hour` / `2` |
| Expired items | `Reprice expired` |
| 其它 | market quote 关、Start price 为 `One step below`、Misfire 为 Grace 15 |

1. 只在有两张合适的 inactive/expired 低价值卡时执行。候选不必来自步骤 B；优先复用步骤 D 中以合法高价挂牌、自然到期的两张低价值卡。不要修改本地时间、Job JSON、EA 状态或调用未审核接口来强制过期。
2. 等 Summary 至少有 12 个可用请求槽；创建 Once Listing Job，未来 2-5 分钟、Enabled/Armed 开、只勾 Transfer source、Expired items 为 Reprice expired、Max listings 为 2。
3. 保存后可通过该 Job 的 `Run now` 打开 Listing 窗口，只做 Preview，确认正是两张目标 expired 卡后关闭。
4. 输入 `RUN REPRICE ONCE 2` 并启用一次，然后保持页面登录等待到点及执行完成。
5. History 必须为 `listing | completed | 2/2`；核对同一两张 item Active、价格一致、Transfer 容量不增加、Job 自动解除武装且无重复 Run，然后保存 Scheduler diagnostics。

等待要求：任何有效 Scheduled Reprice 实机验证都必须有真实 inactive/expired 卡，因此最短仍需等待 EA 的 1 小时挂牌自然结束。到期后页面可能短暂未刷新，先正常打开 Transfer List 确认 inactive，再回 Scheduler 操作；不要反复调用 Preview。复核 campaign 若暂时没有候选，可以先完成步骤 F，把 E 标记为 Pending，后续获得两张自然 expired 卡时单独补做；该次兼容性复核在 E 完成前不能判定通过。

### F. 单次定时双评分、数量二 Buy

推荐沿用步骤 C 的评分和价格 `P`。先选择最低保留金币 `R`：`R` 是无论如何都不希望低于的余额，必须满足当前金币 `C - R >= 2 * P`；本轮关闭其它自动购买。推荐字段：

| 字段 | 值 |
| --- | --- |
| Global minimum retained coins | 在 Jobs 页填写 `R` 并点 `Save reserve` |
| Name | `V8 Once Buy 2` |
| Enabled / Armed | 均开启；其它 Job 全部 unarmed |
| Schedule Type / Run at | `Once`；未来 2-5 分钟 |
| Misfire / Grace | `Grace interval` / `15` |
| Card class | `Rare Gold` |
| Rating min / max | 与 C 相同，例如 `84` / `85` |
| Max Buy Now / Rating prices | `P` / 留空 |
| Quantity / Total budget | `2` / `2 * P`，总预算不超过 4000 |
| Job minimum retained coins | 填与全局相同的 `R`，避免确认文本产生歧义 |
| Max runtime / Empty limit / Delays | `5` / `5` / `8-15` |

1. 等 Summary 恢复到至少 28 个可用请求槽，确认只有一个 armed Job，并再次核对 Global minimum retained coins。
2. 创建 Once Buy Job：未来 2-5 分钟、Enabled/Armed 开、Rare Gold、两个相邻评分、Quantity 2、每卡不超过 2000、Total budget 不超过 4000、Job minimum retained coins 不得低于希望保留的余额。
3. 保存后先点 Job 的 `Preview`，确认显示两个 rating lane 且 `Buy 2 ready`；scheduled Job 不应出现可执行的手动 Buy 按钮。
4. 输入界面实际要求的 `RUN BUY ONCE 2 RESERVE <R>`，点击 `Enable guarded schedule` 一次，然后保持页面登录等待。
5. 到点开始时 Scheduler 会自动回锁。Buy 最长可运行约 5 分钟；等待 History 出现 `buy | completed | 2/2` 或明确停止原因。
6. 完成后核对金币不低于 `R`、最多两次 Buy mutation、Club/重复 Transfer 路由正确、Job disarmed、没有重复 Run；再保存最终 Scheduler diagnostics。

等待要求：计划时间之后至少允许 `Max runtime + 2 分钟` 完成搜索和对账。期间不要打开 Transfer Market、开包、跑 Loop 或操作另一个 EA 标签页。超时仍无 History 时直接导出诊断，不重新 Enable。

### 一次性交付

全部步骤完成后统一提供：

- 从 `Ready v0.7.70` 开始的完整 Runner log。
- 步骤 A、B 各自保存的 Listing diagnostics。
- 步骤 C 保存的 Buy diagnostics。
- 步骤 F 完成后保存的最终 Scheduler diagnostics；若定时阶段出现异常，同时保存当时对应的 Listing/Buy diagnostics。

任何步骤出现 `ambiguous`、Journal review required、身份/价格/去向不一致、页面崩溃、未知 EA 状态或非预期重复 Run，都立即停止，不继续后面的步骤，不清 Tampermonkey 存储，也不重试同一交易。保存当时的 Runner log、Scheduler diagnostics 和相关 Trade diagnostics 后再调查。

## 交易运行时的状态

- `paused`：调度器不执行到期任务；已经开始的安全收尾仍可能完成。
- `liveExecutionEnabled=false`：只允许 Preview/诊断，不会发送 Buy 或 Listing mutation。
- `armed=false`：Job 配置仍保留，但不会被调度器执行。
- `manual-only`：Manual Job 只能通过 `Run now` 进入人工确认流程，不能 Armed，也不占用自动调度门禁。
- `waiting-session`：页面、EA 或 FSU 状态没有达到交易所需的就绪条件。
- `waiting-operation`：Loop、SBC、开包或其它写操作占用共享 Coordinator；调度器应等待，而不是并行发送请求。
- `browser-lock-held`：另一个同源标签页持有 Web Lock；这是跨标签页互斥的正常证据。
- `cooldown / trade-request-budget-insufficient`：最近 5 分钟内不足以为当前任务规模保留所需 EA Trade 请求槽；等待 Summary 显示的恢复时间，不要重复 Preview、Arm 或 Start。
- `blocked`：安全门禁拒绝了本次运行，通常会写入一条 History 回执并解除 Job 武装。
- `completed`：请求、金币/库存对账和目标位置核验完成；仍应检查最终回执。

## 请求预算与调度顺序

- EA Trade 请求预算固定为每 5 分钟 30 次，并通过 Tampermonkey 存储在标签页之间共享。支持 Web Locks 的浏览器会串行化预算占用。
- Listing 在 Prepare 前原子保留 12 个槽并让 Prepare/Transaction 共用同一 reservation；Buy 按最坏搜索和对账路径预留，单张 14 个槽、双张 28 个槽。事务结束后未使用槽会释放，已经发送的 EA 请求仍保留到窗口到期。
- EA capability/repository 的本地读取以及 FUTNext/FUT.GG Provider HTTP 不计入该预算。Summary 中 `Used/Remaining` 是 EA Trade Adapter 请求聚合，不是全部网络流量。
- `Trade capacity: cooldown` 不代表 EA Circuit 已打开。它是本地限流，等待界面显示的恢复时间；不要清 Tampermonkey 存储，也没有提高或跳过预算的入口。
- 若 Buy 与 Listing 同时到期，内部选择器会交替类型；同类型按最早计划时间和 Job ID 排序。但当前生产门禁仍只允许恰好一个 armed Job，因此该规则不会开放多个 Job 同时自动交易。
- 浏览器异常关闭时，未释放 reservation 会在最长 5 分钟后自然过期。恢复页面后先查看 Summary/diagnostics，不要立即重复发起交易。

## 诊断文件

### Scheduler diagnostics

从 Trade Scheduler 保存 JSON 诊断。每次故障至少保存一份，最好同时保存 Runner 日志。诊断包含：

- Runner/Scheduler 版本、暂停和实时执行状态、Job/Runtime、History 和累计 Summary。
- Lease、Web Lock、Coordinator、Circuit、页面和 FSU readiness 的脱敏状态。
- Buy/Listing Preview、Prepared、Receipt 和有限的运行时间线。
- Player Catalog 和 Price Quote 的健康状态、缓存聚合数量、TTL 和活动计数。
- EA Trade 请求预算的窗口、使用/剩余数量、动作聚合、当前任务容量恢复时间和 Web Lock 支持状态。
- Listing/Buy Journal 的最多两个逐项状态、mutation boundary 和脱敏响应摘要。

诊断不会包含 EA 认证信息、Lease token、完整 definition ID 列表、价格、URL 或原始异常对象。上传前仍应检查文件内容，账号标识、用户名或第三方日志中的个人信息应自行删除。

### Runner log

日志用于解释时间顺序和具体停止原因。保存从 `Ready` 开始到停止/完成之后的完整内容，不要只复制最后一条异常。至少包括：

- 版本、Profile、Job 名称和计划时间。
- `waiting-session`、`waiting-operation`、`browser-lock-held`、Preview 和 mutation 的先后顺序。
- EA 状态码、`success`、Stop reason、请求次数、金币对账和目标 pile。

## 故障处理

| 现象 | 首选处理 | 不要做的事 |
| --- | --- | --- |
| `waiting-session` 持续存在 | 保持页面登录，等待 FSU Club readiness；保存诊断后再刷新一次 | 不要连续 Arm、刷新或重复创建 Job |
| `waiting-operation` | 等 Loop/SBC/开包完成；确认 Runner operation 已恢复 false | 不要在另一个标签页强行运行交易 |
| `browser-lock-held` | 在两个标签页都导出诊断，关闭不用的标签页后等待下一次 tick | 不要手工重复发送 Buy/Listing |
| `trade-request-budget-insufficient` | 查看 Summary 的当前任务容量恢复时间，保持 Job 不再重复 Arm，等待窗口自然恢复 | 不要清 Tampermonkey 存储、刷新多个标签页或绕过预算 |
| `expired-lease-reconciliation-required` | 停止并刷新登录，确认 Transfer/Club 状态后重新建立一次性 Job | 不要绕过回锁或直接重试原请求 |
| `listing-journal-mutation-review-required` / `buy-journal-mutation-review-required` | 保存 Scheduler 和对应 Trade diagnostics，逐项核对 EA Transfer/Club/Unassigned 与金币后停止等待代码审查 | 不要覆盖 Journal、清 Tampermonkey 存储或再次确认同一交易 |
| `circuit=open` | 按 `retryAt` 等待，检查 429/401/Captcha/EA service error 原因 | 不要清空 History 或反复点击 Start |
| Provider 为 `stale`/`empty` | 先保存诊断；确认网络和 Provider 配置，必要时显式清除对应缓存，再重新 Preview | 不要在旧 Preview 上 Arm 或执行 |
| Unassigned 卡无法确认去向 | 停止 Runner，刷新 EA 页面并重新读取 Unassigned/Storage/Transfer/Club | 不要继续开包、提交 SBC 或发送移动请求 |
| EA 返回 HTTP 200 但 `success=false` | 以失败处理，检查 History、Circuit 和 EA 页面状态 | 不要把 HTTP 200 当成交易成功 |

任何一次交易结果不确定时，优先以最终 EA 仓库状态和诊断回执为准。不要通过重复购买或重复挂牌来“验证”结果。

## Provider 与缓存

打开 `Providers` 只读健康信息，不会主动加载 FUTNext、FUT.GG，也不会触发 EA Adapter 请求。`loadCount=0` 表示这次页面生命周期没有发生 Provider load；它不是“Provider 永远可用”的保证。

点击 `Clear player catalog` 或 `Clear price quotes` 会先暂停调度器、关闭实时执行并解除所有 Job 武装，再清理对应缓存。清理不会写 History、改变 Summary 或触发交易。清理后必须重新 Preview，并重新确认/Arm Job。

Price Quote 是当前页面内存缓存，刷新页面后为空是正常现象。Player Catalog 是可持久化的规范化缓存，清理后显示 `empty` 也是预期现象，后续 Preview 才会按需要重新加载。

## 最小证据包

提交 Issue 前收集以下文件：

1. 一份完整 Runner log。
2. 一份故障发生后的 Scheduler diagnostics。
3. 若涉及 Providers 或缓存，再提供清理前和清理后的两份 diagnostics。
4. 若涉及 UI，提供浏览器版本、Runner/FSU 版本、Active Profile 和截图。
5. 说明是否启用 Enhancer、是否有第二个 EA 标签页，以及故障前是否运行 Loop/Batch/SBC/开包。

不要上传 Cookie、Authorization header、Tampermonkey 全部存储、ntfy token 或未脱敏的网络导出。

## 发布与回滚

发布前运行 `npm run verify`，确认版本、测试文件数、测试数量、userscript 构建结果和 FSU 资源检查均通过。正式版通过 GitHub Release 的 `DailyLoopRunner.user.js` 安装；不要混用旧 Validation 脚本。

出现交易行为异常时，先在 UI 中 Stop、关闭实时执行并解除 Job 武装，再安装上一份已验证版本或等待诊断调查。不要用回滚掩盖未确认的 EA 状态；首先保存最小证据包。
