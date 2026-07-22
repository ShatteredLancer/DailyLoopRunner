# FC26 Daily Loop Runner

当前版本：`0.5.41`

Daily Loop Runner 是运行在 EA FC Web App 中的 Tampermonkey 脚本，用于编排开包、处理 Unassigned、选择 SBC 材料、提交 SBC 和处理 Player Pick。脚本会尽量复用当前页面已经加载的 EA、FSU 和 Enhancer 能力，并在无法确认材料或奖励身份时停止，而不是继续猜测。

## 文档入口

- 本文：面向使用者，介绍安装、界面、主要 Loop、常见问题和基本开发方式。
- [AGENTS.md](AGENTS.md)：面向 AI agent 和开发者的完整工程手册，包括架构、模块职责、影响面分析、测试和发布流程。
- [REFACTORING_MILESTONES.md](REFACTORING_MILESTONES.md)：重构进度、未完成工作和后续 Milestone。
- [FSU_mod/README.md](FSU_mod/README.md)：FSU 优化版安装、上游更新、补丁应用和回滚说明。
- [FSU_mod/FSU_CLUB_CACHE_INTEGRATION.md](FSU_mod/FSU_CLUB_CACHE_INTEGRATION.md)：FSU Club 实体缓存、权威校验、Runner/Enhancer 交互、诊断和完整开发手册。

## 安装要求

浏览器中需要启用：

- Tampermonkey
- FSU
- FC26 Enhancer
- `DailyLoopRunner.user.js`

安装或更新时，将仓库根目录生成的 `DailyLoopRunner.user.js` 更新到 Tampermonkey。不要直接使用 `src/userscript-entry.js`，它包含模块导入，必须先经过构建。

进入 EA FC Web App 后，等待页面、FSU 和 Enhancer 初始化。面板出现 `Ready v0.5.41` 后即可开始；优化版 FSU 命中快速缓存时会进入 `trusted-provisional`，后台继续校验已恢复的 Club 缓存。Runner 会在每次保存 SBC 前只向 EA 校验本次选中的 Club 球员，全量校验结束后自动切换为普通 ready 状态。

FSU 不再显示前台 Club loading 时，可能正在后台校验，也可能已进入快速缓存状态。Runner 的 Live SBC 只有在选中的 Club 球员通过提交前定向 EA 校验后才会保存。详细状态和故障调查见 [FSU_mod/FSU_CLUB_CACHE_INTEGRATION.md](FSU_mod/FSU_CLUB_CACHE_INTEGRATION.md)。

## 基本操作

1. 在下拉列表选择 Loop。
2. 首次运行高风险或新加入的 Loop 时，先在 Options 中启用 `Dry run`。
3. 如果当前 Loop 显示 `rounds`，设置本次要执行的数量；Daily 类 Loop 不使用该选项。
4. 点击 `Start`。
5. 需要停止时点击 `Stop`，脚本会在下一个可停止点结束。
6. 出错时打开 Options，点击 `Save log`，保留完整日志供分析。

默认面板是简洁模式，只显示 Loop、`Start`、`Stop` 和最新一行日志。

- `Options`：展开运行选项、配置按钮和完整日志。
- `Hide`：收起 Options。
- `L`：缩成可拖动的小图标，再次点击恢复。
- `Batch Open`：扫描 `My Packs`，编辑并执行记忆的批量开包列表。
- `View recap`：重新查看最近一次 Player Pick 或 Batch Open 汇总。

Options 中的完整日志会占用面板剩余空间并独立滚动；长错误栈和 URL 会自动换行，不会被面板边界截断。

### Batch Open

`Batch Open` 是独立工具，不加入 Loop 下拉列表，也不读取 `rounds`：

1. 点击主面板的 `Batch Open`，Runner 会刷新并扫描当前 `My Packs`。
2. 在 `My Packs` 区域点击 `Add v`：选择 `Add 1` 加入一包，或选择 `Add all (N)` 进入动态全部模式，不需要输入数量。动态全部模式记忆的是 `all`，不是当时的数字；下次打开弹窗和正式启动前都会读取实时 My Packs 数量。已加入的类型可通过 `Added v` 重设为固定 1 或动态全部数量。
3. 列表、固定数量和 `all` 模式保存在浏览器本地存储中；下次打开弹窗会直接恢复。已经不在 `My Packs` 的记忆项仍会保留并显示 `unavailable`；`all` 模式实时数量为 0 时执行阶段会安全跳过。
4. 点击 `Start batch` 后按列表顺序逐包打开。每包都走 Runner 的通用开包、Reward Alerts 和 Unassigned 处理流程；可用主面板 `Stop` 在下一个安全点停止。
5. 结束后显示 Batch Open recap：特殊球员逐张列出并查询实时价格；其它非特殊球员按“评分 + Rare/Common + Gold/Silver/Bronze”聚合，例如 `89 Rare Gold x2`、`74 Common Silver x4`；整个列表按评分降序排列。价格查询失败只显示 `price:?`，不会阻断 recap。

如果某包开出不可交易重复卡而 Storage/恢复 SBC 无法安全容纳，当前包仍计入已打开并进入 recap，重复卡保留在 Unassigned，后续包停止且显示容量原因。再次运行时会先检查现有 Unassigned；阻塞未解除前不会继续开包。

如果 EA 在开包时返回 `471`，Runner 会排除本次失败的 Pack 实例，完成 Unassigned 同步后进入 Store Packs 刷新，并从同类型的其它实时实例重试一次；不会再次调用刚失败的对象。第二次仍失败时 Batch 会安全停止，日志和 recap 会显示最终错误码、已开数量和跳过数量。

`Preview recap` 使用固定模拟数据，只预览 recap 和烟花，不开包、不访问 EA，也不会发送 Desktop 或 ntfy 通知。

## Options

- `Dry run`：只读取和规划，不移动物品、开包、保存阵容或提交 SBC。
- `Open reward packs`：允许支持该选项的 Loop 自动打开奖励包；默认关闭。
- `Daily Bronze/Silver: inventory only`：Daily Bronze、Daily Silver 及 One-click 中对应的两个阶段不打开任何铜/银球员包，优先处理当前 Unassigned 重复卡，随后通过现有 FSU 填充与安全检查直接从库存提交。库存不足或 Challenge 不可用时停止；该选项默认关闭，不影响 Daily Common、Daily Rare 或其它开包 Loop。
- `Show MVP loops`：显示单次验证和 MVP Loop；默认关闭。
- `Reward alerts`：开包命中配置阈值的特殊卡时触发提示。主面板只显示开关和摘要；点击 `Settings` 可设置最低评分、桌面通知和 ntfy。默认条件为特殊卡且评分不低于 `94`。
- `Protect Pick fodder >= N`：Player Pick SBC 禁止使用评分大于等于阈值的普通金卡，默认 `82`。
- `Auto-pick below N`：所有候选都低于阈值时自动选择，默认 `90`。
- `Open Picks at end`：仅对直接运行的 Player Pick Loop 生效；先完成当前 Loop 的目标数量，再集中开启同类型奖励。不限次 Pick 使用 `rounds`，限次 Pick 使用 EA Set 的当前剩余次数。默认关闭。
- `rounds`：只对显示该字段的数量受控 Loop 生效。不限次 Player Pick、Daily Rare Pack to 2x84+、2x84+ Fodder、84+ TOTW 等可重复 SBC 表示本次目标完成数；Provision 表示本次打开的 Provision Pack 数；隐藏的 Validation 表示测试轮数。One-click Daily、其内部 Daily 阶段、限次 Player Pick 和 84x10 不读取 `rounds`。
- `Refresh caches`：刷新当前可用的 Packs、Unassigned、Storage、Transfer 和 Club 缓存。
- `Load loops JSON`：从本地开发服务加载 `DailyLoopRunner.loops.json`。
- `Built-in loops`：切回脚本内置配置。
- `Edit loop JSON`：临时编辑当前 Loop 配置。
- `Edit workflow JSON`：把当前完整配置（全部小 Loop、Workflow、recovery recipes 和 policies）放入编辑器。
- `Apply workflow JSON`：校验后把编辑器中的完整配置应用到当前浏览器会话；JSON 无效时保留当前配置。`Built-in loops` 可随时恢复脚本内置配置。

### Configurable Workflows

`workflowRoutine` is a declarative sequence for composing existing small loops. It does not accept JavaScript, DOM commands, arbitrary item moves, or direct submit actions. Every referenced small loop still uses its original FSU filtering, dry-run behavior, candidate protection, final validation, and SBC transaction guard.

Use `Edit workflow JSON` to start from the full current configuration. A workflow step can remain a legacy string id, or use an object when it needs a per-step name, completion cap, or reward policy:

```json
{
  "id": "my-fodder-workflow",
  "name": "My Fodder Workflow",
  "strategy": "workflowRoutine",
  "steps": [
    {
      "loopId": "2x84-fodder",
      "name": "Open two fodder rewards",
      "maxCompletions": 2,
      "rewardFlow": {
        "open": "always",
        "packNames": ["2x 84+ Rare Gold Players Pack"],
        "unassignedRecoveryPolicyIds": ["rare-gold-duplicate-overflow"]
      }
    },
    "84x10"
  ]
}
```

`rewardFlow.open` is `inherit`, `always`, or `never`. `inherit` follows the panel `Open reward packs` checkbox, `always` opens the matched reward when available, and `never` leaves it unopened even when the checkbox is on. `packIds` or `packNames` replace that small loop's reward matcher for this step. `unassignedRecoveryPolicyIds` selects only already-defined recovery policies; it cannot bypass item protection or force a move. Flatten workflow steps instead of nesting a routine inside another routine.

Panel-edited workflow JSON lasts for the current browser session. Save it as `DailyLoopRunner.loops.json` and use `Load loops JSON` when the configuration should be shared or reloaded.

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
5. Daily Rare Pack to 2x84+

每个 Daily 阶段会读取当前实际完成进度：

- 已完成的阶段直接跳过。
- 部分完成的阶段只运行剩余次数。
- Daily 阶段不按固定 7 次重新执行，而是以 EA 返回的当日剩余次数为准。
- `One-click Daily Loop` 不读取 `rounds`；终止条件是当前 Daily SBC/来源包已经耗尽，或流程触发安全停止。
- 某阶段安全停止后，可以处理问题并重新点击同一个 One-click 继续。
- `openRewardPacks` 默认关闭，避免一次性扩大 Unassigned 压力。

Daily Bronze 和 Silver 会优先消费对应重复卡。Daily Common 严格使用 5 银加 5 铜；材料不足时按配置尝试对应补货包，最后才使用 Club。Daily Rare 严格使用普通金，并在库存不足时尝试 `11x Gold Players Pack`。

启用 `Daily Bronze/Silver: inventory only` 后，Daily Bronze 和 Daily Silver 不再打开现有或新获得的铜/银球员包，也不受 `Open reward packs` 控制；它们使用当前库存完成剩余次数，产生的奖励包继续保留在 My Packs。One-click 只把该模式传给 Bronze/Silver，后续 Daily Common、Daily Rare 和 2x84+ 阶段保持原流程。

单项 Daily Loop 默认隐藏，仅供 One-click 内部调用；开启 `Show MVP loops` 后可看到单次 MVP 验证入口。

### Daily Rare Pack to 2x84+

逐个打开匹配的：

- `5x Max. 78 Rare Gold Players Pack`
- `5x 80+ Rare Gold Players Pack`

非重复卡正常入库；低分稀有金重复卡用于 `2x 84+ Upgrade`，不足时按配置从 Storage、Transfer 和 Club 补齐。默认保护 82+ 普通金和特殊卡。

独立运行时，该 Loop 使用 `rounds` 作为本次 `2x84+` 的最低目标：先处理完当前所有匹配来源包，并把启动时已有重复卡及开包期间提交的 `2x84+` 计入目标；来源包耗尽后，再调用配置的 `2x84+ Fodder Loop` 从库存补足剩余次数。为清理刚开出的重复卡，包阶段允许实际完成数超过 `rounds`，但库存兜底不会继续超额。是否打开 `2x84+` 奖励由 `Open reward packs` 决定。

作为 `One-click Daily Loop` 的内部步骤时，它不读取 UI `rounds`：仍会开完全部匹配来源包，但来源耗尽后最多只做一次库存兜底。独立的 `2x84+ Fodder Loop` 继续保留，适合完全不依赖 Daily 来源包时按 `rounds` 连续制作。

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

### Provision Crafting Loop

每个 round 打开一个 `Provision Pack`，然后：

1. 处理尚未选择的目标 Pick。
2. 当前前置 Pick 通过稳定 Set/奖励身份引用动态扫描结果。默认指向 `4 of 10 83+ Player Pick`（Set `#1256`、Reward `#5005713`）；如果本包产生符合其要求的重复卡且目标 Pick 尚未完成，则按动态 Challenge 进度完成允许的子阵。扫描结果不可用时跳过前置 Pick并继续后续 crafting stages，不会回退到过期的 82+ Pick。材料保护使用当前 Options 中的 `Protect Pick fodder >= N` 设置。
3. 将剩余重复材料交给配置中的 `craftingUpgrades`。
4. 非重复卡和无法用于当前 stage 的卡按通用 Unassigned 规则处理。

当前默认前置 Pick 和后续 crafting SBC 只是配置，不是 Workflow 写死的名称或人数。

### Bronze/Silver/FOF Glory Hunters Exhaustion Loop

该 Loop 不打开来源包，按顺序用库存完成 `Bronze Upgrade -> Silver Upgrade -> FOF Glory Hunters Crafting Upgrade`。Bronze 每次提交后会立即打开其 Silver 奖励，Silver 每次提交后会立即打开其 Common Gold 奖励，使产出继续供给后续阶段；第三阶段以 9 张 81 分及以下 Common Gold 持续完成 FOF Glory Hunters，直到对应材料不足。

- Bronze 和 Silver 阶段只使用对应等级的普通卡，不使用特殊卡。
- FOF 阶段严格使用 81 分及以下 Common Gold，不会混入 Rare Gold、特殊卡或受保护高分卡。
- 选材顺序是 `Unassigned -> Storage -> Transfer -> Club`，继续遵守 FSU Only Untradeable、排除联赛、Evolution、Lock 和评分范围。
- Bronze/Silver 奖励是本 Loop 后续阶段的必要输入，因此只在该组合 Loop 内强制逐包打开，不受 UI `Open reward packs` 控制；其它 Bronze/Silver Loop 不受影响。
- FOF 的 `5x 80+ Rare Gold Players Pack` 始终保持延迟；仅当 UI `Open reward packs` 开启且全部阶段正常结束时才批量打开，blocked/stopped 后不会进入批量开包。
- 铜、银不足 11 张或 Common Gold 不足 9 张时正常结束对应阶段，不会强行使用其它类型材料。

### FOF Glory Hunters Exhaustion Loop

该 Loop 使用统一库存选材和提交事务，以 9 张 81 分及以下 Common Gold 反复完成 `FOF Glory Hunters Crafting Upgrade`，直到不足一个完整安全阵容。

- 选材严格为 Common Gold，不会使用 Rare Gold、特殊卡或受保护高分卡。
- `Open reward packs` 关闭时，所有 `5x 80+ Rare Gold Players Pack` 奖励保留在 My Packs。
- `Open reward packs` 开启时，提交阶段仍不逐包打开；正常耗尽后才批量打开所有匹配奖励包，并走通用开包、通知和 Unassigned 处理流程。
- 如果选材或提交触发 blocked/stopped，流程不会进入批量开包阶段。

### 评分型 SBC

`84+ TOTW Upgrade Loop` 和 `84x10 Loop` 使用同一套评分求解与提交基础设施：

- 从当前 EA Challenge 动态读取人数、目标评分和可识别的特殊条件。
- 先选择满足要求的最低评分组合，再按 `unassigned -> storage -> transfer -> club` 比较同评分材料来源。
- 保存前、保存后和提交前都会复核实际阵容。
- 遇到无法识别的动态条件时停止。

84x10 默认要求恰好一张符合条件的 TOTW/TOTS/FOF，并可按配置自动完成 TOTW 或 2x84+ 前置补料。84x10 奖励默认保留，不自动打开。

`84x10 Loop` 会持续处理当前仍可用的 Challenge，直到 SBC 已完成或材料、保护规则、运行状态使流程安全停止；内部保留 50 次安全上限，避免异常状态导致无限循环。

### MVP 和验证 Loop

开启 `Show MVP loops` 后可见：

- `One-click Daily MVP (1 each)`
- 四个单项 Daily MVP
- `Bronze Upgrade Validation`
- `2x84+ Fodder Loop`
- `84x10 MVP (1 run)`

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

`Use scanned Pick metadata` 默认关闭，只作用于仍有静态配置的 Pick。启用后会立即重扫，并在扫描结果完整且只匹配一个静态 Pick 时，用扫描得到的 Set/奖励身份、Challenge 数量和材料比例覆盖当前会话中的静态字段；Loop ID、显示名、运行限制和 Provision 引用保持不变。扫描失败、活动已完成、条件不支持或匹配有歧义时继续使用静态配置。没有静态配置的 83+/84+ 无需启用该选项，只要扫描成功就会作为动态会话 Loop 出现。

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
3. 架构直接调用点检查
4. 全部 Vitest 测试
5. esbuild 打包
6. 根目录与 `dist` 发布产物一致性检查

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
- Player Pick 扫描只读取当前 SBC Set/Challenge/奖励元数据，不会提交 SBC 或领取 Pick。启动后会自动扫描，也可在 Options 中点击 `Scan Picks` 重扫；完全支持且不与静态配置重复的 Pick 会作为当前会话 Loop 加入下拉列表。`repeats > 0` 的有限 Pick 按 EA 当前剩余次数运行并隐藏 `rounds`；`repeats:0` 且 Set/Challenge 仍可用的不限次 Pick 显示 `rounds`。EA Set 明确完成但 Challenge 元数据仍完整时，扫描器保留一次性运行探测入口；实际调用失败会明确停止。奖励身份、候选数、选择数、人数或材料条件不完整，以及评分、化学或未知特殊卡条件不会生成可运行 Loop。Provision 可以通过稳定 Set/奖励身份引用当前扫描结果，不再要求为前置 Pick保留过期静态 Loop。
- FUT.GG 可能返回 403，当前使用 FUTNext 作为回退。
- Node 自动测试不能替代真实 Web App 验证；共享底层改动完成后仍需验证受影响的真实页面流程。
- 核心架构重构已在 `0.5.12` 收尾。`src/userscript-entry.js` 继续承担运行时组合、页面导航编排和 Workflow 副作用回调；后续不会仅为了减少行数继续拆分，动态 Pick 等功能进度以 Milestone 文档为准。
