# 10x85+ Rolling Loop 设计与实施追踪

> 文档状态：设计已确认，实施尚未开始
>
> 最后更新：2026-08-16
>
> 规划基线：DailyLoopRunner `v0.7.91`，Git `0be883d`
>
> 功能可见性：完成全部自动验证和真实页面验收前保持 hidden/MVP

## 1. 文档目的

本文档是 `10x85+ Rolling Loop` 的设计、实施顺序和验收状态来源。后续实现、测试、真实页面验证和问题修正都应更新本文档，不在聊天记录或临时日志中维护另一套进度。

目标是基于当前不限次数的 `10x 85+ Upgrade` 建立可持续滚卡流程，同时：

- 动态读取 SBC 和 Challenge 事实，不写死 Set ID、Challenge ID、84 评分、11 人或特殊卡数量。
- 开启 `10x85+` 奖励并复用现有 Reward Alerts。
- 安全处理重复卡、Storage 压力和多个恢复 SBC。
- 严格保护特殊卡角色，避免把要求卡当作普通评分填料。
- 实时维护库存账本并在 UI 显示当前资源能力。
- 长时间运行时保持日志、Recap 和内存有界。
- 复用现有 Pack、Unassigned、Selection、SBC、Reward 和 Pick 底层能力，不复制事务实现。

本文档中的状态只使用：

- `Not started`
- `In progress`
- `Blocked`
- `Complete`

除纯文档步骤外，一个 Milestone 只有同时满足实现、对应自动测试、完整 `npm run verify`、文档记录和规定的真实页面验证后才能标记为 `Complete`。

## 2. 范围与非目标

### 2.1 本轮范围

- 动态发现并运行一个 `high-rated-x10` 类型的 Rolling Loop。
- 主 `10x85+` SBC 的启动、提交、奖励开启和重复卡回填。
- 特殊卡恢复：`84+ TOTW Upgrade`。
- 普通材料恢复：`Repeatable FUTTIES Provisions Upgrade`。
- Provisions 重复卡清理：`1 of 3 85+ Player Pick`，再到 `5x 80+ Upgrade`。
- Protection rating 与现有 Pick 阈值合并。
- 资源库存账本、容量估算、实时 Telemetry 和紧凑 Recap。

### 2.2 非目标

- 不为这些 SBC 写死当前活动 ID。
- 不远程读取或保存 EA Challenge 模型之外的固定评分要求。
- 不新增第二套开包、提交、Pick 或 Reward Alert 实现。
- 不把 Rolling 专属策略写入通用 Pack、Unassigned 或 SBC Transaction。
- 不承诺预测随机奖励之后的最终可运行总次数。
- 不为了继续运行而丢弃、快速出售或绕过受保护卡。
- 不改变现有 `84+ TOTW`、`84x10` 等 Loop 的默认评分上限。

## 3. 术语和事实来源

### 3.1 主 SBC

`Primary SBC` 指动态扫描得到的 `10x 85+ Upgrade`。当前业务事实是不限次数、84 评分阵容，并要求一张 TOTW/TOTS/FOF/FUTTIES，但实现只能信任当前 EA Challenge metadata：

- 球员数量来自 Challenge。
- 目标评分来自 Challenge。
- 特殊卡数量、group id 和 values 来自 Challenge。
- 特殊卡资格必须使用 live `meetsRequirements(item)` 判断。
- live matcher 缺失或失效时 fail closed。

### 3.2 Required Special

`Required Special` 是满足主 SBC 当前特殊卡 eligibility group 的球员。TOTW/TOTS/FOF/FUTTIES 是当前业务描述，不得在底层展开成永久静态卡种列表。

已确认规则：

- 无论位于 `Unassigned -> Storage -> Transfer -> Club` 的哪个来源，只能作为主 `10x85+` 的特殊卡槽使用。
- 每套主 SBC 必须且只能使用一张 Required Special。
- 不得作为主 SBC 的普通评分填料。
- 不得投入 TOTW Upgrade、Provisions、85+ Pick 或 5x80+。
- Required Special 87/88/89 不进入 Provisions 储备池。
- 选择时遵循来源顺序，并在同一来源中优先重复、低评分和低保护成本球员。
- 高于 Protection rating 的重复 Required Special 必须进入 Storage，不能因为能够满足特殊卡槽而提交。
- Club 中非重复 TOTS/FOF/FUTTIES 应尽量保留；Club TOTW 可以作为特殊卡槽使用。实现应优先使用前序来源和低成本 TOTW，再考虑 Club 中高价值非重复活动卡。

提交前、保存后和最终提交前都必须验证 Required Special 数量恰好为一，并再次执行 live matcher。

### 3.3 Other Special

`Other Special` 是特殊卡，但不满足当前 Required Special matcher。

- Unassigned、Storage 和 Transfer 中评分不高于 Protection rating 的 Other Special 可以作为普通评分材料。
- Club 中 Other Special 使用软保护：普通材料无法组成合法阵容时才进入最后候选层。
- Other Special 不能满足 Required Special 槽位。
- 高于 Protection rating 的重复 Other Special 必须进入 Storage。

### 3.4 Regular

`Regular` 指普通金、银、铜球员。主 SBC 和恢复 SBC 仍须遵守 FSU Lock、loan、concept、Evolution、active trade item 和其他既有安全过滤。

### 3.5 Protection rating

现有 `Auto-pick below` 和 Rolling Loop 的 `Refill max rating` 合并为一个共享设置，UI 建议命名为 `Protection rating`。

当设置为 `95` 时：

- 评分 `<=95` 的普通候选可按 Pick 或 Rolling 策略处理。
- 评分 `>95` 的重复卡视为受保护卡并进入 Storage。
- Required Special 的角色隔离优先于评分阈值；低于阈值也不能作为普通材料。
- 87/88/89 Provisions 储备规则优先于普通回填资格。
- 该共享值只接入 Pick 和新 Rolling Loop；现有其他评分 SBC 保留自己的 `ratingSbcMaxCardRating`。
- 旧 Pick 阈值必须迁移，不能静默重置用户设置。

## 4. 已确认产品决策

1. 87/88/89 储备优先于“不高于 Protection rating 即可回填”。Required Special 例外，只能进入特殊卡槽。
2. 高于 Protection rating 的重复特殊卡必须存入 Storage。
3. Required Special 在任何来源中都不能作为普通材料或恢复 SBC 材料。
4. Storage 中不高于 Protection rating 的 Other Special 和普通卡可以合理消耗。
5. Rare Gold 重复卡优先进入 `1 of 3 85+ Player Pick`，Pick 立即开启并使用现有自动选择；剩余 Gold 再进入 `5x80+`。
6. 没有现成 `10x85+` 奖励包时，允许从库存完成一套主 SBC 启动循环。
7. 不新增 Rounds 控件，复用现有 `SBC completion`；Rolling Loop 默认 `0`，表示运行到用户停止或安全停止条件。
8. 选择 Rolling Loop 时默认勾选 `Open reward packs`。用户随后可以手动取消，但启动时必须拒绝不能开包的 Rolling Run，不暗中覆盖设置。
9. Reward Alert 继续使用现有最低评分、Toast、Desktop 和 ntfy 设置，不新增专用 98+ 通知链。
10. 实时资源信息放入主面板内部的透明 Runtime Telemetry，不新增独立悬浮窗。

## 5. 材料资格矩阵

| 材料 | Unassigned | Storage | Transfer | Club |
| --- | --- | --- | --- | --- |
| Required Special | 仅主 SBC 特殊槽，每套最多一张 | 仅主 SBC 特殊槽，每套最多一张 | 仅主 SBC 特殊槽，每套最多一张 | 仅主 SBC 特殊槽；优先 TOTW，尽量保留非重复 TOTS/FOF/FUTTIES |
| Other Special `<= Protection rating` | 可作普通材料 | 可作普通材料 | 可作普通材料 | 软保护，普通候选不足时最后使用 |
| Regular `<= Protection rating` | 优先处理重复 | 可作普通材料 | 可作普通材料 | 可作普通材料，仍遵守 FSU 过滤 |
| 非 Required Special 87/88/89 | 优先进入 Provisions 储备 | 优先进入 Provisions 储备 | 优先进入 Provisions 储备 | 优先进入 Provisions 储备，Other Special 继续遵守 Club 软保护 |
| 重复卡 `> Protection rating` | 必须存入 Storage | 保持受保护 | 不作为回填材料 | 不作为回填材料 |

任何表格规则都不能绕过以下已有保护：

- FSU Lock 和身份别名匹配。
- loan、limited-use、concept、academy/evolution 和 active trade item。
- 同阵容 definitionId 唯一性。
- Unassigned/Transfer duplicate signal 的真实可提交实体解析。
- provisional Club cache 的 EA 定向验证。

## 6. 主循环状态机

Rolling Loop 使用专用 Workflow 状态机，但通过注入调用共享能力。禁止在 Workflow 中直接访问 EA Repository、FSU 私有对象或 DOM。

```text
PREFLIGHT
-> INDEX_INVENTORY
-> BOOTSTRAP_OR_FIND_REWARD
-> OPEN_X10
-> CLASSIFY_OPENED_ITEMS
-> RESOLVE_PROTECTED_STORAGE
-> PLAN_PRIMARY_SQUAD
-> RECOVER_NORMAL_FODDER_IF_REQUIRED
-> RECOVER_REQUIRED_SPECIAL_IF_REQUIRED
-> DRAIN_RECOVERY_DUPLICATES
-> SUBMIT_PRIMARY
-> RECONCILE_LEDGER
-> OPEN_X10
-> repeat
```

状态机不通过递归调用恢复流程。每个恢复结果回到统一评估点，并使用进度指纹避免以下循环：

```text
Provisions -> Pick -> reward -> duplicate -> Provisions
TOTW Upgrade -> reward -> duplicate -> TOTW Upgrade
Unassigned resolver -> same resolver -> no inventory change
```

每次状态转换至少返回：

```js
{
  status: 'progressed' | 'ready' | 'planned' | 'blocked' | 'completed' | 'stopped',
  phase,
  receipts: [],
  inventoryDelta: null,
  reason: null,
}
```

## 7. 主 SBC 选材

### 7.1 通用 Solver 合同扩展

评分 Solver 增加可选合同，不新增 Rolling 专用选材器：

```js
selectInventoryPlayers({
  inventorySnapshot,
  requirements,
  priorityPiles,
  requiredItems,
  preferredItems,
  protectedItems,
  exclusiveRoles,
  maxOrdinaryRating,
  protectionPolicy,
  mode: 'rating',
})
```

`exclusiveRoles` 用于表达：

- 某 matcher 的卡只能进入指定角色。
- 指定角色要求最小和最大数量均为一。
- 同一张卡不能同时满足普通评分材料和 Required Special 两种角色。

不传新字段时，现有评分 SBC 行为必须保持不变。

### 7.2 求解目标顺序

1. 满足 EA 实时球员数量、评分和 eligibility 条件。
2. Required Special 恰好一张。
3. 消耗当前必须处理的普通重复卡。
4. 排除 Provisions 储备和受保护卡。
5. 最小化目标评分之上的浪费。
6. 遵循 `Unassigned -> Storage -> Transfer -> Club`。
7. Club 普通 Rare Gold 优先于 Club Other Special。
8. 使用稳定身份进行确定性 tie-break。

Solver 不预设“84 阵应该平均使用 83/84”。如果已有高评分重复卡，它可以自然得到“一两张高分加多张低分”的最低合格组合；如果平均组合成本更低，也可以选择平均组合。

### 7.3 不可行原因

“缺普通低分填料”统一改为“当前阵容不可行”，并细分：

- `PLAYER_COUNT_SHORTAGE`：合法候选数量不足。
- `SQUAD_RATING_SHORTAGE`：当前最高可行组合仍达不到目标评分。
- `REQUIRED_SPECIAL_SHORTAGE`：没有可用 Required Special。
- `RESERVED_FODDER_BLOCKED`：只有受保护或 Provisions 储备材料能够解锁阵容。
- `PROTECTED_STORAGE_BLOCKED`：必须存储的高分重复卡没有安全位置。
- `LIVE_REQUIREMENT_UNAVAILABLE`：EA matcher 或 Challenge metadata 不可用。

诊断必须记录候选数量、评分直方图、最高可达评分、缺失角色和被各保护规则排除的数量，但不能输出完整 Club 卡片对象。

## 8. 开包后路由与 Storage 压力

### 8.1 分类

开包后按以下顺序分类：

1. 高于 Protection rating 的重复卡：受保护，等待 Storage。
2. Required Special：进入专用特殊卡队列，只能每套主 SBC 消耗一张。
3. 非 Required Special 87/88/89：进入 Provisions 储备。
4. 其他不高于 Protection rating 的重复卡：下一套主 SBC 的 requiredItems。
5. 非重复卡：沿现有 Pack settlement 路由。

### 8.2 Storage 有空间

- 受保护高分重复卡进入 Storage。
- 当前轮用不到的 Required Special 进入 Storage。
- Provisions 储备可进入 Storage，并由账本保留角色。
- 不要求把即将提交的普通重复卡先移动到 Storage。

### 8.3 Storage 无空间

依次尝试：

1. 使用当前 Unassigned 普通重复卡完成主 SBC。
2. 主 SBC 补卡优先从 Storage 选择可消耗材料，主动释放位置。
3. 从 Unassigned/Storage 直接执行 Provisions，不要求先移动 87/88/89。
4. 立即处理 Provisions 产生的重复 Gold。
5. 多张 Required Special 重复卡同时阻塞时，可以预做多套主 SBC，每套只使用一张，并暂存奖励包而不继续开包。
6. 仍无法为受保护卡腾出位置时安全停止。

不允许将第二张 Required Special 塞入同一主 SBC，也不允许将它降级为 Provisions 或普通材料。

## 9. 恢复策略

### 9.1 Required Special 恢复

顺序如下：

1. 使用当前 Unassigned 中合法且未受高分保护的 Required Special。
2. 使用 Storage。
3. 使用 Transfer。
4. 使用 Club 中低成本 TOTW。
5. 打开已存在的 TOTW Upgrade 奖励。
6. 动态定位并完成一次 `84+ TOTW Upgrade`。
7. 上述恢复不可行时，才允许主 Solver 将 Club 中非重复 TOTS/FOF/FUTTIES 作为最后的特殊槽候选；仍按最低成本选择。

TOTW Upgrade 自身的普通材料池必须排除全部 Required Special。新产出的 TOTW 加入 Required Special 队列。

### 9.2 Provisions 恢复

当前目标为动态定位 `Repeatable FUTTIES Provisions Upgrade`。Challenge 事实以 EA metadata 为准；当前业务需求是四张 87+。

触发条件：

- 主 SBC 因候选数量或评分不足而不可行。
- 非 Required Special 87/88/89 达到常规批量阈值，默认八张。
- Storage 压力阻止受保护卡或 Required Special 安全存储。

选择策略：

- 优先 87，再到 88、89。
- 不足四张时可以使用不高于 Protection rating 的 90-95。
- Required Special 永远排除。
- Storage 中不高于阈值的 Other Special 可以使用。
- Club Other Special 保持最后候选软保护。
- 不消耗下一套主 SBC 唯一可用的 Required Special，因为它根本不进入候选池。

常规触发默认攒够八张后批量完成两套；阵容阻塞或 Storage 压力下，满足单套实时需求即执行一次。

### 9.3 Provisions 重复 Gold 清理

清理链必须配置化，不在 Unassigned 底层写死 SBC 名称：

```text
Rare Gold duplicate
-> 1 of 3 85+ Player Pick
-> immediate Pick redemption
-> remaining Gold to 5x80+

Common Gold duplicate
-> 5x80+
```

要求：

- Pick 使用现有动态 Pick metadata 和自动选择策略。
- Pick 立即开启，不使用“全部做完再开”的延迟模式。
- 所有恢复 SBC 都再次排除 Required Special。
- 每次提交后回到统一 Unassigned 状态重新评估。
- 路径不可用或没有取得库存进展时停止，不无限重试。

### 9.4 恢复依赖

如果 TOTW Upgrade 自身也缺普通材料，允许依赖链：

```text
Provisions
-> drain Gold duplicates
-> 84+ TOTW Upgrade
-> 10x85+ Upgrade
```

状态机每次只执行一个已验证动作，动作完成后重新规划，不预先假定随机奖励内容。

## 10. SBC completion 和开包设置

### 10.1 SBC completion

- 复用现有 quantity 控件，不新增 Rounds。
- Rolling Loop 默认值为 `0`。
- `0` 表示直到用户 Stop、资源不可恢复、Storage 保护阻断、动态 SBC 失效或安全门禁失败。
- 正整数只统计主 `10x85+` 提交次数。
- TOTW、Provisions、85+ Pick 和 5x80+ 不计入主完成数。
- 状态机内部仍需有进度指纹、恢复预算和停止点，不允许字面上的无保护无限循环。

### 10.2 Open reward packs

- 用户选择 Rolling Loop 时，将 `Open reward packs` 默认设为开启。
- 只在选择行为中设置一次，不在每次 render 时覆盖用户随后进行的修改。
- 启动时如果该项关闭，预检失败且不提交任何 SBC。
- Workflow 不得绕过该设置强制开包。

### 10.3 Dry Run

Dry Run 和 Live Run 使用同一规划器和状态机，只替换副作用执行器。

- 可以验证当前库存下的启动、选材、特殊槽、Storage 和恢复决策。
- 不保存、提交、移动或开包。
- 不伪造未来随机奖励；规划到第一个未知奖励边界后返回 `planned`。
- Dry Run 不维护一套独立业务规则。

## 11. 库存账本

### 11.1 初始索引

启动时建立 `Inventory Ledger`，至少按以下维度索引：

- item identity 和 definition identity。
- pile：Unassigned、Storage、Transfer、Club。
- rating。
- duplicate 状态。
- Required Special eligibility。
- Other Special/Regular 分类。
- 87/88/89 Provisions 储备资格。
- FSU 和 Runner 保护状态。

初始索引只能读取当前已加载的 EA/FSU Repository。禁止为了统计主动触发几十页 Club 网络扫描。

性能目标：

- 对约一万张 Club 球员进行本地聚合应保持在亚秒级目标内。
- 记录数据来源、球员数量和实际耗时。
- Repository 未就绪时等待或 fail closed，不能用 23 张之类的不完整缓存冒充完整库存。

### 11.2 增量更新

Runner 已确认的每次操作都产生 `InventoryDelta`：

- 开包：新增 reward 和 Unassigned 项。
- 移动：来源 pile 扣除，目标 pile 增加。
- SBC 提交：扣除最终保存并验证过的球员。
- Pick：增加最终选择结果。
- Storage 操作：更新使用量和空余位置。

只有 EA 已确认的 mutation 才提交到账本。超时、歧义响应或保存后不一致必须先对账，不能乐观永久扣除。

### 11.3 对账

- 每次提交前验证被选 item refs。
- 每次开包后刷新 Unassigned。
- 进入 TOTW/Provisions 恢复时核对相关 pile。
- 每十次主 SBC 做一次完整的本地 Repository 对账。
- 检测到外部手动操作、数量不匹配或 item 缺失时立即重建索引。
- provisional FSU Club 实体继续执行 EA 定向验证。

### 11.4 当前能力计算

账本按 `inventoryVersion` 缓存以下派生值：

- `specialSlots`：当前允许用于主特殊槽的 Required Special 数量。
- `directCycles`：在克隆账本上重复运行当前主 Solver 后，当前策略可以直接完成的主 SBC 数量，不假设未来奖励。
- `provisionsBatches`：当前材料可完成的 Provisions 数量。
- `totwRecoveries`：独立评估当前普通材料可完成的 TOTW Upgrade 数量。
- `storageUsed/storageCapacity`。

这些值会竞争相同材料，不能相加。`directCycles` 表示当前策略的确定性直接能力，不表示随机奖励之后的总循环上限。

Runner 自己造成的变化应在对应 EA receipt 确认后实时反映；外部手动变化最迟在下一次提交校验或周期对账时发现。

## 12. Runtime Telemetry UI

### 12.1 位置和布局

Telemetry 位于现有主面板的 Running 状态下方、最新日志上方，仅在 Rolling Loop 运行时显示。它继承面板背景，不创建第二个悬浮窗，也不使用多张卡片。

```text
Running - 10x85+ Rolling       Cycle 4 / No limit
Building 10x85+ squad

Special ready       7    Direct cycles      4
Provisions          3    TOTW recoveries    2
Storage        83 / 100  [===============-----]
```

规则：

- 两列稳定网格，Storage 独占最后一行。
- 数字使用 tabular numerals，异步更新不改变布局尺寸。
- Storage 低于 80% 使用中性色，80%-94% 警告色，95% 以上危险色。
- 容量标题带 tooltip，说明这些路径共享库存且数字不可相加。
- 初始化或重新计算时保留上次可信值并显示 `Refreshing`，未知值显示 `-`，不显示误导性的零。
- Desktop 面板为 Telemetry 预留稳定高度；Mobile Run 视图改为内容驱动的受限高度。
- icon-only 模式隐藏 Telemetry，避免在 EA 页面形成额外遮挡。
- 运行结束后最终值进入 Recap，运行 Telemetry 隐藏。

### 12.2 Phase

状态行支持：

- `Indexing inventory`
- `Opening 10x85+ reward`
- `Clearing duplicates`
- `Building 10x85+ squad`
- `Crafting Provisions`
- `Recovering TOTW`
- `Redeeming 85+ Pick`
- `Crafting 5x80+`
- `Reconciling inventory`
- `Stopping`

### 12.3 数据合同

UI 只渲染结构化 snapshot，不解析日志：

```js
{
  visible,
  phase,
  completedCycles,
  cycleLimit,
  specialSlots,
  directCycles,
  provisionsBatches,
  totwRecoveries,
  storageUsed,
  storageCapacity,
  inventoryVersion,
  calculating,
  updatedAt,
}
```

Workflow 发布 snapshot，entry 负责接线，`src/ui` 只负责纯渲染。UI 刷新应合并到 animation frame 或限制为每 100-200ms 最多一次，避免重复出现日志刷新卡顿。

## 13. Reward Alerts 和紧凑 Recap

### 13.1 Reward Alerts

- 所有主包、TOTW 包、Provisions 包、5x80+ 包和 Pick 结果继续走现有 highlight 归一化流程。
- 只按现有 `minimumRating + special` 规则发送 Toast、Desktop 和 ntfy。
- 不重复发送同一 item 的通知。
- 价格查询失败不阻断 Loop。

### 13.2 流式 Recap

长时间 Rolling Run 不得保存每个 receipt 和所有 EA item 对象。Recap 使用有界聚合器：

- 主循环、主包和总开包数量。
- TOTW、Provisions、85+ Pick 和 5x80+ 完成次数。
- 评分直方图。
- Common/Rare/Special 和 duplicate 数量。
- 重复卡进入主 SBC、Storage 和恢复路径的数量。
- 最终资源快照和停止原因。
- 最多保留评分最高的 50 张卡摘要。
- 最多保留 100 张达到 Reward Alert 条件的特殊卡摘要。
- 明确显示被省略的记录数量。

聚合器只保存可序列化摘要，不保存 EA 活对象、完整响应或无限增长的日志副本。

## 14. 停止条件

以下任一条件成立时停止，并保留可恢复状态：

- 用户点击 Stop。
- 达到正数 `SBC completion`。
- `Open reward packs` 在启动时关闭。
- 主 SBC 或关键恢复 SBC 不存在、过期或 metadata 不受支持。
- live Required Special matcher 不可用。
- 当前阵容不可行且所有恢复路径均不可用。
- 必须存储的高分重复卡无法获得 Storage 位置。
- 多张 Required Special 阻塞，且不能存储或继续预做主 SBC。
- mutation 结果不确定且只读对账仍无法确认。
- 同一库存版本和状态连续执行恢复却没有取得进展。
- FSU/EA 库存服务未就绪或候选实体验证失败。

停止结果必须包含稳定 reason code、用户可读原因、当前 phase、库存版本和安全的资源摘要。

## 15. 模块边界和计划文件

计划新增或扩展的模块如下，最终文件名可在实施时按现有目录结构微调：

| 模块 | 计划职责 |
| --- | --- |
| `src/config` | Rolling policy、动态 capability 绑定、默认 quantity 和设置迁移 |
| `src/domain` | item role、ledger snapshot/delta、telemetry snapshot 和 stop reason 合同 |
| `src/selection` | required/preferred/protected/exclusive role 评分求解 |
| `src/workflows/high-rated-rolling.js` | 纯状态机编排，不访问运行时全局 |
| `src/unassigned` | 接受配置化恢复链和保留角色，不认识具体 SBC 名称 |
| `src/reward` | 有界流式 Recap 聚合 |
| `src/ui/runtime-telemetry.js` | Telemetry 纯渲染和响应式状态 |
| `src/userscript-entry.js` | Adapter 注入、动态 SBC 接线、InventoryDelta 和 UI 发布 |

共享模块的默认合同不得变化。Rolling 行为必须通过显式 policy/strategy 启用。

## 16. 风险与影响面

| 变更 | 风险 | 控制方式 |
| --- | --- | --- |
| 评分 Solver exclusive role | 高，可能影响全部评分 SBC | 新字段 opt-in；characterization 和 differential tests 锁定旧行为 |
| Unassigned/Storage 压力恢复 | 高，涉及重复卡和高价值卡 | 纯规划、进度指纹、提交前多阶段 validator、真实页面边界验证 |
| Required Special 动态 matcher | 高，活动规则会变化 | 保留原始 group；live matcher；不可用即停止 |
| Inventory Ledger | 中，可能与外部操作或 provisional cache 不一致 | EA receipt 后提交 delta；周期和异常对账；定向验证 |
| 动态 SBC capability 绑定 | 中，名称和奖励可能变化 | family + live metadata 双重验证；不写死 ID |
| Protection rating 迁移 | 中，影响 Pick 用户设置 | 向后迁移测试；其他评分 Loop 不接入共享阈值 |
| Runtime Telemetry | 低到中，可能引起 UI 卡顿或重叠 | 纯渲染、节流、稳定尺寸、桌面/移动测试 |
| 紧凑 Recap | 中，影响普通 Loop recap | Rolling opt-in retention policy，旧 Recap 默认行为锁定 |

## 17. 自动测试矩阵

### 17.1 Config 和 discovery

- 动态识别当前 `high-rated-x10` 主 SBC。
- Challenge 评分、球员数或特殊卡 count 改变时使用实时值。
- 名称近似但 family/奖励不匹配时拒绝绑定。
- 主、TOTW、Provisions、Pick、5x80+ capability 缺失时返回准确预检结果。
- `SBC completion=0` 只对 Rolling 表示无业务上限。
- 选择 Rolling 默认勾选 Open rewards，但不覆盖用户之后的手动修改。
- 旧 Auto-pick 阈值迁移为 Protection rating。

### 17.2 Selection

- Required Special 在四个 pile 中都不能进入普通槽。
- 主 SBC 恰好选择一张 Required Special。
- 多张 Required Special 重复卡不会进入同一主阵容。
- TOTW、Provisions、Pick 和 5x80+ 都排除 Required Special。
- Required Special 87/88/89 不进入 Provisions 储备。
- Other Special 在 Storage 可用，在 Club 作为最后候选。
- 高评分重复卡受 Protection rating 保护。
- 高分重复必用卡配低分材料可以得到最低合格阵容。
- 平均评分方案更合理时不会强行使用额外高分卡。
- 不传 exclusive role 时，现有 rating tests 和 differential tests 结果不变。

### 17.3 Workflow

- 有现成主包的正常循环。
- 无主包时从库存启动一次。
- 一张和多张 Required Special 重复卡。
- 缺 Required Special 后打开现有 TOTW reward。
- 无 TOTW reward 后提交 TOTW Upgrade。
- TOTW Upgrade 缺材料时先走 Provisions。
- Provisions Rare duplicate 先走 Pick，剩余 Gold 走 5x80+。
- Storage 满但有可消耗材料时成功腾出空间。
- Storage 满且无安全恢复路径时保留高分卡并停止。
- 恢复奖励再次产生重复卡时不递归失控。
- Stop 在每个 mutation 边界都生效。
- Dry Run 和 Live 使用同一决策结果，Dry Run 无副作用。

### 17.4 Ledger 和 Telemetry

- 开包、移动、提交、Pick 的 delta 正确更新每个 pile。
- 未确认 mutation 不永久更新账本。
- 外部变化和 item 缺失触发重建。
- 一万张合成库存索引保持线性、无网络调用和可接受耗时。
- capacity 按 inventoryVersion 缓存并在 delta 后失效。
- 未知/刷新状态不显示错误零值。
- Telemetry 在普通 Loop 中隐藏。
- Desktop、Mobile、touch 和 icon-only 不重叠、不截断。
- 高频 snapshot 被合并，不造成日志或主面板刷新卡顿。

### 17.5 Recap 和长期运行

- 一万次模拟循环后 retained rows 仍有固定上限。
- rating/type/duplicate/recovery 计数准确。
- top cards 和 qualifying Special 排序稳定。
- 省略数量准确。
- Reward Alert 不因紧凑 Recap 重复触发。

## 18. 真实页面验收

自动测试通过后按风险递增验证：

1. Dynamic SBC scan 能发现并校验当前主 SBC 和恢复 SBC。
2. Dry Run 显示特殊槽、普通材料、Protection rating 和当前能力，不产生 mutation。
3. 从已有主包完成一轮，无重复卡。
4. 从库存 bootstrap 一轮。
5. 一张 Required Special 重复卡进入主特殊槽。
6. 两张以上 Required Special 重复卡只允许每套一张，并正确 Storage 或预做下一套。
7. 缺 Required Special 时完成 TOTW 恢复。
8. 缺普通材料时完成 Provisions，并处理 Rare/Common duplicate。
9. Storage 接近满时成功释放空间。
10. Storage 无法安全恢复时停止且高分卡仍存在。
11. `SBC completion=0` 可持续运行并响应 Stop。
12. 正数 completion 精确停止，恢复 SBC 不计数。
13. Toast、Desktop 和 ntfy 在符合现有 Reward Alert 条件时各触发一次。
14. 长运行 Telemetry 持续更新，日志可滚动，最终 Recap 有界。
15. 原版 FSU 与 FSU Local 至少各完成一次预检；FSU Local provisional 实体继续定向验证。

每次真实验证应保存：

- Runner 版本和 Git commit。
- Loop 配置和 Protection rating。
- Runner 日志。
- 必要的截图或 diagnostics。
- 起止 Storage、特殊卡和完成次数。
- 结果、偏差和对应修复提交。

## 19. Milestones

### RL-0：基线与 Characterization

状态：`Not started`

- 锁定现有 high-rated x10 discovery、rating selection、Pick threshold、Unassigned 和 recap 行为。
- 为主流程及恢复流程建立最小 fixture。
- 记录所有现有调用点和影响面。
- 不改变运行时行为。

验收：相关 characterization tests 和完整 `npm run verify` 通过。

### RL-1：配置、动态 capability 和 UI 设置合同

状态：`Not started`

- 定义 Rolling strategy/policy/schema。
- 动态绑定主、TOTW、Provisions、Pick 和 5x80+ capability。
- 合并 Protection rating 设置并迁移旧 Pick 配置。
- 接入现有 `SBC completion`，Rolling 默认零。
- 选择 Rolling 时默认启用 Open rewards，并增加启动预检。
- 功能仍保持 hidden/MVP。

验收：schema、discovery、migration、quantity 和 command tests 通过；旧 Profile 仍可加载。

### RL-2：角色化评分选材

状态：`Not started`

- 扩展通用 SelectionPlan 合同。
- 实现 Required Special exclusive role 和 exact-one validator。
- 实现 required/preferred/protected inputs。
- 实现 Provisions 储备和 Protection rating 规则。
- 保持旧评分 SBC 默认结果不变。

验收：新增 selection tests、现有 differential tests、全部 rating SBC tests 和 `npm run verify` 通过。

### RL-3：Inventory Ledger 和能力计算

状态：`Not started`

- 建立初始本地库存索引。
- 定义 InventoryDelta 和 mutation confirmation 边界。
- 接入开包、移动、提交、Pick 和 Storage 更新。
- 实现周期/异常对账和 provisional Club 定向验证。
- 实现五项 Telemetry 派生指标。
- 添加性能诊断日志。

验收：合成大库存测试、mutation/reconciliation tests 和原版/Local FSU compatibility tests 通过。

### RL-4：主 Rolling 状态机

状态：`Not started`

- 实现 bootstrap、主包开启、分类、主阵容提交和重复循环。
- 处理普通重复、87/88/89 储备、Required Special 队列和高分 Storage。
- 支持多张 Required Special 每套只消耗一张。
- 支持正数 completion、零上限、Stop 和 Dry Run。
- 不在本阶段自动制作恢复 SBC；不可行时返回结构化 reason。

验收：主路径、Storage 压力、Stop、Dry Run 和无进展测试通过。

### RL-5：TOTW、Provisions 和 Gold sink 恢复

状态：`Not started`

- 接入 TOTW reward/Upgrade 恢复。
- 接入 Provisions 常规、紧急和 Storage 压力触发。
- 接入 Rare -> 85+ Pick -> 5x80+ 路径。
- 实现恢复依赖和统一重规划。
- 加入恢复预算和进度指纹。

验收：每条恢复链、嵌套重复、缺失 capability 和安全停止测试通过。

### RL-6：Runtime Telemetry

状态：`Not started`

- 添加通用 Runtime Telemetry snapshot 和 renderer。
- 接入 Rolling phase、cycle 和五项资源指标。
- 完成 Desktop、Mobile、touch、resize 和 icon-only 布局。
- 合并高频 UI 更新，保持日志流畅。

验收：UI unit tests、响应式 screenshot/DOM 验证和长时间刷新测试通过。

### RL-7：有界 Recap 和通知集成

状态：`Not started`

- 实现 Rolling 流式聚合器和 retention limits。
- 接入现有 Reward Alerts 和价格补全。
- 显示恢复次数、评分分布、top cards、停止原因和最终库存。
- 保持普通 Pick、Batch 和 Loop recap 默认行为不变。

验收：一万次模拟运行内存有界，Recap/Alert 回归测试和 `npm run verify` 通过。

### RL-8：集成、文档和真实页面门禁

状态：`Not started`

- 完成 entry Adapter 接线和生成 userscript。
- 更新用户指南、AGENTS 和必要的 Profile/Builder 文档。
- 运行完整 `npm run verify`。
- 完成第 18 节真实页面验收。
- 记录发现的问题、修复提交和最终版本。
- 验收全部通过后再决定从 hidden/MVP 移出。

验收：实现、自动验证、生成产物、文档和真实页面证据全部完成。

## 20. 进度总览

| Milestone | 状态 | 自动测试 | `npm run verify` | 真实页面 | Commit |
| --- | --- | --- | --- | --- | --- |
| RL-0 基线与 Characterization | Not started | - | - | N/A | - |
| RL-1 配置与动态 capability | Not started | - | - | - | - |
| RL-2 角色化评分选材 | Not started | - | - | - | - |
| RL-3 Inventory Ledger | Not started | - | - | - | - |
| RL-4 主 Rolling 状态机 | Not started | - | - | - | - |
| RL-5 恢复链 | Not started | - | - | - | - |
| RL-6 Runtime Telemetry | Not started | - | - | - | - |
| RL-7 有界 Recap 与通知 | Not started | - | - | - | - |
| RL-8 集成与实机验收 | Not started | - | - | - | - |

## 21. 实施记录

每完成或阻塞一个 Milestone，在此追加记录：

| 日期 | Milestone | 状态变化 | Commit | 测试/证据 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 2026-08-16 | Planning | - -> Not started | `0be883d` | 设计讨论完成 | 尚未修改运行时代码 |

## 22. 完成定义

本功能只有满足以下全部条件才算完成：

- 所有已确认业务规则均由结构化 policy 和测试表达。
- Required Special 在所有提交路径中都不能被当作普通材料。
- 所有 SBC 身份和要求均通过动态 metadata 校验。
- Dry Run 和 Live Run 共用决策逻辑。
- Storage 满、重复卡阻塞和恢复路径均能安全取得进展或明确停止。
- Inventory Ledger 对 Runner 自身变化实时更新，并能对账外部变化。
- Telemetry 不依赖日志解析，不造成 UI 卡顿或重叠。
- Recap 和运行内存有界。
- `npm run verify` 完整通过。
- 真实页面验收完成并记录证据。
- 生成的 `DailyLoopRunner.user.js` 与源码一致。
- 本文档的 Milestone、提交和验收记录已更新。
