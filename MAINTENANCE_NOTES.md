# FC26 Daily Loop Runner 维护笔记

这份笔记记录的是已经在真实 Web App 环境里验证过的边界。新功能、重构或第三方脚本更新时，优先保持这些约束成立；日志好看不能替代材料和提交安全。

## 1. 职责边界

Runner 负责 SBC 流程编排、库存选择、奖励包处理和提交前检查。FSU 是普通金材料策略的权威来源：Only Untradeable、排除联赛、Exclude Evolution、Golden Player Range、Storage 优先和 Lock player 都必须跟随，Runner 不应为了凑材料而绕过它们。

评分型 SBC 例外在于选阵容不依赖 FSU 的页面一键填充：Runner 会读取 FSU 过滤和锁卡，再按当前 EA Challenge 的动态条件计算最低评分组合。这样既不会被 FSU 的页面填阵节奏卡住，也不会把 FSU 当成可绕过的建议。

## 2. 不可回退的安全规则

1. `loans === -1` 是 EA/FSU 的无限使用普通卡，不是 loan。`0` 或正数才是受限使用；概念卡、真实 loan、limited-use、academy、进行中的交易卡都不能提交。
2. FSU Lock 必须同时按 item、resource、definition、asset 和 guid 类 ID 匹配。锁卡在任何 Runner 自选路径中都不可进入候选池。
3. 同一 SBC squad 中 `definitionId` 必须唯一。Unassigned 和 Transfer 的 duplicate signal 只能解析成 Club/Storage 中真正可提交的对应卡，不能把 signal 本身当作可提交物品。
4. 84x10 只允许 Challenge 要求的那一张 `84+ TOTW/TOTS/FOF`；额外特殊卡、错误特殊卡、超出 `maxSubmittedRating` 的卡和受保护 ID 都必须在保存和提交前拦住。
5. `Dry run` 绝不移动物品、开包、保存 squad、领取奖励或提交 SBC。它可以读取 Challenge、构建候选、计算阵容和打印计划，但不能为了“更接近 live”产生写操作。

## 3. 开包后的正确顺序

EA 的 pack response 经常早于 Unassigned cache 刷新。所有自动打开的奖励包必须遵守：

1. `openPack()` 获取返回物品。
2. 先用返回物品直接 materialize：非重复进 club，可交易重复进 transfer，不可交易重复进 storage。
3. 再执行残留 Unassigned cleanup。
4. 最后刷新/解析 recent reward items，才允许下一次 SBC 选料。

不要把第 2、3 步颠倒。否则奖励卡会晚到 Unassigned，下一轮会误报缺料，或留下无法继续循环的卡。

## 4. 评分型 SBC 约束

`ratingSbcFill` 适用于 84+ TOTW、84x10 及将来同类型 SBC：

- 从当前 Challenge 读取人数、TEAM_RATING 和可识别的球员条件；遇到 chemistry 或未知 eligibility key，安全停止。
- 候选先经过 Runner 硬保护和 FSU 过滤，再按最低评分向量求解；同一评分向量才比较 `unassigned -> storage -> transfer -> club` 来源优先级。
- 保存前、保存后、提交前都复核人数、唯一 `definitionId`、EA 评分、动态条件、特殊卡数量和 `challenge.meetsRequirements()`。
- 搜索必须有 `maxSearchNodes`、`maxSearchMs` 和 `yieldEveryNodes` 上限。大量 club 数据下宁可带诊断停止，也不能长时间阻塞浏览器。

评分型 live 走 EA SBC DAO 的后台 Challenge/Squad/submit 路径，避免创建可视 squad controller 触发 FSU/Enhancer 页面增强。它不改变 FSU 材料过滤原则。

## 5. Loop 家族与开包开关

| Loop | 材料/提交策略 | 奖励包策略 |
| --- | --- | --- |
| Daily | FSU 页面填充加提交前检查 | 最后一包是否打开取决于 `openRewardPacks` |
| 2x84+ Fodder | 仅 6 张 `<=81` 普通金稀有，优先 storage/club | 强制开包并 materialize，供 84x10 补料 |
| 84+ TOTW | 动态评分求解，无特殊卡 | 强制领奖、开 TOTW 包并 materialize |
| 84x10 | 动态评分求解，恰好 1 张合格 requirement special | 默认保留主奖励包；面板 `Open reward packs` 才开 |
| Provision | 配置驱动的 Pick 与 crafting stages | 每个 stage 继承该 run 的开包设置 |

不要因为某个 loop 勾选了 `Open reward packs` 就假设其它 loop 也会开包。`forceOpenRewardPacks` 的子流程优先级更高，用于 2x84+ 和 TOTW 这种后续流程依赖奖励物的场景。

## 6. 常见日志怎么判断

| 日志/现象 | 优先判断 | 正确处理 |
| --- | --- | --- |
| `fsu-locked-player` | FSU 锁卡生效 | 保持锁定；选择其它卡，不要在 Runner 绕过 |
| `fsu-only-untradeable` 或 `fsu-gold-range-*` | FSU 设定筛掉了材料 | 在 FSU 的 SBC ignore player configuration 调整后重试 |
| `rating search exceeded ...` | 候选太多或组合复杂 | 保留日志；优化配置/候选池，不提高搜索上限到无界 |
| `unknown eligibility key` / chemistry | 当前动态 Challenge 尚未被安全支持 | 停止并记录 Challenge 信息，不提交 |
| `reward pack not found` | Store/Packs cache 或领奖时序异常 | 先确认奖励已领取，再刷新 packs；不要盲目重复提交 |
| 材料已经开出却报缺料 | 检查是否走了 materialize 再 cleanup | 修复时序，不要简单放宽材料规则 |

## 7. 最小回归清单

提交前至少完成以下检查：

1. `node --check .\\DailyLoopRunner.user.js`。
2. `Get-Content -Raw .\\DailyLoopRunner.loops.json | ConvertFrom-Json | Out-Null`。
3. 确认脚本 metadata、`window[APP_KEY].version` 和 README 顶部版本一致。
4. 对受影响 loop 跑一次 Dry run，确认没有 `Clicked FSU`、`Moving`、`Opening pack`、`Submitting SBC` 或保存 squad 的日志。
5. 对自动开包路径确认日志顺序是 `auto-opened`、materialize/移动、cleanup，而不是 cleanup 后才发现新卡。
6. 用至少一张 FSU Lock、一个 `loans:-1` 普通卡和一个真实 loan/limited-use 卡检查候选筛选。
7. 新增评分型 SBC 时，先验证动态 requirement 解析、求解上限和保存后三重检查，再允许 live。

## 8. 发布纪律

- 正式用户只安装 `DailyLoopRunner.user.js`；`DailyLoopRunnerHotReload.user.js` 仅用于本地开发。
- 外部 `DailyLoopRunner.loops.json` 与内置 loop 配置必须一起更新，尤其是 `hidden`、`mvp`、`ratingSbcFill` 和 `openRewardPacks`。
- 每次改动先看 `git diff --check`，不要用整文件格式化掩盖真实 diff。
- 用户反馈优先索取完整日志和当前 FSU settings sync 行。截图能说明 UI，日志才能说明选择、缓存和提交路径。
