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
