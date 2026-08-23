# dsh-codex-auth

这是 DeepSeek Harness 的独立 Codex Auth 工作区。可发布包位于 `packages/plugin`，它在 Web 设置中增加 Codex 栏目，调用 Harness 官方授权服务完成 ChatGPT 登录，并启用 `llm-pi-ai/openai-codex` 模型路线。

根目录的 `dsh-codex-auth-cli-proof` 是私有的阶段一 CLI 验证程序，不是交付包。安装、升级和卸载时应使用 `packages/plugin` 构建出的 `dsh-codex-auth-*.tgz`。Cordis 插件 ID 继续使用 `codex-auth`。

## 能力边界

- Harness 继续拥有智能体主循环、工具、会话和模型请求。
- `@deepseek-ai/dsh-authorization` 拥有授权生命周期；`llm-pi-ai` 拥有 OpenAI 登录适配和刷新逻辑；凭据服务拥有持久化与跨进程写锁。
- 本包只提供授权编排、浏览器安全远程接口、Web 设置栏目和模型路线开关。
- 浏览器只能读取“是否已登录、凭据种类、是否可写”等元数据，不能读取 access token 或 refresh token。
- OAuth 地址和设备码只在授权运行中返回，成功、取消或失败后由宿主清除。
- 本包不修改 `agent-loop`，不实现第二套 OAuth，不另建 Token 文件，也不静默回退到旧链路。

## 工作区结构

| 路径 | 职责 |
| --- | --- |
| `packages/plugin` | 可发布的 Host + Web Client 组合包 |
| `packages/typert-meta` | 独立构建时使用的 Typert 元数据桥接包 |
| `src` | 私有阶段一 CLI 验证程序 |
| `artifacts` | 本地打出的版本化 `.tgz` |
| `.dist-home` | stable/next/卸载验证使用的隔离 `DSH_HOME` |

## 构建与测试

```powershell
pnpm.cmd install
pnpm.cmd --filter dsh-codex-auth test
pnpm.cmd --filter dsh-codex-auth build
```

生成安装包：

```powershell
Push-Location packages/plugin
npm.cmd pack --pack-destination '..\..\artifacts'
Pop-Location
```

安装与版本管理见 [可发布包 README](./packages/plugin/README.md)，版本变化见 [可发布包 CHANGELOG](./packages/plugin/CHANGELOG.md)。

## 当前验证状态

`0.2.0-alpha.3` 完成项目与 npm 包统一改名；`0.2.0-alpha.2` 保留为新包名下的 stable 基线。功能链路已完成真实 ChatGPT 登录、GPT-5.6 Sol Web 请求、宿主重启后复用、终态脱敏、取消/失败/并发自动化、tgz Web 加载、stable/next 共存、升级、回滚和卸载验证。

真实 OAuth grant 的到期刷新没有通过等待生产令牌过期来触发；刷新读改写和跨进程锁由 Harness 官方 `llm-pi-ai` 与 `credentials-local` 测试覆盖。正式凭据的“退出登录”按钮未点击，以免删除用户当前登录；本包的删除范围由自动化测试覆盖。
