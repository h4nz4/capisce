const fs = require('fs')
const { encode } = require('gpt-tokenizer')
const rows = fs.readFileSync(__dirname + '/api-results2.jsonl', 'utf8')
  .trim().split('\n').map(l => JSON.parse(l))

const med = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

const arms = ['baseline', 'concise', 'capisce']
console.log('arm         reported  answer_tok  UNSEEN  words   tok/word(ans)')
console.log('-'.repeat(64))
const out = {}
for (const a of arms) {
  const rs = rows.filter(r => r.arm === a)
  const rep = med(rs.map(r => r.output_tokens))
  const ans = med(rs.map(r => encode(r.answer).length))
  const wrd = med(rs.map(r => r.answer.trim().split(/\s+/).length))
  out[a] = { rep, ans, wrd }
  console.log(
    a.padEnd(12) + String(rep).padStart(8) + String(ans).padStart(12) +
    String(rep - ans).padStart(8) + String(wrd).padStart(7) +
    (ans / wrd).toFixed(2).padStart(15))
}

console.log('\n== VISIBLE OUTPUT ONLY (what the user actually reads) ==')
const b = out.baseline
for (const a of arms) {
  const d = (out[a].ans / b.ans - 1) * 100
  console.log(`${a.padEnd(12)} ${String(out[a].ans).padStart(5)} tok   ${d > 0 ? '+' : ''}${d.toFixed(1)}% vs baseline`)
}

console.log('\n== per-task visible answer tokens ==')
const tasks = [...new Set(rows.map(r => r.task))]
console.log('task      ' + arms.map(a => a.padStart(10)).join(''))
for (const t of tasks) {
  console.log(t.padEnd(10) + arms.map(a =>
    String(med(rows.filter(r => r.task === t && r.arm === a).map(r => encode(r.answer).length))).padStart(10)).join(''))
}
