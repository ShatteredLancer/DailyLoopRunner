# Trade Scheduler 设计与实施跟踪

> 文档状态：TS2c 与 TS3 guarded single-run live validation complete; broader production automation remains locked
> 最后更新：2026-08-09
> 适用仓库：DailyLoopRunner  
> 功能边界：定时自动买入、定时批量挂牌、交易任务调度、逐项回执与诊断

## 1. 文档目的

本文固定 Trade Scheduler 的产品边界、运行时依赖、配置模型、交易事务、安全停止条件和分阶段交付标准。后续实现必须在本文的里程碑中更新状态、测试结果和真实页面验证证据，不能只在提交信息中声明完成。

状态只使用：

- `Not started`
- `In progress`
- `Blocked`
- `Complete`

每个里程碑只有同时满足以下条件才能标记为 `Complete`：

1. 设计范围内的实现已完成。
2. 对应 unit、contract、workflow 和 architecture tests 通过。
3. `npm run verify` 通过。
4. 涉及 EA 写操作的阶段完成规定的真实 Web App 小规模验证。
5. 本文记录实际结果、剩余风险和下一步。

## 2. 目标

Trade Scheduler 提供两个独立的计划任务类型：

- **Buy Job**：在指定时间启动一个有数量、价格、预算、时长和请求频率上限的自动 Buy Now 会话。
- **Listing Job**：在指定时间从 Club 和/或 Transfer List 选择符合条件的可交易球员，按评分规则和市场报价策略逐张挂牌。

两个任务都必须支持：

- 手动 `Run now`。
- 单次、每日、间隔或时间窗口调度。
- Preview、Arm、Pause、Stop 和 Recap。
- 会话、交易权限、金币、容量和卡片身份预检。
- 429、认证失效、Captcha、结果不明确和库存阻塞时的确定性停止。
- 持久化任务、运行租约、历史回执和诊断导出。

## 3. 已确认事实

### 3.1 EA 交易接口

Enhancer `26.1.5.6` 至 `26.1.6.2` 和本地 FSU `26.09` 的实际实现均表明，页面内可使用以下 EA Web App 服务：

```js
services.Item.searchTransferMarket(criteria, page)
services.Item.bid(item, buyNowPrice)
services.Item.move(itemOrItems, destinationPile)
services.Item.requestMarketData(item)
services.Item.list(item, startPrice, buyNowPrice, durationSeconds)
services.Item.relistExpiredAuctions()
```

这些都是 EA Web App 内部接口，不是稳定的公开 API。所有调用必须集中在 `src/adapters/ea`，上层 Planner、Scheduler 和 Workflow 不得直接访问 `services`、`repositories`、`window` 或 EA Controller。

### 3.2 Enhancer 接口边界

Enhancer 没有公开 Trader/Bulk Listing 调用接口：

- Chrome manifest 没有 `externally_connectable`。
- Trader、`listItem` 和 Bulk Listing Controller 封闭在 Webpack 模块中。
- 没有稳定挂载到 `window` 的交易命令。
- `window.postMessage` 桥只用于扩展自己的跨域请求、通知和 Companion App 交互。

不得依赖 Enhancer 私有模块编号、Webpack runtime、DOM 按钮或内部 Store。Enhancer 仅作为行为参考和兼容对象。

### 3.3 FSU 接口边界

FSU 的 Bulk Auction 同样调用 `services.Item.list()`，并提供价格限制、错误映射、取消和列表刷新方面的参考。Trade Scheduler 不读取 FSU 的价格缓存、运行标志或 UI，也不要求 FSU 已安装。

DailyLoopRunner 的现有 SBC 功能仍可继续使用 FSU 筛选和锁卡能力，但新的交易子系统必须保持独立。

### 3.4 价格来源

当前 `src/reward/player-prices.js` 直接通过 DailyLoopRunner HTTP Adapter 请求：

1. FUT.GG。
2. FUT.GG 失败或为空时回退 FUTNext。

FUTNext 请求地址当前为：

```text
https://enhancer-api.futnext.com/players/prices
```

域名包含 `enhancer-api` 不代表依赖已安装的 Enhancer。请求由 DailyLoopRunner/Tampermonkey 直接发出。

FSU 和 Enhancer 都允许用户选择自己的价格来源，但 Trade Scheduler 不继承它们的设置。新功能必须提供独立、可诊断的 Price Provider 配置。

### 3.5 EA 不支持评分范围市场搜索

`services.Item.searchTransferMarket(criteria, page)` 当前确认使用的市场条件包括：

- `type`
- `category`
- `defId`
- `maskedDefId`
- `rarities`
- `position`
- `nation`
- `league`
- `club`
- `minBid`
- `maxBid`
- `minBuy`
- `maxBuy`

EA `UTSearchCriteriaDTO` 没有可靠的 `rating`、`minRating` 或 `maxRating` 市场条件。实施 Trade Adapter 前仍需在真实页面导出 DTO 字段和序列化请求，锁定 FC26 当前版本的确切字段。

Enhancer 的评分搜索实际流程为：从 FUTNext 获取指定评分的 definition ID 列表，然后每次选择一个 definition ID 写入 `criteria.defId` 再调用 EA 搜索。

## 4. 已解决的设计决策

| ID | 决策 | 状态 |
| --- | --- | --- |
| D1 | Trade Scheduler 位于 DailyLoopRunner 仓库，但作为与 Loop Runner、Batch Open 并列的独立子系统。 | Resolved |
| D2 | Trade Job 不进入 Loop/Workflow JSON，也不复用 SBC `rounds` 语义。 | Resolved |
| D3 | 买入后不提供 destination 配置：默认发 Club；Club 重复发 Transfer List。 | Resolved |
| D4 | Club 重复且 Transfer List 已满时停止 Buy Job，保留当前卡并报告阻塞。 | Resolved |
| D5 | 评分范围拆成精确评分通道；每个通道维护对应 definition ID 池。 | Resolved |
| D6 | 每次 EA 市场请求只搜索一个 definition ID，不向 EA 一次提交整个评分段。 | Resolved |
| D7 | 对当前搜索响应显式按 Buy Now 升序排序，不依赖 EA 返回顺序；同价使用稳定 tie-break。 | Resolved |
| D8 | 不跨评分比较后再购买。评分通道轮换，各自买当前 definition ID 响应中的最低合格价格。 | Resolved |
| D9 | 交易执行只使用 EA 页面服务；评分目录和市场报价直接使用外部 Provider。 | Resolved |
| D10 | 不依赖 Enhancer 或 FSU 执行交易，也不复制 Enhancer 私有源码。 | Resolved |
| D11 | 未登录时不自动登录、不保存 EA 凭证、不把访问令牌交给外部后台。 | Resolved |
| D12 | 首个可写阶段先实现手动 Bulk Listing，再实现自动买入。 | Resolved |
| D13 | Buy Job 必须显式配置 `cardClass`，不提供隐式默认卡类。 | Resolved |
| D14 | Price Provider 的 `auto` 顺序固定为 FUT.GG，再回退 FUTNext。 | Resolved |
| D15 | FUTNext rating catalog 默认缓存 24 小时；platform、season 或 parser version 变化时立即失效，刷新失败后不使用已过期数据。 | Resolved |
| D16 | `common-gold`、`rare-gold` 和 `special` 精确区分卡类；`normal-gold` 匹配普金与稀有金但排除特殊卡，兼容别名 `gold` 等同 `normal-gold`。 | Resolved |

## 5. 非目标

首轮设计明确不包含：

- 自动登录、保存账号密码、Cookie 或 EA Access Token。
- 自动解决 Captcha。
- 绕过 EA 限流、安全限制或交易权限。
- 在浏览器和 EA 页面关闭时由远程服务器模拟 Web App 交易。
- 自动出价、追价、狙击倒计时拍卖。
- 自动 Quick Sell。
- 自动套利、利润保证或未经用户配置的市场判断。
- 与 Enhancer Trader 或 FSU Bulk Auction 并发执行。
- 把交易任务嵌入 SBC Workflow。

## 6. 总体架构

```text
Trade Scheduler UI
        |
        v
Job Config / Persisted Schedule
        |
        v
Scheduler + Operation Coordinator + Cross-tab Lease
        |
        +---------------------------+
        |                           |
        v                           v
Buy Planner / Transaction     Listing Planner / Transaction
        |                           |
        +-------------+-------------+
                      |
                      v
               Trade Adapter
                      |
                      v
        EA services / repositories / DTOs

External data:
Player Catalog Provider -> rating to definition IDs
Price Quote Provider    -> definition IDs to timestamped prices
```

建议模块边界：

```text
src/adapters/ea/trade.js
src/adapters/fake/trade.js
src/trade/contracts.js
src/trade/error-policy.js
src/trade/player-catalog.js
src/trade/price-quotes.js
src/trade/buy-plan.js
src/trade/buy-transaction.js
src/trade/listing-plan.js
src/trade/listing-transaction.js
src/trade/scheduler.js
src/trade/schedule-policy.js
src/trade/run-lease.js
src/ui/trade-scheduler-dialog.js
src/ui/trade-job-editor.js
src/ui/trade-recap.js
```

实际文件可以在实施时调整，但必须保持以下依赖方向：

```text
UI -> Scheduler -> Planner/Transaction -> Adapter -> EA runtime
```

## 7. 公共数据合同

### 7.1 Trade Job Envelope

```json
{
  "schemaVersion": 1,
  "id": "stable-job-id",
  "name": "84-85 Gold Buy",
  "type": "buy",
  "enabled": false,
  "armed": false,
  "schedule": {},
  "misfirePolicy": {},
  "policy": {},
  "createdAt": 0,
  "updatedAt": 0
}
```

`enabled` 表示配置有效且可显示；`armed` 表示允许调度器在到期时执行。导入配置不得自动把任务设为 `armed`。

### 7.2 运行回执

每次执行生成唯一 `runId`，至少记录：

```json
{
  "runId": "uuid",
  "jobId": "stable-job-id",
  "jobType": "buy",
  "scheduledFor": 0,
  "startedAt": 0,
  "finishedAt": 0,
  "status": "completed",
  "reason": null,
  "requested": 0,
  "succeeded": 0,
  "failed": 0,
  "skipped": 0,
  "coinsBefore": null,
  "coinsAfter": null,
  "receipts": []
}
```

回执必须可序列化，不能持有 EA Item、Controller 或 Observable 对象。

## 8. Buy Job

### 8.1 配置模型

建议初始配置：

```json
{
  "ratingMin": 84,
  "ratingMax": 85,
  "cardClass": "rare-gold",
  "maxBuyNow": 1000,
  "ratingPriceOverrides": {},
  "quantity": 10,
  "totalBudget": 10000,
  "maxRuntimeMinutes": 30,
  "searchDelaySeconds": [8, 15],
  "maxPurchasesPerSearch": 1,
  "maxConsecutiveEmptySearches": 30
}
```

首版只实现 Buy Now，不实现竞价。`quantity`、`totalBudget` 和 `maxRuntimeMinutes` 都是硬上限，任意一个达到即结束。

`ratingPriceOverrides` 的精确评分价格优先于 `maxBuyNow`。没有精确覆盖时使用评分段统一上限。

### 8.2 固定库存路由

购买后路由不向用户暴露配置：

```text
购买结果对账
-> Club 中没有相同 definitionId：发送 Club
-> Club 中已有相同 definitionId：发送 Transfer List
-> Transfer List 无容量：停止任务并保留当前卡
```

重复判断必须同时考虑：

- EA Item 的 duplicate 状态。
- 当前 Live Club 中相同 definition ID。
- 延迟元数据恢复后重新读取的结果。

在购买前，如果当前 Unassigned 已有无法解析或无法移动的卡，Buy Job 必须阻断，不得继续增加 Unassigned。

### 8.3 评分通道和 definition ID 池

`84-85` Job 物化为：

```text
rating lane 84 -> definition IDs for 84
rating lane 85 -> definition IDs for 85
```

FUTNext 当前观察到的评分目录接口为：

```text
https://rest.futnext.com/players/filter?rating=<rating>&platform=<platform>
```

该接口是第三方、未文档化接口，必须封装在 Player Catalog Provider 中。目录响应需要校验、去重、版本化缓存并记录获取时间。新赛季、平台变化或 parser version 变化必须失效。

目录不可用且没有仍在 TTL 内的 last-known-good 数据时，任务停止。不得退化为无条件 Rare Gold 搜索。

### 8.4 搜索轮次

首版采用确定性轮换：

```text
选择下一个评分通道
-> 选择该通道下一个 definition ID
-> 构建 UTSearchCriteriaDTO
-> clearTransferMarketCache
-> searchTransferMarket(criteria, 1)
-> 校验所有返回实体的 definitionId、rating、cardClass 和 Buy Now
-> 对合格结果按 Buy Now 升序排序
-> 当前响应最多购买一张
-> 等待随机间隔
```

价格相同的结果使用以下 tie-break：

1. Buy Now 升序。
2. `expires` 升序。
3. `tradeId` 升序。

因为一个请求只针对一个 definition ID，同一响应内不存在 84 与 85 的选择问题。该最低价只是当前 definition ID 当前响应中的最低价，不宣称是整个评分段的全局最低价。

通道和 definition ID 的游标必须在单次运行中保存，避免始终从同一个球员开始。不同运行可以使用由 `runId` 派生的稳定打散顺序，但测试必须可重现。

### 8.5 Buy Transaction

```text
Preflight
-> Search
-> Validate result identity and price
-> Re-read coins and limits
-> services.Item.bid(item, buyNowPrice)
-> Reconcile Watch List / Purchased / Unassigned / Transfer / Club
-> Route Club or Transfer
-> Verify destination
-> Emit receipt
```

以下检查必须在 `bid()` 前再次执行：

- 任务未停止。
- 当前报价仍不超过评分价格上限。
- 单张价格不超过剩余预算。
- 当前金币足够并保留配置的最低余额。
- 当前运行未达到数量或时间上限。
- Unassigned 可安全接收和处理结果。
- 目标 Transfer List 在重复场景下有容量。

网络结果不明确时，不得直接再次购买。必须刷新 Watch List、Purchased、Unassigned、Transfer、Club 和金币并按 `tradeId`、item ID、definition ID、价格及时间窗口对账。无法证明成功或失败时状态为 `ambiguous`，停止整个 Buy Job。

## 9. Listing Job

### 9.1 配置模型

```json
{
  "sources": ["transfer", "club"],
  "cardClass": "normal-gold",
  "ratingRules": [
    { "min": 75, "max": 82, "buyNow": 700 },
    { "min": 83, "max": 83, "buyNow": 900 },
    { "min": 84, "max": 84, "buyNow": 1800 }
  ],
  "marketOverride": {
    "enabled": true,
    "markupPercent": 5,
    "maxQuoteAgeMinutes": 10
  },
  "startPricePolicy": "one-step-below",
  "durationSeconds": 3600,
  "listingDelaySeconds": [4, 8],
  "maxListings": 50,
  "expiredPolicy": "reprice"
}
```

`cardClass` 不允许从评分推断卡种：

- `common-gold`：非特殊普金。
- `rare-gold`：非特殊稀有金。
- `normal-gold`：普金和稀有金，但排除特殊卡。
- `special`：仅特殊卡。
- `gold`：仅作为 `normal-gold` 的兼容别名；新 UI 和新配置不应继续生成该值。

### 9.2 候选过滤

候选必须：

- 来自配置允许的 pile。
- 是 Player。
- 可交易。
- 不在 Active Trade 或 Closed Trade 中。
- 不属于 limited-use、concept 或 Academy enrolled 状态。
- 满足 card class 和 rating rule。
- 按 item ID 能重新解析到同一 Live 实体。

Transfer List 中 `sold`、仍 active 或状态不明确的实体不得重新挂牌。Expired item 根据 `expiredPolicy` 选择跳过、原价 relist 或重新报价；首版推荐只实现 `skip` 和 `reprice`，不盲目调用全量 `relistExpiredAuctions()`。

### 9.3 价格规则

基础价格来自匹配的评分规则：

```text
configuredPrice = ratingRule.buyNow
```

若 Market Override 开启且报价有效：

```text
quotedPrice > configuredPrice
    ? quotedPrice * (1 + markupPercent / 100)
    : configuredPrice
```

计算后必须：

1. 按 EA 价格步进取整。
2. 读取 `requestMarketData()`。
3. 限制在 `_itemPriceLimits.minimum` 和 `_itemPriceLimits.maximum` 内。
4. 校验 start price 不高于 Buy Now。

当 Quote Provider 失败、报价过期或返回零时，默认使用配置价格并在 Preview/Recap 标记 `quote-unavailable`。高价值卡可在后续阶段增加 EA 最低 BIN 复核，但不能默认逐卡多次搜索市场。

### 9.4 Listing Transaction

```text
Resolve exact item
-> Validate trade state
-> Check Transfer List capacity
-> Request price limits
-> Recompute and validate prices
-> services.Item.list(item, start, buyNow, duration)
-> Refresh Transfer List
-> Verify matching item and auction values
-> Emit receipt
```

每张成功挂牌后重新读取容量。EA 响应成功但 Transfer List 无匹配实体时属于 `ambiguous`，停止任务并对账，不得重复挂牌。

## 10. Price Quote Provider

Price Provider 是独立配置，不读取 FSU 或 Enhancer 的设置。

首版建议支持：

```text
Auto       -> FUT.GG, then FUTNext fallback
FUTNext    -> FUTNext only
FUT.GG     -> FUT.GG only
```

每个 Quote 必须包含：

```json
{
  "definitionId": 0,
  "price": 0,
  "source": "FUTNext",
  "quotedAt": 0,
  "expiresAt": 0
}
```

交易报价缓存与 Recap 价格缓存可以复用底层 HTTP parser，但不能复用不适合交易的函数命名或隐含 TTL。应将当前 `loadPlayerPickPrices()` 泛化或在其下增加共享 Provider，保持现有 Recap 行为不变并用 characterization tests 锁定。

## 11. Scheduler

### 11.1 调度类型

```text
once       -> 单次绝对时间
daily      -> 指定时区的每日时间
interval   -> 从成功或计划时间起每隔 N 分钟/小时
window     -> 指定时间窗口内最多运行一次
manual     -> 仅 Run now，不自动触发
```

所有持久化时间使用 UTC epoch；显示和 daily 计算使用任务记录的 IANA timezone。不得使用一个长时间 `setTimeout` 作为真实来源。

Scheduler 通过绝对 `nextRunAt` 计算到期任务，并在以下时机重新评估：

- 页面启动并达到 EA readiness。
- 固定短周期 tick。
- `visibilitychange` 回到可见。
- `focus`。
- 浏览器恢复 online。
- 当前 Operation 结束。

### 11.2 任务状态

```text
disabled
armed
waiting-time
waiting-session
waiting-operation
running
cooldown
completed
missed
blocked
```

状态转换必须由纯函数计算并覆盖 fake clock 测试。UI 不能自行修改运行状态。

### 11.3 Misfire Policy

```text
skip
grace-window
next-login
```

推荐默认 `grace-window`，例如计划时间后 15 分钟内页面恢复并登录则执行，超过后记录 `missed`。`next-login` 必须由用户显式选择，避免登录后突然执行早已过期的价格策略。

### 11.4 跨标签页和运行租约

同一账号只能有一个 Trade 或 Loop 写操作。建议组合使用：

- `navigator.locks` 作为同源活跃标签页互斥。
- GM storage 中的持久化 lease。
- `BroadcastChannel` 通知其它标签页。
- 唯一 `ownerId` 和 `runId`。

Lease 必须有到期时间和心跳。页面崩溃后新标签页只能在 lease 过期并完成库存/交易对账后接管，不能从中间索引直接继续写操作。

## 12. Web App 未登录或不可用

Tampermonkey 只能在 EA 页面中运行，因此：

- 浏览器关闭：不能执行。
- EA 页面关闭：不能执行。
- 页面打开但未登录：进入 `waiting-session`。
- 登录失效：停止当前任务并通知。
- Trade Access 不允许：进入 `blocked`。
- 页面后台被冻结：恢复后按绝对时间和 Misfire Policy 重新评估。

不得保存登录凭证或自动填写登录。不得把 EA Cookie、Access Token 或 Persona 数据发送到自建后台。

未来可选的 Companion Extension 只允许：

- 使用 `chrome.alarms` 提醒。
- 打开或聚焦 EA Web App。
- 通知页面重新评估到期任务。

它不得在扩展 Service Worker 中直接交易，也不能保证用户仍处于登录状态。Companion Extension 不属于首轮范围。

## 13. Operation Coordinator 和插件共存

Trade Scheduler、Loop Runner、Batch Open、Dynamic SBC live scan 和其它库存写操作必须共享一个 Operation Coordinator。

互斥要求：

- Loop 运行时，Trade Job 进入 `waiting-operation`。
- Trade Job 运行时，禁止启动 Loop、Batch Open 和写入型刷新。
- Dynamic SBC 只读缓存恢复可以继续；会发 EA 请求的 live scan 应等待交易任务结束。
- Buy Job 开始前必须确认 Unassigned 可处理。
- Club 卡挂牌成功后必须刷新 Runner Inventory，并使可能包含旧 Club 实体的选择缓存失效。

Enhancer Trader、Enhancer Auto Buy、FSU Bulk Auction 与 Trade Scheduler 不得同时运行。普通 Enhancer UI、价格显示和 FSU SBC 功能可以保留。

由于 Enhancer 没有公开运行锁，首版采用明确用户约束和页面警告。后续可以增加只读诊断包装，记录最近是否出现非 Runner 发起的 `searchTransferMarket`、`bid` 或 `list`，但不能假装可以可靠阻止第三方插件。

## 14. 限流和错误策略

| 类型 | 默认行为 | 是否自动恢复 |
| --- | --- | --- |
| 429 / Too Many Requests | 立即停止当前 Trade Run，设置长冷却并通知 | 当前 Run 不恢复 |
| 401 / Session expired | 停止并进入 `waiting-session` | 重新登录后按 Misfire Policy |
| 403 / Permission denied | 阻断任务 | 否 |
| 427 / Auction operation blocked（EA 未公开） | 立即停止、持久熔断全部 Trade mutation、要求人工清除 | 否 |
| Captcha required | 停止所有自动交易并解除 armed 状态 | 否 |
| 512 / 521 | 有限次数退避；仍失败则停止 | 有界 |
| Lost bid / 已被购买 | 记录为竞争失败，等待后继续 | 是 |
| Destination full | 停止并保留当前实体 | 否 |
| Card already in trade | 跳过该卡并刷新；重复发生则停止 | 有界 |
| Ambiguous transport/result | 对账；无法判定则停止 | 不盲目重试 |

默认请求节奏应保守：

- Buy 搜索间隔建议 `8-15 秒`。
- 每个市场响应最多购买一张。
- Listing 间隔建议 `4-8 秒`。
- 周期性暂停和会话最长时间必须可配置但不能关闭所有安全限制。
- 统计最近请求、失败率、状态码和 Circuit Breaker 状态。

这些间隔只能降低请求压力，不能被描述为规避检测或保证账号安全。

## 15. UI 设计

Trade Scheduler 使用独立全屏/大对话框，不塞入紧凑的 Loop Run Options。

```text
Trade Scheduler
|-- Jobs
|   |-- Next run / Status / Armed
|   |-- Run now / Pause / Edit / Duplicate / Delete
|-- Buy editor
|   |-- Ratings / Card class / Price / Quantity / Budget
|   |-- Schedule / Limits / Preview
|-- Listing editor
|   |-- Sources / Rating rules / Quote policy / Duration
|   |-- Schedule / Limits / Preview
|-- History
    |-- Run recap / Receipts / Diagnostics
```

触摸和移动端要求：

- 使用现有 responsive dialog 和至少 44px 触摸目标。
- 编辑器采用分段视图，不在手机上显示横向宽表。
- 运行时固定显示 Stop、状态、已完成数量、金币变化和下一动作。
- Recap 每页 15 项，包含停止原因和 Preview。

所有自动任务默认未 armed。保存配置和允许自动执行是两个独立动作。

## 16. Recap 和诊断

Buy item receipt 至少包含：

- rating、definition ID、EA item ID、trade ID。
- Buy Now、评分价格上限、购买前后金币。
- 评分通道和 definition ID 游标。
- EA 响应状态和对账结果。
- Club/Transfer 最终去向。

Listing item receipt 至少包含：

- 来源 pile、item ID、definition ID、rating。
- 配置价格、报价、报价来源和年龄。
- 最终 start/Buy Now、duration、价格限制。
- EA 响应和 Transfer List 验证结果。

Trade diagnostics JSON 至少包含：

- Runner、浏览器和平台版本。
- Job 配置的脱敏快照。
- Schedule、lease 和 Operation Coordinator 状态。
- EA readiness、Trade Access、pile capacity 和金币快照。
- 每次请求的类型、耗时、状态码和重试决定。
- Provider 请求状态，不记录 Cookie、Token 或完整认证头。
- 全部逐项回执和最终停止原因。

## 17. 测试策略

### 17.1 Unit

- Job schema 和迁移。
- Rating lane 展开、definition ID 去重和游标轮换。
- 当前响应最低 Buy Now 排序和 tie-break。
- 评分价格覆盖。
- Listing rule 优先级、价格步进和 market override。
- Schedule、timezone、DST、misfire 和 absolute next run。
- Error policy、backoff 和 circuit breaker。

### 17.2 Contract

- Trade Adapter 不泄露 EA 对象。
- Fake Adapter 与 EA Adapter 的输入/输出一致。
- Price/Catalog Provider 的可序列化合同。
- Operation Coordinator 和 lease 合同。

### 17.3 Workflow/Transaction

- 单张挂牌成功、容量满、价格限制、Active Trade 和 ambiguous response。
- 单张买入成功并进入 Club。
- Club 重复转 Transfer。
- Club 重复且 Transfer 满时停止并保留。
- 429、401、Captcha 和中途 Stop。
- 购买成功响应丢失后的对账，证明不会重复购买。
- 页面恢复后 skip、grace-window 和 next-login。

### 17.4 Architecture

- `src/trade` 和 `src/ui` 不直接访问 EA runtime。
- 所有 `searchTransferMarket`、`bid`、`list`、`requestMarketData` 调用只存在于 EA Adapter。
- Scheduler 不导入 UI。
- 交易代码不读取 Enhancer/FSU 私有全局。

### 17.5 Live validation

真实页面验证必须从最低风险开始：

1. Preview 无写操作。
2. 一张低价值 Club 可交易卡手动挂牌。
3. 一张 Transfer 卡手动挂牌。
4. 停止和容量边界。
5. 定时触发一张挂牌。
6. 一张低价值卡手动 Buy Now，验证 Club 去向。
7. 已有重复时验证 Transfer 去向。
8. 最后才验证定时 Buy Job。

每一步都必须保存 Runner log 和 Trade diagnostics；前一步验证失败时不得扩大数量。

## 18. 实施里程碑

### TS0 设计冻结

Status: Complete

Scope:

- [x] 调研 Enhancer Trader 和 Bulk Listing。
- [x] 调研 FSU Bulk Auction。
- [x] 确认 EA 交易执行接口。
- [x] 确认 EA 不支持直接评分范围搜索。
- [x] 确认 DailyLoopRunner 当前直接访问 FUT.GG/FUTNext。
- [x] 固定买入后 Club/重复 Transfer 路由。
- [x] 固定评分通道和单响应最低价策略。
- [x] 固定 Trade Scheduler 与 Loop/Workflow 的边界。

Tests: 不适用，文档阶段。

Live validation: 使用 Enhancer/FSU 已安装源码进行静态行为交叉验证；尚未由 DailyLoopRunner 发起交易。

Next: 解决第 19 节首轮 Open decisions，然后开始 TS1。

### TS1 合同、Provider 和只读诊断

Status: Complete

Scope:

- [x] Trade contracts 和 Job schema。
- [x] Fake Trade Adapter。
- [x] EA Trade Adapter readiness 和只读 DTO/能力诊断。
- [x] Player Catalog Provider 和缓存。
- [x] 通用 Price Quote Provider，保持现有 Recap 回归行为。
- [x] Error classification 和纯 Circuit Breaker。
- [x] Architecture tests。

Tests: `npm run verify` 通过；115 个测试文件、744 个测试通过，syntax、ESLint、配置/Profile、架构、构建产物和 FSU release 检查全部通过。

Live validation: Complete。EA Web App PC 实测确认 capability、criteria、Trade Access、金币、Transfer capacity、外部 Provider 回退和 item price limits 均可读取，且诊断中不包含认证信息。以下命令保留用于后续兼容性复核；不得将其扩展为买入、移动或挂牌操作。

```js
__FCLoopRunner.inspectTradeCapabilities()

__FCLoopRunner.loadTradePlayerCatalog({
  ratings: [84, 85],
  platform: "pc"
})

__FCLoopRunner.loadTradePriceQuotes({
  definitionIds: [123456],
  platform: "pc",
  provider: "auto"
})

__FCLoopRunner.inspectTradePriceLimits(
  { id: 123456789, pile: "club" },
  { refresh: true }
)
```

其中 `definitionIds` 应替换为 catalog 返回的真实低价值卡 definition ID；`id` 应替换为 Club 或 Transfer List 中一张低价值卡的真实 item ID。`inspectTradePriceLimits(..., { refresh: true })` 只调用 EA `requestMarketData()` 读取价格限制。

Exit criteria: Met。Provider、schema、错误策略、Adapter 能力探测、完整测试和真实页面只读诊断均通过；可以开始 TS2。

### TS2 手动 Bulk Listing

Status: TS2c in progress（手动 Listing UI 与自动化验证完成；保持 Club 单卡门禁，等待真实 UI 验证）

Scope:

- [x] Listing Planner。
- [x] Listing Transaction 和对账核心。
- [x] Preview model 和只读运行时入口。
- [x] 一次性确认 token、显式确认和 Stop 核心。
- [x] 手动 Listing UI 的 Preview/Prepare/Confirm/Stop 交互。
- [x] Club 候选过滤和 Active Transfer 排除的真实字段验证。
- [ ] Expired/Inactive Transfer reprice 真实字段验证。
- [x] 固定价格、market override、EA 价格步进和 duration Preview。
- [x] Price limits、容量和逐卡事务重检。
- [x] 可序列化逐项 Listing run receipt。
- [x] Listing Recap UI 和 diagnostics 导出。

Tests: TS2c UI 后 `npm run verify` 通过；124 个测试文件、777 个测试通过。新增覆盖手动 Job 的 Club 单卡硬门禁、主面板互斥、Preview/Prepared 状态隔离、配置变更撤销确认、精确确认、Stop、失败诊断、确认 token 脱敏和每页 15 项的 Recap。Architecture audit 确认 `requestMarketData()`、`list()` 和 `requestTransferItems()` 各一个 EA Trade Adapter 调用点，`searchTransferMarket()` 和 `bid()` 均为零调用点。

Live validation: TS2a 已确认 Club `inactive` 和 Transfer `active` 字段、common/rare/special 分类、Active Trade 排除和报价回退。TS2b 已对一张低价值 Club common Gold 完成独立 Prepare、人工复核、显式确认、一次挂牌、Transfer 刷新和精确回读。TS2c 新 UI 已于 2026-08-09 用一张低价值 Club 卡完成 Preview、Prepare、确认、挂牌、Recap 和 diagnostics 导出验证。Expired/Inactive Transfer、连续多卡 Stop/节流和容量仍需按第 17.5 节完成真实验证。

Exit criteria: Not met。Club 单卡 Planner/Transaction/确认/UI/对账已通过真实验证；仍需后续单独评审和验证多卡节流、Stop、容量竞争与 Transfer reprice 后才能结束 TS2。

### TS3 Scheduler 和定时挂牌

Status: In progress; guarded single scheduled Club item live validation complete.

Scope:

- [x] 持久化 Job Store。
- [x] once/daily/interval/window/manual。
- [x] misfire policy。
- [x] Operation Coordinator compatibility bridge。
- [x] 跨标签页 lease 和过期 lease 强制恢复对账门禁。
- [x] Trade Scheduler UI、可视化 Buy/Listing Job Editor 和 History。
- [x] 默认 paused、自动执行锁定、导入 Job disarm。
- [x] HTTP 427 持久 Circuit Breaker、人工 reset 和脱敏 diagnostics。
- [x] `once + Club + maxListings=1` 显式确认、启动即自动回锁的 TS3 验证执行器。

Tests: Fake clock、IANA timezone/DST、misfire、Job Store、History 上限、双 owner lease、过期 lease、Coordinator、427、响应脱敏和响应式 UI 已覆盖；完整 `npm run verify` 结果见下方实施记录。

Live validation: EA 原生挂牌已恢复，TS2c 手动单卡和 TS3 定时单卡均于 2026-08-09 验证通过。TS3 Job 按计划触发，只挂牌一张 Club 卡，History、Transfer 精确对账及启动即自动回锁均符合预期；完整证据见下方 2026-08-09 实施记录。不得据此开放批量、Transfer reprice 或 Buy。

Exit criteria: Not met。离线核心、UI、定时单卡和 skip misfire 已完成；仍需真实页面证明 grace 内重载/恢复、双标签页和被 Loop 占用时不重复执行，并验证 expired lease 的回锁行为。

### TS4 手动 Auto Buy

Status: Offline implementation complete; production entry and live validation intentionally blocked.

Scope:

- [x] Buy Planner 和评分通道轮换。
- [x] FUTNext rating catalog 物化。
- [x] 当前响应最低 Buy Now 选择。
- [x] Buy Transaction 和 ambiguous reconciliation 的离线实现。
- [x] 固定 Club/重复 Transfer 路由。
- [x] 数量、预算、金币余额、时长和空搜索上限。
- [x] Preview、15 项分页 Buy Recap 和 allowlisted diagnostics。

Tests: Fake Adapter、伪 EA Observable、Planner、Transaction、Preview、Recap、diagnostics 和架构边界测试通过。覆盖精确 definition/rating/card-class/价格筛选、当前响应最低价、Club/重复 Transfer 路由、Transfer 满、Unassigned gate、Stop/预算/空搜索、427、运行中 circuit 变化、ambiguous item+金币双证据和禁止二次购买。单元测试不解除生产门禁。

Live validation: Blocked by current EA status `427`. Recovery order remains: read-only Preview, one low-value non-duplicate card to Club, one duplicate to Transfer, then Transfer-full stop. EA refresh method names, repository materialization timing and coin update timing remain live assumptions.

Exit criteria: Offline criterion met: no ambiguous path triggers a second purchase. TS4 is not production-complete until the three live cases above reconcile with exported diagnostics.

### TS5 定时 Auto Buy

Status: Not started

Scope:

- [x] Buy Job 配置、Editor 和只读评分通道 Preview 接入 Scheduler UI。
- [ ] Buy Job 定时执行器接入 Scheduler；生产入口保持不存在。
- [ ] 429 长冷却、401 waiting-session 和 Captcha disarm。
- [ ] 定时 Buy 运行状态和通知。
- [ ] 页面恢复和 Misfire Policy。
- [ ] 与 Listing Job 公平排队和全局请求预算。

Tests: Pending。

Live validation: 单次、数量 1、低预算定时任务；成功后才逐步扩大到多张。

Exit criteria: 到期、登录失效、限流、Stop 和重载均有确定性结果且不重复购买。

### TS6 生产化和可选 Companion 评估

Status: Not started

Scope:

- [ ] 长时间运行指标和日志压缩。
- [ ] 配置导入/导出和 schema migration。
- [ ] Provider 健康状态和缓存管理 UI。
- [ ] 文档、故障排查和安全说明。
- [ ] 评估仅用于 alarm/notification/open-tab 的 Companion Extension。

Tests: Pending。

Live validation: 多日小规模观察；不以请求量或成交量作为成功标准。

Exit criteria: 形成独立发布说明、真实风险清单和可恢复运行手册。

## 19. Open decisions

以下事项在进入对应实现阶段前必须明确记录结论：

| ID | 问题 | 建议默认 | 决定阶段 | 状态 |
| --- | --- | --- | --- | --- |
| O1 | Buy Job 默认 `cardClass` 是 rare-gold、normal-gold 还是必须显式选择？ | 必须显式选择 | TS1 | Resolved: D13 |
| O2 | Price Provider 默认顺序。 | Auto: FUT.GG -> FUTNext | TS1 | Resolved: D14 |
| O3 | FUTNext rating catalog TTL 和 last-known-good 最长允许时间。 | 24 小时，版本变化立即失效 | TS1 | Resolved: D15 |
| O4 | 默认 Misfire Policy 和 grace window。 | grace-window，15 分钟 | TS3 | Open |
| O5 | 最低金币余额是否为所有 Buy Job 的全局硬限制。 | 全局硬限制，可被 Job 提高但不能降低 | TS4 | Open |
| O6 | Listing expired 默认跳过还是重新报价。 | reprice | TS2 | Open |
| O7 | 是否允许同一 rating rule 同时匹配普通金和特殊卡。 | 不允许；card class 必须明确 | TS2 | Open |
| O8 | 是否需要高价值卡 EA 最低 BIN 复核。 | 首版不实现 | TS6 | Open |

## 20. 决策与验证日志

后续更新按以下格式追加，不改写历史结果：

```text
YYYY-MM-DD / TSx / Decision or validation title
Status:
Commit/Version:
Automated tests:
Live setup:
Observed result:
Diagnostics:
Remaining risk:
Next:
```

### 2026-08-06 / TS0 / Initial design

Status: Complete

Commit/Version: Documentation draft on repository version `0.7.31`.

Automated tests: Not run; no runtime code changed.

Live setup: Static inspection of installed Enhancer `26.1.6.2`, retained Enhancer versions `26.1.5.6-26.1.6.2`, local FSU `26.09`, and DailyLoopRunner source.

Observed result: Enhancer and FSU both use EA `services.Item.list`; Enhancer rating filtering resolves external definition IDs and injects one ID into each EA market search; DailyLoopRunner prices call FUT.GG and FUTNext directly.

Diagnostics: No EA transaction was executed.

Remaining risk: EA internal DTO and response fields still require TS1 live capability capture; external rating catalog is undocumented.

Next: Resolve O1-O3 and implement TS1 without write operations.

### 2026-08-06 / TS1 / Read-only foundation

Status: In progress; implementation and automated verification complete, live EA-page validation pending.

Commit/Version: Uncommitted working tree on repository version `0.7.31`.

Automated tests: `npm run verify` passed: 115 test files and 743 tests; syntax, ESLint, config/Profile validation, architecture audit, build, dist and FSU release checks also passed.

Live setup: Pending. The Console commands in TS1 must be run after EA Web App and DailyLoopRunner are ready.

Observed result: Trade contracts, disarmed import behavior, explicit card class, Fake/EA adapters, FUTNext rating catalog, platform-isolated price quotes, error classification and circuit breaker are implemented. Existing Player Pick price-loading behavior remains covered by compatibility tests.

Diagnostics: Runtime exposes `inspectTradeCapabilities`, `inspectTradePriceLimits`, `loadTradePlayerCatalog`, `clearTradePlayerCatalogCache`, `loadTradePriceQuotes` and `clearTradePriceQuoteCache`. The only implemented EA Trade service invocation is read-only `requestMarketData()`; market search, bid, move and list have zero call sites.

Remaining risk: Real FC26 page objects may expose different DTO, Trade Access, coin, capacity or item price-limit shapes. These fields must be captured through the allowlisted diagnostics before TS2.

Next: Collect and review the TS1 Console outputs; mark TS1 complete only after confirming the diagnostics contain no authentication data and the read-only values match the live account.

### 2026-08-06 / TS1 / Live read-only validation round 1

Status: Partial pass; one compatibility fix implemented and awaiting a one-command retest.

Commit/Version: Uncommitted working tree on repository version `0.7.31`.

Automated tests: After the live-shape fix, `npm run verify` passed: 115 test files and 744 tests; all other verification stages passed.

Live setup: EA Web App on PC with DailyLoopRunner `0.7.31`; artifact `trade-ts1-diagnostics-2026-08-06T12-10-47-903Z.json`; Console reported no errors.

Observed result: `runtimeReady` and `canTrade` were true; Trade Access was allowed; all required EA methods and 13 allowlisted search criteria fields were present; Transfer List was 11/100. FUTNext returned 50 definition IDs for each of ratings 84 and 85. FUT.GG returned HTTP 403 and Auto correctly fell back to five FUTNext quotes. A Club item resolved successfully and read-only `requestMarketData()` returned HTTP 200 with price limits 700-10000.

Diagnostics: No token, auth, cookie, persona, email, session, password, secret or credential field/string was present. The only mismatch was `coins: null`.

Remaining risk: Live `getCurrency(GameCurrency.COINS)` returns an object with an `amount` field, while the initial Adapter expected a directly numeric value. The Adapter now accepts both shapes and has a contract test ensuring private currency/user fields are not serialized. The live coin value still requires confirmation after reloading the rebuilt userscript.

Next: Run `__FCLoopRunner.inspectTradeCapabilities()` once with the rebuilt userscript and confirm `coins` is a finite value. No catalog, quote or price-limit rerun is required.

### 2026-08-06 / TS1 / Live coin validation round 2

Status: Complete.

Commit/Version: Uncommitted working tree on repository version `0.7.31`.

Automated tests: Unchanged from round 1: 115 test files and 744 tests passed.

Live setup: EA Web App on PC after reloading the rebuilt DailyLoopRunner `0.7.31` userscript.

Observed result: `runtimeReady: true`, `canTrade: true`, Trade Access allowed at level 2, coins read as a finite value, and Transfer List remained 11/100 with 89 free slots. The 13 criteria fields and required Trade methods remained available.

Diagnostics: The compatibility reader extracted only the numeric `amount` from the live EA currency object; no user or currency object was serialized.

Remaining risk: TS1 has no known blocker. EA internal APIs remain unstable and continue to require Adapter-level allowlisting and versioned live validation in later write stages.

Next: Start TS2 manual Bulk Listing implementation. Do not perform a real listing until Planner preview, explicit confirmation, stop behavior and per-item receipts pass automated tests.

### 2026-08-06 / TS2a / Listing candidate and preview foundation

Status: In progress; automated implementation complete, live read-only candidate validation pending.

Commit/Version: Uncommitted working tree on repository version `0.7.31`.

Automated tests: `npm run verify` passed: 117 test files and 752 tests; all syntax, ESLint, config/Profile, architecture, build, dist and FSU release checks passed.

Live setup: Pending. Reload the rebuilt userscript and export the read-only candidate/preview artifact before implementing `list()`.

Observed result: The EA Trade Adapter now exports allowlisted Club/Transfer candidate snapshots; the pure Planner filters non-player, untradeable, limited-use, concept, Academy, evolution, Active/Closed/unknown Trade, card-class and rating-rule mismatches. Preview applies source/rating/item ordering, `maxListings`, fixed price, fresh market override, stale/unavailable fallback, EA price increments and duration.

Diagnostics: Runtime exposes `inspectTradeListingCandidates()` and `previewTradeListings()`. Preview returns aggregate scan counts, selected entries, rejection counts and at most 20 rejection samples; it does not return raw EA items or the complete Club. Architecture audit keeps `services.Item.list()` at zero call sites.

Remaining risk: Live EA auction methods and tradeability fields may differ from fixtures. Transfer expired items in particular must be observed as `inactive`, `closed`, `active` or `unknown` before defining write eligibility and reconciliation.

Next: Collect one read-only Preview artifact covering both Club and Transfer sources. Review it before adding Listing Transaction or UI confirmation.

### 2026-08-07 / TS2a / Live listing preview validation

Status: Complete for Club candidates and Active Transfer exclusion; Expired Transfer shape remains pending under TS2.

Commit/Version: Uncommitted working tree on repository version `0.7.31`.

Automated tests: At artifact generation time, 117 test files and 752 tests passed.

Live setup: EA Web App on PC; artifact `trade-ts2a-preview-2026-08-06T22-54-02-815Z.json`; Console reported no errors.

Observed result: The scan returned all 2706 unique entities: 2679 Club and 27 Transfer. All 27 Transfer items were tradeable active auctions and were rejected as `active-trade`. Club filtering found 88 common Gold, 32 rare Gold and 13 Special eligible items without cross-class selection. FUT.GG returned HTTP 403 and Auto fell back to FUTNext for all 10 requested rare-Gold quotes; nine were below configured price and one higher quote applied 5% markup plus EA increments, producing start/buy-now 2600/2700.

Diagnostics: No authentication or user identity fields were present. Non-player, untradeable, card-class and active-trade rejection totals reconciled with all scanned entities. Preview remained read-only.

Remaining risk: No expired or inactive Transfer item existed during capture, so Transfer reprice eligibility and post-list state cannot yet be considered live-validated.

Next: Implement and validate the guarded Club single-item transaction before enabling bulk execution or Transfer reprice.

### 2026-08-07 / TS2b / Guarded Club listing transaction core

Status: Complete for the guarded Club single-item transaction; bulk execution and Transfer reprice remain gated.

Commit/Version: Uncommitted working tree on repository version `0.7.31`.

Automated tests: `npm run verify` passed: 119 test files and 763 tests; all other verification stages passed.

Live setup: EA Web App on PC; prepared artifact `trade-ts2b-prepared-2026-08-06T23-12-53-842Z.json` and run receipt `trade-ts2b-receipt-2026-08-07T01-34-29-467Z.json`. Runtime remained hard-limited to one Club item and rejected Transfer sources.

Observed result: Preparation selected one 77-rated common Gold Club item with EA limits 300-10000 and final prices 650/700. The write returned HTTP 200, Transfer refresh returned HTTP 200, and reconciliation found the same item ID and definition ID in the Transfer pile with an Active auction, trade ID, start price 650, buy-now 700 and about 3598 seconds remaining. The receipt completed with requested 1, succeeded 1, failed 0 and skipped 0.

Diagnostics: `services.Item.list()` and `requestTransferItems()` each have one audited Adapter call site. No retry exists after an accepted or ambiguous write. The receipt contains no authentication or user identity fields. Console separately reported an unhandled HTTP 500 through EA `trackUserTransaction` after the verified listing; neither the list response nor Transfer refresh recorded that failure. It is classified as non-blocking external telemetry and deferred unless it later affects a Trade receipt or reconciliation result.

Remaining risk: Expired/Inactive Transfer shape, Transfer reprice, bulk pacing, Stop between real writes and capacity races are not live-validated. Keep the Club single-item and Transfer-source gates until the corresponding next-stage validation is complete.

Next: Implement the Bulk Listing UI and multi-item execution behind conservative limits; do not enable Transfer reprice until an expired/inactive Transfer candidate is captured and validated.

### 2026-08-07 / TS2c / Manual Listing UI and diagnostics

Status: Complete for the guarded Club single-item UI flow.

Commit/Version: Uncommitted working tree on repository version `0.7.33`.

Automated tests: `npm run verify` passed: 124 test files and 777 tests; syntax, ESLint, config/Profile validation, architecture audit, build, dist and FSU release checks also passed.

Live setup: EA Web App on PC, Runner `0.7.34`; artifact `trade-listing-diagnostics-2026-08-09T14-35-50-291Z.json`. Enhancer Trader/Auto Buy and FSU Bulk Auction were not part of the transaction.

Observed result: The independent responsive dialog supports card class, rating/price rules, quote provider, market override, duration, read-only Preview, price-limit Prepare, exact confirmation, one-item execution, Stop, Recap and diagnostics export. The live run scanned 2950 Club entities, found 94 eligible common Gold cards and prepared exactly one item. EA price limits loaded as 300-10000; `list()` returned HTTP 200 for start/buy-now 650/700 and one-hour duration. Transfer refresh completed and reconciliation found the exact item/definition in Transfer with an Active auction and trade ID. The receipt completed requested 1, succeeded 1, failed 0, skipped 0; circuit remained closed and no error was recorded.

Diagnostics: Export includes allowlisted runner/operation state, Job, Preview, sanitized Prepared plan, receipt and sanitized errors. Confirmation tokens and raw error responses are excluded. Recap pages contain at most 15 item receipts.

Remaining risk: Transfer sources, Transfer reprice, multi-item execution and Auto Buy remain unavailable. One scheduled Club single-item run, page resume, expired-lease reconciliation and misfire behavior still require live validation.

Next: Validate exactly one scheduled Club item through the TS3 auto-relocking gate. Do not broaden the gate after that run without a separate review.

### 2026-08-08 / TS3 offline Scheduler, persistent circuit and Job UI

Status: Guarded single-run validation gate implemented; one live scheduled Club item pending.

Commit/Version: Uncommitted working tree on repository version `0.7.33`.

Automated tests: The guarded validation implementation passes `npm run verify` with 137 test files and 823 tests. Syntax, ESLint, config/Profile validation, architecture audit, FSU patch replay, generated userscript/dist equality and FSU release assets all pass.

Observed result: Job configuration is persisted independently from Loop/Workflow config. Pure scheduling supports manual, once, daily IANA timezone, interval and one-shot window schedules; fake-clock coverage includes DST, skip/grace-window/next-login decisions, session/operation waits and absolute advancement. The store persists bounded History and defaults to paused with `liveExecutionEnabled=false`. After TS2c passed live validation, a separate validation executor now accepts only one armed `once + Club + maxListings=1` Job. Exact confirmation `RUN ONCE 1` enables the wait; execution start immediately pauses, disables live execution and disarms the Job. Misfire, stale lease, circuit/config changes and tick errors also relock. Buy Jobs remain configuration-only.

Safety: EA status `427` is classified as `auction-operation-blocked`, stops the current transaction without retry, and opens a GM-storage-backed persistent circuit. Preparation and every Listing mutation check the same circuit. The circuit never enters half-open by elapsed time and blocks until explicit manual reset. Stored diagnostics retain only allowlisted operation, endpoint, status/code, Job/Run, Trade Access and capacity fields. Operation Coordinator bridges existing Runner busy state, and the cross-tab lease fails closed when an expired run has not been reconciled.

Live blocker: The account currently receives `427` from EA-native auction/watchlist endpoints with Runner, FSU and Enhancer disabled. Historical TS2b HTTP 200 proves the implementation previously listed successfully but does not clear the current account/backend state. No live Listing, relist, bid, buy or high-frequency market validation may run while this persists.

Next: Schedule one low-value Club card 2-3 minutes ahead, enable the guarded gate, keep the page logged in for the first run, and export Scheduler plus Listing diagnostics. Review auto-relock, History and Transfer reconciliation before testing page resume or any broader schedule.

### 2026-08-08 / TS4 offline Buy core and preview UI

Status: Offline implementation complete; no production Buy entry exists.

Commit/Version: Uncommitted working tree targeting repository version `0.7.34`.

Automated tests: `npm run verify` passes with 136 test files and 817 tests. Syntax, ESLint, config/Profile validation, architecture audit, FSU patch replay, generated userscript/dist equality and FSU release assets also pass. The focused Trade suite covers the EA/Fake Adapter contract, exact rating/definition lane rotation, candidate sorting, transaction limits, persistent circuit checks, ambiguous reconciliation, Preview, 15-item Recap, diagnostics and Scheduler UI.

Observed result: FUTNext catalog data is materialized into one exact search lane per rating and definition ID. A new search invalidates the previous EA live-item map. Candidates are revalidated and sorted by Buy Now, expiry and trade ID; at most one current-response item can reach Buy Now. Non-duplicate purchases target Club and Club duplicates target Transfer. Preview is available from Buy Job cards and public runtime diagnostics, but it performs no EA market search and always reports live execution locked.

Safety: Search, Buy, refresh and move are normalized by the EA Trade Adapter and expose allowlisted snapshots only. Every search and Buy mutation rechecks the shared circuit. An ambiguous response can proceed only when the exact item materializes and the coin delta equals the requested Buy Now; refresh uncertainty, missing evidence, route uncertainty and 427 stop the run without another purchase. Automatic Buy remains absent from the Scheduler executor, `liveExecutionEnabled=false`, and Scheduler remains paused.

Remaining risk: EA `requestUnassignedItems` and optional Transfer/Club/Watchlist refresh behavior, post-Buy repository timing, exact coin update timing, duplicate routing and Transfer capacity races are only fixture-validated. The current account/backend status 427 makes a real Buy probe unsafe. The global minimum retained coin balance decision remains open and is not silently defaulted.

Next: Run the full repository verification. Then stop TS4/TS5 production work until EA native Listing and market endpoints recover; resume with read-only preview diagnostics before one explicitly confirmed low-value purchase.

### 2026-08-09 / TS3 guarded scheduled Listing validation gate

Status: Complete for the guarded single scheduled Club item flow.

Commit/Version: Uncommitted working tree targeting repository version `0.7.35`.

Automated tests: `npm run verify` passes with 139 test files and 837 tests. New coverage verifies exact gate eligibility, confirmation, atomic pause/live-off/disarm, Scheduler-to-executor integration, one History receipt, lease, Web Lock and Coordinator compatibility, recovery wakeups, page resume, FSU Club readiness and misfire behavior, delayed EA session readiness, disabled production paths, and rejected price-limit refresh diagnostics with usable existing limits.

Observed result: The main Trade Scheduler permits one temporary validation run only when exactly one enabled+armed Job is a `once` Listing from Club with `maxListings=1`. The run must be 15 seconds to 15 minutes ahead and use skip or at most a 15-minute grace window. Exact input `RUN ONCE 1` enables waiting. At execution start the executor pauses the Scheduler, disables live execution and disarms the Job before Prepare or `list()`; a missed run, stale lease, circuit/config change or tick exception also relocks. Scheduler diagnostics include a sanitized Prepared plan and receipt without the confirmation token.

Live validation: EA Web App on PC, Runner `0.7.35`; artifact `trade-scheduler-diagnostics-2026-08-09T14-59-47-540Z.json`. The Job was scheduled for `1786287480000` and started 1.702 seconds later. It immediately relocked the Scheduler (`paused=true`, `liveExecutionEnabled=false`, `armed=false`), completed one run and cleared `nextRunAt`. The exact Club item `913454790934` / definition `265850` was listed at 650/700 for one hour. `list()` and Transfer refresh returned HTTP 200; reconciliation found an Active Transfer auction with trade ID `607251201956` and about 3598 seconds remaining. The receipt recorded requested 1, succeeded 1, failed 0, skipped 0; the circuit remained closed and the lease and Coordinator were idle after completion.

Misfire live validation: EA Web App on PC, Runner `0.7.36`; artifact `trade-scheduler-diagnostics-2026-08-09T15-25-49-566Z.json`. A `once + skip` Job scheduled for `1786289040000` was first evaluated after page restart at `1786289119476`, 79.476 seconds late and outside the 15-second tick tolerance. History recorded exactly one `missed / misfire-skip` receipt with requested 0, succeeded 0 and no item receipts. Runtime retained `lastStartedAt=null` and `runCount=0`, proving the Listing Executor and EA mutation transaction did not start. The Scheduler finished paused and live-disabled, the Job was disarmed, and Circuit, Lease and Coordinator were inactive.

Diagnostic note: The Prepared price-limit refresh returned HTTP 403 while the EA Item still exposed valid existing limits 300-10000. This did not invalidate the confirmed price or the subsequently verified Listing. Price-limit diagnostics now report data availability separately from refresh outcome (`status`, `refreshStatus`, `limitsSource`), and the final transaction receipt retains the same refresh evidence. A rejected read-only refresh alone does not open the mutation circuit when valid limits remain available.

Post-validation hardening (`0.7.36`): Scheduler relock is now one Job Store operation that pauses, disables live execution and disarms every pending Job. Misfire, expired lease, circuit/config changes, manual disable and unexpected tick errors all use this path. Any Job create/edit/delete while live execution is enabled also relocks before persisting the change. The generic Pause/Resume UI was removed so a changed Job cannot reuse an earlier `RUN ONCE 1` confirmation. Scheduler and Listing transactions share one `runId` and `scheduledFor`; expired-lease takeover writes a sanitized blocked History receipt without the lease token. Integration tests cover one execution after an in-grace page resume, zero execution after skip/grace expiry, delayed EA session readiness, repeated ticks and expired-lease takeover.

Resume wakeups (`0.7.37`): In addition to the fixed five-second absolute-time tick, visible `visibilitychange`, window `focus` and browser `online` now trigger an immediate idempotent Scheduler tick. Hidden visibility changes do nothing, listeners are removed on Runner destroy, and the Scheduler's existing in-flight guard collapses overlapping wakeups. Same-tab Runner operation coverage confirms a due Trade Job remains `waiting-operation` and executes at most once only if the operation clears inside grace.

Cross-tab hardening: When `navigator.locks` is available, every Scheduler tick runs under the same-origin exclusive `fc-loop-runner-trade-scheduler-v1` Web Lock with `ifAvailable`; a second tab returns busy without evaluating or executing the Job. GM storage lease remains the persistent crash/reload layer and fallback for browsers without Web Locks. The guarded Listing transaction now renews and verifies that lease immediately before each `listItem()` mutation; a lost or expired lease produces `listing-execution-lease-lost` with zero list calls. An accepted mutation still proceeds to Transfer reconciliation even if later state becomes uncertain.

Cross-tab diagnostics expose only the random tab owner ID, Web Lock support/name and the latest tick status/reason/Job/Run. Lease snapshots retain owner, Run/Job and timing fields but always remove the internal token, including while a lease is active or expired.

Club readiness after restart (`0.7.38`): Artifact `trade-scheduler-diagnostics-2026-08-09T15-45-38-727Z.json` from live `0.7.37` reached Scheduler execution 151.054 seconds after its due time but blocked in 14ms with `no-eligible-listing-candidates`, requested 0 and no EA mutation. The page session and Trade capability were ready, but the scheduled Prepare snapshot was not retained. `0.7.38` therefore held an FSU-backed Job in `waiting-session` until Club data was fully validated and retained blocked Prepared scans for diagnostics.

FSU provisional correction (`0.7.39`): Artifact `trade-scheduler-diagnostics-2026-08-09T15-57-17-878Z.json` proved that the `0.7.38` gate was too strict. At 23:57:15 the armed Job scheduled for 23:55 remained `waiting-session / fsu-club-provisional`; no new History, Prepare or mutation existed. This was not an incomplete startup: `trusted-provisional` is the optimized FSU fast path and intentionally skips a full Club scan, so it does not automatically become fully validated. Guarded scheduling now waits only for FSU `loading/not-ready`. A provisional cache may select exactly one Club candidate, but before the Listing Transaction is created the executor must call FSU targeted Club validation for that exact item ID and definition ID. Failure, missing identity or an unavailable validator blocks with requested 0 and no `list()` call. The transaction still reloads the live item, eligibility and EA price limits and validates the lease immediately before mutation. Scheduler diagnostics now include page/FSU readiness, cache status and the sanitized targeted-validation result. FSU remains optional; without it the EA Trade Adapter path is unchanged.

In-grace restart live validation: EA Web App on PC, Runner `0.7.39`; artifact `trade-scheduler-diagnostics-2026-08-10T05-21-24-757Z.json`. The `once` Job was scheduled for 13:16:00 and first executed after a full page restart at 13:19:32.517, 212.517 seconds late but inside its 15-minute grace window. FSU was intentionally still `provisional / trusted-provisional / fullyValidated:false`. The executor prepared one Club common Gold, then targeted the exact item `913459392327` / definition `267680` through FSU; the same identity returned after 2814ms with no missing item. EA price limits refreshed to 300-10000, `list()` returned HTTP 200, Transfer refresh returned HTTP 200, and reconciliation found active trade `607277852375` at 650/700 with 3598 seconds remaining. History recorded exactly one completed run with requested 1, succeeded 1 and runCount 1. The Scheduler atomically ended paused, live-disabled and disarmed; lease and Coordinator were empty and the circuit remained closed. An older expired Job separately recorded `misfire-grace-expired` with requested 0, confirming restart did not revive it or issue another mutation.

Remaining risk: Expired lease reconciliation, dual-tab races and Loop/Trade mutual exclusion have not yet been observed on the live page. Normal scheduled execution, skip misfire, grace expiry and in-grace full page restart are now verified. The gate intentionally cannot run a second Job, daily/interval/window schedules, next-login, Transfer sources, reprice, bulk Listing or Buy.

Next: Validate dual-tab/operation-busy and expired-lease fail-closed behavior without broadening the mutation limit. Then resume TS4 with the existing read-only Buy preview before adding one explicitly confirmed low-value purchase gate. Keep Transfer sources, reprice, bulk Listing and scheduled Buy disabled until their separate staged validations.
