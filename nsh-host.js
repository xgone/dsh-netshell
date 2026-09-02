var OUT_CAP = 160000, OUT_KEEP = 120000, EV_CAP = 500, HIST_CAP = 100
var COLS = 120, ROWS = 32
var PKEY = 'netshell/profiles'

var BUILTIN_RULES = [
  { pattern: 'rm -rf /*', action: 'deny', note: '递归强删根路径' },
  { pattern: 'rm -fr /*', action: 'deny', note: '递归强删根路径' },
  { pattern: 'rm -rf /', action: 'deny', note: '递归强删根路径' },
  { pattern: 'mkfs*', action: 'deny', note: '格式化文件系统' },
  { pattern: 'dd if=* of=/dev/*', action: 'deny', note: 'dd 直写设备' },
  { pattern: 'dd of=/dev/*', action: 'deny', note: 'dd 直写设备' },
  { pattern: '*>/dev/sd*', action: 'deny', note: '覆写磁盘设备' },
  { pattern: ':(){ :|:& };:', action: 'deny', note: 'fork 炸弹' },
  { pattern: 'chmod -R 777 /*', action: 'deny', note: '根路径全开放权限' },
  { pattern: 'rm -rf *', action: 'ask', note: '递归强删' },
  { pattern: 'rm -fr *', action: 'ask', note: '递归强删' },
  { pattern: 'rm -r *', action: 'ask', note: '递归删除' },
  { pattern: 'shutdown*', action: 'ask', note: '关机' },
  { pattern: 'reboot*', action: 'ask', note: '重启' },
  { pattern: 'halt*', action: 'ask', note: '停机' },
  { pattern: 'poweroff*', action: 'ask', note: '关机' },
  { pattern: 'init 0', action: 'ask', note: '关机' },
  { pattern: 'init 6', action: 'ask', note: '重启' },
  { pattern: 'drop database *', action: 'ask', note: '删除数据库' },
  { pattern: 'drop table *', action: 'ask', note: '删除数据表' },
  { pattern: 'truncate table *', action: 'ask', note: '清空数据表' },
  { pattern: 'git push --force*', action: 'ask', note: '强推覆盖远端' },
  { pattern: 'git push -f*', action: 'ask', note: '强推覆盖远端' },
  { pattern: 'git reset --hard*', action: 'ask', note: '硬重置丢弃改动' },
  { pattern: 'iptables -F*', action: 'ask', note: '清空防火墙规则' },
  { pattern: 'nft flush*', action: 'ask', note: '清空防火墙规则' },
  { pattern: 'crontab -r*', action: 'ask', note: '删除全部定时任务' },
  { pattern: 'docker system prune*', action: 'ask', note: '清理 docker 资源' },
  { pattern: 'docker volume rm*', action: 'ask', note: '删除数据卷' },
  { pattern: 'kubectl delete *', action: 'ask', note: '删除 k8s 资源' },
  { pattern: 'chmod -R 777 *', action: 'ask', note: '递归全开放权限' },
  { pattern: 'apt remove*', action: 'ask', note: '卸载系统包' },
  { pattern: 'apt-get remove*', action: 'ask', note: '卸载系统包' },
  { pattern: 'apt purge*', action: 'ask', note: '卸载系统包' },
  { pattern: 'yum remove*', action: 'ask', note: '卸载系统包' },
  { pattern: 'yum erase*', action: 'ask', note: '卸载系统包' },
  { pattern: 'dd*', action: 'ask', note: '低级磁盘写入' },
  { pattern: 'history -c', action: 'ask', note: '清除 shell 历史' }
]

// 跨 realm 要点:本插件代码运行在 node:vm 沙箱 realm,沙箱里new的对象字面量
// 的 Object.prototype 是沙箱的,credentials-local(宿主 realm)的 assertJsonValue
// 用宿主的 Object.prototype 做全等比较,必然不等。因此所有要写进 GrantRecord
// payload 的对象,必须以宿主 realm 出身的对象为基础改造:
//  · credentials.describe() 返回的 CredentialInfo(宿主 realm)→ delete 字段后当空白对象
//  · readRecord 返回的 rec.payload.servers(宿主 realm YAML 解析)→ 原地改
//  · RPC args 里的 server/rules(宿主 realm JSON 解析)→ 原地改
// 数组走 Array.isArray(跨 realm 安全),原始值无 realm 概念,均不受限。

var globCache = new Map()
function globToRe(p) {
  var re = globCache.get(p)
  if (re) return re
  var src = ''
  for (var i = 0; i < p.length; i++) {
    var ch = p[i]
    if (ch === '*') src += '[\\s\\S]*'
    else if (ch === '?') src += '.'
    else src += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  re = new RegExp('^' + src + '$', 'i')
  globCache.set(p, re)
  return re
}

function variants(cmd) {
  var out = [cmd]
  var cur = cmd
  for (var i = 0; i < 3; i++) {
    var n = cur.replace(/^(sudo|doas|nice|nohup|env)\s+/, '').replace(/\s+$/, '')
    if (n === cur) break
    out.push(n); cur = n
  }
  return out
}

function matchRule(rules, cmd) {
  var vs = variants(cmd)
  for (var i = 0; i < rules.length; i++) {
    var r = rules[i]
    if (!r || !r.pattern) continue
    var re = globToRe(r.pattern)
    for (var j = 0; j < vs.length; j++) {
      if (re.test(vs[j])) return r
    }
  }
  return null
}

function evaluateFor(server, cmd) {
  var custom = (server && Array.isArray(server.rules)) ? server.rules : []
  var deny = matchRule(custom.filter(function (r) { return r.action === 'deny' }), cmd)
  if (deny) return { action: 'deny', rule: deny }
  var hit = matchRule(custom.filter(function (r) { return r.action !== 'deny' }), cmd)
  if (hit) return { action: hit.action, rule: hit }
  var bdeny = matchRule(BUILTIN_RULES.filter(function (r) { return r.action === 'deny' }), cmd)
  if (bdeny) return { action: 'deny', rule: bdeny }
  var bhit = matchRule(BUILTIN_RULES.filter(function (r) { return r.action === 'ask' }), cmd)
  if (bhit) return { action: 'ask', rule: bhit }
  var level = server && server.level ? server.level : 'guarded'
  if (level === 'locked') return { action: 'ask', rule: { pattern: '*', note: 'locked 模式:白名单外一律确认' } }
  return { action: 'allow', rule: null }
}

function refFor(id) {
  return 'NETSHELL_PW_' + String(id).replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

var nsToken = Math.random().toString(36).slice(2, 8)

return {
  inject: ['subprocess', 'credentials', 'timer'],
  apply: function (ctx) {
    var subprocess = ctx.subprocess
    var credentials = ctx.credentials
    var timer = ctx.timer
    var NL = String.fromCharCode(10)
    var sessions = new Map()
    var nonce = 0

    // 宿主 realm 空白对象工厂:describe 返回的 CredentialInfo 是宿主 realm
    // 出身,delete 掉字段后就是干净的宿主 plain object。
    function hostBlank(ref) {
      return credentials.describe(ref).then(function (info) {
        try { delete info.configured } catch (e) {}
        try { delete info.source } catch (e) {}
        try { delete info.writable } catch (e) {}
        return info
      })
    }

    function pushEvent(s, ev) {
      s.evSeq += 1
      ev.seq = s.evSeq
      ev.at = Date.now()
      s.events.push(ev)
      if (s.events.length > EV_CAP) s.events.splice(0, 100)
    }

    function onOutput(s, chunk) {
      s.outAll += chunk
      if (s.outAll.length > OUT_CAP) {
        var cut = s.outAll.length - OUT_KEEP
        s.outAll = s.outAll.slice(cut)
        s.outBase += cut
        s.dropped += cut
      }
      s.tail = (s.tail + chunk).slice(-60)
      if (/permission denied/i.test(chunk)) s.hint = '认证失败:密码错误或被服务器拒绝'
      else if (/connection refused/i.test(chunk)) s.hint = '连接被拒绝:目标端口未开放'
      else if (/connection timed out|operation timed out/i.test(chunk)) s.hint = '连接超时'
      else if (/could not resolve hostname/i.test(chunk)) s.hint = '主机名无法解析'
      if (s.status === 'connecting') s.status = 'live'
      if (/password\s*:\s*$/i.test(s.tail) || /password for .*:/i.test(s.tail)) s.atPwPrompt = true
    }

    function onExit(s, outcome) {
      if (s.status === 'closed') return
      s.status = 'closed'
      s.pending = null
      s.closedReason = s.hint || ('远程会话结束 (exit=' + (outcome && outcome.exitCode != null ? outcome.exitCode : 'signal') + ')')
      pushEvent(s, { type: 'closed', reason: s.closedReason })
      if (s.askpassPath) {
        try {
          subprocess.spawn({
            argv: ['/bin/sh', '-c', 'rm -f -- "$1"', 'sh', s.askpassPath],
            cwd: '/tmp',
            stdio: { stdin: 'ignore', stdout: { maxBytes: 1024 }, stderr: { maxBytes: 1024 } },
            graceMs: 3000
          })
        } catch (e) {}
      }
    }

    function write(s, data) {
      try { void s.handle.write(data) } catch (e) {}
    }

    function submitEnter(s) {
      if (s.pending) return
      var cmd = s.line.replace(/^\s+|\s+$/g, '')
      s.line = ''
      if (s.atPwPrompt || cmd === '') {
        s.atPwPrompt = false
        write(s, '\r')
        return
      }
      var v = evaluateFor(s.server, cmd)
      if (v.action === 'allow') {
        write(s, '\r')
        s.hist.push(cmd)
        if (s.hist.length > HIST_CAP) s.hist.shift()
        pushEvent(s, { type: 'exec', command: cmd })
      } else if (v.action === 'deny') {
        write(s, '\u0015')
        pushEvent(s, { type: 'deny', command: cmd, rule: v.rule.note || v.rule.pattern })
      } else {
        nonce += 1
        s.pending = { id: 'pd' + nonce, command: cmd, rule: v.rule && (v.rule.note || v.rule.pattern) }
        pushEvent(s, { type: 'ask', command: cmd, rule: v.rule && (v.rule.note || v.rule.pattern) })
      }
    }

    function recallSet(s, text) {
      write(s, '\u0015')
      s.line = text
      if (text) write(s, text)
    }

    function recallHistory(s, dir) {
      if (s.hist.length === 0) return
      if (dir === 'up') {
        if (s.histIdx === undefined) s.histIdx = s.hist.length - 1
        else if (s.histIdx > 0) s.histIdx -= 1
        else return
      } else {
        if (s.histIdx === undefined) return
        if (s.histIdx < s.hist.length - 1) s.histIdx += 1
        else { s.histIdx = undefined; recallSet(s, ''); return }
      }
      recallSet(s, s.hist[s.histIdx])
    }

    function onInput(s, data) {
      if (s.status === 'closed') return
      if (s.pending) return
      if (data === '\r') { submitEnter(s); return }
      if (data === '\u007f') { s.line = s.line.slice(0, -1); write(s, data); return }
      if (data === '\u0015' || data === '\u0003' || data === '\u000c') { s.line = ''; write(s, data); return }
      if (data === '\u001b[A') { recallHistory(s, 'up'); return }
      if (data === '\u001b[B') { recallHistory(s, 'down'); return }
      if (data.indexOf('\u001b[') === 0) { write(s, data); return }
      if (data === '\t') { write(s, data); return }
      s.line += data
      write(s, data)
    }

    function decide(s, pendingId, action) {
      if (!s.pending || s.pending.id !== pendingId) return Promise.reject(new Error('没有匹配的待确认请求'))
      var cmd = s.pending.command
      s.pending = null
      var canWrite = !!s.handle
      var hasHist = Array.isArray(s.hist)
      if (action === 'deny') {
        if (canWrite) write(s, '\u0015')
        pushEvent(s, { type: 'deny', command: cmd, rule: '用户拒绝' })
        return Promise.resolve({ ok: true })
      }
      if (action === 'always') {
        return credentials.modifyRecord(PKEY, function (cur) {
          if (!cur || cur.kind !== 'grant' || !cur.payload || !Array.isArray(cur.payload.servers)) return cur
          var arr = cur.payload.servers
          for (var i = 0; i < arr.length; i++) {
            if (arr[i] && arr[i].id === s.server.id) {
              var rules = Array.isArray(arr[i].rules) ? arr[i].rules : []
              var exists = false
              for (var j = 0; j < rules.length; j++) if (rules[j] && rules[j].pattern === cmd) { exists = true; break }
              if (exists) { arr[i].rules = rules; return cur }
              return hostBlank(refFor(s.server.id)).then(function (rule) {
                rule.pattern = cmd
                rule.action = 'allow'
                rule.note = '用户永久放行'
                rules.push(rule)
                arr[i].rules = rules
                return cur
              })
            }
          }
          return cur
        }).then(function () {
          if (canWrite) write(s, '\r')
          if (hasHist) s.hist.push(cmd)
          pushEvent(s, { type: 'ask-allow', command: cmd })
          return { ok: true }
        })
      }
      if (canWrite) write(s, '\r')
      if (hasHist) s.hist.push(cmd)
      pushEvent(s, { type: 'ask-allow', command: cmd })
      return Promise.resolve({ ok: true })
    }

function makeAskpass(s) {
      nonce += 1
      var dest = '/tmp/.netshell-askpass-' + nsToken + '-' + nonce + '.sh'
      var NL = String.fromCharCode(10)
      var BACK = String.fromCharCode(92)
      var script = '#!/bin/sh' + NL + 'printf "%s' + BACK + 'n" "$NETSHELL_PW"' + NL
      var cmd = 'umask 077 && printf %s "$NS_SCRIPT" > "$1" && chmod 700 "$1"'
      return subprocess.spawn({
        argv: ['/bin/sh', '-c', cmd, 'sh', dest],
        cwd: '/tmp',
        env: { NS_SCRIPT: script },
        stdio: { stdin: 'ignore', stdout: { maxBytes: 2048 }, stderr: { maxBytes: 2048 } },
        graceMs: 5000
      }).done.then(function (out) {
        if (out.exitCode !== 0) throw new Error('创建 askpass 辅助脚本失败 (exit=' + out.exitCode + ')')
        s.askpassPath = dest
        return dest
      })
    }

    function sanitize(server, info) {
      var out = {}
      for (var k in server) out[k] = server[k]
      out.hasPassword = !!(info && info.configured)
      return out
    }

    harness.handle('netshell.profiles.list', function () {
      return credentials.readRecord(PKEY).then(function (rec) {
        var payload = rec && rec.kind === 'grant' ? rec.payload : null
        var servers = payload && Array.isArray(payload.servers) ? payload.servers : []
        var jobs = servers.map(function (sv) {
          return credentials.describe(refFor(sv.id)).then(function (info) { return sanitize(sv, info) }).catch(function () { return sanitize(sv, null) })
        })
        return Promise.all(jobs).then(function (list) { return { servers: list } })
      })
    })

    harness.handle('netshell.profiles.save', function (args) {
      var sv = args && args.server
      if (!sv || !sv.name || !sv.host || !sv.user) return Promise.reject(new Error('名称、主机、用户名为必填项'))
      var port = parseInt(String(sv.port || '22'), 10)
      if (!(port >= 1 && port <= 65535)) return Promise.reject(new Error('端口必须是 1-65535 的整数'))
      return credentials.readRecord(PKEY).then(function (rec) {
        var old = rec && rec.kind === 'grant' && rec.payload && Array.isArray(rec.payload.servers) ? rec.payload.servers : null
        var target = null
        if (old) {
          for (var i = 0; i < old.length; i++) if (old[i] && old[i].id === sv.id) target = old[i]
        }
        var isNew = target === null
        var jobs = []
        if (isNew) {
          jobs.push(hostBlank(refFor('srvnew' + (++nonce))).then(function (blank) {
            target = blank
            if (old) old.push(target)
          }))
        }
        return Promise.all(jobs).then(function () {
          target.id = target.id || ('srv' + Math.random().toString(36).slice(2, 10))
          if (!target.createdAt) target.createdAt = Date.now()
          target.name = String(sv.name)
          target.host = String(sv.host)
          target.port = port
          target.user = String(sv.user)
          target.auth = sv.auth === 'key' || sv.auth === 'agent' ? sv.auth : 'password'
          if (target.auth === 'key') target.keyPath = String(sv.keyPath || '')
          else { try { delete target.keyPath } catch (e) {} }
          target.level = sv.level === 'open' || sv.level === 'locked' ? sv.level : 'guarded'
          target.rules = Array.isArray(sv.rules) ? sv.rules.filter(function (r) { return r && r.pattern }) : []
          try { delete target.hasPassword } catch (e) {}
          var servers = old ? old : [target]
          var pwJobs = []
          if (target.auth === 'password') {
            if (typeof args.password === 'string' && args.password.length > 0) pwJobs.push(credentials.set(refFor(target.id), args.password))
            else if (args.clearPassword) pwJobs.push(credentials.unset(refFor(target.id)))
          }
          return Promise.all(pwJobs).then(function () {
            return credentials.describe(refFor(target.id)).then(function (info) {
              var hasPassword = !!(info && info.configured)
              try { delete info.configured } catch (e) {}
              try { delete info.source } catch (e) {}
              try { delete info.writable } catch (e) {}
              info.version = 1
              info.servers = servers
              var next = { kind: 'grant', payload: info }
              return credentials.modifyRecord(PKEY, function () { return next }).then(function () {
                var out = {}
                for (var k in target) out[k] = target[k]
                out.hasPassword = hasPassword
                return { server: out }
              })
            })
          })
        })
      })
    })

    harness.handle('netshell.profiles.delete', function (args) {
      var id = args && args.id
      if (!id) return Promise.reject(new Error('缺少 id'))
      sessions.forEach(function (s) {
        if (s.server && s.server.id === id && s.status !== 'closed') {
          try { void s.handle.terminate() } catch (e) {}
        }
      })
      return credentials.readRecord(PKEY).then(function (rec) {
        if (!rec || rec.kind !== 'grant' || !rec.payload || !Array.isArray(rec.payload.servers)) return { ok: true }
        rec.payload.servers = rec.payload.servers.filter(function (x) { return x && x.id !== id })
        return credentials.modifyRecord(PKEY, function () { return rec }).then(function () {
          return credentials.unset(refFor(id)).catch(function () {})
        }).then(function () { return { ok: true } })
      })
    })

        // ---- 服务器 / 会话 辅助 ----
    function resolveServer(serverId) {
      return credentials.readRecord(PKEY).then(function (rec) {
        var payload = rec && rec.kind === 'grant' ? rec.payload : null
        var servers = payload && Array.isArray(payload.servers) ? payload.servers : []
        for (var i = 0; i < servers.length; i++) if (servers[i] && servers[i].id === serverId) return servers[i]
        return null
      })
    }

    function findLiveSession(serverId) {
      var found = null
      sessions.forEach(function (s) {
        if (!found && s.server && s.server.id === serverId && s.status === 'live') found = s
      })
      return found
    }

    function makeVirtualSession(server) {
      var s = {
        id: 'ns' + Date.now().toString(36) + (++nonce),
        server: server, status: 'live', outAll: '', outBase: 0, dropped: 0,
        events: [], evSeq: 0, line: '', hist: [], histIdx: undefined,
        pending: null, tail: '', atPwPrompt: false, hint: null, closedReason: null, askpassPath: null
      }
      sessions.set(s.id, s)
      return s
    }

    function spawnSession(server) {
      return subprocess.resolveExecutable('ssh').then(function (sshPath) {
        var s = {
          id: 'ns' + Date.now().toString(36) + (++nonce),
          server: server, status: 'connecting', outAll: '', outBase: 0, dropped: 0,
          events: [], evSeq: 0, line: '', hist: [], histIdx: undefined,
          pending: null, tail: '', atPwPrompt: false, hint: null, closedReason: null, askpassPath: null
        }
        var envJob = Promise.resolve(null)
        if (server.auth === 'password') {
          envJob = credentials.resolve(refFor(server.id)).then(function (rc) {
            if (!rc || !rc.value) return Promise.reject(new Error('该服务器未设置密码,请先在设置中保存密码'))
            return rc.value
          })
        }
        return envJob.then(function (pw) {
          var askpassJob = server.auth === 'password' ? makeAskpass(s) : Promise.resolve(null)
          return askpassJob.then(function () {
            var argv = [sshPath, '-tt',
              '-o', 'StrictHostKeyChecking=accept-new',
              '-o', 'NumberOfPasswordPrompts=1',
              '-o', 'ServerAliveInterval=15',
              '-o', 'ConnectTimeout=12']
            if (server.auth === 'agent') argv.push('-o', 'BatchMode=yes')
            if (server.auth === 'key') {
              if (!server.keyPath) return Promise.reject(new Error('私钥认证需要填写私钥路径'))
              argv.push('-i', server.keyPath, '-o', 'IdentitiesOnly=yes')
            }
            argv.push('-p', String(server.port || 22), server.user + '@' + server.host)
            var env = { TERM: 'xterm-256color', DISPLAY: 'netshell:0' }
            if (server.auth === 'password') {
              env.SSH_ASKPASS = s.askpassPath
              env.SSH_ASKPASS_REQUIRE = 'force'
              env.NETSHELL_PW = pw
            }
            return subprocess.spawnTerminal({
              argv: argv, cwd: '/tmp', env: env, rows: ROWS, cols: COLS, graceMs: 3000
            }).then(function (handle) {
              s.handle = handle
              sessions.set(s.id, s)
              var consume = function () {
                return handle.output[Symbol.asyncIterator]().next().then(function (r) {
                  if (!r.done) { onOutput(s, r.value); return consume() }
                })
              }
              void consume().catch(function () {})
              handle.done.then(function (out) { onExit(s, out) }).catch(function () { onExit(s, { exitCode: null, signal: null }) })
              return s
            })
          })
        })
      })
    }

    function ensureSession(server) {
      var existing = findLiveSession(server.id)
      if (existing) return Promise.resolve(existing)
      return spawnSession(server)
    }

    function waitLive(s, timeoutMs, signal) {
      var deadline = Date.now() + (timeoutMs || 20000)
      return new Promise(function (resolve) {
        function tick() {
          if (signal && signal.aborted) return resolve(false)
          if (s.status === 'live') return resolve(true)
          if (s.status === 'closed') return resolve(false)
          if (Date.now() >= deadline) return resolve(s.status === 'live')
          timer.timeout(120).then(tick, function () { resolve(false) })
        }
        tick()
      })
    }

    function waitPendingGone(s, pid, deadline, signal) {
      return new Promise(function (resolve) {
        function tick() {
          if (signal && signal.aborted) return resolve({ outcome: 'aborted' })
          if (s.pending === null || (s.pending && s.pending.id !== pid)) return resolve({ outcome: 'decided' })
          if (Date.now() >= deadline) return resolve({ outcome: 'timeout' })
          timer.timeout(150).then(tick, function () { resolve({ outcome: 'aborted' }) })
        }
        tick()
      })
    }

    function cancelPending(s, cmd) {
      if (s.pending) {
        var rule = s.pending.rule || ''
        if (s.handle) write(s, '\u0015')
        s.pending = null
        pushEvent(s, { type: 'deny', command: cmd, rule: rule || '超时或已取消' })
      }
    }

    function collectOutput(s, fromAbs, opts) {
      var capMs = opts && opts.timeoutMs ? opts.timeoutMs : 30000
      var minMs = opts && opts.minMs ? opts.minMs : 900
      var deadline = Date.now() + capMs
      var started = Date.now()
      var lastLen = s.outAll.length
      var lastAt = Date.now()
      return new Promise(function (resolve) {
        function step() {
          var off = fromAbs - s.outBase
          var tail = off >= 0 ? s.outAll.slice(off) : s.outAll
          var settled = (Date.now() - lastAt) >= 400 && (Date.now() - started) >= minMs
          var atPrompt = /\[[^\]]*\]\s*[#$]\s*$/.test(tail) || /(^|[\n\r])\s*[#$]\s*$/.test(tail)
          if (atPrompt && (Date.now() - started) >= minMs) return resolve()
          if ((settled || Date.now() >= deadline) && (Date.now() - started) >= minMs) return resolve()
          var curLen = s.outAll.length
          if (curLen !== lastLen) { lastLen = curLen; lastAt = Date.now() }
          timer.timeout(100).then(step, function () { resolve() })
        }
        step()
      }).then(function () {
        var start = fromAbs - s.outBase
        if (start < 0) start = 0
        return s.outAll.slice(start)
      })
    }

    function runOnSession(s, cmd, timeoutMs, signal) {
      var v = evaluateFor(s.server, cmd)
      var fromAbs = s.outBase + s.outAll.length
      var ruleNote = v.rule && (v.rule.note || v.rule.pattern)
      if (v.action === 'deny') {
        pushEvent(s, { type: 'deny', command: cmd, rule: ruleNote || '内置规则' })
        return Promise.resolve({ ok: false, blocked: true, action: 'deny', rule: ruleNote || '内置规则', output: '', command: cmd })
      }
      if (v.action === 'ask') {
        write(s, '\u0015')
        write(s, cmd)
        nonce += 1
        var pid = 'pd' + nonce
        s.pending = { id: pid, command: cmd, rule: ruleNote || 'locked 模式白名单外' }
        pushEvent(s, { type: 'ask', command: cmd, rule: ruleNote || 'locked 模式白名单外' })
        return waitPendingGone(s, pid, Date.now() + 300000, signal).then(function (res) {
          if (res.outcome === 'aborted') { cancelPending(s, cmd); return { ok: false, blocked: true, action: 'aborted', output: '', command: cmd } }
          if (res.outcome === 'timeout') { cancelPending(s, cmd); return { ok: false, blocked: true, action: 'timeout', output: '', command: cmd } }
          var lastEv = s.events[s.events.length - 1]
          var allowed = lastEv && (lastEv.type === 'ask-allow' || lastEv.type === 'exec')
          if (!allowed) return { ok: false, blocked: true, action: 'deny', rule: '用户拒绝', output: '', command: cmd }
          return collectOutput(s, fromAbs, { timeoutMs: timeoutMs }).then(function (output) {
            return { ok: true, action: 'allow', output: output, command: cmd, blocked: false }
          })
        })
      }
      write(s, '\u0015')
      write(s, cmd)
      write(s, '\r')
      s.hist.push(cmd)
      if (s.hist.length > HIST_CAP) s.hist.shift()
      pushEvent(s, { type: 'exec', command: cmd })
      return collectOutput(s, fromAbs, { timeoutMs: timeoutMs }).then(function (output) {
        return { ok: true, action: 'allow', output: output, command: cmd, blocked: false }
      })
    }

    function waitShellReady(s, timeoutMs, signal) {
      var deadline = Date.now() + (timeoutMs || 15000)
      return new Promise(function (resolve) {
        function tick() {
          if (signal && signal.aborted) return resolve(false)
          var tail = s.outAll.slice(-80)
          if (/\[[^\]]*\]\s*[#$]\s*$/.test(tail) || /(^|[\n\r])\s*[#$]\s*$/.test(tail)) return resolve(true)
          if (s.status === 'closed') return resolve(false)
          if (Date.now() >= deadline) return resolve(false)
          timer.timeout(100).then(tick, function () { resolve(false) })
        }
        tick()
      })
    }

    function runRemote(server, cmd, timeoutMs, signal) {
      return subprocess.resolveExecutable('ssh').then(function (sshPath) {
        var argv = [sshPath, '-T',
          '-o', 'StrictHostKeyChecking=accept-new',
          '-o', 'NumberOfPasswordPrompts=1',
          '-o', 'ConnectTimeout=12']
        if (server.auth === 'key') {
          if (!server.keyPath) return Promise.reject(new Error('私钥认证需要填写私钥路径'))
          argv.push('-i', server.keyPath, '-o', 'IdentitiesOnly=yes')
        }
        argv.push('-p', String(server.port || 22), server.user + '@' + server.host, cmd)
        var handle = subprocess.spawn({
          argv: argv,
          cwd: '/tmp',
          stdio: { stdin: 'ignore', stdout: { maxBytes: 200000, spill: { maxBytes: 400000 } }, stderr: { maxBytes: 200000 } },
          graceMs: 3000,
          signal: signal
        })
        return handle.done.then(function (out) {
          var stdout = handle.collected && handle.collected.stdout ? handle.collected.stdout.readFrom(0).text : ''
          var stderr = handle.collected && handle.collected.stderr ? handle.collected.stderr.readFrom(0).text : ''
          return { code: out.exitCode, stdout: stdout, stderr: stderr }
        })
      })
    }

    function toolRunExecute(args, exec) {
      var serverId = args && args.server
      var cmd = args && args.command
      var timeoutMs = args && typeof args.timeoutMs === 'number' ? args.timeoutMs : 30000
      if (!serverId) return Promise.reject(new Error('缺少 server 参数'))
      if (!cmd || typeof cmd !== 'string') return Promise.reject(new Error('缺少 command 参数'))
      return resolveServer(serverId).then(function (server) {
        if (!server) return Promise.reject(new Error('找不到服务器档案: ' + serverId))
        return ensureSession(server).then(function (disp) {
          return waitLive(disp, 20000, exec && exec.signal).then(function (ready) {
            if (!ready) return { ok: false, blocked: false, error: '会话未就绪或已断开:' + (disp.closedReason || disp.hint || 'unknown'), output: '' }
            var v = evaluateFor(server, cmd)
            var ruleNote = v.rule && (v.rule.note || v.rule.pattern)
            function appendOut(r, addCmd) {
              var text = r.stdout + (r.stderr ? (r.stdout ? NL : '') + r.stderr : '')
              disp.outAll += (addCmd ? '$ ' + cmd + NL : '') + (text || '') + NL
              pushEvent(disp, { type: 'exec', command: cmd })
              return { ok: true, action: 'allow', output: r.stdout, error: r.stderr, exitCode: r.code, command: cmd, blocked: false }
            }
            if (v.action === 'deny') {
              disp.outAll += '$ ' + cmd + NL + '[拦截] ' + (ruleNote || '内置规则') + NL
              pushEvent(disp, { type: 'deny', command: cmd, rule: ruleNote || '内置规则' })
              return Promise.resolve({ ok: false, blocked: true, action: 'deny', rule: ruleNote || '内置规则', output: '', command: cmd })
            }
            if (v.action === 'ask') {
              nonce += 1
              var pid = 'pd' + nonce
              var askRule = ruleNote || 'locked 模式白名单外'
              disp.outAll += '$ ' + cmd + NL
              disp.pending = { id: pid, command: cmd, rule: askRule }
              pushEvent(disp, { type: 'ask', command: cmd, rule: askRule })
              return waitPendingGone(disp, pid, Date.now() + 600000, exec && exec.signal).then(function (res) {
                if (res.outcome !== 'decided') { cancelPending(disp, cmd); disp.outAll += '[已取消]' + NL; return { ok: false, blocked: true, action: res.outcome, rule: askRule, output: '', command: cmd } }
                var lastEv = disp.events[disp.events.length - 1]
                var allowed = lastEv && (lastEv.type === 'ask-allow' || lastEv.type === 'exec')
                if (!allowed) { disp.outAll += '[已拒绝]' + NL; return { ok: false, blocked: true, action: 'deny', rule: '用户拒绝', output: '', command: cmd } }
                return runRemote(server, cmd, timeoutMs, exec && exec.signal).then(function (r) { return appendOut(r, false) })
              })
            }
            return runRemote(server, cmd, timeoutMs, exec && exec.signal).then(function (r) { return appendOut(r, true) })
          })
        })
      })
    }

    harness.handle('netshell.connect', function (args) {
      var serverId = args && args.serverId
      return resolveServer(serverId).then(function (server) {
        if (!server) return Promise.reject(new Error('找不到服务器档案: ' + serverId))
        return spawnSession(server).then(function (s) { return { id: s.id, pid: s.handle.pid } })
      })
    })

    harness.handle('netshell.sessions.list', function () {
      var list = []
      sessions.forEach(function (s) {
        list.push({ id: s.id, serverName: s.server ? s.server.name : 'unknown', status: s.status, pending: s.pending ? s.pending.id : null })
      })
      return Promise.resolve({ sessions: list })
    })

harness.handle('netshell.input', function (args) {
      var s = sessions.get(args && args.id)
      if (!s) return Promise.reject(new Error('会话不存在'))
      if (typeof args.data === 'string' && args.data.length > 0 && args.data.length <= 4096) onInput(s, args.data)
      return Promise.resolve({ ok: true })
    })

    harness.handle('netshell.poll', function (args) {
      var s = sessions.get(args && args.id)
      if (!s) return Promise.reject(new Error('会话不存在'))
      var output = s.outAll
      var events = s.events.slice(-300)
      return Promise.resolve({
        status: s.status, output: output, lossy: false, dropped: s.dropped,
        nextCursor: 0,
        events: events, pending: s.pending, hint: s.hint,
        closedReason: s.closedReason, atPwPrompt: s.atPwPrompt, cols: COLS, rows: ROWS
      })
    })

    harness.handle('netshell.decide', function (args) {
      var s = sessions.get(args && args.id)
      if (!s) return Promise.reject(new Error('会话不存在'))
      return decide(s, args.pendingId, args.action)
    })

    harness.handle('netshell.disconnect', function (args) {
      var s = sessions.get(args && args.id)
      if (!s) return Promise.resolve({ ok: true })
      if (s.handle) { try { void s.handle.terminate() } catch (e) {} }
      return Promise.resolve({ ok: true })
    })

    
    // ---- 动态模型工具 ----
    var serversTool = harness.defineTool({
      name: 'netshell_servers',
      description: '列出 NetShell 远程终端中保存的所有服务器档案,返回每个服务器的 id、名称、主机、端口、用户名和权限等级。用 netshell_servers 得到 id,再传给 netshell_run。',
      parameters: {},
      output: {
        schema: { type: 'json' },
        render: function (args, value) {
          var text = value === undefined || value === null ? '' : JSON.stringify(value, null, 2)
          return [{ type: 'text', text: text }]
        }
      },
      execute: function (args) {
        return credentials.readRecord(PKEY).then(function (rec) {
          var payload = rec && rec.kind === 'grant' ? rec.payload : null
          var servers = payload && Array.isArray(payload.servers) ? payload.servers : []
          var list = servers.map(function (sv) {
            return { id: sv.id, name: sv.name, host: sv.host, port: sv.port, user: sv.user, auth: sv.auth, level: sv.level }
          })
          return { servers: list }
        })
      }
    })

    var runTool = harness.defineTool({
      name: 'netshell_run',
      description: '在指定的远程服务器(NetShell 终端)上执行一条 shell 命令并返回输出。命令通过真实 SSH 终端执行,支持权限控制:命中 deny 规则(如 rm -rf /)直接拦截;命中 ask 规则(如 rm -rf *)先在终端面板弹出确认,你点击「执行一次」后才会真正执行。用 netshell_servers 查询服务器 id 作为 server 参数。',
      parameters: {
        server: { type: 'string', description: '服务器 id,来自 netshell_servers 返回的 id 字段', required: true },
        command: { type: 'string', description: '要在服务器上执行的 shell 命令', required: true },
        timeoutMs: { type: 'integer', description: '等待命令输出结束的超时毫秒,默认 30000' }
      },
      output: {
        schema: { type: 'json' },
        render: function (args, value) {
          var text = value === undefined || value === null ? '' : JSON.stringify(value, null, 2)
          return [{ type: 'text', text: text }]
        }
      },
      execute: function (args, exec) {
        return toolRunExecute(args, exec)
      }
    })


    ctx.effect(function () {
      var d1 = harness.registerTool(ctx, serversTool)
      var d2 = harness.registerTool(ctx, runTool)
      return function () { try { d1() } catch (e) {} try { d2() } catch (e) {} }
    })

ctx.effect(function () {
      return function () {
        sessions.forEach(function (s) {
          if (s.handle) { try { void s.handle.terminate() } catch (e) {} }
        })
      }
    })
  }
}