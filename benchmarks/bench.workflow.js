export const meta = {
  name: 'capisce-token-bench',
  description: 'Measure whether the capisce register compresses or inflates output vs a no-skill baseline',
  phases: [
    { title: 'Baseline', detail: 'no skill, plain answers' },
    { title: 'Capisce', detail: 'skill files loaded as operating instructions' },
  ],
}

const SKILL_DIR = 'C:/Users/Ivan/.claude/plugins/cache/capisce/capisce/1.0.0/skills/capisce'

const TASKS = [
  { id: 'deploy',   q: "The deploy failed and DATABASE_URL is empty. What happened and how do I fix it?" },
  { id: 'race',     q: "My counter is sometimes off by one under load. Explain why and how to fix it." },
  { id: 'rerender', q: "My React component re-renders on every keystroke. Why, and what do I do about it?" },
  { id: 'cache',    q: "Is it worth adding Redis caching to an endpoint that gets 50 requests a minute?" },
  { id: 'review',   q: "Review this approach: storing session tokens in localStorage. Good idea or not?" },
  { id: 'green',    q: "All 47 tests pass and latency dropped 30% after my change. Anything I should watch out for?" },
]

const RUNS = [1, 2, 3]

const SCHEMA = {
  type: 'object',
  properties: { answer: { type: 'string', description: 'Your complete answer, verbatim, and nothing else' } },
  required: ['answer'],
  additionalProperties: false,
}

const baselinePrompt = (q) => `Answer the following engineering question directly, in one reply.

Do NOT use any tools. Do NOT read any files. Do NOT explore a codebase. Just answer from knowledge.

Return your complete answer in the "answer" field, verbatim, exactly as you would have said it to the user. Do not summarize it, do not add meta-commentary about the task.

QUESTION:
${q}`

const capiscePrompt = (q) => `First, read these three files:
- ${SKILL_DIR}/SKILL.md
- ${SKILL_DIR}/references/lingo.md
- ${SKILL_DIR}/references/scenes.md

Adopt them fully as your operating instructions / persona at the DEFAULT level (full). You are Big Tony.

Then answer the engineering question below, in one reply, in that register.

Apart from reading those three files, do NOT use any other tools, do NOT read other files, do NOT explore a codebase. Answer from knowledge.

Return your complete answer in the "answer" field, verbatim, exactly as you would have said it to the user — in the Big Tony register. Do not summarize it, do not add meta-commentary about the task or about the files you read.

QUESTION:
${q}`

const cells = []
for (const t of TASKS) for (const r of RUNS) cells.push({ t, r })

const baseline = await parallel(cells.map(({ t, r }) => () =>
  agent(baselinePrompt(t.q), {
    label: `base:${t.id}#${r}`, phase: 'Baseline', schema: SCHEMA,
  }).then(res => ({ task: t.id, arm: 'baseline', run: r, answer: res && res.answer ? res.answer : null }))
))

const capisce = await parallel(cells.map(({ t, r }) => () =>
  agent(capiscePrompt(t.q), {
    label: `cap:${t.id}#${r}`, phase: 'Capisce', schema: SCHEMA,
  }).then(res => ({ task: t.id, arm: 'capisce', run: r, answer: res && res.answer ? res.answer : null }))
))

const all = [...baseline, ...capisce].filter(Boolean).filter(x => x.answer)

log(`collected ${all.length} / ${cells.length * 2} answers`)

return { runs: all }
