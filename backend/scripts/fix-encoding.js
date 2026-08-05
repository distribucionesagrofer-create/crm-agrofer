const fs   = require('fs')
const path = require('path')

function fixFile(filePath) {
  let c = fs.readFileSync(filePath, 'utf8')
  const orig = c
  c = c
    .replace(/Ã³/g, 'ó')   // ó
    .replace(/Ã¡/g, 'á')   // á
    .replace(/Ã©/g, 'é')   // é
    .replace(/Ã­/g, 'í')   // í
    .replace(/Ãº/g, 'ú')   // ú
    .replace(/Ã±/g, 'ñ')   // ñ
    .replace(/Ã"/, 'Ó')    // Ó
    .replace(/Ã‰/g, 'É')   // É
    .replace(/Ãš/g, 'Ú')   // Ú
    .replace(/Â¿/g, '¿')   // ¿
    .replace(/Â¡/g, '¡')   // ¡
    .replace(/Â·/g, '·')   // ·
    .replace(/â€"/g, '—')  // — em dash
    .replace(/â€¦/g, '…')  // …
    .replace(/â"€/g, '─')  // ─
    .replace(/âœ"/g, '✓')  // ✓
    .replace(/âœ…/g, '✅')  // ✅
    .replace(/âŒ/g, '❌')   // ❌
    .replace(/âœ¨/g, '✨')  // ✨

  if (c !== orig) { fs.writeFileSync(filePath, c, 'utf8'); return true }
  return false
}

function walk(dir) {
  const out = []
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f)
    if (fs.statSync(full).isDirectory()) {
      if (!['node_modules','.git','dist'].includes(f)) out.push(...walk(full))
    } else if (f.endsWith('.jsx') || f.endsWith('.js')) out.push(full)
  }
  return out
}

const src = path.join(__dirname, '../../frontend/src')
let n = 0
for (const f of walk(src)) {
  if (fixFile(f)) { console.log('Fixed:', path.basename(f)); n++ }
}
console.log('Total fixed:', n)
