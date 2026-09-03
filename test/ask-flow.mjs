// 针对 netshell_run 危险命令确认(token + ask_user_question 委托)的行为测试
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = '/Users/gone/Work/Code/dsh-netshell'
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
async function* termOut() { yield 'Linux dev-box\r\n' }
const subprocess = {
  resolveExecutable: async () => '/usr/bin/ssh',
  spawnTerminal: async () => ({ pid: 123, output: termOut(), write() {}, terminate() {}, done: new Promise(() => {}) }),
  spawn: () => sshOut('ok-output'),
}
const timer = { timeout: () => new Promise(r => setTimeout(r, 0)), interval: () => () => {} }

const registeredTools = {}
let rpcHandler = null
const hostCtx = {
  subprocess, credentials, timer,
  tools: { register: (t) => { registeredTools[t.name] = t; return () => {} } },
  webServer: { register: (route) => { rpcHandler = route.handler; return () => {} } },
  effect(fn) { fn(); return () => {} },
  get() { return undefined },
}
host.apply(hostCtx, { enabled: true, routePath: '/netshell/rpc' })

const server = createServer((req, res) => rpcHandler(req, res))
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const sessionsList = async () => {
  const res = await fetch(`http://127.0.0.1:${port}/netshell/rpc`, { method: 'POST', body: JSON.stringify({ method: 'netshell.sessions.list', args: {} }) })
  return (await res.json()).sessions
}
const outAll = async () => {
  const res = await fetch(`http://127.0.0.1:${port}/netshell/rpc`, { method: 'POST', body: JSON.stringify({ method: 'netshell.poll', args: { id: (await sessionsList())[0].id } }) })
  return (await res.json()).output
}
const rpcPost = async (method, args) => {
  const res = await fetch(`http://127.0.0.1:${port}/netshell/rpc`, { method: 'POST', body: JSON.stringify({ method, args }) })
  return res.json()
}
const exec = { agent: { id: 'a1' }, signal: undefined }
const CMD = 'shutdown -h now'

// ── A. 首次拦截 → 签发一次性令牌(不阻塞、不再内部弹卡) ──
let r = await registeredTools.netshell_run.execute({ server: 'srv1', command: CMD }, exec)
ok(r.ok === false && r.blocked === true && r.action === 'ask' && r.needsConfirmation === true, 'A: 首次拦截返回 blocked/ask/needsConfirmation')
ok(typeof r.confirmToken === 'string' && r.confirmToken.length > 0, 'A: 返回一次性 confirmToken')
ok(String(r.message).includes('ask_user_question'), 'A: 结果提示模型先调 ask_user_question')
ok((await outAll()).includes('$ ' + CMD), 'A: 终端回显命令')

// ── B. 携 token + choice=allow 确认执行 ──
const tokA = r.confirmToken
r = await registeredTools.netshell_run.execute({ server: 'srv1', command: CMD, confirmToken: tokA, choice: 'allow' }, exec)
ok(r.ok === true && r.blocked === false && String(r.output).includes('ok-output'), 'B: allow → 执行并回传输出')
ok((await outAll()).includes('[放行]'), 'B: 终端回显放行标记')
ok(record.payload.servers[0].rules.length === 0, 'B: allow 未写入规则表')

// ── C. 令牌一次性:复用已用令牌 → 拒绝 ──
r = await registeredTools.netshell_run.execute({ server: 'srv1', command: CMD, confirmToken: tokA, choice: 'allow' }, exec)
ok(r.ok === false && r.blocked === true && r.action === 'deny', 'C: 已用令牌复用 → 拒绝')
ok(String(r.rule).includes('令牌'), 'C: 拒绝原因是令牌无效')

// ── D. 携 token + choice=always 永久放行 ──
r = await registeredTools.netshell_run.execute({ server: 'srv1', command: CMD }, exec)
const tokD = r.confirmToken
r = await registeredTools.netshell_run.execute({ server: 'srv1', command: CMD, confirmToken: tokD, choice: 'always' }, exec)
ok(r.ok === true && r.blocked === false, 'D: always → 执行成功')
const rules = record.payload.servers[0].rules
ok(rules.length === 1 && rules[0].pattern === CMD && rules[0].action === 'allow', 'D: 规则表已写入 allow 规则')
ok((await outAll()).includes('[永久放行]'), 'D: 终端回显永久放行标记')

// ── E. 携 token + choice=deny 拒绝 ──
r = await registeredTools.netshell_run.execute({ server: 'srv1', command: 'reboot now' }, exec)
const tokE = r.confirmToken
r = await registeredTools.netshell_run.execute({ server: 'srv1', command: 'reboot now', confirmToken: tokE, choice: 'deny' }, exec)
ok(r.ok === false && r.blocked === true && r.action === 'deny', 'E: deny → 拒绝')
ok((await outAll()).includes('[已拒绝]'), 'E: 终端回显拒绝标记')

// ── F. 令牌与命令不匹配 → 拒绝 ──
r = await registeredTools.netshell_run.execute({ server: 'srv1', command: 'poweroff now' }, exec)
const tokF = r.confirmToken
r = await registeredTools.netshell_run.execute({ server: 'srv1', command: 'halt now', confirmToken: tokF, choice: 'allow' }, exec)
ok(r.ok === false && r.blocked === true && r.action === 'deny', 'F: 令牌与命令不匹配 → 拒绝')

// ── G. 裸 rm 文件也拦截签发 token ──
r = await registeredTools.netshell_run.execute({ server: 'srv1', command: 'rm test1.md' }, exec)
ok(r.ok === false && r.action === 'ask' && typeof r.confirmToken === 'string', 'G: 裸 rm 文件触发 ask 并签发 token')

// ── H. disconnect 真正移除会话 ──
let list = await sessionsList()
const sid = list[0].id
const disc = await rpcPost('netshell.disconnect', { id: sid })
ok(disc && disc.ok === true, 'H: disconnect 返回 ok')
list = await sessionsList()
ok(!list.some((s) => s.id === sid), 'H: disconnect 后该会话已从列表移除')

// ── I. poll 已消失会话返回良性 gone ──
const pollGone = await rpcPost('netshell.poll', { id: sid })
ok(pollGone && pollGone.gone === true && pollGone.status === 'closed', 'I: poll 已消失会话返回 gone=true 而非 reject')

server.close()
console.log(fail === 0 ? 'ASK-FLOW-OK' : 'FAILED:' + fail)
process.exit(fail ? 1 : 0)
