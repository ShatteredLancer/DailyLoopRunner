# Trade Scheduler 操作、安全与故障排查

本文描述 Trade Scheduler 当前版本的可用边界、运行前检查、诊断证据和故障恢复方式。它不是 EA 接口说明，也不替代 EA、FSU 或 Enhancer 的使用条款。

## 当前边界

TS9-TS12 已在 `0.7.84` 完成自动与实机验证。正式版 `v0.7.91` 在此基础上增加 TS13 多 Job 和恢复协议；V13-15 最终 canary、本地完整验证、远程 Verify 和不可变 GitHub Release 均已完成：

- 手动 Club Listing / Transfer reprice：单一来源、每 Run 1-4 项、每 chunk 最多 2 项；挂牌前后核对同一 item、definition、价格、duration 和 Transfer 状态。
- 手动和定时 Buy：只允许 Rare Gold、最多 4 个连续评分和 4 项、每卡不超过 2000、总预算不超过 8000；支持逐评分价格/数量配额、Club 和重复卡 Transfer 路由。
- 定时 Buy / Club Listing / Transfer reprice：只允许 `once/daily/interval/window`，最多 3 个 independently authorized armed Jobs；once/window 各授权 1 Run，daily/interval 各授权 2 Runs。
- 所有 Job 共用一个 Operation Coordinator、Web Lock、持久 Lease 和 EA request budget；全局同时只能有一个 Trade mutation Run，最早 due time 优先，同 due time 才交替 Buy/Listing 类型。
- Listing/Buy Journal 最多记录四项的 mutation boundary 和终态；任一未知 mutation 会在授权消费前全局阻止全部新 Trade 写入。
- Recovery 页只允许在 Scheduler paused/live-disabled、Runner 空闲和无 active Lease 时，用精确文本与至少 8 字符原因人工 acknowledge，并写有界 Audit/blocked History；该操作不调用 EA。
- 过期 Lease 采用两阶段接管：先只读对账；只有匹配终态 History 且无未知 Journal 时，下次 Scheduler 才清理旧 Lease并获取新 Lease。
- 页面关闭、浏览器退出或未登录时不交易；恢复后只按 misfire、当前授权、Journal 和 Lease 处理，不补做未经授权的旧 occurrence。

以下能力仍受门禁，不应通过修改配置绕过：

- 第五张及更多卡、超过 4 个或不连续的 Buy 评分、稀有金以外 Buy 卡类和 `next-login`。
- 第四个 armed Job、无限授权、无上限 Bulk Buy/Bulk Listing、自动出价、自动 Quick Sell 和自动套利。
- Bulk relist、Club + Transfer 混合来源、`relistExpiredAuctions()` 和任何没有明确候选、身份、价格或库存去向的交易动作。
- 页面关闭/未登录时交易、自动确认未知 Journal、保存 EA 凭证或由 Companion/服务器直接调用 EA。

## 运行前检查

1. 使用正式版 Runner，并确认日志显示 `Ready v...`。
2. 保持 EA Web App 登录，确认 FSU 已加载并完成 Club readiness；FSU 为 provisional 或缓存未验证时，交易任务可能停在 `waiting-session`。
3. 关闭 Enhancer Trader、其它自动买入/挂牌工具和会修改 Transfer/Club 的脚本。
4. 确认没有 Loop、Batch Open、SBC 提交、开包或其它 Runner operation 正在运行。
5. 检查 Trade Scheduler 的 `Providers`、`Summary` 和 `Jobs`：缓存不是空的，任务参数在当前门禁内，Job 只有在确认后才 Armed。
6. 为 Buy 设置全局最低保留金币。Job 局部值只能提高该底线，不能降低它。
7. 即使 V13-15 已通过，普通使用仍应采用已验证的小额范围；不得通过导入 JSON 绕过数量、来源、评分、价格或调度门禁。

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

## V9-12 候选合并验证

本节用于候选 `0.7.84` 的实机 campaign。`0.7.80` 已完成第一轮步骤 1-7，当前只需按文末“补充验证”重跑未闭合场景。开始前先确认 `npm run verify` 对应的构建已经通过；同一轮只安装一次脚本。任一步出现 `ambiguous`、未知 Journal、身份/价格/去向不一致、页面崩溃、427、429、Captcha 或非预期重复 Run，立即停止整个 campaign，不重试、不清存储，并导出当前证据。

### 共同准备

1. 刷新 EA Web App，确认 `Ready v0.7.84`，关闭 Enhancer Trader 和其它市场自动化，停止全部 Loop/Batch/SBC/开包操作。
2. Trade Scheduler 保持 locked；Circuit 必须 closed，Lease/Coordinator/Listing Journal/Buy Journal 必须为空或为可覆盖的 completed 终态。
3. Transfer List 预留至少 10 个空位；Unassigned 为空；设置明确的 Global minimum retained coins。
4. 等 Request Summary 自然恢复。不要通过刷新、多标签并发或清 Tampermonkey 存储制造容量。
5. 保存基线 Scheduler diagnostics。后续文件按步骤命名；一个步骤正常完成后再进入下一步。

### 1. 手动四卡 Club Listing

1. 准备 4 张愿意挂牌的低价值可交易 Common Gold，规则尽量只覆盖这 4 张。
2. 打开 Manual listing：Source=`Club`，market quote 关闭，Duration=`1 hour`，Expired=`skip`。候选版 Manual listing 上限固定为 4，没有单独的 Max listings 输入框。
3. 先 Preview，再 Prepare；必须恰好看到 4 张及 `LIST 4`。逐项核对 item、definition、Bid、Buy Now 和 duration。
4. 输入 `LIST 4` 一次并等待完成。正常结果是两个 chunk、索引 1-4、4 个 exact item 均 Active；不要因为第二 chunk 等请求预算而重复点击。
5. 保存 Listing diagnostics。确认 recap 不显示内部 `chunk-summary`，但 diagnostics/Journal 能看到两个 chunk。

### 2. 手动四卡 Transfer Reprice 与 Stop

1. 等步骤 1 的 4 张卡自然到期并在 EA Transfer List 显示 inactive；不要调用批量 relist。
2. Source=`Transfer`，Expired=`reprice`；固定候选上限仍为 4，执行 Preview/Prepare 并确认文本为 `REPRICE 4`。
3. 输入 `REPRICE 4` 后，在第一或第二张完成后的安全间隔点一次 Stop。不要追求精确制造“两个成功”，任何 1-3 个已核验成功且其余 skipped 都可作为 Stop 证据。
4. 等 recap 进入 `stopped`；已成功项必须 Active，未执行项保持 inactive，Transfer 容量不增加，Journal 不得为 unknown/ambiguous。
5. 保存 Listing diagnostics。剩余 inactive 卡不要在同一页面立即重试；后续需要 reprice 候选时可另建新 Job、重新 Preview 和确认。

### 3. 手动四卡多评分 Rare Gold Buy

1. 选择 3 个连续低风险评分，例如 84-86，调查愿意支付的每评分上限 `P84/P85/P86`，每个必须 `<=2000`。
2. 创建 Manual Buy：Rating 84-86，Quantity=`4`，Rating quantities=`84=2, 85=1, 86=1`，Rating prices 填对应上限，总预算不超过 8000，Max runtime 建议 15，Empty limit 不超过 5。
3. Preview 必须显示三个逐评分 lane、配额、总预算、Runtime、Chunk 2 和 reserve。Expected destination 保持 Auto。
4. 输入窗口给出的 `BUY 4 MAX <最高评分上限>` 一次。第二 chunk 可能等待 5 分钟请求窗口恢复；等待期间不应发送 EA market 请求，UI/Journal 应显示 budget waiting。
5. 完成后必须正好按 2/1/1 购买，索引为 1-4，金币不低于 floor，重复卡去 Transfer、非重复卡去 Club。保存 Buy diagnostics 和 Scheduler diagnostics。

### 4. Daily 单次观察与人工回锁

1. 创建低价值 Club Listing Job，Max listings=`1`，Schedule=`daily`，时间设为当天未来 2-5 分钟，Timezone 使用当前有效 IANA 时区，Grace=`15`，只保留这一个 armed Job。
2. 输入 `RUN DAILY 1 FOR 2 RUNS`。UI 必须显示授权 `2/2` 及 expiry。
3. 保持前台登录直到第一次 occurrence 完成；History 只能增加一个 Run，授权应变为 `1/2`，Job 保持等待下一天。
4. 点击 Disable scheduling 人工回锁；确认 authorization 清空、Job disarmed，等待后续 tick 不重复。保存 Scheduler diagnostics。

### 5. Interval 两次 occurrence 与 UI 原地刷新

1. 准备至少 4 张低价值 Club 可交易卡。创建 Club Listing，Max listings=`2`，Schedule=`interval`，Every minutes 建议 `5`，Grace=`15`，只 armed 该 Job。
2. 输入 `RUN INTERVAL 2 FOR 2 RUNS`。保持页面登录，不操作其它市场功能。
3. 第一次应挂牌 2 张并把授权降到 1；第二次应挂牌另外 2 张并耗尽授权。第二次结束后自动 paused、locked、disarmed。
4. Scheduler 对话框必须无需关闭重开即可更新授权、runtime 和两条不同 runId 的 History；第三个间隔不得执行。
5. 保存 Scheduler diagnostics。若第一轮用完候选导致第二轮 `no-eligible`，保存证据并停止，不通过扩大评分范围临时补救。

### 6. Window occurrence、后台恢复与 Loop 互斥

1. 创建 Quantity=`1` 的低价 Rare Gold Buy 或 Max listings=`1` 的 Club Listing，Schedule=`window`，窗口从未来 2 分钟开始、持续 10 分钟，Grace=`15`。
2. 输入对应的 `RUN BUY WINDOW 1 RESERVE <floor>` 或 `RUN WINDOW 1`；window 只授权一次。
3. 在窗口开始前切到其它普通网页标签 2-3 分钟，但不要关闭 EA 标签和浏览器。返回 EA 后确认任务至多执行一次。
4. 若要验证 Loop 互斥，在窗口开始前运行一个只读或低风险、预计数分钟结束的 Loop；Trade 应显示 waiting-operation，Loop 结束且仍在窗口/grace 内才执行。不要让 Loop 留下 Unassigned 或未知写入。
5. 完成后刷新 EA 页面并重新登录。History 仍只能有一个该 window run，Job 不得补跑。保存刷新前后 Scheduler diagnostics和完整 Runner log。

### 7. Listing 报价 fallback 与高价排除

1. 使用低价值 Club 卡打开 Manual listing，开启 market quote。先选择 Quote fallback=`Use configured price`，Preview 中核对 `quoteSource/quotedAt/expiresAt/quoteStatus`；若当前自然出现 stale/unavailable，应看到使用配置价。
2. 改为 Quote fallback=`Skip item` 并重新 Preview。只有在报价自然 stale/unavailable 时才要求该项被跳过；不要断网或高频刷新来制造 Provider 失败。
3. 用只读 Preview 检查一个配置价或报价计算后 Buy Now 高于 10000 的规则，目标项必须显示 `high-value-listing-excluded`，不得进入 Prepare 或 `listItem`。如果所有候选都高于 10000，`selected=0` 和 Prepare 显示 `no-eligible-listing-candidates` 正是预期结果，不应为了选中卡片而提高阈值。
4. 本步骤不要求真实挂牌高价值卡。保存 Listing diagnostics；若当前没有自然 stale/unavailable quote，记录为“fallback 分支未触发”，不算 mutation 失败。

### 一次性交付

全部可执行步骤结束后统一提供：完整 Runner log、步骤 1/2/7 的 Listing diagnostics、步骤 3 的 Buy diagnostics，以及步骤 3-6 的 Scheduler diagnostics。文件名保留原始时间戳并注明步骤号。V9-12 通过前不打 release tag，不把 4 项或 recurring 描述为已实机验证的稳定能力。

### 2026-08-11 第一轮结果与补充验证

- 步骤 1 通过：手动 Club Listing 完成 `4/4`，两个 chunk 均完成，四张卡均核验为 Active。
- 步骤 2 通过：Transfer reprice 在 Stop 后为 `2 succeeded / 2 skipped`，未越过后两张卡的 mutation boundary。
- 步骤 3 通过：`0.7.83` 使用实际保存的非均匀配额 `84=1, 85=1, 86=2` 完成 `4/4`。第一 chunk 将 85/1100、84/800 路由到 Club；第二 chunk 在需要 28 个请求槽而仅剩 21 个时本地等待约 298 秒，恢复后将两张重复 86（1400、1100）路由到 Transfer。最终 failed/skipped 均为 0、总花费 4400、Journal 为 `completed / receipt-recorded`、Circuit closed。该组合与 Preview/Job 配置完全一致，足以验证三评分、非均匀配额和跨 chunk 状态继承。
- 步骤 4 通过：Daily 只执行一次，人工回锁后 authorization 清空、paused/locked/disarmed。
- 步骤 5 交易部分通过：两个 occurrence 各完成 `2/2`，且没有第三次 Run；但 `0.7.80` 在授权耗尽后把旧 `waiting-time/nextRunAt` 覆盖回 Store。`0.7.81` 已修正并增加执行中删除/编辑 Job 的保护。
- 步骤 6 通过：Trade 在 Loop 占用期间持续 `waiting-operation`，Loop 结束后在窗口内只执行一次；后台、刷新和重登后没有补跑。
- 步骤 7 发现 Planner 缺陷：9 个初筛候选先按 `maxListings=4` 截取前 4 个 definition 取得报价，这 4 个都因报价加 markup 后超过 10,000 而触发 `high-value-listing-excluded`。保护门禁本身正确且没有 Prepare、receipt 或 mutation，但 Planner 没有继续检查后 5 个 deferred 候选，因此 `selected=0` 不能视为完整正确结果。自然 stale/unavailable 报价未出现；fallback 分支由自动测试作为发布门禁，实机证据改为可选。

`0.7.84` 的补充 Interval 终态验证已经闭合：

1. `Interval terminal 0.7.84` 在 10:17 和 10:22 完成两次独立 `2/2` Listing，最终为 `completed`、`nextRunAt=null`、`runCount=2`、authorization 为空、paused/locked/disarmed。
2. 诊断在理论第三次到点后继续观察约 296 秒；期间 115 次 tick 均保持 paused，未出现第三次运行。证据文件为 `trade-scheduler-diagnostics-2026-08-12T02-32-18-075Z.json`。

Step 7 的候选回填已在 `0.7.84` 修复：Planner 最多报价 16 个已排序候选，高价或 fallback-skip 候选计为 rejected 后继续查找，池外候选保持 deferred。真实页面只读 Preview 属于可选兼容性观察，不要求挂牌，也不影响剩余 Interval 发布门禁。

报价 fallback 不再要求继续人工制造或等待 stale/unavailable。现有自动测试分别锁住 `Use configured price` 和 `Skip item`；真实页面若自然出现该状态，再保存只读 Listing diagnostics 作为补充证据即可。不要通过断网、高频请求、清 Tampermonkey 存储或修改系统时间制造失败。

## V13-15 多 Job、恢复与最终 canary

本节只用于候选 `0.7.91`。`0.7.90` 的首次 canary 已在首轮执行阶段停止，不能从残留 Job 状态继续；必须安装新候选并从共同准备重新开始。整轮只安装/刷新一次候选脚本；预计主动操作 45-60 分钟，低频观察 2-4 小时。不要在 EA mutation 已开始时故意关闭浏览器，不要主动制造 429/427、断网、Captcha、Transfer 满或 Unassigned 阻塞。任一步出现 `ambiguous`、未知 Journal、重复 Run、身份/价格/去向不一致或页面崩溃，立即点击 `Disable scheduling`，停止整轮并导出当时证据。

### 共同准备

1. 安装根目录构建的 `DailyLoopRunner.user.js`，只刷新 EA Web App 一次，确认日志为 `Ready v0.7.91`。关闭 Enhancer Trader 和其它自动交易工具；FSU 可以保持启用。
2. 处理正常可移动的 Unassigned；Transfer List 至少保留 8 个空位。准备 4 张愿意以低价挂牌的可交易 Common Gold，其中至少 1 张已在 Transfer List 中自然到期并显示 inactive。
3. Trade Scheduler 中点击 `Disable scheduling`。确认 Circuit=`closed`、Scheduler=`paused`、Automatic execution=`locked`、Recovery 无待处理项，Lease/Coordinator 空闲。
4. 在 Jobs 页设置 `Global minimum retained coins`，建议为当前金币减去本轮最多愿意支出的 4000，点击 `Save reserve`。
5. 等 Summary 的 Requests 至少有 28/30 available。不要清 Tampermonkey 存储或提高预算；若不足，只按界面时间等待自然恢复。
6. 保存一份基线 Scheduler diagnostics，并从此时开始保留完整 Runner log。

### 1. 一次配置三个 Job

按以下顺序保存，三个 Job 都设为 Enabled + Armed；除所列字段外沿用安全默认值，Misfire=`Grace interval`、Grace minutes=`15`：

| Job | 配置 | 数量与价格 | Schedule |
| --- | --- | --- | --- |
| `V13 Buy` | Buy；Rare Gold；一个愿意购买的低评分，例如 84 | Quantity=`1`；Max Buy Now/Rating price/Total budget 均设为可接受且 `<=2000`；Job reserve 留空或高于全局 reserve | `Interval`，Every minutes=`20` |
| `V13 Club` | Listing；只勾 Club；Common Gold；market quote 关闭；Expired=`Skip expired`；Duration=`1 hour` | Max listings=`1`；规则尽量缩小到准备的低价卡；Buy Now 使用可接受低价 | `Interval`，Every minutes=`25` |
| `V13 Reprice` | Listing；只勾 Transfer；Common Gold；market quote 关闭；Expired=`Reprice expired`；Duration=`1 hour` | Max listings=`1`；规则只覆盖已到期低价卡 | `Window`；先保存两个 Interval Job，再按下述时间设置 |

Interval 的 anchor 在保存时建立，首轮执行时间是 `anchorAt + Every minutes`；启用 Scheduler 不会把尚未到期的 Interval 提前执行。先在 Jobs 页记下 `V13 Buy` 和 `V13 Club` 显示的首轮 `Next`。将 Reprice 的 Window Start 设为两者较晚的首轮 Next 再加 5 分钟，End 设为 Start 后 20 分钟。例如 Buy Next=14:20、Club Next=14:25，则 Reprice Start=14:30、End=14:50。三个 Job 总授权应为 5 Runs：两个 Interval 各 2 次，Window 1 次。

1. 三个 Job 全部保存后，不再编辑、删除、导入或清 Provider cache；这些操作会按设计全局回锁。
2. Jobs 页确认恰好 3 个非 Manual Job 为 Armed。确认框应显示 `ENABLE 3 TRADE JOBS FOR 5 RUNS`。
3. 精确输入该文本并点击 `Enable guarded schedule` 一次。Banner 应显示 `3 Job(s) | 5/5 Run(s) left`；不要对每个 Job 分别确认。

### 2. 首轮执行、Loop 互斥与预算等待

1. 启用后保持 EA 标签前台，先等待最早 due 的 Interval Job 完成。Scheduler 必须全程串行，一次只能看到一个 Buy 或 Listing operation。
2. 第一项完成后不要再次点击 Enable。等待第二个 Interval Job 到达自身显示的 `Next` 后运行；每项各生成一个不同 `runId`，且只扣减对应 Job 的 authorization。
3. 在 `V13 Reprice` Window 开始前约 1 分钟，运行一个你已熟悉、预计 2-5 分钟完成且不会遗留 Unassigned 的低风险 Loop。不要为了实验临时扩大 SBC 材料保护。
4. Window 到点时，Trade Scheduler 应显示 `waiting-operation / runner-operation-active`；此时不得发出 Listing mutation。Loop 正常结束后，Trade 才能继续评估。
5. 前两次 Trade 的真实请求通常会使 Reprice 或后续 occurrence 进入 `cooldown / trade-request-budget-insufficient`。这必须是自然结果：只观察 Summary 的 required/remaining/retry 时间，等待恢复，不反复 Preview、刷新、Arm 或 Enable。若本轮请求数量刚好足够而未出现 cooldown，记录为“未自然触发”，不主动制造失败；Fake-clock/预算测试仍是发布门禁。
6. `V13 Reprice` 必须在 Window/grace 内至多执行一次；若预算直到 Window/grace 结束仍未恢复，应形成一条可解释的 missed/blocked 证据，不得扩大窗口后重试同一授权。

### 3. 后台标签、刷新/重登和授权终态

1. 首轮三个 Job 均已完成或进入明确等待后，保存一份中间 Scheduler diagnostics。
2. 在距离两个 Interval 的第二次到点至少 3 分钟时按 F5 刷新 EA 页面；若 EA 要求重新登录，正常登录。等待 `Ready v0.7.91`，不要重新 Arm 或 Enable。
3. 确认授权、History 和下一次运行时间仍在；然后切到另一个普通网页标签，让 EA 标签保持后台 5-10 分钟。不要关闭 EA 标签或整个浏览器。
4. 回到 EA 标签。visibility/focus tick 应立即恢复评估；两个 Interval 各自的第二次 occurrence 应按 due time 串行执行或按 15 分钟 grace 给出明确结果。
5. 两份 Interval 授权都耗尽后，Job 应各自 disarm；最后一份授权耗尽时 Scheduler 自动变为 paused/locked。等待至少超过一个最短 Interval，再确认没有第三次 occurrence。
6. 核对 History：每个 Interval Job 最多两个 Run，Window Job 最多一个 Run；没有重叠 mutation、重复 `scheduledFor` 或超出 5 次总授权的 Run。

### 4. 受控 Lease Recovery

本步骤使用独立单卡测试 Job，不复用上面的三个 Job。测试辅助入口只写一条已过期 Lease，不调用 EA；操作上必须严格保持 `once + Club-only + maxListings=1 + expiredPolicy=skip`。

1. 确认 Scheduler paused/locked、所有旧 Job unarmed、Runner idle、Recovery 无待处理项，且至少还有 1 张愿意低价挂牌的 Club 可交易 Common Gold。
2. 新建 `V13 Lease Recovery` Listing Job：只勾 Club，Common Gold，market quote 关闭，Expired=`Skip expired`，Max listings=`1`，Schedule=`Once`，Run at 设为未来 2-3 分钟，Grace=`15`，Enabled + Armed。
3. 打开浏览器 Console，只执行下面这一行：

```javascript
window.__FCLoopRunner.stageExpiredTradeLeaseValidation({ confirmationText: 'EXPIRE LEASE 1' })
```

4. 返回 Scheduler。全局 Recovery 门禁应立即阻止 `Enable guarded schedule`，不得先等 Job 到点；打开 `Recovery` 页，应看到 `LEASE Recovery`、测试 Lease `runId` 和 evidence hash。此阶段没有 Prepare、市场请求或 Listing mutation。
5. 保持 EA 页面状态不变，Exact confirmation 输入界面显示的 `ACKNOWLEDGE LEASE <runId>`；Audit reason 输入 `Confirmed staged lease had no EA mutation`，点击 `Acknowledge after EA check`。
6. 确认 Audit 新增同一 `runId`，History 新增同一 `runId` 的 `blocked / manual-lease-recovery-acknowledged` 且 requested/succeeded 均为 0。此时过期 Lease 仍存在是预期行为：acknowledge 只写 Audit 和 blocked History，不直接清 Lease，也不调用 EA。
7. 回 Jobs 页，把同一测试 Job 的 Run at 改到未来 2-3 分钟并重新 Armed。输入界面显示的 `RUN ONCE 1` 启用；下一次 tick 应先用已确认的终态 History 清理旧 Lease，再获取新 Lease并正常完成这一次单卡 Listing。
8. 最终确认 Recovery 不再要求处理、Lease/Coordinator 空闲、Journal 为确定终态、Circuit closed、Scheduler paused/locked、Job disarmed。

### 一次性交付与通过标准

全部步骤结束后一次性提供：

1. 从 `Ready v0.7.91` 开始到最终 Recovery 完成后的完整 Runner log。
2. 基线、中间、最终三份 Scheduler diagnostics；最终文件必须包含 Recovery Audit、Buy/Listing Journal、Lease、request budget、Scheduler events 和 `runId` correlations。
3. 若任何步骤打开了独立 Buy/Listing 对话框并产生 diagnostics，也一并提供；纯 Scheduled Run 不要求为了导出而重复执行手动交易。
4. 一张最终 Jobs/Recovery 页面截图，显示 paused/locked、0 个待处理 Recovery 和授权终态。

通过标准：三个 Job 独立扣减授权且全局串行；Loop 与 Trade 不并发；预算等待不发送 EA 请求；后台/刷新/重登不重复 occurrence；过期 Lease 在人工审计前不被覆盖，审计本身不调用 EA，后续两阶段接管成功；总计无未知 Journal、无重复 mutation、无超预算和无未解释状态。通过前不打 tag、不发布 Release。

### `0.7.91` 实机结果

V13-15 campaign 已于 2026-08-12 完成。Prepare/Mid/End diagnostics 分别记录了五份授权的初始、首轮后和最终状态：Buy `2/2`、Club Listing `2/2`、Transfer Reprice `1/1`，所有 Run 均为 `completed` 且 requested/succeeded=`1/1`。Player Pick Loop 于 15:55:10 结束，Reprice 于 15:55:12 才开始，证明共享 Coordinator 没有并发 mutation。F5 后 page owner 发生变化，但剩余两个 Interval 授权和 `Next` 保留；第二轮完成后 Scheduler 自动 paused/locked，三个 Job 全部 disarmed，未出现第三轮、重复 `runId` 或重复 `scheduledFor`。

受控 Lease `expired-lease-validation-1786523178663` 以 evidence `12bf5b68` 写入零 mutation 的人工 Audit 和 blocked History；随后重新授权的一次 Club Listing 成功，最终 Lease/Coordinator 空闲、Recovery 为空、Circuit closed。请求预算全程没有自然降到 cooldown，不主动制造该状态符合操作要求，其行为继续由自动测试和 fake-clock soak 覆盖。最终截图底部残留的 `Guarded schedule enabled for 1 Job(s)` 是临时 UI status 未清除，Banner 和持久状态已正确显示 paused/locked；该 UI 提示已单独修正。补交的 `log2.txt` 从 F5 后 `Ready v0.7.91` 开始，完整记录第二轮 Buy/Club、Lease staging、acknowledgement、两阶段 reconciliation 和最终 Listing，与 End diagnostics 一致。

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
- 每个 chunk 最多处理两项并独立取得预算；Listing chunk 在 Prepare 前原子保留 12 个槽并让 Prepare/Transaction 共用该 reservation，Buy chunk 按最坏搜索和对账路径预留，单张 14 个槽、双张 28 个槽。四项 Run 的第二个 chunk 必须等新的预算可用；等待期间不轮询 EA。事务结束后未使用槽会释放，已经发送的 EA 请求仍保留到窗口到期。
- EA capability/repository 的本地读取以及 FUTNext/FUT.GG Provider HTTP 不计入该预算。Summary 中 `Used/Remaining` 是 EA Trade Adapter 请求聚合，不是全部网络流量。
- `Trade capacity: cooldown` 不代表 EA Circuit 已打开。它是本地限流，等待界面显示的恢复时间；不要清 Tampermonkey 存储，也没有提高或跳过预算的入口。
- 最多 3 个 independently authorized armed Jobs 可以同时等待，但全局仍只允许一个 Trade mutation Run。选择器先按最早 due time；只有 due time 相同才交替 Buy/Listing 类型，同类型再按 Job ID 稳定排序。每次只消费被选中 Job 的一份授权，其他 Job 保持等待。
- 浏览器异常关闭时，未释放 reservation 会在最长 5 分钟后自然过期。恢复页面后先查看 Summary/diagnostics，不要立即重复发起交易。

## 诊断文件

### Scheduler diagnostics

从 Trade Scheduler 保存 JSON 诊断。每次故障至少保存一份，最好同时保存 Runner 日志。诊断包含：

- Runner/Scheduler 版本、暂停和实时执行状态、Job/Runtime、History 和累计 Summary。
- Lease、Web Lock、Coordinator、Circuit、页面和 FSU readiness 的脱敏状态。
- Buy/Listing Preview、Prepared、Receipt 和有限的运行时间线。
- Player Catalog 和 Price Quote 的健康状态、缓存聚合数量、TTL 和活动计数。
- EA Trade 请求预算的窗口、使用/剩余数量、动作聚合、当前任务容量恢复时间和 Web Lock 支持状态。
- Listing/Buy Journal 的最多四个逐项状态、chunk 边界、mutation boundary 和脱敏响应摘要。

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

发布前运行 `npm run verify`，确认版本、测试文件数、测试数量、userscript 构建结果和 FSU 资源检查均通过。`0.7.91` 的本地结果为 338 个 JavaScript 文件、160 个测试文件和 1055 个测试全部通过；提交 `980d609` 和发布准备提交 `a0ccf3a` 的 GitHub Actions Verify 均已通过。

`v0.7.91` 已于 2026-08-12 发布并设为 latest。Release 包含 Runner/FSU userscript 与 metadata、Loop/Profile 资产和 `SHA256SUMS`；下载后的 `DailyLoopRunner.meta.js` 报告版本 `0.7.91`，`DailyLoopRunner.user.js` 与发布 checksum 一致。正式版通过 GitHub Release 的 `DailyLoopRunner.user.js` 安装；不要混用旧 Validation 脚本。

出现交易行为异常时，先在 UI 中 Stop、关闭实时执行并解除 Job 武装，再安装上一份已验证版本或等待诊断调查。不要用回滚掩盖未确认的 EA 状态；首先保存最小证据包。
