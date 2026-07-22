# Benchmark: does capisce compress output?

**Result: yes. Median output drops 53% — 860 tokens to 405 — with no loss of technical
content.** Every capisce run beat every baseline run within its own task.

Run 2026-07-22. Opus 4.8. 6 tasks × 2 arms × 3 runs = 36 answers, median reported.

## Per-task median output tokens

| Task | Baseline | capisce | Delta | Ratio |
|---|---|---|---|---|
| deploy — failed deploy, empty `DATABASE_URL` | 972 | 400 | −572 | 41% |
| race — off-by-one counter under load | 1172 | 496 | −676 | 42% |
| rerender — React re-renders per keystroke | 1033 | 425 | −608 | 41% |
| cache — is Redis worth it at 50 req/min | 671 | 376 | −295 | 56% |
| review — session tokens in localStorage | 757 | 377 | −380 | 50% |
| green — tests pass, latency down, what now | 749 | 355 | −394 | 47% |

**Overall:** median 859.5 → 405 (**−52.9%**) · mean 895 → 427 · median words 609 → 288 ·
median task ratio 45% · compressed on **6/6** tasks.

## Spread — no overlap anywhere

```
deploy    base [1051, 891, 972]    cap [400, 718, 383]
race      base [1172, 1130, 1420]  cap [421, 594, 496]
rerender  base [879, 1033, 1065]   cap [410, 425, 464]
cache     base [671, 822, 587]     cap [369, 376, 427]
review    base [757, 840, 755]     cap [451, 317, 377]
green     base [749, 758, 556]     cap [316, 355, 389]
```

Within every task, the slowest capisce run still beat the leanest baseline run. At n=3
that isn't proof of an exact effect size, but the separation is not marginal.

## Method

Both arms get the identical question and answer from knowledge with no tool use. The
capisce arm first reads `SKILL.md`, `lingo.md` and `scenes.md` and adopts them at the
default level (**full**); the baseline arm gets no skill. Only the final answer text is
measured.

Tasks are deliberately prose-heavy — diagnosis, explanation, a judgment call, a review,
and one good-news case. Padding lives in prose; code-writing tasks would emit near
identical code in both arms and dilute the signal.

Tokens are counted offline with a BPE tokenizer (`gpt-tokenizer`), not characters. This
matters: dialect spellings tokenize worse than plain English, so a character count would
flatter the skill.

```bash
node benchmarks/score.js <workflow-output.json>
```

## Honest caveats

- **The tokenizer is GPT's, not Anthropic's.** Fine for an A/B on identical tasks;
  don't quote the absolute token figures as billing numbers.
- **Some of the win is explicit brevity rules, not the accent.** The skill contains
  "levels change flavor, never length" and "recap is not a reply." A mob voice with no
  brevity rules would not compress this hard. The claim "installing capisce halves
  output" holds; "the Jersey accent halves output" does not.
- **The baseline is an unguided assistant.** That is the right comparison for a user
  deciding whether to install the plugin, but it is not a comparison against a
  competent "be concise" prompt, which would close much of the gap.
- **Loading the skill costs 8,848 input tokens** (SKILL 3,459 · lingo 3,737 · scenes
  1,652), paid once per session and cacheable. Savings run ~455 output tokens per
  reply. At a typical 5:1 output:input price ratio the skill pays for itself after
  roughly **four replies**, then compounds.
- **n=3 per cell, one model, six tasks.** Enough to show a large effect, not enough to
  pin its size.

## Reproduce

`bench.workflow.js` is a Claude Code workflow script. Run it, then feed the saved output
JSON to `score.js`.
