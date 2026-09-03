# NetShell 技术细节(Technical Notes)

> 读者:参与开发的工程师与 AI agent。目标:读完能安全地修改代码。
>
> - 使用说明见 [README.md](README.md);原始设计与宿主契约调研见 [DESIGN.zh.md](DESIGN.zh.md)(注意:DESIGN 是前期设计,**与实现的差异以本文 §8.3 和源码为准**)。
> - 本仓库即插件本体,没有构建步骤、没有依赖,`nsh-host.js` + `nsh-client.js` 两个文件就是全部产物。

## 1. 给 AI Agent 的导读

**阅读顺序**:README → 本文 → DESIGN.zh.md(宿主契约部分仍有参考价值)→ 源码。

**改代码前必须知道的三条不变量**:

1. **跨 realm 对象规则**(§8.1)——违反会导致凭据写入报错或静默失败;
2. RPC 方法名与 payload 是 Client / Host 两个半区之间的契约,改名必须两侧同步(§5);
3. Guard 求值顺序(§6)与「密码不出 Host」是安全边界,任何重构不得弱化。

## 2. 文件结构与双模式架构

> **分支模型**:`master` 承载完整打包形态(本节描述的全部文件);`dev` 只保留 `dev/` 源码 + 文档,用于动态加载开发,打包层以 master 为准。

本插件有**两种安装形态**,由**同一份源码**(`dev/` 目录)驱动:

| 文件 | 说明 |
|------|------|
| `dev/nsh-host.js` | **源码 · 宿主半区**:SSH 会话管理、Guard 引擎、凭据读写、RPC handlers、模型工具(动态沙箱函数体风格,ES5) |
| `dev/nsh-client.js` | **源码 · 浏览器半区**:浮动终端面板、设置页、ANSI 渲染、轮询(同上) |
| `scripts/build.mjs` | 构建:把 `dev/` 源码内联进 `lib/` 两个半区(`pnpm build`) |
| `lib/index.js` | 生成物 · Loader 静态宿主半区(真实 Node ESM + harness shim + `/netshell/rpc` 分发) |
| `lib/client.js` | 生成物 · Loader 静态浏览器半区(`window.__ModuleLoader__` 工厂 + builtin shim) |
| `cordis.patch.yml` | bundle 补丁:loader 树的 `netshell` 行 |
| `test/smoke.mjs` | 端到端冒烟:桩服务驱动两个生成半区 + 真实 HTTP RPC(12 项断言) |
| `DESIGN.zh.md` | 设计方案,§9 的宿主契约调研仍有效 |
| `TECHNICAL.md` | 本文 |
| `CHANGELOG.md` | 更新记录 |

两个 `dev/` 源文件均以 `var …; return { inject: [...], apply(ctx) { … } }` 结尾——这是**动态沙箱的函数体求值**格式;`build.mjs` 把整份源码原样内联进一个 IIFE,因此业务逻辑只有一份,模式差异全部收敛在生成物的 shim 里:

| 动态沙箱 builtin | 静态模式落点(lib/index.js / lib/client.js) |
|------|------|
| `harness.handle(method, fn)` | 内存 handler 表 + 单一 `POST /netshell/rpc` JSON 分发(webServer 路由) |
| `harness.defineTool(def)` | `@deepseek-ai/dsh-tools` 的 `defineTool`(参数 schema 归一化) |
| `harness.registerTool(ctx, t)` | `ctx.tools.register(t)` |
| 客户端 `host.call(method, args)` | `fetch('/netshell/rpc')`(与宿主同一分发端点) |
| 客户端 `styles.insert(css)` | `<style>` 注入 `document.head` |
| 客户端 `ctx.timer` | 客户端无 timer 服务,包装层以 `setInterval/setTimeout` 增广 ctx |
| 服务名 `subprocess` / `credentials` / `timer` | 同名——静态 loader 的 base bundle 提供同名服务(`@deepseek-ai/dsh-subprocess-local` / `dsh-credentials-local` / `cordis-plugin-timer`),inject 直接声明 |

**改代码只改 `dev/`,然后 `pnpm test`**(build + check + smoke)。`lib/` 是生成物但入库提交,保证 git clone / link 安装零构建步骤。

## 3. 运行环境与宿主契约

- 插件运行在 DSH 的 **node:vm 沙箱 realm**:没有 `require`,不能引第三方库——这是所有选型(包装 ssh 二进制、自绘 ANSI、手写 store)的根本原因。
- **Host** `inject: ['subprocess', 'credentials', 'timer']`,用到:
  - `subprocess.spawnTerminal(spec)`:PTY 拉起交互式 `ssh`(会话);
  - `subprocess.spawn(spec)`:askpass 脚本落盘 / 清理、`ssh -T` 一次性命令执行(工具路径);
  - `subprocess.resolveExecutable('ssh')`:定位 ssh 二进制;
  - `credentials.readRecord / modifyRecord / describe / resolve / set / unset`:档案与密码的持久化(§4);
  - `harness.handle(method, fn)`:注册 RPC;`harness.defineTool` + `harness.registerTool`:注册模型工具;
  - `timer.timeout / interval`:轮询与等待。
- **Client** 可用:`React`(代码风格为 `var x = React.useState(...)` 解构前写法)、`host.call`、`styles.insert`、`ctx.get('slots')`、`console`;slots:`shell.overlay`(面板)、`sidebar.footer.action`(入口)、`settings.section`(设置页)。
- 交互终端固定 **120×32**(`COLS` / `ROWS`),resize 未实现。

## 4. 数据与持久化(为什么没有配置文件)

**没有独立配置文件是刻意设计**:全部配置走宿主 `credentials` 服务,由宿主负责加密落盘(0600)、跨重启恢复,且密码与档案同域管理。

| 数据 | 位置 | 形态 |
|------|------|------|
| 服务器档案 + 等级 + 规则 | 凭据记录 `netshell/profiles`(常量 `PKEY`)| `kind: 'grant'`,payload `{ version: 1, servers: [...] }` |
| 密码 | 每服务器一条,ref 由 `refFor(id)` 生成:`NETSHELL_PW_<id 去掉非字母数字后大写>` | `credentials.set(ref, password)` |
| 运行时会话 | Host 进程内存 `Map` | 插件停止 / DSH 重启即清空(会话本就不跨进程) |
| 主机指纹(known_hosts) | 插件私有文件 `~/.dsh/netshell/known_hosts` | 普通文件 0600 / 目录 0700,由 ssh 维护;0.1.1 起,与 `~/.ssh/known_hosts` 隔离 |

server 档案字段:`{ id, name, host, port, user, auth: 'password'|'key'|'agent', keyPath?, level: 'open'|'guarded'|'locked', rules: [{ pattern, action: 'allow'|'ask'|'deny', note? }], createdAt }`。

**密码隔离保证**:列表 / 保存接口返回时只附加 `hasPassword`(来自 `credentials.describe(ref).configured`);任何 RPC、任何日志、任何终端输出都不会出现密码值。

## 5. RPC 接口(Client → Host)

全部经 `harness.handle` 注册,参数 / 返回为 lossless JSON:

| method | args | 返回 | 说明 |
|--------|------|------|------|
| `netshell.profiles.list` | `{}` | `{ servers: [server & { hasPassword }] }` | 档案列表 |
| `netshell.profiles.save` | `{ server, password?, clearPassword? }` | `{ server }` | 新建 / 更新;`password` 非空则写凭据,`clearPassword` 则删除;校验必填项与端口 1–65535 |
| `netshell.profiles.delete` | `{ id }` | `{ ok: true }` | 删档案 + 删凭据 + 终止该服务器活跃会话 |
| `netshell.connect` | `{ serverId }` | `{ id, pid }` | 每次都 spawn 新会话 |
| `netshell.input` | `{ id, data }` | `{ ok: true }` | 键盘输入,单次 ≤4096 字符;pending 期间整体丢弃 |
| `netshell.poll` | `{ id }` | `{ status, output, lossy, dropped, nextCursor, events, pending, hint, closedReason, atPwPrompt, cols, rows }` | **全量快照**(见下) |
| `netshell.decide` | `{ id, pendingId, action: 'allow'\|'always'\|'deny' }` | `{ ok: true }` | 对挂起命令做裁决 |
| `netshell.disconnect` | `{ id }` | `{ ok: true }` | 终止会话 |
| `netshell.sessions.list` | `{}` | `{ sessions: [{ id, serverName, status, pending }] }` | 用于跨面板发现会话 |

注意:

- `netshell.poll` 目前是全量快照:`output` 为缓冲全文,`nextCursor` 恒为 `0`、`lossy` 恒为 `false`——增量游标是**预留字段**,未实现;
- Client 以 **150ms** 固定间隔轮询:`discoverSessions`(发现外部 / 模型开的会话与 pending,必要时自动弹出面板)+ `pollOne(activeId)`(仅当前会话)。

## 6. Guard 引擎(Host 侧)

### 6.1 行缓冲与提交时机

`onInput` 维护当前行缓冲 `s.line`:

- **回车**(`\r`)→ `submitEnter`:trim 后交给 `evaluateFor` 评估;空行与密码提示状态直接透传;
- **Backspace**(`\x7f`)删一个字符;**Ctrl-U**(`\x15`)/ **Ctrl-C**(`\x03`)/ **Ctrl-L**(`\x0c`)清行;
- **↑/↓**(`\x1b[A`/`\x1b[B`)在 Host 侧 `hist`(≤100 条)中回溯:先写 `\x15` 清掉远端当前行再回写内容,保证远端显示与缓冲一致;
- **Tab** 与其余 ESC 序列直接透传(补全、vim 等不受 Guard 管);
- **密码提示旁路**:`s.tail`(最近 60 字符)匹配 `/password\s*:$/i` 时置 `atPwPrompt`,此后回车直接透传不评估——否则 sudo / ssh 的密码输入会被当成命令送进 Guard;
- **pending(待确认)期间**所有输入被丢弃;`deny` 裁决后写 `\x15` 复位远端行。

### 6.2 求值顺序(`evaluateFor`)

1. 服务器 `rules` 中 `action: 'deny'` 命中 → **deny**;
2. 服务器 `rules` 其余(`allow` / `ask`)命中 → 按其 action;
3. 内置 `deny` → 4. 内置 `ask` → 5. 等级默认(`guarded` → allow;`locked` → ask,即白名单模式;`open` 不会走到这里)。

### 6.3 匹配语义

- glob → 正则(`globToRe`,带缓存):`*` → `[\s\S]*`,`?` → `.`,其余字符转义;**整串匹配、忽略大小写**;
- `variants()`:最多剥 3 层 `sudo|doas|nice|nohup|env ` 前缀,所有变体参与匹配;
- 规则按数组顺序求值,首个命中生效;
- 仅匹配原始命令串,不做 shell 词法解析(DESIGN 中「词法切分」未实现,见 §8.3)。

### 6.4 内置规则库

`BUILTIN_RULES` 共 38 条:9 条 `deny`(`rm -rf` 根路径及变体、`mkfs*`、`dd` 直写设备、覆写 `/dev/sd*`、fork 炸弹、`chmod -R 777 /*`)+ 29 条 `ask`(递归删除、关机重启、删库删表、强推硬重置、清防火墙、删 crontab、包管理卸载、docker/k8s 清理等)。修改时需同步 CHANGELOG 与 README。

## 7. 会话生命周期与模型工具

### 7.1 交互会话(`netshell.connect` → `spawnSession`)

1. `resolveExecutable('ssh')` 定位二进制;
2. `auth: 'password'` 时:`credentials.resolve(ref)` 取密码 → `makeAskpass` 写 askpass 脚本;
3. `spawnTerminal` 拉起 `ssh -tt -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=<私有文件> -o NumberOfPasswordPrompts=1 -o ServerAliveInterval=15 -o ConnectTimeout=12 …`(agent 加 `BatchMode=yes`;key 加 `-i <keyPath> -o IdentitiesOnly=yes`);
   - **私有 known_hosts**(`knownHostsFile()`):首次调用经 `/bin/sh` 创建 `~/.dsh/netshell/known_hosts`(目录 0700、文件 0600,幂等)并缓存路径,失败可重试、失败则本次连接报错;插件学到的指纹不落入用户 `~/.ssh/known_hosts`,互不污染; BSD 工具链(macOS)的 `chmod` 不支持 `--` 分隔符,脚本里不要加;
4. 异步消费输出流写 `onOutput`(检测错误特征设置中文 `hint`);首个输出块即置 `status: 'live'`;
5. 退出时 `onExit` 记录 `closedReason` 并删除 askpass 脚本。

**askpass 机制**(密码认证,需 OpenSSH ≥ 8.4):

- 脚本写到 `/tmp/.netshell-askpass-<nsToken>-<n>.sh`,内容仅 `printf "%s\n" "$NETSHELL_PW"`;
- 用 `/bin/sh -c 'umask 077 && printf %s "$NS_SCRIPT" > "$1" && chmod 700 …'` 落盘(0700);
- ssh 进程 env 注入 `SSH_ASKPASS=<脚本>` + `SSH_ASKPASS_REQUIRE=force` + `DISPLAY=netshell:0`(非空即可触发 askpass 路径)+ 密码本体 `NETSHELL_PW`;
- 会话结束 `/bin/sh rm -f` 删除脚本。

### 7.2 缓冲策略

- `outAll` 上限 **160K** 字符,溢出裁到 120K;`outBase` 记录全局偏移、`dropped` 累计被裁字符数;
- `events` 上限 500(溢出丢最旧 100);`hist`(命令历史)上限 100;
- Client 侧 `lines` 上限 1200(溢出丢最旧 400 并累计 `dropped` 提示),实际渲染最近 400 行 + 当前行。

### 7.3 模型工具

`harness.defineTool` 定义,`ctx.effect` 中注册、dispose 时反注册:

- **`netshell_servers`**:无参数,读 `PKEY` 返回 `{ servers: [{ id, name, host, port, user, auth, level }] }`;
- **`netshell_run`**:参数 `server`(必填)、`command`(必填)、`timeoutMs`(默认 30000)。执行流(`toolRunExecute`):
  1. `resolveServer` → `ensureSession`(**复用或新建交互 PTY 会话**,与面板共享,waitLive 最长 20s);
  2. Guard 评估:`deny` → 直接返回 blocked;`allow` → `runRemote`(`ssh -T … <cmd>` 独立一次性执行,同样使用私有 known_hosts;stdout 上限 200K/spill 400K);
  3. `ask` → 把命令写入共享会话的行缓冲(**面板可见**)并置 pending,`waitPendingGone` 轮询等待用户在面板裁决,**最长 600s**;超时 / 中止 / 拒绝均返回 blocked;放行后走 `runRemote`;
  4. 结果(stdout/stderr/exitCode)与 `$ <cmd>` 一起**回写共享会话的 `outAll` 与事件流**,面板全程可见模型做了什么。

## 8. 实现要点与坑

### 8.1 跨 realm 对象身份(最重要的坑,源码顶部有大段注释)

插件跑在 node:vm 沙箱 realm,沙箱里对象字面量的 `Object.prototype` 与宿主 realm 不同;credentials 服务的 `assertJsonValue` 用**宿主的 Object.prototype 做全等比较**,直接传沙箱造的对象会失败。因此**一切要写进 GrantRecord payload 的对象,必须以宿主 realm 出身的对象为底**,只有三个安全来源:

1. `credentials.describe()` 返回的 CredentialInfo(宿主对象)→ `hostBlank()` 删掉字段后当空白对象;
2. `readRecord` 返回的 `rec.payload.servers`(宿主 YAML 解析产物)→ **原地修改**;
3. RPC args 里的 server / rules(宿主 JSON 解析产物)→ **原地修改**。

数组判断用 `Array.isArray`(跨 realm 安全);原始值无 realm 概念,随意。新建 server 的标准流程:先 `hostBlank` 拿宿主空白对象 → push 进旧数组 → 原地填字段 → `modifyRecord` 返回整体。`decide('always')` 写永久放行规则时同理。

### 8.2 死代码与预留字段

- `runOnSession`、`waitShellReady`、`collectOutput`(仅被前者调用)、`makeVirtualSession` 目前**没有调用方**——为将来「工具命令直接走交互 PTY」预留;
- `netshell.poll` 的 `nextCursor` / `lossy` 为增量拉取预留,当前无效果。

### 8.3 与 DESIGN.zh.md 的差异(以实现为准)

| 设计 | 实现 |
|------|------|
| RPC 命名 `netshell.servers.*`、`sessionId` / `cursor` 增量拉取 | `netshell.profiles.*`、`id`、全量快照 poll |
| 拦截询问走宿主 `userQuestions.ask()` | 自实现 pending + 面板横幅 + `netshell.decide`,不依赖 userQuestions |
| 连接前探测 `ssh -V` 并降级 | 未做 |
| 规则匹配做 shell 词法切分 | 仅原始串匹配 + sudo 类前缀剥离 |
| 模型工具是 P3 可选项 | 已随首版交付(`netshell_servers` / `netshell_run`)|

### 8.4 安全边界与已知弱点

- **护栏非沙箱**:匹配对象是原始命令串,base64 / 变量间接 / heredoc 等可绕过;`locked` + `allow` 白名单是唯一强约束,文档需持续向用户明示;
- `atPwPrompt` 是启发式:远端提示语不含 `password:` 时(如自定义 PAM 提示),密码回车可能落入评估路径,通常无副作用但会记一条历史;
- host key 变更时由 ssh 自身拒绝连接(指纹记在私有 `~/.dsh/netshell/known_hosts`),`onOutput` 识别特征文案给出中文 hint 与善后指引;
- 模型路径的 `waitPendingGone` / `waitLive` 是 120–150ms 轮询,非事件驱动(可接受,但不优雅)。

## 9. Client 实现速览

- **状态**:`store` 为手写 observable(`set()` 浅拷贝 + 订阅通知),另有 `screens: Map<sessionId, screen>` 保存每个会话的渲染状态;组件经 `useStore()` 订阅强刷(整树 re-render,当前规模可接受)。
- **ANSI 渲染**(`lineSpans`):逐单元格缓冲(字符 + 样式),处理 SGR(16 色 FG/BG + 粗体/斜体/下划线/删除线/暗淡)、`K`/`J` 清行清屏、`C`/`D`/`G` 光标列移动、`\r` 回车重绘(进度条正确)、`\b`、`\t`(8 列制表)、BEL;剥除 OSC 与无显示意义控制符;相邻同样式合并为 span。无 xterm.js,这是精简自绘实现,完整光标重放(全屏 TUI)不支持。
- **按键映射**(`keyToData`):DOM 键盘事件 → 终端字节流;Ctrl+字母 → `\x01`..`\x1a`,方向键 / Home / End / PgUp / PgDn → CSI 序列,Tab/Shift-Tab → `\t` / `\x1b[Z`;Alt / Meta 组合忽略;命中即 `preventDefault` 并 `netshell.input` 转发。
- **样式**:CSS 模板串经 `styles.insert` 一次性注入;颜色全部走 `--dsw-*` 设计令牌(`TK` 映射表),自动适配深浅主题。

## 10. 修改检查单

改代码前过一遍:

- [ ] 只改 `dev/` 源码,改完 `pnpm test`(build + check + smoke),提交时包含重新生成的 `lib/`;
- [ ] 新对象要进 credentials payload?→ 必须宿主 realm 出身(§8.1);
- [ ] 动了 RPC 名 / payload?→ `dev/nsh-client.js` 与 `dev/nsh-host.js` 两侧同步 + 更新本文 §5;
- [ ] 动了 Guard 求值顺序或内置规则?→ 更新 §6、README「权限等级」、CHANGELOG;
- [ ] 动了 askpass / 凭据路径?→ 确认密码不出现在任何 RPC 返回、console、`outAll`;
- [ ] 新增用户可见行为?→ README + CHANGELOG 同步;
- [ ] 新增子资源(临时文件、子进程)?→ 在 `onExit` 与 `ctx.effect` dispose 中回收;
- [ ] 动态源码保持 ES5 函数体风格(顶层 `var` + `return { inject, apply }`),不要引入 `import`/`export`/模板字符串——两种模式都靠「函数体原样内联」。

## 11. 安装与打包(loader 静态包)

- **包形态**:`package.json` 声明 `exports["./client"]` + `dsh.client`(`platform: web`)+ `dsh.bundle.patch` —— 这是 DSH client-modules 系统扫描浏览器半区、以及 profile launcher 识别 bundle 的契约(参照:`@deepseek-ai/dsh-client-modules` 的扫描逻辑与本仓库 cordis.patch.yml)。注意 `dsh.client.inject` 的语义是**依赖的 client 包名**(模块表到达顺序边),而模块自身 `export const inject = [...]` 是**服务名**——两层不要混淆;本包前者为 `[]`(slots/react 由既有启动图提供)。
- **安装**:本机 profile 是 `~/.dsh/profiles/web`(pnpm workspace,patch 层为其中的 `cordis.patch.yml`)。`dsh plugin --profile web add link:<路径>` 会 pnpm 安装并自动把 bundle 追加进 `dsh.profile.bundles`(透明转发 pnpm + 按安装状态对账);模块解析是双锚(先 dsh 安装目录、后 profile 目录)。
- **宿主半区服务**:`inject: ['subprocess', 'credentials', 'timer', 'tools', 'webServer']`(base bundle 提供同名服务行);RPC 走自注册 HTTP 路由(与 `@xgone/dsh-remote` 同一模式,auth gate 覆盖所有已注册及后注册路由)。**有意未走** `/api` 通用平面:`namespace/<method>` 派发要求宿主半区 `TypertRemoteService` + `@Remote` 标记,且浏览器半区必须挂载 `@deepseek-ai/dsh-typert-generator` 生成的严格 codec 描述符(`./remote` 产物 + `ctx.remote.$mount`)—— machinery 过重,对本插件的 9 个 JSON RPC 不划算;若未来需要流式/强 schema,再迁。
- **浏览器半区**:工厂形式 `window.__ModuleLoader__.load({ id, factory(require) })`,依赖经 `require('react')` 注入;不使用 `eval`/`new Function`,源码以真实代码内联(无 CSP 风险)。

## 12. 路线图(DESIGN 分期 + 本文暴露的技术债)

- 增量 poll:启用 `nextCursor` 游标,减少带宽与面板 re-render;
- 工具命令走交互 PTY:复活 `runOnSession`,让 `netshell_run` 真实回显交互(当前 allow 路径是独立 `ssh -T`);
- `ssh -V` 探测与降级提示(补齐 DESIGN §8 风险对策);
- `resize`、跳板机 ProxyJump、完整 ANSI 光标重放(全屏 TUI);
- `terminals.registerBackend` 受控接入(显式开关)、清理或落地 §8.2 的预留代码。
