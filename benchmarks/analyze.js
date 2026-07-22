const fs = require('fs')
const rows = fs.readFileSync(__dirname + '/api-results2.jsonl', 'utf8')
  .trim().split('\n').map(l => JSON.parse(l))

const med = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

const FENCE = '`' + '`' + '`'
const arms = ['baseline', 'concise', 'capisce']
const stat = (arm, f) => med(rows.filter(r => r.arm === arm).map(f))
const words = s => s.trim().split(/\s+/).length

const F = {
  'tokens':       r => r.output_tokens,
  'words':        r => words(r.answer),
  'nonblank ln':  r => r.answer.split('\n').filter(l => l.trim()).length,
  'md headers':   r => (r.answer.match(/^#{1,6} /gm) || []).length,
  'bold leads':   r => (r.answer.match(/^\s*\*\*[^*]+\*\*/gm) || []).length,
  'bullets':      r => (r.answer.match(/^\s*[-*] /gm) || []).length,
  'numbered':     r => (r.answer.match(/^\s*\d+\. /gm) || []).length,
  'code fences':  r => (r.answer.split(FENCE).length - 1) / 2,
  'words/bullet': r => { const b = (r.answer.match(/^\s*[-*] /gm) || []).length
                         return b ? Math.round(words(r.answer) / b) : 0 },
  'first-para w': r => words(r.answer.split(/\n\s*\n/)[0] || ''),
  'last-para w':  r => { const p = r.answer.trim().split(/\n\s*\n/); return words(p[p.length - 1] || '') },
}

console.log('metric          ' + arms.map(a => a.padStart(10)).join(''))
console.log('-'.repeat(16 + 30))
for (const [k, f] of Object.entries(F))
  console.log(k.padEnd(16) + arms.map(a => String(stat(a, f)).padStart(10)).join(''))

// how long are the scenes.md examples the model is imitating?
const sc = fs.readFileSync('E:/PROJEKTI/capisce/skills/capisce/references/scenes.md', 'utf8')
const quoted = sc.split(/\n(?!\s*>)/).filter(b => b.trim().startsWith('>'))
  .map(b => words(b.replace(/^\s*>\s?/gm, '')))
console.log('\nscenes.md quoted examples: n=' + quoted.length +
            '  median words=' + med(quoted) + '  max=' + Math.max(...quoted))
console.log('capisce actual answers   : median words=' + stat('capisce', r => words(r.answer)))
