# Rolling Duplicate Swap 产品化评估

## 结论

交换不是 95+ Pick 缺料或 `PLAYER_RARITY_GROUP=83` 缺卡的修复。它只解决一个容量路由问题：把 Unassigned 的重复信号物化成新的 Club 实体，让新的 Club ID 可以提交，同时把原 Club ID 作为受保护实体留在 Unassigned，提交确认后再恢复回 Club。

“只交换特殊卡”可以缩小交换数量，但不能覆盖事务层风险；特殊卡的单卡价值通常更高，因此它不是默认安全模式。第一阶段产品化应使用 `special-only` 或 `safe-only` 进行单卡灰度，默认仍为 `off`。`all-eligible` 只保留给显式受控实验，不应作为推荐生产模式。旧的 `rollingDuplicateSwapEnabled:true` 只迁移到 `special-only`，不会隐式恢复旧的全量交换。

## 交换范围模式

| 模式 | 允许的重复对 | 用途 | 建议 |
| --- | --- | --- | --- |
| `off` | 不交换，全部进入 Storage | 现网默认、故障回退 | 默认 |
| `special-only` | 源和 Club 对应卡都为特殊卡、两边不可交易、价值 fingerprint 完全一致 | 验证特殊卡身份保护 | 单卡灰度；每次最多 1 pair |
| `safe-only` | 源和 Club 对应卡都为普通卡、两边不可交易、价值 fingerprint 完全一致 | 低价值容量验证 | 首选长期生产模式；每次最多 1 pair |
| `all-eligible` | 仅显式实验；仍要求源可确认不可交易、版本和 EA 返回映射完整，但不提供受控 fingerprint/卡种范围保护 | 隔离故障调查 | 禁止生产启用 |

受控模式的 fingerprint 包含 definition、database、rating、rareflag、tradeability、evolution/upgrades、cosmetics、chemistry style、position、attributes、技能、逆足和 groups。任一字段不一致、状态未知、快照没有完整证据或 Club 对应 ID 缺失，均留在 Storage 并停止交换路径。受控模式默认只执行一个 pair；其余重复卡不会借机进入提交阵容。

## 风险与验收

| 风险 | 保护或处理 | 自动验证 |
| --- | --- | --- |
| EA 原生 move 失败或返回零状态 | 不产生新身份；保留/补偿 journal；停止提交 | `native-duplicate-swap-trace`、move failure fixture |
| `clubDuplicates`/`itemIds` 缺失、重复、错配 | 严格一一映射；不猜新 ID | `untradeable-duplicate-swap` response matrix |
| 新 Club ID 缓存延迟 | 有界刷新、按 ID+fingerprint 校验 | materialization/recovery workflow |
| 原 Club counterpart 未到 Unassigned | 有界等待；失败补偿 | materialization postcondition tests |
| definition、版本、交易性或升级变化 | 受控模式 fingerprint 拒绝；事务层 fail closed | fingerprint mismatch tests |
| 多 pair 前成功后失败 | 每 pair 立即 journal；反向补偿；禁止继续提交 | partial multi-pair transaction tests |
| journal 写入/更新/清理失败 | 物理交换先补偿；不能确认则保留 `recovery-required` | persistence failure tests |
| 刷新、Stop、崩溃发生在交换和提交之间 | 启动按精确 protected ID 分类；不假设上次状态完美延续 | startup cancellation/recovery tests |
| 重规划改变 pair 映射 | manifest 和 replan mapping 必须完全一致 | replan mapping tests |
| 新 Club entity 未进入重规划 | submission manifest 要求每个 materialized consume ID 存在 | manifest tests |
| 原 Club ID 被错误放入阵容 | protected refs 断言；提交前拒绝 | protected counterpart manifest tests |
| SBC 结果成功/失败不明确 | 只在明确 confirmation 后进入 restoration；ambiguous 停止 | submission outcome/recovery tests |
| 提交后恢复原 Club ID 失败 | 恢复失败保留 journal，禁止新交换 | restoration/reconciliation tests |
| 恢复后 Ledger 不一致 | 以精确 ID、definition、pile 和 fingerprint 对账 | ledger reconciliation tests |
| recovery SBC 误用交换逻辑 | 交换范围和 transaction context 绑定 Challenge | rolling recovery workflow tests |
| 多张交换增加刷新和 EA 状态漂移 | 默认按单 pair；受控模式只允许安全 pair；多 pair 仍有界 | bounded transaction tests |
| 只按 item ID 误判实体 | 统一 fingerprint；不使用 definition-only fallback | value identity tests |
| 特殊卡范围本身误判 | 使用当前 EA rarity/group matcher；未知分类不交换 | special classification tests |

## 当前验证状态

- 本地自动测试：199 个文件、1746 个测试通过。
- `lint:syntax`、`lint:undef`、`check:config`、`check:architecture` 已通过。
- `special-only`、`safe-only`、`all-eligible`、旧布尔配置迁移和 Storage 路由均有单元测试。
- EA 原生接口仍未在当前账号上启用验证；Node 测试不能证明 EA 服务器一定接受某个 move 请求。

## 真实 EA 灰度门槛

只有在默认 `off`、journal 为空、Storage/Unassigned/Club 对账稳定时才进行。每次只验证一张卡，不同时开包或提交其它 SBC：

1. 先用 `special-only` 验证一张低价值、两边不可交易、无 EVO/升级/化妆、fingerprint 一致的特殊重复卡。
2. 记录 native trace、源 Unassigned ID、原 Club ID、新 Club ID、提交阵容和 journal 每次状态。
3. 确认提交前阵容包含新 Club ID 且绝不包含原 Club ID；确认提交成功后原 Club ID 回到 Club，fingerprint 未变。
4. 再验证一次 EA move 失败/取消路径；确认没有新 journal 残留、没有错误提交和没有把原 Club 卡送入 SBC。
5. 连续单卡通过后，才考虑 `safe-only`；没有必要时不要启用 `all-eligible` 或多 pair。

任何 ID 缺失、缓存延迟超出有界重试、journal 状态不明确、提交结果不明确或 fingerprint 改变，都应立即切回 `off`，先恢复/分类 journal，再重新对账。

## `special-only` 覆盖边界

`special-only` 能覆盖的是业务范围风险：普通卡不会进入交换、Club 交易卡不会进入受控交换、EVO/化妆/化学/属性等 fingerprint 不完整或不一致不会进入交换、未知特殊分类不会猜测放行，并且每次最多一个 pair。它不能单独覆盖 EA move 失败、HTTP 200 无身份映射、缓存延迟、journal 写入失败、重启/崩溃、提交结果不明确或恢复失败；这些风险仍由事务 journal、双侧 postcondition、提交 manifest、Ledger 对账和补偿路径处理。

因此“只交换特殊卡”不是“所有风险都消失”，而是把可触发交换的业务集合缩小到可审计的单卡范围。特殊卡通常价值更高，首个真实验证仍应优先使用低价值、无 EVO/升级/化妆、fingerprint 完整且两边不可交易的卡；无法证明完整 fingerprint 时宁可走 Storage。

## 实机灰度验收

真实账号只允许在 `off` 且 journal 为空时开始，确认 Storage、Unassigned、Club 对账稳定。随后显式选择 `special-only`，一次只保留一张符合条件的重复特殊卡，不同时开包或提交其它 SBC。必须记录 native trace、源 Unassigned ID、原 Club ID、新 Club ID、响应数组长度、提交 manifest 和 journal 状态，并逐项确认：

1. EA move 使用单实体调用，响应 `success` 明确且 `clubDuplicates/itemIds` 一一对应，数量恰为 1。
2. 提交前阵容只含新 Club ID，绝不含原 Club ID；原 Club ID 必须在 Unassigned 且 fingerprint 未变。
3. 提交成功后原 Club ID 回到 Club，journal 清理成功，Ledger 对账通过；任一项不成立立即停用 swap 并保留 journal 进入恢复。
4. 单独验证取消、move 失败、HTTP 200 无映射、缓存延迟和重启路径；这些路径均不得提交 SBC，也不得猜测新 ID。
5. 连续多个单卡周期通过后才评估 `safe-only`；`all-eligible` 仅用于明确隔离的接口调查，不作为生产模式。
