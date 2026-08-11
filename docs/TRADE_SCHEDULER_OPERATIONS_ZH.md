# Trade Scheduler 操作、安全与故障排查

本文描述 Trade Scheduler 当前版本的可用边界、运行前检查、诊断证据和故障恢复方式。它不是 EA 接口说明，也不替代 EA、FSU 或 Enhancer 的使用条款。

## 当前边界

当前实现按门禁逐步开放，以下能力已经通过自动化测试和对应的实机验证：

- 手动单卡 Listing：Club 来源、Transfer 刷新、价格限制、挂牌后 Transfer 回执核验。
- 只读 Listing Preview：可观察 Club、Transfer List 或两者；Transfer 中 `inactive` 的过期卡可选择跳过或纳入 Preview。
- 手动单卡 Transfer reprice：仅限 Transfer-only、`inactive` 过期卡、一次一张及精确输入 `REPRICE 1`；挂牌前后均刷新并核对同一 item。
- 定时单卡 Listing：`once` 任务、页面恢复、跨标签页互斥、Loop/Trade operation 互斥和过期租约 fail-closed。
- 手动单卡 Buy：Rare Gold、固定单评分、数量 1、Club 路由，以及重复卡发 Transfer 路由。
- 定时单卡 Buy：`once` 任务、单评分 Rare Gold、数量 1、Buy Now 和总预算不超过 2000、显式最低保留金币。
- Summary、History、Job-only 配置导入/导出、Provider 健康状态和显式缓存清理。

以下能力仍受门禁或未完成独立实机验证，不应通过修改配置绕过：

- Buy 数量大于 1、评分范围、其它卡类、周期/窗口/下次登录任务。
- Bulk Buy、Bulk Listing、自动改价、自动刷新 Provider、后台 Companion。
- Transfer 多卡、定时/周期改价、Bulk relist，以及 Club + Transfer 混合来源的 Prepare/执行。
- 任何没有明确候选、身份、价格或库存去向的交易动作。

## 运行前检查

1. 使用正式版 Runner，并确认日志显示 `Ready v...`。
2. 保持 EA Web App 登录，确认 FSU 已加载并完成 Club readiness；FSU 为 provisional 或缓存未验证时，交易任务可能停在 `waiting-session`。
3. 关闭 Enhancer Trader、其它自动买入/挂牌工具和会修改 Transfer/Club 的脚本。
4. 确认没有 Loop、Batch Open、SBC 提交、开包或其它 Runner operation 正在运行。
5. 检查 Trade Scheduler 的 `Providers`、`Summary` 和 `Jobs`：缓存不是空的，任务参数在当前门禁内，Job 只有在确认后才 Armed。
6. 为 Buy 设置全局最低保留金币。Job 局部值只能提高该底线，不能降低它。
7. 第一次运行只使用一个 `once`、数量 1 的小额 Job。完成并检查诊断后，再决定是否扩大范围。

## 交易运行时的状态

- `paused`：调度器不执行到期任务；已经开始的安全收尾仍可能完成。
- `liveExecutionEnabled=false`：只允许 Preview/诊断，不会发送 Buy 或 Listing mutation。
- `armed=false`：Job 配置仍保留，但不会被调度器执行。
- `manual-only`：Manual Job 只能通过 `Run now` 进入人工确认流程，不能 Armed，也不占用自动调度门禁。
- `waiting-session`：页面、EA 或 FSU 状态没有达到交易所需的就绪条件。
- `waiting-operation`：Loop、SBC、开包或其它写操作占用共享 Coordinator；调度器应等待，而不是并行发送请求。
- `browser-lock-held`：另一个同源标签页持有 Web Lock；这是跨标签页互斥的正常证据。
- `cooldown / trade-request-budget-insufficient`：最近 5 分钟内不足以为单卡事务保留 12 个 EA Trade 请求槽；等待 Summary 显示的恢复时间，不要重复 Preview、Arm 或 Start。
- `blocked`：安全门禁拒绝了本次运行，通常会写入一条 History 回执并解除 Job 武装。
- `completed`：请求、金币/库存对账和目标位置核验完成；仍应检查最终回执。

## 请求预算与调度顺序

- EA Trade 请求预算固定为每 5 分钟 30 次，并通过 Tampermonkey 存储在标签页之间共享。支持 Web Locks 的浏览器会串行化预算占用。
- 单卡 Buy/Listing 在 mutation 前原子保留 12 个槽，用于搜索/挂牌、刷新和 Unassigned/Club/Transfer 对账。事务结束后未使用槽会释放，已经发送的 EA 请求仍保留到窗口到期。
- EA capability/repository 的本地读取以及 FUTNext/FUT.GG Provider HTTP 不计入该预算。Summary 中 `Used/Remaining` 是 EA Trade Adapter 请求聚合，不是全部网络流量。
- `Single-card reserve: cooldown` 不代表 EA Circuit 已打开。它是本地限流，等待 `Single-card Trade capacity resumes after ...`；不要清 Tampermonkey 存储，也没有提高或跳过预算的入口。
- 若 Buy 与 Listing 同时到期，内部选择器会交替类型；同类型按最早计划时间和 Job ID 排序。但当前生产门禁仍只允许恰好一个 armed Job，因此该规则不会开放多个 Job 同时自动交易。
- 浏览器异常关闭时，未释放 reservation 会在最长 5 分钟后自然过期。恢复页面后先查看 Summary/diagnostics，不要立即重复发起交易。

## 诊断文件

### Scheduler diagnostics

从 Trade Scheduler 保存 JSON 诊断。每次故障至少保存一份，最好同时保存 Runner 日志。诊断包含：

- Runner/Scheduler 版本、暂停和实时执行状态、Job/Runtime、History 和累计 Summary。
- Lease、Web Lock、Coordinator、Circuit、页面和 FSU readiness 的脱敏状态。
- Buy/Listing Preview、Prepared、Receipt 和有限的运行时间线。
- Player Catalog 和 Price Quote 的健康状态、缓存聚合数量、TTL 和活动计数。
- EA Trade 请求预算的窗口、使用/剩余数量、动作聚合、单卡容量恢复时间和 Web Lock 支持状态。

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
| `trade-request-budget-insufficient` | 查看 Summary 的单卡容量恢复时间，保持 Job 不再重复 Arm，等待窗口自然恢复 | 不要清 Tampermonkey 存储、刷新多个标签页或绕过预算 |
| `expired-lease-reconciliation-required` | 停止并刷新登录，确认 Transfer/Club 状态后重新建立一次性 Job | 不要绕过回锁或直接重试原请求 |
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
