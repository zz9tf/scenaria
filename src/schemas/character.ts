import { z } from "zod";
import { conditionDefinitionSchema } from "./condition";
import { idSchema, jsonObjectSchema, scalarSchema } from "./primitives";

export const characterProfileSchema = z.object({
  summary: z.string().min(1),
  background: z.string().optional(),
  appearance: z.string().optional(),
  voice: z.string().optional(),
});

export const knowledgeEntrySchema = z.object({
  id: idSchema,
  content: z.string().min(1),
  /** When false, the character knows the fact but will not volunteer it unprompted. */
  shareable: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
});

/** Standing goals that belong to the character across scenarios, unlike `GoalDefinition`. */
export const characterGoalSchema = z.object({
  id: idSchema,
  description: z.string().min(1),
  priority: z.number().min(0).max(1).default(0.5),
  hidden: z.boolean().default(false),
  completionCondition: conditionDefinitionSchema.optional(),
});

export const characterSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  role: z.string().optional(),
  profile: characterProfileSchema,
  /** Engine never interprets trait semantics; only the LLM and content layers do. */
  traits: z.record(z.string(), scalarSchema).default({}),
  communicationStyle: z.record(z.string(), scalarSchema).default({}),
  goals: z.array(characterGoalSchema).default([]),
  preferences: z.array(z.string()).default([]),
  dislikes: z.array(z.string()).default([]),
  knowledge: z.array(knowledgeEntrySchema).default([]),
  metadata: jsonObjectSchema.default({}),
});

export type CharacterProfile = z.infer<typeof characterProfileSchema>;
export type KnowledgeEntry = z.infer<typeof knowledgeEntrySchema>;
export type CharacterGoal = z.infer<typeof characterGoalSchema>;
export type Character = z.infer<typeof characterSchema>;
