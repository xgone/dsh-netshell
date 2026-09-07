// netshell_run 危险命令确认(原生弹卡主路径 + 面板回退兑现)与 netshell.input
// 多字符防绕过的行为测试:
//   1. 主路径:插件直调宿主 userQuestions.ask(exec.agent 原样透传)弹原生确认卡,
//      工具原地等待真人回答;答案由宿主服务返回,choice 参数不作授权依据。
//   2. 回退路径:弹卡不可用(NO_PROVIDER / ASK_ABORTED / 无服务)时面板挂起 +
//      一次性令牌;令牌只有在面板真实裁决后才可兑现,未裁决不消耗。
//   3. netshell.input 内嵌 \r / \n 的多字符输入拆段过 Guard,不存在旁路执行。
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const host = await import(pathToFileURL(join(root, 'lib/index.js')).href)

let fail = 0
const ok = (cond, tag) => { if (cond) { console.log('ok', tag) } else { fail++; console.log('FAIL', tag) } }

const record = {
  kind: 'grant',
  payload: { version: 1, servers: [{ id: 'srv1', name: 'dev-box', host: '10.0.0.5', port: 22, user: 'deploy', auth: 'agent', level: 'guarded', rules: [] }] },
}
const credentials = {
  readRecord: async () => record,
  describe: async (ref) => ({ ref, configured: false, source: 'stub', writable: true }),
  resolve: async () => ({ value: 'pw' }),
  modifyRecord: async (_key, fn) => { const r = await fn(record); return r },
  set: async () => {}, unset: async () => {},
}
function sshOut(text) {
  return {
    pid: 4321,
    write() {},
    terminate() {},
    done: Promise.resolve({ exitCode: 0, signal: null }),
    collected: { stdout: { readFrom: () => ({ text }) }, stderr: { readFrom: () => ({ text: '' }) } },
  }
}
async function* termOut() { yield 'deploy@dev-box:~$ ' }
const ptyWrites = []
const sweeps = [] // TOOL_ASK_TTL 级 timer 的手动触发句柄
let spawnTerminalCalls = 0
const terminalDoneResolvers = []
const timer = {
  timeout: (ms) => ms >= 600000
    ? new Promise((res) => { sweeps.push(res) })
    : new Promise((r) => setTimeout(r, 0)),
  interval: () => () => {},
}
const subprocess = {
  resolveExecutable: async () => '/usr/bin/ssh',
  spawnTerminal: async () => {
    spawnTerminalCalls += 1
    let finish
    const done = new Promise((resolve) => { finish = resolve })
    terminalDoneResolvers.push(finish)
    return { pid: 123 + spawnTerminalCalls, output: termOut(), write: (d) => { ptyWrites.push(d) }, terminate() {}, done }
  },
  spawn: () => sshOut('ok-output'),
}

// userQuestions 桩:验证插件的调用形态并按 mode 决定回答/拒绝
const AGENT = { id: 'a1', name: 'root' }
const AGENT2 = { id: 'a2', name: 'second-session' }
const fakeUQ = {
  mode: 'answer', // 'answer' | 'no-provider' | 'aborted'
  answer: ['执行一次'],
  connectionAnswer: '允许本次连接',
  holdConnection: false,
  releaseConnection: null,
  custom: undefined,
  lastRequest: null,
  requests: [],
  askCalls: 0,
  ask(request) {
    this.lastRequest = request
    this.requests.push(request)
    this.askCalls += 1
    if (this.mode === 'no-provider') return Promise.reject({ code: 'NO_PROVIDER', message: 'no answerer' })
    if (this.mode === 'aborted') return Promise.reject({ code: 'ASK_ABORTED', message: 'aborted' })
    const isConnection = request.questions[0].id === 'netshell-connect'
    const selected = isConnection ? this.connectionAnswer : this.answer
    if (isConnection && this.holdConnection) {
      return new Promise((resolve) => {
        this.releaseConnection = (pick = this.connectionAnswer) => {
          this.holdConnection = false
          resolve({ answers: [{ id: request.questions[0].id, selected: [pick] }] })
        }
      })
    }
    const sel = Array.isArray(selected) ? selected : [selected]
    return Promise.resolve({ answers: [{ id: request.questions[0].id, selected: sel, ...(this.custom ? { custom: this.custom } : {}) }] })
  },
}

const registeredTools = {}
let rpcHandler = null
const hostCtx = {
  subprocess, credentials, timer,
  tools: { register: (t) => { registeredTools[t.name] = t; return () => {} } },
  webServer: { register: (route) => { rpcHandler = route.handler; return () => {} } },
  effect(fn) { fn(); return () => {} },
  get(name) { return name === 'userQuestions' ? fakeUQ : undefined },
}
host.apply(hostCtx, { enabled: true, routePath: '/netshell/rpc' })

const server = createServer((req, res) => rpcHandler(req, res))
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const rpc = async (method, args) => {
  const res = await fetch(`http://127.0.0.1:${server.address().port}/netshell/rpc`, { method: 'POST', body: JSON.stringify({ method, args }) })
  return res.json()
}
const sessionsList = async () => (await rpc('netshell.sessions.list', {})).sessions
const runAs = (agent, args) => registeredTools.netshell_run.execute({ server: 'srv1', ...args }, { agent, signal: undefined })
const run = (args) => runAs(AGENT, args)
const CMD = 'shutdown -h now'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── A0. 首次模型建连必须先确认,确认前不得启动 SSH ──
fakeUQ.mode = 'answer'
fakeUQ.answer = ['执行一次']
fakeUQ.connectionAnswer = '允许本次连接'
fakeUQ.holdConnection = true
const beforeFirstConnect = spawnTerminalCalls
const firstRun = run({ command: 'echo first' })
await sleep(5)
const concurrentRun = run({ command: 'echo parallel' })
await sleep(5)
ok(fakeUQ.requests.some((x) => x.questions[0].id === 'netshell-connect'), 'A0: 首次模型建连弹出连接确认卡')
ok(spawnTerminalCalls === beforeFirstConnect, 'A0: 用户确认前没有启动 SSH')
ok(fakeUQ.askCalls === 1, 'A0: 并发模型调用共享同一条连接确认')
ok(fakeUQ.requests.at(-1).agent === AGENT, 'A0: 连接确认原样透传 live agent')
fakeUQ.releaseConnection('允许本次连接')
let r = await firstRun
const concurrentResult = await concurrentRun
ok(r.ok === true && String(r.output).includes('ok-output'), 'A0: 允许连接后才执行远程命令')
ok(concurrentResult.ok === true && String(concurrentResult.output).includes('ok-output'), 'A0: 并发调用复用已确认会话')

// ── A1. 主路径:ask 命中 → 直调 userQuestions.ask,参数形态正确 ──
r = await run({ command: CMD })
ok(fakeUQ.askCalls === 2, 'A1: 首次连接确认后,危险命令再次弹出确认')
const req = fakeUQ.lastRequest
ok(req && req.agent === AGENT, 'A1: agent 为 exec.agent 原样透传(全等)')
ok(req && req.questions.length === 1 && req.questions[0].question.includes(CMD), 'A1: 问题文本包含命令')
ok(req && req.questions[0].options.length === 3
  && req.questions[0].options.map((o) => o.label).join('|') === '执行一次|永久放行该命令|拒绝', 'A1: 三个选项标签正确')
ok(r.ok === true && r.blocked === false && String(r.output).includes('ok-output'), 'A1: 「执行一次」→ 执行并回传输出')
ok(r.action === 'allow' && !('confirmToken' in r), 'A1: 主路径不签发令牌')

// ── A1b. 第二个模型会话复用 SSH,但必须独立确认 ──
const secondAgentAskBefore = fakeUQ.askCalls
const secondAgentSpawnBefore = spawnTerminalCalls
r = await runAs(AGENT2, { command: 'echo second-agent' })
ok(fakeUQ.askCalls === secondAgentAskBefore + 1, 'A1b: 第二个 Agent 首次使用同一服务器仍需确认')
ok(fakeUQ.lastRequest && fakeUQ.lastRequest.questions[0].id === 'netshell-connect', 'A1b: 第二个 Agent 弹出连接确认')
ok(fakeUQ.lastRequest && fakeUQ.lastRequest.agent === AGENT2, 'A1b: 确认卡绑定第二个 live Agent')
ok(spawnTerminalCalls === secondAgentSpawnBefore, 'A1b: 第二个 Agent 复用共享 SSH 会话')
ok(r.ok === true && String(r.output).includes('ok-output'), 'A1b: 第二个 Agent 确认后执行成功')

// ── A2. 永久放行 ──
fakeUQ.answer = ['永久放行该命令']
r = await run({ command: 'reboot now' })
ok(r.ok === true && r.blocked === false, 'A2: 「永久放行该命令」→ 执行成功')
const rules = record.payload.servers[0].rules
ok(rules.some((x) => x.pattern === 'reboot now' && x.action === 'allow'), 'A2: 规则表已写入 allow 规则')

// ── A3. 拒绝 / 自定义文本 → 安全默认拒绝 ──
fakeUQ.answer = ['拒绝']
r = await run({ command: 'halt now' })
ok(r.ok === false && r.blocked === true && r.action === 'deny', 'A3: 「拒绝」→ deny')
fakeUQ.answer = []
fakeUQ.custom = '其实我想说别的'
r = await run({ command: 'poweroff now' })
ok(r.ok === false && r.blocked === true && r.action === 'deny', 'A3: 自定义文本(未选选项)→ 安全默认 deny')
fakeUQ.custom = undefined

// ── A4. choice 参数被忽略(伪造 choice 无法放行) ──
fakeUQ.answer = ['拒绝']
r = await run({ command: 'init 0', choice: 'allow' })
ok(r.ok === false && r.blocked === true && r.action === 'deny', 'A4: 模型伪造 choice=allow 无效(授权只认真人答案)')

// ── A5. ASK_ABORTED → aborted,不回退面板 ──
fakeUQ.mode = 'aborted'
r = await run({ command: CMD })
ok(r.ok === false && r.blocked === true && r.action === 'aborted', 'A5: 用户中止 → action=aborted')
ok(!r.confirmToken, 'A5: 中止不进入面板回退')

// ── B. 回退路径:NO_PROVIDER → 面板挂起 + 一次性令牌 ──
fakeUQ.mode = 'no-provider'
r = await run({ command: CMD })
const tokB = r.confirmToken
ok(r.ok === false && r.blocked === true && r.action === 'ask' && r.needsConfirmation === true, 'B: NO_PROVIDER → 回退 blocked/ask')
ok(typeof tokB === 'string' && tokB.length > 0, 'B: 签发一次性 confirmToken')
let sessions = await sessionsList()
const pendSession = sessions.find((s) => s.pending)
ok(!!pendSession, 'B: 会话已挂起(面板横幅数据源)')

// ── B1. 未裁决:携令牌重跑 → blocked 尚未裁决,令牌保留 ──
r = await run({ command: CMD, confirmToken: tokB })
ok(r.ok === false && r.blocked === true && String(r.message).includes('尚未'), 'B1: 未裁决 → blocked 尚未裁决')
r = await run({ command: CMD, confirmToken: tokB })
ok(r.blocked === true && r.confirmToken === tokB, 'B1: 未裁决不消耗令牌(可重试)')

// ── B6. 挂起期间再次 ask → 已有待确认,不覆盖 ──
r = await run({ command: 'docker system prune -a' }) // 命中内置 ask(非 deny)
ok(r.ok === false && !r.confirmToken && String(r.message).includes('已有'), 'B6: 同会话第二条 ask 被拒,不覆盖挂起')

// ── B2. 面板裁决 allow → 携令牌兑现;令牌一次性 ──
const pidB = pendSession.pending
const dec = await rpc('netshell.decide', { id: pendSession.id, pendingId: pidB, action: 'allow' })
ok(dec.ok === true, 'B2: 面板 decide(allow) 成功')
r = await run({ command: CMD, confirmToken: tokB })
ok(r.ok === true && r.blocked === false && String(r.output).includes('ok-output'), 'B2: 面板 allow → 携令牌兑现执行')
r = await run({ command: CMD, confirmToken: tokB })
ok(r.ok === false && r.blocked === true && String(r.rule).includes('令牌'), 'B2: 已用令牌复用 → 拒绝')

// ── B2c. 面板已裁决但模型漏带令牌重跑 → (服务器,命令) 匹配直接兑现 ──
r = await run({ command: CMD }) // 新挂起
const pendC = (await sessionsList()).find((s) => s.pending)
await rpc('netshell.decide', { id: pendC.id, pendingId: pendC.pending, action: 'allow' })
r = await run({ command: CMD })
ok(r.ok === true && r.blocked === false, 'B2c: 漏带令牌但面板已裁决 → 兑现执行')

// ── B3. 面板裁决 deny ──
r = await run({ command: CMD })
const pendD = (await sessionsList()).find((s) => s.pending)
await rpc('netshell.decide', { id: pendD.id, pendingId: pendD.pending, action: 'deny' })
r = await run({ command: CMD })
ok(r.ok === false && r.blocked === true && r.action === 'deny', 'B3: 面板 deny → 拒绝(带不带令牌一致)')

// ── B4. 面板裁决 always → 规则写入,后续放行 ──
r = await run({ command: 'crontab -r' })
const pendE = (await sessionsList()).find((s) => s.pending)
await rpc('netshell.decide', { id: pendE.id, pendingId: pendE.pending, action: 'always' })
ok(record.payload.servers[0].rules.some((x) => x.pattern === 'crontab -r' && x.action === 'allow'), 'B4: 面板 always → 规则表写入')
r = await run({ command: 'crontab -r' })
ok(r.ok === true && r.blocked === false, 'B4: 后续同命令经 allow 规则放行')

// ── B5. 令牌与命令不匹配 → 拒绝;随后裁决清理该挂起 ──
r = await run({ command: 'shutdown -r now' })
const tokF = r.confirmToken
r = await run({ command: CMD, confirmToken: tokF })
ok(r.ok === false && r.blocked === true && String(r.rule).includes('不匹配'), 'B5: 令牌与命令不匹配 → 拒绝')
const pendF = (await sessionsList()).find((s) => s.pending)
await rpc('netshell.decide', { id: pendF.id, pendingId: pendF.pending, action: 'deny' })

// ── B7. 挂起超时:TOOL_ASK_TTL sweep 撤销挂起并作废令牌 ──
const sweepsBefore = sweeps.length
r = await run({ command: CMD })
const tokG = r.confirmToken
ok(sweeps.length === sweepsBefore + 1 && typeof tokG === 'string', 'B7: 挂起注册超时 sweep 并签发令牌')
sweeps[sweeps.length - 1](undefined)
await sleep(5)
r = await run({ command: CMD, confirmToken: tokG })
ok(r.ok === false && r.blocked === true && String(r.rule).includes('无效或已过期'), 'B7: sweep 后令牌作废 → 拒绝')
sessions = await sessionsList()
ok(!sessions.some((s) => s.pending), 'B7: sweep 后挂起已撤销')

// ── C. 动态加载形态(无 userQuestions 服务)→ 同样走面板回退 ──
const hostCtxNoUQ = { ...hostCtx, get: () => undefined }
const host2 = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const registered2 = {}
let rpcHandler2 = null
host2.apply({
  subprocess, credentials, timer,
  tools: { register: (t) => { registered2[t.name] = t; return () => {} } },
  webServer: { register: (route) => { rpcHandler2 = route.handler; return () => {} } },
  effect(fn) { fn(); return () => {} },
  get: () => undefined,
}, { enabled: true, routePath: '/netshell/rpc2' })
const noUqSpawnBefore = spawnTerminalCalls
r = await registered2.netshell_run.execute({ server: 'srv1', command: CMD }, { agent: AGENT, signal: undefined })
ok(r.ok === false && r.blocked === true && r.action === 'connect-confirmation-unavailable' && !r.confirmToken, 'C: 无 userQuestions 服务 → 拒绝自动建连')
ok(spawnTerminalCalls === noUqSpawnBefore, 'C: 无法确认时没有启动 SSH')

// ── C1. 会话被用户断开后,下一次模型调用必须重新确认 ──
fakeUQ.mode = 'answer'
fakeUQ.answer = ['执行一次']
fakeUQ.connectionAnswer = '允许本次连接'
const liveBeforeUserDisconnect = (await sessionsList()).find((s) => s.serverName === 'dev-box' && s.status === 'live')
ok(!!liveBeforeUserDisconnect, 'C1: 断开前存在存活远程会话')
await rpc('netshell.disconnect', { id: liveBeforeUserDisconnect.id })
const userReconnectSpawnBefore = spawnTerminalCalls
fakeUQ.holdConnection = true
const userReconnect = run({ command: 'echo after-user-disconnect' })
await sleep(5)
ok(spawnTerminalCalls === userReconnectSpawnBefore, 'C1: 用户断开后确认前不自动重连')
ok(fakeUQ.requests.at(-1).questions[0].id === 'netshell-connect', 'C1: 用户断开后再次弹出连接确认')
fakeUQ.releaseConnection('允许本次连接')
r = await userReconnect
ok(r.ok === true && String(r.output).includes('ok-output'), 'C1: 重新确认后恢复执行')

// ── C2. SSH 会话异常退出后,沿用服务器授权自动重连 ──
const doneAfterUserReconnect = terminalDoneResolvers[terminalDoneResolvers.length - 1]
doneAfterUserReconnect({ exitCode: 255, signal: null })
await sleep(5)
const networkReconnectSpawnBefore = spawnTerminalCalls
const askCallsBeforeNetworkReconnect = fakeUQ.askCalls
r = await run({ command: 'echo after-network-drop' })
ok(spawnTerminalCalls === networkReconnectSpawnBefore + 1, 'C2: SSH 断开后自动建立新的 SSH 会话')
ok(fakeUQ.askCalls === askCallsBeforeNetworkReconnect, 'C2: SSH 断开后沿用已有模型授权')
ok(r.ok === true && String(r.output).includes('ok-output'), 'C2: 沿用授权后恢复执行')

// ── D. netshell.input 多字符防绕过 ──
const conn = await rpc('netshell.connect', { serverId: 'srv1' })
ptyWrites.length = 0
// D1: 内嵌 \r 的整条危险命令 → Guard 拦下,回车未直达 PTY
await rpc('netshell.input', { id: conn.id, data: 'shutdown -h now\r' })
let snap = await rpc('netshell.poll', { id: conn.id })
ok(!!snap.pending && snap.pending.command === CMD, 'D1: 内嵌\\r 的危险命令 → Guard 拦下为 pending')
ok(!ptyWrites.join('').includes('shutdown -h now\r'), 'D1: 回车未直达 PTY(未执行)')
await rpc('netshell.decide', { id: conn.id, pendingId: snap.pending.id, action: 'deny' })
ptyWrites.length = 0
// D2: 良性命令内嵌 \r → 正常执行
await rpc('netshell.input', { id: conn.id, data: 'ls -la\r' })
snap = await rpc('netshell.poll', { id: conn.id })
ok(!snap.pending, 'D2: 良性命令无 pending')
ok(ptyWrites.join('').includes('ls -la\r'), 'D2: 良性命令整行+回车正常送达 PTY')
ptyWrites.length = 0
// D3: 多行输入逐段过 Guard:第一段执行、第二段拦下
await rpc('netshell.input', { id: conn.id, data: 'echo hi\nshutdown -h now\r' })
snap = await rpc('netshell.poll', { id: conn.id })
ok(ptyWrites.join('').includes('echo hi\r'), 'D3: 第一段良性命令已执行')
ok(!!snap.pending && snap.pending.command === CMD, 'D3: 第二段危险命令被 Guard 拦下')
ok(!ptyWrites.join('').includes('shutdown -h now\r'), 'D3: 危险命令回车未直达 PTY')
await rpc('netshell.decide', { id: conn.id, pendingId: snap.pending.id, action: 'deny' })

console.log(fail === 0 ? 'ASK-FLOW-OK' : `ASK-FLOW-FAILED (${fail} failures)`)
if (fail > 0) process.exitCode = 1
server.close()
