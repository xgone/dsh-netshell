# NetShell — DSH 远程终端插件 设计方案

> 状态:设计评审中(未实现)
> 结论来源:已搜索 DSH 代码库与运行时服务目录,确认**不存在**现成远程终端插件;本方案基于运行时已确认的真实宿主契约设计。

## 1. 目标

| # | 需求 | 设计落点 |
|---|------|---------|
| 1 | 登录终端时插件接管 | GUI 发起连接,插件全程托管 SSH 认证与会话 |
| 2 | 存储远程服务器 SSH 配置 | Host 侧服务器档案(host/port/user/auth),经设置页管理 |
| 3 | 密码存储且不经 agent 会话 | 复用宿主 `credentials` 凭据服务,密码只在 Host 内解析注入 |
| 4 | 实时预览终端执行的命令 | Client `shell.overlay` 浮动终端面板,增量输出流 |
| 5 | 拦截危险操作 | Host 侧 Guard 引擎,回车时先评估后放行 |
| 6 | 终端命令权限等级 | `open / guarded / locked` 三级 + 逐条规则 |
| 7 | 危险命令拦截后询问用户 | `userQuestions` 结构化询问,答案回注 Guard 决策 |

## 2. 总体架构

一个动态 Cordis 插件(Host + Client 两个半区,Package-private RPC 通信):

```
┌─ Client(浏览器)──────────────────────┐      ┌─ Host(DSH 进程)────────────────────────┐
│ shell.overlay 浮动终端面板            │      │ ConnectionManager(PTY ssh 会话池)      │
│  · 服务器选择 / 连接状态              │ host.call   │  · subprocess.spawnTerminal('ssh …')   │
│  · 实时输出区(自绘 ANSI 渲染)        │ ────→ │  · askpass 脚本 ← credentials.resolve  │
│  · 键盘输入转发                       │ ←───→ │ GuardEngine(行缓冲 + 规则评估)          │
│  · 命令历史条 / 拦截事件条            │ JSON  │  · 回车提交 → 评估 → 放行/询问/拒绝      │
│ settings.section 远程终端管理页       │ RPC   │ ServerStore(服务器档案 + 规则)           │
│  · 服务器 CRUD / 密码设置            │       │ userQuestions.ask(危险确认)             │
│  · 权限等级 / 规则库                 │       │ (可选 P3) harness.registerTool          │
└──────────────────────────────────────┘      └─────────────────────────────────────────┘
```

### 2.1 SSH 通道选型:包装本地 `ssh` 二进制

Host 端 Builtins 只有 `ctx / harness / console / btoa / atob / TextEncoder / TextDecoder`,**没有 `require`**,无法引入 ssh2 库。因此:

- 用宿主 `subprocess.spawnTerminal(spec)` 经 PTY 拉起本地 `ssh`(`-tt` 强制伪终端);
- **密码注入**:`SSH_ASKPASS` 指向插件生成的临时 askpass 脚本(脚本执行时才从 `credentials.resolve(ref)` 取密码打印到 stdout),`SSH_ASKPASS_REQUIRE=force` + `DISPLAY=dummy`,配合 `setsid` 脱离 tty 触发 askpass 路径;需 OpenSSH ≥ 8.4(macOS 自带版本满足);
- 密钥认证直接传 `-i <keyPath>`,agent 认证走本机 ssh-agent,均无需注入;
- `StrictHostKeyChecking=accept-new` + 插件私有 `known_hosts` 文件(如 `~/.dsh/netshell/known_hosts`),不污染用户配置。

### 2.2 为什么不注册 `terminals.registerBackend`

宿主 `terminals` 服务支持注册 PTY 后端,注册后 6 个模型工具(`tool-terminal`)即可操作远程会话——但这会把远程 shell 暴露给模型,与本插件"人机终端 + 拦截保护"的定位冲突。**默认不注册后端**,远程终端仅用户在 GUI 中可达;模型侧受控接入(`netshell_run` 工具,经同一 Guard 评估)放在 P3 作为显式选项。

## 3. 数据模型

### 3.1 服务器档案(ServerStore)

非敏感字段持久化(宿主 `settings` 注册 `netshell` 命名空间或 storage domain record):

```js
{
  id: 'srv_xxx',            // 稳定 id
  name: '生产-web-01',       // 显示名
  host: '10.0.0.5',
  port: 22,
  user: 'deploy',
  auth: 'password',         // 'password' | 'key' | 'agent'
  keyPath: undefined,       // auth=key 时
  credentialRef: 'netshell/ssh/srv_xxx',  // auth=password 时指向凭据记录(只存 ref,不存值)
  level: 'guarded',         // 'open' | 'guarded' | 'locked'
  rules: [                  // 服务器级规则覆盖
    { pattern: 'kubectl delete *', action: 'ask',  note: '删资源要确认' },
    { pattern: 'systemctl restart nginx', action: 'allow' },
  ],
  createdAt: 0, lastUsedAt: 0,
}
```

### 3.2 密码(凭据)

- 存储:宿主 `credentials` 服务的 record 空间(`modifyRecord` / `deleteRecord`),ref 形如 `netshell/ssh/<serverId>`;加密与落盘(0600)由宿主凭据后端负责(`~/.dsh/.credentials.yaml`);
- 使用:仅 Host 半区在**建立连接的瞬间** `resolve(ref)` 取值写入 askpass 脚本(0700,临时目录,连接建立后立即删除);
- 隔离保证:
  - RPC 面(`host.call`)任何方法都不返回密码值,设置页也只显示"已设置/未设置";
  - 密码不进入任何模型消息、session log、终端输出流;
  - 插件自身的 Console 打印一律脱敏。

### 3.3 会话状态

```js
{
  id: 'sess_xxx', serverId, status: 'connecting'|'authenticating'|'live'|'closed',
  startedAt, closedReason?,
  history: [ { seq, command, at, decision: 'allow'|'ask-allow'|'ask-deny'|'deny', matchedRule? } ],
}
```

会话仅存在于插件 Fiber 生命周期内(进程本地);插件停止/更新时统一 kill 所有 PTY。终端**输出流不落 durable session log**,只有命令历史(命令文本 + 决策)进入 Run 卡片视图。

## 4. 命令权限等级与 Guard 引擎

### 4.1 行缓冲与提交时机

PTY 下键盘逐字符到达。GuardEngine 在 Host 侧维护**当前命令行缓冲**,处理:`Enter`(提交评估)、`Backspace`、`Ctrl-U`(清行)、`Ctrl-C`(弃行)、`Tab`(放行给 shell 补全,不评估)、粘贴(整段缓冲,跨行粘贴按行评估)。引号/管道/`&&`/`;;` 连接的复合命令**整条**参与评估,不做逐段放行。

### 4.2 三级权限语义

| 等级 | 语义 |
|------|------|
| `open` | 默认放行;仅 `deny` 规则仍硬拦 |
| `guarded`(默认) | `ask` 规则命中 → 询问;`deny` → 拦;其余放行 |
| `locked` | 仅 `allow` 规则直接放行;其余一律询问 |

### 4.3 内置危险规则库(可关闭/可自定义)

```js
// deny:不可询问,直接拦截
rm -rf / 与根路径变体、mkfs*、dd of=/dev/*、> /dev/sd*、
fork 炸弹 :(){ :|:& };:、chmod -R 777 /、history -c
// ask:拦截后询问
rm -rf(非根)、shutdown / reboot / halt / init 0|6、
drop database / drop table、git push --force、kill -9 1、
iptables -F、crontab -r、yum/apt remove、docker system prune -a
```

规则匹配:shell 词法切分后对首词与全串做 glob(`*`)匹配,另支持用户自定义正则(设置页标注"正则"开关)。规则求值顺序:per-server `deny` → per-server `allow/ask` → 全局内置 deny → 全局内置 ask → 等级默认。

### 4.4 拦截后询问(需求 7)

命中 `ask` 时,GuardEngine 暂停该次提交(输入不写入 PTY),调用宿主 `userQuestions.ask()`:

```
⚠ 远程终端 · 生产-web-01
检测到危险命令:rm -rf /var/log/old
匹配规则:rm -rf(非根)
[ 执行一次 ]  [ 本服务器永久放行 ]  [ 拒绝 ]
```

- **执行一次**:放行写入 PTY,历史记 `ask-allow`;
- **永久放行**:写入该服务器 `rules`(`action: 'allow'`)后放行;
- **拒绝**:丢弃该行,向 PTY 写入 `Ctrl-C` 复位提示符,历史记 `deny`;
- 询问走宿主 answerer waterfall,与模型无关;答案只是 JSON,不消耗上下文。

## 5. Client 实时预览(需求 4)

### 5.1 Slot 布局(均已查询确认)

| Slot | 协议 | 用途 |
|------|------|------|
| `shell.overlay` | list | 浮动终端面板(可拖动、可最小化到角落 pill) |
| `sidebar.footer.action` | list | 「远程终端」入口按钮 |
| `settings.section` | list | 「远程终端」管理页(服务器 CRUD、密码、等级、规则库) |
| `tool.view.cordis` | keyed(`self`) | Run 卡片内的连接状态/历史摘要(可选) |

### 5.2 终端渲染

Client Builtins 仅 `React / host.call / styles.insert / console`,无 xterm.js → **自绘轻量渲染**:

- 输出区 `<pre>` + `white-space: pre` + 横向滚动(与 `TerminalBlock` 的分歧一致:保列对齐);
- ANSI 处理自写精简版:SGR 前景/背景/常用属性 → 内联 span;`\r` 重绘按列缓冲结算(进度条正确);剥除 OSC 与无显示意义控制符;光标移动序列首版可只结算 `\r`,完整重放作为增强项;
- 增量拉取:Client 每 ~120ms `host.call('netshell.poll', { sessionId, cursor })` 取增量文本(有界缓冲,背压丢弃策略:溢出时丢最旧并插提示行),避免长时间高吞吐输出撑爆 RPC;
- 输入:面板内键盘事件(含功能键映射)直接 `host.call('netshell.input', …)` 转发,焦点管理避免与页面冲突;
- 命令历史条与拦截事件条:Guard 的每次决策由 Host 推送(在 poll 响应中携带事件),面板底部时间线展示「命令 + 决策徽章」,即"实时预览终端执行的命令"的结构化部分。

## 6. Package-private RPC 接口面

| method | 方向 | 说明 |
|--------|------|------|
| `netshell.servers.list` | C→H | 服务器档案列表(不含密码) |
| `netshell.servers.save` | C→H | 新建/更新档案(密码经 `credentials.set` 由 Host 写入) |
| `netshell.servers.delete` | C→H | 删档案 + 删凭据 |
| `netshell.connect` | C→H | `{ serverId }` → 建立 PTY,返回 `{ sessionId }` |
| `netshell.input` | C→H | `{ sessionId, data }` 键盘输入(经 Guard 行缓冲) |
| `netshell.poll` | C→H | `{ sessionId, cursor }` → `{ output, events, guardState }` |
| `netshell.resize` | C→H | `{ sessionId, cols, rows }` |
| `netshell.disconnect` | C→H | 关闭会话 |
| `netshell.sessions.list` | C→H | 活跃会话 + 历史摘要 |

全部参数/返回为 lossless JSON;handler 内部使用宿主服务 `subprocess`、`credentials`、`settings`、`userQuestions`。

## 7. 分期实施

- **P1 核心闭环**:服务器 CRUD + 密码入凭据库 + SSH 连接(密码/密钥/agent)+ overlay 实时终端 + 输入转发 + `guarded` 等级 + 内置规则库 + 拦截询问(执行一次/拒绝);
- **P2**:三级等级完善(`open`/`locked`)、自定义规则 UI(含正则)、永久放行、命令历史持久化到档案、多会话并管、resize;
- **P3(可选)**:`netshell_run` 模型工具(经同一 Guard)、`terminals` 后端注册(显式开关)、跳板机 ProxyJump、连接内端口转发状态显示、完整 ANSI 光标重放。

## 8. 风险与约束

| 风险 | 对策 |
|------|------|
| askpass 依赖 OpenSSH ≥ 8.4 | 连接前探测 `ssh -V`,不满足则降级为"仅密钥/agent 认证"并提示 |
| 动态插件为进程本地,重启后会话丢失 | 会话本就不跨进程;档案与凭据在宿主持久层,天然可恢复 |
| 高吞吐输出(如 `cat` 大文件) | 增量拉取 + 有界环形缓冲 + 丢弃计数提示 |
| 首连 host key 确认 | `accept-new` + 私有 known_hosts;变更告警(冲突时拒绝连接并列出指纹差异) |
| Guard 误放行(混淆/编码绕过) | 明示定位:护栏非沙箱;`locked` 模式提供白名单强约束;危险模式文档提示 |
| 宿主 `settings` 是否允许插件注册 ns | 实现时先查询 `settings` 契约确认 `register` 可用性,不可用则降级 storage domain |

## 9. 契约依据(已验证)

- Host 服务:`subprocess.spawnTerminal(spec): Promise<SubprocessTerminalHandle>`、`credentials.resolve/set/unset/modifyRecord/…`、`userQuestions.ask(request): Promise<AskUserQuestionAnswer>`、`settings.register/installSection`、`terminals.registerBackend`(P3 备用);
- Host 事件:`user-questions/request`(waterfall)、`credentials/record-updated`;
- Host Builtins:`harness.handle` / `harness.registerTool`、`TextEncoder/TextDecoder`、`btoa/atob`;无 `require`(决定 ssh 二进制包装方案);
- Client Builtins:`React(useState/useEffect)`、`host.call`、`styles.insert`;无 xterm(决定自绘 ANSI);
- Client Slots:`shell.overlay`(list)/ `sidebar.footer.action`(list)/ `settings.section`(list)/ `tool.view.cordis`(keyed, `self`)。
