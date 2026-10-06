import { z } from "zod";
import { jsonObjectSchema } from "./primitives";

export interface ConditionDefinition {
  type?: string;
  parameters?: Record<string, unknown>;
  all?: ConditionDefinition[];
  any?: ConditionDefinition[];
  not?: ConditionDefinition;
}

/**
 * `type` is intentionally an open string: condition kinds live in a runtime registry so
 * content packages can be validated against the registry rather than against this schema.
 */
export const conditionDefinitionSchema: z.ZodType<ConditionDefinition> = z.lazy(() =>
  z
    .object({
      type: z.string().min(1).optional(),
      parameters: jsonObjectSchema.optional(),
      all: z.array(conditionDefinitionSchema).optional(),
      any: z.array(conditionDefinitionSchema).optional(),
      not: conditionDefinitionSchema.optional(),
    })
    .refine(
      (value) =>
        value.type !== undefined ||
        value.all !== undefined ||
        value.any !== undefined ||
        value.not !== undefined,
      { message: "condition must declare a type or a combinator (all/any/not)" },
    ),
);
