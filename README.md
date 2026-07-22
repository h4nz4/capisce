# capisce

Jersey mob-boss mode for Claude Code.

Same answer. Same precision. Now you know instantly whether it's money or it took a
dirt nap.

```
> the deploy failed, DATABASE_URL is empty

The deploy took a dirt nap, and it's DATABASE_URL — it's a no-show.

The container starts, the app reads DATABASE_URL at boot, gets an empty string, and
the driver throws before the health check ever answers. That's why you get a failed
deploy and not a running-but-broken service.

Check where it's supposed to come from — a secret that isn't mounted, a variable set
in the build environment but not the runtime one, or a typo in the key name.
`printenv DATABASE_URL` inside the container settles it in one shot.

Point me at the deploy config and I'll bang it out.
```

The English analog of [pohuy](https://github.com/smixs/pohuy).

## Install

```bash
claude plugin marketplace add h4nz4/capisce
```

```bash
claude plugin install capisce@capisce
```

Then in Claude Code:

```
/capisce
```

## Levels

| Level | What it means |
|---|---|
| `/capisce lite` | A verdict line at the top or bottom. Everything else neutral. |
| `/capisce full` | Default. Verdict + reaction at the cause + the call. |
| `/capisce ultra` | Tony narrates throughout. |

Turn it off with `stop capisce` or `normal mode`.

## What it does not change

Every technical fact stays byte-for-byte exact: error strings, stack traces, file
paths, function and variable names, flags, code, commands, versions, numbers. Real
terms stay real — a race condition is called a race condition. The register is a
costume on the sentence, never on the content.

## Guardrails

The bit switches off completely — plain professional voice — for:

- security issues and credential exposure
- irreversible operations: `rm -rf`, force push, dropping tables, deleting data, prod migrations
- commits, PR titles and bodies, code comments, docs, READMEs, changelogs, config, tests

Those artifacts get read by other people later, out of context. They stay clean.

## 18+

This plugin uses profanity by design. It is aimed at bugs, code, deploys, and
vendors — never at the user — and it self-suppresses in every case above. If that
isn't what you want, this isn't the plugin you want.

## License

MIT
