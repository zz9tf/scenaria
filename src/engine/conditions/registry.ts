import { UnknownConditionTypeError } from "@/engine/errors";
import type { EngineContext } from "@/engine/context";
import { getStateValue, hasStatePath } from "@/engine/state/path";
import { comparisonOperatorSchema, goalStatusSchema, statePathSchema } from "@/schemas";
import type { ComparisonOperator } from "@/types";
import { z } from "zod";

export type ConditionHandler = (
  context: EngineContext,
  parameters: Record<string, unknown>,
) => boolean;

export interface ConditionKind {
  type: string;
  description: string;
  parameters: z.ZodType<Record<string, unknown>>;
  evaluate: ConditionHandler;
}

function compare(left: unknown, operator: ComparisonOperator, right: unknown): boolean {
  switch (operator) {
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    default:
      break;
  }
  if (typeof left !== "number" || typeof right !== "number") return false;
  switch (operator) {
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
  }
}

const comparisonParams = z.object({
  path: statePathSchema,
  operator: comparisonOperatorSchema,
  value: z.union([z.number(), z.string(), z.boolean()]),
});

const countParams = z.object({
  operator: comparisonOperatorSchema,
  value: z.number(),
});

const listMatchParams = z.object({
  values: z.array(z.string()).min(1),
  mode: z.enum(["any", "all"]).default("any"),
});

function matchList(actual: string[], values: string[], mode: "any" | "all"): boolean {
  const set = new Set(actual.map((entry) => entry.toLowerCase()));
  const wanted = values.map((entry) => entry.toLowerCase());
  return mode === "all" ? wanted.every((v) => set.has(v)) : wanted.some((v) => set.has(v));
}

const KINDS: ConditionKind[] = [
  {
    type: "always",
    description: "Always true. Useful for unconditional events.",
    parameters: z.object({}),
    evaluate: () => true,
  },
  {
    type: "never",
    description: "Always false. Useful for disabling content without deleting it.",
    parameters: z.object({}),
    evaluate: () => false,
  },
  {
    type: "state_threshold",
    description: "Compares a state path against a value.",
    parameters: comparisonParams,
    evaluate: (context, parameters) => {
      const { path, operator, value } = comparisonParams.parse(parameters);
      return compare(getStateValue(context.state, path), operator, value);
    },
  },
  {
    type: "state_exists",
    description: "True when the state path is present.",
    parameters: z.object({ path: statePathSchema }),
    evaluate: (context, parameters) => {
      const { path } = z.object({ path: statePathSchema }).parse(parameters);
      return hasStatePath(context.state, path);
    },
  },
  {
    type: "turn_count",
    description: "Compares the current turn index against a value.",
    parameters: countParams,
    evaluate: (context, parameters) => {
      const { operator, value } = countParams.parse(parameters);
      return compare(context.turnIndex, operator, value);
    },
  },
  {
    type: "goal_status",
    description: "True when a goal currently holds the given status.",
    parameters: z.object({ goalId: z.string(), status: goalStatusSchema }),
    evaluate: (context, parameters) => {
      const { goalId, status } = z
        .object({ goalId: z.string(), status: goalStatusSchema })
        .parse(parameters);
      return context.goalStatuses.get(goalId) === status;
    },
  },
  {
    type: "event_fired",
    description: "True once the referenced event has fired in this conversation.",
    parameters: z.object({ eventId: z.string() }),
    evaluate: (context, parameters) => {
      const { eventId } = z.object({ eventId: z.string() }).parse(parameters);
      return context.firedEventIds.has(eventId);
    },
  },
  {
    type: "intent_present",
    description: "Matches intents from the latest interaction analysis.",
    parameters: listMatchParams,
    evaluate: (context, parameters) => {
      const { values, mode } = listMatchParams.parse(parameters);
      return matchList(context.lastAnalysis?.intents ?? [], values, mode);
    },
  },
  {
    type: "topic_mentioned",
    description: "Matches topics from the latest interaction analysis.",
    parameters: listMatchParams,
    evaluate: (context, parameters) => {
      const { values, mode } = listMatchParams.parse(parameters);
      return matchList(context.lastAnalysis?.topics ?? [], values, mode);
    },
  },
  {
    type: "signal_threshold",
    description: "Compares an inferred signal from the latest interaction analysis.",
    parameters: z.object({
      signal: z.string(),
      operator: comparisonOperatorSchema,
      value: z.union([z.number(), z.string(), z.boolean()]),
    }),
    evaluate: (context, parameters) => {
      const { signal, operator, value } = z
        .object({
          signal: z.string(),
          operator: comparisonOperatorSchema,
          value: z.union([z.number(), z.string(), z.boolean()]),
        })
        .parse(parameters);
      return compare(context.lastAnalysis?.inferredSignals[signal], operator, value);
    },
  },
  {
    type: "message_count",
    description: "Compares how many messages a participant has sent.",
    parameters: countParams.extend({ senderId: z.string().optional() }),
    evaluate: (context, parameters) => {
      const { operator, value, senderId } = countParams
        .extend({ senderId: z.string().optional() })
        .parse(parameters);
      const count = context.messages.filter(
        (message) => senderId === undefined || message.senderId === senderId,
      ).length;
      return compare(count, operator, value);
    },
  },
  {
    type: "participant_exited",
    description: "True when the given side has signalled an exit.",
    parameters: z.object({ by: z.enum(["user", "npc"]) }),
    evaluate: (context, parameters) => {
      const { by } = z.object({ by: z.enum(["user", "npc"]) }).parse(parameters);
      return context.exitBy === by;
    },
  },
  {
    type: "character_present",
    description: "True when a character is currently part of the scene.",
    parameters: z.object({ characterId: z.string() }),
    evaluate: (context, parameters) => {
      const { characterId } = z.object({ characterId: z.string() }).parse(parameters);
      return context.activeCharacterIds.has(characterId);
    },
  },
];

const REGISTRY = new Map(KINDS.map((kind) => [kind.type, kind]));

export function getConditionKind(type: string): ConditionKind {
  const kind = REGISTRY.get(type);
  if (!kind) {
    throw new UnknownConditionTypeError(`unknown condition type '${type}'`, {
      known: [...REGISTRY.keys()],
    });
  }
  return kind;
}

export function conditionTypes(): string[] {
  return [...REGISTRY.keys()];
}
