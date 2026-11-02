#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'src/nsh-client.js'), 'utf8')
const start = source.indexOf('function applySgr')
const end = source.indexOf('function newScreen')
if (start < 0 || end < 0 || end <= start) throw new Error('terminal renderer source boundary not found')
const renderFns = new Function(source.slice(start, end) + '\nreturn { lineSpans, stuckToBottom, readTermScroll, saveTermScroll, dropTermScroll, decideTermRestore };')()
const ok = (condition, label) => {
  if (!condition) throw new Error('FAIL: ' + label)
  console.log('ok', label)
}

ok(source.includes(".nsh-cursor{display:inline-block") && source.includes("background:var(--nsh-cursor)"), 'cursor uses a full-cell block style')
ok(source.includes("curStyle.backgroundColor = 'var(--nsh-cursor)'"), 'cursor highlights the character cell instead of inserting a glyph')

let parsed = renderFns.lineSpans('abc\u001b[3C')
ok(parsed.col === 6, 'cursor column advances across CSI C')
ok(parsed.spans.map((x) => x.t).join('') === 'abc   ', 'trailing cursor space is preserved')

parsed = renderFns.lineSpans('abc\u001b[2D\u001b[C')
ok(parsed.col === 2, 'cursor column follows left/right movement')
ok(parsed.spans.map((x) => x.t).join('') === 'abc', 'existing text remains aligned after movement')

parsed = renderFns.lineSpans('a\u001b[3Cx')
ok(parsed.col === 5, 'writing after a cursor gap advances from the absolute column')
ok(parsed.spans.map((x) => x.t).join('') === 'a   x', 'middle cursor gap is rendered as spaces')

parsed = renderFns.lineSpans('ab\u001b[D\u001b[@x')
ok(parsed.spans.map((x) => x.t).join('') === 'axb', 'CSI @ inserts a blank at the cursor before overwrite')
parsed = renderFns.lineSpans('abc\u001b[2D\u001b[X')
ok(parsed.spans.map((x) => x.t).join('') === 'a c', 'CSI X erases characters without shifting the line')
parsed = renderFns.lineSpans('PS> lls\u001b[2D\u001b[P\u001b[C')
ok(parsed.spans.map((x) => x.t).join('').trimEnd() === 'PS> ls' && parsed.col === 6, 'cursor delete redraw removes a stale duplicated character')

ok(source.includes('onScroll: onScroll') && source.includes('saveTermScroll(id, stickRef.current, node.scrollTop, sc.contentRev)'), 'terminal view records the manual position together with the output revision')
ok(source.includes('var termScroll = new Map()') && source.includes('pendingRestoreRef'), 'terminal scroll memory survives conversation/tab switches')
ok(source.includes('sc.contentRev = (r.dropped || 0) + (r.output ? r.output.length : 0)') && source.includes('sc.pollCount = (sc.pollCount || 0) + 1'), 'polling exposes a monotonic output revision and poll counter')
ok(renderFns.decideTermRestore({ rev: 100, poll: 5 }, 150, 5) === 'bottom', 'output that arrived while hidden forces the view to the newest line')
ok(renderFns.decideTermRestore({ rev: 100, poll: 5 }, 100, 6) === 'restore', 'an unchanged session restores the user position after a fresh poll')
ok(renderFns.decideTermRestore({ rev: 100, poll: 5 }, 100, 5) === 'wait', 'the view waits for a post-mount snapshot before deciding')
ok(renderFns.decideTermRestore(null, 999, 99) === 'none', 'a pinned-to-bottom session needs no restore decision')
ok(renderFns.stuckToBottom({ scrollHeight: 1000, scrollTop: 600, clientHeight: 400 }) === true, 'a terminal scrolled to the live line counts as stuck to bottom')
ok(renderFns.stuckToBottom({ scrollHeight: 1000, scrollTop: 570, clientHeight: 400 }) === true, 'the near-bottom threshold still counts as stuck to bottom')
ok(renderFns.stuckToBottom({ scrollHeight: 1000, scrollTop: 400, clientHeight: 400 }) === false, 'a terminal scrolled up to history is not treated as stuck to bottom')
ok(renderFns.stuckToBottom({ scrollHeight: 1000, scrollTop: 0, clientHeight: 400 }) === false, 'a freshly opened terminal at the top offsets its distance to bottom')
ok(renderFns.stuckToBottom({ scrollHeight: 300, scrollTop: 0, clientHeight: 400 }) === true, 'content shorter than the viewport is always at the live line')

ok(renderFns.readTermScroll('unknown-session').stick === true, 'an unseen terminal session defaults to following the live line')
renderFns.saveTermScroll('s1', false, 420, 1234)
ok(renderFns.readTermScroll('s1').stick === false && renderFns.readTermScroll('s1').top === 420, 'a manual scroll position is restored verbatim')
ok(renderFns.readTermScroll('s1').rev === 1234, 'the remembered position keeps the output revision it was taken at')
ok(renderFns.readTermScroll('s1').rev < 9999, 'a later, larger output revision is detectable as new content')
renderFns.saveTermScroll('s1', true, 999, 9999)
ok(renderFns.readTermScroll('s1').stick === true, 'returning to the live line clears the manual-offset mode')
renderFns.dropTermScroll('s1')
ok(renderFns.readTermScroll('s1').stick === true && renderFns.readTermScroll('s1').top === 0 && renderFns.readTermScroll('s1').rev === 0, 'removing a session drops its remembered scroll position')

console.log('TERMINAL-RENDER-OK')
