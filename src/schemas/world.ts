import { z } from "zod";
import { idSchema, jsonObjectSchema } from "./primitives";

export const worldSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  metadata: jsonObjectSchema.default({}),
  globalState: jsonObjectSchema.default({}),
  characterIds: z.array(idSchema).default([]),
});

export type World = z.infer<typeof worldSchema>;
