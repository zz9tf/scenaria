import { z } from "zod";
import { idSchema, jsonObjectSchema, scalarSchema } from "./primitives";

export const relationshipEventSchema = z.object({
  id: idSchema,
  summary: z.string().min(1),
  occurredAt: z.coerce.date(),
  stateDelta: z.record(z.string(), z.number()).default({}),
});

export const relationshipSchema = z.object({
  id: idSchema,
  participantAId: idSchema,
  participantBId: idSchema,
  type: z.string().optional(),
  /** Dimensions are author-defined; the engine stores them generically. */
  state: z.record(z.string(), scalarSchema).default({}),
  history: z.array(relationshipEventSchema).default([]),
  metadata: jsonObjectSchema.default({}),
});

export type RelationshipEvent = z.infer<typeof relationshipEventSchema>;
export type Relationship = z.infer<typeof relationshipSchema>;
