# Generic Interactive Scenario Engine

## 1. Project Goal

Build a reusable interactive scenario engine for realistic multi-turn conversations and social simulations.

The engine should support:

- Persistent characters
- Dynamic relationships
- Scenario-specific goals
- Hidden internal state
- Multi-turn conversations
- Events and triggers
- Branching and replay
- Character memory
- World state
- Flexible evaluation
- Multiple content packages

The core system must remain **content-agnostic**.

It should not hard-code concepts such as:

```text
asking for help
small talk
professor
apology
social skills
```

Those should belong to separate content packages.

The system should be reusable for many domains, for example:

```text
Social communication training
Interview simulation
Negotiation training
Leadership training
Language immersion
Customer-service simulation
Conflict-resolution training
Role-playing games
```

---

# 2. Core Architectural Principle

Separate the system into two independent layers:

```text
Generic Simulation Engine
        ↑
        │ loads
        │
Content Packages
```

The engine provides the mechanics.

Content packages provide:

```text
characters
relationships
worlds
stories
scenarios
goals
events
evaluators
```

The engine must never depend on one specific training curriculum.

---

# 3. High-Level Architecture

Use four primary layers.

```text
┌───────────────────────────────┐
│        Experience Layer       │
│                               │
│ Chat UI                       │
│ Scenario intro                │
│ Replay                        │
│ History                       │
│ Debrief                       │
└───────────────┬───────────────┘
                │
┌───────────────▼───────────────┐
│        Scenario Runtime       │
│                               │
│ Turns                         │
│ Goals                         │
│ Events                        │
│ Conditions                    │
│ Branching                     │
│ Completion                    │
└───────────────┬───────────────┘
                │
┌───────────────▼───────────────┐
│       Simulation Model        │
│                               │
│ Characters                    │
│ Relationships                 │
│ Memory                        │
│ World State                   │
│ Conversation State            │
└───────────────┬───────────────┘
                │
┌───────────────▼───────────────┐
│           LLM Layer           │
│                               │
│ Interpretation                │
│ Character reasoning           │
│ Response generation           │
│ Evaluation                    │
└───────────────────────────────┘
```

---

# 4. Core Domain Objects

The first version should define the following fundamental objects:

```text
World
Character
Relationship
Memory
Scenario
Conversation
Message
State
Goal
Event
Condition
Effect
Branch
Evaluator
```

These form the ontology of the system.

---

# 5. World

A `World` represents the persistent environment in which scenarios take place.

Examples:

```text
University
Research lab
Company
Apartment
Conference
Fantasy world
```

Schema:

```ts
interface World {
  id: string;
  name: string;
  description?: string;

  metadata: Record<string, unknown>;

  globalState: Record<string, unknown>;

  characterIds: string[];
}
```

The world should support persistent global state.

Example:

```json
{
  "semester": "fall",
  "conferenceActive": false,
  "officeOpen": true,
  "deadline": "2026-10-10"
}
```

---

# 6. Character

Characters must be persistent entities.

A character is not simply a prompt.

```ts
interface Character {
  id: string;

  name: string;
  role?: string;

  profile: CharacterProfile;

  traits: Record<string, number | string | boolean>;

  communicationStyle: Record<string, number | string>;

  goals: CharacterGoal[];

  preferences: string[];

  dislikes: string[];

  knowledge: KnowledgeEntry[];

  memoryIds: string[];

  metadata: Record<string, unknown>;
}
```

Example:

```json
{
  "name": "Professor Miller",
  "role": "advisor",
  "traits": {
    "patience": 0.55,
    "warmth": 0.6,
    "directness": 0.8
  },
  "communicationStyle": {
    "verbosity": "low",
    "formality": "medium",
    "conflictStyle": "direct"
  }
}
```

The engine must not assume what these traits mean.

Their interpretation can be handled by the LLM or content layer.

---

# 7. Relationship

Relationships must exist separately from characters.

A relationship describes:

```text
Character A ↔ Character B
```

Schema:

```ts
interface Relationship {
  id: string;

  participantAId: string;
  participantBId: string;

  type?: string;

  state: Record<string, number | string | boolean>;

  history: RelationshipEvent[];

  memoryIds: string[];

  metadata: Record<string, unknown>;
}
```

Example:

```json
{
  "type": "advisor_student",
  "state": {
    "familiarity": 0.55,
    "trust": 0.72,
    "warmth": 0.6,
    "tension": 0.15,
    "powerDifference": 0.8
  }
}
```

The schema should allow custom relationship dimensions.

Do not hard-code only:

```text
trust
warmth
familiarity
```

Store relationship state generically where possible.

---

# 8. Memory System

Memory should be a first-class object.

Characters should remember significant events across scenarios.

Schema:

```ts
interface Memory {
  id: string;

  ownerType: "character" | "relationship" | "world";

  ownerId: string;

  content: string;

  type?: string;

  importance: number;

  emotionalWeight?: number;

  tags: string[];

  sourceConversationId?: string;
  sourceMessageIds?: string[];

  createdAt: Date;
}
```

Example:

```json
{
  "content": "The user previously missed an agreed deadline but apologized and delivered two days later.",
  "importance": 0.8,
  "tags": ["deadline", "reliability"]
}
```

Important:

Do not put the entire conversation history into every prompt.

Retrieve only relevant memories.

---

# 9. State Model

The engine should support multiple types of state.

## 9.1 World State

Persistent across scenarios.

Example:

```text
deadline approaching
conference happening
office closed
project delayed
```

---

## 9.2 Relationship State

Persistent between two characters.

Example:

```text
trust
familiarity
tension
status
```

---

## 9.3 Scenario State

Exists for one scenario instance.

Example:

```text
objective completed
document obtained
meeting interrupted
```

---

## 9.4 Conversation State

Short-term state.

Example:

```text
current topic
engagement
emotional intensity
unanswered question
```

Schema:

```ts
interface SimulationState {
  world: Record<string, unknown>;

  relationships: Record<string, Record<string, unknown>>;

  scenario: Record<string, unknown>;

  conversation: Record<string, unknown>;
}
```

---

# 10. Scenario

A scenario defines one interactive situation.

Schema:

```ts
interface ScenarioDefinition {
  id: string;

  name: string;

  description?: string;

  worldId?: string;

  participantIds: string[];

  initialContext: string;

  initialState: Record<string, unknown>;

  goals: GoalDefinition[];

  events: EventDefinition[];

  rules: ScenarioRule[];

  evaluators: EvaluatorReference[];

  completionRules: CompletionRule[];

  metadata: Record<string, unknown>;
}
```

Example:

```yaml
id: scenario_001

name: Deadline Discussion

participants:
  - user
  - professor_miller

initialContext: >
  The user previously promised to deliver
  an analysis tonight but now needs two more days.

goals:
  - id: user_goal
    owner: user
    type: negotiate_new_deadline

  - id: npc_goal
    owner: professor_miller
    type: understand_delay
```

The engine should not know what:

```text
negotiate_new_deadline
```

means.

That belongs to content or LLM interpretation.

---

# 11. Goal System

Every participant may have one or more goals.

Goals can:

- Conflict
- Align
- Remain hidden
- Change during the scenario

Schema:

```ts
interface GoalDefinition {
  id: string;

  ownerId: string;

  description: string;

  priority: number;

  hidden: boolean;

  status: "inactive" | "active" | "completed" | "failed" | "abandoned";

  completionCondition?: ConditionDefinition;
}
```

Example:

```yaml
owner: professor_miller

description: >
  Determine whether the student has
  a realistic completion plan.

priority: 0.8

hidden: true
```

NPC responses should be influenced by their goals.

Characters should not simply optimize for user satisfaction.

---

# 12. Conditions

Conditions are reusable logical checks.

Schema:

```ts
interface ConditionDefinition {
  type: string;

  parameters?: Record<string, unknown>;

  all?: ConditionDefinition[];

  any?: ConditionDefinition[];

  not?: ConditionDefinition;
}
```

Examples:

```yaml
type: state_threshold

parameters:
  path: relationship.tension
  operator: ">="
  value: 0.7
```

Or:

```yaml
all:
  - type: turn_count
    parameters:
      operator: ">="
      value: 3

  - type: goal_status
    parameters:
      goalId: user_goal
      status: active
```

---

# 13. Event System

Events make scenarios dynamic.

An event should contain:

```text
trigger
condition
effects
```

Schema:

```ts
interface EventDefinition {
  id: string;

  trigger:
    | "scenario_start"
    | "before_turn"
    | "after_user_message"
    | "after_npc_message"
    | "state_change"
    | "manual";

  condition?: ConditionDefinition;

  effects: EffectDefinition[];

  once?: boolean;

  priority?: number;
}
```

Examples of events:

```text
A third character enters the room.

The NPC receives a phone call.

The meeting is about to end.

The NPC becomes defensive.

A hidden fact is revealed.

A previous memory becomes relevant.
```

---

# 14. Effects

Effects mutate simulation state.

Schema:

```ts
interface EffectDefinition {
  type:
    | "set_state"
    | "increment_state"
    | "activate_goal"
    | "complete_goal"
    | "create_memory"
    | "emit_system_context"
    | "add_character"
    | "remove_character"
    | "end_scenario"
    | "custom";

  parameters: Record<string, unknown>;
}
```

Example:

```yaml
type: increment_state

parameters:
  path: relationship.tension
  amount: 0.15
```

---

# 15. Scenario Runtime

The runtime controls the execution of scenarios.

Core loop:

```text
Load scenario
↓
Load world
↓
Load characters
↓
Load relationships
↓
Load relevant memories
↓
Create runtime state
↓
Begin conversation
↓
User message
↓
Interpret message
↓
Update state
↓
Trigger events
↓
Generate NPC action
↓
Update state
↓
Check goals
↓
Check completion
↓
Repeat
```

---

# 16. Turn Pipeline

Each turn should follow a deterministic orchestration pipeline.

```text
1. Receive user message

2. Save raw message

3. Interpret message

4. Produce structured interaction analysis

5. Apply state changes

6. Evaluate event triggers

7. Apply triggered effects

8. Retrieve relevant memories

9. Generate NPC reasoning context

10. Generate NPC response

11. Save NPC response

12. Update state

13. Evaluate goals

14. Evaluate scenario completion

15. Save state snapshot
```

---

# 17. Message Interpretation

The LLM should convert free-form user messages into structured signals.

Generic schema:

```ts
interface InteractionAnalysis {
  intents: string[];

  topics: string[];

  referencedEntities: string[];

  inferredSignals: Record<string, number | string | boolean>;

  proposedStateChanges: StateChange[];

  triggeredFacts?: string[];

  confidence: number;
}
```

Example:

```json
{
  "intents": ["request", "explanation"],
  "topics": ["deadline"],
  "inferredSignals": {
    "directness": 0.7,
    "uncertainty": 0.4
  }
}
```

These fields must remain extensible.

---

# 18. NPC Action Model

NPCs should not be limited to sending text.

Define generic actions.

```ts
type NPCAction =
  | SpeakAction
  | InternalStateAction
  | WorldAction
  | EndConversationAction;
```

Example:

```ts
interface SpeakAction {
  type: "speak";

  speakerId: string;

  content: string;

  tone?: string;
}
```

Future extensions might support:

```text
NPC leaves
NPC changes topic
NPC pauses
NPC calls another character
NPC refuses to answer
```

---

# 19. LLM Architecture

Do not use a single giant prompt.

Split responsibilities.

## Model A: Interaction Interpreter

Purpose:

```text
Convert user message into structured meaning.
```

Input:

```text
scenario state
relationship state
recent conversation
user message
```

Output:

```text
InteractionAnalysis JSON
```

---

## Model B: Character Decision Model

Purpose:

```text
Decide what the NPC wants to do next.
```

Input:

```text
character
goals
relationship
memories
scenario state
interaction analysis
```

Output:

```text
NPCActionPlan JSON
```

Example:

```json
{
  "intent": "ask_for_explanation",
  "emotionalResponse": "mild concern",
  "goalFocus": "understand_delay",
  "responseStrategy": "direct_question"
}
```

---

## Model C: Natural Language Renderer

Purpose:

```text
Turn NPCActionPlan into natural dialogue.
```

Input:

```text
character style
relationship
action plan
conversation
```

Output:

```text
natural NPC message
```

This separation makes NPC behavior easier to debug.

---

# 20. Conversation Model

Schema:

```ts
interface Conversation {
  id: string;

  scenarioDefinitionId: string;

  scenarioInstanceId: string;

  participantIds: string[];

  rootConversationId?: string;

  parentBranchId?: string;

  status: "active" | "completed" | "abandoned";

  startedAt: Date;
  completedAt?: Date;
}
```

---

# 21. Message Model

```ts
interface Message {
  id: string;

  conversationId: string;

  senderId: string;

  content: string;

  createdAt: Date;

  analysis?: InteractionAnalysis;

  stateSnapshotBeforeId?: string;
  stateSnapshotAfterId?: string;
}
```

---

# 22. State Snapshots

Every turn should produce snapshots.

```ts
interface StateSnapshot {
  id: string;

  conversationId: string;

  turnIndex: number;

  state: SimulationState;

  createdAt: Date;
}
```

This enables:

```text
debugging
replay
branching
evaluation
```

---

# 23. Branching

The system must support replaying from any previous turn.

Example:

```text
Turn 1
  ↓
Turn 2
  ↓
Turn 3
 ├─────────── Branch A
 │              ↓
 │           Turn 4A
 │
 └─────────── Branch B
                ↓
             Turn 4B
```

Schema:

```ts
interface ConversationBranch {
  id: string;

  conversationId: string;

  parentBranchId?: string;

  branchFromMessageId?: string;

  branchFromStateSnapshotId?: string;

  createdAt: Date;
}
```

When branching:

1. Restore previous state snapshot.
2. Copy relevant conversation context.
3. Accept a different user response.
4. Continue independently.

---

# 24. Scenario Completion

Completion should not rely only on turn count.

Support multiple completion modes.

```ts
interface CompletionRule {
  type:
    | "condition"
    | "goal_resolution"
    | "npc_exit"
    | "user_exit"
    | "turn_limit"
    | "custom";

  condition?: ConditionDefinition;
}
```

Possible outcomes:

```text
completed
partially completed
failed
abandoned
natural_end
```

Not every scenario needs success/failure.

---

# 25. Evaluation System

Evaluation must be modular.

The engine itself should not define what counts as good behavior.

Schema:

```ts
interface Evaluator {
  id: string;

  name: string;

  description?: string;

  inputSchema?: Record<string, unknown>;

  outputSchema?: Record<string, unknown>;

  promptTemplate?: string;
}
```

Example evaluators:

```text
Social communication evaluator
Interview evaluator
Negotiation evaluator
Language evaluator
Conflict evaluator
Sales evaluator
```

A scenario may use:

```text
zero
one
multiple
```

evaluators.

---

# 26. Evaluation Hooks

The engine should expose:

```text
conversation transcript

state history

goal history

event history

memory changes

relationship changes

branch information
```

Evaluators can consume these independently.

---

# 27. Memory Generation

At scenario completion, optionally run a memory extraction process.

Input:

```text
conversation
important events
state changes
```

Output:

```text
new character memories
relationship memories
world memories
```

Only important events should become persistent memories.

Avoid storing every detail.

---

# 28. Memory Retrieval

Before each NPC response:

```text
Character
+
Scenario
+
Current topic
+
Relationship
+
Recent conversation
```

should be used to retrieve relevant memories.

Rank memories based on:

```text
semantic relevance
importance
recency
emotional weight
```

---

# 29. Story Layer

Stories should be optional.

The engine should function without stories.

Schema:

```ts
interface Story {
  id: string;

  name: string;

  worldId: string;

  chapterIds: string[];

  metadata: Record<string, unknown>;
}
```

Each chapter may reference a scenario.

```ts
interface StoryChapter {
  id: string;

  storyId: string;

  scenarioId: string;

  order: number;

  unlockCondition?: ConditionDefinition;
}
```

Stories are content orchestration, not runtime fundamentals.

---

# 30. Content Package System

Store content independently.

Suggested structure:

```text
/content

  /packages

    /social-training

    /interview-training

    /negotiation-training
```

Package structure:

```text
/package-name

  package.json

  /worlds

  /characters

  /relationships

  /scenarios

  /stories

  /evaluators
```

Example:

```text
/content/packages/social-training/characters/professor-miller.yaml
```

---

# 31. Package Manifest

Example:

```yaml
id: social-training

name: Social Training

version: 0.1.0

worlds:
  - university

characters:
  - professor_miller
  - sarah
  - daniel

stories:
  - first_semester
```

---

# 32. Content Validation

Build validators for content files.

Validate:

```text
missing character IDs

invalid scenario participants

unknown goals

broken story references

invalid event conditions

invalid state paths
```

Content errors should be caught before runtime.

---

# 33. UI Requirements

For the first system version, keep UI minimal.

Required pages:

```text
Home

Scenario Browser

Scenario Intro

Conversation

Conversation History

Replay / Branch Viewer

Evaluation Result
```

Do not prioritize visual polish initially.

---

# 34. Conversation UI

Main screen:

```text
┌─────────────────────────────────┐
│ Scenario title                  │
│ Context                         │
├─────────────────────────────────┤
│                                 │
│ NPC message                     │
│                                 │
│ User message                    │
│                                 │
│ NPC message                     │
│                                 │
├─────────────────────────────────┤
│ [ message input ]        Send   │
└─────────────────────────────────┘
```

The engine should not expose hidden state by default.

---

# 35. Debug Mode

Create a developer-only debug panel.

Display:

```text
current world state

relationship state

scenario state

conversation state

active goals

triggered events

retrieved memories

LLM structured analysis

NPC action plan
```

This will be essential for debugging behavior.

---

# 36. Recommended Tech Stack

Suggested:

```text
Next.js
TypeScript
React
Tailwind CSS
shadcn/ui

PostgreSQL
Prisma

Zod

LLM API
```

Optional later:

```text
Redis
Vector database
```

Do not introduce a vector database until memory scale requires it.

---

# 37. Recommended Project Structure

```text
/src

  /app

  /components

  /engine
    /runtime
    /state
    /events
    /goals
    /conditions
    /effects
    /memory
    /branching

  /llm
    /interpreter
    /decision
    /renderer
    /evaluation

  /content
    /loader
    /validator

  /db

  /types
```

The `engine` folder should not depend on any particular content package.

---

# 38. Database Models

Initial database models:

```text
User

WorldInstance

CharacterInstance

RelationshipInstance

Memory

ScenarioInstance

Conversation

ConversationBranch

Message

StateSnapshot

GoalState

EventLog

Evaluation
```

Separate:

```text
definition
```

from:

```text
runtime instance
```

For example:

```text
ScenarioDefinition
vs
ScenarioInstance
```

---

# 39. Definition vs Instance

This distinction is critical.

Example:

```text
Professor Miller
```

definition:

```text
default personality
default communication style
```

instance:

```text
current memories
current relationship with user
current state
```

Likewise:

```text
ScenarioDefinition
```

defines reusable content.

```text
ScenarioInstance
```

stores one actual playthrough.

---

# 40. Deterministic State Mutation

Avoid allowing the LLM to directly rewrite arbitrary application state.

Preferred flow:

```text
LLM proposes changes
↓
Zod validation
↓
Engine applies allowed changes
```

Example:

LLM:

```json
{
  "changes": [
    {
      "path": "relationship.tension",
      "operation": "increment",
      "value": 0.1
    }
  ]
}
```

Engine validates:

```text
path exists

operation allowed

value within range
```

Then applies the mutation.

---

# 41. Security / Prompt Separation

Keep separate system prompts for:

```text
content instructions

character definition

engine instructions

user messages
```

Never allow scenario content to override engine safety or output schemas.

Use structured outputs wherever possible.

---

# 42. Logging

Log:

```text
LLM request

structured result

validation failures

state mutations

events

goal updates

memory retrieval

completion decisions
```

This system will be difficult to debug without detailed runtime logs.

---

# 43. MVP Scope

The first MVP should prove only the engine.

Do NOT build the full training curriculum yet.

Implement:

```text
1 world

3 characters

3 relationships

3 scenarios

persistent state

persistent memory

goals

events

conversation

state snapshots

branching

one generic evaluator

debug panel
```

The scenarios can be temporary test content.

Their purpose is only to test the system.

---

# 44. MVP Test Cases

Create scenarios specifically for engine testing.

## Scenario A

Tests:

```text
basic multi-turn dialogue

NPC goals

relationship state changes
```

---

## Scenario B

Tests:

```text
event triggers

hidden goal

memory retrieval
```

---

## Scenario C

Tests:

```text
branching

state restore

replay
```

Do not spend significant time polishing these scenarios.

They are system tests.

---

# 45. Implementation Order

Implement in this order.

```text
1. Initialize project

2. Define domain ontology

3. Define TypeScript types

4. Define Zod schemas

5. Define database schema

6. Build content loader

7. Build content validator

8. Build world / character / relationship loading

9. Build runtime state

10. Build conversations

11. Build message persistence

12. Implement LLM interaction interpreter

13. Implement controlled state mutation

14. Implement goal system

15. Implement condition system

16. Implement event system

17. Implement NPC decision model

18. Implement natural-language renderer

19. Implement memory creation

20. Implement memory retrieval

21. Implement scenario completion

22. Implement state snapshots

23. Implement branching

24. Implement evaluation hooks

25. Build minimal UI

26. Build debug panel
```

After each major step:

```text
run lint

run TypeScript checks

run tests

fix errors before continuing
```

---

# 46. Testing Strategy

Unit-test deterministic components heavily.

Test:

```text
conditions

state mutations

goals

event triggers

branch restoration

content validation

completion conditions
```

Do not rely on LLM tests for deterministic logic.

For LLM components, test:

```text
schema compliance

reasonable structured outputs

fallback behavior
```

---

# 47. Fallback Behavior

LLM failures must not break the scenario.

If structured output fails:

```text
retry once
```

If it still fails:

```text
use safe default behavior

preserve current state

log failure
```

---

# 48. Important Non-Goals

Do not implement yet:

```text
20 training themes

large curriculum

complex skill scoring

adaptive training

large character library

production authentication

advanced visual design

gamification
```

These belong to later phases.

---

# 49. System Success Criteria

Before designing substantial training content, the engine should demonstrate all of the following:

```text
Characters persist across scenarios.

Relationships change over time.

NPCs pursue their own goals.

Past events can affect future conversations.

Events can alter a scenario dynamically.

The same scenario can develop differently depending on user behavior.

A conversation can be replayed from an earlier point.

Branches preserve independent state.

Content can be added without modifying engine code.

Different evaluators can be attached to the same engine.
```

---

# 50. Design Principle

The most important architectural rule is:

```text
The simulation engine should know how interactions work.

It should not know what interactions mean pedagogically.
```

Pedagogical meaning belongs to the content and evaluation layers.

First build a strong general-purpose interaction system.

Only after the engine is stable should the project begin designing the actual social-communication curriculum.
