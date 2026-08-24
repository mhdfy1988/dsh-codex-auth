# dsh-codex-auth

DeepSeek Harness 的独立 Codex Auth 插件包。它挂载官方 `AuthorizationService`，通过 `llm-pi-ai/openai-codex` 完成 ChatGPT OAuth，并在 Web 设置中增加 Codex 栏目。

本包不实现 OAuth、Token 刷新或凭据文件；这些能力继续由 Harness 与 pi-ai 所有。本包只负责把已有能力编排成可见、可取消、可退出的产品入口，并通过官方设置服务启用 `openai-codex` 模型路线。

## 前置条件

- DeepSeek Harness `0.1.1-rc.2`。
- Node.js `^22.19.0 || >=24`。
- profile 已包含 `@deepseek-ai/dsh-base`；使用 Web 页面时还要包含 `@deepseek-ai/dsh-web-app`。
- `dsh-base` 提供 `credentials`、`settings` 和 `llm-pi-ai`。

## 安装

将 tgz 安装到已有 Web profile：

```powershell
$packagePath = 'C:\path\to\dsh-codex-auth-0.2.0.tgz'
pnpm.cmd dsh plugin --profile web add $packagePath
pnpm.cmd dsh --profile web --dump-config
```

最终配置必须包含 `@deepseek-ai/dsh-authorization` 和 `id: codex-auth`。启动 Web 后进入“设置 → Codex”，页面应显示授权流程可用。

自定义 profile 的 `dsh.profile.bundles` 顺序如下：

```json
[
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
  "dsh-codex-auth"
]
```

启动自定义 profile 时，`web` 不是子命令：

```powershell
pnpm.cmd dsh --profile codex-next --no-open --port 3081
```

首次启动会依次显示内测声明和 API Key 引导；完成或跳过它们后再打开 Codex 设置。

## 登录与状态

“使用 ChatGPT 登录”启动官方浏览器流程；“使用设备码”启动官方设备码流程。同一个 Codex 凭据键同一时刻只允许一个授权尝试。

登录成功后，本包写入 `llm-pi-ai.providers.openai-codex` 路线。授权记录由宿主保存在 `$DSH_HOME/.credentials.yaml`，模型路线由宿主保存在 `$DSH_HOME/settings.yaml`。浏览器远程接口只返回元数据，不返回凭据 payload。

“退出登录”只删除本地 `llm-pi-ai/openai-codex` 授权记录，不向 OpenAI 发起吊销；“移除模型路线”只删除设置中的 `openai-codex` 路线，保留授权记录。

## 更新、stable / next 与回滚

更新前先停止当前 Web 进程，再对同一个 profile 安装新版本 tgz，最后重新启动。插件命令只更新下一次启动使用的配置，不会热替换正在运行的 Web 实例。

```powershell
$packagePath = 'C:\path\to\dsh-codex-auth-0.2.0.tgz'
pnpm.cmd dsh plugin --profile web add $packagePath
pnpm.cmd dsh web --port 3080
```

两个 profile 可以固定不同 tgz：

```powershell
$stablePackage = 'C:\path\to\dsh-codex-auth-0.2.0.tgz'
$nextPackage = 'C:\path\to\dsh-codex-auth-<next-version>.tgz'
pnpm.cmd dsh plugin --profile codex-stable add $stablePackage
pnpm.cmd dsh plugin --profile codex-next add $nextPackage
```

对同一个 profile 再执行 `add` 新 tgz 即为升级；重新 `add` 旧 tgz 即为回滚。profile 固定插件组合和版本，但同一 `DSH_HOME` 下的 profile 共享凭据与设置；需要完全隔离账号时必须使用不同 `DSH_HOME`。

不要用新内容覆盖同一路径、同一版本号的 tgz 后直接再次 `add`；pnpm 可能复用旧缓存。正式重打包应增加版本号；只做本地临时复验时，先 `plugin remove dsh-codex-auth`，再安装重打的 tgz。

不要并行运行两个 profile 的 `--dump-config`。当前 Harness 会让它们共同写入 `$DSH_HOME/profiles/node_modules` 解析目录，并可能发生符号链接 `EEXIST`；串行执行即可。

如果早期曾使用 `link:` 开发安装，迁移到正式 tgz 前应先卸载旧包，并确认 Profile 的 `node_modules/dsh-codex-auth` 不再是指向源码工作区的 junction。Windows 上残留的 junction 会让 pnpm 沿旧链接读取开发依赖，并在安装正式包时触发 `EPERM`；清除残留链接后重新安装 tgz，不要回退到 `link:`。

## 卸载

```powershell
pnpm.cmd dsh plugin --profile codex-next remove dsh-codex-auth
```

卸载命令执行后需要重新启动 Web。卸载会移除包和配置层，不会删除 `$DSH_HOME` 中已有的 Codex grant。若要删除本地 grant，先在 Codex 设置中明确执行“退出登录”。

## 失败行为

- 缺少 `authorization`、`credentials` 或 `settings` 时，插件加载失败。
- 没有注册 `llm-pi-ai/openai-codex` 授权流程时，登录请求失败。
- 已有授权尝试运行时，第二个入口被拒绝，不会并发启动。
- OAuth 查询值、Token 字段和 `sk-` 密钥在错误进入浏览器前会被脱敏。
- 插件不会回退到 API Key 编辑器或另一套 OAuth 实现。
