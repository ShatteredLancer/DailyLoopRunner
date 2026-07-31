# Daily Loop Runner 故障排查

## 1. 出错后的第一步

1. 点击 Stop，不要继续手动移动当前 Unassigned 卡。
2. 保留 Storage、Transfer、My Packs 和当前 SBC 页面状态。
3. 展开 Options，点击 `Save log`。
4. 记录 Active Profile、Loop、Runner/FSU 版本和 Enhancer 状态。
5. FSU Club/加载问题同时导出 `FSU Club diagnostics` JSON。

不要只截取最后一条错误。根因通常位于之前的 Pack response、Unassigned materialization、Profile restore 或 SBC scan 记录。

## 2. 启动扫描时间较长

首次扫描、Clear cache 和大量 SBC 更新需要读取更多 Challenge。观察进度和扫描摘要：

- `cached/reused` 较多：Incremental 正常工作。
- `426/512/521`：Runner 会有限重试并降低请求频率。
- `429`：EA 已限流，本轮会停止继续请求；等待后使用 Incremental 重试。
- 新 SBC unavailable：没有兼容缓存且当前请求失败，不能安全生成 Loop。

不要连续执行 Full rescan；它会增加 EA 请求压力。

## 3. Dynamic SBC 没有出现在列表

在日志中查找该 Set 名称及 `status`：

- `supported`：应生成或更新动态 Loop。
- `unsupported`：后续 diagnostic 会指出评分、化学、特殊卡或未知条件。
- `ignored`：不属于当前支持的 Upgrades/Pick family。
- `unavailable`：当前 Challenge 请求失败且没有可信缓存。

Builder 只显示本次扫描存在的 Dynamic SBC。Profile 绑定的动态 SBC 到期后会阻止 Profile 激活，不会自动猜测同名替代。

## 4. Profile 恢复失败

常见日志：

```text
Active Builder profile ... built-in conflict(s) require resolution
```

程序会使用 Built-in 配置，Profile 专属阶段不会运行。打开 Builder 查看冲突：

- 未修改的官方 Profile 应自动更新基线。
- 用户修改过的同字段冲突需要选择 `Use built-in` 或 `Keep mine`。
- unavailable dynamic binding 需要重新扫描并确认目标仍存在。

运行日志中的实际 `running N step(s)` 是最终执行步骤的权威记录。

## 5. Daily 提前结束

检查每一步的 preflight、EA remaining 和结束状态：

- `completed`：该阶段已达到本次目标。
- `unavailable`：Set/Challenge 或来源包不可用。
- `blocked`：材料、Unassigned、容量、导航或提交确认失败。
- `stopped`：用户停止或上层 Workflow 停止传播。

父 Daily Workflow 不应在 blocked 子阶段后继续运行，也不应输出全部完成。提交前 Store/Pack 导航后必须重新加载 SBC Challenge。

## 6. 奖励包没有被打开

先确认实际 Profile 和步骤。Built-in One-click Daily 只有四步，不处理最终 Daily Rare packs；必须使用 `Daily + Rare Pack Recycling` Profile 才有第五步。

日志应同时显示：

- 来源包的动态/兼容 ID 和名称。
- 当前 My Packs 中的实例数量。
- 目标 Upgrade 的动态 Set/Challenge。
- `Open reward packs`、step override 或强制消费策略。

如果包被识别并记录 `left unopened`，通常是后续消费步骤没有进入 Workflow，而不是 Pack Catalog 失败。

## 7. Unassigned 阻塞或 Pack 471

Runner 会刷新 Unassigned、恢复迟到 duplicate metadata、确认新实体并运行 Recovery。仍无法确认时会停止，避免重复移动同一物品。

不要把 `471` 单独理解为 Pack 实例失效。需要结合：

- 开包前实例队列。
- response item IDs。
- live Unassigned IDs。
- Club/Storage/Transfer destination snapshot。
- 二次清理和稳定空状态确认。

已购买但未处理的卡也会阻塞开包；先人工处理该卡，再重新运行。

## 8. Storage 或 Transfer 已满

不可交易重复卡需要 Storage；交换可交易 Club 版本会占用 Transfer。容量不足时当前 Pack 可以进入 recap，但后续 Pack 会停止。

释放容量后重新运行。Runner 会先检查现存 Unassigned，不会直接跳过阻塞。

## 9. FSU 加载较慢

FSU upstream 首次登录会全量加载 Club。FSU Local 首次成功后建立实体缓存，后续未检测到库存变化时可以快速恢复并在后台校验。

FSU Local 日志应区分：

- `trusted-provisional`：缓存可读，Club 提交仍需定向验证。
- `ready`：全量校验完成。
- `validation-failed`：缓存或实体证据不一致，不能继续使用 Club 卡。

完整排查见 [FSU Club Cache Integration](../FSU_mod/FSU_CLUB_CACHE_INTEGRATION.md)。

## 10. Recap 没有出现

Recap 只在本次会话实际获得 Rare Gold 或 Special 时显示。以下情况会跳过：

- 只有 Bronze、Silver 或 Common Gold。
- Dry Run。
- 没有实际开包/Pick 领取。
- 会话在创建 recap 前被页面刷新销毁。

日志会记录 `recap skipped` 及原因。

## 11. 提交 Issue 的最小信息

- DailyLoopRunner 版本。
- FSU upstream/local 版本。
- Enhancer Enabled/Disabled。
- Active Profile 和 Loop。
- 精确复现步骤及开始库存状态。
- 完整 Save log。
- 涉及 FSU Club 时附 diagnostics JSON。

上传前删除认证 header、cookie 和 ntfy token。不要修改或重新排版日志时间顺序。
