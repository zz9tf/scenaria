import { z } from "zod";
import { conditionDefinitionSchema } from "./condition";
import { effectDefinitionSchema } from "./effect";
import { eventDefinitionSchema } from "./event";
import { goalDefinitionSchema } from "./goal";
import { idSchema, jsonObjectSchema } from "./primitives";
import { stateMutationPolicySchema } from "./state";

export const completionRuleSchema = z.object({
  type: z.enum(["condition", "goal_resolution", "npc_exit", "user_exit", "turn_limit", "custom"]),
  /** Outcome recorded on the instance when this rule fires. */
  outcome: z
    .enum(["completed", "partially_completed", "failed", "abandoned", "natural_end"])
    .default("natural_end"),
  condition: conditionDefinitionSchema.optional(),
  parameters: jsonObjectSchema.default({}),
});

export const scenarioRuleSchema = z.object({
  id: idSchema,
  description: z.string().min(1),
  /** Rendered into NPC prompts; rules are soft narrative constraints, not engine logic. */
  appliesTo: z.array(idSchema).default([]),
});

export const evaluatorReferenceSchema = z.object({
  evaluatorId: idSchema,
  parameters: jsonObjectSchema.default({}),
});

export const participantSchema = z.object({
  id: idSchema,
  /** Exactly one participant must be the user-controlled role. */
  kind: z.enum(["user", "npc"]),
  characterId: idSchema.optional(),
  displayName: z.string().optional(),
});

export const scenarioDefinitionSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    description: z.string().optional(),
    worldId: idSchema.optional(),
    participants: z.array(participantSchema).min(1),
    initialContext: z.string().min(1),
    initialState: jsonObjectSchema.default({}),
    /** Optional scripted first message so the NPC can open the scene. */
    openingMessage: z.object({ speakerId: idSchema, content: z.string().min(1) }).optional(),
    goals: z.array(goalDefinitionSchema).default([]),
    events: z.array(eventDefinitionSchema).default([]),
    rules: z.array(scenarioRuleSchema).default([]),
    evaluators: z.array(evaluatorReferenceSchema).default([]),
    completionRules: z.array(completionRuleSchema).default([]),
    onStart: z.array(effectDefinitionSchema).default([]),
    stateMutationPolicy: stateMutationPolicySchema.optional(),
    metadata: jsonObjectSchema.default({}),
  })
  .refine((value) => value.participants.filter((p) => p.kind === "user").length === 1, {
    message: "a scenario must declare exactly one participant of kind 'user'",
    path: ["participants"],
  });

export type CompletionRule = z.infer<typeof completionRuleSchema>;
export type ScenarioRule = z.infer<typeof scenarioRuleSchema>;
export type EvaluatorReference = z.infer<typeof evaluatorReferenceSchema>;
export type Participant = z.infer<typeof participantSchema>;
export type ScenarioDefinition = z.infer<typeof scenarioDefinitionSchema>;
export type ScenarioOutcome = CompletionRule["outcome"];
