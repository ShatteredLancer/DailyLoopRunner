# Daily Loop Runner 架构重构与里程碑

本文档用于追踪 Daily Loop Runner 从单文件、流程型实现迁移到可测试、可组合架构的全过程。

当前基线：

- Userscript 版本：`0.5.22`
- Git 基线：`2ddf933`
- 运行产物：`DailyLoopRunner.user.js`
- 配置：内置 `LOOP_DEFS` 和 `DailyLoopRunner.loops.json`

本文档是重构工作的状态来源。实施过程中应更新里程碑状态、验收记录和发现的问题，不在聊天记录或临时日志中维护另一套进度。

## 1. 重构目标

重构完成后，业务依赖必须保持单向：

```text
Loop configuration
        |
        v
Workflow orchestration
        |
        v
Pack / Unassigned / Selection / SBC / Reward services
        |
        v
EA / FSU / DOM adapters
```

目标模块：

| 模块 | 职责 | 禁止事项 |
| --- | --- | --- |
| `config` | 配置加载、规范化、校验、默认值 | 不读取 EA Repository，不执行 Loop |
| `domain` | Item、Pile、Requirement、Plan、Result 等数据契约 | 不访问 DOM、EA、FSU 或全局状态 |
| `selection` | 普通条件选材和评分 SBC 求解 | 不打开 Challenge，不保存或提交阵容 |
| `unassigned` | Unassigned 规划、路由和容量恢复 | 不内置 Bronze、Provision 等 Loop 名称 |
| `pack` | 查包、开包事务、响应物品标准化和路由 | 不决定某个 Daily Loop 的后续步骤 |
| `sbc` | Challenge 读取、阵容保存、复核和提交事务 | 不决定材料来源或是否应开包补料 |
| `reward` | Reward Pack、Player Pick 领取和结果处理 | 不自行提交上游 SBC |
| `workflows` | 组合底层能力，实现各类 Loop 状态机 | 不直接调用 EA Service、Repository 或 DOM |
| `adapters` | EA、FSU、DOM、Tampermonkey、存储接口 | 不包含 Loop 业务策略 |
| `ui` | 面板、选项、日志和 recap | 不实现库存、选材或 SBC 规则 |

## 2. 统一公共入口

重构后的四个关键公共入口如下。公共入口唯一不等于内部只能有一个大函数；每个入口内部仍由纯规划器和副作用执行器组成。

### 2.1 开包

```js
openPackTransaction({
  packSelector,
  preOpenResolver,
  openedItemPolicy,
  retryPolicy,
  rewardMetadataPolicy,
})
```

统一流程：

```text
处理已有 Unassigned
-> 刷新并查找包
-> 检查是否允许开包
-> 调用 EA 开包
-> 标准化响应物品
-> 合并响应和 Unassigned 缓存
-> 按策略保留或路由物品
-> 刷新缓存
-> 返回 OpenPackReceipt
```

允许的策略差异：

- Daily Bronze/Silver 保留目标等级重复卡。
- Daily Common shortage pack 保留当前阵容可消费材料。
- Provision 保留 Pick 和 crafting stages 可消费材料。
- Rare Pack 保留低分稀有金，高分卡走安全路由。
- TOTW 奖励允许补充 assumed TOTW 元数据。
- Player Pick 不是 Pack，不进入本事务。

除 Pack Adapter 外，代码中禁止直接调用 `pack.open()`。

### 2.2 Unassigned

```js
resolveUnassigned({
  reserveItem,
  routingPolicy,
  overflowResolvers,
  stopPolicy,
})
```

统一流程：

```text
读取快照
-> 分类物品
-> 规划 Club / Transfer / Swap / Storage
-> 执行当前可完成的动作
-> 容量不足时依次调用 overflowResolvers
-> 刷新并验证是否取得进展
-> 清空、保留或安全停止
```

`overflowResolvers` 是有序回调，不在 Unassigned 模块中写死具体 SBC。例如 Bronze overflow 可以配置：

```text
可用的单卡 Bronze SBC
-> Daily Common Gold，仅使用现有材料且禁止开包
-> 可用的 11 铜卡 SBC
```

每个 Resolver 返回：

```js
{
  status: 'progress' | 'unavailable' | 'blocked',
  consumedItemIds: [],
  reason: null,
}
```

必须包含递归保护和进度指纹；Resolver 不能再次无限进入同一个 Unassigned 恢复链。

### 2.3 选材

```js
selectInventoryPlayers({
  inventorySnapshot,
  requirements,
  priorityPiles,
  protectionPolicy,
  fsuPolicy,
  consumedItemIds,
  mode,
})
```

该函数是纯函数，不读取全局 Repository。返回不可变的 `SelectionPlan`：

```js
{
  ok,
  entries,
  selected,
  missing,
  pileCounts,
  duplicateSignals,
  diagnostics,
}
```

`mode: 'requirements'` 处理数量、等级、稀有度和卡种要求；`mode: 'rating'` 调用共享评分求解器。两种模式共享输入输出契约，但不强行共用同一个求解算法。

旧的 `selectLoopInventoryPlayers()` 在配置规范化完成后删除。

### 2.4 SBC 提交

```js
submitSbcAttempt({
  sbcRef,
  challengeProvider,
  squadProvider,
  preSaveValidators,
  postSaveValidators,
  submitTransport,
  rewardPolicy,
})
```

统一流程：

```text
定位 SBC 和未完成 Challenge
-> squadProvider 产生 SquadPlan
-> 解析 Transfer / Unassigned duplicate signal
-> 保存前校验
-> 保存阵容
-> 重新读取实际保存阵容
-> 保存后校验
-> 检查 canSubmit / Submit 状态
-> 提交
-> 标记已消耗物品
-> 返回 SubmissionResult
```

支持的 `squadProvider`：

- `InventorySelectionProvider`
- `RatingSelectionProvider`
- `FsuFillProvider`
- `ExistingSquadProvider`

支持的 `submitTransport`：

- 页面标准提交。
- 评分 SBC 后台提交。

Player Pick 高分保护、动态 Challenge 条件和特殊卡校验通过 validator 注入，不复制提交事务。

### 2.5 Selection 与 Submission 边界

两者实现完全解耦，只通过数据契约连接：

```text
InventorySnapshot
-> selectInventoryPlayers()
-> SelectionPlan
-> resolveSelectionPlan()
-> submitSbcAttempt()
-> SubmissionResult
```

- Selection 不访问页面、不保存 Challenge、不提交 SBC。
- Submission 不重新决定选材优先级。
- Submission 可以因为 EA 实际保存结果不同而拒绝提交，但不能静默替换成另一套材料。

## 3. 实施原则

1. 禁止一次性 Big Bang 重写；每个 Milestone 必须可独立发布和回退。
2. 先添加 characterization tests 锁定当前正确行为，再迁移实现。
3. 新旧实现并存时，通过 feature flag 或 shadow plan 对比，不允许同时执行副作用。
4. 每次只迁移一类 Workflow；未迁移 Loop 继续走旧路径。
5. 共享接口发生变化时，必须运行所有 Loop 的测试矩阵。
6. 不把 Provision、Daily Common 等专属规则写进通用底层模块。
7. 发现线上 Bug 时，先保存最小 fixture 并添加失败测试，再修正实现。
8. 不接受有冲突且未经行为审计的合并；远程更新后必须重新跑完整测试。
9. 构建产物必须可重复生成，禁止同时手工维护源码和打包产物中的同一逻辑。
10. 每个 Milestone 完成时更新本文档的状态、提交和验收记录。

## 4. 目标目录

```text
src/
  config/
  domain/
  selection/
  unassigned/
  pack/
  sbc/
  reward/
  workflows/
  adapters/
  ui/
  userscript-entry.js
tests/
  unit/
  workflows/
  contracts/
  architecture/
  fixtures/
scripts/
dist/
  DailyLoopRunner.user.js
```

Tampermonkey 继续只安装单个 `dist/DailyLoopRunner.user.js`。源码多文件通过 esbuild 打包，不依赖 Tampermonkey `@require`。

## 5. Milestone 总览

| Milestone | 目标 | 状态 | 依赖 |
| --- | --- | --- | --- |
| M0 | 基线、测试设施和行为快照 | Complete | 无 |
| M1 | 多文件源码与可重复 Userscript 构建 | Complete | M0 |
| M2 | Domain Contract、Snapshot 和 Adapter 边界 | Complete | M1 |
| M3 | 统一 Selection API | Complete | M2 |
| M4 | 统一 SBC Submission Transaction | Complete | M3 |
| M5 | 统一 Unassigned Resolver | Complete | M4 |
| M6 | 统一 Pack Transaction | Complete | M5 |
| M7 | 分批迁移全部 Workflow | Complete | M3-M6 |
| M8 | 删除旧路径、完整回归和正式切换 | Complete | M7 |
| M9 | 动态发现当前可用 Player Pick SBC | In Progress | M2-M8 |

状态只能使用：`Pending`、`In Progress`、`Blocked`、`Complete`。

## 6. Milestone 详细定义

### M0：基线与测试设施

目标：不改变线上行为，建立后续重构的安全网。

范围：

- 增加 `package.json`、Vitest、esbuild 和统一脚本。
- 建立 `tests/fixtures`，脱敏保存 Item、Pile、Pack、SBC Set、Challenge 和 FSU 设置样本。
- 为当前所有 Loop 建立行为清单和最小 fixture。
- 增加架构扫描，记录当前直接访问 `W`、Repository、DOM 和 EA Service 的位置。
- 增加当前单文件的语法、JSON 和配置一致性检查。

必测行为：

- Daily Bronze、Silver、Common、Rare。
- Daily Rare Pack to 2x84+。
- One-click Daily 的完成跳过、剩余次数和中途恢复。
- Player Pick 单阵、多阵、严格 common/rare 比例、保护阈值和人工选择阈值。
- Provision Pick 前置、FOF、2x84+ 和 partial challenge 恢复。
- 2x84+ Fodder、84+ TOTW、84x10 与自动补料。
- Dry Run 与 Live 产生相同计划但没有副作用。

验收标准：

- `npm test`、`npm run build`、`npm run lint:syntax` 可执行。
- 所有现有 Loop 至少有一个正常路径和一个停止/恢复路径测试。
- 构建前后 Userscript metadata、版本和运行入口保持一致。
- 线上脚本行为不变。

回滚条件：测试框架要求修改业务逻辑或无法在无浏览器环境运行纯测试。

### M1：源码拆分与构建

目标：把开发源码拆成模块，同时输出单个 Tampermonkey 文件。

范围：

- 建立 `src/userscript-entry.js`。
- 先迁移常量、日志、配置和无副作用工具函数。
- esbuild 生成 `dist/DailyLoopRunner.user.js`。
- 保留当前热加载方式，但热加载目标切到构建产物。
- 增加构建产物一致性检查，避免忘记重新构建。

验收标准：

- 构建产物可在 Tampermonkey 和热加载流程中运行。
- 构建前后 UI、Loop 列表和日志初始化一致。
- 不引入运行时模块加载或本地服务硬依赖。

回滚条件：打包改变 `unsafeWindow`、GM API、userscript metadata 或执行时机。

### M2：Domain Contract、Snapshot 和 Adapter

目标：业务代码不再直接依赖 EA 模型对象。

范围：

- 定义 `InventorySnapshot`、`ItemRef`、`Requirement`、`SelectionPlan`、`SquadPlan`、`SubmissionResult`、`OpenPackReceipt`。
- 建立 EA Repository、SBC Service、Pack、DOM、FSU、Storage Adapter。
- Adapter 把 EA 对象转换成稳定快照；需要执行操作时用稳定引用回查实时对象。
- 建立 Fake Adapter 和 contract tests。

验收标准：

- 新模块中只有 `adapters` 可以访问 `W`、EA Service、Repository 和 Controller。
- Snapshot 可序列化为 fixture。
- 同一个 fixture 在 Node 测试和浏览器 shadow mode 中产生一致分类结果。

回滚条件：快照丢失 duplicateId、definitionId、交易状态、特殊卡或 Challenge 动态要求等必要信息。

### M3：统一 Selection API

目标：所有库存型和评分型 SBC 使用同一个 Selection Contract。

范围：

- 把当前 `selectInventoryPlayers()` 改为纯函数。
- 配置加载阶段完成 loopDef/requirement 规范化。
- 将评分求解器接入 `mode: 'rating'`。
- 输出统一 diagnostics 和 duplicate signal 信息。
- shadow 对比旧 `selectInventoryPlayers()`、`selectLoopInventoryPlayers()` 与新结果。
- 迁移完成后删除 `selectLoopInventoryPlayers()`。

验收标准：

- 所有当前 Loop fixture 的选卡结果满足现有保护规则。
- 82+、特殊卡、FSU Lock、Only Untradeable、联赛、Evolution 和 Golden Player Range 测试通过。
- 同 definition 不重复、已消耗物品不重选、Transfer/Unassigned signal 正确解析。
- 评分求解器性能测试不低于当前 `0.4.43` 基线。

回滚条件：新旧选择不一致且无法由明确的 Bug 修复或规则变更解释。

### M4：统一 SBC Submission Transaction

目标：所有库存、评分和 FSU 阵容通过同一提交事务执行。

范围：

- 实现 `submitSbcAttempt()`。
- 提供 Inventory、Rating、FSU 和 Existing Squad Provider。
- 提供标准页面和后台评分提交 Transport。
- 统一保存前、保存后和最终提交前校验。
- 统一 consumed item 标记、Challenge 完成检测和 Reward result。
- 先迁移低风险单次 `2x84+ Fodder`，再迁移 Player Pick 子阵和评分 SBC。

验收标准：

- `prepareInventorySelection()` 和 `saveChallengeSquad()` 的能力被事务内部复用，不再由 Workflow 拼装。
- 保存后实际阵容变化会被检测并停止。
- Player Pick 保护、动态评分条件和特殊卡要求仍作为独立 validator 生效。
- Dry Run 复用相同 SquadPlan 和 validator，但不保存和提交。

回滚条件：任何 Loop 出现未校验提交、重复提交、错误 Challenge 或奖励丢失。

### M5：统一 Unassigned Resolver

目标：删除 Loop 专属清理器，统一处理容量、保留和恢复。

范围：

- 实现纯 `planUnassignedActions()`。
- 实现有副作用的 `resolveUnassigned()`。
- 将 `reserveItem`、routing policy 和 ordered overflow resolvers 参数化。
- 实现进度指纹、最大迭代次数、递归保护和结构化停止原因。
- 建立按卡种匹配的顶层 `recoveryRecipes` / `unassignedRecoveryPolicies` 配置；默认覆盖铜、银、普金和稀有金。
- 删除 `clearMixedUpgradeUnassigned()`；迁移完成后删除旧 `clearUnassigned()`。

关键场景：

- Transfer 满、Storage 未满。
- Storage 满、Transfer 未满。
- 两者都满。
- 可交易重复、不可交易重复、可 Swap 重复混合。
- Daily Bronze/Silver 已完成但存在目标重复卡。
- Bronze/Silver overflow 按配置尝试单卡 SBC、Daily Common、11 卡 SBC。
- Resolver 无进展时安全停止，不得死循环。
- 恢复阵容必须消费至少一张当前 blocked Unassigned duplicate；FSU、锁卡、特殊卡和 82+ 保护不得绕过。

验收标准：

- Unassigned 模块中没有任何具体 Loop 或 SBC 名称。
- 当前失败日志中的 Storage `3/8` 场景可恢复或给出明确 blocked result。
- 重启 One-click Daily 能从已有 Unassigned 状态继续。

回滚条件：Resolver 会递归、重复消费、误搬保留材料或继续开包扩大阻塞。

自动化进展：配置化恢复执行器、trigger-priority selection、recipe/policy 引用校验和 Storage `2/4` 铜卡回归测试已完成。真实 EA 页面仍需验证 Daily Bronze/Common 已完成时可回退到 11 卡 Bronze Upgrade，并在提交后由指纹变化继续 One-click。

### M6：统一 Pack Transaction

目标：所有普通 Pack 和 SBC Reward Pack 通过一个公共事务。

范围：

- 实现 `openPackTransaction()`。
- 合并查包、前置 Unassigned、开包重试、响应标准化、物品路由和缓存刷新。
- 将当前 `materializeOpenedPlayerRewards()`、`handleRecyclePackItems()`、`handleProvisionPackItems()`、`handleRarePackTo84Items()` 改为 policy 或 classifier。
- 保留 Player Pick 为独立 Reward 类型。
- 增加 404、471、500、stale pack、响应先于缓存、页面不可见 Unassigned 等 contract tests。

验收标准：

- 除 Adapter 外不存在直接 `pack.open()`。
- 每个 Pack Workflow 都能返回结构化 receipt，包括 opened items、reserved、routed、pending 和 retry 信息。
- 开第二包前必须依据 receipt 和当前容量重新决策。
- 页面 UI 未显示但响应中存在的重复卡不会丢失。

回滚条件：任何现有 Pack 类型无法通过统一事务表达，或统一事务吞掉未处理物品。

### M7：Workflow 分批迁移

目标：Loop 只负责编排和传参，不再实现底层能力。

迁移顺序：

| 子阶段 | Workflow | 状态 | 原因 |
| --- | --- | --- | --- |
| M7.1 | Daily Common / MVP | Complete | 自动化和 One-click Live 完成 |
| M7.2 | Daily Bronze / Silver / MVP | Complete | 自动化和 One-click Live 完成 |
| M7.3 | Daily Rare | Complete | 自动化和 One-click Live 完成 |
| M7.4 | Daily Rare Pack to 2x84+ | Complete | 多包、恢复和 transient signal Live 完成 |
| M7.5 | Player Pick | Complete | 独立/Provision Pick、价格 fallback 和 recap Live 完成 |
| M7.6 | Provision Crafting | Complete | 三轮、partial Pick、FOF 和 2x84+ Live 完成 |
| M7.7 | 84+ TOTW / 84x10 / 2x84+ | Complete | 动态评分、奖励和安全 Stop Live 完成 |
| M7.8 | One-click Daily | Complete | 完成阶段跳过、剩余次数和恢复 Live 完成 |
| M7.9 | Shared crafting / Bronze Validation cleanup | Complete | Provision 和 Bronze Validation 共享路径已复验；Rare Pack 已有多包/恢复 Live 与自动化覆盖，当前源包耗尽仅作为非阻塞补验 |

每个子阶段必须完成：

1. 将旧 Workflow fixture 作为 characterization tests。
2. 新 Workflow 先在 shadow mode 生成计划并与旧逻辑比较。
3. MVP/单次 Loop live 验证。
4. 完整 Loop live 验证。
5. 删除该 Workflow 内已经不再使用的重复底层代码。
6. 更新本文档和 README。

M7 完成后应删除或降级为声明式 Workflow 的旧函数：

- `runInventoryMixedUpgrade()`
- `runCommonGoldToRareUpgrade()`
- `submitReservedDuplicateUpgrade()`
- `runRarePackTo84Upgrade()`
- `runDailySingleCardRecycle()`
- `runProvisionPackCrafting()`

`runPlayerPickSbc()`、`runFillAndVerifySbc()`、`runDailyRoutine()` 可以保留高层 Workflow 名称，但内部只能调用公共服务。

验收标准：所有 Loop 测试矩阵通过，且 Workflow 层无 EA/FSU/DOM 直接访问。

### M8：清理、回归和正式切换

目标：删除旧路径并建立长期防回归门槛。

范围：

- 删除 feature flag、shadow compare 和旧实现。
- 删除重复 Dry Run 路径；Dry Run 使用同一 Planner，只禁用副作用 Executor。
- 全量更新 README、配置文档和函数索引。
- 增加 CI 和发布检查。
- 完成并记录受影响流程的真实页面验证。

验收标准：

- `npm test`
- `npm run test:contracts`
- `npm run test:architecture`
- `npm run build`
- `node --check dist/DailyLoopRunner.user.js`
- JSON 配置解析和 built-in/external config 一致性检查
- `git diff --check`
- 所有 MVP、完整 Loop、暂停恢复和容量边界真实页面验证通过

正式切换条件：连续多次真实运行无旧路径回退需求，且远程合并后完整测试仍通过。

### M9：动态 Player Pick SBC 发现

Status: In Progress

目标：插件自动扫描当前 EA 会话中可用的 Player Pick SBC，生成临时 loop 入口供用户选择，不再要求每个新 Pick 都先发布静态脚本配置。

范围：

- 从当前 `SBC.repository.sets` 和 Challenge 模型扫描未完成、奖励类型为 Player Pick 的 SBC。
- 动态读取 Set/Challenge id、剩余次数、Challenge 数量和 `eligibilityRequirements`。
- 将可识别的球员数量、金银铜等级、普通/稀有、评分上限和特殊卡条件转换为标准 `requirements` / `challengeRequirements`。
- 从 Set/Challenge reward metadata 提取 Player Pick 的稳定 item/resource 标识、显示名称、候选数和可选数量，避免使用宽泛名称误领其它 Pick。
- 将扫描结果作为只存在于当前会话的 discovered loop 合并到下拉列表，并与内置/外部 JSON loop 按 Set id 和奖励标识去重。
- 提供手动 Refresh；活动过期、Challenge 完成或 EA Repository 更新后移除失效入口。
- 不支持或无法完整解释的动态条件显示为不可运行并输出诊断，不得猜测材料比例或跳过 EA 条件。

验收标准：

- 单 Challenge 和多 Challenge Pick 都能生成正确的动态配置。
- 普金/稀有金比例、人数、评分与特殊卡要求和 EA 模型一致。
- 同时存在多个 84+ Player Pick 时能通过稳定奖励标识准确领取目标 Pick。
- 静态 Pick、外部 JSON Pick 和动态发现 Pick 不重复显示。
- Node fixture 覆盖已支持、条件不支持、奖励标识缺失、活动完成和 Repository 刷新场景。
- 动态发现只负责生成配置，实际选材、提交、价格查询、自动/人工选择和 recap 继续复用现有 `playerPickSbc` Workflow。

回滚条件：无法稳定识别奖励 Pick、动态条件转换不完整，或扫描结果可能导致错误 SBC/奖励被提交或领取。

当前进度（2026-07-19）：

- 新增 `src/config/player-pick-discovery.js` 纯解析层，只接受普通 Set/Challenge/Reward 快照；支持单/多 Challenge、全金卡及精确 common/rare 比例，并生成现有 `playerPickSbc` 配置契约。
- 新增 `src/adapters/ea/sbc.js#snapshotDiscoverySet()` 只读快照转换，识别 EA `awards[].item.isPlayerPickItem()`、缓存 Challenge、formation 人数和 `eligibilityRequirements`；不请求、不提交、不操作 UI。
- 缺少稳定 Set/奖励身份、候选数、选择数、人数、全金卡条件或精确 rarity 比例时返回 `unsupported`；评分、化学、联赛、国家、俱乐部和未知 rarity 编码当前同样拒绝，不从 SBC 名称推断。
- fixture 和 parser unit tests 覆盖单 Challenge、多 Challenge、混合比例、已完成、奖励身份缺失、不支持条件、未知 rarity、稳定身份去重、会话列表替换、旧选择回退和 Custom JSON 选择保留；Adapter contract test 覆盖真实 EA 方法型对象归一化。
- 扫描保持只读；完全支持且不与静态配置重复的结果会作为当前会话 Loop 接入下拉列表，成功重扫会整体替换旧会话结果，完成、过期、不支持或消失的动态入口不会残留。实际运行继续复用现有 `playerPickSbc` Workflow。
- `0.5.08` 在 Options 增加只读 `Scan Picks`：刷新 SBC Sets，按奖励对象识别 Pick，读取 Challenge 元数据，并把稳定 ID、候选/选择数量、人数、eligibility 和 unsupported 原因写入现有日志；结果不合并到 Loop 列表，也不会提交或领取。
- `0.5.08` 实盘扫描确认：83+ Set `#1188` / reward `5004333`，82+ Set `#1202` / reward `5005706`，84+ Summer Set `#1240` / reward `5005726`。EA 用 `PLAYER_RARITY_GROUP=4` 表达稀有组；83+ 初次显示 11 人是未加载 squad 时错误使用 formation 槽位数，不是实际材料要求；84+ 的直接 Challenge DAO 返回 `521`。
- `0.5.09` 支持已确认的 rarity group 4，逐个只读加载 Challenge squad 后用 brick/required-player 信息计算真实人数，禁止从未加载的 11 槽 formation 猜人数；DAO Challenge 列表失败时回退标准请求，并输出奖励对象各层的受控字段摘要继续定位候选数和选择数字段。
- `0.5.09` 实盘诊断确认 EA 奖励对象没有独立候选数/选择数字段，但 `staticData.description` 提供官方 `1 of 5`、`5 of 10`、`1 of 3` 前缀；解析层只从该官方奖励描述或显式字段读取数量，仍禁止从 SBC 名称推断。
- `0.5.10` 在启动后自动扫描，并保留 Options 中手动 `Scan Picks`；完全支持的未知 Pick 以精确 Set/奖励 ID 生成会话 Loop，静态 83+/84+/82+ 按精确 ID 去重。扫描、刷新、加载配置和 Start 互斥，避免扫描重绘列表时启动旧选择。
- `0.5.11` 增加默认关闭的 `Use scanned Pick metadata` 验证选项。启用后立即重扫；完整且只匹配一个静态 Pick 的结果会覆盖当前会话中的 Set/奖励身份、Challenge 数量和材料比例，同时保留静态 Loop ID、名称、运行限制和 Provision `preCraftPlayerPickLoopId`。扫描失败、活动完成、unsupported 或多重匹配时继续使用静态回退；未知支持 Pick 的会话入口逻辑不变。
- `0.5.11` 实盘验证通过：83+ 与 84+ 均先用扫描覆盖完成 Dry Run，严格选择 4 张低分普通稀有金；随后 Live 完成精确 Set/奖励领取、FUTNext 价格、自动 Pick 和 Unassigned 清理。83+ 领取 1/5，84+ 领取 1/3，结束均为空。
- `0.5.12` 从内置和外部 JSON 删除 83+/84+ 的静态活动配置及静态场景登记；两者只在扫描成功且条件完整时生成会话 Loop。82+ 静态配置继续保留，Provision `preCraftPlayerPickLoopId` 不变；其多 Challenge 动态覆盖等待活动重新可用后实盘验证。
- `0.5.13` 为直接运行的 Player Pick Loop 增加可持久化的 `Open Picks at end` 选项。开启后，同类型的已有 pending Pick 计入 `rounds` 上限，后续提交期间通过稳定奖励身份保留，达到上限、活动完成或材料不足后集中领取；其它 pending Pick 继续安全阻断。Provision 前置 Pick 保持原有即时领取流程。
- `0.5.14` 明确区分业务终止条件与 UI `rounds`：One-click/正式 Daily 使用 EA 实时剩余次数；One-click 内部的 Daily Rare Pack 开完全部匹配来源包后最多运行一次 2x84+ 库存兜底，不读取 UI `rounds`。独立 Daily Rare Pack 则以 `rounds` 为 2x84+ 最低目标，先开完全部来源包并累计其提交数，再从库存补足差额；清理来源包重复卡允许超过目标，库存兜底不得超额。Daily MVP 继续保留单次验证上限，独立 Player Pick、2x84+ Fodder、84+ TOTW 等可重复 Loop 仍可用 `rounds` 控制本次完成数，Provision 用它控制来源包数。`Open reward packs` 统一控制 Rare Pack 与独立 2x84+ 奖励。
- `0.5.14` 将静态 `5 of 10 82+ Players Pick` 标记为限次 Set：运行前读取 EA `timesCompleted/repeats`，按“pending Pick + Set 剩余次数”执行到耗尽，移除 `rounds` 与 `maxCompletions` 配置并隐藏 UI 输入。其它显式 `useRoundsAsCompletions` 的不限次/用户限量 Pick 保持原行为。
- `0.5.16` 为所有 Runner 开包路径增加统一 Reward Highlight 事件：默认识别 `94+` 特殊卡，立即显示非阻塞 Toast/烟花，并可选通过 `GM_notification` 或 ntfy 批量通知。通知配置位于独立 Settings 弹窗，凭证使用 Tampermonkey 隔离存储；提示和网络失败不会阻断 opened-item policy 或 Unassigned 清理。Player Pick recap 继续保留，并与开包 Highlight 共用通用烟花模块。
- `0.5.17` 增加独立 Batch Open Packs 工具：扫描 `My Packs`、持久化用户选择的包类型与数量、逐次重新解析 live pack instance，并统一调用现有 `openPack()`、Reward Alerts 和 `createMaterializeAndResolvePolicy()`。结束 recap 逐张列出特殊卡、按评分聚合其它普通金卡并整体降序；Preview 不产生 EA、Desktop 或 ntfy 副作用。配置、Workflow、recap 模型、弹窗、主面板命令和架构调用点均有自动化测试。
- `0.5.18` 修正 Batch Open 在 Storage 满时丢失已开包回执并重复执行 final cleanup 的问题。单包 opened-item policy 会先尝试现有通用恢复配方，仍失败时安全保留无法移动的 Unassigned，高分/FSU 保护不变；已打开包进入 recap，剩余包停止。启动前也会以相同模式检查已有 Unassigned，阻塞未解除时不会打开新包。
- `0.5.19` 将 Batch Open 的 My Packs `Add` 改为单按钮下拉菜单，支持 `Add 1` 和 `Add all (N)`；已加入项可用 `Added v` 快速重设为 1 或当前全部数量，并保持原有 Batch list 顺序和即时持久化。
- `0.5.20` 扩展 Batch Open recap：特殊卡逐张查询并显示 FUT.GG/FUTNext 实时价格；非特殊 Gold、Silver、Bronze 球员按评分、Rare/Common 和卡色分别聚合，同评分不混合。价格失败显示 `price:?`，不影响已完成开包结果或 recap。
- `0.5.21` 将 Batch Open 的 `Add all` 从数量快照改为持久化动态 `all` 模式。弹窗按当前 My Packs 显示实时数量，Start 前再次刷新并物化执行计划；库存增减会自动跟随，当前为 0 的类型安全跳过。旧的固定数量配置保持兼容。
- `0.5.22` 小步安全修复：`protectHighGold` 支持可配置 `highGoldThreshold`（去掉 inventory/entry 硬编码 82）；日志 renderer 默认 HTML escape；主脚本 metadata 移除 localhost `@connect`（仅 Hot Reload 保留）。

Live validation: `1 of 5 83+ Player Pick` 和 `1 of 3 84+ Summer Tournament Nations Player Pick` 的静态 Workflow 与 `0.5.11` 扫描覆盖模式均已真实提交并领取通过，因此 `0.5.12` 删除两者静态配置。`5 of 10 82+ Players Pick` 当前已全部完成，暂时无法复验动态多 Challenge/Provision 引用，不记为失败并继续保留静态配置。

`0.5.12` 启动扫描实盘确认：83+/84+ 各输出一条 `added session Loop`，最终为 `2 supported session Loop(s) added`、`0 configured Loop(s) using scanned metadata`、`0 static/discovered duplicate(s) skipped`。两者纯动态入口不重复，静态配置删除后的会话列表行为通过。

Next: M9 继续作为独立功能迭代。82+ 等多 Challenge Pick 后续重新可用时，启用 `Use scanned Pick metadata` 验证 Provision 固定 Loop ID 在扫描覆盖下仍能正确完成前置 Pick；实盘通过前不删除 82+ 静态配置。评分、化学和特殊卡等复杂 Pick 条件继续保持 unsupported，直到有明确模型与测试支持。

## 7. 全量测试矩阵

每个 Workflow 至少覆盖以下维度中适用的组合：

| 维度 | 场景 |
| --- | --- |
| SBC 状态 | 全部未做、部分完成、全部完成、Challenge 暂时不可用 |
| Unassigned | 空、非重复、可交易重复、不可交易重复、可 Swap、缓存延迟 |
| 容量 | 正常、Transfer 满、Storage 满、两者都满 |
| 材料 | 正好、少 1、完全不足、只有 Club fallback、存在已消耗缓存 |
| Pack | 正常、缺失、多包同名、404、471、500、stale cache、响应先于 UI |
| 保护 | 82+、特殊卡、Tradeable、Loan、Evolution、FSU Lock、联赛过滤 |
| 操作模式 | Dry Run、Live、Stop、重新 Start、刷新后恢复 |
| 奖励 | 自动开、保留、未入库、Player Pick 待选择、需要人工介入 |

Loop 最低场景要求：

| 场景组 | Loop | 最低专项场景 | Fixture | Test | Live |
| --- | --- | --- | --- | --- | --- |
| T-DAY-01 | Daily Bronze/Silver | 目标重复、Daily 完成、overflow fallback、最后奖励不打开 | Complete | Complete | Complete |
| T-DAY-02 | Daily Common | 5+5、铜缺、银缺、两者缺、第一包后容量不足、Club fallback | Complete | Complete | Complete |
| T-DAY-03 | Daily Rare | Unassigned/Storage/Transfer 优先、11x Pack、Club 最后 fallback | Complete | Complete | Complete |
| T-RPK-01 | Rare Pack to 2x84+ | 多包连续、5 张重复恢复、页面缓存不可见、高分保护 | Complete | Complete | Complete |
| T-PCK-01 | Player Pick | 严格 rarity 比例、多 Challenge partial、价格缺失、人工选择 | Complete | Complete | Complete |
| T-PRV-01 | Provision | 无重复不做 Pick、部分 Pick、动态 stage、跨 round 恢复 | Complete | Complete | Complete |
| T-RAT-01 | 84+ TOTW | 动态评分、最低评分组合、无 special、奖励必须打开 | Complete | Complete | Complete |
| T-RAT-02 | 84x10 | 动态人数/评分/特殊卡、自动 TOTW、自动 2x84+、奖励保留 | Complete | Complete | Complete |
| T-RTN-01 | One-click Daily | 已完成阶段跳过、剩余次数、阶段失败后重新 Start | Complete | Complete | Complete |

`Fixture` 表示已保存可重复输入，`Test` 表示自动化测试通过，`Live` 表示在真实 Web App 完成对应 MVP/完整流程验证。每次 Bug 修复应在所属场景组下增加更具体的测试用例 ID，例如 `T-DAY-02-007`，不得只修改已有断言来适配新实现。

## 8. 架构测试规则

建议通过 ESLint restriction、依赖图或简单 AST 测试锁定以下规则：

- `workflows` 不得导入 `adapters/ea-*`、DOM 或 Tampermonkey API。
- `selection`、`domain` 不得访问 `window`、`document`、`unsafeWindow`。
- 只有 Pack Adapter 可以调用底层 `pack.open()`。
- 只有 SBC Adapter/Transport 可以调用 `saveChallenge()` 和提交 API。
- 只有 Unassigned Executor 可以执行通用 pile move/swap。
- Dry Run 不得调用任何带副作用的 Adapter 方法。
- UI 不得直接操作 Repository、SBC 或 Pack。

## 9. 进度记录模板

每次实施提交后，在对应 Milestone 下追加：

```text
Status: In Progress | Blocked | Complete
Commit: <hash> <subject>
Scope: 本次迁移内容
Tests: 新增和执行的测试
Live validation: 实际验证的 Loop 和结果
Known gaps: 尚未覆盖的边界
Next: 下一步工作
```

完成一个 Milestone 时必须同时记录：

- 最终提交范围。
- 新增测试数量和覆盖的 Loop。
- 删除或保留的旧路径。
- 实际页面验证结果。
- 回滚点或发布 tag。

## 10. 当前追踪记录

### M0

Status: Complete

Scope: 建立 npm、Vitest、esbuild、VM userscript harness、配置/架构检查和可复用 fixture；登记全部 19 个内置 Loop 的 normal/recovery 场景。

Tests: 6 个测试文件、23 个测试；覆盖配置、Daily 编排、比例选材、82+ 和特殊卡保护、FSU Lock/Only Untradeable、duplicate signal、My Packs 数量、Storage `3/8` overflow、Daily set 进度和评分校验。

Live validation: 本阶段不改变线上业务逻辑，因此未要求新的实盘提交；构建产物保留原版本 `0.4.43`。

Known gaps: Workflow 场景目前是 fixture/contract 登记，M2 Fake Adapter 完成后逐步升级为可执行 Workflow 测试。

Next: M1 多文件源码和构建边界。

### M1

Status: Complete

Scope: 建立 `src/userscript-entry.js`，抽出 runtime 配置、对象工具和 EA 评分公式；esbuild 同时生成根目录兼容 userscript 和 `dist` 发布文件。

Tests: `npm run verify` 全部通过；根目录与 `dist` 产物字节一致，metadata 和版本均为 `0.4.43`。

Live validation: 热加载仍使用根目录 `DailyLoopRunner.user.js`，路径和 metadata 未改变。

Known gaps: 大部分业务仍在单一 entry 文件内，后续按 M2-M7 迁移。

Next: M2 Domain Contract、Snapshot 和 Adapter。

### M2-M6

Status: Complete

Scope: 建立可序列化 `ItemRef`、Inventory/Selection/Squad/Submission/OpenPack 契约；增加 EA/Fake Adapter；统一 requirements/rating Selection、SBC Submission、Unassigned Resolver 和 Pack Transaction。入口层继续负责把稳定契约解析为当前 EA 实体，并注入页面副作用。

Tests: contract、pure selection、rating、Unassigned、Pack、Submission 和架构测试通过；旧 selector/评分求解器已由固定回归 fixture 取代并删除。Submission Transaction 支持 `planned`、`prepared`、`submitted` 和结构化 blocked/unavailable 结果。

Live validation: 本轮未在真实 EA Web App 执行新的提交；原有线上日志只作为行为基线，不作为本次重构实盘验收。

Known gaps: EA/FSU/DOM 适配桥仍集中在 `src/userscript-entry.js`；只有当新的边界测试和实盘验证覆盖后，才继续拆到专用 adapter 文件。

Next: 验证共享事务在真实页面的行为并记录结果。

### M7

Status: Complete

Scope: Daily Common/Rare 迁移到 `supply-and-craft`；Bronze/Silver 迁移到 `recycle`；Rare Pack/Provision 迁移到 `pack-and-craft`；Player Pick、评分 SBC 和 One-click 分别迁移到 `player-pick`、`repeated-submission` 和 `sequence`。旧专用 runner 已删除，旧 strategy 名只保留为外部 JSON 兼容别名。

Tests: 9 个 Workflow 测试文件覆盖正常、blocked、resume、stale、remaining count、transient signal、validation round、strategy dispatch 和 Dry Run；完整测试当前为 60 个测试文件、321 个测试。`workflows` 无 EA/FSU/DOM 直接访问。

Live validation: 主要生产路径已完成真实页面验证：One-click Daily、Rare Pack 多包恢复、Player Pick、Provision 三轮、2x84+、84+ TOTW、84x10 和安全 Stop 均有成功日志。`0.5.07` 的 One-click Daily、Provision 和 Bronze Upgrade Validation 共享路径已再次验证通过。Daily Rare Pack to 2x84+ 已有多包、恢复和 transient signal 成功日志；当前账号源包耗尽只影响再次抽样，不否定已完成验收。M7.1-M7.9 均为 Complete。

Known gaps: `submitReservedDuplicateUpgrade()`、`runReservedDuplicateUpgradeDryRun()` 和 `runValidationBronzeUpgradeDryRun()` 已删除；Provision/Rare Pack 共用 `runReservedDuplicateCraftingWorkflow()`，Bronze Validation 的 Dry/Live 共用 `runValidationRoundWorkflow()`。历史自定义 JSON 的三个兼容 strategy 名继续映射到新 Workflow；这是明确的兼容策略，不是未完成迁移。后续重新获得匹配源包时可补做 Daily Rare Pack 当前版本抽样，但它是维护回归项，不阻塞 M7。

Next: 无阻塞工作。后续获得匹配源包时按维护回归流程补做 Daily Rare Pack 抽样，遇到新 Bug 时增加对应 fixture/test。

### M8

Status: Complete

Scope: 删除旧 selector、旧评分求解器、重复 Dry Run 调度器、旧命名兼容 helper 和无调用 entry helper；统一 child Workflow 结构化结果与 strategy dispatch；增加模块边界/死代码测试、GitHub Actions、生成产物检查、真实页面验收要求和新架构 README。内置 Loop、MVP/disabled pile 展示规则、One-click 子配置、Live/阶段运行上限、运行时选项及完整配置 schema 已迁入 `src/config` 纯模块。

Tests: `npm run verify`、`npm run test:contracts`、`npm run test:architecture`、构建产物一致性和 `git diff --check` 均纳入本地/CI 流程。

Live validation: 主要 MVP/完整 Loop、暂停恢复和已遇到的容量边界已完成；`v0.4.48` 还验证了页面型 SBC 奖励确认不再固定等待 25 秒。

Known gaps: 兼容 strategy 名暂不删除，以免破坏用户历史 JSON；Inventory/Pack/SBC/Player Pick/FSU/Localization 和 DOM/Storage/HTTP/Page Runtime/Wait/User Effects 已通过 `createRuntimeAdapters()` 接入。Inventory Adapter 负责四个 pile、容量、刷新、move、enum 和 purchased item 准备；Pack Adapter 负责 My Packs、实例解析、`Store.getPacks()` 和 `pack.open()`；SBC Adapter 负责 Set/Challenge/DAO/formation/controller/submission settings/save/submit；Page Runtime/Wait 负责 Controller 状态及 predicate/loading/observable 等待。Reward 纯逻辑及 FUT.GG/FUTNext fallback 已迁入 `src/reward`；评分 Challenge 模型、候选构建、纯搜索和计划回解位于 `src/selection`；strategy dispatch 位于 `src/workflows/dispatch.js`；Player Pick EA 操作位于 Adapter，人工 Pick、recap 和 SBC 页面覆盖层位于 `src/ui`；主面板视图、几何、绑定、command 和状态投影也已迁入 `src/ui`；FSU 纯兼容解析和 runtime discovery 已分别迁入 config/Adapter。entry 已无直接 `W.*`、EA Repository/Service/enum、Clipboard 或 download API 访问，保留 Runtime composition、缓存合并、评分候选安全策略桥和注入共享 Workflow 的真实页面副作用回调。当前架构测试锁定共享模块不得访问运行时全局、锁定所有 EA/页面 runtime 直接调用点，并拒绝无调用顶层 entry helper。

Next: 无阻塞工作。不再为减少 entry 行数机械拆分有副作用的页面回调；后续只在明确职责、测试和实盘证据支持时继续提取模块。

### 2026-07-19 收尾审计

Status: Complete

Scope: 核对重构计划、模块依赖、共享事务调用点、Live 日志和测试框架。所有开包统一经过 `openPackTransaction()`，所有 Unassigned 处理统一经过 `resolveUnassigned()`，requirements/rating 选材统一经过 `selectInventoryPlayers()`，页面/后台/FSU/Inventory 提交统一经过 `submitSbcAttempt()`。旧的 Daily Common、Daily Rare、Daily Single Card、Rare Pack、Provision、Player Pick、Fill-and-Verify 和 Daily Routine 专用 runner 名称已删除。

Tests: `npm run verify` 当前覆盖 60 个测试文件、321 个测试；架构边界要求 `config/pack/reward/sbc/unassigned/ui` 与既有 `domain/selection/workflows` 一样不得访问 `window/document/unsafeWindow/W/services/repositories` 或直接导入 adapters，并锁定 Pack、SBC、Player Pick、Inventory、Localization、HTTP、FSU 和 Page Runtime 调用点。新增测试锁定 Wait Adapter 的 predicate/readiness/loading/observable 语义、Clipboard/download fallback、主面板 command guard、Player Pick recap、SBC reward/error overlay、Claim/进度/Pack/AltRight/超时奖励确认、通用 DOM 点击/键盘序列、动态评分模型解析/校验、评分 duplicate signal/definition 去重/stale 回解、Live/One-click 执行策略、Daily 实时剩余次数、MVP 单次上限、运行时 Pick/rounds/openRewardPacks 投影、strategy dispatch、entry 死代码、动态 Player Pick discovery、会话列表替换、静态覆盖/回退/歧义拒绝、Provision 引用保持、扫描互斥、只读扫描编排与配置 schema 的精确错误信息和兼容容器。

Live validation: One-click Daily、Rare Pack、Provision、Player Pick、2x84+、84+ TOTW、84x10、Stop 和 Claim Rewards 提前确认均已通过真实日志验证。`0.5.12` 还确认删除 83+/84+ 静态配置后，两者分别作为唯一动态会话 Loop 加入列表，最终扫描摘要为 2 added、0 override、0 duplicate。

Known gaps: 不能宣称“物理上彻底拆分”。`src/userscript-entry.js` 当前约 7,202 行并承担 composition、缓存合并、评分候选安全策略桥、真实页面副作用回调和页面语义 helper；这是本轮收尾时保留的运行时组合边界。Runtime Adapter 已覆盖 Inventory/Pack/SBC/Player Pick/FSU/Localization/DOM/Storage/HTTP/Page Runtime/Wait/User Effects，entry 已无直接 `W.*`、EA Service/Repository/enum、Clipboard 或 download API 访问。场景 fixture 已登记全部静态 Loop，但不是每个 Loop 都有独立的浏览器级端到端自动化模拟；Node 自动化与真实页面抽样继续共同承担回归验证。

Release conclusion: 核心架构重构在 `0.5.12` 收尾。所有开包、Unassigned、选材和提交分别统一经过公共事务；旧专用 Workflow、重复 Dry Run 和直接 EA/page global 调用已清理或收敛到 Adapter。`npm run verify` 当前覆盖 60 个测试文件、321 个测试，18 个内置/外部静态 Loop 配置一致，根目录与 `dist` 发布文件相同。主要生产 Loop、恢复路径和动态 83+/84+ Pick 均有真实页面验证。M7、M8 与本次收尾审计关闭；M9 保持独立 In Progress，只追踪 82+ 多 Challenge/Provision 动态覆盖和未来复杂 Pick 条件。
