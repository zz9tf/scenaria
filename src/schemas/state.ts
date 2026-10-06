import { z } from "zod";
import { jsonObjectSchema, jsonValueSchema, statePathSchema } from "./primitives";

export const simulationStateSchema = z.object({
  world: jsonObjectSchema.default({}),
  /** Keyed by relationship id. */
  relationships: z.record(z.string(), jsonObjectSchema).default({}),
  scenario: jsonObjectSchema.default({}),
  conversation: jsonObjectSchema.default({}),
});

export const stateOperationSchema = z.enum(["set", "increment", "multiply", "append", "delete"]);

/** A single validated mutation. LLM-proposed changes are narrowed to this shape before being applied. */
export const stateChangeSchema = z.object({
  path: statePathSchema,
  operation: stateOperationSchema,
  value: jsonValueSchema.optional(),
  reason: z.string().optional(),
});

export const stateMutationPolicySchema = z.object({
  /** Path prefixes an LLM proposal is permitted to touch. */
  allowedPathPrefixes: z.array(z.string()).default(["relationships.", "conversation.", "scenario."]),
  allowedOperations: z.array(stateOperationSchema).default(["set", "increment"]),
  numericRange: z.tuple([z.number(), z.number()]).default([0, 1]),
  /** Largest absolute delta a single `increment` proposal may apply. */
  maxIncrement: z.number().positive().default(0.25),
});

export type SimulationState = z.infer<typeof simulationStateSchema>;
export type StateOperation = z.infer<typeof stateOperationSchema>;
export type StateChange = z.infer<typeof stateChangeSchema>;
export type StateMutationPolicy = z.infer<typeof stateMutationPolicySchema>;
