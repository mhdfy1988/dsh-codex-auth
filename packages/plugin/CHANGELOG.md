# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0-alpha.3] - 2026-08-23

### Changed

- 将项目目录和可发布 npm 包统一命名为 `dsh-codex-auth`；Cordis 插件 ID 继续使用 `codex-auth`。
- 安装、升级、回滚和卸载示例改用新的包名，不保留旧包名的兼容入口。

## [0.2.0-alpha.2] - 2026-08-23

### Fixed

- 等待生成的 `remote.codexAuth` 可用后再注册 Web 设置栏目，避免栏目空白。
- 授权成功、取消或失败后清除进度记录中的 OAuth 地址和设备码。

### Added

- 增加授权终态、凭据载荷隔离、取消、并发、失败脱敏和客户端注入回归测试。

## [0.2.0-alpha.1] - 2026-08-23

### Added

- 增加宿主侧 Codex 授权远程 Consumer。
- 增加独立 Web 设置栏目与浏览器/设备码登录入口。
- 登录成功后通过官方 settings seam 启用 OpenAI Codex 模型路线。
- 增加取消、退出登录与移除模型路线操作。
