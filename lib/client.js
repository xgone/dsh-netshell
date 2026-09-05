/**
 * NetShell — DSH 远程终端插件(Loader 静态包 · 浏览器半区)
 *
 * 由 scripts/build.mjs 从 src/nsh-client.js 生成,请勿手改;
 * 改 dev/ 源码后运行 `pnpm build` 重新生成。
 *
 * 形状与官方 dsh.client 包一致:window.__ModuleLoader__.load({
 * id, factory(require) }) 工厂模块。动态沙箱 builtin 的 shim:
 *   - host.call(method, args) → POST <RPC 路由>(同宿主半区的分发端点)
 *   - styles.insert(css)      → <style> 注入 document.head
 *   - ctx.timer               → setInterval/setTimeout 增广(客户端无 timer 服务)
 */
window.__ModuleLoader__.load({
  id: '@xgone/dsh-netshell',
  factory: function (require) {
    var React = require('react')

    var __host = {
      call: function (method, args) {
        return fetch('/netshell/rpc', {
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
// NetShell 浏览器半区(动态沙箱函数体形态;自由变量:React / host / styles)
// 约定:ES5 函数体、字符串拼接不用反引号、任何单行不超过 2000 字符
// (2000 是 read 工具的截断线,build.mjs 有硬校验;超长表达式一律拆多行)。
var h = React.createElement

// 终端配色预设:ANSI 16 色(标准 8 + 亮色 8)+ 背景 8 色,按索引查表。
// lineSpans 只记录颜色索引,TermView 渲染时按当前主题解析成具体色值,
// 因此切换主题后无需重新解析终端缓冲,下一次渲染立即整体换色。
var THEMES = {
  dark: {
    key: 'dark',
    cls: 'nsh-term-dark',
    fgPal: {
      30: '#586a8a', 31: '#e5534b', 32: '#3fb950', 33: '#d29922',
      34: '#4f8cff', 35: '#bc6ff0', 36: '#39c5cf', 37: '#d5dae6',
      90: '#7b8bab', 91: '#ff7b72', 92: '#56d364', 93: '#e3b341',
      94: '#79b8ff', 95: '#d2a8ff', 96: '#67e8f9', 97: '#ffffff'
    },
    bgPal: {
      40: '#1c2333', 41: '#4c1f1e', 42: '#1d3325', 43: '#3a2e12',
      44: '#1c2c4c', 45: '#31204a', 46: '#123a3f', 47: '#39415a',
      100: '#2c3852', 101: '#5c2a28', 102: '#2a4534', 103: '#4c3d1a',
      104: '#2a3d61', 105: '#452f63', 106: '#1a5057', 107: '#4d5670'
    }
  },
  light: {
    key: 'light',
    cls: 'nsh-term-light',
    fgPal: {
      30: '#24292f', 31: '#cf222e', 32: '#116329', 33: '#9a6700',
      34: '#0969da', 35: '#8250df', 36: '#1b7c83', 37: '#57606a',
      90: '#57606a', 91: '#a40e26', 92: '#1a7f37', 93: '#bf8700',
      94: '#0969da', 95: '#8250df', 96: '#1b7c83', 97: '#24292f'
    },
    bgPal: {
      40: '#d8dee4', 41: '#ffebe9', 42: '#dafbe1', 43: '#fff8c5',
      44: '#ddf4ff', 45: '#fbefff', 46: '#c5e9e5', 47: '#eaeef2',
      100: '#c9d1d9', 101: '#ffd7d5', 102: '#beffe2', 103: '#ffefc0',
      104: '#c6e6ff', 105: '#f0dbff', 106: '#a8ddd9', 107: '#d9dee8'
    }
  }
}

function curTheme() {
  return THEMES[store.st.termTheme] || THEMES.dark
}

var T = function (n) { return 'var(--dsw-' + n + ')' }
var TK = {
  lb: T('alias-label-primary'),
  ls: T('alias-label-secondary'),
  t3: T('alias-label-tertiary'),
  base: T('alias-bg-base'),
  l1: T('alias-bg-layer-1'),
  l2: T('alias-bg-layer-2'),
  mod: T('alias-bg-module-platform'),
  b1: T('alias-border-l1'),
  b2: T('alias-border-l2'),
  b3: T('alias-border-l3'),
  b4: T('alias-border-l4'),
  btn: T('alias-button-primary-fill'),
  btnh: T('alias-button-primary-hover'),
  btf: T('alias-label-primary-foreground'),
  hov: T('alias-interactive-bg-hover'),
  hovd: T('alias-interactive-bg-hover-danger'),
  ok: T('alias-state-success-primary'),
  err: T('alias-state-error-primary'),
  warn: T('alias-state-warn-primary')
}

var CSS = ''
  + '.nsh-root{height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;color:' + TK.lb + ';font-family:inherit}'
  + '.nsh-split{flex:1;display:flex;flex-direction:row;min-width:0;min-height:0}'
  + '.nsh-side{flex:none;width:224px;display:flex;flex-direction:column;min-height:0;background:' + TK.l2 + ';border-right:0.5px solid ' + TK.b2 + '}'
  + '.nsh-side-scroll{flex:1;min-height:0;overflow-y:auto;padding:10px 8px 12px;display:flex;flex-direction:column;gap:14px}'
  + '.nsh-side-head{padding:0 6px 4px;font-size:11px;line-height:16px;font-weight:500;color:' + TK.t3 + '}'
  + '.nsh-srow{display:flex;align-items:center;gap:7px;padding:7px 9px;border-radius:10px;cursor:pointer;color:' + TK.ls + ';font-size:12.5px;line-height:18px;overflow:hidden}'
  + '.nsh-srow:hover,.nsh-srow-on{background:' + TK.hov + ';color:' + TK.lb + '}'
  + '.nsh-srow-main{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}'
  + '.nsh-srow-actions{flex:none;display:none;align-items:center;gap:2px}'
  + '.nsh-srow:hover .nsh-srow-actions,.nsh-srow-on .nsh-srow-actions{display:inline-flex}'
  + '.nsh-mini-x{flex:none;height:18px;width:18px;padding:0;border:none;border-radius:5px;background:transparent;color:' + TK.t3 + ';font-size:11px;line-height:16px;cursor:pointer}'
  + '.nsh-mini-x:hover{background:' + TK.hov + ';color:' + TK.lb + '}'
  + '.nsh-srow-drop{box-shadow:inset 0 2px 0 var(--dsw-alias-brand-primary)}'
  + '.nsh-sedit{flex:1;min-width:0;height:20px;padding:0 4px;border:0.5px solid ' + TK.b3 + ';border-radius:6px;background:' + TK.base + ';color:' + TK.lb + ';font:inherit;font-size:12.5px;line-height:18px;outline:none}'
  + '.nsh-tabdot{display:inline-flex;align-items:center;gap:7px}'
  + '.nsh-tabdot-dot{display:inline-flex;align-items:center;justify-content:center;min-width:15px;height:15px;padding:0 4px;border-radius:8px;color:#fff;font-size:10px;line-height:15px;font-weight:600;box-sizing:border-box}'
  + '.nsh-tabdot-busy{animation:nsh-tabpulse 1s ease-in-out infinite}'
  + '@keyframes nsh-tabpulse{0%,100%{opacity:1}50%{opacity:.4}}'
  + '@media (prefers-reduced-motion: reduce){.nsh-tabdot-busy{animation:none}}'
  + '.nsh-side-foot{flex:none;padding:8px 12px;border-top:0.5px solid ' + TK.b2 + ';font-size:11px;line-height:16px;color:' + TK.t3 + '}'
  + '.nsh-main{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;box-sizing:border-box;background:' + TK.base + ';padding-bottom:calc(var(--dsh-composer-height, 152px) + 8px)}'
  + '.nsh-session{flex:1;min-height:0;display:flex;flex-direction:column}'
  + '.nsh-empty{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px;overflow:auto}'
  + '.nsh-hintline{flex:none;padding:6px 14px 0;color:' + TK.warn + ';font-size:12px;line-height:18px}'
  + '.nsh-closedline{flex:none;display:flex;align-items:center;gap:8px;padding:6px 14px;color:' + TK.err + ';font-size:12px;line-height:18px}'
  + '.nsh-dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none;box-sizing:border-box}'
  + '.nsh-term{flex:1;min-height:0;overflow:auto;padding:10px 12px;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre;outline:none;cursor:text;background:var(--nsh-term-bg);color:var(--nsh-term-fg)}'
  + '.nsh-term-dark{--nsh-term-bg:#0d1117;--nsh-term-fg:#c9d1d9;--nsh-cursor:#3fb950}'
  + '.nsh-term-light{--nsh-term-bg:#ffffff;--nsh-term-fg:#24292f;--nsh-cursor:#116329}'
  + '.nsh-cursor{color:var(--nsh-cursor);animation:nsh-blink 1.1s step-end infinite}'
  + '@keyframes nsh-blink{0%,49%{opacity:1}50%,100%{opacity:0}}'
  + '@media (prefers-reduced-motion: reduce){.nsh-cursor{animation:none}}'
  + '.nsh-line{min-height:20px}'
  + '.nsh-banner{flex:none;margin:8px 14px 8px;padding:10px 12px;background:' + TK.l2 + ';border:0.5px solid ' + TK.warn + ';border-radius:10px;font-size:12.5px}'
  + '.nsh-statuswrap{position:relative;flex:none}'
  + '.nsh-statusbar{display:flex;align-items:center;gap:6px;height:28px;padding:0 14px;border-bottom:0.5px solid ' + TK.b2 + ';font-size:11.5px;color:' + TK.t3 + ';background:' + TK.l2 + '}'
  + '.nsh-latest{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,Menlo,Consolas,monospace;color:' + TK.ls + '}'
  + '.nsh-mini{flex:none;height:20px;padding:0 8px;border:0.5px solid ' + TK.b3 + ';border-radius:10px;background:transparent;color:' + TK.ls + ';font:inherit;font-size:11px;line-height:16px;cursor:pointer}'
  + '.nsh-mini:hover,.nsh-mini-on{background:' + TK.hov + ';color:' + TK.lb + '}'
  + '.nsh-histpanel{position:absolute;left:0;right:0;top:100%;bottom:auto;max-height:230px;overflow-y:auto;background:' + TK.l1 + ';border-bottom:0.5px solid ' + TK.b2 + ';box-shadow:0 8px 24px rgba(0,0,0,.25);z-index:6;padding:6px 0}'
  + '.nsh-histrow{display:flex;align-items:center;gap:8px;padding:3px 14px;font-size:11.5px;line-height:18px;font-family:ui-monospace,Menlo,Consolas,monospace;white-space:nowrap;color:' + TK.lb + '}'
  + '.nsh-histrow:hover{background:' + TK.hov + '}'
  + '.nsh-time{flex:none;color:' + TK.t3 + ';font-size:10.5px}'
  + '.nsh-badge{flex:none;padding:0 6px;border-radius:4px;font-size:10.5px;line-height:16px}'
  + '.nsh-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:36px;padding:0 14px;border:0.5px solid ' + TK.b3 + ';border-radius:18px;background:transparent;color:' + TK.lb + ';font:inherit;font-size:14px;line-height:22px;cursor:pointer}'
  + '.nsh-btn:hover{background:' + TK.hov + '}'
  + '.nsh-btn-pri{background:' + TK.btn + ';border:none;color:' + TK.btf + '}'
  + '.nsh-btn-pri:hover{background:' + TK.btnh + '}'
  + '.nsh-btn-danger{background:transparent;border:none;color:' + TK.err + '}'
  + '.nsh-btn-danger:hover{background:' + TK.hovd + '}'
  + '.nsh-btn-ok{background:' + TK.btn + ';border:none;color:' + TK.btf + '}'
  + '.nsh-btn-ok:hover{background:' + TK.btnh + '}'
  + '.nsh-btn-sm{height:28px;padding:0 10px;border-radius:14px;font-size:12px;line-height:18px}'
  + '[class*="footerActions"]{flex-direction:column;align-items:stretch}'
  + '.nsh-section{display:flex;flex-direction:column;gap:12px;max-width:720px}'
  + '.nsh-title2{margin:0;font-size:16px;line-height:24px;font-weight:500;color:' + TK.lb + '}'
  + '.nsh-rows{list-style:none;display:flex;flex-direction:column;gap:8px;margin:4px 0 0;padding:0}'
  + '.nsh-row{border:0.5px solid ' + TK.b4 + ';border-radius:16px;padding:12px 14px;display:flex;align-items:center;gap:10px;color:' + TK.lb + '}'
  + '.nsh-identity{display:inline-flex;align-items:center;gap:6px;min-width:0}'
  + '.nsh-name{font-size:14px;line-height:22px;font-weight:500;color:' + TK.lb + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
  + '.nsh-meta{font-size:12px;color:' + TK.t3 + ';font-family:ui-monospace,Menlo,Consolas,monospace}'
  + '.nsh-actions{display:inline-flex;align-items:center;gap:4px;margin-left:auto}'
  + '.nsh-pill{flex:none;padding:1px 6px;border:0.5px solid ' + TK.b3 + ';border-radius:4px;font-size:11px;line-height:16px;color:' + TK.ls + '}'
  + '.nsh-editor{border-radius:12px;background:' + TK.mod + ';padding:14px 16px;display:flex;flex-direction:column;gap:14px}'
  + '.nsh-grid{display:flex;flex-wrap:wrap;gap:10px}'
  + '.nsh-field{display:flex;flex-direction:column;gap:6px;min-width:150px}'
  + '.nsh-field-grow{flex:1}'
  + '.nsh-lb{font-size:12px;line-height:18px;font-weight:500;color:' + TK.ls + '}'
  + '.nsh-in{box-sizing:border-box;width:100%;height:32px;padding:0 10px;border:0.5px solid ' + TK.b4 + ';border-radius:8px;font:inherit;font-size:14px;line-height:22px;background:' + TK.l1 + ';color:' + TK.lb + ';outline:none}'
  + '.nsh-in:focus{border-color:var(--dsw-alias-brand-primary)}'
  + 'select.nsh-in{max-width:240px;cursor:pointer}'
  + '.nsh-in::placeholder{color:' + TK.t3 + '}'
  + '.nsh-cap{margin:0;font-size:12px;line-height:18px;color:' + TK.t3 + '}'
  + '.nsh-err{margin:0;font-size:12px;line-height:18px;color:' + TK.err + '}'
  + '.nsh-muted{color:' + TK.t3 + '}'
  + '.nsh-rules{display:flex;flex-direction:column;gap:8px}'
  + '.nsh-rrow{display:flex;align-items:center;gap:8px;min-width:0}'
  + '.nsh-ridx{flex:none;min-width:16px;text-align:right;font-size:11px;line-height:16px;color:' + TK.t3 + ';font-family:ui-monospace,Menlo,Consolas,monospace}'
  + '.nsh-rx{flex:none;width:26px;height:32px;padding:0;border:0.5px solid transparent;border-radius:8px;background:transparent;color:' + TK.t3 + ';font:inherit;font-size:12px;line-height:16px;cursor:pointer}'
  + '.nsh-rx:hover{color:' + TK.err + ';background:' + TK.hovd + '}'
  + '.nsh-rempty{border:1px dashed ' + TK.b3 + ';border-radius:10px;padding:12px 14px;text-align:center;color:' + TK.t3 + ';font-size:12px;line-height:19px}'
  + '.nsh-chips{display:flex;flex-wrap:wrap;align-items:center;gap:6px}'
  + '.nsh-chip{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border:0.5px solid ' + TK.b3 + ';border-radius:9px;background:transparent;color:' + TK.lb + ';font:inherit;font-size:11.5px;line-height:17px;cursor:pointer;text-align:left}'
  + '.nsh-chip:hover{background:' + TK.hov + ';border-color:' + TK.b4 + '}'
  + '.nsh-chip-pat{font-family:ui-monospace,Menlo,Consolas,monospace}'
  + '.nsh-chip-act{flex:none;font-size:10.5px;line-height:16px;padding:0 5px;border-radius:4px;color:' + TK.base + '}'
  + '.nsh-nav{display:inline-flex;align-items:center;gap:6px}'
  + 'button:has(.nsh-nav) > :first-child{display:none!important}'

function keyToData(e) {
  if (e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1) {
    var c = e.key.toLowerCase().charCodeAt(0)
    if (c >= 97 && c <= 122) return String.fromCharCode(c - 96)
    return null
  }
  if (e.metaKey) return null
  switch (e.key) {
    case 'Enter': return '\r'
    case 'Backspace': return '\u007f'
    case 'Tab': return e.shiftKey ? '\u001b[Z' : '\t'
    case 'Escape': return '\u001b'
    case 'ArrowUp': return '\u001b[A'
    case 'ArrowDown': return '\u001b[B'
    case 'ArrowRight': return '\u001b[C'
    case 'ArrowLeft': return '\u001b[D'
    case 'Delete': return '\u001b[3~'
    case 'Home': return '\u001b[H'
    case 'End': return '\u001b[F'
    case 'PageUp': return '\u001b[5~'
    case 'PageDown': return '\u001b[6~'
  }
  if (e.key.length === 1) return e.key
  return null
}

function applySgr(st, code) {
  var parts = code === '' ? ['0'] : code.split(';')
  for (var i = 0; i < parts.length; i++) {
    var n = parseInt(parts[i] || '0', 10)
    if (n === 0) { st.fg = null; st.bg = null; st.bold = false; st.dim = false; st.under = false; st.it = false; st.strike = false }
    else if (n === 1) st.bold = true
    else if (n === 2) { st.bold = false; st.dim = true }
    else if (n === 3) st.it = true
    else if (n === 4) st.under = true
    else if (n === 9) st.strike = true
    else if (n === 22) { st.bold = false; st.dim = false }
    else if (n === 23) st.it = false
    else if (n === 24) st.under = false
    else if (n === 29) st.strike = false
    else if (n === 39) st.fg = null
    else if (n === 49) st.bg = null
    else if ((n >= 30 && n <= 37) || (n >= 90 && n <= 97)) st.fg = n
    else if ((n >= 40 && n <= 47) || (n >= 100 && n <= 107)) st.bg = n
  }
}

function styleEq(a, b) { return a.fg === b.fg && a.bg === b.bg && a.bold === b.bold && a.dim === b.dim && a.under === b.under && a.it === b.it && a.strike === b.strike }

function lineSpans(raw) {
  var cells = []
  var col = 0
  var st = { fg: null, bg: null, bold: false, dim: false, under: false, it: false, strike: false }
  function put(txt) { cells[col] = { t: txt, s: { fg: st.fg, bg: st.bg, bold: st.bold, dim: st.dim, under: st.under, it: st.it, strike: st.strike } }; col++ }
  var i = 0
  var n = raw.length
  while (i < n) {
    var c = raw.charCodeAt(i)
    if (c === 0x1b) {
      if (raw.charAt(i + 1) === '[') {
        var j = i + 2
        while (j < n && raw.charCodeAt(j) >= 0x30 && raw.charCodeAt(j) <= 0x3f) j++
        while (j < n && raw.charCodeAt(j) >= 0x20 && raw.charCodeAt(j) <= 0x2f) j++
        if (j >= n) { i = n; continue }
        var fin = raw.charAt(j)
        var params = raw.slice(i + 2, j)
        if (fin === 'm') { applySgr(st, params) }
        else if (fin === 'K' || fin === 'J') {
          var kn = parseInt(params || '0', 10) || 0
          if (kn === 0) { if (col < cells.length) cells.length = col }
          else if (kn === 1) {
            for (var a1 = 0; a1 < col && a1 < cells.length; a1++) {
              cells[a1] = { t: ' ', s: { fg: null, bg: null, bold: false, dim: false, under: false, it: false, strike: false } }
            }
          }
          else { cells.length = 0 }
        }
        else if (fin === 'D') { col = Math.max(0, col - (parseInt(params || '1', 10) || 1)) }
        else if (fin === 'C') { col = col + (parseInt(params || '1', 10) || 1) }
        else if (fin === 'G') { col = Math.max(0, (parseInt(params || '1', 10) || 1) - 1) }
        i = j + 1
        continue
      }
      if (raw.charAt(i + 1) === ']') {
        var k2 = i + 2
        while (k2 < n && raw.charCodeAt(k2) !== 7 && !(raw.charCodeAt(k2) === 0x1b && raw.charAt(k2 + 1) === '\\')) k2++
        i = raw.charCodeAt(k2) === 0x1b ? k2 + 2 : k2 + 1
        if (i > n) i = n
        continue
      }
      i += 2
      continue
    }
    if (c === 8) { if (col > 0) col--; i++; continue }
    if (c === 13) { col = 0; i++; continue }
    if (c === 9) { var sp = 8 - (col % 8); for (var q = 0; q < sp; q++) put(' '); i++; continue }
    if (c === 7) { i++; continue }
    if (c < 32 || c === 127) { i++; continue }
    var txt = raw.charAt(i)
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < n) { txt += raw.charAt(i + 1) }
    put(txt)
    i += txt.length
  }
  var spans = []
  var buf = ''
  var curS = null
  for (var m = 0; m < cells.length; m++) {
    var cell = cells[m]
    if (!cell) { if (buf) { spans.push({ t: buf, s: curS }); buf = ''; curS = null } continue }
    if (curS && styleEq(curS, cell.s)) { buf += cell.t }
    else { if (buf) spans.push({ t: buf, s: curS }); buf = cell.t; curS = cell.s }
  }
  if (buf) spans.push({ t: buf, s: curS })
  if (spans.length === 0) spans.push({ t: '', s: {} })
  return { spans: spans, col: col }
}

function newScreen(serverName) {
  return {
    serverName: serverName, lines: [], cur: '', lastCursor: 0, lastSeq: 0,
    events: [], status: 'connecting', pending: null, closedReason: null,
    hint: null, lossy: false, dropped: 0, showHist: false, nExec: 0, nDeny: 0, nAsk: 0
  }
}

function pushLine(sc, raw) {
  sc.lines.push(lineSpans(raw).spans)
  if (sc.lines.length > 1200) { sc.lines.splice(0, 400); sc.dropped += 400 }
}

function feed(sc, text) {
  var buf = sc.cur + text
  var lines = buf.split('\n')
  sc.cur = lines.pop()
  for (var i = 0; i < lines.length; i++) pushLine(sc, lines[i])
}

var store = {
  st: { servers: [], activeId: null, editing: null, tick: 0, connectError: null, termTheme: 'dark' },
  subs: new Set(),
  set: function (patch) {
    var next = {}
    for (var k in this.st) next[k] = this.st[k]
    for (var p in patch) next[p] = patch[p]
    this.st = next
    this.subs.forEach(function (f) { f() })
  }
}

var localeService = null
function isEnglish() {
  var active = localeService && localeService.getLocale().active
  return typeof active === 'string' && (active === 'en' || active.indexOf('en-') === 0)
}
var COPY = {
  zh: {
    terminal: '终端', localTerminal: '本地终端', currentDevice: '当前设备', newSession: '新建',
    omitted: '… 已省略较早的 ', lines: ' 行输出', dangerPending: '⚠ 危险命令待确认', matchedRule: '匹配规则:', lockedRule: 'locked 模式白名单外', blockedWaiting: ' · 已拦截,等待你的决定',
    once: '执行一次', always: '永久放行该命令', deny: '拒绝', exec: '执行', blocked: '拦截', allowed: '放行', closed: '退出',
    termTheme: '终端配色:深色 / 浅色', dark: '深色', light: '浅色', historyEmpty: '本会话还没有命令记录', noCommand: '暂无命令', collapseHistory: '收起历史', history: '历史',
    connect: '连接', sessions: '会话', servers: '服务器', noSessions: '暂无会话', noProfiles: '暂无档案', archivePath: '档案管理:设置 → ',
    connectFailed: '连接失败:', selectServer: '从左侧选择一个服务器开始远程会话', noProfile: '还没有服务器档案 — 在「设置 → ', closeRemove: '关闭并移除',
    rename: '重命名', remove: '移除', disconnectRemove: '断开并移除', pending: '待确认',
    ruleExamples: '示例:', serverRules: '服务器规则', ruleHint: '按顺序匹配 · 优先于内置规则库 · 只约束 AI 执行的命令',
    ruleHelp1: '匹配完整命令行:支持 * (任意字符) 与 ? (单字符) 通配,不区分大小写,自动剥除 sudo / nohup 等前缀。',
    ruleHelp2: '从上到下先命中先生效:deny 直接拦截;ask 执行前弹确认;allow 直接放行(locked 模式下即白名单)。',
    noCustomRules: '暂无自定义规则 — 未命中的命令按内置规则库 + 权限等级处理。可从下方示例一键添加。', addRule: '+ 添加规则',
    editServer: '编辑服务器:', newServer: '新增服务器', name: '名称', host: '主机', port: '端口', user: '用户名', auth: '认证方式', password: '密码', key: '私钥', agent: 'ssh-agent', keyPath: '私钥路径', level: '权限等级',
    open: 'open 宽松', guarded: 'guarded 默认', locked: 'locked 严格', passwordKeep: '已设置 — 留空保持不变', passwordHint: '输入密码(存入加密凭据库,不经 AI 会话)', clearPassword: '清除已存密码', save: '保存', cancel: '取消', edit: '编辑', delete: '删除',
    noServers: '还没有服务器档案。新增一个,密码会存入 DSH 加密凭据库,连接时由插件直接注入,完全不经过 AI 会话。', levels: '权限等级说明', openHelp: '[open] 宽松:所有命令直接放行,仅内置 deny 规则(如 rm -rf /)硬拦截。', guardedHelp: '[guarded] 默认:命中 ask 规则的危险命令会被拦下,弹出确认后由你决定是否执行。', lockedHelp: '[locked] 严格:只有规则表中 allow 的命令直接执行,其余一律先询问。', requiredFields: '名称、主机、用户名为必填项', invalidPort: '端口必须是 1-65535 的整数', emptyRule: '第 {n} 条规则的命令模式为空,请填写或删除该行', rulePatternPlaceholder: '命令通配,如 rm -rf /var/log/*', ruleActionTitle: 'deny 直接拦截 / ask 执行前确认 / allow 直接放行', denyAction: 'deny 拦截', askAction: 'ask 确认', allowAction: 'allow 放行',
    exampleAllowTip: '放行日志清理', exampleDenyTip: '本服务器永久禁止强推', exampleAskSystemTip: '管理 systemd 服务前先确认', exampleAskDockerTip: '删除容器前先确认', newNamePlaceholder: '生产-web-01', hostPlaceholder: '10.0.0.5 或 host.example.com', closeSession: '会话已结束:', unknown: '未知原因',
    passwordConfigured: '密码已存入凭据库', passwordNotConfigured: '未设置密码', connection: '连接',
  },
  en: {
    terminal: 'Terminal', localTerminal: 'Local terminal', currentDevice: 'This device', newSession: 'New',
    omitted: '… Earlier ', lines: ' lines omitted', dangerPending: '⚠ Dangerous command pending', matchedRule: 'Matched rule:', lockedRule: 'locked mode: command is not allowlisted', blockedWaiting: ' · blocked, waiting for your decision',
    once: 'Run once', always: 'Always allow this command', deny: 'Deny', exec: 'Run', blocked: 'Blocked', allowed: 'Allowed', closed: 'Exit',
    termTheme: 'Terminal theme: dark / light', dark: 'Dark', light: 'Light', historyEmpty: 'No command history in this session', noCommand: 'No command', collapseHistory: 'Hide history', history: 'History',
    connect: 'Connect', sessions: 'Sessions', servers: 'Servers', noSessions: 'No sessions', noProfiles: 'No profiles', archivePath: 'Profiles: Settings → ',
    connectFailed: 'Connection failed:', selectServer: 'Select a server from the left to start a remote session', noProfile: 'No server profile yet — add one in Settings → ', closeRemove: 'Close and remove',
    rename: 'Rename', remove: 'Remove', disconnectRemove: 'Disconnect and remove', pending: 'Pending',
    ruleExamples: 'Examples:', serverRules: 'Server rules', ruleHint: 'Matched in order · takes priority over built-ins · applies only to AI commands',
    ruleHelp1: 'Matches the full command line with * (any text) and ? (one character), case-insensitive, stripping sudo / nohup prefixes.',
    ruleHelp2: 'First match wins: deny blocks, ask confirms, allow runs directly (allow rules are the whitelist in locked mode).',
    noCustomRules: 'No custom rules — unmatched commands use built-in rules and the permission level. Add one from the examples below.', addRule: '+ Add rule',
    editServer: 'Edit server:', newServer: 'New server', name: 'Name', host: 'Host', port: 'Port', user: 'Username', auth: 'Authentication', password: 'Password', key: 'Private key', agent: 'ssh-agent', keyPath: 'Private key path', level: 'Permission level',
    open: 'open permissive', guarded: 'guarded default', locked: 'locked strict', passwordKeep: 'Configured — leave blank to keep', passwordHint: 'Enter password (stored in encrypted credentials, never in AI sessions)', clearPassword: 'Clear saved password', save: 'Save', cancel: 'Cancel', edit: 'Edit', delete: 'Delete',
    noServers: 'No server profiles yet. Add one; passwords are stored in DSH encrypted credentials and injected by the plugin, never sent through the AI session.', levels: 'Permission levels', openHelp: '[open] Permissive: commands run directly except built-in deny rules such as rm -rf /.', guardedHelp: '[guarded] Default: dangerous ask rules pause for your confirmation.', lockedHelp: '[locked] Strict: only allow rules run directly; all other commands require confirmation.', requiredFields: 'Name, host, and username are required', invalidPort: 'Port must be an integer from 1 to 65535', emptyRule: 'Rule {n} has an empty command pattern; fill it in or remove it', rulePatternPlaceholder: 'Command pattern, e.g. rm -rf /var/log/*', ruleActionTitle: 'deny blocks / ask confirms / allow runs directly', denyAction: 'deny block', askAction: 'ask confirm', allowAction: 'allow run',
    exampleAllowTip: 'Allow log cleanup', exampleDenyTip: 'Permanently block force pushes on this server', exampleAskSystemTip: 'Confirm before managing systemd services', exampleAskDockerTip: 'Confirm before deleting containers', newNamePlaceholder: 'production-web-01', hostPlaceholder: '10.0.0.5 or host.example.com', closeSession: 'Session ended:', unknown: 'Unknown reason',
    passwordConfigured: 'Password stored in credentials', passwordNotConfigured: 'Password not set', connection: 'Connect',
  }
}
function text(key) {
  var dict = isEnglish() ? COPY.en : COPY.zh
  return dict[key] || key
}
function termLabel() { return text('terminal') }
function localTerminalLabel() { return text('localTerminal') }
function currentDeviceLabel() { return text('currentDevice') }
function newSessionLabel() { return text('newSession') }

var screens = new Map()

// 会话侧栏的显示顺序与拖拽状态。sessOrder 是唯一的渲染顺序来源:
// discoverSessions / doConnect 追加,removeSession 移除,拖放时重排。
// 重命名(sc.label)与顺序都是页面内状态,会话本身随宿主进程结束而消失。
var sessOrder = []
var dragId = null
var dragOverId = null
var sessSig = ''
// 已删除会话 id 的永久黑名单:会话 id 每个连接唯一、绝不重用,所以一旦删除,
// 在本页面生命周期内一律不重新加回。这样任意在途的旧 discoverSessions 列表
// 也永远不会把它加回来(否则「删除成功 → 闪现 → 再消失」)。不自动清除。
// 仅在 disconnect 失败(会话实际仍存在)时撤下标记。
var removedIds = new Set()

// Tab 标签上的状态圆点:灰 = 无连接,绿 = 有活跃会话,数字 = 已连接会话数,
// agent 正在通过终端执行/等待确认时闪烁(纯 CSS 动画)。
// 关键设计:label thunk 返回的是一个【函数组件】元素(TabDot),它内部用
// useStore() 订阅插件自己的 store —— 状态变化时 React 原地重渲染该组件,
// 完全不触碰槽位注册表。绝不能用「注销再重注册槽位」来刷新标签:
// slots.inject 的 watcher 会在槽位变脏时重跑 factory 再建一个 cell,
// 直接导致页面上出现两个重复 Tab(0.5.0 实际踩坑)。
function TabDot() {
  useStore()
  var liveN = 0
  var busyN = 0
  screens.forEach(function (s) {
    if (s.status === 'live') liveN++
    if (s.agentBusy) busyN++
  })
  return h('span', { className: 'nsh-tabdot' },
    termLabel(),
    h('span', {
      className: 'nsh-tabdot-dot' + (busyN ? ' nsh-tabdot-busy' : ''),
      style: { background: liveN ? TK.ok : TK.t3 }
    }, String(liveN)))
}

function tabLabelEl() {
  return h(TabDot, null)
}

// 设置导航条目的终端图标:内联 SVG(动态沙箱无 require,拿不到 primitives 图标库,
// 参照 dsh-remote 的做法 —— label 传 thunk 返回「图标 + 文字」元素,壳层把它渲染进
// 导航按钮的 label 座,再用一行插件自有 CSS 隐藏壳层兜底画出的齿轮,style 随插件启停)。
function nshNavGlyph() {
  return h('svg', {
    width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': 'true'
  },
    h('rect', { x: 1.625, y: 2.625, width: 12.75, height: 10.75, rx: 2.125, stroke: 'currentColor', strokeWidth: 1.25 }),
    h('path', { d: 'M4.3 6.1L6.7 8.1L4.3 10.1', stroke: 'currentColor', strokeWidth: 1.25, strokeLinecap: 'round', strokeLinejoin: 'round' }),
    h('path', { d: 'M8.1 10.6H11.6', stroke: 'currentColor', strokeWidth: 1.25, strokeLinecap: 'round' }))
}

function TermNavLabel() {
  useStore()
  return h('span', { className: 'nsh-nav' }, nshNavGlyph(), termLabel())
}

function settingsNavLabel() {
  return h(TermNavLabel, null)
}

function removeSession(id) {
  var s = screens.get(id)
  removedIds.add(id)
  if (s && s.status !== 'closed') {
    // disconnect 失败(会话实际仍存在)时撤下黑名单标记,让会话重新显示。
    host.call('netshell.disconnect', { id: id }).catch(function () {
      removedIds.delete(id)
      store.set({ tick: store.st.tick + 1 })
    })
  }
  screens.delete(id)
  var ix = sessOrder.indexOf(id)
  if (ix >= 0) sessOrder.splice(ix, 1)
  if (store.st.activeId === id) {
    var nextId = sessOrder.length ? sessOrder[Math.min(ix, sessOrder.length - 1)] : null
    store.set({ activeId: nextId })
  } else {
    store.set({ tick: store.st.tick + 1 })
  }
}

function useStore() {
  var force = React.useState(0)[1]
  React.useEffect(function () {
    var f = function () { force(function (x) { return x + 1 }) }
    store.subs.add(f)
    return function () { store.subs.delete(f) }
  }, [])
  return store.st
}

function refreshServers() {
  return host.call('netshell.profiles.list', {})
    .then(function (r) { store.set({ servers: (r && r.servers) || [] }) })
    .catch(function () {})
}

function pollOne(id) {
  var sc = screens.get(id)
  if (!sc) return Promise.resolve()
  return host.call('netshell.poll', { id: id }).then(function (r) {
    if (r && r.gone) {
      // 宿主已无此会话(断开/移除),清理本地并停止轮询;一并拉黑,避免在途列表加回。
      removedIds.add(id)
      screens.delete(id)
      var ix0 = sessOrder.indexOf(id)
      if (ix0 >= 0) sessOrder.splice(ix0, 1)
      if (store.st.activeId === id) store.set({ activeId: null })
      store.set({ tick: store.st.tick + 1 })
      return
    }
    sc.status = r.status
    sc.closedReason = r.closedReason || null
    sc.hint = r.hint || null
    sc.pending = r.pending || null
    sc.lines = []
    sc.cur = ''
    if (r.output) feed(sc, r.output)
    sc.events = []
    sc.nExec = 0
    sc.nDeny = 0
    sc.nAsk = 0
    if (r.events && r.events.length) {
      for (var i = 0; i < r.events.length; i++) {
        var ev = r.events[i]
        sc.events.push(ev)
        if (ev.type === 'exec') sc.nExec++
        else if (ev.type === 'deny') sc.nDeny++
        else if (ev.type === 'ask-allow') sc.nAsk++
      }
    }
    store.set({ tick: store.st.tick + 1 })
  }).catch(function () {})
}

function discoverSessions() {
  return host.call('netshell.sessions.list', {}).then(function (r) {
    var list = (r && r.sessions) || []
    // 先清理宿主已不存在的会话(断开/移除):避免残留 id 被每 150ms 轮询,
    // 也避免 pollOne 对已消失会话报 handler 失败。
    var present = {}
    for (var p = 0; p < list.length; p++) if (list[p] && list[p].id) present[list[p].id] = true
    var toRemove = []
    screens.forEach(function (_sc, id) { if (!present[id]) toRemove.push(id) })
    if (toRemove.length) {
      for (var k = 0; k < toRemove.length; k++) {
        screens.delete(toRemove[k])
        var ixr = sessOrder.indexOf(toRemove[k])
        if (ixr >= 0) sessOrder.splice(ixr, 1)
        if (store.st.activeId === toRemove[k]) store.set({ activeId: null })
      }
      store.set({ tick: store.st.tick + 1 })
    }
    for (var i = 0; i < list.length; i++) {
      var si = list[i]
      // 已删除的 id 在途读到旧列表时一律不重新加回,避免「删除后闪现」。
      if (si && si.id && removedIds.has(si.id)) continue
      if (si && si.id && !screens.has(si.id)) {
        var sc = newScreen(si.serverName || termLabel())
        sc.status = si.status || 'connecting'
        screens.set(si.id, sc)
        if (sessOrder.indexOf(si.id) < 0) sessOrder.push(si.id)
      }
      if (si && si.id) {
        var cur = screens.get(si.id)
        if (cur) {
          // 关键:会话可能是工具(agent)创建的,不一定是当前选中会话,
          // 而 pollOne 只轮询 activeId。status/pending 必须在这里同步,
          // 否则工具建会话后圆点永远停在首次探测的 connecting,不会转绿。
          cur.status = si.status || cur.status
          cur.pending = si.pending || null
          cur.closedReason = si.closedReason || null
          cur.hint = si.hint || null
          cur.agentBusy = !!si.agentBusy
        }
      }
    }
    var liveN = 0
    var busyN = 0
    screens.forEach(function (s) {
      if (s.status === 'live') liveN++
      if (s.agentBusy) busyN++
    })
    var sig = liveN + ':' + busyN
    if (sig !== sessSig) {
      sessSig = sig
      store.set({ tick: store.st.tick + 1 })
    }
  }).catch(function () {})
}

function doConnect(server) {
  store.set({ connectError: null })
  host.call('netshell.connect', { serverId: server.id }).then(function (r) {
    screens.set(r.id, newScreen(server.name))
    if (sessOrder.indexOf(r.id) < 0) sessOrder.push(r.id)
    store.set({ activeId: r.id })
    pollOne(r.id)
  }).catch(function (e) {
    store.set({ connectError: String((e && e.message) || e) })
  })
}

function doLocalConnect() {
  store.set({ connectError: null })
  host.call('netshell.local.connect', {}).then(function (r) {
    screens.set(r.id, newScreen(localTerminalLabel()))
    if (sessOrder.indexOf(r.id) < 0) sessOrder.push(r.id)
    store.set({ activeId: r.id })
    pollOne(r.id)
  }).catch(function (e) {
    store.set({ connectError: String((e && e.message) || e) })
  })
}

function decide(id, pendingId, action) {
  return host.call('netshell.decide', { id: id, pendingId: pendingId, action: action })
    .then(function () { return pollOne(id) })
    .catch(function () {})
}

function statusColor(status) {
  if (status === 'live') return TK.ok
  if (status === 'connecting') return TK.warn
  if (status === 'closed') return TK.err
  return TK.t3
}

// 把解析后的单元格样式(颜色索引 + 属性)解析成当前主题下的具体 CSS。
// 粗体 + 标准 8 色按终端惯例映射到亮色变体(fg+60)。
function spanStyle(s) {
  var th = curTheme()
  var out = {}
  if (s.fg !== null && s.fg !== undefined) {
    var fgn = s.fg
    if (s.bold && fgn >= 30 && fgn <= 37) fgn += 60
    var c = th.fgPal[fgn]
    if (c) out.color = c
  }
  if (s.bg !== null && s.bg !== undefined) {
    var bc = th.bgPal[s.bg]
    if (bc) out.backgroundColor = bc
  }
  if (s.bold) out.fontWeight = 'bold'
  if (s.dim) out.opacity = '0.62'
  if (s.under) out.textDecoration = s.strike ? 'underline line-through' : 'underline'
  else if (s.strike) out.textDecoration = 'line-through'
  if (s.it) out.fontStyle = 'italic'
  return out
}

function TermView(props) {
  var sc = props.sc
  var id = props.id
  var th = curTheme()
  var nodeState = React.useState(null)
  var node = nodeState[0]
  var setNode = nodeState[1]
  React.useEffect(function () { if (node) node.focus() }, [node])
  React.useEffect(function () {
    if (node) {
      var nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 60
      if (nearBottom) node.scrollTop = node.scrollHeight
    }
  })
  var onKeyDown = function (e) {
    var data = keyToData(e)
    if (data !== null && data !== undefined) {
      e.preventDefault()
      host.call('netshell.input', { id: id, data: data }).catch(function () {})
    }
  }
  var view = sc.lines.slice(-400)
  var children = []
  if (sc.dropped > 0) {
    children.push(h('div', { key: 'drop', className: 'nsh-muted', style: { fontStyle: 'italic' } }, text('omitted') + sc.dropped + text('lines')))
  }
  for (var i = 0; i < view.length; i++) {
    var spans = view[i]
    var els = []
    for (var j = 0; j < spans.length; j++) els.push(h('span', { key: j, style: spanStyle(spans[j].s) }, spans[j].t))
    children.push(h('div', { key: 'l' + i, className: 'nsh-line' }, els))
  }
  var live = lineSpans(sc.cur)
  var liveSpans = live.spans
  var liveCol = live.col
  var liveEls = []
  var used = 0
  var placed = false
  for (var k = 0; k < liveSpans.length; k++) {
    var sp = liveSpans[k]
    if (!placed && used + sp.t.length >= liveCol) {
      var off = liveCol - used
      if (off > 0) liveEls.push(h('span', { key: 'p' + k, style: spanStyle(sp) }, sp.t.slice(0, off)))
      liveEls.push(h('span', { key: 'cur', className: 'nsh-cursor' }, '▌'))
      if (off < sp.t.length) liveEls.push(h('span', { key: 'q' + k, style: spanStyle(sp) }, sp.t.slice(off)))
      placed = true
    } else {
      liveEls.push(h('span', { key: k, style: spanStyle(sp) }, sp.t))
    }
    used += sp.t.length
  }
  if (!placed) liveEls.push(h('span', { key: 'curEnd', className: 'nsh-cursor' }, '▌'))
  children.push(h('div', { key: 'live', className: 'nsh-line' }, liveEls))
  return h('div', { className: 'nsh-term ' + th.cls, tabIndex: 0, ref: setNode, onKeyDown: onKeyDown }, children)
}

function PendingBanner(props) {
  var sc = props.sc
  var id = props.id
  if (!sc.pending) return null
  var p = sc.pending
  return h('div', { className: 'nsh-banner' },
    h('div', { style: { fontWeight: 600, color: TK.warn, marginBottom: 4 } }, text('dangerPending')),
    h('div', { style: { fontFamily: 'ui-monospace,Menlo,monospace', marginBottom: 2 } }, p.command),
    h('div', { className: 'nsh-muted', style: { marginBottom: 8 } }, text('matchedRule') + (p.rule || text('lockedRule')) + text('blockedWaiting')),
    h('div', { style: { display: 'flex', gap: 8 } },
      h('button', { className: 'nsh-btn nsh-btn-ok', onClick: function () { decide(id, p.id, 'allow') } }, text('once')),
      h('button', { className: 'nsh-btn', onClick: function () { decide(id, p.id, 'always') } }, text('always')),
      h('button', { className: 'nsh-btn nsh-btn-danger', onClick: function () { decide(id, p.id, 'deny') } }, text('deny'))))
}

function badgeColor(type) {
  if (type === 'exec') return { background: TK.ok, color: TK.base }
  if (type === 'deny') return { background: TK.err, color: TK.base }
  if (type === 'ask-allow') return { background: TK.warn, color: TK.base }
  return { background: TK.l2, color: TK.lb }
}

function badgeText(type) {
  if (type === 'exec') return text('exec')
  if (type === 'deny') return text('blocked')
  if (type === 'ask-allow') return text('allowed')
  if (type === 'closed') return text('closed')
  return type
}

function ThemeButton() {
  var st = useStore()
  var dark = st.termTheme !== 'light'
  return h('button', {
    className: 'nsh-mini',
    title: text('termTheme'),
    onClick: function () { store.set({ termTheme: dark ? 'light' : 'dark' }) }
  }, dark ? text('dark') : text('light'))
}

function HistoryBar(props) {
  var sc = props.sc
  var toggle = function () { sc.showHist = !sc.showHist; store.set({ tick: store.st.tick + 1 }) }
  var latest = ''
  if (sc.events.length) { var ev = sc.events[sc.events.length - 1]; latest = ev.command || ev.reason || '' }
  var rows = null
  if (sc.showHist) {
    var items = sc.events.slice().reverse()
    rows = h('div', { className: 'nsh-histpanel' },
      items.length === 0 ? h('div', { className: 'nsh-histrow nsh-muted' }, text('historyEmpty')) : items.map(function (ev, i) {
        var t = ev.at ? new Date(ev.at).toTimeString().slice(0, 8) : ''
        return h('div', { key: ev.seq + '-' + i, className: 'nsh-histrow' },
          h('span', { className: 'nsh-time' }, t),
          h('span', { className: 'nsh-badge', style: badgeColor(ev.type) }, badgeText(ev.type)),
          h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, ev.command || ev.reason || ''))
      }))
  }
  return h('div', { className: 'nsh-statuswrap' },
    h('div', { className: 'nsh-statusbar' },
      h('span', { className: 'nsh-badge', style: badgeColor('exec') }, text('exec') + ' ' + sc.nExec),
      h('span', { className: 'nsh-badge', style: badgeColor('deny') }, text('blocked') + ' ' + sc.nDeny),
      h('span', { className: 'nsh-badge', style: badgeColor('ask-allow') }, text('allowed') + ' ' + sc.nAsk),
      h('span', { className: 'nsh-latest' }, latest || text('noCommand')),
      h(ThemeButton, null),
      h('button', { className: 'nsh-mini' + (sc.showHist ? ' nsh-mini-on' : ''), onClick: toggle }, sc.showHist ? text('collapseHistory') : text('history'))),
    rows)
}

function ServerQuickList() {
  var st = useStore()
  var rows = [h('div', { key: 'local-terminal', className: 'nsh-row' },
    h('span', { className: 'nsh-name', style: { minWidth: 100 } }, localTerminalLabel()),
    h('span', { className: 'nsh-meta', style: { flex: 1 } }, currentDeviceLabel()),
    h('button', { className: 'nsh-btn nsh-btn-pri', onClick: doLocalConnect }, newSessionLabel()))]
  rows = rows.concat(st.servers.map(function (s) {
    return h('div', { key: s.id, className: 'nsh-row' },
      h('span', { className: 'nsh-name', style: { minWidth: 100 } }, s.name),
      h('span', { className: 'nsh-meta', style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' } }, s.user + '@' + s.host + ':' + s.port),
      h('button', { className: 'nsh-btn nsh-btn-pri', onClick: function () { doConnect(s) } }, text('connect')))
  }))
  return h('div', { className: 'nsh-rows', style: { width: '100%', maxWidth: 460 } }, rows)
}

function sideSection(title, rows, emptyText) {
  return h('div', null,
    h('div', { className: 'nsh-side-head' }, title),
    rows.length ? rows : h('div', { className: 'nsh-srow', style: { cursor: 'default', color: TK.t3 } }, emptyText))
}

// 单个会话行:点击切换活动会话,悬停出现 重命名/删除,可拖拽排序。
// 重命名是行内编辑态(组件自身 useState);拖拽用原生 DnD,
// dragId/dragOverId 记在插件作用域,落点行加高亮线,松手重排 sessOrder。
function SessionRow(props) {
  var id = props.id
  var st = store.st
  var s = screens.get(id)
  var on = id === st.activeId
  var ed = React.useState(null)
  var editing = ed[0]
  var setEditing = ed[1]
  if (editing !== null) {
    var commit = function (v) {
      setEditing(null)
      var t = String(v === undefined || v === null ? '' : v).replace(/^\s+|\s+$/g, '')
      var cur = screens.get(id)
      if (cur) {
        if (t) cur.label = t
        else delete cur.label
      }
      store.set({ tick: store.st.tick + 1 })
    }
    return h('div', { className: 'nsh-srow nsh-srow-on' },
      h('span', { className: 'nsh-dot', style: { background: statusColor(s.status) } }),
      h('input', {
        className: 'nsh-sedit',
        autoFocus: true,
        defaultValue: s.label || s.serverName,
        onFocus: function (e) { e.target.select() },
        onBlur: function (e) { commit(e.target.value) },
        onKeyDown: function (e) {
          e.stopPropagation()
          if (e.key === 'Enter') commit(e.target.value)
          else if (e.key === 'Escape') setEditing(null)
        }
      }))
  }
  return h('div', {
    className: 'nsh-srow' + (on ? ' nsh-srow-on' : '') + (dragOverId === id ? ' nsh-srow-drop' : ''),
    draggable: true,
    title: s.label || s.serverName,
    onClick: function () { store.set({ activeId: id }) },
    onDragStart: function (e) {
      dragId = id
      if (e.dataTransfer) {
        try { e.dataTransfer.setData('text/plain', id) } catch (x) {}
        e.dataTransfer.effectAllowed = 'move'
      }
    },
    onDragOver: function (e) {
      if (dragId === null || dragId === id) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
      if (dragOverId !== id) { dragOverId = id; store.set({ tick: store.st.tick + 1 }) }
    },
    onDragLeave: function () {
      if (dragOverId === id) { dragOverId = null; store.set({ tick: store.st.tick + 1 }) }
    },
    onDrop: function (e) {
      e.preventDefault()
      var from = dragId
      dragId = null
      dragOverId = null
      if (from === null || from === id) { store.set({ tick: store.st.tick + 1 }); return }
      var fi = sessOrder.indexOf(from)
      var ti = sessOrder.indexOf(id)
      if (fi < 0 || ti < 0) { store.set({ tick: store.st.tick + 1 }); return }
      sessOrder.splice(fi, 1)
      sessOrder.splice(sessOrder.indexOf(id), 0, from)
      store.set({ tick: store.st.tick + 1 })
    },
    onDragEnd: function () {
      dragId = null
      if (dragOverId !== null) { dragOverId = null; store.set({ tick: store.st.tick + 1 }) }
    }
  },
    h('span', { className: 'nsh-dot', style: { background: statusColor(s.status) } }),
    h('span', { className: 'nsh-srow-main' }, s.label || s.serverName),
    s.pending ? h('span', { className: 'nsh-badge', style: badgeColor('ask-allow') }, text('pending')) : null,
    h('span', { className: 'nsh-srow-actions' },
      h('button', {
        className: 'nsh-mini-x', title: text('rename'),
        onClick: function (e) { e.stopPropagation(); setEditing(s.label || s.serverName) }
      }, '✎'),
      h('button', {
        className: 'nsh-mini-x',
        title: s.status === 'closed' ? text('remove') : text('disconnectRemove'),
        onClick: function (e) { e.stopPropagation(); removeSession(id) }
      }, '✕')))
}

function sideSessionRows() {
  var rows = []
  for (var i = 0; i < sessOrder.length; i++) {
    if (screens.has(sessOrder[i])) rows.push(React.createElement(SessionRow, { key: sessOrder[i], id: sessOrder[i] }))
  }
  return rows
}

function sideServerRows(st) {
  var local = h('div', { key: 'local-terminal', className: 'nsh-srow', onClick: doLocalConnect, title: newSessionLabel() + ' ' + localTerminalLabel() },
    h('span', { className: 'nsh-dot', style: { background: TK.ok } }),
    h('span', { className: 'nsh-srow-main' }, localTerminalLabel()),
    h('span', { className: 'nsh-meta' }, newSessionLabel()))
  var remote = st.servers.map(function (s) {
    return h('div', { key: s.id, className: 'nsh-srow', onClick: function () { doConnect(s) }, title: s.user + '@' + s.host + ':' + s.port },
      h('span', { className: 'nsh-dot', style: { background: TK.t3 } }),
      h('span', { className: 'nsh-srow-main' }, s.name),
      h('span', { className: 'nsh-meta' }, text('connection')))
  })
  return [local].concat(remote)
}

function NetshellView() {
  var st = useStore()
  React.useEffect(function () { void refreshServers() }, [])
  var ids = []
  for (var oi = 0; oi < sessOrder.length; oi++) {
    if (screens.has(sessOrder[oi])) ids.push(sessOrder[oi])
  }
  var activeId = st.activeId
  if (activeId && ids.indexOf(activeId) < 0) activeId = ids.length ? ids[ids.length - 1] : null
  var sc = activeId ? screens.get(activeId) : null
  var side = h('aside', { className: 'nsh-side' },
    h('div', { className: 'nsh-side-scroll' },
      sideSection(text('sessions'), sideSessionRows(), text('noSessions')),
      sideSection(text('servers'), sideServerRows(st), text('noProfiles'))),
    h('div', { className: 'nsh-side-foot' }, text('archivePath') + termLabel()))
  var main
  if (!sc) {
    main = h('div', { className: 'nsh-empty' },
      st.connectError ? h('div', { style: { color: TK.err } }, text('connectFailed') + st.connectError) : null,
      h('div', { className: 'nsh-muted' }, st.servers.length ? text('selectServer') : (isEnglish() ? text('noProfile') + termLabel() + '.' : text('noProfile') + termLabel() + '」中新增')),
      h(ServerQuickList, null))
  } else {
    main = h('div', { className: 'nsh-session' },
      h(HistoryBar, { sc: sc }),
      sc.hint && sc.status !== 'closed' ? h('div', { className: 'nsh-hintline' }, sc.hint) : null,
      h(PendingBanner, { sc: sc, id: activeId }),
      h(TermView, { sc: sc, id: activeId, key: activeId }),
      sc.status === 'closed' ? h('div', { className: 'nsh-closedline' }, h('span', null, text('closed') + ': ' + (sc.closedReason || text('closed'))), h('button', { className: 'nsh-btn nsh-btn-sm', onClick: function () { removeSession(activeId) } }, text('closeRemove'))) : null)
  }
  return h('div', { className: 'nsh-root', 'data-conversation-composer-overlay': '' },
    h('div', { className: 'nsh-split' }, side, h('section', { className: 'nsh-main' }, main)))
}

function Field(props) {
  return h('label', { className: 'nsh-field' + (props.grow ? ' nsh-field-grow' : '') },
    h('span', { className: 'nsh-lb' }, props.label),
    props.children)
}

function ruleActionColor(action) {
  if (action === 'allow') return { background: TK.ok }
  if (action === 'deny') return { background: TK.err }
  return { background: TK.warn }
}

// 规则匹配语义(host 半区 globToRe/matchRule/evaluateFor 的 UI 呈现):
// 完整命令行通配匹配(* / ?,大小写不敏感,自动剥 sudo/nohup 等前缀),
// 从上到下先命中先生效;服务器规则整体优先于内置规则库。
var RULE_EXAMPLES = [
  { pattern: 'rm -rf /var/log/*', action: 'allow', tipKey: 'exampleAllowTip' },
  { pattern: 'git push --force*', action: 'deny', tipKey: 'exampleDenyTip' },
  { pattern: 'systemctl *', action: 'ask', tipKey: 'exampleAskSystemTip' },
  { pattern: 'docker rm *', action: 'ask', tipKey: 'exampleAskDockerTip' }
]

function ServerEditor(props) {
  var draftState = React.useState(props.draft)
  var draft = draftState[0]
  var setDraft = draftState[1]
  var pwState = React.useState('')
  var password = pwState[0]
  var setPassword = pwState[1]
  var clearPwState = React.useState(false)
  var clearPw = clearPwState[0]
  var setClearPw = clearPwState[1]
  var errState = React.useState(null)
  var err = errState[0]
  var setErr = errState[1]
  var upd = function (patch) {
    var next = {}
    for (var k in draft) next[k] = draft[k]
    for (var p in patch) next[p] = patch[p]
    setDraft(next)
  }
  var save = function () {
    if (!draft.name || !draft.host || !draft.user) { setErr(text('requiredFields')); return }
    var port = parseInt(String(draft.port || '22'), 10)
    if (!(port >= 1 && port <= 65535)) { setErr(text('invalidPort')); return }
    var rl = draft.rules || []
    for (var ri = 0; ri < rl.length; ri++) {
      if (!rl[ri] || !String(rl[ri].pattern || '').replace(/^\s+|\s+$/g, '')) { setErr(text('emptyRule').replace('{n}', String(ri + 1))); return }
    }
    var payload = { server: draft }
    if (password) payload.password = password
    if (clearPw) payload.clearPassword = true
    host.call('netshell.profiles.save', payload)
      .then(function () { return refreshServers() })
      .then(function () { props.onDone() })
      .catch(function (e) { setErr(String((e && e.message) || e)) })
  }
  var ruleRows = (draft.rules || []).map(function (r, i) {
    return h('div', { key: i, className: 'nsh-rrow' },
      h('span', { className: 'nsh-ridx' }, String(i + 1)),
      h('input', {
        className: 'nsh-in',
        style: { flex: '1 1 0', minWidth: 0, fontFamily: 'ui-monospace,Menlo,Consolas,monospace' },
        value: r.pattern,
        placeholder: text('rulePatternPlaceholder'),
        onChange: function (e) {
          var rules = draft.rules.slice()
          rules[i] = { pattern: e.target.value, action: r.action }
          upd({ rules: rules })
        }
      }),
      h('select', {
        className: 'nsh-in',
        style: { flex: 'none', width: 118 },
        value: r.action || 'ask',
        title: text('ruleActionTitle'),
        onChange: function (e) {
          var rules = draft.rules.slice()
          rules[i] = { pattern: r.pattern, action: e.target.value }
          upd({ rules: rules })
        }
      },
        h('option', { value: 'deny' }, text('denyAction')),
        h('option', { value: 'ask' }, text('askAction')),
        h('option', { value: 'allow' }, text('allowAction'))),
      h('button', {
        className: 'nsh-rx', title: text('delete'),
        onClick: function () { var rules = draft.rules.slice(); rules.splice(i, 1); upd({ rules: rules }) }
      }, '✕'))
  })
  var rulesSection = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
    h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' } },
      h('span', { className: 'nsh-lb' }, text('serverRules')),
      h('span', { className: 'nsh-cap' }, text('ruleHint'))),
    h('p', { className: 'nsh-cap', style: { margin: 0 } },
      text('ruleHelp1'),
      text('ruleHelp2')),
    (draft.rules || []).length
      ? h('div', { className: 'nsh-rules' }, ruleRows)
      : h('div', { className: 'nsh-rempty' }, text('noCustomRules')),
    h('div', { className: 'nsh-chips' },
      h('span', { className: 'nsh-cap', style: { flex: 'none' } }, text('ruleExamples')),
      RULE_EXAMPLES.map(function (ex, i) {
        return h('button', {
          key: i,
          className: 'nsh-chip',
          title: text(ex.tipKey),
          onClick: function () {
            var rules = (draft.rules || []).slice()
            rules.push({ pattern: ex.pattern, action: ex.action })
            upd({ rules: rules })
          }
        },
          h('span', { className: 'nsh-chip-pat' }, ex.pattern),
          h('span', { className: 'nsh-chip-act', style: ruleActionColor(ex.action) }, ex.action))
      })),
    h('button', {
      className: 'nsh-btn nsh-btn-sm', style: { alignSelf: 'flex-start' },
      onClick: function () { var rules = (draft.rules || []).slice(); rules.push({ pattern: '', action: 'ask' }); upd({ rules: rules }) }
    }, text('addRule')))
  return h('div', { className: 'nsh-editor' },
    h('div', { className: 'nsh-title2', style: { fontSize: 14 } }, draft.id ? text('editServer') + draft.name : text('newServer')),
    h('div', { className: 'nsh-grid' },
      h(Field, { label: text('name') },
        h('input', { className: 'nsh-in', value: draft.name || '', onChange: function (e) { upd({ name: e.target.value }) }, placeholder: text('newNamePlaceholder') })),
      h(Field, { label: text('host'), grow: true },
        h('input', { className: 'nsh-in', value: draft.host || '', onChange: function (e) { upd({ host: e.target.value }) }, placeholder: text('hostPlaceholder') })),
      h(Field, { label: text('port') },
        h('input', { className: 'nsh-in', value: String(draft.port || 22), onChange: function (e) { upd({ port: e.target.value }) } })),
      h(Field, { label: text('user') },
        h('input', { className: 'nsh-in', value: draft.user || '', onChange: function (e) { upd({ user: e.target.value }) } }))),
    h('div', { className: 'nsh-grid' },
      h(Field, { label: text('auth') },
        h('select', { className: 'nsh-in', value: draft.auth || 'password', onChange: function (e) { upd({ auth: e.target.value }) } },
          h('option', { value: 'password' }, text('password')),
          h('option', { value: 'key' }, text('key')),
          h('option', { value: 'agent' }, text('agent')))),
      draft.auth === 'key'
        ? h(Field, { label: text('keyPath'), grow: true },
          h('input', { className: 'nsh-in', value: draft.keyPath || '', onChange: function (e) { upd({ keyPath: e.target.value }) }, placeholder: '~/.ssh/id_ed25519' }))
        : null,
      h(Field, { label: text('level') },
        h('select', { className: 'nsh-in', value: draft.level || 'guarded', onChange: function (e) { upd({ level: e.target.value }) } },
          h('option', { value: 'open' }, text('open')),
          h('option', { value: 'guarded' }, text('guarded')),
          h('option', { value: 'locked' }, text('locked'))))),
    draft.auth === 'password'
      ? h('div', { className: 'nsh-grid', style: { alignItems: 'flex-end' } },
        h(Field, { label: text('password'), grow: true },
          h('input', { className: 'nsh-in', type: 'password', value: password, onChange: function (e) { setPassword(e.target.value) }, placeholder: draft.hasPassword ? text('passwordKeep') : text('passwordHint') })),
        draft.hasPassword
          ? h('label', { style: { display: 'flex', alignItems: 'center', gap: 5, paddingBottom: 6, fontSize: 12, color: TK.ls } },
            h('input', { type: 'checkbox', checked: clearPw, onChange: function (e) { setClearPw(e.target.checked) } }),
            text('clearPassword'))
          : null)
      : null,
    rulesSection,
    err ? h('p', { className: 'nsh-err' }, err) : null,
    h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8 } },
      h('button', { className: 'nsh-btn nsh-btn-pri', onClick: save }, text('save')),
      h('button', { className: 'nsh-btn', onClick: props.onDone }, text('cancel'))))
}

function SettingsPage(props) {
  var st = useStore()
  React.useEffect(function () { refreshServers() }, [])
  if (st.editing) {
    return h('div', { className: 'nsh-section' },
      h(ServerEditor, { draft: st.editing, onDone: function () { store.set({ editing: null }) } }))
  }
  var rows = st.servers.map(function (s) {
    return h('div', { key: s.id, className: 'nsh-row' },
      h('span', { className: 'nsh-dot', style: { background: s.hasPassword ? TK.ok : TK.t3 }, title: s.hasPassword ? text('passwordConfigured') : text('passwordNotConfigured') }),
      h('div', { className: 'nsh-identity', style: { minWidth: 0 } },
        h('span', { className: 'nsh-name', style: { maxWidth: 140 } }, s.name),
        h('span', { className: 'nsh-pill' }, text(s.level || 'guarded'))),
      h('span', { className: 'nsh-meta', style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' } }, s.user + '@' + s.host + ':' + s.port),
      h('span', { className: 'nsh-actions' },
        h('button', { className: 'nsh-btn nsh-btn-pri nsh-btn-sm', onClick: function () { doConnect(s) } }, text('connection')),
        h('button', { className: 'nsh-btn nsh-btn-sm', onClick: function () { store.set({ editing: s }) } }, text('edit')),
        h('button', {
          className: 'nsh-btn nsh-btn-danger nsh-btn-sm',
          onClick: function () {
            host.call('netshell.profiles.delete', { id: s.id })
              .then(function () { return refreshServers() })
              .catch(function () {})
          }
        }, text('delete'))))
  })
  return h('div', { className: 'nsh-section' },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
      h('h2', { className: 'nsh-title2' }, text('servers')),
      h('span', { style: { flex: 1 } }),
      h('button', { className: 'nsh-btn nsh-btn-pri', onClick: function () { store.set({ editing: { name: '', host: '', port: 22, user: 'root', auth: 'password', level: 'guarded', rules: [] } }) } }, '+ ' + text('newSession'))),
    rows.length === 0
      ? h('div', { style: { border: '1px dashed ' + TK.b3, borderRadius: 12, padding: 20, textAlign: 'center', color: TK.t3, fontSize: 13, lineHeight: '20px' } }, text('noServers'))
      : h('div', { className: 'nsh-rows' }, rows),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
      h('h2', { className: 'nsh-title2', style: { fontSize: 14, marginBottom: 2 } }, text('levels')),
      h('p', { className: 'nsh-cap' }, text('openHelp')),
      h('p', { className: 'nsh-cap' }, text('guardedHelp')),
      h('p', { className: 'nsh-cap' }, text('lockedHelp'))))
}

return {
  inject: ['timer', 'locale'],
  apply: function (ctx) {
    var slots = ctx.get('slots')
    if (slots === undefined) return
    var timer = ctx.timer
    localeService = ctx.locale || ctx.get('locale')
    if (localeService) {
      ctx.effect(function () {
        return localeService.subscribe(function () { store.set({ tick: store.st.tick + 1 }) })
      })
    }
    styles.insert(CSS)
    ctx.effect(function () {
      return timer.interval(function () {
        void discoverSessions()
        var id = store.st.activeId
        if (id) void pollOne(id)
      }, 150)
    })
    void refreshServers()
    slots.inject('conversation.view', function () {
      return slots.register(
        { name: 'conversation.view', id: 'netshell', order: 20, label: tabLabelEl },
        function () { return NetshellView() })
    })
    slots.inject('settings.section', function () {
      return slots.register(
        { name: 'settings.section', id: 'netshell', order: 50, label: settingsNavLabel },
        function (props) { return SettingsPage(props) })
    })
  }
}
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
