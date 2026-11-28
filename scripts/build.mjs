#!/usr/bin/env node
/**
 * NetShell 构建脚本:单一来源(src/ 内存动态插件,ES5 函数体风格)生成
 * Loader 静态包的两个半区(lib/):
 *
 *   src/nsh-host.js   →  lib/index.js   宿主半区(真实 Node ESM + harness shim + HTTP RPC 路由)
 *   src/nsh-client.js →  lib/client.js  浏览器半区(window.__ModuleLoader__ 工厂 + builtin shim)
 *
 * 两个动态文件都以 `var …; return { inject, apply }` 的「函数体」形式编写
 * (动态沙箱按函数体求值),因此可以原样内联进一个 IIFE:
 *
 *   - 宿主 IIFE 参数: (harness) —— shim 把 harness.handle 落到 /netshell/rpc 路由,
 *     defineTool/registerTool 落到 @deepseek-ai/dsh-tools + ctx.tools
 *   - 客户端 IIFE 参数: (React, host, styles) —— host.call 落到同一路由的 fetch,
 *     styles.insert 落到 <style> 注入;ctx.timer 由包装层的 ctx 增广提供
 *
 * 源码是唯一事实;lib/ 是生成物(但入库提交,保证 git clone/link 即可安装)。
 * @module build
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const hostSource = readFileSync(join(root, 'src/nsh-host.js'), 'utf8')
const clientSource = readFileSync(join(root, 'src/nsh-client.js'), 'utf8')

const RPC_PATH = '/netshell/rpc'
const PACKAGE_ID = '@xgone/dsh-netshell'

for (const [name, src] of [['src/nsh-host.js', hostSource], ['src/nsh-client.js', clientSource]]) {
  if (src.includes('`')) throw new Error(`${name} 含反引号——动态源码约定为 ES5 字符串拼接,请保持`)
  // 单行长度守卫:2000 是 read 工具的截断线,超长行会让 AI agent 无法整读源码
  // (DYNAMIC.md 曾为此记录过整套分段拼接流程;0.3.0 起源码全文件多行化,此守卫防回归)。
  const longLines = src.split('\n').map((line, i) => [i + 1, line.length]).filter(([, n]) => n >= 2000)
  if (longLines.length > 0) {
    throw new Error(`${name} 存在 ≥2000 字符的行(会被 read 截断): ${longLines.map(([n, len]) => `L${n}(${len})`).join(', ')};请拆分为多行。`)
  }
  try {
    // 源码是函数体(顶层 return 合法),node --check 不适用;new Function 等价校验语法
    new Function(src)
  } catch (error) {
    throw new Error(`${name} 语法错误: ${error.message}`)
  }
}

// ── lib/index.js:宿主半区 ────────────────────────────────────────────────
const hostTemplate = `/**
 * NetShell — DSH 远程终端插件(Loader 静态包 · 宿主半区)
 *
 * 由 scripts/build.mjs 从 src/nsh-host.js 生成,请勿手改;
 * 改 dev/ 源码后运行 \`pnpm build\` 重新生成。
 *
 * 静态模式与动态沙箱的差异全部收敛在本文件的 shim 里:
 *   - harness.handle(method, fn)   → 内存 handler 表 + 一个 POST <RPC 路由> 分发
 *   - harness.defineTool(def)      → @deepseek-ai/dsh-tools 的 defineTool(归一化参数 schema)
 *   - harness.registerTool(ctx, t) → ctx.tools.register(t)
 * 业务逻辑(SSH 会话、Guard、凭据)与动态模式完全同一份源码。
 *
 * DSH profiles use a hoisted node_modules layout. Installing dsh-tools as a
 * plugin dependency can shadow the runtime's compatible copy and disable the
 * required tools service. Resolve it from the DSH host entry first instead.
 */
import { createRequire as createHostRequire } from 'node:module'
import { pathToFileURL as hostFileUrl } from 'node:url'

async function loadHostDshTools() {
  const hostEntry = process.argv[1]
  if (!hostEntry) throw new Error('netshell: cannot resolve @deepseek-ai/dsh-tools without the DSH host entry')
  try {
    const resolved = createHostRequire(hostEntry).resolve('@deepseek-ai/dsh-tools')
    return await import(hostFileUrl(resolved).href)
  } catch (error) {
    throw new Error('netshell: @deepseek-ai/dsh-tools was not found from the DSH host entry; install the plugin in a compatible DSH profile.', { cause: error })
  }
}

const hostDshTools = await loadHostDshTools()
const defineTool = hostDshTools.defineTool

const name = 'netshell'

/** 静态 loader 需要的服务:动态注入的三项 + 工具注册表 + Web 路由表 + 连接认证。 */
const inject = ['subprocess', 'credentials', 'timer', 'tools', 'webServer', 'connection']

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ enabled?: boolean, routePath?: string }} [config]
 */
function apply(ctx, config) {
  if (config && config.enabled === false) return
  const routePath = (config && config.routePath) || '${RPC_PATH}'

  /** @type {Map<string, (args: any) => any>} harness.handle 注册的 RPC 方法表 */
  const handlers = new Map()

  const harness = {
    handle(method, fn) {
      handlers.set(String(method), fn)
      return () => { if (handlers.get(String(method)) === fn) handlers.delete(String(method)) }
    },
    defineTool,
    registerTool: (c, tool) => c.tools.register(tool),
  }

  /** 读整个请求体(上限 2 MB,防呆)。 */
  function readBody(req) {
    return new Promise((resolveBody, rejectBody) => {
      const chunks = []
      let size = 0
      req.on('data', (chunk) => {
        size += chunk.length
        if (size > 2 * 1024 * 1024) { rejectBody(new Error('body too large')); req.destroy(); return }
        chunks.push(chunk)
      })
      req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')))
      req.on('error', rejectBody)
    })
  }

  /** 单一 RPC 端点:POST { method, args } → handler(args) 的 JSON 结果。 */
  const disposeRoute = ctx.webServer.register({
    kind: 'exact',
    path: routePath,
    handler: async (req, res) => {
      const json = (code, value) => {
        res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(value))
      }
      try {
        const admission = ctx.connection.admit({ headers: req.headers })
        if ('rejection' in admission) {
          return json(admission.rejection, { error: admission.rejection === 401 ? 'unauthorized' : 'forbidden' })
        }
        if (req.method !== 'POST') return json(405, { error: 'method not allowed' })
        const parsed = JSON.parse((await readBody(req)) || '{}')
        const handler = handlers.get(String(parsed.method))
        if (handler === undefined) return json(404, { error: 'unknown method: ' + String(parsed.method) })
        return json(200, await handler(parsed.args || {}))
      } catch (error) {
        return json(500, { error: String((error && error.message) || error) })
      }
    },
  })
  ctx.effect(() => disposeRoute, 'netshell: rpc route')
  if (typeof ctx.on === 'function') {
    ctx.on('webserver/index-inject', (table) => {
      table.push({ kind: 'global', name: '__DSH_NETSHELL_RPC_PATH__', value: routePath })
    })
  }

  // 内联动态源码(函数体):var …; return { inject, apply }
  const plugin = (function (harness) {
/*__HOST_SOURCE__*/
  })(harness)

  return plugin.apply(ctx)
}

export { apply, inject, name }
`

// ── lib/client.js:浏览器半区 ─────────────────────────────────────────────
const clientTemplate = `/**
 * NetShell — DSH 远程终端插件(Loader 静态包 · 浏览器半区)
 *
 * 由 scripts/build.mjs 从 src/nsh-client.js 生成,请勿手改;
 * 改 dev/ 源码后运行 \`pnpm build\` 重新生成。
 *
 * 形状与官方 dsh.client 包一致:window.__ModuleLoader__.load({
 * id, factory(require) }) 工厂模块。动态沙箱 builtin 的 shim:
 *   - host.call(method, args) → POST <RPC 路由>(同宿主半区的分发端点)
 *   - styles.insert(css)      → <style> 注入 document.head
 *   - ctx.timer               → setInterval/setTimeout 增广(客户端无 timer 服务)
 */
window.__ModuleLoader__.load({
  id: '${PACKAGE_ID}',
  factory: function (require) {
    var React = require('react')

    var __host = {
      call: function (method, args) {
        var route = (globalThis.__DSH_NETSHELL_RPC_PATH__ || '${RPC_PATH}').replace(/^\\//, '')
        return fetch(route, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ method: method, args: args || {} }),
        }).then(function (res) {
          return res.json().catch(function () { return { error: 'HTTP ' + res.status } }).then(function (body) {
            if (!res.ok) throw new Error(String((body && body.error) || ('HTTP ' + res.status)))
            return body
          })
        })
      },
    }

    var __styles = {
      insert: function (css) {
        var el = document.createElement('style')
        el.setAttribute('data-netshell', '')
        el.setAttribute('data-plugin', '${PACKAGE_ID}')
        el.textContent = css
        document.head.appendChild(el)
        return function () { el.remove() }
      },
    }

    var __timer = {
      interval: function (fn, ms) { var id = setInterval(fn, ms); return function () { clearInterval(id) } },
      timeout: function (fn, ms) { return setTimeout(fn, ms) },
    }

    // 内联动态源码(函数体):var …; return { inject, apply }
    var __plugin = (function (React, host, styles) {
/*__CLIENT_SOURCE__*/
    })(React, __host, __styles)

    return {
      name: 'netshell',
      inject: ['slots', 'locale'],
      apply: function (ctx) {
        // 动态源码读取 ctx.timer(客户端没有该服务)——在原型链上增广,保留 ctx.get 原语义
        var scoped = Object.create(ctx)
        Object.defineProperty(scoped, 'timer', { value: __timer })
        return __plugin.apply(scoped)
      },
    }
  },
})
`

function splice(template, marker, source) {
  const parts = template.split(marker)
  if (parts.length !== 2) throw new Error('模板标记异常: ' + marker)
  return parts[0] + source + parts[1]
}

mkdirSync(join(root, 'lib'), { recursive: true })

// 文案表(`COPY`)键一致性:所有语言的键集合必须与 `en` 完全一致,
// 新增语言时少翻一条就会在这里失败,而不是在界面上显示成原始 key。
// 用一个只认「{ lang: { key: 'string' } }」扁平结构的静态解析器,不 eval 源码:
// 它能跳过注释、发现重复键,也不会把源码当 JS 执行。
function readCopyTable(source) {
  const marker = 'var COPY = {'
  const start = source.indexOf(marker)
  if (start < 0) throw new Error('源文件中找不到 COPY 表')
  let i = source.indexOf('{', start)
  const isIdStart = (c) => /[A-Za-z_$]/.test(c)
  const isId = (c) => /[A-Za-z0-9_$]/.test(c)
  const skipSpace = () => { while (i < source.length && /\s/.test(source[i])) i += 1 }
  const skipComment = () => {
    if (source[i] !== '/') return false
    if (source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i += 1
      return true
    }
    if (source[i + 1] === '*') {
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1
      i += 2
      return true
    }
    return false
  }
  const skipBlank = () => { skipSpace(); while (skipComment()) skipSpace() }
  const readIdent = () => {
    if (!isIdStart(source[i])) {
      throw new Error('COPY 表结构异常(位置 ' + i + '): ' + JSON.stringify(source.slice(i, i + 24)))
    }
    let out = ''
    while (i < source.length && isId(source[i])) { out += source[i]; i += 1 }
    return out
  }
  const readString = () => {
    const quote = source[i]
    i += 1
    let out = ''
    while (i < source.length) {
      const ch = source[i]
      if (ch === '\\') {
        const next = source[i + 1]
        if (next === 'n') out += '\n'
        else if (next === 't') out += '\t'
        else if (next === 'r') out += '\r'
        else if (next === 'u') { out += String.fromCharCode(parseInt(source.slice(i + 2, i + 6), 16)); i += 4 }
        else out += next
        i += 2
        continue
      }
      if (ch === quote) { i += 1; return out }
      out += ch
      i += 1
    }
    throw new Error('COPY 表字符串未闭合')
  }
  const expect = (ch) => {
    skipBlank()
    if (source[i] !== ch) {
      throw new Error('COPY 表期望 ' + JSON.stringify(ch) + '(位置 ' + i + '): ' + JSON.stringify(source.slice(i, i + 24)))
    }
    i += 1
  }

  if (source[i] !== '{') throw new Error('COPY 表缺少起始括号')
  i += 1
  const copy = {}
  const seen = {}
  let lang = null
  while (true) {
    skipBlank()
    if (i >= source.length) throw new Error('COPY 表括号不匹配')
    const ch = source[i]
    if (ch === '}') {
      i += 1
      if (lang === null) return copy
      lang = null
      continue
    }
    if (ch === ',') { i += 1; continue }
    if (lang === null) {
      const name = readIdent()
      if (copy[name]) throw new Error('COPY 表语言重复: ' + name)
      expect(':')
      expect('{')
      copy[name] = {}
      seen[name] = new Set()
      lang = name
      continue
    }
    const key = readIdent()
    if (seen[lang].has(key)) throw new Error('COPY.' + lang + ' 重复键: ' + key)
    seen[lang].add(key)
    expect(':')
    skipBlank()
    if (source[i] !== "'" && source[i] !== '"') {
      throw new Error('COPY.' + lang + '.' + key + ' 的值必须是字符串字面量')
    }
    copy[lang][key] = readString()
  }
}

const copy = readCopyTable(clientSource)
const languages = Object.keys(copy)
if (languages.length < 2) throw new Error('COPY 至少需要 en 与一种其他语言')
const baseline = Object.keys(copy.en || {}).sort()
if (baseline.length === 0) throw new Error('COPY.en 为空')
for (const lang of languages) {
  const table = copy[lang]
  if (!table || typeof table !== 'object' || Array.isArray(table)) throw new Error('COPY.' + lang + ' 不是对象')
  for (const key of baseline) {
    if (typeof table[key] !== 'string' || table[key].length === 0) {
      throw new Error('COPY.' + lang + '.' + key + ' 不是非空字符串')
    }
  }
  const keys = Object.keys(table).sort()
  const missing = baseline.filter((key) => !keys.includes(key))
  const extra = keys.filter((key) => !baseline.includes(key))
  if (missing.length > 0 || extra.length > 0) {
    throw new Error('COPY.' + lang + ' 与 COPY.en 键不一致:缺少 [' + missing.join(', ') + '],多余 [' + extra.join(', ') + ']')
  }
}

writeFileSync(join(root, 'lib/index.js'), splice(hostTemplate, '/*__HOST_SOURCE__*/', hostSource))
writeFileSync(join(root, 'lib/client.js'), splice(clientTemplate, '/*__CLIENT_SOURCE__*/', clientSource))
console.log('build: lib/index.js + lib/client.js 已生成(源: src/nsh-host.js + src/nsh-client.js)')
console.log('build: COPY 语言 ' + languages.join('/') + ' 键一致(' + baseline.length + ' 个键)')
