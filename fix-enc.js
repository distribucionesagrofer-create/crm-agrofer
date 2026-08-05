const fs = require('fs')
const path = require('path')

// Each pair: [garbled_regex_source, correct_unicode_codepoint]
const FIXES = [
  ['Ã³', 'ó'],  // ó
  ['Ã¡', 'á'],  // á
  ['Ã©', 'é'],  // é
  ['Ã\xad', 'í'],  // í
  ['Ã\xba', 'ú'],  // ú
  ['Ã\xb1', 'ñ'],  // ñ
  ['Ã‰', 'É'],  // É
  ['Ã\x8a', 'Ú'],  // Ú
  ['Â¿', '¿'],  // ¿
  ['Â¡', '¡'],  // ¡
  ['Â·', '·'],  // ·
  ['â\x80\x94', '—'],  // — em dash
  ['â\x80\xa6', '…'],  // … ellipsis
  ['â\x94\x80', '─'],  // ─
  ['â\x9c\x93', '✓'],  // ✓
  ['â\x9c\x85', '✅'],  // ✅
  ['â\x9c\x8c', '❌'],  // ❌
  ['â\x9c\xa8', '✨'],  // ✨
]

function fix(content) {
  for (const [garbled, correct] of FIXES) {
    // Split/join is safer than regex for arbitrary strings
    while (content.includes(garbled)) {
      content = content.split(garbled).join(correct)
    }
  }
  return content
}

function walk(dir, acc = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    const stat = fs.statSync(p)
    if (stat.isDirectory() && !['node_modules','dist','.git'].includes(f)) {
      walk(p, acc)
    } else if (f.endsWith('.jsx') || f.endsWith('.js')) {
      acc.push(p)
    }
  }
  return acc
}

const SRC = path.join(__dirname, 'frontend', 'src')
let n = 0
for (const f of walk(SRC)) {
  const orig = fs.readFileSync(f, 'utf8')
  const fixed = fix(orig)
  if (fixed !== orig) {
    fs.writeFileSync(f, fixed, 'utf8')
    n++
    console.log('Fixed:', path.basename(f))
  }
}
console.log('\nDone:', n, 'files fixed')
