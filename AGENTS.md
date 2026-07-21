# Daily Loop Runner AI Agent Engineering Guide

本文件是 AI agent 和维护者处理本仓库任务时的首要工程说明。它描述当前真实实现，而不是最终理想状态。

开始任何代码任务前，先读取：

1. 本文件。
2. 用户提供的完整日志和截图。
3. [REFACTORING_MILESTONES.md](REFACTORING_MILESTONES.md) 中相关 Milestone 和已知缺口。
4. `git status --short`、最近提交和当前 diff，避免覆盖未提交的正确行为。

## 1. 项目目标与安全原则

Daily Loop Runner 是 EA FC Web App 的 Tampermonkey 自动化脚本，运行时依赖 EA 页面模型、FSU 和 FC26 Enhancer。它处理高价值账号库存，因此正确性优先于继续运行。

必须遵守：

- 无法确认 SBC、Challenge、奖励或材料身份时停止。
- 不得为了让流程通过而放宽高分卡、特殊卡、FSU Lock、Only Untradeable、联赛或 Evolution 保护。
- 不得把 Transfer/Unassigned duplicate signal 当成可以直接提交的实体；必须解析到 Club/Storage 中真实可提交的对应卡。
- 开下一包、提交下一阵或进入下一阶段前，必须确认当前 Unassigned 和页面状态已经取得进展。
- 修复当前状态时，优先保证用户更新脚本后可以重新点击同一个 Loop 继续，而不是要求清空状态重来。
- 共享底层改动必须评估全部调用方；越靠近 Adapter、Selection、Pack、Unassigned、SBC Transaction，修改越慎重。
- 没有测试覆盖的线上 Bug，应先添加最小 fixture 或失败测试，再修实现。
- Node 自动测试不能替代真实 Web App 验证。

已经在真实页面确认、不得回退的运行时事实：

- FSU 是普通金材料策略的权威来源。Only Untradeable、排除联赛、Exclude Evolution、Golden Player Range、Storage 优先和 Lock player 必须跟随；Runner 不得为了凑够材料绕过这些过滤。评分型 SBC 可以不使用 FSU 页面一键填充，但候选仍必须经过 FSU 过滤和锁卡检查。
- EA/FSU 的 `loans === -1` 表示无限使用的普通卡，不是 loan。`loans === 0` 或正数才表示受限使用；真实 loan、limited-use、concept、academy enrolled 和 active trade item 都不能提交。
- FSU Lock 不能只匹配单一 `item.id`。身份匹配必须覆盖 item、resource、definition、asset 和 guid 类字段，以及 EA 对象常见的嵌套数据容器。
- 同一 SBC squad 的 `definitionId` 必须唯一；Unassigned/Transfer duplicate signal 只能解析到 Club/Storage 中真实可提交的对应卡。
- 84x10 只能使用 Challenge 要求数量和类型的 requirement special。额外特殊卡、错误特殊卡、超出提交上限的卡和 protected id 必须在保存前、保存后和提交前拦截。

## 2. 运行环境与依赖

### 2.1 浏览器运行时

- Tampermonkey userscript。
- EA FC Web App 页面及其 `unsafeWindow` 中的 repositories、services、controller 和模型对象。
- FSU，用于材料过滤、Lock player、Golden Player Range、Storage 等兼容行为。
- FC26 Enhancer，部分页面和运行环境会与其共同存在。
- Tampermonkey API：`unsafeWindow`、`GM_xmlhttpRequest`、`GM_notification`、`GM_getValue/GM_setValue/GM_deleteValue`。Reward Alert 凭证使用 GM 隔离存储；本地 Hot Reload 通过受控 userscript bridge 转交这些 API，不能改回页面 localStorage。
- 外部价格服务：FUT.GG，失败时回退 FUTNext。

Userscript metadata 位于 `src/userscript-entry.js` 文件开头。新增远程请求域名时必须同步检查 `@connect`。

### 2.2 开发工具

- Node.js 22：本地建议与 CI 保持一致。
- npm：使用 Node 自带版本即可。
- esbuild：将多文件源码打包为单个 IIFE userscript。
- Vitest：Node 环境下的 unit、workflow、contract 和 architecture tests。
- PowerShell：Windows 开发和启动本地服务。
- Python `http.server`：仅用于本地热加载静态文件服务。

### 2.3 环境搭建

仓库的直接 npm 开发依赖只有：

```json
{
  "esbuild": "^0.25.6",
  "vitest": "^3.2.4"
}
```

所有间接依赖已经锁定在 `package-lock.json`。不需要全局安装 esbuild、Vitest 或其它 npm 包，也不要手工选择间接依赖版本。

推荐从干净环境执行：

```powershell
node --version
npm --version
npm ci
npm run verify
```

要求：

- Node 22，至少应使用与当前依赖兼容的现代 Node 版本。
- `npm ci` 必须基于已提交的 `package-lock.json` 安装精确依赖。
- 如果修改 `package.json` 依赖，必须同步更新并提交 `package-lock.json`。
- Python 不是 npm 依赖，也不是构建和测试必需项；只有运行 `StartLoopRunnerDevServer.ps1` 热加载时才需要 `python -m http.server`。
- Tampermonkey、FSU 和 FC26 Enhancer 是浏览器运行时依赖，不由 npm 安装。

主要 npm 命令：

```powershell
npm ci
npm test
npm run test:contracts
npm run test:architecture
npm run build
npm run verify
```

`npm run verify` 是提交或交付前的最低完整验证。

## 3. 源码、配置与发布产物

### 3.1 真正的源码

```text
src/userscript-entry.js
src/**
```

`src/userscript-entry.js` 包含 userscript metadata、Runtime Adapter 组合、命令实现、页面编排和仍未完全拆出的 helper。内置 `LOOP_DEFS`、配置展示和 schema 校验已经迁入 `src/config`；其它 `src` 目录包含已经模块化、可独立测试的领域逻辑、事务、运行时 Adapter 和 UI。

不要假设入口已经完全薄化。当前它仍约数千行，是主要集成层，修改前必须搜索调用方和架构测试基线。

### 3.2 外部配置

`DailyLoopRunner.loops.json` 是可选外部配置，包含：

- `loops`
- `recoveryRecipes`
- `unassignedRecoveryPolicies`
- `defaultUnassignedRecoveryPolicyIds`

内置配置和外部 JSON 的 Loop id 与顺序必须一致。新增或修改内置 Loop 时通常需要同步修改外部 JSON，并更新 `tests/contracts/loop-config.test.js` 或 fixture coverage。

### 3.3 生成文件

以下文件由构建生成：

```text
DailyLoopRunner.user.js
dist/DailyLoopRunner.user.js
```

禁止手工编辑生成文件。构建链路：

```text
src/userscript-entry.js metadata
        +
src/userscript-entry.js body and imported src modules
        |
        v
scripts/build-userscript.mjs
        |
        v
esbuild, bundle=true, format=iife, target=chrome120
        |
        +--> DailyLoopRunner.user.js
        +--> dist/DailyLoopRunner.user.js
```

`scripts/check-dist.mjs` 验证：

- metadata 与源码一致。
- 版本一致。
- 根目录和 `dist` 产物字节一致。

源码行为变更发布时，同步更新：

- userscript `@version`
- `W[APP_KEY].version`
- `package.json`
- `package-lock.json` 根版本
- README 当前版本
- 必要的 Milestone 版本记录

## 4. 架构和依赖方向

期望依赖方向：

```text
Loop configuration
        |
        v
Workflow orchestration
        |
        v
Selection / Pack / Unassigned / SBC / Reward services
        |
        v
Adapters
        |
        v
EA / FSU / DOM / Tampermonkey runtime
```

稳定数据流：

```text
EA objects
-> Adapter
-> serializable Snapshot / Ref
-> pure Planner or Workflow
-> Plan / Result
-> entry integration
-> Adapter side effect
-> refreshed Snapshot
-> progress validation
```

边界规则：

- `domain`、`selection` 和 `workflows` 不得访问 `window`、`document`、`unsafeWindow`、`W`、EA repositories 或 services。
- `config`、`pack`、`sbc`、`unassigned` 和 `ui` 共享模块也不得直接访问运行时全局。
- 低层 EA 调用应集中在 `src/adapters/ea`。
- Workflow 通过回调编排行为，不直接 import EA Adapter 实现。
- Selection 只决定材料计划，不打开页面、保存或提交 SBC。
- Submission 可以拒绝实际保存后发生变化的阵容，但不能静默重新选择另一套材料。

`tests/architecture/module-boundaries.test.js` 和 `tests/architecture/direct-call-sites.test.js` 锁定这些规则。

## 5. 模块职责与影响面

### 5.1 `src/config`

文件：

- `runtime.js`：应用 key、本地配置 URL、UI storage key、运行默认值和 FSU fallback。
- `loops.js`：内置 `LOOP_DEFS`；顺序、id 和关键行为必须与外部 JSON 保持一致。
- `loop-schema.js`：Loop、recovery recipe/policy 的归一化、引用检查和错误信息。
- `loop-presentation.js`：MVP/hidden 可见性和 `disabledPiles` 投影。
- `run-limits.js`：Live guard、One-click 阶段执行策略和安全上限摘要的纯计算；安全上限不得伪装成业务 rounds。
- `routine-steps.js`：One-click 子 Loop 查找、继承、校验、disabled pile 投影，以及 EA 实时剩余次数到子步骤完成数的投影。
- `runtime-options.js`：Dry Run、奖励开包、rounds、Pick 82/90 阈值、是否显示 rounds 和延迟集中开启 Pick 的运行时配置投影。
- `batch-open.js`：Batch Open 持久化计划规范化、稳定包类型 identity、`fixed/all` 数量模式和当前可用数量投影/启动时物化。
- `player-pick-discovery.js`：从标准 SBC Set/Challenge/Reward 快照保守生成临时 `playerPickSbc` 配置；条件不完整时只返回诊断，不从名称猜测。
- `fsu-compat.js`：FSU/Enhancer 嵌套设置、Storage 配置和锁卡身份的纯兼容解析。
- `selection.js`：把 Loop 与 requirement 级别的保护字段规范化为选材输入。
- `recovery.js`：默认 Unassigned 恢复配方和按卡种匹配的恢复策略。

风险：中等。恢复配置会影响所有发生容量溢出的 Loop；运行默认值会影响 UI 或全局行为。

修改要求：

- 配置仍需在 `src/config/loops.js` 内置定义或外部 JSON 中正确引用。
- 修改 schema 时保持现有错误信息和旧数组/对象容器兼容，并更新 `tests/unit/loop-schema.test.js`。
- recovery recipe 必须消费当前 blocked duplicate，不能只是提交无关 SBC。
- 修改恢复顺序时更新 contract tests，并列出需要真实页面验证的容量场景。

### 5.2 `src/domain`

文件：

- `contracts.js`：`ItemRef`、`ItemSnapshot`、`InventorySnapshot`、`SelectionPlan`、`SquadPlan`、`SubmissionResult`、`OpenPackReceipt`。
- `objects.js`：Loop 配置克隆和 plain object 判断。
- `rating.js`：EA squad rating 公式。

风险：很高。Contract 字段或评分公式影响多个模块和 fixture。

修改要求：

- 数据结构保持可序列化和不可变语义。
- 新字段需更新 Adapter、fake、tests 和可能的 fixture。
- 评分公式变更必须有 characterization 和 differential tests。

### 5.3 `src/adapters`

文件：

- `ea/inventory.js`：统一读取四个库存 pile（含 Storage/Transfer 旧模型 fallback），把 EA Item Repository 转换为库存快照，并提供容量读取、pile 刷新、Item move、枚举解析、实时对象查找和 purchased item 准备。
- `ea/pack.js`：统一读取/刷新 My Packs、按 ID/名称解析实例，并且是唯一允许直接调用 pack model `open()` 和 `Store.getPacks()` 的位置。
- `ea/sbc.js`：SBC Set/Challenge/DAO/formation 读取、Squad Controller 构造、后台提交设置和底层 save/submit Adapter；同时提供只读 Player Pick discovery snapshot，未知字段保持为空交由纯解析层拒绝。
- `ea/player-pick.js`：Player Pick 待领取物品读取、跨 pile 重复检查、领取与确认选择。
- `ea/fsu.js`：按 `window.info`、命名/动态 window root、localStorage、sessionStorage 的既有优先级发现 FSU 策略，并合并所有来源的锁卡信息。
- `browser/dom.js`、`browser/storage.js`：DOM 查询/创建/事件构造和浏览器存储接口适配。
- `browser/http.js`：GM/fetch GET transport、Cookie/Header/timeout 和本地热加载 fallback。
- `browser/page-runtime.js`：EA Controller 链、名称、导航 Controller、DOM root、loading/popup shield、popup 候选、`gotoUnassigned` fallback、origin 和 FUT readiness；不决定页面导航顺序、奖励业务规则或点击策略。
- `browser/wait.js`：通用 predicate/FUT readiness/loading shield/EA observable 等待，保留 Stop、稳定窗口和超时语义。
- `browser/user-effects.js`：Clipboard、textarea fallback 和日志下载副作用。
- `fake/*`：Node 测试中的副作用替身。
- `index.js`：Adapter 集合工厂。

风险：最高。EA 模型字段变化、ID 解析、容量或 duplicate 状态错误会影响所有 Loop。

修改前必须：

1. 保存真实 EA 对象字段或日志证据。
2. 检查 fake adapter 和 contract tests。
3. 列出依赖该 Adapter 的所有共享事务和 Loop。
4. 不在 Adapter 中加入具体 Loop 名称或业务策略。

### 5.4 `src/selection`

文件：

- `index.js`：统一入口 `selectInventoryPlayers()`；根据 `mode` 分发 requirements 或 rating。
- `inventory.js`：按 requirements、pile、FSU 和保护策略选择普通库存材料。
- `rating.js`：评分型 SBC 最低可行评分向量和同向量来源选择。
- `rating-model.js`：动态 Challenge eligibility 到评分模型的纯解析，以及保存前后阵容的评分/人数/唯一性/特殊卡校验。
- `rating-candidates.js`：通过注入的安全过滤、pile 读取和快照函数构建评分候选，并将纯评分计划回解到实时对象。
- `transient-signals.js`：合并开包响应中尚未稳定出现在 Repository 的 Unassigned signal。

风险：最高。

影响范围：

- requirements 模式：Daily Common/Rare、Player Pick、Provision stages、Rare Pack 2x84+、Unassigned recovery、普通 fill-and-verify。
- rating 模式：84+ TOTW、84x10、自动 TOTW、未来评分 SBC。
- transient signal：Rare Pack、Provision 和任何开包响应早于 UI/Repository 的流程。

核心不变量：

- 同一阵容不能重复使用相同 `definitionId`。
- consumed、protected、loan、limited-use、concept、academy、active trade 和 FSU Lock 必须排除。
- Unassigned/Transfer 只作为 duplicate signal，最终必须解析到真实 submission item。
- requirements 模式严格保持 count、tier、rarity、special 和评分上限。
- rating 模式先最小化评分向量，再比较 pile；不能因 Storage 优先而选择不必要的高分卡。
- rating 模式必须从当前 Challenge 读取人数、TEAM_RATING 和可识别的球员条件；遇到 chemistry 或未知 eligibility key 时停止。
- rating 搜索必须保留 `maxSearchNodes`、`maxSearchMs` 和 `yieldEveryNodes` 等有界限制。大库存下宁可输出诊断并停止，也不能改成无界同步搜索阻塞浏览器。
- 评分型 Live 使用 EA SBC DAO 的后台 Challenge/Squad/submit 集成路径，避免创建可视 squad controller 触发 FSU/Enhancer 页面增强；这不允许绕过 FSU 候选过滤。

修改后至少运行 selection unit、characterization、differential tests 和所有相关 workflow tests。

### 5.5 `src/pack`

文件：

- `open-transaction.js`：统一开包事务、重试、响应标准化和 receipt。
- `opened-item-policy.js`：把已开物品分为 reserved、routed、pending。
- `upgrade-duplicate-routing.js`：升级包重复卡分类。

风险：最高。

影响范围：Daily Bronze/Silver、Daily Common shortage pack、Daily Rare source pack、Rare Pack、Provision、TOTW reward、自动 fodder reward 等所有开包路径。

核心不变量：

- 开包前先处理或明确保留已有 Unassigned。
- 每个开包调用必须提供 opened-item policy。
- response item 与 Repository 延迟必须被 receipt/transient signal 覆盖。
- EA pack response 经常早于 Unassigned cache。成功开包后必须先标准化并处理 response items：按 policy 将非重复、可交易重复、不可交易重复或当前 stage 保留材料分类和路由；然后再处理残留 Unassigned，最后刷新 recent reward/Repository 状态，才允许下一次选材或开下一包。
- 不得把“先清理旧 Unassigned”和“开包成功后的 response materialization”混为同一步。开包后的 response 处理必须先于该奖励产生的残留 Unassigned cleanup，否则下一轮会误报缺料或遗留重复卡。
- 471、500、404 和 stale pack 的重试必须有界。
- 开第二包前必须重新检查 Unassigned 和容量。

任何共享事务改动都需要 pack unit tests、受影响 workflow tests，并在真实页面验证多包流程。

### 5.6 `src/unassigned`

文件：

- `plan.js`：纯规划，按非重复、可交易重复、可 Swap、Storage 的顺序返回动作或 blocked。
- `resolve.js`：执行规划、检查指纹进展、调用 overflow resolver、限制迭代和递归。
- `recovery.js`：把 blocked item 与恢复策略、Selection 和 SBC recipe 连接。

风险：最高。几乎所有 Loop 的开始、开包后、提交后和最终收尾都会经过 Unassigned。

核心不变量：

- `plan` 不写具体 SBC 或 Loop 名称。
- Loop 专属保留通过 `reserveItem` 回调注入。
- 容量 fail-safe 通过配置化 overflow resolver 注入。
- action 或 resolver 报告 progress 后，Unassigned fingerprint 必须变化。
- 必须有最大迭代和递归保护。
- 无进展时安全停止，不能继续开包扩大阻塞。

修改时必须覆盖空、非重复、可交易重复、不可交易重复、Swap、Storage 满、Transfer 满、两者满和 recovery 无进展。

### 5.7 `src/sbc`

文件：

- `submit-attempt.js`：统一 Challenge 获取、Squad Provider、保存前/后 validator、保存、提交和结果。

风险：最高。

`submitSbcAttempt()` 被 Inventory、Rating、FSU fill 和 Existing Squad Provider 复用。修改会影响 Daily、Player Pick、Provision、Rare Pack、84+ TOTW、84x10 和恢复 SBC。

核心不变量：

- Challenge 不可用返回 `unavailable`，不提交旧 Challenge。
- Squad Provider 只提供计划，不绕过 validator。
- Dry run 返回 `planned`，不保存或提交。
- 保存后重新读取实际阵容并运行 post-save validator。
- Submit 不 ready 时停止。
- 成功提交后才标记 consumed 和处理奖励。

### 5.8 `src/reward`

文件：

- `sbc-claim.js`：编排有限 Claim Rewards 等待，并通过 Pack 计数或 SBC 进度判断奖励是否已经发放。
- `player-pick.js`：Player Pick 候选排序、人工介入原因和 recap 数据生成。
- `batch-open-recap.js`：Batch Open 的纯 recap 模型；特殊球员逐张展示并接收价格映射，非特殊球员按评分、Rare/Common 和 Gold/Silver/Bronze 聚合并统一降序排序。
- `player-prices.js`：FUT.GG 价格解析、FUTNext fallback 和结构化诊断。
- `pack-highlight.js`：从通用 Pack receipt 识别达到阈值的特殊卡，并生成本地/远程通知模型；不执行 DOM 或网络副作用。

Reward 模块不直接访问 EA Service 或 DOM。Claim Rewards 通过注入的 Overlay、Page shield、Pack/SBC 快照、Wait 和输入事件回调保持 25 秒上限及提前确认规则；价格 HTTP transport 由 Browser HTTP Adapter 注入，FUT.GG/FUTNext URL、解析和 fallback 在 Reward service 中。待领取 Pick 名称/Loop 别名分类位于 `src/reward/player-pick.js`；真实待领取物品读取、跨 pile 重复检查、领取和确认选择通过 `src/adapters/ea/player-pick.js`；人工选择弹窗位于 `src/ui/player-pick-modal.js`。

### 5.9 `src/workflows`

Workflow 是无 EA/DOM 依赖的状态机：

- `recycle.js`：重复卡、奖励包和 seed SBC 循环。
- `supply-and-craft.js`：库存选择、补货包、fallback 和重复提交。
- `pack-and-craft.js`：源包、恢复状态和有序 crafting stages。
- `player-pick.js`：pending Pick 优先、Challenge 提交、即时领取或达到上限后集中领取，以及 Pick 计数。
- `repeated-submission.js`：重复提交型流程。
- `reserved-duplicate-crafting.js`：Provision/Rare Pack 共用的重复材料 crafting 迭代、Dry Run 和停止状态。
- `sequence.js`：One-click 等有序子流程。
- `validation-round.js`：Bronze Upgrade Validation 的 Dry/Live 共用编排。
- `batch-open.js`：独立批量开包状态机；按配置顺序执行，每次打开前重新解析实时 pack 实例，记录 opened/skipped/blocked/stopped 和回执。
- `dispatch.js`：strategy 到 runner 的统一分发，以及标准/Player Pick 收尾回调顺序。

风险：中高。通常影响同一 strategy 的全部 Loop，但不应直接影响其它 strategy。

Workflow 返回结构化状态：`completed`、`planned`、`unavailable`、`insufficient` 或 `blocked`。不要用异常代替正常的材料不足和活动已完成；不可恢复的运行时错误才抛异常。

### 5.10 `src/ui`

当前已模块化：

- `log-renderer.js`：简洁/完整日志投影和批量刷新。
- `main-panel-view.js`：主面板 HTML/CSS 和幂等挂载。
- `main-panel-geometry.js`：Options/Hide、`L`、拖动、resize、默认/最小尺寸和位置保存。
- `main-panel-bindings.js`：选项回填和 UI command 事件转发。
- `main-panel-commands.js`：刷新、配置加载、Stop、复制和下载日志等主面板 command 编排。
- `main-panel-state.js`：Loop 列表、rounds、recap 和 disabled 状态投影。
- `player-pick-modal.js`：人工 Player Pick 选择。
- `player-pick-recap.js`：Player Pick recap 汇总、卡片列表、价格展示和关闭。
- `reward-celebration.js`：Pick recap 与 Pack Highlight 共用的烟花动画。
- `reward-highlight.js`：靠近主面板显示的非阻塞 Pack Highlight Toast。
- `reward-alert-settings.js`：Reward Alerts 独立设置弹窗及 Preview/Desktop/ntfy 测试入口。
- `batch-open-dialog.js`：My Packs 扫描、Add 1/Add all 下拉菜单、记忆列表、数量编辑、Preview 和 Start 命令弹窗。
- `batch-open-recap.js`：批量开包汇总弹窗；不负责开包、通知或库存处理。
- `sbc-reward-overlay.js`：Claim Rewards 控件、奖励 Controller/DOM 覆盖层识别和关闭。

风险：

- `log-renderer.js`：中等，影响日志刷新性能和简洁/完整日志显示。
- `main-panel-*`：中等，容易产生简洁模式回归、重复日志栏、尺寸无法恢复或 command 未转发等问题。
- `player-pick-modal.js`：中等，影响人工 Pick 的选择数量、Stop 中断和弹窗清理。
- `sbc-reward-overlay.js`：中高，影响页面型 SBC 奖励覆盖层识别和关闭；25 秒等待、Pack 增量和 SBC 进度确认位于 `src/reward/sbc-claim.js`。

UI 修改要检查简洁模式、Options 模式、`L`、拖动、resize、长文本、日志高频更新和 Pick recap。

Reward Alerts 的三个测试入口必须保持解耦：Preview 只展示本地 Toast/烟花，不调用 `GM_notification` 或网络；Desktop test 实际调用本机系统通知；ntfy test 实际发送远程测试消息。不要为了减少按钮数量把真实通知副作用合并进 Preview。

Batch Open 是独立 operational tool，不是 Loop strategy。主面板只保留一个入口，详细配置在独立弹窗中。运行时必须调用共享 entry `openPack()`，每次打开前重新按 `packId + packName` 解析新的 live pack instance，并提供 `createMaterializeAndResolvePolicy()`；禁止直接调用 Adapter `open()`、复制 Unassigned 清理路径或为 Batch Open 生造专用物品路由。Preview 只显示本地 recap，不得发布 Reward Highlight、Desktop 或 ntfy 副作用。

Batch Open 的 Unassigned 容量阻塞使用 `blockedPolicy: 'preserve'` 和显式 `enableRecovery: true`：先尝试现有通用恢复配方，仍无法处理时保留 Unassigned。已经成功打开的包必须保留 receipt 并进入 recap，后续包停止，不能再调用一次通用 final cleanup 覆盖结果。下一次 Batch 启动前也必须先执行同样的 preserve preflight；现有 Unassigned 未解除时不得打开新包。不要通过放宽高分、特殊卡、FSU 或 Lock 规则来强制腾出 Storage。

Batch Open 的 `Add all` 必须持久化为 `quantityMode: 'all'`，不能只保存点击时的数量快照。弹窗展示使用当前 My Packs 数量，Start 前再次刷新并通过 `materializeBatchOpenPlan()` 物化执行数量；实时数量为 0 的 all entry 不进入执行计划。旧配置没有 `quantityMode` 时按 `fixed` 兼容。

### 5.11 `src/userscript-entry.js`

入口当前负责：

- Userscript metadata 和版本。
- 从 `src/config` 导入内置 `LOOP_DEFS`、展示/运行参数规则和 schema 校验，并保留当前测试/API 所需的薄代理。
- Runtime state、日志和主面板业务状态计算；command 编排已迁入 UI 模块。
- Runtime Adapter 组合；entry 不再直接访问 `W.*`、EA Repository/Service 或 EA enum。
- 缓存合并和页面导航顺序；奖励确认循环位于 Reward 模块，通用 predicate/loading/observable 等待位于 Wait Adapter。
- FSU manual override、2 秒缓存和日志格式化；runtime discovery 与锁卡来源合并已位于 FSU Adapter。
- shared module 到真实页面副作用的连接。
- 为共享 Workflow、strategy dispatcher 和服务注入真实页面副作用回调。
- 尚未完全迁出的评分候选安全策略桥、Player Pick 刷新/重试编排和页面语义 DOM helper。

风险取决于修改位置。任何看似局部的 helper 都必须先搜索全部调用点。

## 6. Strategy 与 Workflow 映射

当前 strategy 分发位于 `src/workflows/dispatch.js`，`runConfiguredLoop()` 只注入 runner 和收尾回调：

| Strategy | Entry runner | Shared workflow / scope |
| --- | --- | --- |
| `validationBronzeUpgrade` | `runValidationBronzeUpgrade` | `runValidationRoundWorkflow` |
| `dailySingleCardRecycle` | `runRecycleLoop` | `runRecycleWorkflow` |
| `supplyAndCraft` | `runSupplyAndCraftLoop` | `runSupplyAndCraftWorkflow` |
| `inventoryMixedUpgrade` | compatibility mapping | `runSupplyAndCraftLoop` |
| `commonGoldToRareUpgrade` | compatibility mapping | `runSupplyAndCraftLoop` |
| `provisionPackCrafting` | `runProvisionCraftLoop` | `runPackAndCraftWorkflow` plus configured stages |
| `provisionPackDualCrafting` | compatibility mapping | same Provision flow |
| `rarePackTo84Upgrade` | `runRarePackCraftLoop` | `runPackAndCraftWorkflow` |
| `playerPickSbc` | `runPlayerPickLoop` | `runPlayerPickWorkflow` |
| `dailyRoutine` | `runDailySequence` | `runSequenceWorkflow` |
| `fillAndVerifySbc` | `runFillAndVerifyLoop` | shared selection and submission transactions |

旧 strategy 名仍用于外部配置兼容。不要新建更多兼容 strategy，优先用现有通用 Workflow 和参数表达需求。

### 6.1 现象到代码定位表

| 现象 | 首先检查 | 关键符号 |
| --- | --- | --- |
| Loop 不显示、MVP 可见性错误 | `src/config` 和 UI 投影 | `loops.js`、`loop-presentation.js`、`renderLoopSelect()` |
| 外部 JSON 加载失败或行为不同 | 配置 schema 和 contract | `loop-schema.js`、`scripts/check-loop-config.mjs`、`tests/contracts/loop-config.test.js` |
| SBC 名称找不到 | entry 的 SBC Set 查找和 Loop aliases | `findSbcSet()`、`sbcNames` |
| Daily 完成次数判断错误 | Daily sequence/preflight | `runDailySequence()`、daily progress helpers |
| 选材数量、稀有度或来源错误 | Selection input 与纯 selector | entry `selectInventoryPlayers()` bridge、`src/selection/inventory.js` |
| 评分 SBC 选择高分卡或卡死 | Rating model/candidates/solver | `runFillAndVerifyLoop()`、`src/selection/rating.js`、`src/domain/rating.js` |
| Unassigned/Transfer duplicate 无法提交 | signal materialization | `prepareInventorySelection()`、`src/selection/transient-signals.js` |
| Storage/Transfer 满时失败 | Unassigned plan/recovery | `resolveRuntimeUnassigned()`、`src/unassigned/*`、`src/config/recovery.js` |
| 开包 471/500 或打开下一包过早 | Pack integration/transaction/policy | entry `openPack()`、`src/pack/open-transaction.js`、opened-item policy |
| SBC 保存后人数不对或重复提交 | Submission transaction/EA Adapter | `submitInventorySbcAttempt()`、`src/sbc/submit-attempt.js`、`src/adapters/ea/sbc.js` |
| Claim Rewards 空等或奖励判断错误 | reward claim and navigation sync | `src/reward/sbc-claim.js`、entry reward/navigation helpers |
| Player Pick 已生成但不能领取 | pending Pick identification | `findUnassignedPlayerPick()`、`src/reward/player-pick.js`、`src/adapters/ea/player-pick.js`、`pickItemNames` |
| Pick 选择或价格不符合预期 | Pick ranking/price/manual UI | `src/reward/player-pick.js`、`src/reward/player-prices.js`、`redeemAndSelectPlayerPick()` |
| Provision stage 顺序或 partial Pick 错误 | Provision orchestration/config | `runProvisionCraftLoop()`、`runProvisionPreCraftPlayerPick()`、`craftingUpgrades` |
| One-click 阶段跳过或恢复错误 | Sequence Workflow | `runDailySequence()`、`src/workflows/sequence.js` |
| 日志卡顿、重复日志栏 | UI renderer/entry panel | `src/ui/log-renderer.js`、`installPanel()` |
| 热加载使用旧代码 | 构建和本地服务 | `scripts/build-userscript.mjs`、`StartLoopRunnerDevServer.ps1`、Hot Reload userscript |

## 7. Loop 配置规则

每个 Loop 至少包含：

```json
{
  "id": "stable-id",
  "name": "Display Name",
  "strategy": "playerPickSbc"
}
```

常用字段：

- `hidden`、`mvp`：默认可见性。
- `sbcNames`：SBC Set 名称别名；运行时动态取得 Set/Challenge id。
- `requirements`：材料条件数组。
- `challengeRequirements`：多 Challenge 各自不同的材料条件。
- `priorityPiles`、`primaryPiles`、`clubFallbackPiles`：来源顺序。
- `shortagePacks`：Supply and Craft 的补货来源。
- `sourcePackIds`、`sourcePackNames`：Pack and Craft 源包。
- `craftingUpgrades`：Provision 的有序后续 SBC stages。
- `pickItemNames`：Player Pick 奖励精确别名。
- `challengesPerPick`、`pickCount`：Pick 子阵数和最终选择数。
- `maxCompletions`：单次调用的完成上限；对 Daily Routine，EA 返回明确剩余次数时必须由实时值覆盖本地旧值。
- `maxPacks`：来源包异常保护上限，不等于用户 rounds，也不应作为 Daily 业务目标展示。
- `useRoundsAsCompletions`：仅用于明确由用户指定本次完成数的独立可重复 Loop。
- `consumeAllSourcePacks`：要求有限来源工作流先处理完所有匹配来源包；它可以与独立 Loop 的 `rounds` 完成目标并存，两个终止维度不得互相替代。
- `sourceExhaustedFallbackLoopId`、`sourceExhaustedFallbackMaxCompletions`：来源耗尽后的可配置库存兜底及其边界。
- `exhaustSbcSet`、`setCompletionSafetyLimit`：限次 Pick 使用 EA Set 当前剩余次数执行到耗尽；元数据不可读时只使用内部安全上限，不读取 UI `rounds`。
- `openRewardPacks`：奖励包策略。
- `forceOpenRewardPacks`：仅当同一流程的后续步骤必须立即消费该奖励时才可强制开包，例如 84x10 的 TOTW 前置；普通独立/兜底 2x84+ 奖励必须服从 UI `Open reward packs`。
- `protectHighGold`、`maxRating`、`allowSpecial`：普通材料保护。
- `ratingSbcFill`、`requiredSpecialCount`、`requiredSpecialKind`：评分 SBC 参数。
- `preCraftPlayerPickLoopId`：Provision 前置 Pick 引用。
- `unassignedRecoveryPolicyIds`：当前 Loop 允许的恢复策略。

`rounds` 契约：

1. `dailyRoutine` 和正式 Daily SBC 子步骤不得读取 UI `rounds`；EA 能提供 Daily 剩余次数时直接执行该剩余次数，进度暂不可用时运行到 Challenge 不可用并受内部安全上限保护。
2. `mvp: true` 的 Daily 验证步骤可以保留明确的单次上限，这是测试入口，不代表正式 Daily 业务上限。
3. 独立可重复 SBC/Player Pick 只有配置 `useRoundsAsCompletions: true` 时才把 UI `rounds` 投影到 `maxCompletions`。
4. Provision 的 `rounds` 表示本次打开的来源包数；Validation 的 `rounds` 只表示测试轮数。
5. `maxPacks` 等内部安全上限用于防止异常无限循环，达到时应安全停止并记录原因，不能在 UI/日志中描述成已完成的业务 rounds。
6. 同时配置 `consumeAllSourcePacks` 与 `useRoundsAsCompletions` 时，必须先处理完所有来源包，再用库存补足 `rounds - 已完成数`；来源包重复卡清理允许完成数超过目标，库存兜底不得超额。Daily Routine 可通过 `stepOverrides` 关闭子步骤的 rounds 投影并配置有限兜底。
7. 限次 Player Pick 配置 `exhaustSbcSet: true`，不得同时配置 `useRoundsAsCompletions`。运行目标是“已有同类型 pending Pick 数 + EA Set 剩余完成次数”；pending Pick 必须先处理，但不能消耗 Set 的剩余次数预算。

新增静态 Player Pick 时：

1. 已确认稳定身份时优先配置精确 `sbcSetIds`；完整活动名称 `sbcNames` 只作为兼容回退，不使用宽泛名称猜测目标 SBC。
2. 材料比例写入 requirements，并由 contract test 锁定。
3. 已确认稳定身份时优先配置精确 `pickItemResourceIds`；`pickItemNames` 使用实际 Unassigned 奖励名或稳定 localization key 作为回退。
4. 不使用过宽别名，例如只有 `84+ Player Pick`；否则可能误领其它 Pick。
5. `pickCount` 是最终选择数量，`pickCandidateCount` 是候选数量；动态发现只允许从奖励显式字段或官方奖励描述开头的 `X of Y` 读取，禁止从 SBC 名称推断。
6. 更新内置配置、外部 JSON、fixture coverage、contract test 和 README。

自动扫描当前可用 Pick SBC 的设计记录在 M9。当前已完成纯 discovery parser、fixture、EA Adapter 只读快照、启动自动扫描和 Options 中的 `Scan Picks` 重扫入口；扫描必须先加载 Challenge squad 得到 brick 后的真实人数，禁止从 formation 槽位数猜测。完全支持且不与静态配置重复的结果只作为当前会话 Loop 合并到列表，成功重扫会替换旧会话结果。83+/84+ 已完成动态覆盖 Dry Run/Live 验证并删除静态活动配置，今后只由扫描生成。`Use scanned Pick metadata` 默认关闭且只作用于仍有静态配置的 Pick；启用后，仅当扫描结果完整且精确匹配一个静态 `playerPickSbc` 时，才覆盖其 Set/奖励身份、Challenge 数量和 requirements，必须保留静态 Loop ID、运行限制和流程引用。扫描失败、完成、unsupported 或歧义匹配必须回退静态配置。82+ 在 Provision 多 Challenge 实盘验证前必须保留静态配置。扫描本身不会提交或领取，实际运行继续复用现有 `playerPickSbc` Workflow。

## 8. Agent 接到任务后的标准流程

### 8.1 先确认事实，不先改代码

1. 读取用户最新指令，确认是分析、计划还是要求直接实现。
2. 检查工作目录和 Git 状态。
3. 读取完整日志，不只看最后一行。
4. 标记版本、Loop、Dry run/Live、FSU settings、SBC/Pack/Unassigned 状态。
5. 找到第一处偏离预期的日志，而不是最后抛错的位置。
6. 对照最近提交，若用户怀疑回归，使用 `git log`、`git show` 和 `git blame` 找到引入点及原提交目的。

### 8.2 将问题归类到正确层

优先判断：

- 名称、数量、顺序、保护阈值变化：配置层。
- 单个 strategy 的循环、partial 状态或阶段顺序：Workflow。
- 选错卡、比例不对、signal 解析不全：Selection。
- 开包 471/500、response/UI 延迟、第二包决策：Pack transaction/policy。
- Storage/Transfer 满、保留或恢复路径：Unassigned。
- 保存后阵容变化、重复提交、Challenge 状态：SBC transaction/Adapter。
- EA 字段读取错误、缓存缺失：Adapter 或 entry integration。
- 面板、日志、recap：UI/entry。

先尝试用配置或现有 callback 表达需求。不要为了一个 Loop 复制共享底层函数，也不要为了避免局部参数而修改所有 Loop 的共享行为。

### 8.3 做影响面分析

修改前回答：

- 这个函数/字段被谁调用？
- 是一个 Loop、一个 strategy，还是全部 Loop 共用？
- Dry run 和 Live 是否共用路径？
- 是否影响 pending 状态恢复？
- 是否影响 Unassigned、容量或下一包决策？
- 是否会改变 FSU/高分/特殊卡保护？
- 是否修改 Adapter、Contract 或生成文件？
- 需要哪些 Node tests 和真实页面验证？

使用 `rg` 搜索符号、strategy、配置 id、日志文案和底层调用。不要只根据函数名推测影响范围。

### 8.4 定义不变量和恢复要求

实现前写下：

- 正常路径。
- 边界条件。
- 必须停止的条件。
- 当前失败状态更新脚本后如何继续。
- 不允许改变的保护规则。
- 预期新增日志。

例如修 Player Pick 名称时，不修改材料选择和提交；只补实际观测到的限定别名，并保证 pending Pick 在新提交前被领取。

### 8.5 先补测试，再最小修改

优先测试层级：

- 纯函数 Bug：`tests/unit`。
- 状态机顺序或恢复：`tests/workflows`。
- 配置、Adapter 或 userscript 集成契约：`tests/contracts`。
- 运行时全局或直接调用点变化：`tests/architecture`。
- 真实 EA/FSU/Pack 数据：`tests/fixtures` 中新增脱敏 fixture。

Bug 回归测试应描述原始失败场景，不要只把旧断言改成新结果。

### 8.6 实现和验证

实现顺序：

1. 修改源码和配置。
2. 运行最小相关测试。
3. 运行 `npm run verify`。
4. 运行 `git diff --check`。
5. 检查生成的 userscript 版本和目标配置是否存在。
6. 根据影响面列出建议用户执行的真实页面验证场景。

不要在必要测试仍失败时只交付“理论上可行”。

## 9. 测试框架

Vitest 运行在 Node 环境，配置见 `vitest.config.js`。

### 9.1 Unit tests

目录：`tests/unit`

覆盖：

- Domain contracts 和评分公式。
- requirements/rating selection。
- FSU、保护和 duplicate signal characterization/differential。
- Pack transaction 和 opened item policy。
- Unassigned plan、resolver 和 recovery。
- Submission transaction、SBC reward claim 和 Player Pick reward planning。
- Log renderer。

Characterization test 锁定当前已验证行为；differential test 对比重构前后或两种实现的结果。修改它们时要确认是修 Bug 还是改变规则。

### 9.2 Workflow tests

目录：`tests/workflows`

使用回调和 fake result 测试状态机，不启动 EA 页面。覆盖 recycle、supply-and-craft、pack-and-craft、Player Pick、repeated submission、reserved duplicate crafting、validation round 和 sequence。

Workflow 测试应检查调用次数、顺序、结构化状态和恢复，不测试 DOM。

### 9.3 Contract tests

目录：`tests/contracts`

- `loop-config.test.js`：配置合法性、内置/外部关键行为和安全上限。
- `fixture-coverage.test.js`：每个内置 Loop 都有 normal/recovery 场景说明。
- `inventory-adapter.test.js`：EA Item 到 Snapshot 的转换。
- `effect-adapters.test.js`：fake/EA 副作用契约。

新增 Loop 后必须更新 `tests/fixtures/workflow-scenarios.json`，否则 fixture coverage 会失败。

### 9.4 Architecture tests

目录：`tests/architecture`

- 禁止共享模块访问 runtime globals。
- 禁止 Workflow import Adapter 实现。
- 锁定 pack.open、SBC save/submit 的直接调用点。
- 锁定已删除的旧专用 runner 不重新出现。

架构 baseline 变化不能机械更新数字；必须解释为什么新增直接调用是合理的。一般应修改实现保持 baseline，而不是放宽测试。

### 9.5 Userscript integration harness

`tests/helpers/load-userscript.js` 使用 esbuild 打包源码，在 Node `vm` 中安装 fake window、repositories、services 和 test exports。它用于测试 entry 对配置模块的兼容代理、选择桥和 runtime helper；配置 schema 本身另由纯模块测试直接覆盖。

如需测试新的 entry helper，可谨慎加入 `W.__FCLoopRunnerTest` export；不要将测试专用逻辑带入正常运行路径。

### 9.6 Fixtures

目录：`tests/fixtures`

保存脱敏、可重复输入：

- Challenge 进度和评分要求。
- FSU selection policy。
- Inventory/Storage overflow。
- My Packs 实例。
- 每个 Loop 的 normal/recovery 行为描述。

真实 Bug 的 fixture 应保留决定性字段，例如 item id、definition id、duplicateId、rating、rareflag、tradeable、pile、capacity 和 Challenge 状态。

## 10. 按改动类型选择验证范围

### 配置或名称别名

- `npm run check:config`
- `tests/contracts/loop-config.test.js`
- `tests/contracts/fixture-coverage.test.js`
- 目标 Loop 真实页面验证
- 最终仍运行 `npm run verify`

### 单个 Workflow

- 对应 workflow tests
- 该 strategy 的所有配置 contract
- 目标 Loop 和同 strategy Loop 的真实页面验证
- `npm run verify`

### Selection

- selection unit、characterization、differential
- Player Pick、Provision、Daily、Rare Pack 或 Rating 等全部相关 workflow tests
- 视修改范围至少验证一个 requirements Loop 和一个 rating Loop 的真实页面流程
- `npm run verify`

### Pack

- open-pack transaction、opened policy、transient signal tests
- 所有受影响 pack workflows
- 真实页面验证正常包、stale/471/500、response 早于 UI 和容量边界
- `npm run verify`

### Unassigned

- plan、resolve、recovery tests
- Daily、Rare Pack、Provision、Player Pick 收尾场景
- 真实页面验证 Storage/Transfer 满和当前状态恢复
- `npm run verify`

### SBC Submission 或 EA Adapter

- submit-attempt、SBC/Player Pick reward、adapter contracts、architecture tests
- Inventory SBC、Player Pick、Rating SBC 各至少一个相关测试
- 真实页面提交、奖励、重复点击和恢复验证
- `npm run verify`

### UI

- log renderer tests
- 简洁/Options/`L`/resize/drag/recap 人工检查
- 高频日志刷新检查
- `npm run verify`

## 11. Dry run 与 Live

Dry run 和 Live 应尽量共享：

- Challenge 定位和要求解析。
- Inventory snapshot。
- Selection 和 rating solver。
- validator 和 diagnostics。
- Workflow planning。

Dry run 必须在副作用前停止：

- 不移动物品。
- 不清理真实 Unassigned。
- 不开包。
- 不保存阵容。
- 不提交 SBC。
- 不兑换 Pick。

不能简单运行完整 Live 然后跳过最后提交，因为前面的开包、移动、保存和恢复 SBC 本身已经改变账号状态。

## 12. 日志分析方法

分析日志时按时间线分层：

1. `Ready v...`：确认运行版本。
2. `FSU settings sync`：确认实际保护策略。
3. `Loop selected`：确认 strategy。
4. Challenge/Pack preflight：确认目标和剩余次数。
5. Selection：确认数量、pile 和 diagnostics。
6. 保存与 `submit ready`：确认实际阵容状态。
7. 提交与 reward claim：确认是否已经成功。
8. Unassigned confirmation：确认奖励和重复卡状态。
9. 第一条偏离预期的日志。
10. 最终异常堆栈只用于定位调用链，不一定是根因。

常见例子：

- `unrelated unassigned Player Pick`：通常是奖励别名不匹配，不代表 SBC 提交失败。
- `SBC storage has only ...`：根因可能是前一步不该清空 Unassigned，而不是容量检查本身。
- `selected M/N`：先看 diagnostics 和 FSU settings，再判断库存不足。
- `Open pack failed: 471/500`：检查是否残留 SBC 页面、stale pack 或 Unassigned 未同步。
- `Pack #N marked gone for this session after 404`：同一 pack id 已按 404 拉黑，本会话不再重复尝试（例如僵尸 TOTW Provision Refresh）。
- `background submit returned 409/429; reloading challenge before retry`：评分 SBC 后台提交冲突，脚本会有限次重载 challenge 并重放阵容后重试；仍失败再停。
- `rating shortage before automatic 2x84+ recovery: ...`：84x10/评分 SBC 主求解失败原因；出现在自动 2x84+ 恢复之前。先读这行区分“评分无解/超时/约束不满足”与后面的 fodder 不足。
- `rating search exceeded ...`：候选池或组合复杂度达到有界限制；优化候选或配置，不要简单把搜索上限改成无界。
- `unknown eligibility key` 或 chemistry：当前动态条件无法安全解释，应记录 Challenge 模型并停止，不得忽略条件提交。
- `reward pack not found`：先确认 SBC 进度和奖励是否已经发放，再刷新 Packs；不要盲目重复提交同一个 Challenge。
- 材料已经开出却立即报缺料：优先检查是否先处理 pack response、再清理残留 Unassigned 和刷新 recent reward；不要直接放宽材料保护。
- 长时间无日志：区分 EA 请求等待、页面 loading、同步计算或日志 renderer 阻塞。

## 13. Git、远程更新与冲突

仓库可能存在未提交改动。Agent 必须：

- 不还原不属于当前任务的改动。
- 不使用 `git reset --hard` 或类似破坏命令。
- 远程更新后先检查 diff、最近提交目的和行为覆盖范围。
- 冲突不能只按文本解决；必须确认双方行为意图。
- 特别检查内置配置、外部 JSON、README、tests 和生成产物是否被旧版本覆盖。
- 合并后运行 `npm run verify`，并验证受影响的真实页面流程。

怀疑回归时：

1. 找到最后正常版本和首次失败版本。
2. 用 `git log --oneline`、`git show`、`git diff old..new`。
3. 确认引入提交的原始目的。
4. 恢复旧的正确行为，同时保留该提交真正需要的修复。
5. 添加同时覆盖“旧正确行为”和“新修复目的”的测试。

## 14. 本地热加载与发布

启动服务：

```powershell
powershell -ExecutionPolicy Bypass -File ".\StartLoopRunnerDevServer.ps1"
```

开发循环：

```powershell
npm run build
# Web App 中点击 Reload Loop
```

发布前：

```powershell
npm run verify
git diff --check
```

共享底层修改不得仅凭 Node tests 宣布完成；Agent 应根据影响面列出真实页面验证场景，由能够访问账号和 Web App 的用户执行。

CI 位于 `.github/workflows`，Windows + Node 22 执行 `npm ci` 和 `npm run verify`，并检查生成的根目录 userscript 已提交。

## 15. 交付报告要求

Agent 完成任务时应说明：

- 根因。
- 修改了哪一层和哪些文件。
- 为什么没有扩大到其它层，或共享改动影响哪些 Loop。
- 新增/修改了哪些测试。
- `npm run verify` 结果。
- 是否执行真实页面验证；没有执行时明确列出待验证场景。
- 当前失败状态是否可以直接重新运行恢复。
- 版本和生成产物是否同步。

不要只说“已修复”。对于高风险共享修改，必须给出影响面和剩余风险。

## 16. 当前架构边界与后续项

核心架构重构已在 `0.5.12` 收尾。以下是明确保留的运行时边界和独立后续功能，不应误判为需要机械拆分的未完成工作：

- `src/userscript-entry.js` 仍包含运行时 composition、缓存合并、评分候选安全策略桥、真实页面副作用回调和页面语义 helper；内置 Loop、schema、展示/运行参数规则、strategy 分发、SBC 导航同步、Unassigned 确认、Claim Rewards 编排以及评分候选构建/计划回解已迁出。
- Inventory/Pack/SBC/Player Pick/FSU/Localization 与 DOM/Storage/HTTP/Page Runtime/Wait/User Effects 已通过统一 Runtime Adapter 工厂获取；entry 已无直接 `W.*`、EA Repository/Service、enum、Clipboard 或 download API 访问，但仍保留通过 Adapter 执行的页面副作用顺序。
- FSU 嵌套设置、Storage 和锁卡身份纯解析位于 `src/config/fsu-compat.js`；窗口根对象发现、来源优先级和跨来源锁卡合并位于 `src/adapters/ea/fsu.js`。entry 只保留 manual override、2 秒缓存和运行日志。
- Reward 的纯判断、Player Pick 待领取名称分类、排序/recap 和价格 fallback 已迁出；待领取物品读取、跨 pile 重复检查、领取/确认在 EA Adapter，人工选择在 UI 模块。
- 旧 strategy 名仍保留外部配置兼容。
- Player Pick SBC 动态发现已完成保守的纯解析、EA 快照、只读扫描、当前会话列表合并、稳定身份去重、成功重扫替换和可选的静态配置会话覆盖；83+/84+ 动态 Dry Run/Live 已通过并删除静态配置，82+ 多 Challenge/Provision 动态覆盖及其它新 Pick 仍需实盘验证，复杂评分/化学/特殊卡条件仍保持 unsupported，见 M9。

是否删除旧路径或继续物理拆分，以 [REFACTORING_MILESTONES.md](REFACTORING_MILESTONES.md) 为准，不因单个功能任务顺带扩大重构范围。
