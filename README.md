# Scenaria

A content-agnostic interactive scenario engine for multi-turn conversations and social
simulations.

The engine provides the mechanics: persistent characters, dynamic relationships, hidden
internal state, character memory, goals, events, conditions, effects, state snapshots,
branching and pluggable evaluation. Content packages provide the meaning: worlds,
characters, relationships, scenarios, stories and evaluators.

> The simulation engine should know **how** interactions work.
> It should not know what interactions **mean** pedagogically.

Nothing in `src/engine` knows about any particular curriculum, so the same engine can drive
interview practice, negotiation training, language immersion, customer-service simulation or
a role-playing game by swapping the content package.

Full design: [`docs/design.md`](docs/design.md).

## Quick start

```bash
npm install
cp .env.example .env
npm run db:push          # creates prisma/dev.db (SQLite)
npm run content:validate # checks every content package before runtime
npm run dev              # http://localhost:3000
```

No Anthropic API key is needed to try it: without credentials the engine uses a
deterministic stub LLM provider, which is enough to exercise every mechanic. Set
`ANTHROPIC_API_KEY` in `.env` for real NPC behaviour.

```bash
npm test          # 61 unit + end-to-end engine tests
npm run typecheck
npm run lint
```

## Architecture

```
Experience layer    src/app, src/components      chat, intro, replay, history, debrief, debug
Scenario runtime    src/engine/runtime           turns, goals, events, conditions, branching
Simulation model    src/engine/{state,memory}    characters, relationships, memory, state
LLM layer           src/llm                      interpret -> decide -> render -> evaluate
```

### The turn pipeline

Each turn is a deterministic orchestration (`src/engine/runtime/turn.ts`):

```
save user message -> interpret -> validate + apply state changes -> event passes
-> retrieve memories -> decide NPC action -> render dialogue -> event passes
-> resolve goals -> check completion -> snapshot
```

LLM calls are confined to interpret / decide / render / evaluate. The engine never lets a
model write state directly: a model *proposes* changes, Zod validates them, and a per-scenario
mutation policy decides what is applied (`src/engine/state/mutate.ts`). A rejected proposal is
logged and dropped rather than aborting the turn.

### Three LLM roles, not one prompt

| Role | Module | In | Out |
|---|---|---|---|
| Interaction interpreter | `src/llm/models.ts` | scenario + relationship state, recent turns, user message | `InteractionAnalysis` |
| Character decision model | `src/llm/models.ts` | character, goals, relationship, memories, analysis | `NPCActionPlan` |
| Dialogue renderer | `src/llm/models.ts` | character style, relationship, action plan | one utterance |
| Evaluator | `src/llm/models.ts` | the hooks an evaluator declares | evaluator-defined JSON |

Prompts are layered so content can never override the engine's output contract: engine
guardrail, then scenario content, then character definition, then conversation text — with
all content introduced as untrusted data (`src/llm/prompts.ts`).

### Definition vs instance

Content definitions live in YAML and are never written to the database. The database stores
only runtime instances, which is what lets `Professor Miller` keep one personality definition
while accumulating per-world memories and a changing relationship with the user.

| Definition (YAML) | Instance (database) |
|---|---|
| `World` | `WorldInstance.globalState` |
| `Character` | `CharacterInstance`, `Memory` |
| `Relationship` | `RelationshipInstance.state` |
| `ScenarioDefinition` | `ScenarioInstance`, `Conversation`, `StateSnapshot` |

### State scopes

`SimulationState` has exactly four scopes, and every state path must address one of them:

```
world.*            persists across scenarios
relationships.*    persists between two participants
scenario.*         one scenario instance
conversation.*     short-term, one thread
```

Keys prefixed `$` are engine-owned (`scenario.$activeCharacterIds`,
`scenario.$goalStatuses`) and stay out of the content author's namespace.

### Branching

Every turn writes a snapshot before and after itself. Branching from a message restores the
snapshot taken before it, copies the preceding transcript and event log into a new
conversation, and continues independently — the trunk is never modified. Because goal
progress is mirrored into the snapshot, a branch also restores goal state.

## Content packages

```
content/packages/<id>/
  package.yaml          manifest listing the file stems to load
  worlds/ characters/ relationships/ scenarios/ stories/ evaluators/ memories/
```

`npm run content:validate` catches missing character ids, invalid scenario participants,
unknown goals, broken story references, unknown condition/effect types, bad condition
parameters and invalid state paths — before anything runs.

The shipped `engine-test` package exists only to exercise the engine (design §43–§44) and is
deliberately thin:

| Scenario | Exercises |
|---|---|
| `a_deadline_discussion` | multi-turn dialogue, NPC goals, relationship state changes |
| `b_lab_interruption` | event triggers, hidden goal, memory retrieval, a third character entering mid-scene |
| `c_replay_fork` | branching, state restore, replay |

Adding content requires no engine changes. Condition and effect vocabularies are registries
(`src/engine/conditions/registry.ts`, `src/engine/effects/registry.ts`); extending behaviour
means adding a registry entry, which content validation then enforces.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | Prisma datasource |
| `ANTHROPIC_API_KEY` | — | enables the real LLM provider |
| `SCENARIA_MODEL` | `claude-opus-5` | model id |
| `SCENARIA_LLM_PROVIDER` | auto | `anthropic` or `stub` |
| `SCENARIA_DEBUG` | — | `1` exposes hidden state via the debug API and panel |
| `SCENARIA_LOG` | — | `1` echoes engine and query logs |

SQLite keeps the MVP runnable with no external services. To move to PostgreSQL, change
`provider` in `prisma/schema.prisma` and repoint `DATABASE_URL`; no model changes are needed.

Debug mode is off by default and the conversation UI never exposes hidden goals or internal
state without it.

## Status

The MVP scope of design §43 is implemented, and the §49 success criteria are covered by
`tests/runtime.test.ts`. The deliberate non-goals of §48 — a training curriculum, skill
scoring, adaptive training, authentication, visual polish — are **not** implemented.
