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

const EVENT = process.argv[2] || 'UserPromptSubmit'
const STATE = path.join(
  process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
  '.capisce-active')
const TICK = STATE + '-tick'   // per-turn tool-call counter, drives mid-turn re-injection

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

let input = ''
process.stdin.on('data', c => { input += c })
process.stdin.on('end', () => {
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
