# 更新记录(Changelog)

本项目的所有重要变更都记录在这里。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [0.2.0] - 2026-09-03

### 新增

- **Loader 静态包形态**:仓库重构为可安装的 DSH bundle——`package.json` 声明 `dsh.client` + `dsh.bundle.patch`,`cordis.patch.yml` 提供 loader 行;`dsh plugin --profile web add link:<路径>`(或包名)即可随 DSH 启动自动加载,不再需要每次手动激活动态插件。
- **单源双模式构建**:`src/nsh-host.js` + `src/nsh-client.js` 为唯一源码(动态沙箱函数体风格保持不变),`scripts/build.mjs` 生成 `lib/index.js`(宿主:harness shim → `@deepseek-ai/dsh-tools` 工具注册 + `/netshell/rpc` JSON 分发路由)与 `lib/client.js`(浏览器:`window.__ModuleLoader__` 工厂 + `host.call`/`styles.insert`/`ctx.timer` shim);业务逻辑零分叉。
- **静态模式安全说明**:浏览器→宿主 RPC 走自注册 HTTP 路由,与 `/api` 平面同级受部署侧认证门控;客户端不使用 `eval`/`new Function`。
- **端到端冒烟测试**(`test/smoke.mjs`,12 项断言):桩服务驱动两个生成半区,覆盖 harness shim、工具注册、RPC 分发(200/404/405/500)、slot 装配与样式注入;`pnpm test` = build + check + smoke。

### 变更

- `nsh-host.js` / `nsh-client.js` 迁移至 `src/`(动态加载形态的文件名变化;内容即唯一源码)。动态插件用法不受影响。

## [未发布]

### 新增

- **服务器规则编辑区重做(设置 → 远程终端)**:规则不再是一排裸输入框——标题行改为「服务器规则 + 按顺序匹配 · 优先于内置规则库 · 只约束 AI 执行的命令」,正文补充匹配语义说明(完整命令行通配、`*` / `?` 通配符、忽略大小写、自动剥除 sudo / nohup 等前缀、从上到下先命中先生效、deny / ask / allow 三种动作含义);新增四个**可点击示例**(放行日志清理 / 禁止强推 / systemctl 先确认 / docker rm 先确认),点击即作为一条规则填入列表;规则列表带行号,动作用中英双语下拉(deny 拦截 / ask 确认 / allow 放行);空规则列表显示占位说明。保存时校验规则模式不能为空(此前空模式行被宿主静默丢弃,用户无从得知)。

### 修复

- **AI 危险命令确认卡在部分挂载形态退化为面板兜底(原生弹卡回归修复)**:`netshell_run` 命中 `ask` 规则时的首选路径是直调宿主 `userQuestions.ask` 在对话窗口弹原生确认卡,但 `userQuestions` 服务的可解析性依赖插件 ctx 所处作用域——动态加载宿主半区挂在根组合 `cordis-dynamic` 组下,自身 ctx 取不到该服务时旧代码直接落到面板兜底。现 `resolveUserQuestions(agent)` 依次尝试:自身 ctx → `exec.agent.ctx` → `agents.get(agent.id).ctx` 桥接;带 `agent` 的作用域瀑布若返回 `NO_PROVIDER`(回答者未注册在该作用域),自动退一次**不带 agent 的全局瀑布**重试(真人点卡的机制性授权不变);仍失败才回退面板。所有回退路径的失败码与解析诊断随工具 `message` 带出并打日志(`[未弹原生卡:…]`),便于定位。
- **服务器规则编辑区横向溢出(超出设置面板)**:动作下拉同时设了 `flex: none`(不可收缩)与内联 `maxWidth: 'none'`(移除了 `select.nsh-in` 的 240px 上限),而 `.nsh-in` 自带 `width: 100%`,使下拉以"容器全宽"为基准且不可收缩,把输入框和删除按钮整体挤出面板。现下拉改为固定 118px,模式输入框 `min-width: 0` 允许收缩,窄窗口下整行可正常压缩;删除按钮从整颗「删除」胶囊改为紧凑 ✕ 图标按钮,行内布局不再拥挤。

- **`netshell.input` 多字符防绕过(协议层漏洞)**:此前一条内嵌 `\r` / `\n` 的多字符 `data` 会整体直达 PTY,完全绕过 Guard 直接在远端执行(合法浏览器客户端只发单键,故实际暴露面为已持有已认证浏览器会话的调用方)。现对含 `\r` / `\n` 的输入按 `[\r\n]` 拆段、逐字符送入 Guard,段间注入回车提交——每一段都过 `evaluateFor`,良性段照常执行、危险段照常挂起,与逐键输入语义等价;单键 / ESC 序列路径行为不变。

### 变更

- **设置页「远程终端」图标更换为终端 `>_` 图标(纯插件侧,零 harness 改动)**:设置导航图标由壳层按 section id 兜底渲染,本插件 id 落在齿轮兜底。参照 dsh-remote 的做法:`settings.section` 的 `label` 从字符串改为 **thunk 返回「图标 + 文字」React 元素**(壳层经 `resolveSlotLabel` 把它渲染进导航按钮的 label 座),图标为内联 SVG 终端窗(动态沙箱无 require、拿不到 primitives 图标库,故自绘 16px `>_` 描边图标);同时插入一行插件自有 CSS `button:has(.nsh-nav) > :first-child{display:none!important}` 隐藏壳层在该行兜底画出的齿轮,style 随插件启停自动清理。
- **`netshell_run` 危险命令确认改为「插件直调宿主提问服务」(机制性绑定)**:命中 `ask` 规则时,插件直接调 `ctx.get('userQuestions').ask({ questions, agent: exec.agent, signal: exec.signal })`——确认卡原生弹在对话窗口,工具原地等待真人选择(执行一次 / 永久放行该命令 / 拒绝),答案由宿主服务返回、模型无从代答;**`choice` 参数废弃,不再参与授权**(此前令牌 + choice 流程中,令牌首次拦截即签发,模型可自行伪造 `choice=allow` 绕过确认,属提示词级约束而非机制级)。0.5.x「宿主平面无法弹卡」的结论系误诊:失败根因是用 `exec.agent.id` 重建 agent 对象,过不了 `userQuestions.ask` 的 `CALLER_NOT_LIVE` 全等校验;与内置 `ask_user_question` 同形态调用(原样透传 `exec.agent`)即可正常弹卡。
- **面板裁决回退**:弹卡不可用(无 answerer 的 `NO_PROVIDER`、子代理上下文的 `DELEGATED_CALLER`、动态加载无 `userQuestions` 服务)时,命令在共享会话挂起(面板横幅可见)+ 签发一次性令牌;令牌只有在面板真实裁决(`netshell.decide`,allow / always / deny)后才可兑现,未裁决不消耗、10 分钟(TOOL_ASK_TTL)后自动撤销挂起并作废令牌;同一会话同时只允许一条挂起。工具挂起(`from: 'tool'`)的裁决只记账,不再向 PTY 写 `\r` / `\u0015`,避免误清用户正在输入的行。
- 测试按新契约重写(`test/ask-flow.mjs`,33 项断言):原生弹卡参数形态 / 真人答案映射 / 伪造 `choice` 无效 / 中止处理 / 面板回退全流程(未裁决保留令牌、裁决兑现、一次性复用拒绝、漏带令牌兑现、命令不匹配、同会话单挂起、超时 sweep)/ 动态形态(无 `userQuestions`)回退 / `netshell.input` 多字符拆段(良性执行、危险拦下、回车不直达 PTY)。

## [0.6.0] - 2026-09-03

### 变更

- **`netshell_run` 危险命令确认改用「一次性令牌 + `ask_user_question` 委托」**:宿主平面动态工具自己调 `userQuestions.ask` 时,其分发的 agent 作用域 Question 瀑布无法被浏览器 answerer 映射到当前会话(实测 `ask_user_question` 正常、`netshell_run` 却 fail closed),属框架级 scope 断点。现改为:命中 ask 规则时 `netshell_run` **不再内部阻塞弹卡**,而是返回 `blocked + needsConfirmation + confirmToken`;模型据此调用内置、已验证可用的 `ask_user_question` 弹出原生对话确认卡,用户选择后把选择映射为 `choice`(allow/always/deny),再携 `confirmToken` + `choice` 重跑 `netshell_run` 确认执行。令牌**一次性有效**(校验服务器+命令匹配、10 分钟过期、复用即拒),未知 `choice` 默认拒绝,模型无法绕过。
- 新增工具参数 `confirmToken`、`choice`;工具描述指导模型走确认流程。
- 移除插件内对 `userQuestions`/`ctx.agents` 的桥接逻辑(不再需要)。
- 测试按新契约重写:令牌签发 / allow / always / deny / 令牌一次性复用拒绝 / 命令不匹配拒绝 / 裸 rm 拦截,全部通过。

## [0.5.7] - 2026-09-03

### 修复

- **AI 危险命令确认卡仍不弹(scope 载体错)**:`ask_user_question` 这类在 agent 作用域组合的工具能正常弹原生确认卡;但 `netshell_run` 是宿主平面的动态工具,即使桥到 agent 作用域的 `userQuestions` 实例,瀑布分发的作用域载体仍是宿主纤维,浏览器 answerer 的 `scopeOf(owner)` 映射不到当前会话 → skip → fail closed → aborted。现在桥优先用 `agents.requireInitiator()` 取 **当前 live agent** 的 `.ctx`(与 `ask_user_question` 一致的作用域)分发 `userQuestions.ask`,再用 `exec.agent.id` 兜底。经 `ask_user_question` 实测确认部署的原生 answerer 本身可用,本次只需对齐 scope。

## [0.5.6] - 2026-09-03

### 修复

- **AI 危险命令拦截不再弹对话弹窗(核心功能回归)**:`netshell_run` 的 ask 分支用 `ctx.get('userQuestions')` 取 DSH 原生提问服务,但该服务挂在 **agent 的会话作用域**里,宿主动态插件的 `ctx` 取不到 → 每次都回退到终端侧 pending 横幅,对话窗口里看不到确认卡。现在宿主侧取不到时,经 `ctx.agents`(拿 live agent 的 `.ctx`)或 `ctx.agentPresets.serviceFor(...)` 桥接到 agent 作用域再取 `userQuestions`,取到后走原生 `ask` 弹卡;全部取不到才回退终端横幅。新增桥接回归断言。

## [0.5.5] - 2026-09-03

### 修复

- **删除会话仍有一丝短闪(0.5.4 的补充)**:0.5.4 用「删除中」集合挡住重新加回,但该集合会在一个**更早读到旧列表、更晚返回**的在途轮询抵达前被先行清空,导致它趁空档把会话加回一次。改为**永久黑名单 `removedIds`**:会话 id 每个连接唯一、绝不重用,删除后在本页面生命周期内一律不重新加回(不再自动清除),从而彻底去掉删除后的闪现;仅当 disconnect 意外失败(会话实际仍存在)时撤下标记让会话可重新显示。`pollOne` 的 gone 分支同样写黑名单,防止在途列表加回。

## [0.5.4] - 2026-09-03

### 修复

- **删除会话后闪现再消失**:点删除时客户端立即移除会话,但一个在途的 `discoverSessions`(150ms 轮询,读到删除前的旧列表)又把它加回屏幕,下一轮才移除。引入「删除中」集合,`discoverSessions` 对删除中的 id 一律不重新加回,直到服务器列表确实不再出现它;disconnect 失败时撤下标记让会话可重新显示。

## [0.5.3] - 2026-09-03

### 修复

- **`netshell.poll` 会话不存在 → handler 失败刷屏**:客户端仍在轮询一个已被宿主移除的会话 id(0.5.2 的 disconnect 真正移除会话后,残留的 activeId 每 150ms 撞上 404)。双重加固:
  - 宿主 `netshell.poll` 对不存在的会话返回良性 `{ gone: true, status: 'closed' }`,不再 reject(瞬态旧 id 无副作用、不再被网关记成 handler 失败);
  - 客户端 `discoverSessions` 现在**清理已从宿主消失的会话**(并清空指向它的 activeId),`pollOne` 收到 `gone` 时同样自清理 —— 彻底停止对死会话的轮询。

## [0.5.2] - 2026-09-03

### 修复

- **会话删除无效(0.5.x 长期 bug)**:`netshell.disconnect` 此前只终止进程不改动 `sessions` Map,会话残留在列表里,客户端下一轮 `discoverSessions` 又把它加回来 —— 「点了删除却删不掉」。现在 disconnect 终止后即从 Map 移除,并补充了回归断言。
- **Tab 圆点不变绿**:`discoverSessions` 只同步 `agentBusy`,从不更新 `cur.status`;而 `pollOne` 只轮询当前选中会话。因此工具(agent)创建的会话永远停在首次探测时的 `connecting`,圆点只闪烁不转绿。现在 `discoverSessions` 同步 status / pending / closedReason / hint 供圆点据此变色;`sessions.list` 补充返回 `closedReason` / `hint`。

### 变更

- **裸 `rm` 也纳入危险确认**:此前只拦截 `rm -rf / -fr / -r *`,裸 `rm test1.md`(无递归参数)会直接放行,与「删除操作应当确认」的预期不符。新增 `rm *` ask 规则,任何 `rm` 删除都先在对话窗口弹窗确认。

## [0.5.1] - 2026-09-03

### 修复

- **双 Tab(0.5.0 回归)**:Tab 圆点刷新不再「注销再重注册」槽位 —— `slots.inject` 的 watcher 会在槽位变脏时重跑 factory 再建一个 cell,与手动重注册的并存,页面上出现两个「远程终端」。现改为单次注册,label thunk 返回订阅插件 store 的函数组件 `TabDot`,状态变化由 React 原地重渲染,注册表零扰动。
- **Tab 顺序(真正根因)**:上游 guard 修复早已写入 `cordis-client-runner/src/client/guard.ts`(list 类槽位豁免强制 priority),但其 lib 产物一直未重建,页面跑的仍是旧逻辑(`spec.kind !== "chain"`)→ `order: 20` 失效、后注册排最左。已重建 `pnpm build:lib:client` + `pnpm build:web`,产物含 `&& spec.kind !== "list"`,硬刷新页面后「远程终端」按 order 排到「轨迹」右侧。

## [0.5.0] - 2026-09-03

### 新增

- **AI 拦截确认移入对话窗口(DSH 原生问题 UI)**:`netshell_run` 触发 `ask` 规则时改走 `ctx.userQuestions.ask` 原生用户提问——问题卡直接弹在对话窗口内(执行一次 / 永久放行该命令 / 拒绝),工具调用原地等待回答后继续;不再设置终端侧 pending、不再把用户拉到远程终端页。`userQuestions` 服务不可用时自动回退到终端横幅确认流程;用户手动在终端敲危险命令的拦截确认保持不变(横幅仍在终端内)。「永久放行」的规则写入逻辑抽取为 `addServerAllowRule` 供原生提问路径复用。
- **Tab 状态圆点**:主区域「远程终端」Tab 标签带状态圆点——灰色 = 无连接,绿色 = 有活跃会话,圆点内数字 = 已连接会话数;agent 正在通过终端执行命令或等待确认时圆点闪烁。实现:标签以 React 元素渲染(运行时 `viewTab.label` 直接作为 Tab 按钮 children),状态签名(连接数 + 通信中)变化时重注册槽位刷新标签,闪烁为纯 CSS 动画(`prefers-reduced-motion` 下停用)。
- 模型工具执行期间会话标记 `agentBusy` 并经 `netshell.sessions.list` 暴露(圆点闪烁数据源),工具结束(含等待回答、拒绝、异常)后清除。

## [0.4.0] - 2026-09-03

### 新增

- **会话管理**:左侧栏会话行悬停出现「重命名 / 删除」;重命名行内编辑(Enter 确认、Esc 取消,空值恢复服务器名);删除对活跃会话先发 `netshell.disconnect` 断开再移除;会话支持**拖拽排序**(原生 DnD,落点行顶部高亮线指示)。重命名与排序为页面内状态(会话本身随宿主进程存续)。
- **终端配色主题**:状态栏新增「深色 / 浅色」切换;两套 ANSI 16 色 + 8 色背景预设(GitHub 风格),终端底色 / 前景色 / 光标色随主题切换;渲染管线改为「解析存索引、渲染时按主题解析色值」,切换后无需重新解析缓冲即全量换色。顺带修复:SGR 2(暗淡)此前误标为关、粗体 + 标准 8 色现按终端惯例映射到亮色变体、粗体/斜体/下划线/删除线属性此前未实际应用,现已全部生效。
- **光标闪烁**:终端光标 `▌` 以 1.1s 硬闪烁动画显示,颜色随主题;`prefers-reduced-motion` 下自动停用动画。

### 修复

- **Tab 顺序**:动态插件此前被 runner guard 强制注入页面级 shadowing priority,而槽位排序是 priority 优先、`order` 兜底,导致 `order: 20` 失效、「远程终端」Tab 被钉在最左。已在 harness `cordis-client-runner` 中豁免 list 类槽位(保留文档化的 `order` 语义,shadowing/chain 行为不变),0.4.0 起配合修复后的 harness,Tab 正确落在「对话 / 轨迹」最右侧。

## [0.3.0] - 2026-09-03

### 变更

- **终端从浮动面板迁入主区域 Tab**:不再注册 `shell.overlay`(右下角浮动窗口)与 `sidebar.footer.action`(侧栏圆形按钮);改为注册 `conversation.view`(id `netshell`,order 20),在主区域「对话 / 轨迹」右侧新增「远程终端」Tab,视图根节点带 `data-conversation-composer-overlay` 进入定高模式(终端内部滚动,输入框悬浮于底部)。
- **会话标签移入 Tab 内容区左侧栏**:Tab 内容左右分区 — 左侧 224px 侧栏列「会话」(活动连接,状态圆点 + 待确认徽章 + 关闭按钮)与「服务器」(点击直接连接),右侧为终端(提示行、危险命令确认横幅、自绘 ANSI 输出、命令历史条);无会话时右侧显示连接引导。
- 轮询与保活行为不变(插件级 150ms interval,Tab 未激活时输出仍持续累积);模型触发的 `ask` 确认现在自动把左侧选中会话切到待确认会话(不再弹出浮层)。
- **源码全文件多行化**:`nsh-client.js` 从「巨型单行 + 字符串拼接」重排为常规多行代码(702 行,最长行 301 字符),`ServerEditor` / `SettingsPage` / `TermView` / `keyToData` / `applySgr` 等全部拆行,行为经新旧纯函数差分测试逐字节等价验证(16 组按键映射 + 14 组 ANSI 输入);`build.mjs` 新增 ≥2000 字符单行硬校验,防止 read 截断问题回归(agent 动态加载不再需要分段拼接流程)。

## [0.1.1] - 2026-09-03

### 安全

- **known_hosts 改为插件私有文件**(对齐 DESIGN §2.1):主机指纹只记录在 `~/.dsh/netshell/known_hosts`(目录 0700、文件 0600,连接时自动创建),不再写入用户 `~/.ssh/known_hosts`,插件学到的指纹与手工 SSH 互不污染、互不牵连;交互终端与模型工具(`ssh -T`)两条路径均生效。注意:升级前通过插件连接过的主机会在新文件里重新走一次首连记录(`accept-new` 自动完成),旧指纹仍保留在 `~/.ssh/known_hosts` 不受影响。

### 新增

- 连接失败诊断新增「主机密钥校验失败」提示(指纹变更 / 验证失败),并说明善后方法(`ssh-keygen -R <主机> -f ~/.dsh/netshell/known_hosts`)。

## [0.1.0] - 2026-09-03

首个可用版本:P1 核心闭环 + 模型工具。

### 新增

- **服务器档案管理**:设置页完整 CRUD;名称 / 主机 / 端口 / 用户名 / 认证方式(密码、私钥、ssh-agent)/ 权限等级;密码存入 DSH 加密凭据库,支持「留空保持不变」与「清除已存密码」;档案列表绿点提示密码状态。
- **SSH 连接**:PTY 包装本机 `ssh` 二进制;`StrictHostKeyChecking=accept-new` 首连自动接受新指纹;`ServerAliveInterval=15` 保活、`ConnectTimeout=12` 超时;密码经临时 askpass 脚本注入(0700,会话结束即删,密码不进任何会话与日志)。
- **浮动终端面板**(`shell.overlay`):多会话 chip 切换、状态圆点、自绘 ANSI 渲染(SGR 16 色 + 属性、清行清屏、`\r` 回车重绘支持进度条)、完整按键映射(Ctrl 组合键、方向键、Home/End 等)、`↑/↓` 会话内历史回溯、近底部自动滚动、收起后台保活。
- **Guard 命令护栏**:Host 侧行缓冲 + 回车评估;`open / guarded / locked` 三级权限;38 条内置 `deny/ask` 规则(删根、格式化磁盘、fork 炸弹、关机重启、删库、强推、清防火墙等);自动剥离 `sudo/doas/nice/nohup/env` 前缀再匹配;通配符 `*`/`?`、不区分大小写;密码提示输入旁路。
- **拦截确认**:命中 `ask` 的命令挂起等待;面板横幅三选一「执行一次 / 永久放行该命令 / 拒绝」;「永久放行」按命令原文写入该服务器规则表。
- **服务器自定义规则**:每服务器规则表(`pattern + allow/ask/deny`),优先级高于内置规则库。
- **命令历史条**:执行 / 拦截 / 放行实时计数、最近命令、可展开的完整历史(时间戳 + 决策徽章)。
- **模型工具**:`netshell_servers`(列出服务器档案)、`netshell_run`(远程执行命令,与人工输入共用同一 Guard;`ask` 命令等待面板确认,最长 10 分钟;`timeoutMs` 默认 30000);模型执行过程与输出同步回显到终端面板。
- **侧栏入口**(`sidebar.footer.action`):活动会话数徽章;轮询发现会话,模型触发的确认自动弹出面板。
- **失败诊断提示**:认证失败 / 连接被拒 / 连接超时 / 主机名无法解析的中文提示。
- **输出保护**:宿主侧 160K 字符有界缓冲,面板侧 1200 行有界缓冲,超出显示省略提示。
