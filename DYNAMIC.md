# 动态加载操作手册(给新会话 / AI Agent)

> 目标:在新 DSH 会话中把本插件的 `src/nsh-host.js` 与 `src/nsh-client.js` 作为动态 Cordis Plugin 的 **Host / Client 两个半区**一次性加载成功,不再试错。
> 本文按 2026-09 实际操作验证过的流程编写,包含全部踩过的坑。

## 0. 前置事实(源码形态决定了加载方式)

两个源文件本身就是「函数体」形态(顶层 `var …; return { inject, apply }`),可以直接作为 `cordis_define` 的 `code.host` / `code.client` **原样内联**,不需要任何改写:

| 半区 | 文件 | 自由变量(沙箱 builtin,勿传参) | inject 依赖 | 返回 |
|------|------|------|------|------|
| Host | `src/nsh-host.js`(约 816 行) | `harness` | `['subprocess', 'credentials', 'timer']` | `{ inject, apply }` |
| Client | `src/nsh-client.js`(约 700 行,0.3.0 起全文件多行化) | `React`、`host`、`styles` | `['timer']`,内部 `ctx.get('slots')` | `{ inject, apply }` |

- Host 通过 `harness.handle(...)` 注册 7 个 Client→Host RPC(`netshell.profiles.list/save/delete`、`netshell.connect`、`netshell.sessions.list`、`netshell.input`、`netshell.poll`、`netshell.decide`、`netshell.disconnect`),并用 `harness.defineTool` + `harness.registerTool(ctx, t)` 注册两个模型工具。
- Client 注册两个 Slot:`conversation.view`(id `netshell`, order 20,主区域「远程终端」Tab,「对话 / 轨迹」右侧)、`settings.section`(id `netshell`, order 50)。
- **不要**用静态包 `lib/index.js` / `lib/client.js` 做动态加载——那是带 shim 的 ESM 生成物,动态沙箱不认 `import`。

## 1. 操作序列(按顺序执行)

```
1. cordis_inspect_list                          # 确认 Provider 还在(通常可跳过)
2. cordis_define  → 得到 pluginId + packageId   # 只定义,不执行
3. cordis_inspect_self(pluginId, packageId)     # 校验存储的两个半区与 src/ 文件逐字节一致(见 §3)
4. cordis_run(pluginId, packageId, mode:"run")  # 返回 awaiting-approval 属正常
5. 用户在 UI 的 Run 卡片点「允许」               # 每个新 packageId 都要单独批准
6. cordis_inspect_self / Tool.listTools         # 验证运行状态与工具注册(见 §4)
```

### cordis_define 参数模板

```json
{
  "plugin": { "kind": "new", "idPrefix": "nsh" },
  "name": "NetShell 远程终端",
  "purpose": "加载 dsh-netshell 的动态插件形态:主区域「远程终端」Tab(左会话列表 + 右终端分栏)、危险命令护栏、设置页服务器档案管理,以及 netshell_servers / netshell_run 两个模型工具。",
  "code": { "host": "<src/nsh-host.js 全文>", "client": "<src/nsh-client.js 全文>" }
}
```

要点:`plugin` / `name` / `purpose` / `code` 是**四个独立参数**;`code.host` 与 `code.client` 必须在**同一次** define 里成对给出——只给 client 的包没有 Host 半区,RPC 与工具全不可用(本次就踩过)。

### 修改已有插件时

用 `plugin: { "kind": "existing", "pluginId": "<原ID>" }` 追加新包(旧包不可变,不会被覆盖),然后用 `cordis_run` `mode:"update"` 切换。改了 `src/` 源码后的更新迭代走这条路。

## 2. 踩坑清单(每一条都真实踩过)

1. **超长行截断(历史坑,0.3.0 起已消除)**。read 工具会截断超 2000 字符的行,旧版 client 的 CSS / ServerEditor / SettingsPage 都是数千字符的单行,当时只能用 bash 分段取再无缝拼接。现在源码全文件多行化,任何一行都短于 2000 字符(`scripts/build.mjs` 有硬校验,≥2000 直接构建失败),read 工具可整读,两个半区都能直接照 read 内容转录,不再需要分段拼接。若未来改出超长行,build 会指明行号。
2. **idPrefix 必须是 3–6 个小写英文字母**。`netshell`(8 个)会被拒;用 `nsh`。
3. **一次 define 包含两个半区**,且各参数独立传,不要把 name/purpose 塞进 code(会被当成 code 的多余属性拒绝)。
4. **逐字节一致是硬要求**,凭印象改写必错。本次实际踩中的三处:
   - client CSS 行(第 6 行)结尾是 `+ TK.t3 + '}'`——**单个**右花括号,多写一个就是 SyntaxError;
   - host 的 makeAskpass(第 294 行)是 `+ BACK + 'n" "$NETSHELL_PW"'`——JS 字面量里**没有**反斜杠,`\n` 由运行时的 `BACK = String.fromCharCode(92)` 拼出;多转义会让 askpass 输出坏掉、密码认证失败;
   - client 末行(第 134 行)必须完整保留 `return { inject: ['timer'], apply: function (ctx) { … } }`——丢了它,client 半区求值返回 `undefined`,报 "client half returned `undefined`"。
5. **Client 半区的求值结果是函数体返回值**。报 "returned `undefined`" 十有八九是末尾的 `return {…}` 行没抄全或被截断。
6. **内联 JSON 里不含反引号**(两个源文件都遵守此约定),但没有别的特殊字符顾虑;超大参数(两半区合计约 60KB)可以一次传完,不要试图省略注释或压缩改写。
7. **每个新 packageId 都需要 UI 批准**(单勾只授权当前包)。批准前 run 返回 `awaiting-approval` 属正常,**不要重试,等用户点击**;用户拒绝后不要再发。
8. **失败后的修复路径**:技术失败(如 client-half-failed)→ 用 `cordis_inspect_self(pluginId, packageId)` 读存储的源码定位差异 → 在**同一插件**下 define 新包 → 重新 run。坏掉的废弃插件用 `cordis_undefine` 清理,正在用的用 `cordis_stop` 临时停用。
9. **客户端 Slot 查询**(Slots.listSubTree)在本环境可能报 `"input" must be an object`(传输层问题),不必纠结——本插件三个 Slot 的注册协议以本文档 §0 为准,源码即事实。
10. **动态注册的 `order` 会被 runner guard 覆盖(0.4.0 配套 harness 修复)**。cordis-client-runner 的 `guardedSlots` 曾对所有非 chain 注册强制 `priority = allocatePriority()`(递减,后注册排前),而槽位排序是 priority 优先、`order` 兜底——结果是动态插件传的 `order` 完全失效,注册项被钉在列表最前(0.4.0 前本插件 Tab 因此显示在最左)。已在上游 guard 中豁免 list 类槽位(list 保留文档化 `order` 语义;single/keyed shadowing 与 chain 选举不变),并重新构建了 web 产物。判断这类「顺序不生效」问题别先怀疑自己的 `order` 值——先看 guard 有没有注入 priority。

## 3. 激活前校验(强烈建议,能省一轮失败)

`cordis_inspect_self(pluginId, packageId)` 返回的 `code.host` / `code.client` 是**实际存储**的源码。结果超长时会落盘为 spill 文件(结果尾部给出路径),用 python 做逐字节 diff:

```bash
python3 - <<'EOF'
import json
f='<spill文件路径>'
t=open(f).read()
d,_=json.JSONDecoder().raw_decode(t[t.index('{'):])
code=d['code']
host=open('src/nsh-host.js').read()
client=open('src/nsh-client.js').read()
print('host identical:', code.get('host')==host)
print('client identical:', code.get('client')==client)
EOF
```

两项都是 `True` 再去 `cordis_run`。若不一致,用 difflib 定位差异行,define 修正包后再校验。

## 4. 激活后验证

- `cordis_inspect_self(pluginId)`:`state` 为 `running`,`currentPackageId` 等于刚激活的包;
- `Tool.listTools`(host)出现 `netshell_servers` / `netshell_run`;
- 界面:主区域「对话 / 轨迹」右侧出现「远程终端」Tab(需当前有非空会话才显示 Tab 栏)+ 设置 → 远程终端 分区。

## 5. 生命周期提醒

动态插件是**进程内**的:DSH 重启后消失,需按本文档重新加载;档案与密码存于加密凭据库,不受影响。日常开发改 `src/` 后:define 新包 → run `update` → 批准,改动即时生效。
