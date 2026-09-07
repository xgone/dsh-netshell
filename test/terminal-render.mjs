#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'src/nsh-client.js'), 'utf8')
const start = source.indexOf('function applySgr')
const end = source.indexOf('function newScreen')
if (start < 0 || end < 0 || end <= start) throw new Error('terminal renderer source boundary not found')
const renderFns = new Function(source.slice(start, end) + '\nreturn { lineSpans };')()
const ok = (condition, label) => {
  if (!condition) throw new Error('FAIL: ' + label)
  console.log('ok', label)
}

ok(source.includes(".nsh-cursor{display:inline-block") && source.includes("background:var(--nsh-cursor)"), 'cursor uses a full-cell block style')

let parsed = renderFns.lineSpans('abc\u001b[3C')
ok(parsed.col === 6, 'cursor column advances across CSI C')
ok(parsed.spans.map((x) => x.t).join('') === 'abc   ', 'trailing cursor space is preserved')

parsed = renderFns.lineSpans('abc\u001b[2D\u001b[C')
ok(parsed.col === 2, 'cursor column follows left/right movement')
ok(parsed.spans.map((x) => x.t).join('') === 'abc', 'existing text remains aligned after movement')

parsed = renderFns.lineSpans('a\u001b[3Cx')
ok(parsed.col === 5, 'writing after a cursor gap advances from the absolute column')
ok(parsed.spans.map((x) => x.t).join('') === 'a   x', 'middle cursor gap is rendered as spaces')

console.log('TERMINAL-RENDER-OK')
