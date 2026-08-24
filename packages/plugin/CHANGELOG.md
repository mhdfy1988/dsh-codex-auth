# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-08-25

### Added

- 增加宿主侧 Codex 授权远程 Consumer。
- 增加独立 Web 设置栏目与浏览器/设备码登录入口。
- 登录成功后通过官方 settings seam 启用 OpenAI Codex 模型路线。
- 增加取消、退出登录与移除模型路线操作。
- 增加授权终态、凭据载荷隔离、取消、并发、失败脱敏和客户端注入回归测试。

### Changed

- 将项目目录和可发布 npm 包统一命名为 `dsh-codex-auth`；Cordis 插件 ID 继续使用 `codex-auth`。
- Codex 设置入口始终使用独立的授权钥匙图标，不再沿用未知设置项的齿轮回退图标；栏目是否选中只影响背景和边框状态。
- 安装、升级、回滚和卸载示例统一使用版本化 tgz，并补充旧 `link:` 安装的 Windows junction 迁移说明。

### Fixed

- 等待生成的 `remote.codexAuth` 可用后再注册 Web 设置栏目，避免栏目空白。
- 授权成功、取消或失败后清除进度记录中的 OAuth 地址和设备码。

[Unreleased]: https://github.com/mhdfy1988/dsh-codex-auth/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/mhdfy1988/dsh-codex-auth/releases/tag/v0.2.0
