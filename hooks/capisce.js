#!/usr/bin/env node
// capisce — keeps the register alive across a long session.
//
// A skill invoked once by a slash command decays: thirty turns of dense technical work
// and the voice is gone. Rules inside SKILL.md can't fix that, because nothing re-reads
// SKILL.md. So we re-inject a short reminder every turn while the mode is on.
//
// Usage: node capisce.js <SessionStart|UserPromptSubmit>

const fs = require('fs')
const os = require('os')
const path = require('path')
const { exec } = require('child_process')

const EVENT = process.argv[2] || 'UserPromptSubmit'
const STATE = path.join(
  process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
  '.capisce-active')
const TICK = STATE + '-tick'   // per-turn tool-call counter, drives mid-turn re-injection
const INNER = path.join(path.dirname(STATE), '.capisce-statusline-inner')  // wrapped status line command, if any

const LEVELS = ['lite', 'full', 'ultra']
const DEFAULT = 'full'
const EVERY = 3   // ponytail: re-inject the register every 3rd tool call; raise if it's noisy

const read = () => { try { return fs.readFileSync(STATE, 'utf8').trim() } catch { return null } }
const write = m => { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, m) }
const clear = () => { try { fs.unlinkSync(STATE) } catch {} }

// Short on purpose. The full rulebook is ~9k tokens; this is the drift antidote, not a
// reload. Everything here is a rule the model demonstrably loses first.
function reminder (level) {
  const dial = {
    lite:  'Voice on the status line, rest is plain prose.',
    full:  'Idioms where a real guy drops them.',
    ultra: 'Max density per sentence — same length, thicker voice.',
  }[level] || 'Idioms where a real guy drops them.'
  return [
    `CAPISCE MODE ACTIVE — level: ${level}. You are Big Tony.`,
    dial,
    'Stay in register THIS reply. Long technical stretches — benchmarks, tables, tool',
    'output, debugging — are where the voice slips. Reporting a number is NOT a reason',
    'to go corporate; only security warnings and irreversible operations switch it off.',
    '- Swear at least once, every reply — at the code, the vendor, the git blame ghost. Never at the user.',
    '- One joke minimum — unless the honest answer is under three lines.',
    '- Facts, code, paths, error strings byte-for-byte. Commits/PRs/docs stay clean.',
    '- No markdown headers. Talk to the guy, do not file a report.',
  ].join('\n')
}

// Fires mid-turn, after tool calls, so it must be short — this is the exact stretch where
// the voice goes corporate and the SessionStart/UserPromptSubmit reminder is buried far back.
function nudge (level) {
  return [
    `CAPISCE still on — level ${level}. You're mid-turn, fresh off a tool call.`,
    'This is the stretch where Big Tony turns into a status report. Do not.',
    'The next prose you write stays in register: swear at least once at the code not the user,',
    'one joke, facts and error strings byte-for-byte. Commits/PRs/docs stay clean.',
  ].join('\n')
}

// ── status line ──────────────────────────────────────────────────────────────
// `node capisce.js statusline` renders the Claude Code status line. It stamps a
// badge in front of whatever status line the user already had (read from INNER),
// and stays invisible when the mode is off. Deterministic, so it never drifts.

const badgeFor = level => `🚬 capisce ${level === 'ultra' ? 'ULTRA' : level}`
const readInner = () => { try { return fs.readFileSync(INNER, 'utf8').trim() || null } catch { return null } }

// Branch without spawning git: parse .git/HEAD, walking up from cwd.
// ponytail: 30-level cap; .git-as-file (worktrees/submodules) yields no branch. Good enough for a status bar.
function gitBranch (startDir) {
  let dir = startDir
  for (let i = 0; i < 30 && dir; i++) {
    try {
      const m = fs.readFileSync(path.join(dir, '.git', 'HEAD'), 'utf8').match(/ref: refs\/heads\/(.+)/)
      return m ? m[1].trim() : null
    } catch {}
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

// Write our answer and exit hard. A wrapped command can spawn grandchildren (a shell
// launching `ping`, etc.) that hold the stdout pipe open past our timeout; exec's callback
// waits for that pipe to close, so node would linger and the status line would stall. Once
// we know what to print, we're done — exit and let any orphan die on its own.
const emit = s => process.stdout.write(s || '', () => process.exit(0))

// Exec the wrapped command with the same stdin forwarded and a hard 1s wall-clock cap.
// The manual timer is the real guarantee: exec's own `timeout` kills the shell but its
// callback still waits on grandchild pipes, so we don't rely on it alone.
// Any failure — non-zero, error, timeout, empty — resolves to null so we fall back to badge-only.
// ponytail: one process spawn per render; the status line re-renders often but Claude Code coalesces it.
function runInner (cmd, stdinData, cb) {
  let done = false, child
  const finish = out => { if (!done) { done = true; cb(out) } }
  const timer = setTimeout(() => { try { child && child.kill() } catch {} finish(null) }, 1000)
  try {
    child = exec(cmd, { timeout: 1000, windowsHide: true }, (err, stdout) => {
      clearTimeout(timer)
      finish(err ? null : ((stdout || '').replace(/\r?\n$/, '') || null))
    })
    child.stdin.on('error', () => {})   // inner command may not read stdin — swallow EPIPE
    child.stdin.write(stdinData)
    child.stdin.end()
  } catch { clearTimeout(timer); finish(null) }
}

function statusline (raw) {
  const level = read()                                   // level word, or null when off
  const badge = level ? badgeFor(level) : ''
  let ctx = {}
  try { ctx = JSON.parse(raw.replace(/^﻿/, '')) } catch {}
  const inner = readInner()

  if (inner) {
    return runInner(inner, raw, out => {
      if (out == null) return emit(badge)                 // fail-safe: badge-only (empty if off)
      emit(badge ? `${badge} · ${out}` : out)            // on: prepend; off: untouched
    })
  }

  if (!level) return                                     // off, nothing to wrap — emit nothing
  const cwd = (ctx.workspace && ctx.workspace.current_dir) || ctx.cwd
  const model = ctx.model && (ctx.model.display_name || ctx.model.id)
  const parts = [badge, gitBranch(cwd), model, cwd && path.basename(cwd)].filter(Boolean)
  emit(parts.join(' · '))
}

let input = ''
process.stdin.on('data', c => { input += c })
process.stdin.on('end', () => {
  if (EVENT === 'statusline') return statusline(input)

  let prompt = ''
  try { prompt = (JSON.parse(input.replace(/^﻿/, '')).prompt || '').trim().toLowerCase() } catch {}

  if (EVENT === 'UserPromptSubmit') {
    // /capisce, /capisce:capisce, @capisce ... optionally with a level
    const m = prompt.match(/^[/@$](?:capisce:)?capisce\b\s*(\w+)?/)
    if (m) {
      const arg = m[1]
      if (arg === 'off') { clear(); return process.stdout.write('CAPISCE MODE OFF') }
      write(LEVELS.includes(arg) ? arg : DEFAULT)
    } else if (/^(normal mode|knock it off|stop capisce|talk to me straight,? no bit)\b/.test(prompt)) {
      clear()
      return process.stdout.write('CAPISCE MODE OFF')
    }
  }

  // PostToolUse: re-inject a short nudge during long tool stretches — the exact place the
  // voice slips. Throttled by a per-turn counter so it doesn't tax every single call.
  if (EVENT === 'PostToolUse') {
    const level = read()
    if (!level) return                     // not active — emit nothing, cost nothing
    let n = 0
    try { n = (parseInt(fs.readFileSync(TICK, 'utf8'), 10) || 0) } catch {}
    n++
    try { fs.writeFileSync(TICK, String(n)) } catch {}
    if (n % EVERY !== 0) return             // only every EVERY-th call earns a nudge
    return process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: nudge(level) },
    }))
  }

  const level = read()
  if (!level) return                       // not active — emit nothing, cost nothing
  try { fs.writeFileSync(TICK, '0') } catch {}   // fresh turn — reset the stretch counter
  process.stdout.write(reminder(level))
})
