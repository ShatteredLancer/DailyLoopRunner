# FC26 Daily Loop Runner

当前版本：`0.6.42`

Daily Loop Runner 是运行在 EA FC Web App 中的 Tampermonkey 脚本，用于编排开包、处理 Unassigned、选择 SBC 材料、提交 SBC 和处理 Player Pick。脚本会尽量复用当前页面已经加载的 EA、FSU 和 Enhancer 能力，并在无法确认材料或奖励身份时停止，而不是继续猜测。

## 文档入口

- 本文：面向使用者，介绍安装、界面、主要 Loop、常见问题和基本开发方式。
- [AGENTS.md](AGENTS.md)：面向 AI agent 和开发者的完整工程手册，包括架构、模块职责、影响面分析、测试和发布流程。
- [docs/REFACTORING_MILESTONES.md](docs/REFACTORING_MILESTONES.md)：重构进度、未完成工作和后续 Milestone。
- [FSU_mod/README.md](FSU_mod/README.md)：FSU 优化版安装、上游更新、补丁应用和回滚说明。
- [FSU_mod/FSU_CLUB_CACHE_INTEGRATION.md](FSU_mod/FSU_CLUB_CACHE_INTEGRATION.md)：FSU Club 实体缓存、权威校验、Runner/Enhancer 交互、诊断和完整开发手册。
- [docs/WORKFLOW_LOOP_BUILDER_GUIDE_ZH.md](docs/WORKFLOW_LOOP_BUILDER_GUIDE_ZH.md)：Workflow/Loop Builder 中文图示操作指南，包括修改流程、Step Variant、Dynamic SBC 和激活步骤。
- [docs/WORKFLOW_LOOP_BUILDER.md](docs/WORKFLOW_LOOP_BUILDER.md)：可视化 Workflow/Loop Builder 的模型、界面、兼容边界、实施阶段和后续计划。

## 安装要求

浏览器中需要启用：

- Tampermonkey
- FSU
- FC26 Enhancer
- `DailyLoopRunner.user.js`

安装或更新时，将仓库根目录生成的 `DailyLoopRunner.user.js` 更新到 Tampermonkey。不要直接使用 `src/userscript-entry.js`，它包含模块导入，必须先经过构建。

进入 EA FC Web App 后，等待页面、FSU 和 Enhancer 初始化。主面板标题显示 `Loop Runner v0.6.42`，日志出现 `Ready v0.6.42` 后即可开始；优化版 FSU 命中快速缓存时会进入 `trusted-provisional`，后台继续校验已恢复的 Club 缓存。Runner 会在每次保存 SBC 前只向 EA 校验本次选中的 Club 球员，全量校验结束后自动切换为普通 ready 状态。

FSU 不再显示前台 Club loading 时，可能正在后台校验，也可能已进入快速缓存状态。Runner 的 Live SBC 只有在选中的 Club 球员通过提交前定向 EA 校验后才会保存。详细状态和故障调查见 [FSU_mod/FSU_CLUB_CACHE_INTEGRATION.md](FSU_mod/FSU_CLUB_CACHE_INTEGRATION.md)。

## 基本操作

1. 在下拉列表选择 Loop。
2. 首次运行高风险或新加入的 Loop 时，在 Builder 中为该 Loop/Profile 设置 `Always dry run`，保存并激活后先验证规划结果。
3. 如果当前 Loop 显示 `rounds`，设置本次要执行的数量；Daily 类 Loop 不使用该选项。
4. 点击 `Start`。
5. 需要停止时点击 `Stop`，脚本会在下一个可停止点结束。
6. 出错时打开 Options，点击 `Save log`，保留完整日志供分析。

默认面板是简洁模式，只显示 Loop、`Start`、`Stop` 和最新一行日志。

- `Options`：展开运行选项、配置按钮和完整日志。
- `Hide`：收起 Options。
- `L`：缩成可拖动的小图标，再次点击恢复。
- `Batch Open`：扫描 `My Packs`，编辑并执行记忆的批量开包列表。
- `View recap`：重新查看最近一次 Player Pick、普通 Loop 或 Batch Open 汇总。

Options 中的完整日志会占用面板剩余空间并独立滚动；长错误栈和 URL 会自动换行，不会被面板边界截断。

所有普通 Loop 都会从共享 `openPack()` 回执收集本次实际开出的球员。Loop 完成、停止或阻塞后，只要本次至少开出一张 Rare Gold 或 Special 球员，就会显示逐卡 recap；只有 Common Gold、Silver、Bronze 或没有实际开包时不会弹出 recap。Recap 会保留停止原因、来源包、分页、特殊卡价格和现有 tier 配色。Player Pick 继续使用包含 Pick 序号与库存去向的专用 recap，Batch Open 继续使用包含批量统计的专用 recap；Dry run 不会生成真实奖励 recap。

### Batch Open

`Batch Open` 是独立工具，不加入 Loop 下拉列表，也不读取 `rounds`：

1. 点击主面板的 `Batch Open`，Runner 会刷新并扫描当前 `My Packs`。
2. 在 `My Packs` 区域点击 `Add v`：选择 `Add 1` 加入一包，或选择 `Add all (N)` 进入动态全部模式，不需要输入数量。动态全部模式记忆的是 `all`，不是当时的数字；下次打开弹窗和正式启动前都会读取实时 My Packs 数量。已加入的类型可通过 `Added v` 重设为固定 1 或动态全部数量。
3. 列表、固定数量和 `all` 模式保存在浏览器本地存储中；下次打开弹窗会直接恢复。已经不在 `My Packs` 的记忆项仍会保留并显示 `unavailable`；`all` 模式实时数量为 0 时执行阶段会安全跳过。
4. 点击 `Start batch` 后按列表顺序逐包打开。每包都走 Runner 的通用开包、Reward Alerts 和 Unassigned 处理流程；可用主面板 `Stop` 在下一个安全点停止。
5. 结束后如果本次至少开出一张 Rare Gold 或 Special 球员，则显示 Batch Open recap：所有球员都按 Pick recap 风格逐张列出并按评分降序排列，每页最多 15 条；特殊球员查询实时价格，普通球员显示 Rare/Common 和 Gold/Silver/Bronze tier。价格查询失败只显示 `price:?`，不会阻断 recap。没有 Rare Gold 或 Special 时只记录日志，不弹 recap。

当 EA 的全重复开包响应迟迟没有生成可读取的 Unassigned 实体时，Batch Open 会先主动进入 Unassigned、连续确认并运行通用清理/恢复流程。全部有界重试仍失败后，才会尝试直接结算响应实体；该兜底会按开包前库存快照确认新目标实体，并聚合检查 Storage/Transfer 容量（交换可交易 Club 版本同样占用 Transfer）。无法确认、容量不足或检测到新的 live Unassigned 时会保留现场并停止后续包，不会把该行为扩展到其它 Loop。

如果某包开出不可交易重复卡而 Storage/恢复 SBC 无法安全容纳，当前包仍计入已打开并进入 recap，重复卡保留在 Unassigned，后续包停止且显示容量原因。再次运行时会先检查现有 Unassigned；阻塞未解除前不会继续开包。

开包响应可能早于 EA 写入 `duplicateId` 和 Unassigned repository。Runner 会先用 Club 中相同 definition 的实体恢复迟到的重复标记；明确的非重复卡可直接进入 Club，但重复卡必须等待 live Unassigned 实体出现后再移动、swap 或交给 recovery，避免对同一张卡重复执行移动。随后 Runner 会逐张确认本包物品已进入 Club、Storage、Transfer，或被当前 crafting 流程明确保留。仍有未确认物品时不会继续下一包；Batch 会保留本次已开结果并在 recap 中显示停止原因。

当一包球员全部是重复卡时，没有非重复卡移动来触发 EA 的 Purchased/Unassigned 页面模型。Runner 会主动打开 Unassigned 页面并执行连续状态读取，使页面已经显示的重复卡进入 live Repository；后续 settlement 重试也会重新同步页面。逐卡确认优先使用实例 ID；如果 EA 在 materialize 时重映射 ID，只接受由开包前基线证明的一一对应新实体，不使用相同 definition 单独猜测已移动，因为 Club 中原有重复版本会造成误判。

Batch 启动时会捕获本次计划使用的 My Packs 实例队列；同 ID 的多份包按不同实例依次打开，不再每轮重新选择 repository 中的第一项。遇到 `471` 时先进行连续多次 Unassigned 空状态确认和二次清理；`471` 本身不再被当作 Pack 实例已经失效的证据。第二次仍失败时安全停止并保留完整日志和 recap。

`Preview recap` 使用 23 条固定模拟数据实际验证第二页，只预览 recap 和烟花，不开包、不访问 EA，也不会发送 Desktop 或 ntfy 通知。Player Pick recap 的预览继续由测试和开发入口覆盖，不再占用主面板操作区。

## Options

- `Open reward packs`：作为本次所选顶层 Loop/Workflow 的奖励开包默认值，并传播给其子 Loop。`rewardFlow.open: "always" | "never"` 可以在父 Loop、子 Loop 或 step 上覆盖；后续阶段必须消费的奖励可由 `forceOpenRewardPacks` 强制打开。它不控制 Player Pick 领取、Batch Open、手动开包，也不能强制不支持自动开包的流程。默认关闭。
- `Inventory only`：作为全局默认值传给支持该能力的 Loop。Daily Bronze/Silver 会保持原行为，不打开来源或最终奖励包并直接从库存提交；Supply-and-Craft Loop 会跳过 shortage/source packs，仅从配置的库存 pile 填充。Loop 可用 `inventoryMode: "inventory-only" | "normal" | "inherit"` 覆盖全局值。不支持该能力的 Provision、Rare Pack 与 Batch Open 不会被静默改写。
- `Reward alerts`：开包命中配置阈值的特殊卡时触发提示。主面板只显示开关和摘要；点击 `Settings` 可设置最低评分、桌面通知和 ntfy。默认条件为特殊卡且评分不低于 `94`。
- `Protect Pick fodder >= N`：Player Pick SBC 禁止使用评分大于等于阈值的普通金卡，默认 `82`。
- `Auto-pick below N`：所有候选都低于阈值时自动选择，默认 `90`。
- `Open Picks at end`：只影响 `playerPickSbc`。直接运行 Pick 时先完成目标数量再集中领取；父 Workflow 的设置会作为默认值传给其中的 Pick 子 Loop，子 Loop 可以显式覆盖。不限次 Pick 使用 `rounds`，限次 Pick 使用 EA Set 当前剩余次数。Provision 的 pre-craft Pick 始终即时领取，普通 Pack 奖励和 Batch Open 不受影响。默认关闭。
- 数量输入：只对声明 `runtimeQuantity.mode: "user"` 的 Loop 显示，标签和默认值由该 Loop 定义。不限次 Player Pick、Daily Rare Pack to 2x84+ 以及动态扫描得到的 2x84+、84+ TOTW、84x10/85x10/7x87+ 等 Upgrade 表示目标完成数，并受 EA 当前剩余次数约束；Provision 显示 `Provision packs`；Validation 显示 `Validation runs`。One-click Daily、其内部 Daily 阶段和限次 Player Pick 不显示该输入。
- `Refresh caches`：刷新当前可用的 Packs、Unassigned、Storage、Transfer 和 Club 缓存。
- `SBC scan`：选择 `Scan SBCs` 的读取模式。`Incremental scan` 先刷新轻量 Set/Category 索引，逐个比较 SBC 结构指纹并复用 24 小时内未变化的 Challenge 快照；`Full rescan` 尝试重新读取所有当前候选，但 EA 临时失败时可保留当前索引身份兼容的已验证快照；`Clear cache + scan` 先删除当前账号的 Dynamic SBC 缓存，再执行一次全量扫描，因此没有缓存降级能力。三种模式共用账号级自适应节流：根据最近 24 小时实际 Challenge 请求失败率，在请求之间保持 800-3000ms 间隔；`426/512/521` 最多额外重试一次并立即降低本轮频率，`429` 会终止本轮后续 Challenge 网络读取。没有兼容缓存的新建或真实变化 SBC 本轮显示 unavailable。扫描日志会输出实际请求数、失败率、错误码和下一轮建议间隔。三种模式都只读，不提交 SBC、不领取奖励；扫描完成后下拉菜单自动恢复为 Incremental。
- `Pack Catalog`：启动扫描会同时读取当前 My Packs 的实时 ID、名称和数量，并从全部已加载 SBC Set 的 PACK reward 元数据建立 `Loop -> SBC Set -> Reward Pack` 会话索引。来源包按“动态 Reward ID、动态 Reward 名称、兼容 ID、兼容名称”顺序解析；My Packs 数量不写入持久缓存，每次刷新都覆盖旧快照。Catalog 不替代延迟可见重试、Store Packs 页面刷新或静态 fallback。
- `Profile`：在 `Built-in`、`Default`、`Bronze/Silver Inventory Only`、`Daily + Rare Pack to 2x84+` 和用户 Profile 之间切换。主面板只加载 Profile 的 Saved/last-known-good；Builder 中尚未保存的 Draft 不会进入运行时。`Bronze/Silver Inventory Only` 只让 Daily Bronze、Daily Silver、Daily Common 等使用铜银材料的 Loop 从库存完成，其余可配置 Workflow/Loop 强制保持正常模式；它不同于主面板 `Inventory only` 的全局运行时默认值。`Daily + Rare Pack to 2x84+` 在四步 One-click Daily 后追加 Rare Gold 来源包处理。
- `Open Builder`：打开全屏可视化 Workflow/Loop Builder。普通编辑不再要求手写 JSON。

主面板不再提供 `Dry run`、`Show MVP loops`、`Use scan data for static Picks`、`Validate JSON`、`Import JSON`、`Built-in loops` 或 `Preview Pick recap` 控件。Dry Run 仍可在 Builder 的 Loop/Profile 配置中设置，MVP/验证 Loop 仍可在 Builder 中编辑并被自定义 Workflow 引用，但不会出现在主 Loop 下拉列表。静态 Pick 的 `preferScannedMetadata` 字段仅保留用于旧 Profile 和 JSON 兼容；当前 Built-in Pick 都由动态扫描生成。JSON 验证/导入仍保留在 Builder 的 JSON validation 页；切回内置配置统一通过 Profile 下拉的 `Built-in`。

### Workflow/Loop Builder

Builder 把配置分为 Draft、Saved 和 Active 三个状态。字段修改会自动持久化到 Draft；`Save` 只在完整配置通过 schema、引用、Dynamic SBC 和内置更新冲突检查后更新 Saved；`Activate` 再把通过验证的物化配置交给原有 `setLoopConfig()` 运行时边界。只打开、预览、导入或保存 Builder 都不会移动物品、开包或提交 SBC。

- 内置 Workflow、Loop 和 Recovery 对象默认只读。使用 `Override` 创建覆盖，`Reset` 恢复当前版本内置值，或 `Duplicate` 创建独立自定义对象。
- Workflow 用有序 step 列表引用原子 Loop。step 只直接保存 `loopId`、显示名称和 `rewardFlow`；需要单次参数差异时使用 Step Variant，避免改变其它引用同一 Loop 的 Workflow。
- Dynamic SBCs 页读取本次 `Scan SBCs` 的安全扫描结果。绑定记录 Set/Reward 稳定身份；刷新或重登后找不到当前 SBC 时，该 Profile 阻止激活并回退内置配置。磁盘缓存只能减少 Challenge 读取，不能绕过当前会话的 Set/Category 指纹验证。
- 来源包可在 Loop 或 shortage source 中选择 `Source reward Loop`。Builder 保存为 `sourcePackRef.rewardOfLoopId`，重命名和删除检查会同步维护该引用；目标必须是带 `sbcSetIds` 或 `sbcNames` 的 SBC Loop。旧 `sourcePackIds/sourcePackNames` 继续作为兼容 fallback，便于分阶段迁移现有 Profile。
- Recovery 页编辑 recipes、policies 和默认 policy 集；所有引用在保存和激活前统一校验。
- `Preview` 只显示物化后的 step、strategy、数量、库存和奖励摘要，不执行 Dry Run。`Undo/Redo` 仅修改当前 Profile Draft。
- JSON 页可以验证并导入旧配置，也可以导出当前物化配置。导入只更新 Draft，必须再次 `Save`/`Activate`；外部顶层格式继续保持 `loops`、`recoveryRecipes`、`unassignedRecoveryPolicies` 和 `defaultUnassignedRecoveryPolicyIds`。

Profile 存在浏览器本地存储中。重登只恢复 Active Profile 的 last-known-good；未保存草稿即使当前校验失败也会保留在 Builder 内，但不会进入运行时。内置版本更新后，未改字段继承新值，同一字段被内置与 Profile 同时修改时必须在 Inspector 中选择 `Use built-in` 或 `Keep mine`。

### Configurable Workflows

`workflowRoutine` 是现有小 Loop 的声明式顺序编排。它不接受 JavaScript、DOM 命令、任意物品移动或直接提交动作；每个子 Loop 仍走原有 FSU 过滤、Dry Run、材料保护、最终校验和 SBC transaction。

使用 `Open Builder` 的 Workflows 页从当前 Profile 开始。step 可以引用已有原子 Loop，也可以增加本次编排中的显示名称或奖励策略。次数、材料、评分、来源包和阶段等业务参数必须配置在被引用的子 Loop 或 Step Variant 中，不在 step 上定义伪通用的 `maxCompletions`：

```json
{
  "id": "my-fodder-workflow",
  "name": "My Fodder Workflow",
  "strategy": "workflowRoutine",
  "steps": [
    {
      "loopId": "my-scanned-2x84-binding",
      "name": "Open configured fodder rewards",
      "rewardFlow": {
        "open": "always",
        "packNames": ["2x 84+ Rare Gold Players Pack"],
        "unassignedRecoveryPolicyIds": ["rare-gold-duplicate-overflow"]
      }
    },
    "my-scanned-high-rated-upgrade"
  ]
}
```

示例中的两个 `loopId` 是用户在 Builder 的 `Dynamic SBCs` 页通过 `Add to profile` 创建的绑定 ID，不是内置固定 ID。动态 Upgrade 到期或 EA 更换 Set 后，必须先重新扫描并让 Builder 刷新绑定；找不到唯一匹配时 Profile 会保持 unavailable，不会回退到过期名称或 Pack ID。

`rewardFlow.open` 可为 `inherit`、`always` 或 `never`。`inherit` 继承父 Workflow 和主面板 `Open reward packs`，`always` 打开匹配奖励，`never` 保留奖励；但子 Loop 的 `forceOpenRewardPacks` 属于后续流程依赖，优先级更高，不能被关闭。`packIds` 或 `packNames` 只替换该 step 的奖励匹配器。`unassignedRecoveryPolicyIds` 只能选择已经定义的恢复策略，不能绕过材料保护或强制移动物品。Workflow 不允许嵌套另一个 Routine，应展开为小 Loop 列表。

配置分为三层：

- 全局运行设置：主面板的 Open reward packs、Pick 高分保护/自动选择/Open Picks at end 和 Inventory only；这些是最低优先级默认值。Dry Run 不再是主面板开关，只能由激活的父/子 Loop 或 Profile 配置启用。
- 父 Loop 设置：step 顺序、组合名称、`pickOptions`、`inventoryMode`、父级奖励/recovery 默认和 `disabledPiles`。可继承偏好会传给子 Loop。
- 子 Loop 设置：strategy、SBC/Pack identity、requirements、评分和特殊卡要求、`runtimeQuantity`、`pickOptions`、`inventoryMode`、来源 pile、阶段和自身 recovery/reward 默认。子 Loop 显式偏好优先于父 Loop 和全局默认。
- step 上下文：仅保留 `loopId`、可选显示名称和 `rewardFlow`。需要不同次数或材料规则时，修改对应子 Loop，或者定义一个独立子 Loop 变体再引用。

可继承偏好按“全局 UI -> 父 Loop -> 子 Loop -> step 上下文”解析，缺失字段继承上层，显式 `false` 或 `normal` 可以覆盖上层 `true`。Pick 使用 `pickOptions`，Inventory only 使用 `inventoryMode`，奖励开包使用三态 `rewardFlow.open`。Dry Run、Stop、FSU Lock、Only Untradeable、父子 `disabledPiles`、SBC `requirements.maxRating`、特殊卡要求和提交前校验不是普通偏好，只能保持或收紧。Pick 高分保护关闭时只移除运行期生成的保护上限，不得删除 SBC 本身的业务 `maxRating`。

```json
{
  "id": "pick-workflow",
  "strategy": "workflowRoutine",
  "pickOptions": { "highGoldThreshold": 84, "openAtEnd": true },
  "inventoryMode": "inherit",
  "steps": ["dynamic-pick", "daily-common"]
}
```

子 Pick 可配置 `pickOptions: { "openAtEnd": false }` 单独关闭集中领取；支持库存模式的子 Loop 可配置 `inventoryMode: "normal"` 单独忽略全局 Inventory only。

Builder Profile 会跨重登保存，但 Active Profile 中绑定的动态 Pick 必须在每次会话重新扫描成功后才会恢复。需要共享时使用 Builder `Export`；需要加载旧配置时使用 Builder 的 JSON validation 页，导入结果仍需显式保存和激活。

仓库中的可下载 Profile 位于 [`profiles/`](profiles/)。每个 `*.profile.json` descriptor 必须提供官方 `preset` 或完整 `config`，并通过 `npm run check:profiles` 校验；动态扫描 Pick 快照不得作为静态 Profile 上传。`npm run build:profiles` 会在 `dist/profiles/` 生成可由 Builder JSON validation 页面导入的 `*.loops.json`、manifest 和说明文件。Profile 文件合并到 `main` 后，GitHub Actions 会重新生成 `DailyLoopRunner.profiles.zip` 并更新与当前 `package.json` 版本一致的最新 Release；发布新 Release 时也会自动附加该 ZIP、manifest、userscript 和完整 Loop 配置。

### Reward Alerts

Reward Alerts 只监听 Runner 自己打开的包，不监听用户手动打开的商店包。EA 成功返回开包物品后会立即识别符合条件的卡，不等待后续 Unassigned 清理完成；提示或远程发送失败不会阻断开包和清理流程。

- `Preview highlight`：只使用模拟的高分特殊卡展示网页内 Toast 和烟花，不开包、不访问 EA，也不会触发 Desktop notification 或 ntfy 请求。
- `Send desktop test`：实际调用 Tampermonkey `GM_notification`，通知显示在当前设备的系统/浏览器通知中心，不会在网页内模拟一个通知框。
- `Send ntfy test`：使用当前 topic/token 向 `https://ntfy.sh` 实际发送一条测试通知；它不是本地模拟。Topic 无效时按钮保持禁用。
- 三个入口彼此独立。视觉 Preview 不会自动执行 Desktop 或 ntfy 测试，避免仅查看动画时产生真实系统通知或远程推送。
- 同一包命中的球员合并成一条桌面/ntfy 消息，避免连续逐卡推送。
- ntfy topic 和可选 token 保存在 Tampermonkey 隔离存储中，不写入页面 localStorage 或日志。topic 应使用难以猜测的随机值。

## 主要 Loop

### One-click Daily Loop

`One-click Daily Loop` 按以下顺序运行：

1. Daily Bronze
2. Daily Silver
3. Daily Common
4. Daily Rare

`Built-in`、`Default` 和 `Bronze/Silver Inventory Only` 都使用以上四步，不会自动打开 Rare Gold 来源包。选择 `Daily + Rare Pack to 2x84+` Profile 时，才会在第 4 步之后追加 `Daily Rare Pack to 2x84+ Loop`。

每个 Daily 阶段会读取当前实际完成进度：

- 已完成的阶段直接跳过。
- 部分完成的阶段只运行剩余次数。
- Daily 阶段不按固定 7 次重新执行，而是以 EA 返回的当日剩余次数为准。
- `One-click Daily Loop` 不读取 `rounds`；终止条件是当前 Daily SBC 已经耗尽，或流程触发安全停止。专用 Rare Pack Profile 追加的第 5 步会继续处理匹配来源包。
- 某阶段安全停止后，可以处理问题并重新点击同一个 One-click 继续。
- `openRewardPacks` 默认关闭，避免一次性扩大 Unassigned 压力。

Daily Bronze 和 Silver 会优先消费对应重复卡。Daily Common 严格使用 5 银加 5 铜；材料不足时按配置尝试对应补货包，最后才使用 Club。Daily Rare 严格使用普通金，并在库存不足时尝试 `11x Gold Players Pack`。

启用全局 `Inventory only` 后，One-click 会把该模式传给所有声明支持它的子 Loop。Daily Bronze/Silver 保持原行为：不打开现有或新获得的铜/银球员包，也不受 `Open reward packs` 控制，直接从库存完成剩余次数。Daily Common/Rare 属于 Supply-and-Craft family，会跳过 shortage/source packs 并仅使用当前库存；库存不足时停止。专用 Rare Pack Profile 中追加的 `Daily Rare Pack to 2x84+` 不支持该模式，仍保持自身来源包工作流。需要保留某个子 Loop 的正常模式时，在该子 Loop 配置 `inventoryMode: "normal"`。

单项 Daily Loop 和 MVP/验证 Loop 默认不进入主下拉列表，仅供 One-click、Builder 和自定义 Workflow 引用。

### Daily Rare Pack to 2x84+

逐个打开匹配的：

- `5x Max. 78 Rare Gold Players Pack`
- `5x 80+ Rare Gold Players Pack`

非重复卡正常入库；低分稀有金重复卡用于 `2x 84+ Upgrade`，不足时按配置从 Storage、Transfer 和 Club 补齐。默认保护 82+ 普通金和特殊卡。

独立运行时，该 Loop 使用 `rounds` 作为本次 `2x84+` 的最低目标：先处理完当前所有匹配来源包，并把启动时已有重复卡及开包期间提交的 `2x84+` 计入目标；来源包耗尽后，再调用配置的 `2x84+ Fodder Loop` 从库存补足剩余次数。为清理刚开出的重复卡，包阶段允许实际完成数超过 `rounds`，但库存兜底不会继续超额。是否打开 `2x84+` 奖励由 `Open reward packs` 决定。

在 `Daily + Rare Pack to 2x84+` Profile 中作为 One-click 的追加步骤时，它不读取 UI `rounds`：仍会开完全部匹配来源包，但来源耗尽后最多只做一次库存兜底。Built-in、Default 和 Bronze/Silver Inventory Only 不包含该步骤。独立的 `2x84+ Fodder Loop` 继续保留，适合完全不依赖 Daily 来源包时按 `rounds` 连续制作。

### Player Pick

当前 Pick 来源：

- `1 of 3 84+ Player Pick`：扫描到 `repeats:0` 且 Set/Challenge 仍可用时按不限次 Pick 加入会话列表；单阵需要 3 张普通稀有金和 1 张普通普金，最终选 1 张，并显示 `rounds` 控制本次完成数。
- `4 of 10 83+ Player Pick`：动态扫描生成的限次多阵 Pick；两个 Challenge 各需要 10 张普通金卡，EA 没有限制 Rare/Common。Runner 按 `Unassigned -> Storage -> Transfer -> Club` 先搜索并使用所有合格 Common Gold，只有所有 pile 的 Common 都不足时才按相同顺序使用 Rare Gold 补足。按 EA 当前剩余次数执行到耗尽，不显示 `rounds`。
- `1 of 5 83+ Player Pick`：已从静态配置移除；扫描到活动可用且元数据完整时，动态生成 4 张普通稀有金、最终选 1 张的会话 Loop。
- `1 of 3 84+ Summer Tournament Nations Player Pick`：已从静态配置移除；只要奖励与唯一 Challenge 元数据完整，就动态生成 4 张普通稀有金、最终选 1 张的会话 Loop。即使 EA Set 状态报告 `completed`，也会加入一次性运行探测入口；实际 Challenge 不可用时明确失败并停止。
- `5 of 10 82+ Players Pick`：活动已过期，静态配置和会话入口均已移除，不再出现在 Loop 列表中。

Player Pick 会严格保持 EA 元数据或静态配置中的普金/稀有金比例；Challenge 只要求 Gold 而没有 rarity 条件时，采用 Common-first 策略：跨全部优先 pile 先耗尽合格 Common，再用 Rare 补足。FSU 的同分稀有优先不会覆盖该规则。所有情况都遵守高分保护、FSU Lock、Only Untradeable、联赛和 Evolution 等过滤。

启用 `Open Picks at end` 后，Runner 会把启动时已存在的同类型 pending Pick 纳入本次处理目标，保留这些奖励并继续提交剩余次数。不限次 Pick 的提交目标由 `rounds` 决定；限次 Pick 的提交目标来自 EA Set 当前剩余次数，已有 pending Pick 不会占用这部分剩余次数。达到目标、SBC 已完成或材料不足后，会依次开启本次累计的 Pick，并继续使用原有候选排序、人工介入和汇总页面。中途停止或刷新后可再次运行同一个 Pick Loop 继续；其它类型的 pending Pick 仍会触发安全停止。Provision 内部的前置 Pick 不使用该批量选项。

候选排序顺序为：

1. 评分更高
2. 特殊卡优先
3. 非重复优先
4. 实时价格更高

FUT.GG 返回 403 或无有效价格时会自动回退 FUTNext。价格会显示在 Pick 日志和汇总中。达到人工介入条件时，脚本会弹出选择窗口等待用户确认。

Player Pick、普通 Loop 与 Batch Open 使用统一逐卡 recap renderer：每页最多 15 条，支持 Previous/Next 和 stopped/preserved/blocked 原因。普通卡按 Bronze、Silver、Common Gold、Rare Gold 85-、86-88、89+ 使用独立整行背景和评分色块；特殊卡优先使用 EA rarity card color map，无法安全读取时按 94-、95-97、98-99 三档回退。Pick 额外显示 Pick 序号和最终库存去向，普通 Loop 显示来源包，Batch 保留包数量、跳过数量及金银铜汇总。真实运行仅在本次结果包含 Rare Gold 或 Special 时展示 recap；Preview 仍使用固定模拟数据。EA 已确认的 Pick 必须立即计入本次结果；即使后续 Unassigned/Storage 清理失败，也会显示已选卡、`blocked` 状态和停止原因，尚未打开的 Pick 不会被计入。

### Provision Crafting Loop

Provision material routing is fixed by the configured stage order at every cleanup boundary: Common Gold uses `4 of 10 83+ Player Pick -> 5x 80+ Upgrade`, while Rare Gold uses `2x 84+ Upgrade`. These materials are never consumed by generic Daily Rare or Gold Upgrade recovery; incomplete materials remain reserved for a later Provision round.

每个 round 打开一个 `Provision Pack`，然后：

1. 处理尚未选择的目标 Pick。
2. 当前前置 Pick 通过稳定 Set/奖励身份引用动态扫描结果。默认指向 `4 of 10 83+ Player Pick`（Set `#1256`、Reward `#5005713`）；如果本包产生符合其要求的重复卡且目标 Pick 尚未完成，则按动态 Challenge 进度完成允许的子阵。扫描结果不可用时跳过前置 Pick并继续后续 crafting stages，不会回退到过期的 82+ Pick。材料保护使用当前 Options 中的 `Protect Pick fodder >= N` 设置。
3. 将剩余重复材料交给配置中的 `craftingUpgrades`。
4. 非重复卡和无法用于当前 stage 的卡按通用 Unassigned 规则处理。

当前默认前置 Pick 和后续 crafting SBC 只是配置，不是 Workflow 写死的名称或人数。

### Bronze/Silver/5x 80+ Exhaustion Loop

该 Loop 不打开来源包，按顺序用库存完成 `Bronze Upgrade -> Silver Upgrade -> 5x 80+ Upgrade`。Bronze 每次提交后会立即打开其 Silver 奖励，Silver 每次提交后会立即打开其 Common Gold 奖励，使产出继续供给后续阶段；第三阶段以 9 张 81 分及以下 Common Gold 持续完成 `5x 80+ Upgrade`，直到对应材料不足。

- Bronze 和 Silver 阶段只使用对应等级的普通卡，不使用特殊卡。
- `5x 80+ Upgrade` 阶段严格使用 81 分及以下 Common Gold，不会混入 Rare Gold、特殊卡或受保护高分卡。
- 选材顺序是 `Unassigned -> Storage -> Transfer -> Club`，继续遵守 FSU Only Untradeable、排除联赛、Evolution、Lock 和评分范围。
- Bronze/Silver 奖励是本 Loop 后续阶段的必要输入，因此只在该组合 Loop 内强制逐包打开，不受 UI `Open reward packs` 控制；其它 Bronze/Silver Loop 不受影响。
- `5x 80+ Upgrade` 的 `5x 80+ Rare Gold Players Pack` 始终保持延迟；仅当 UI `Open reward packs` 开启且全部阶段正常结束时才批量打开，blocked/stopped 后不会进入批量开包。
- 铜、银不足 11 张或 Common Gold 不足 9 张时正常结束对应阶段，不会强行使用其它类型材料。

### 5x 80+ Exhaustion Loop

该 Loop 使用统一库存选材和提交事务，以 9 张 81 分及以下 Common Gold 反复完成 `5x 80+ Upgrade`，直到不足一个完整安全阵容。

- 选材严格为 Common Gold，不会使用 Rare Gold、特殊卡或受保护高分卡。
- `Open reward packs` 关闭时，所有 `5x 80+ Rare Gold Players Pack` 奖励保留在 My Packs。
- `Open reward packs` 开启时，提交阶段仍不逐包打开；正常耗尽后才批量打开所有匹配奖励包，并走通用开包、通知和 Unassigned 处理流程。
- 如果选材或提交触发 blocked/stopped，流程不会进入批量开包阶段。

### 评分型 SBC

动态扫描生成的 `84+ TOTW Upgrade`、`2x84+ Upgrade` 和高评分 xN Upgrade 使用通用安全策略与同一套评分求解/提交基础设施：

- 从当前 EA Challenge 动态读取人数、目标评分和可识别的特殊条件。
- 先选择满足要求的最低评分组合，再按 `unassigned -> storage -> transfer -> club` 比较同评分材料来源。
- 保存前、保存后和提交前都会复核实际阵容。
- 遇到无法识别的动态条件时停止。

高评分 Upgrade 会按扫描到的 Challenge 特殊条件决定是否要求 TOTW/TOTS/FOF，并可按配置自动完成当前扫描到的 TOTW 或 2x84+ 前置补料。高评分 Upgrade 奖励默认保留，不自动打开。

动态 Upgrade 会按 `timesCompleted/repeats` 计算当前 EA 剩余次数；信息不可用时仍保留 50 次内部安全上限，直到 SBC 已完成或材料、保护规则、运行状态使流程安全停止。

Dynamic Upgrade 只扫描 EA 明确归入 `Upgrades` Category 的白名单家族。当前支持 `2x84+ Upgrade`、`84+ TOTW Upgrade` 和高评分 xN（例如 84x10、85x10、7x87+）；三类都直接从 Set、Challenge 和 Pack reward 元数据生成当前会话 Loop，不再依赖对应的内置实体模板。`2x84+` 使用独立 activity family，不会被高评分 xN 误分类；Daily Rare 的库存 fallback 也按该 family 唯一解析。多阵、化学、未知 eligibility、多个奖励、无法确认 Category 或同 family 多个候选的 SBC 只记录诊断并安全停止。高卡、特殊卡、可交易卡和 pile 顺序保护来自代码中的通用安全策略，不按奖励评分猜测，也不保存当前活动的 Set/Challenge/Pack ID。

### MVP 和验证 Loop

以下 MVP 和验证 Loop 保留在内置配置与 Builder 中，但不再显示在主 Loop 下拉列表：

- `One-click Daily MVP (1 each)`
- 四个单项 Daily MVP
- `Bronze Upgrade Validation`

`Bronze Upgrade Validation` 是早期验证入口，普通日常使用不需要选择它，因此默认隐藏在 MVP 列表中。

## 安全规则

### FSU 设置

Runner 会读取当前 FSU 设置，包括：

- Only Untradeable
- 排除联赛
- Evolution 保护
- Golden Player Range
- 普通/稀有材料偏好
- Storage 优先级
- Lock player

FSU 过滤可能导致“库存看起来足够，但 Runner 只识别到部分材料”。遇到这种情况先检查日志中的 `FSU settings sync` 和 selection diagnostics，不要直接放宽保护。

### 高分卡和特殊卡

普通数量型 SBC 默认通过配置的 `protectHighGold`、`maxRating` 和 `allowSpecial` 保护高分普通金及特殊卡。Player Pick 的保护阈值可以在 Options 修改。

旧 Profile 或用户 JSON 中的 `preferScannedMetadata` 字段仍可通过兼容层读取，但主面板不再提供该开关。当前 Built-in Pick 都由扫描动态生成，不依赖静态 Pick metadata 覆盖。

评分型 SBC 是明确例外：它们必须使用足够评分的材料，但仍受动态 Challenge、特殊卡数量、FSU Lock 和提交上限校验。

### Unassigned

默认处理顺序：

1. 非重复卡进入 Club。
2. 可交易重复卡进入 Transfer List。
3. 不可交易重复卡优先 Swap 可交易版本，否则进入 SBC Storage。
4. 容量不足时按配置的恢复配方尝试消耗重复卡。
5. 无法确认安全处理方式时停止。

当前默认恢复路径：

- 铜卡：Daily Bronze -> Daily Common -> Bronze Upgrade
- 银卡：Daily Silver -> Daily Common -> Silver Upgrade
- 普金：Daily Rare -> FOF Crafting -> Gold Upgrade
- 稀有金：2x84+ Upgrade

这些路径定义在配置中，可以替换，不应写死到通用 Unassigned 模块。

`supplyAndCraft` Loop 如果把 `unassigned` 放入 `primaryPiles`，pre-selection cleanup 会保留符合当前 SBC requirements 的重复卡信号，先通过 Club/Storage 中对应的可提交实体完成当前阵容。保留期间不会继续打开 shortage pack；只有当前 Unassigned 材料无法参与该 SBC 时，才按普通清理和 recovery 路径处理。Daily Common 因此会先消费现有银/铜重复卡，再从其他 pile 补齐 5 银 + 5 铜。

恢复配方按与当前卡种策略匹配的 requirement 槽位计算本次应消耗的重复卡。例如 Daily Common 的 5 铜 + 5 银阵面对 7 张阻塞铜卡时，先消费最多 5 张铜卡并刷新 Unassigned，再重新规划剩余 2 张；若 Daily Common 已不可用，则继续进入 Bronze Upgrade。混合阵容的总人数不会再被误当成单一卡种容量。

## 常见问题

### SBC 已提交，但找不到 Player Pick

通常是 EA 实际奖励内部名称与配置别名不同。日志会显示实际名称并停止，不会领取其它 Pick。保留日志后补充精确别名，再运行同一个 Loop；Pending Pick 会在提交新 SBC 前优先处理。

### FUT.GG 403

这是价格接口访问限制，不影响 Pick 本身。Runner 会尝试 FUTNext；两个来源都失败时，涉及价格边界的候选可能要求人工选择。

### Claim Rewards 等待

Runner 会综合奖励页面、My Packs 数量和 SBC 进度判断奖励是否已经发放。未知页面状态仍可能触发有限等待。若日志显示进度已前进，则不会重复提交。

### Storage 或 Transfer 已满

脚本会先尝试配置的 Unassigned 恢复 SBC。若没有安全配方、材料不足或恢复没有改变 Unassigned 指纹，会停止并给出容量及阻塞原因。

### 如何提供有效日志

建议提供：

- 从 `Ready v...` 开始的完整日志。
- 当时 Unassigned、Storage、Transfer 的容量。
- 当前 SBC 完成次数和剩余次数。
- 页面截图，尤其是 Unassigned 或 SBC 页面。
- 明确说明是 Dry run 还是 Live。

## 高级使用与开发

### 外部配置

`DailyLoopRunner.loops.json` 是可选的外部配置。普通使用不依赖它；开发时可通过本地服务加载。内置配置和外部 JSON 必须保持 Loop id、顺序和关键元数据一致，完整校验由 `npm run check:config` 执行。

### 本地热加载

安装 `DailyLoopRunnerHotReload.user.js` 后，在仓库目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File ".\StartLoopRunnerDevServer.ps1"
```

修改源码后执行：

```powershell
npm run build
```

然后在 Web App 点击 `Reload Loop`。本地服务通过 `http://127.0.0.1:8765/DailyLoopRunner.user.js` 提供构建产物。

### 工程结构概览

```text
src/
  config/       内置 Loop、schema/展示、FSU 兼容解析和恢复策略
  domain/       稳定数据契约和评分公式
  selection/    普通选材、评分模型/求解和临时重复信号
  pack/         通用开包事务和开包物品策略
  unassigned/   Unassigned 规划、恢复和执行
  sbc/          通用 SBC 提交事务
  reward/       SBC 奖励确认、Player Pick 排序/汇总和价格 fallback
  workflows/    无 EA/DOM 依赖的流程状态机
  adapters/     EA、FSU、DOM/Storage/HTTP/Wait/User Effects 和统一 Runtime 工厂
  ui/           主面板、命令、日志、Player Pick recap/人工选择和 SBC 页面覆盖层
  userscript-entry.js
tests/
scripts/
profiles/      可下载 Builder Profile descriptor；CI 校验并打包到 Release
```

详细职责、依赖方向、现存边界和修改规则见 [AGENTS.md](AGENTS.md)。

### 如何向 AI agent 下指令

一个可执行的任务说明至少应包含：

- 当前工作目录：`.\DailyLoopRunner`
- 目标 Loop 或具体页面流程
- 当前行为、期望行为和边界条件
- 完整日志路径及截图
- 是否允许修改共享底层模块
- 当前状态下修复后是否必须可以直接继续运行
- 需要执行的验证，例如 `npm run verify` 和目标 Loop 的真实页面验证

示例：

```text
请先读取 AGENTS.md 和完整日志，不要立即修改。
定位 Daily Rare Pack 在 Storage 只剩 2 个空位时停止的根因，确认是 Workflow、
Unassigned、Selection 还是 SBC Submission 层的问题。先列出影响面和回归测试，
再实现最小修复。不得放宽 82+、特殊卡和 FSU Lock 保护。修复后运行 npm run verify，
并保证当前 Unassigned 状态重新点击 One-click Daily 可以继续。
```

对于共享的 Pack、Unassigned、Selection、SBC Submission 或 Adapter 修改，应明确要求 agent 检查所有受影响 Loop，并增加回归测试锁定问题。

## 构建与验证

安装依赖：

```powershell
npm ci
```

完整验证：

```powershell
npm run verify
```

该命令依次执行：

1. JavaScript 语法检查
2. 内置/外部配置校验
3. `profiles/` Profile descriptor 和物化配置校验
4. 架构直接调用点检查
5. 全部 Vitest 测试
6. esbuild 打包
7. 根目录与 `dist` 发布产物一致性检查

发布文件由 `src/userscript-entry.js` 和其模块依赖构建生成：

```text
src/userscript-entry.js + src/**
        -> esbuild IIFE bundle
        -> DailyLoopRunner.user.js
        -> dist/DailyLoopRunner.user.js
```

不要手工修改两个生成文件。源码修改完成后执行 `npm run build` 或 `npm run verify`。

## 已知限制

- EA、FSU 和 Enhancer 都是运行时依赖，其内部模型或名称变化可能要求补充适配。
- Dynamic SBC 扫描只读取当前 SBC Set、Category、Challenge 和奖励元数据，不会提交 SBC、领取 Pick 或开包。启动后会自动增量扫描，也可在 Options 中使用 `Scan SBCs`；`Incremental` 按逐个 SBC 的结构指纹复用 24 小时内未变化的 Challenge 快照，`Full rescan` 强制重新加载所有候选 SBC，`Clear cache` 清除当前账号缓存后重建。完全支持且不与静态配置重复的 Player Pick 会作为当前会话 Loop 加入下拉列表；EA `Upgrades` Category 中通过安全校验的 84+ TOTW、高评分 xN Upgrade 会更新现有 Loop 元数据或生成 Dynamic Loop。Challenge 元数据遇到 EA 瞬时错误时会进行最多 3 次带退避的整轮重试；仍失败的 SBC 本次保持 unavailable，不会根据名称猜测材料要求。缓存结果必须经过当前会话的 Set/Category 验证。`repeats > 0` 的有限 Pick 按 EA 当前剩余次数运行并隐藏 `rounds`；`repeats:0` 且 Set/Challenge 仍可用的不限次 Pick 显示 `rounds`。奖励身份、人数、材料条件、评分或 Category 证据不完整，以及化学或未知条件不会生成可运行 Loop。
- FUT.GG 可能返回 403，当前使用 FUTNext 作为回退。
- Node 自动测试不能替代真实 Web App 验证；共享底层改动完成后仍需验证受影响的真实页面流程。
- 核心架构重构已在 `0.5.12` 收尾。`src/userscript-entry.js` 继续承担运行时组合、页面导航编排和 Workflow 副作用回调；后续不会仅为了减少行数继续拆分，动态 Pick 等功能进度以 Milestone 文档为准。
