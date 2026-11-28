// 客户端语言解析(copyLang)回归测试:locale 标签 → COPY 词典。
// 只从源码里抽出 COPY_LANGS + copyLang,不加载整份客户端半区。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'src/nsh-client.js'), 'utf8')
const start = source.indexOf('var COPY_LANGS')
const end = source.indexOf('var COPY = {')
if (start < 0 || end < 0) throw new Error('无法在 src/nsh-client.js 中定位 COPY_LANGS / COPY')
const makeCopyLang = new Function(
  'localeService',
  source.slice(start, end) + '\nreturn copyLang',
)

let failed = 0
function check(name, actual, expected) {
  if (actual === expected) {
    console.log('ok ' + name)
    return
  }
  failed += 1
  console.log('FAIL ' + name + ': 期望 ' + expected + ',实际 ' + actual)
}

const locales = [
  ['zh', 'zh'], ['zh-CN', 'zh'], ['zh-Hant', 'zh'], ['zh_CN', 'zh'], ['ZH-cn', 'zh'],
  ['ru', 'ru'], ['ru-RU', 'ru'], ['RU', 'ru'],
  ['ja', 'ja'], ['ja-JP', 'ja'],
  ['ko', 'ko'], ['ko-KR', 'ko'],
  ['de', 'de'], ['de-DE', 'de'],
  ['fr', 'fr'], ['fr-FR', 'fr'],
  ['es', 'es'], ['es-419', 'es'],
  ['en', 'en'], ['en-US', 'en'], ['pt-BR', 'en'],
  // 3 字母语言码不能按 2 字母前缀误判成 ru
  ['run', 'en'], ['rup', 'en'],
  ['', 'en'], ['  ', 'en'],
]
for (const [active, expected] of locales) {
  const copyLang = makeCopyLang({ getLocale: () => ({ active }) })
  check('locale ' + JSON.stringify(active), copyLang(), expected)
}

check('localeService 为 null', makeCopyLang(null)(), 'en')
check('localeService 无 getLocale', makeCopyLang({})(), 'en')
check('getLocale 返回 undefined', makeCopyLang({ getLocale: () => undefined })(), 'en')
check('active 不是字符串', makeCopyLang({ getLocale: () => ({ active: 42 }) })(), 'en')

if (failed > 0) {
  console.log('LOCALE-FAILED: ' + failed + ' 项')
  process.exit(1)
}
console.log('LOCALE-OK: ' + (locales.length + 4) + ' 项断言通过')