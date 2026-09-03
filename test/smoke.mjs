#!/usr/bin/env node
/**
 * 静态包(lib/)冒烟测试:不依赖真实 DSH 运行时,用桩服务驱动生成的两个半区,
 * 验证「宿主 harness shim → HTTP RPC 分发 → 客户端工厂装配」整条链路。
 *
 *   node test/smoke.mjs   (或 pnpm test)
 */
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// ── @deepseek-ai/dsh-tools 桩(冒烟只需恒等 defineTool;真实安装用真包) ──
const toolsStubDir = join(root, 'node_modules/@deepseek-ai/dsh-tools')
if (!existsSync(join(toolsStubDir, 'package.json'))) {
  mkdirSync(toolsStubDir, { recursive: true })
  writeFileSync(join(toolsStubDir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-tools', version: '0.0.0-smoke', type: 'module', main: 'index.js' }))
  writeFileSync(join(toolsStubDir, 'index.js'), 'export function defineTool(definition) { return definition }\n')
  console.log('smoke: 已写入 dsh-tools 桩(node_modules,不入库)')
}

let passed = 0
function ok(condition, label) {
  if (!condition) { console.error('FAIL: ' + label); process.exitCode = 1 } else { passed++; console.log('ok: ' + label) }
}

// ── 宿主半区:装配 + RPC 路由挂到真实 http server ─────────────────────────
const host = await import(pathToFileURL(join(root, 'lib/index.js')).href)
ok(host.name === 'netshell', '宿主导出 name=netshell')
ok(Array.isArray(host.inject) && ['subprocess', 'credentials', 'timer', 'tools', 'webServer'].every(s => host.inject.includes(s)), '宿主 inject 覆盖所需服务')

const fakeCredentials = {
  readRecord: async () => ({ kind: 'grant', payload: { version: 1, servers: [{ id: 'srv1', name: 'dev-box', host: '10.0.0.5', port: 22, user: 'deploy', auth: 'agent', level: 'guarded' }] } }),
}
const registeredTools = {}
let rpcHandler = null
const hostCtx = {
  subprocess: {}, credentials: fakeCredentials, timer: {},
  tools: { register: (tool) => { registeredTools[tool.name] = tool; return () => {} } },
  webServer: { register: (route) => { rpcHandler = route.handler; return () => {} } },
  effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d() } },
}
host.apply(hostCtx, { enabled: true, routePath: '/netshell/rpc' })
ok(typeof rpcHandler === 'function', 'webServer 路由已注册')
ok(registeredTools.netshell_servers && registeredTools.netshell_run, 'netshell_servers / netshell_run 已注册')

// 服务器侧直连工具执行(过 defineTool 归一化后的定义)
const toolResult = await registeredTools.netshell_servers.execute({})
ok(Array.isArray(toolResult.servers) && toolResult.servers[0].id === 'srv1', 'netshell_servers.execute 经凭据桩返回档案')

// 挂真实 http server,验证 RPC 分发(含错误路径)
const server = createServer((req, res) => rpcHandler(req, res))
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const rpc = async (method, body, method_) => {
  const res = await fetch(`http://127.0.0.1:${port}/netshell/rpc`, { method: method_ || 'POST', ...(method_ ? {} : { body }) })
  return { status: res.status, json: await res.json().catch(() => null) }
}
const sessions = await rpc('netshell.sessions.list', JSON.stringify({ method: 'netshell.sessions.list', args: {} }))
ok(sessions.status === 200 && Array.isArray(sessions.json.sessions), 'RPC: sessions.list → 200')
const missing = await rpc('nope', JSON.stringify({ method: 'nope', args: {} }))
ok(missing.status === 404, 'RPC: 未知方法 → 404')
const badMethod = await rpc(null, null, 'GET')
ok(badMethod.status === 405, 'RPC: GET → 405')
const broken = await rpc('x', '{oops')
ok(broken.status === 500, 'RPC: 非法 JSON → 500')

// ── 客户端半区:window/__ModuleLoader__/require/document 桩 + 装配 ─────────
const registrations = []
const insertedStyles = []
globalThis.window = { __ModuleLoader__: { load(definition) { globalThis.__clientDef = definition } } }
globalThis.document = {
  createElement: () => ({ setAttribute() {}, textContent: '' }),
  head: { appendChild(el) { insertedStyles.push(el) } },
}
const reactStub = { createElement: (type, props, ...children) => ({ type, props, children }) }
const requireStub = (id) => { if (id === 'react') return reactStub; throw new Error('unexpected require: ' + id) }

await import(pathToFileURL(join(root, 'lib/client.js')).href)
const clientDef = globalThis.__clientDef
ok(clientDef && clientDef.id === '@xgone/dsh-netshell', '客户端经 __ModuleLoader__.load 注册')
const clientPlugin = clientDef.factory(requireStub)

const clientEffects = []
const slotsFacade = {
  inject: (slotName, factory) => { const reg = factory(); registrations.push({ slotName, reg }) },
  register: (meta) => meta,
}
const clientCtx = {
  get(name) { return name === 'slots' ? slotsFacade : undefined },
  effect(fn) { const d = fn(); clientEffects.push(d); return () => { if (typeof d === 'function') d() } },
}
clientPlugin.apply(clientCtx)
ok(registrations.map(r => r.slotName).join(',') === 'sidebar.footer.action,shell.overlay,settings.section', '三个 slot 已注册(入口/浮层/设置页)')
ok(insertedStyles.length === 1 && insertedStyles[0].textContent.includes('.nsh-root'), '样式已注入')

// 清理:客户端 150ms 轮询 interval 的 disposer 生效(进程可退出)
for (const dispose of clientEffects) dispose()
server.close()
ok(passed > 0, `全部 ${passed} 项断言通过`)
