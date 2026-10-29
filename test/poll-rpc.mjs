#!/usr/bin/env node
// 回归测试:插件「启用即高频轮询」造成的 RPC 放大。
//
// 旧实现:apply 时无条件起 80ms interval,每 tick 都发 netshell.sessions.list
// ——没有任何连接时也持续 12.5 次/秒。本测试用可控假 timer 直接驱动
// src/nsh-client.js 的 tick,断言自适应轮询的三个不变量:
//   1. 空闲(无会话)时基本不发 RPC(约每 5s 才探测一次列表);
//   2. 页面隐藏时一个 RPC 都不发;
//   3. 有会话后恢复逐 tick poll(终端刷新不被降速)。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'src/nsh-client.js'), 'utf8')
// 源码是「函数体」形态(var …; return { inject, apply }),以自由变量注入桩后求值。
const build = new Function('React', 'host', 'styles', source)

let fail = 0
const ok = (cond, tag) => { if (cond) console.log('ok', tag); else { fail++; console.log('FAIL', tag) } }

let sessions = []
const calls = []
const host = {
  call(method) {
    calls.push(method)
    if (method === 'netshell.profiles.list') return Promise.resolve({ servers: [] })
    if (method === 'netshell.sessions.list') return Promise.resolve({ sessions: sessions })
    if (method === 'netshell.poll') return Promise.resolve({ status: 'live', output: '', events: [], pending: null })
    return Promise.resolve({})
  },
}
const styles = { insert() { return () => {} } }
const React = { createElement() { return {} }, useState(v) { return [v, () => {}] }, useEffect() {} }

const plugin = build(React, host, styles)

let tick = null
const ctx = {
  get(name) { return name === 'slots' ? { inject() {}, register(m) { return m } } : undefined },
  timer: { interval(fn) { tick = fn; return () => {} }, timeout() {} },
  effect(fn) { fn() },
  locale: null,
}

const flush = () => new Promise((r) => setImmediate(r))
const drain = async () => { for (let i = 0; i < 6; i++) await flush() }
const count = (m) => calls.filter((x) => x === m).length
const reset = () => { calls.length = 0 }
const TICK_MS = 80 // 与源码保持一致(仅用于换算 tick 数)

plugin.apply(ctx)
await drain() // 启动:refreshServers + 一次即时 discoverSessions
ok(count('netshell.sessions.list') === 1, '启动时只探测一次会话列表(不再每 80ms 洪泛)')

// 空闲 4.8s(60 tick)→ 不应有任何列表/poll 请求
reset()
for (let i = 0; i < 60; i++) tick()
await drain()
ok(count('netshell.sessions.list') === 0, '空闲 4.8s 内零次 sessions.list')
ok(count('netshell.poll') === 0, '空闲时零次 poll')

// 再 4 tick(累计跨过 5s)→ 恰好一次低频探测
for (let i = 0; i < 4; i++) tick()
await drain()
ok(count('netshell.sessions.list') === 1, '空闲约每 5s 才探测一次列表(降频生效)')

// 页面隐藏:完全停摆
globalThis.document = { visibilityState: 'hidden', addEventListener() {}, removeEventListener() {} }
reset()
for (let i = 0; i < 200; i++) tick() // 16s
await drain()
ok(count('netshell.sessions.list') === 0 && count('netshell.poll') === 0, '页面隐藏时不产生任何 RPC')
delete globalThis.document

// 有会话:低频探测能发现,并切到「活跃」节奏(列表约 1s 一次,而非空闲 5s)
sessions = [{ id: 's1', serverName: 'dev', status: 'live' }]
reset()
for (let i = 0; i < 70; i++) tick()
await drain()
ok(count('netshell.sessions.list') >= 1, '低频探测能发现 agent 新建的会话')
reset()
for (let i = 0; i < 15; i++) tick() // 1.2s
await drain()
for (let i = 0; i < 15; i++) tick() // 再 1.2s(分块以便在途请求落地)
await drain()
ok(count('netshell.sessions.list') >= 2, '有会话后列表刷新切到约 1s 的活跃节奏(远快于空闲 5s)')


void TICK_MS
console.log(fail ? 'POLL-RPC-FAIL' : 'POLL-RPC-OK')
process.exit(fail ? 1 : 0)
