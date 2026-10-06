import { z } from "zod";
import { scalarSchema } from "./primitives";
import { stateChangeSchema } from "./state";

/**
 * Output of Model A (§19). Fields stay deliberately open-vocabulary: intent and topic
 * taxonomies belong to content packages, not to the engine.
 */
export const interactionAnalysisSchema = z.object({
  intents: z.array(z.string()).default([]),
  topics: z.array(z.string()).default([]),
  referencedEntities: z.array(z.string()).default([]),
  inferredSignals: z.record(z.string(), scalarSchema).default({}),
  proposedStateChanges: z.array(stateChangeSchema).default([]),
  triggeredFacts: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
});

/** Output of Model B (§19). */
export const npcActionPlanSchema = z.object({
  intent: z.string().min(1),
  emotionalResponse: z.string().default("neutral"),
  goalFocus: z.string().optional(),
  responseStrategy: z.string().min(1),
  /** Memory ids the character is deliberately drawing on, for debug traceability. */
  usedMemoryIds: z.array(z.string()).default([]),
  proposedStateChanges: z.array(stateChangeSchema).default([]),
  wantsToEndConversation: z.boolean().default(false),
});

export const speakActionSchema = z.object({
  type: z.literal("speak"),
  speakerId: z.string().min(1),
  content: z.string().min(1),
  tone: z.string().optional(),
});

export const internalStateActionSchema = z.object({
  type: z.literal("internal_state"),
  speakerId: z.string().min(1),
  changes: z.array(stateChangeSchema),
});

export const worldActionSchema = z.object({
  type: z.literal("world"),
  speakerId: z.string().min(1),
  description: z.string().min(1),
  changes: z.array(stateChangeSchema).default([]),
});

export const endConversationActionSchema = z.object({
  type: z.literal("end_conversation"),
  speakerId: z.string().min(1),
  reason: z.string().optional(),
});

export const npcActionSchema = z.discriminatedUnion("type", [
  speakActionSchema,
  internalStateActionSchema,
  worldActionSchema,
  endConversationActionSchema,
]);

/** Output of Model C (§19). */
export const renderedUtteranceSchema = z.object({
  content: z.string().min(1),
  tone: z.string().optional(),
});

/** Output of the memory extraction pass (§27). */
export const memoryExtractionSchema = z.object({
  memories: z
    .array(
      z.object({
        ownerType: z.enum(["character", "relationship", "world"]),
        ownerId: z.string().min(1),
        content: z.string().min(1),
        type: z.string().optional(),
        importance: z.number().min(0).max(1),
        emotionalWeight: z.number().min(-1).max(1).optional(),
        tags: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

export type InteractionAnalysis = z.infer<typeof interactionAnalysisSchema>;
export type NPCActionPlan = z.infer<typeof npcActionPlanSchema>;
export type SpeakAction = z.infer<typeof speakActionSchema>;
export type NPCAction = z.infer<typeof npcActionSchema>;
export type RenderedUtterance = z.infer<typeof renderedUtteranceSchema>;
export type MemoryExtraction = z.infer<typeof memoryExtractionSchema>;
