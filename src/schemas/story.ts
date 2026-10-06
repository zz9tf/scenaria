import { z } from "zod";
import { conditionDefinitionSchema } from "./condition";
import { idSchema, jsonObjectSchema } from "./primitives";

export const storyChapterSchema = z.object({
  id: idSchema,
  scenarioId: idSchema,
  order: z.number().int().nonnegative(),
  unlockCondition: conditionDefinitionSchema.optional(),
});

export const storySchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  worldId: idSchema,
  chapters: z.array(storyChapterSchema).default([]),
  metadata: jsonObjectSchema.default({}),
});

export type StoryChapter = z.infer<typeof storyChapterSchema>;
export type Story = z.infer<typeof storySchema>;
