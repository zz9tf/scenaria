import { z } from "zod";
import { idSchema, jsonObjectSchema } from "./primitives";

/** §31. Lists are file stems relative to the package's per-kind directories. */
export const packageManifestSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  worlds: z.array(z.string()).default([]),
  characters: z.array(z.string()).default([]),
  relationships: z.array(z.string()).default([]),
  scenarios: z.array(z.string()).default([]),
  stories: z.array(z.string()).default([]),
  evaluators: z.array(z.string()).default([]),
  memories: z.array(z.string()).default([]),
  metadata: jsonObjectSchema.default({}),
});

export type PackageManifest = z.infer<typeof packageManifestSchema>;
