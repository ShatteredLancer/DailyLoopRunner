# FSU Club Cache Optimization

本目录保存 FSU Club 加载优化的可重放发布材料。普通用户只需要阅读本文；修改缓存、XHR capture、状态机或 Runner 集成时，继续阅读同目录的 [FSU_CLUB_CACHE_INTEGRATION.md](FSU_CLUB_CACHE_INTEGRATION.md)。

## 文件说明

| 文件 | 用途 |
| --- | --- |
| `【FSU】EAFC FUT WEB 增强器-26.09_origin.user.js` | 未修改的 FSU `26.09` 上游基线 |
| `【FSU】EAFC FUT WEB 增强器-26.09_mod.user.js` | 已完成真实页面验证的优化版 |
| `FSU-26.09-club-cache-optimization.patch` | 从原版生成优化版的标准 Git patch |
| `fsu-mod-manifest.json` | 版本、文件名和 SHA256 基线 |
| `Apply-FsuOptimization.ps1` | 对原版或后续上游版本安全尝试应用补丁 |

补丁由 `scripts/generate-fsu-patch.mjs` 生成。不要手工同时修改 patch、manifest 和优化版脚本。

## 直接安装

将以下文件更新到 Tampermonkey：

```text
【FSU】EAFC FUT WEB 增强器-26.09_mod.user.js
```

建议先禁用原来的 FSU 脚本，避免两个 FSU 实例同时运行。优化版仍使用原 FSU 名称和版本号，因此 Tampermonkey 中应只保留一个启用实例。

优化版保留了上游的 `@downloadURL` 和 `@updateURL`。Tampermonkey 自动更新可能将它替换回新的上游版本。建议关闭该脚本的自动更新，或者在每次 FSU 上游更新后重新取得干净上游文件、应用补丁并完成验证。

第一次登录会执行一次完整 Club 扫描，用于建立新的实体缓存、Storage/Transfer 指纹和全量校验时间。第一次成功日志应包含：

```text
[FSU club load] completed ... Club player(s)
[FSU club cache] saved ... Club player payload(s)
```

随后在未移动、购买、挂牌或提交球员的情况下刷新登录，预期进入快速路径：

```text
[FSU club cache] fast startup accepted ... cached Club player(s)
[FSU club cache] cached Club players remain provisional ...
```

此时不应再出现 `Club.search page 1/N` 到 `N/N` 的完整分页扫描。

## 应用到更新后的 FSU

不要直接覆盖新上游文件。使用 PowerShell 生成一个新的输出文件：

```powershell
.\FSU_mod\Apply-FsuOptimization.ps1 `
  -InputPath 'C:\Path\To\New-FSU.user.js'
```

默认输出到输入文件同目录，文件名增加 `_mod.user.js`。也可以明确指定：

```powershell
.\FSU_mod\Apply-FsuOptimization.ps1 `
  -InputPath 'C:\Path\To\New-FSU.user.js' `
  -OutputPath 'C:\Path\To\New-FSU_mod.user.js'
```

脚本执行顺序：

1. 检查输入文件 SHA256。
2. 在临时目录运行 `git apply --check`。
3. 只有上下文全部匹配才应用补丁。
4. 执行 `node --check`。
5. 原版 hash 完全匹配时，再校验输出必须等于已验证优化版 hash。
6. 全部通过后才写入输出文件。

新上游 hash 与 `26.09` 基线不同时会显示警告。即使补丁可以自动应用，也必须人工审阅 diff，并重新验证首次全量登录、第二次快速登录和 Runner Live SBC 定向校验。

## 重新生成补丁

确认 `_origin` 和 `_mod` 文件内容正确后，在仓库根目录执行：

```powershell
npm run build:fsu-patch
```

生成器会：

- 生成统一目标名为 `FSU.user.js` 的 Git patch。
- 在临时目录对原版重放补丁。
- 执行 JavaScript 语法检查。
- 验证重放结果 SHA256 与 `_mod` 文件完全一致。
- 更新 `fsu-mod-manifest.json`。

日常只读检查使用：

```powershell
npm run check:fsu-patch
```

该命令不会修改仓库文件，已经纳入 `npm run verify`。

## 与 Daily Loop Runner 的关系

- 优化版 FSU 可能返回 `trusted-provisional` 状态。
- Runner 将该状态视为可读取但未全量验证。
- Live SBC 使用 Club 球员时，Runner 会在保存前调用 FSU 的定向验证接口。
- Storage、Transfer、Unassigned-only 阵容不需要 Club 定向验证。
- 原版 FSU 不产生该状态，Runner 仍兼容原来的 `state/ready` 行为。

## 回滚

出现无法解释的加载、库存或提交问题时：

1. 禁用优化版 FSU。
2. 重新启用未修改的上游 FSU。
3. 不要删除原版脚本或覆盖其文件。
4. 导出 `FSU Club diagnostics` JSON，记录 FSU、Runner 和 Enhancer 是否启用。

缓存优化不得放宽 FSU Lock、Only Untradeable、排除联赛、Evolution、高分卡或特殊卡保护。任何提交前实体不一致都应停止，而不是继续使用缓存卡。
