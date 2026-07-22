const fs = require('fs')
const { encode } = require('gpt-tokenizer')

const raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const runs = (raw.result && raw.result.runs) || raw.runs
if (!runs) { console.error('no runs found; top keys:', Object.keys(raw)); process.exit(1) }

const med = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

for (const r of runs) {
  r.tok = encode(r.answer).length
  r.chars = r.answer.length
  r.words = r.answer.trim().split(/\s+/).length
}

const tasks = [...new Set(runs.map(r => r.task))]
const pick = (t, a) => runs.filter(r => r.task === t && r.arm === a)

console.log('\n== PER-TASK MEDIAN OUTPUT TOKENS ==\n')
console.log('task      | baseline | capisce | delta   | ratio')
console.log('----------|----------|---------|---------|------')
const ratios = []
for (const t of tasks) {
  const b = med(pick(t, 'baseline').map(r => r.tok))
  const c = med(pick(t, 'capisce').map(r => r.tok))
  const d = c - b, ratio = c / b
  ratios.push(ratio)
  console.log(
    `${t.padEnd(9)} | ${String(b).padStart(8)} | ${String(c).padStart(7)} | ` +
    `${(d > 0 ? '+' : '') + d}`.padStart(7) + ` | ${(ratio * 100).toFixed(0)}%`)
}

const allB = runs.filter(r => r.arm === 'baseline')
const allC = runs.filter(r => r.arm === 'capisce')
const mb = med(allB.map(r => r.tok)), mc = med(allC.map(r => r.tok))

console.log('\n== OVERALL ==\n')
console.log(`n                 : ${allB.length} baseline / ${allC.length} capisce`)
console.log(`median tokens     : ${mb} -> ${mc}   (${((mc / mb - 1) * 100).toFixed(1)}%)`)
console.log(`mean tokens       : ${(allB.reduce((s,r)=>s+r.tok,0)/allB.length).toFixed(0)} -> ${(allC.reduce((s,r)=>s+r.tok,0)/allC.length).toFixed(0)}`)
console.log(`median words      : ${med(allB.map(r=>r.words))} -> ${med(allC.map(r=>r.words))}`)
console.log(`median chars      : ${med(allB.map(r=>r.chars))} -> ${med(allC.map(r=>r.chars))}`)
console.log(`chars per token   : ${(med(allB.map(r=>r.chars/r.tok))).toFixed(2)} -> ${(med(allC.map(r=>r.chars/r.tok))).toFixed(2)}   <- dialect tax`)
console.log(`median task ratio : ${(med(ratios) * 100).toFixed(0)}%`)
console.log(`tasks compressed  : ${ratios.filter(r => r < 1).length} / ${ratios.length}`)

console.log('\n== SPREAD (per-run tokens) ==\n')
for (const t of tasks) {
  console.log(`${t.padEnd(9)} base [${pick(t,'baseline').map(r=>r.tok).join(', ')}]  cap [${pick(t,'capisce').map(r=>r.tok).join(', ')}]`)
}
