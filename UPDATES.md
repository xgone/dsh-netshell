# 更新记录

这里记录面向使用者的功能更新。实现约束和接口变化请看 [TECHNICAL.md](TECHNICAL.md)，完整历史请看 [CHANGELOG.md](CHANGELOG.md)。

## DSH 兼容性说明

- 当前分支面向 DSH `0.2.1` Web profile；本地兼容性审查基于上游 `dsh-v0.2.1-rc.2`，旧版 DSH 不在支持范围内。`@deepseek-ai/dsh-tools` 由 DSH 宿主提供并作为可选 peer 声明，不要把它作为 profile 运行时依赖单独安装；静态插件会从 DSH host entry 加载宿主版本，避免 hoisted profile 中的副本遮蔽兼容版本。
- 本地终端命令应使用 DSH 内置本地终端工具，不要通过 `netshell_run` 执行；NetShell 的模型工具只用于用户明确指定的远程服务器。Windows 本地终端优先选择 PowerShell/pwsh/cmd，避免把 `bash.exe` 的 WSL 启动器误当作可用 Bash。
- 远程 SSH 支持 Windows 10/11 的 OpenSSH Client；Windows 密码自动注入要求支持 `SSH_ASKPASS_REQUIRE=force` 的 OpenSSH（建议 8.7+）。

## 0.6.4 · 2026-10-30

- 修复通过包管理器安装后可能导致 DSH 启动失败的问题；`dsh-tools` 现在由 DSH 宿主提供。

## 0.6.3 · 2026-10-29

- **修复后台轮询放大**:插件启用后,即使没有连接任何主机也会持续产生大量 RPC 请求。现在只在有会话时高频刷新终端,空闲时几乎不请求,浏览器标签页切到后台时完全停摆。

## 0.6.2 · 2026-10-24

- 适配 DSH 0.2.1 的 Web 与 Desktop profile。
- 修复 RPC 认证错误、可配置路由、异步 SSH PTY 写入与终止等待。
- 修复密码 askpass、旧档案字段和 Client Slot 兼容性。

## 0.6.1 · 2026-09-07

### 新增

- **本地终端**：终端面板现在可以直接启动当前设备的 `bash`、`sh`、PowerShell 或 `cmd`，不需要配置 SSH 服务器。
- **中英文界面**：终端、设置页、权限规则和状态栏会跟随 DSH 的界面语言切换。
- **双语用户文档**：新增面向用户的中文和英文 README，分别说明安装、服务器配置、权限等级和 AI 工具。
- **CDP 功能截图**：新增脱敏的中文和英文终端界面截图，展示实时输出、命令统计和危险命令确认。
- **新版仓库预览图**：更新 GitHub 社交预览图，突出 DSH-NetShell、远程终端和人工确认流程。

### 安全与体验

- 本地终端不会读取远程服务器档案或 SSH 密码。
- 本地和远程会话继续使用统一的命令 Guard；`allow`、`ask` 和 `deny` 的行为保持一致。
- **模型远程连接确认**：当前模型会话首次使用服务器，或用户手动断开后再次使用时，必须先经过用户确认；授权在当前插件生命周期内按模型会话和服务器分别保留，不同模型会话即使复用同一个 SSH 会话也必须各自确认。网络故障、SSH 退出或连接等待超时只会触发已授权模型会话的自动重连，不会再次询问。确认服务不可用时安全拒绝，不会自动建连。
- README 明确说明插件的安全边界：命令护栏不是完整沙箱，其他 SSH 通道不受本插件拦截。

### 修复

- **终端光标与方向键体验**：光标改为覆盖当前字符的绿色 block cursor，不再插入额外 glyph 或制造右侧空白；方向键输入完成后立即刷新，poll 快照串行化并将轮询间隔调整为 80ms。
- **终端输出监听器泄漏**：每个 PTY 会话只创建一个输出 async iterator，避免重复注册 `PassThrough` 的 `end`、`finish`、`error` 和 `close` 监听器，消除 `MaxListenersExceededWarning`。
