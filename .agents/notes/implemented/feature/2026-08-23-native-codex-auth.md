# Agent Note: Native Codex authorization plugin

Status: implemented

## Problem

DeepSeek Harness 的 `llm-pi-ai` 已注册 `openai-codex` 登录流程，凭据服务也能保存和刷新 OAuth grant，但默认 Web 组合没有挂载授权服务，也没有用户可操作的授权入口。直接调用 Codex App Server 会把子任务的智能体循环交给外部 Codex，不能满足 Harness 继续拥有主循环、工具、会话和模型选择的要求。

## Decision

`dsh-codex-auth` 是一个可独立安装的薄 Consumer。它通过 `cordis.patch.yml` 挂载官方 `@deepseek-ai/dsh-authorization`，在宿主侧提供 `codexAuth` Typert 远程服务，并在 Web 设置中注册 Codex 栏目。Cordis 插件 ID 继续使用 `codex-auth`，不与 npm 包名混为一谈。

宿主远程服务只编排 `authorization`、`credentials` 和 `settings`。OAuth 实现、grant 结构、刷新、持久化和跨进程写锁继续由 `llm-pi-ai` 与凭据服务拥有。Web 只接收授权状态、凭据元数据、路线状态和运行中的交互提示；它不接收凭据 payload。

授权地址和设备码只在尝试运行时存在。宿主在授权成功、取消或失败后删除这些临时字段，并在错误消息进入远程响应前脱敏 OAuth 查询值、Token 字段和 API Key。

模型路线与授权记录是两个独立状态。“退出登录”删除 `llm-pi-ai/openai-codex` 记录；“移除模型路线”只删除 `llm-pi-ai.providers.openai-codex` 设置。

## Distribution

可发布包包含预构建 Host、Client、Typert 文件和配置层。stable 与 next profile 通过版本化 tgz 固定不同版本；对同一 profile 安装新 tgz 完成升级，重新安装旧 tgz 完成回滚，`plugin remove` 完成卸载。

## Alternatives considered

**调用 `codex app-server --stdio`。** 这条路径适合把任务委派给外部 Codex 智能体，但外部 Codex 拥有那段主循环，不符合本能力的原生模型路线目标。

**实现独立 OAuth 与 Token 文件。** 这会复制官方登录、刷新和凭据锁，产生两个不一致的授权来源，并扩大密钥处理范围。

**修改 `agent-loop` 或默认 Web 组合。** Codex 授权是可选产品能力，现有服务接口已经完整；独立插件包能保留官方源码更新边界并支持按 profile 切换。

**把 API Key 编辑器扩展成 Codex 登录。** API Key 字段不能表达 OAuth 生命周期、取消、设备码、授权状态或本地 grant 删除，混用会隐藏失败状态。

## Consequences

Harness 保留主循环和模型调用所有权，浏览器不触碰 Token，插件可以安装、升级、回滚和卸载。代价是该包必须跟随 Harness 的授权、设置、Typert 和客户端槽位版本，并在上游提供等价官方 Web Consumer 时重新评估是否删除自有界面。

真实登录、重启复用和模型请求由正式 Web 实例验证。取消、失败脱敏、并发、删除范围和客户端动态注入由包内测试验证。刷新读改写与跨进程并发由 Harness 官方 `llm-pi-ai` 和 `credentials-local` 测试验证。
