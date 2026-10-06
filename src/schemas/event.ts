import { z } from "zod";
import { conditionDefinitionSchema } from "./condition";
import { effectDefinitionSchema } from "./effect";
import { idSchema } from "./primitives";

export const eventTriggerSchema = z.enum([
  "scenario_start",
  "before_turn",
  "after_user_message",
  "after_npc_message",
  "state_change",
  "manual",
]);

export const eventDefinitionSchema = z.object({
  id: idSchema,
  trigger: eventTriggerSchema,
  condition: conditionDefinitionSchema.optional(),
  effects: z.array(effectDefinitionSchema).min(1),
  once: z.boolean().default(true),
  /** Higher priority events are evaluated and applied first within one trigger phase. */
  priority: z.number().default(0),
});

export type EventTrigger = z.infer<typeof eventTriggerSchema>;
export type EventDefinition = z.infer<typeof eventDefinitionSchema>;
