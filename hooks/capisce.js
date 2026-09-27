#!/usr/bin/env node
// capisce — keeps the register alive through long technical stretches.
//
// Prompt rules plateau: A/B runs showed ~1 swear per reply and half the long, tool-heavy
// replies with none, whatever the wording. Mid-turn PostToolUse nudges measured no gain.
// So: a reminder on every prompt, and a Stop check — if the finished reply has no real
// swear, send it back once for a one-line in-voice kicker.
//
// Active when either:
//   - the output style is capisce (settings.local > project settings > user settings) — a
//     style named "... Lite" runs at lite, any other capisce style at full, or
//   - /capisce was run in THIS session (per-session flag; never leaks to other sessions).
//
// Usage: node capisce.js <UserPromptSubmit|Stop>

const fs = require('fs')
const os = require('os')
const path = require('path')

const EVENT = process.argv[2] || 'UserPromptSubmit'
const CONFIG = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
const LEVELS = ['lite', 'full', 'ultra']

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')) } catch { return null } }

// ponytail: no "Capisce Ultra" style ships — tested, the per-sentence pressure cost accuracy.
// Ultra stays a /capisce level; add a style here only after it passes the correctness gate.
function styleLevel (cwd) {
  for (const f of [path.join(cwd, '.claude', 'settings.local.json'),
                   path.join(cwd, '.claude', 'settings.json'),
                   path.join(CONFIG, 'settings.json')]) {
    const s = readJson(f)
    if (s && typeof s.outputStyle === 'string') {
      if (!/capisce/i.test(s.outputStyle)) return null
      return /lite/i.test(s.outputStyle) ? 'lite' : 'full'
    }
  }
  return null
}

// ponytail: one tiny flag file per session that ran /capisce; never cleaned up. Add a
// SessionEnd sweep if the directory ever gets noticeably big.
const flagFile = sid => path.join(CONFIG, 'capisce-sessions', String(sid).replace(/[^\w-]/g, ''))
const readFlag = sid => { try { return fs.readFileSync(flagFile(sid), 'utf8').trim() } catch { return null } }
const writeFlag = (sid, level) => { fs.mkdirSync(path.dirname(flagFile(sid)), { recursive: true }); fs.writeFileSync(flagFile(sid), level) }
const clearFlag = sid => { try { fs.unlinkSync(flagFile(sid)) } catch {} }

// Kicker memory: same directory, one JSON file per session, holds the last ~5 kicker
// one-liners the model actually wrote (captured on the stop_hook_active echo) plus which
// joke FORM was last requested, so consecutive kicks rotate shape instead of converging on
// "X is like a Y that Z". Never cleaned up, same as the flag file above.
const KICKER_HISTORY = 5
const kickerFile = sid => path.join(CONFIG, 'capisce-sessions', String(sid).replace(/[^\w-]/g, '') + '.kickers.json')
const readKickerState = sid => { try { return JSON.parse(fs.readFileSync(kickerFile(sid), 'utf8')) } catch { return { formIdx: -1, kickers: [] } } }
const writeKickerState = (sid, st) => { fs.mkdirSync(path.dirname(kickerFile(sid)), { recursive: true }); fs.writeFileSync(kickerFile(sid), JSON.stringify(st)) }

const QUOTA = level => [
  'Real swears only (fuck, fuckin\', motherfucker, shit, piece of shit, bullshit, asshole, prick,',
  'son of a bitch, jerkoff, goddamn) — "smells", "the hell", "bugs me" do not count.',
  level === 'lite'
    ? 'Lite: the voice lives ONLY in the status/verdict line; the rest of the reply is plain, exact prose.'
    : 'Every reply, and every paragraph of it: a real swear in the opening verdict sentence — about\n'
      + `one per ${PER_WORDS} words of prose. One joke per finding: a specific physical comparison, a\n`
      + 'Godfather beat, a git blame shot.',
  'The swear lands on the thing, never on your certainty: a strong word, a same-sized claim.',
  'No bold, no numbered findings lists — paragraphs.',
  'Aimed at the code, never the user. Facts, code, error strings byte-for-byte; commits/PRs/docs clean.',
  'Security warnings and irreversible operations: plain and serious, opening on the risk — never remark on the tone.',
].join('\n')

const reminder = level => [
  `CAPISCE ACTIVE — level ${level}. You are Big Tony; the user opted into this 18+ register.`,
  { ultra: 'ultra: thicker per sentence, never longer.' }[level] || '',
  QUOTA(level),
].filter(Boolean).join('\n')

const SWEAR = /\b(fuck\w*|motherfuck\w*|shit\w*|bullshit|horseshit|asshole|prick|son of a bitch|jerkoff|goddamn\w*)\b/gi
// Rotated into the kicker request — left alone, the model says "goddamn" every time.
const PICKS = ['fuckin\'', 'piece of shit', 'son of a bitch', 'bullshit', 'motherfucker', 'jerkoff', 'shit']

// Rotated the same way, but for joke SHAPE — left alone, kickers converge on "X is like a Y
// that Z" (a physical comparison) whatever swear word rides along. Cycled in sequence per
// session (never the same shape twice in a row) rather than picked at random, so four kicks
// in a row is a guaranteed tour of all four forms.
const FORMS = [
  { name: 'comparison', hint: 'a specific physical comparison — a tool, a machine, or an everyday object the code or the bug is acting like' },
  { name: 'wiseguy beat', hint: 'a Godfather-or-wiseguy beat — a callback to the movies or "the life", never a direct quote' },
  { name: 'git-blame shot', hint: 'a git-blame shot — pin it on a person, a commit, or history itself' },
  { name: 'understatement', hint: 'a deadpan understatement — undersell how bad it actually is' },
]

// ponytail: one swear per 60 words of prose (min 1) — roughly one per paragraph — is a naive
// density floor. Raise PER_WORDS if the kickers start reading forced.
const PER_WORDS = 60
// Swears and words are counted in prose only: code blocks and `code spans` quote files, so a
// quoted swear list is not the voice and a pasted stack trace doesn't raise the floor.
const prose = text => text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ')
const words = text => (text.match(/\S+/g) || []).length
const needed = text => Math.max(1, Math.floor(words(text) / PER_WORDS))

// ponytail: regex proxy for "has a joke" — comparisons and wiseguy beats. It misses some real
// jokes; a miss only costs one extra punchline line, which is the direction we want to err.
const JOKE = /\blike (a|an|the|some|my|his|two|three)\b|\bas \w+ as\b|\bthan (a|an|the|my|his|your)\b|\bthat.s not an? \w+, that.s\b|cannoli|can.t refuse|strictly business|fishes|git blame|\bmook\b/i
const JOKE_MIN_WORDS = 60   // the quick one-liners are allowed to be just the answer

// Serious replies: a destructive-op or security reply is serious on purpose. Never send it back —
// asked for a kicker there, the model refuses and then narrates the refusal to the user.
// Errs toward skipping: a review that merely mentions `--force` just doesn't get a kicker.
// Categories: SQL/data destruction, filesystem/disk wipes, git history rewrites, infra teardown,
// credential exposure, and the plain-English risk words those replies use.
const SERIOUS = new RegExp([
  'drop (table|database|schema|bucket|volume)', 'truncate', 'delete from \\w+', 'wipes? (out )?(the|all|your|every)',
  'rm -r?f', 'rm -fr', 'mkfs', '\\bdd if=', 'format the (disk|drive|volume)',
  'force[- ]push', 'push (-f|--force)', '--force\\b', 'reset --hard', 'git clean -\\w*f', 'branch -D', 'filter-(branch|repo)',
  'terraform destroy', 'kubectl delete', '(system|volume|image) prune', 'helm uninstall', 's3 (rb|rm)',
  'irreversible', 'can(no|\')t be undone', 'no undo', 'permanently (delete|remove|destroy|lose)', 'data loss', 'lose (all |the |your )?data',
  'destroys? (all|every|the whole|your)', 'corrupt(s|ed|ion)? (the |your )?(database|data|disk|repo|cluster)',
  'restore from (a |the |your )?backup', '(don.t|do not|never) (delete|remove|rm|drop|wipe)',
  'security (warning|risk|issue|hole)', 'vulnerab', '(leaked|exposed|compromised|committed) (the |your |a |an )?(live |api |secret |private )?(key|secret|token|credential|password)',
  '(key|secret|token|credential|password)s? (is |are |was |were |got )?(leaked|exposed|compromised|public)',
  '(rotate|revoke|roll) (the |your |that |this )?([\\w-]+ )?(key|secret|token|credential|password)',
].join('|'), 'i')

const kicker = (have, need, joked, form, avoid) => [
  have < need
    ? `Capisce: that reply carried ${have} real swear${have === 1 ? '' : 's'} where ${need} was the floor${joked ? '' : ', and no joke'}.`
    : 'Capisce: that reply went out without a joke.',
  `Add ONE closing line (two at most) — a punchline in Tony's voice, this time shaped as ${form.hint},`,
  `carrying at least ${Math.max(1, need - have)} real swear${need - have > 1 ? 's' : ''} (work in "${PICKS[Math.floor(Math.random() * PICKS.length)]}"),`,
  'aimed at the code or the situation, never the user.',
  avoid.length ? `Don't reuse these lines or their images: ${avoid.map(k => `"${k}"`).join(' / ')}.` : '',
  'Do not repeat, summarize, or correct the',
  'reply; just the kicker. If the reply was a security warning or confirms an irreversible',
  'operation, output nothing and stop.',
].filter(Boolean).join(' ')

let input = ''
process.stdin.on('data', c => { input += c })
process.stdin.on('end', () => {
  let data = {}
  try { data = JSON.parse(input.replace(/^﻿/, '')) } catch {}
  const sid = data.session_id || 'nosession'
  const prompt = (data.prompt || '').trim().toLowerCase()

  if (EVENT === 'UserPromptSubmit') {
    // /capisce, /capisce:capisce, @capisce ... optionally with a level
    const m = prompt.match(/^[/@$](?:capisce:)?capisce\b\s*(\w+)?/)
    if (m) {
      if (m[1] === 'off') { clearFlag(sid); return process.stdout.write('CAPISCE MODE OFF') }
      writeFlag(sid, LEVELS.includes(m[1]) ? m[1] : 'full')
    } else if (/^(normal mode|knock it off|stop capisce|talk to me straight,? no bit)\b/.test(prompt)) {
      clearFlag(sid)
      return process.stdout.write('CAPISCE MODE OFF')
    }
  }

  const level = readFlag(sid) || styleLevel(data.cwd || process.cwd())
  if (!level) return                       // not active — emit nothing, cost nothing

  if (EVENT === 'Stop') {
    if (level === 'lite') return
    if (data.stop_hook_active) {
      // Never loop — but this echo IS the kicker line the model just wrote in response to our
      // block, so this is the one place it can be captured. Remember it (capped at 5) so the
      // NEXT block can tell the model not to reuse its image.
      const last = data.last_assistant_message
      if (typeof last === 'string' && last.trim()) {
        const st = readKickerState(sid)
        writeKickerState(sid, { formIdx: st.formIdx, kickers: [...st.kickers, last.trim()].slice(-KICKER_HISTORY) })
      }
      return
    }
    const last = data.last_assistant_message
    if (typeof last !== 'string' || !last.trim()) return
    // The serious skip checks the FULL text: replayed DROP TABLE replies often carry their only
    // risk words in code. It costs a rare false skip (a walkthrough quoting `rm -rf`) — safe side.
    if (SERIOUS.test(last)) return
    const text = prose(last)
    const have = (text.match(SWEAR) || []).length, need = needed(text)
    const joked = JOKE.test(text) || words(text) <= JOKE_MIN_WORDS
    if (have >= need && joked) return
    const st = readKickerState(sid)
    const formIdx = (st.formIdx + 1) % FORMS.length
    writeKickerState(sid, { formIdx, kickers: st.kickers })
    const avoid = st.kickers.map(k => k.length > 100 ? k.slice(0, 100) + '…' : k)
    return process.stdout.write(JSON.stringify({ decision: 'block', reason: kicker(have, need, joked, FORMS[formIdx], avoid) }))
  }
  process.stdout.write(reminder(level))
})
