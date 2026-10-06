import { z } from "zod";
import { idSchema } from "./primitives";

export const memoryOwnerTypeSchema = z.enum(["character", "relationship", "world"]);

export const memorySchema = z.object({
  id: z.string().min(1),
  ownerType: memoryOwnerTypeSchema,
  ownerId: z.string().min(1),
  content: z.string().min(1),
  type: z.string().optional(),
  importance: z.number().min(0).max(1),
  emotionalWeight: z.number().min(-1).max(1).optional(),
  tags: z.array(z.string()).default([]),
  sourceConversationId: z.string().optional(),
  sourceMessageIds: z.array(z.string()).default([]),
  createdAt: z.coerce.date(),
});

/** Shape authored in content packages, where ids and timestamps are assigned at seed time. */
export const seedMemorySchema = memorySchema
  .omit({ id: true, createdAt: true, ownerType: true, ownerId: true })
  .extend({
    id: idSchema.optional(),
    ownerType: memoryOwnerTypeSchema,
    ownerId: idSchema,
  });

export type MemoryOwnerType = z.infer<typeof memoryOwnerTypeSchema>;
export type Memory = z.infer<typeof memorySchema>;
export type SeedMemory = z.infer<typeof seedMemorySchema>;
