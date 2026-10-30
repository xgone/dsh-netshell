#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'src/nsh-client.js'), 'utf8')
const start = source.indexOf('function setServerConnecting(serverId, connecting, patch)')
const end = source.indexOf('\nfunction doLocalConnect()', start)
if (start < 0 || end <= start) throw new Error('connection UI source boundary not found')

let fail = 0
const ok = (condition, label) => {
  if (condition) console.log('ok', label)
  else { fail++; console.log('FAIL', label) }
}
const store = {
  st: { activeId: null, connectError: 'stale', connectingServers: {} },
  set(patch) { this.st = { ...this.st, ...patch } },
}
const requests = []
const deferredByServer = new Map()
const host = {
  call(method, args) {
    let resolve
    let reject
    const promise = new Promise((res, rej) => { resolve = res; reject = rej })
    const pending = { method, args, resolve, reject, promise }
    requests.push(pending)
    deferredByServer.set(args.serverId, pending)
    return promise
  },
}
const screens = new Map()
const sessionOrder = []
const polls = []
const h = (type, props, ...children) => ({ type, props, children })
const text = (key) => ({ connecting: 'Connecting…' })[key] || key
const context = new Function('store', 'host', 'screens', 'sessOrder', 'newScreen', 'pollOne', 'h', 'text',
  source.slice(start, end) + '\nreturn { doConnect, connectionLoading };')(
  store,
  host,
  screens,
  sessionOrder,
  (serverName) => ({ serverName, status: 'connecting' }),
  (id) => { polls.push(id); return Promise.resolve() },
  h,
  text,
)

const serverA = { id: 'srv-a', name: 'alpha' }
const serverB = { id: 'srv-b', name: 'beta' }
const first = context.doConnect(serverA)
ok(store.st.connectingServers['srv-a'] === true && store.st.connectError === null, 'server row enters loading state immediately')
await context.doConnect(serverA)
ok(requests.length === 1, 'repeated click does not start a duplicate connection')
const second = context.doConnect(serverB)
ok(store.st.connectingServers['srv-a'] && store.st.connectingServers['srv-b'], 'different servers can connect concurrently')

deferredByServer.get('srv-a').resolve({ id: 'session-a' })
await first
ok(store.st.connectingServers['srv-a'] === undefined && store.st.connectingServers['srv-b'] === true, 'successful connection clears only its own loading state')
ok(store.st.activeId === 'session-a' && screens.has('session-a') && polls.includes('session-a'), 'successful connection opens and polls its session')

deferredByServer.get('srv-b').reject(new Error('connection refused'))
await second
ok(store.st.connectingServers['srv-b'] === undefined && store.st.connectError === 'connection refused', 'failed connection clears loading and reports the error')

const indicator = context.connectionLoading()
ok(indicator.props.className === 'nsh-connecting' && indicator.children[0].props.className === 'nsh-spinner' && indicator.children[1] === 'Connecting…', 'connection indicator includes spinner and status text')
ok(source.includes("s.status === 'connecting' ? connectionLoading()") && source.includes('disabled: connecting'), 'server and session rows show/guard pending connections')

console.log(fail === 0 ? 'CONNECT-FLOW-OK' : `CONNECT-FLOW-FAILED (${fail} failures)`)
if (fail > 0) process.exitCode = 1
