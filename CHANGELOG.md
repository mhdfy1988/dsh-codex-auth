# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- 将独立工作区统一命名为 `dsh-codex-auth`；私有阶段一程序继续使用 `dsh-codex-auth-cli-proof`。
- 将可发布插件包的版本记录独立维护在 `packages/plugin/CHANGELOG.md`。

## [0.1.0] - 2026-08-23

### Added

- 增加可安装的 DeepSeek Harness 组合包清单与配置层。
- 挂载官方 authorization 服务。
- 增加列出、启动和定时取消授权流程的最小 CLI Consumer。
- 增加 select、text 与不回显 secret 的终端交互处理。
