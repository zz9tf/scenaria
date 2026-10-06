import { z } from "zod";
import { conditionDefinitionSchema } from "./condition";
import { idSchema } from "./primitives";

export const goalStatusSchema = z.enum([
  "inactive",
  "active",
  "completed",
  "failed",
  "abandoned",
]);

export const goalDefinitionSchema = z.object({
  id: idSchema,
  ownerId: idSchema,
  description: z.string().min(1),
  priority: z.number().min(0).max(1).default(0.5),
  hidden: z.boolean().default(false),
  status: goalStatusSchema.default("active"),
  completionCondition: conditionDefinitionSchema.optional(),
  failureCondition: conditionDefinitionSchema.optional(),
});

export type GoalStatus = z.infer<typeof goalStatusSchema>;
export type GoalDefinition = z.infer<typeof goalDefinitionSchema>;
