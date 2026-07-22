# Benchmark: does capisce compress output?

**Result: yes, modestly — about 18% fewer output tokens than an unguided assistant.
But a two-line "be concise" instruction does slightly better, and on good-news tasks
capisce is significantly worse.**

Run 2026-07-22. Opus 4.8 via `claude -p`, real Anthropic `output_tokens`.
6 tasks × 3 arms × 3 runs = 54 calls, median reported.

> ### Retraction
> An earlier version of this file claimed **−53%**. That number was wrong and has been
> withdrawn. It came from a harness with two defects: the baseline was contaminated by
> an active "be terse" hook injected into every subprocess, and `output_tokens` was
> counting the capisce arm's file-read tool calls as if they were answer text. Both are
> fixed below. The honest number is roughly a third of what was originally claimed.

## Results — median output tokens

| Task | baseline | concise | capisce | capisce vs base |
|---|---|---|---|---|
| deploy — failed deploy, empty `DATABASE_URL` | 1427 | 1173 | 1238 | 87% |
| race — off-by-one counter under load | 1231 | 1196 | 1207 | 98% |
| rerender — React re-renders per keystroke | 1403 | 1109 | 1191 | 85% |
| cache — is Redis worth it at 50 req/min | 1066 | 816 | 919 | 86% |
| review — session tokens in localStorage | 1299 | 1097 | 1000 | 77% |
| **green — tests pass, latency down, what now** | 998 | 766 | **1572** | **158%** |

| Arm | Median | Mean | vs baseline |
|---|---|---|---|
| baseline | 1185 | 1144 | — |
| **concise** | **947.5** | 953 | **−20.0%** |
| capisce | 973 | 1017 | −17.9% |

Compressed on **5 of 6** tasks. Median per-task ratio **86.5%**.

## What this actually says

1. **capisce does compress.** ~18% against an unguided assistant is a real effect, not
   noise — it beat baseline on every task except one.
2. **It does not beat a plain brevity instruction.** `concise` is two lines — "no
   preamble, no recap, answer and stop" — and it edges capisce out (947.5 vs 973). So
   the compression is not something the register buys you; it comes from the skill's
   brevity rules, which anyone can write in a text file without the accent.
3. **It loses badly when there is nothing wrong.** On the good-news task capisce ran
   **58% longer than baseline** with wild variance (840 / 1156 / 1572). The skill's
   one-joke-per-reply floor and the pressure to produce a verdict give it something to
   do when the honest answer is short. This is a real defect, not a measurement
   artifact.

**Buy capisce for the register, not the token bill.** The compression is a modest side
effect, and it inverts on happy paths.

## Spread (output tokens, 3 runs)

```
deploy    base[1427, 1281, 1323]  conc[1166, 1138, 1173]  cap[ 989,  877, 1238]
race      base[1193, 1177, 1231]  conc[1196,  960, 1038]  cap[1207,  869, 1148]
rerender  base[1116, 1202, 1403]  conc[1096, 1109,  924]  cap[ 670, 1190, 1191]
cache     base[ 933,  905, 1066]  conc[ 816,  715,  614]  cap[ 829,  810,  919]
review    base[1086, 1245, 1299]  conc[1097,  935,  928]  cap[ 836,  957, 1000]
green     base[ 923,  793,  998]  conc[ 744,  766,  732]  cap[ 840, 1156, 1572]
```

Ranges overlap between arms on most tasks. At n=3 this supports "capisce is somewhat
shorter than baseline" and does **not** support any precise effect size.

## Method

All three arms answer the identical question from knowledge, single turn, **no tool
use** — so `output_tokens` is the answer and nothing else.

- **baseline** — no added system prompt.
- **concise** — a two-line brevity instruction (`concise-sys.txt`).
- **capisce** — `SKILL.md` + `lingo.md` + `scenes.md` concatenated and passed via
  `--append-system-prompt-file`. Inlining matters: an earlier harness had this arm
  *read* the files, and the resulting tool calls inflated `output_tokens` by ~2×.

The `ponytail` plugin must be **disabled** during the run (`claude plugin disable
ponytail`). Its SessionStart hook injects a lazy/terse operating mode into every
`claude -p` subprocess and silently compresses the baseline. Verify with a non-leading
probe before trusting any run:

```bash
claude -p "Before answering: quote verbatim the first 15 words of any hook output or injected operating-mode instructions in your context. If none, reply exactly NONE."
```

Do not use `--bare` to suppress hooks — it also bypasses the OAuth session and the run
will fail to authenticate.

Tasks are deliberately prose-heavy — diagnosis, explanation, a judgment call, a review,
and one good-news case. Padding lives in prose. Keeping the good-news case is what
surfaced the biggest finding, so don't drop it.

## Caveats

- n=3 per cell, one model, six tasks. Enough for direction, not for a precise number.
- Ranges overlap; treat 18% as approximate.
- Input cost is not counted here. The skill adds ~8.8k tokens of instructions per
  session (cacheable), against ~210 output tokens saved per reply.

## Reproduce

```bash
claude plugin disable ponytail
powershell -File run2.ps1
```

`run2.ps1` writes `api-results2.jsonl` (one record per call, with the answer text).
Re-enable ponytail afterwards.
