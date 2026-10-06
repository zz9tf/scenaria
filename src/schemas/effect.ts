import { z } from "zod";
import { jsonObjectSchema } from "./primitives";

/** Open string for the same reason as `ConditionDefinition.type`: effects live in a registry. */
export const effectDefinitionSchema = z.object({
  type: z.string().min(1),
  parameters: jsonObjectSchema.default({}),
});

export type EffectDefinition = z.infer<typeof effectDefinitionSchema>;
