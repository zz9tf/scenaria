import type { EngineContext } from "@/engine/context";
import { UnknownEffectTypeError } from "@/engine/errors";
import { applyStateChange } from "@/engine/state/mutate";
import {
  goalStatusSchema,
  jsonValueSchema,
  memoryOwnerTypeSchema,
  statePathSchema,
} from "@/schemas";
import type { EffectDefinition, GoalStatus, ScenarioOutcome, SeedMemory, SimulationState } from "@/types";
import { z } from "zod";

/** Everything an effect batch can produce besides a new state. */
export interface EffectOutcome {
  state: SimulationState;
  goalUpdates: Array<{ goalId: string; status: GoalStatus }>;
  createdMemories: SeedMemory[];
  /** Narrative nudges injected into the next NPC prompt as engine-authored context. */
  systemContext: string[];
  addedCharacterIds: string[];
  removedCharacterIds: string[];
  endScenario?: { outcome: ScenarioOutcome; reason?: string };
}

export type EffectHandler = (
  outcome: EffectOutcome,
  context: EngineContext,
  parameters: Record<string, unknown>,
) => EffectOutcome;

export interface EffectKind {
  type: string;
  description: string;
  parameters: z.ZodType<Record<string, unknown>>;
  apply: EffectHandler;
}

const statePayload = z.object({ path: statePathSchema, value: jsonValueSchema });
const numericPayload = z.object({ path: statePathSchema, amount: z.number() });
const goalPayload = z.object({ goalId: z.string() });

function mutate(
  outcome: EffectOutcome,
  path: string,
  operation: "set" | "increment" | "multiply" | "append" | "delete",
  value?: unknown,
): EffectOutcome {
  return {
    ...outcome,
    state: applyStateChange(
      outcome.state,
      { path, operation, value: value as never },
      { trusted: true },
    ),
  };
}

function withGoal(outcome: EffectOutcome, goalId: string, status: GoalStatus): EffectOutcome {
  return { ...outcome, goalUpdates: [...outcome.goalUpdates, { goalId, status }] };
}

const KINDS: EffectKind[] = [
  {
    type: "set_state",
    description: "Writes a value at a state path.",
    parameters: statePayload,
    apply: (outcome, _context, parameters) => {
      const { path, value } = statePayload.parse(parameters);
      return mutate(outcome, path, "set", value);
    },
  },
  {
    type: "increment_state",
    description: "Adds an amount to a numeric state path.",
    parameters: numericPayload,
    apply: (outcome, _context, parameters) => {
      const { path, amount } = numericPayload.parse(parameters);
      return mutate(outcome, path, "increment", amount);
    },
  },
  {
    type: "multiply_state",
    description: "Multiplies a numeric state path.",
    parameters: numericPayload.extend({ amount: z.number() }),
    apply: (outcome, _context, parameters) => {
      const { path, amount } = numericPayload.parse(parameters);
      return mutate(outcome, path, "multiply", amount);
    },
  },
  {
    type: "append_state",
    description: "Appends a value to an array state path.",
    parameters: statePayload,
    apply: (outcome, _context, parameters) => {
      const { path, value } = statePayload.parse(parameters);
      return mutate(outcome, path, "append", value);
    },
  },
  {
    type: "delete_state",
    description: "Removes a state path.",
    parameters: z.object({ path: statePathSchema }),
    apply: (outcome, _context, parameters) => {
      const { path } = z.object({ path: statePathSchema }).parse(parameters);
      return mutate(outcome, path, "delete");
    },
  },
  {
    type: "activate_goal",
    description: "Marks a goal active.",
    parameters: goalPayload,
    apply: (outcome, _context, parameters) =>
      withGoal(outcome, goalPayload.parse(parameters).goalId, "active"),
  },
  {
    type: "complete_goal",
    description: "Marks a goal completed.",
    parameters: goalPayload,
    apply: (outcome, _context, parameters) =>
      withGoal(outcome, goalPayload.parse(parameters).goalId, "completed"),
  },
  {
    type: "set_goal_status",
    description: "Sets an explicit goal status.",
    parameters: goalPayload.extend({ status: goalStatusSchema }),
    apply: (outcome, _context, parameters) => {
      const { goalId, status } = goalPayload.extend({ status: goalStatusSchema }).parse(parameters);
      return withGoal(outcome, goalId, status);
    },
  },
  {
    type: "create_memory",
    description: "Creates a persistent memory for a character, relationship or world.",
    parameters: z.object({
      ownerType: memoryOwnerTypeSchema,
      ownerId: z.string(),
      content: z.string().min(1),
      type: z.string().optional(),
      importance: z.number().min(0).max(1).default(0.5),
      emotionalWeight: z.number().min(-1).max(1).optional(),
      tags: z.array(z.string()).default([]),
    }),
    apply: (outcome, _context, parameters) => {
      const memory = z
        .object({
          ownerType: memoryOwnerTypeSchema,
          ownerId: z.string(),
          content: z.string().min(1),
          type: z.string().optional(),
          importance: z.number().min(0).max(1).default(0.5),
          emotionalWeight: z.number().min(-1).max(1).optional(),
          tags: z.array(z.string()).default([]),
        })
        .parse(parameters);
      return { ...outcome, createdMemories: [...outcome.createdMemories, { ...memory, sourceMessageIds: [] }] };
    },
  },
  {
    type: "emit_system_context",
    description: "Injects engine-authored narrative context into the next NPC prompt.",
    parameters: z.object({ content: z.string().min(1) }),
    apply: (outcome, _context, parameters) => {
      const { content } = z.object({ content: z.string().min(1) }).parse(parameters);
      return { ...outcome, systemContext: [...outcome.systemContext, content] };
    },
  },
  {
    type: "add_character",
    description: "Brings a character into the scene.",
    parameters: z.object({ characterId: z.string() }),
    apply: (outcome, _context, parameters) => {
      const { characterId } = z.object({ characterId: z.string() }).parse(parameters);
      return { ...outcome, addedCharacterIds: [...outcome.addedCharacterIds, characterId] };
    },
  },
  {
    type: "remove_character",
    description: "Removes a character from the scene.",
    parameters: z.object({ characterId: z.string() }),
    apply: (outcome, _context, parameters) => {
      const { characterId } = z.object({ characterId: z.string() }).parse(parameters);
      return { ...outcome, removedCharacterIds: [...outcome.removedCharacterIds, characterId] };
    },
  },
  {
    type: "end_scenario",
    description: "Ends the scenario with an outcome.",
    parameters: z.object({
      outcome: z
        .enum(["completed", "partially_completed", "failed", "abandoned", "natural_end"])
        .default("natural_end"),
      reason: z.string().optional(),
    }),
    apply: (outcome, _context, parameters) => {
      const parsed = z
        .object({
          outcome: z
            .enum(["completed", "partially_completed", "failed", "abandoned", "natural_end"])
            .default("natural_end"),
          reason: z.string().optional(),
        })
        .parse(parameters);
      return { ...outcome, endScenario: parsed };
    },
  },
];

const REGISTRY = new Map(KINDS.map((kind) => [kind.type, kind]));

export function getEffectKind(type: string): EffectKind {
  const kind = REGISTRY.get(type);
  if (!kind) {
    throw new UnknownEffectTypeError(`unknown effect type '${type}'`, { known: [...REGISTRY.keys()] });
  }
  return kind;
}

export function effectTypes(): string[] {
  return [...REGISTRY.keys()];
}

export function emptyEffectOutcome(state: SimulationState): EffectOutcome {
  return {
    state,
    goalUpdates: [],
    createdMemories: [],
    systemContext: [],
    addedCharacterIds: [],
    removedCharacterIds: [],
  };
}

/** Folds a batch of trusted, content-authored effects into one outcome. */
export function applyEffects(
  effects: EffectDefinition[],
  context: EngineContext,
  outcome: EffectOutcome,
): EffectOutcome {
  return effects.reduce(
    (accumulated, effect) =>
      getEffectKind(effect.type).apply(accumulated, { ...context, state: accumulated.state }, effect.parameters),
    outcome,
  );
}
