import type { EngineContext } from "@/engine/context";
import { getConditionKind } from "@/engine/conditions/registry";
import type { ConditionDefinition } from "@/types";

/**
 * Combinators are conjunctive: when a condition declares several of
 * `type` / `all` / `any` / `not`, every declared part must hold.
 */
export function evaluateCondition(
  condition: ConditionDefinition | undefined,
  context: EngineContext,
): boolean {
  if (!condition) return true;

  if (condition.all && !condition.all.every((child) => evaluateCondition(child, context))) {
    return false;
  }
  if (condition.any && !condition.any.some((child) => evaluateCondition(child, context))) {
    return false;
  }
  if (condition.not && evaluateCondition(condition.not, context)) {
    return false;
  }
  if (condition.type) {
    return getConditionKind(condition.type).evaluate(context, condition.parameters ?? {});
  }
  return true;
}
