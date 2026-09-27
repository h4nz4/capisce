// Self-check for hooks/capisce.js activation logic. Run: node hooks/capisce.test.js
const { execFileSync } = require('child_process')
const assert = require('assert')
const fs = require('fs'), os = require('os'), path = require('path')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capisce-'))
const cfg = path.join(tmp, 'cfg'), proj = path.join(tmp, 'proj')
fs.mkdirSync(path.join(proj, '.claude'), { recursive: true }); fs.mkdirSync(cfg)
const hook = (event, payload) => execFileSync('node', [path.join(__dirname, 'capisce.js'), event],
  { input: JSON.stringify({ cwd: proj, ...payload }), env: { ...process.env, CLAUDE_CONFIG_DIR: cfg } }).toString()
const settings = (file, style) => fs.writeFileSync(file, JSON.stringify({ outputStyle: style }))

try {
  const dry = { last_assistant_message: 'The state file is global, so every session shares it.' }
  const stop = (sid, extra = {}) => hook('Stop', { session_id: sid, ...dry, ...extra })

  assert.strictEqual(hook('UserPromptSubmit', { session_id: 's1', prompt: 'hi' }), '', 'off by default')
  assert.strictEqual(stop('s1'), '', 'no enforcement when off')
  assert.match(hook('UserPromptSubmit', { session_id: 's1', prompt: '/capisce:capisce ultra' }), /level ultra/)
  assert.match(stop('s1'), /"decision":"block"/, 'dry reply gets sent back')
  assert.strictEqual(stop('s1', { last_assistant_message: 'State file is global, son of a bitch.' }), '', 'a swear passes')
  assert.strictEqual(stop('s1', { stop_hook_active: true }), '', 'never loops')
  // floor: one real swear per 60 words of prose (min 1); 120 filler + tail = 2 needed
  const long = 'word '.repeat(120)
  const r = stop('s1', { last_assistant_message: long + 'fuckin\' thing, like a toll booth' })
  assert.match(r, /carried 1 real swear where 2 was the floor\./, 'density floor on long replies')
  assert.match(r, /carrying at least 1 real swear /, 'kicker asks for exactly the missing count')
  assert.match(stop('s1', { last_assistant_message: 'word '.repeat(300) + 'fuckin\' thing, like a toll booth' }), /carrying at least 4 real swears/, 'bigger gap, bigger ask')
  assert.strictEqual(stop('s1', { last_assistant_message: long + 'fuckin\' bullshit, like a toll booth' }), '', 'two swears + a joke clear 125 words')
  assert.match(stop('s1', { last_assistant_message: long + 'fuckin\' bullshit' }), /without a joke/, 'long reply with no joke gets a kicker')
  // the serious skip covers the whole category, not just DROP TABLE
  for (const msg of [
    'Push it with `git push --force-with-lease origin main` once everyone has re-cloned.',
    'Do not delete /var/lib/postgresql/data — that is your database; it would be data loss.',
    'That Stripe live key is exposed in a public repo. Rotate the Stripe secret key now, then purge history.',
    'Run `terraform destroy` only against the staging workspace.',
    'This wipes all rows in the table.',
    'Use `git reset --hard origin/main` to throw away local commits.',
    'No. That directory is the whole database: deleting it destroys all of it, and the only way back is a restore from backup.',
  ]) assert.strictEqual(stop('s1', { last_assistant_message: msg }), '', 'serious: ' + msg)
  assert.match(stop('s1', { last_assistant_message: 'Latency dropped and tests pass; if p99 regresses, just roll it back and look at the cache hit rate again.' }),
    /"decision":"block"/, '"roll it back" is not a credential rotation')
  // the serious skip reads code too: DROP TABLE replies often keep their risk words in code
  assert.strictEqual(stop('s1', { last_assistant_message: 'Here it is:\n```sql\nDROP TABLE users;\n```\nCheck the backup first.' }), '', 'destructive statement only in a code block still skips')
  // swears are counted in prose only
  assert.match(stop('s1', { last_assistant_message: 'The list is `fuck, shit, bullshit` in QUOTA and it gets injected on every prompt, straight into the context.' }), /carried 0 real swears/, 'swears quoted in code do not count')
  assert.strictEqual(stop('s1', { last_assistant_message: 'Valid JSON, five evals, son of a bitch parses fine.' }), '', 'short replies need no joke')
  assert.strictEqual(stop('s1', { last_assistant_message: 'Before you run it: `DROP TABLE users;` can\'t be undone. Take a backup first.' }), '', 'destructive-op replies are never sent back')
  assert.strictEqual(stop('s1', { last_assistant_message: 'That key is leaked (key in git history). Rotate the key now.' }), '', 'security replies are never sent back')
  assert.strictEqual(stop('s2'), '', '/capisce must not leak into other sessions')
  assert.strictEqual(hook('UserPromptSubmit', { session_id: 's1', prompt: 'knock it off' }), 'CAPISCE MODE OFF')
  assert.strictEqual(stop('s1'), '', 'off after knock it off')
  hook('UserPromptSubmit', { session_id: 's4', prompt: '/capisce lite' })
  assert.strictEqual(stop('s4'), '', 'lite is not enforced')

  settings(path.join(cfg, 'settings.json'), 'capisce:Capisce')
  assert.match(stop('s3'), /"decision":"block"/, 'user-level style')
  settings(path.join(proj, '.claude', 'settings.local.json'), 'Concise')
  assert.strictEqual(stop('s3'), '', 'local settings override user settings')
  settings(path.join(proj, '.claude', 'settings.json'), 'capisce:Capisce')
  assert.strictEqual(stop('s3'), '', 'local beats project too')
  fs.unlinkSync(path.join(proj, '.claude', 'settings.local.json'))
  assert.match(hook('UserPromptSubmit', { session_id: 's3', prompt: 'go' }), /CAPISCE ACTIVE — level full/, 'project-level style')

  // S4a: joke FORM rotates in sequence per session, and kickers the model actually wrote
  // (captured on the stop_hook_active echo) get passed back as a "don't reuse" list.
  hook('UserPromptSubmit', { session_id: 's5', prompt: '/capisce full' })
  assert.match(stop('s5'), /shaped as a specific physical comparison/, 'first kick uses form 0 (comparison)')
  assert.strictEqual(
    stop('s5', { stop_hook_active: true, last_assistant_message: 'This bug is like a leaky faucet, fuckin\' drip after drip.' }),
    '', 'capturing the kicker echo never blocks')
  const r2 = stop('s5')
  assert.match(r2, /shaped as a Godfather-or-wiseguy beat/, 'second kick rotates to form 1')
  assert.match(r2, /Don't reuse these lines or their images: \\?"This bug is like a leaky faucet/, 'previous kicker remembered and passed as avoid list')
  assert.match(stop('s5'), /shaped as a git-blame shot/, 'third kick rotates to form 2')
  assert.match(stop('s5'), /shaped as a deadpan understatement/, 'fourth kick rotates to form 3')
  assert.match(stop('s5'), /shaped as a specific physical comparison/, 'fifth kick wraps back to form 0')

  // level from the style name: "Capisce Lite" runs lite (no Stop enforcement), others full
  settings(path.join(proj, '.claude', 'settings.json'), 'capisce:Capisce Lite')
  assert.match(hook('UserPromptSubmit', { session_id: 's7', prompt: 'go' }), /level lite[\s\S]*voice lives ONLY in the status/, 'Lite style maps to lite')
  assert.strictEqual(stop('s7'), '', 'lite style is not Stop-enforced')
  settings(path.join(proj, '.claude', 'settings.json'), 'capisce:Capisce')
  assert.match(hook('UserPromptSubmit', { session_id: 's8', prompt: 'go' }), /level full[\s\S]*one per 60 words/, 'plain style maps to full')
  fs.unlinkSync(path.join(proj, '.claude', 'settings.json'))

  hook('UserPromptSubmit', { session_id: 's6', prompt: '/capisce full' })
  const r6 = stop('s6')
  assert.match(r6, /shaped as a specific physical comparison/, 'a fresh session starts its own rotation at form 0')
  assert.ok(!/Don't reuse/.test(r6), 'a fresh session has no kicker history to avoid yet')
  console.log('ok')
} finally { fs.rmSync(tmp, { recursive: true, force: true }) }
