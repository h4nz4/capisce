# Benchmark: does capisce compress output?

**Yes — the reply you read is ~42% shorter than an unguided assistant, and ~30% shorter
than a competent "be concise" prompt. Your bill drops by less (~18%), because the skill
spends the difference on reasoning tokens you never see.**

Run 2026-07-22. Opus 4.8 via `claude -p`. 6 tasks × 3 arms × 3 runs = 54 calls, median
reported. Raw records in `api-results2.jsonl`.

## The two numbers, and why they differ

`usage.output_tokens` bills **reasoning tokens plus visible text**. Measure only that
and you will conclude the skill barely helps. Measure the answer text and you get a very
different picture. Both are real; they answer different questions.

| Arm | Billed `output_tokens` | **Visible answer** | Unseen reasoning |
|---|---|---|---|
| baseline | 1185 | 751.5 | 433.5 |
| concise | 947.5 | 620 (−17.5%) | 327.5 |
| **capisce** | 973 (−17.9%) | **434.5 (−42.2%)** | 538.5 |

- **Reading cost: capisce wins decisively.** −42% vs baseline, and it beats the
  brevity prompt by 30%. The register really is doing the work.
- **Billing cost: roughly a tie.** capisce −17.9%, concise −20.0%. capisce reasons
  *more* (538 vs 327 tokens) because a 9,290-token rulebook takes thought to satisfy.

If you care about reading less, install it. If you care only about the invoice, a
two-line brevity prompt is about as good and costs nothing to load.

## Visible answer tokens, per task

| Task | baseline | concise | capisce | vs base |
|---|---|---|---|---|
| deploy | 810 | 684 | 448 | 55% |
| race | 770 | 661 | 533 | 69% |
| rerender | 813 | 731 | 454 | 56% |
| cache | 555 | 449 | 436 | 79% |
| review | 740 | 570 | 355 | 48% |
| green | 583 | 450 | 412 | 71% |

Compressed on **6 of 6**, and it beat the concise arm on all six.

## Structure — where the words go

Medians per answer:

| | baseline | concise | capisce |
|---|---|---|---|
| words | 494.5 | 399 | **309.5** |
| non-blank lines | 29 | 20 | **11** |
| markdown headers | 3.5 | 2.5 | **0** |
| bullets | 7.5 | 9.5 | **4** |
| words per bullet | 53 | 38.5 | 74 |

capisce doesn't shorten bullets — it **deletes the scaffolding**. No headers, half the
bullets, a third of the lines. It answers in prose where the others build a document.
That is the mechanism, and it's why a brevity instruction can't replicate it: "be
concise" makes each bullet tighter, it doesn't stop the model from writing a report.

## Corrections

Two earlier claims in this file were wrong. Both are retracted, and the mistakes are
kept here because they're instructive:

1. **"−53%"** (first version) — came from a harness whose baseline was contaminated by
   an active "be terse" hook, and which counted the capisce arm's file-read tool calls
   as answer text. The *metric* it used (answer text only) was right; the *conditions*
   were dirty.
2. **"−18%, and a plain prompt beats it"** (second version) — clean conditions, wrong
   metric. It measured `output_tokens` without noticing that reasoning tokens are
   included, which hid the real compression. It also reported the good-news task as
   **58% worse** than baseline; on visible output that task is **29% better**. There was
   no green-path bloat. It was reasoning tokens.

Lesson worth keeping: `output_tokens` is not "how long is the answer."

## Method

All arms answer the identical question from knowledge, single turn, **no tool use**.

- **baseline** — no added system prompt.
- **concise** — two-line brevity instruction (`concise-sys.txt`).
- **capisce** — `SKILL.md` + `lingo.md` + `scenes.md` concatenated, passed via
  `--append-system-prompt-file`. Inline it; making the arm *read* the files adds tool
  calls that land in `output_tokens`.

Disable the `ponytail` plugin during runs — its SessionStart hook injects a terse
operating mode into every `claude -p` subprocess and silently compresses the baseline.
Verify with a non-leading probe:

```bash
claude -p "Before answering: quote verbatim the first 15 words of any hook output or injected operating-mode instructions in your context. If none, reply exactly NONE."
```

Don't use `--bare` to suppress hooks — it bypasses the OAuth session and the run fails
to authenticate.

## Caveats

- Visible-answer tokens are counted with `gpt-tokenizer`, not Anthropic's tokenizer.
  Fine for comparing arms on identical tasks; the ~5% tokenizer difference cannot
  explain a 300-token gap, but don't quote the absolutes as billing figures.
- "Unseen reasoning" is `output_tokens` minus that estimate, so it is approximate.
- n=3 per cell, one model, six prose-heavy tasks. Direction is solid; treat the exact
  percentages as approximate.
- Input cost not counted: the skill adds ~9.3k tokens of instructions per session
  (cacheable).

## Reproduce

```bash
claude plugin disable ponytail
powershell -File run2.ps1
node analyze2.js
```

Re-enable ponytail afterwards.
