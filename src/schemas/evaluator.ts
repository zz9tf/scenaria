import { z } from "zod";
import { idSchema, jsonObjectSchema } from "./primitives";

export const evaluatorSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  /** Which evaluation hooks (§26) this evaluator reads. Used to build its input bundle. */
  inputs: z
    .array(
      z.enum([
        "transcript",
        "state_history",
        "goal_history",
        "event_history",
        "memory_changes",
        "relationship_changes",
        "branch_info",
      ]),
    )
    .default(["transcript"]),
  /** JSON Schema describing the evaluator's structured verdict. */
  outputSchema: jsonObjectSchema,
  promptTemplate: z.string().min(1),
  metadata: jsonObjectSchema.default({}),
});

export type Evaluator = z.infer<typeof evaluatorSchema>;
export type EvaluatorInput = Evaluator["inputs"][number];
