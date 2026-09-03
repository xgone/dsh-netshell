#!/usr/bin/env node
/**
 * NetShell 构建脚本:单一来源(dev/ 内存动态插件,ES5 函数体风格)生成
 * Loader 静态包的两个半区(lib/):
 *
 *   dev/nsh-host.js   →  lib/index.js   宿主半区(真实 Node ESM + harness shim + HTTP RPC 路由)
 *   dev/nsh-client.js →  lib/client.js  浏览器半区(window.__ModuleLoader__ 工厂 + builtin shim)
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
const hostSource = readFileSync(join(root, 'dev/nsh-host.js'), 'utf8')
const clientSource = readFileSync(join(root, 'dev/nsh-client.js'), 'utf8')

const RPC_PATH = '/netshell/rpc'
const PACKAGE_ID = '@xgone/dsh-netshell'

for (const [name, src] of [['dev/nsh-host.js', hostSource], ['dev/nsh-client.js', clientSource]]) {
  if (src.includes('`')) throw new Error(`${name} 含反引号——动态源码约定为 ES5 字符串拼接,请保持`)
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
 * 由 scripts/build.mjs 从 dev/nsh-host.js 生成,请勿手改;
 * 改 dev/ 源码后运行 \`pnpm build\` 重新生成。
 *
 * 静态模式与动态沙箱的差异全部收敛在本文件的 shim 里:
 *   - harness.handle(method, fn)   → 内存 handler 表 + 一个 POST <RPC 路由> 分发
 *   - harness.defineTool(def)      → @deepseek-ai/dsh-tools 的 defineTool(归一化参数 schema)
 *   - harness.registerTool(ctx, t) → ctx.tools.register(t)
 * 业务逻辑(SSH 会话、Guard、凭据)与动态模式完全同一份源码。
 */
import { defineTool } from '@deepseek-ai/dsh-tools'

const name = 'netshell'

/** 静态 loader 需要的服务:动态注入的三项 + 工具注册表 + Web 路由表。 */
const inject = ['subprocess', 'credentials', 'timer', 'tools', 'webServer']

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
 * 由 scripts/build.mjs 从 dev/nsh-client.js 生成,请勿手改;
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
        return fetch('${RPC_PATH}', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ method: method, args: args || {} }),
        }).then(function (res) { return res.json() })
      },
    }

    var __styles = {
      insert: function (css) {
        var el = document.createElement('style')
        el.setAttribute('data-netshell', '')
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
      inject: ['slots'],
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
writeFileSync(join(root, 'lib/index.js'), splice(hostTemplate, '/*__HOST_SOURCE__*/', hostSource))
writeFileSync(join(root, 'lib/client.js'), splice(clientTemplate, '/*__CLIENT_SOURCE__*/', clientSource))
console.log('build: lib/index.js + lib/client.js 已生成(源: dev/nsh-host.js + dev/nsh-client.js)')
