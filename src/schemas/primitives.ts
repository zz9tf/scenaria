import { z } from "zod";

/** Identifiers are content-authored, so they are constrained to a URL/file-safe shape. */
export const idSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/, "must be alphanumeric with _ . : - separators");

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const jsonObjectSchema = z.record(z.string(), jsonValueSchema);

/** A scalar usable as simulation state or as a trait/style value. */
export const scalarSchema = z.union([z.string(), z.number(), z.boolean()]);
export type Scalar = z.infer<typeof scalarSchema>;

/**
 * Dotted path into `SimulationState`, e.g. `relationships.rel_a.tension`.
 * Rejects empty segments so a malformed path cannot silently create a `""` key.
 */
export const statePathSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9_][A-Za-z0-9_.:-]*$/, "must be a dotted state path")
  .refine((value) => !value.split(".").some((segment) => segment.length === 0), {
    message: "state path segments must not be empty",
  });

export const comparisonOperatorSchema = z.enum(["==", "!=", ">", ">=", "<", "<="]);
export type ComparisonOperator = z.infer<typeof comparisonOperatorSchema>;

/** Normalized 0..1 magnitude, the convention used by MVP content for traits and relationship dimensions. */
export const unitScalarSchema = z.number().min(0).max(1);
