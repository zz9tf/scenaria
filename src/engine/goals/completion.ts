import { evaluateCondition } from "@/engine/conditions/evaluate";
import type { EngineContext } from "@/engine/context";
import type { CompletionRule, GoalDefinition, ScenarioOutcome } from "@/types";
import { z } from "zod";

export interface CompletionDecision {
  outcome: ScenarioOutcome;
  ruleType: CompletionRule["type"];
  reason: string;
}

const turnLimitParams = z.object({ limit: z.number().int().positive() });
const goalResolutionParams = z.object({
  goalIds: z.array(z.string()).default([]),
  ownerId: z.string().optional(),
});

/**
 * Returns the first rule that fires, in authoring order, so content controls precedence.
 * An empty rule list means the scenario only ends through an `end_scenario` effect.
 */
export function evaluateCompletion(
  rules: CompletionRule[],
  goals: GoalDefinition[],
  context: EngineContext,
): CompletionDecision | undefined {
  for (const rule of rules) {
    const reason = ruleFires(rule, goals, context);
    if (reason) return { outcome: rule.outcome, ruleType: rule.type, reason };
  }
  return undefined;
}

function ruleFires(
  rule: CompletionRule,
  goals: GoalDefinition[],
  context: EngineContext,
): string | undefined {
  switch (rule.type) {
    case "condition":
    case "custom":
      // An absent condition must never fire, unlike the permissive default elsewhere.
      if (!rule.condition) return undefined;
      return evaluateCondition(rule.condition, context) ? "completion condition satisfied" : undefined;
    case "turn_limit": {
      const { limit } = turnLimitParams.parse(rule.parameters);
      return context.turnIndex >= limit ? `turn limit ${limit} reached` : undefined;
    }
    case "user_exit":
      return context.exitBy === "user" ? "user left the conversation" : undefined;
    case "npc_exit":
      return context.exitBy === "npc" ? "npc left the conversation" : undefined;
    case "goal_resolution": {
      const { goalIds, ownerId } = goalResolutionParams.parse(rule.parameters);
      const tracked = goals.filter(
        (goal) =>
          (goalIds.length === 0 || goalIds.includes(goal.id)) &&
          (ownerId === undefined || goal.ownerId === ownerId),
      );
      if (tracked.length === 0) return undefined;
      const allResolved = tracked.every((goal) => {
        const status = context.goalStatuses.get(goal.id) ?? goal.status;
        return status === "completed" || status === "failed" || status === "abandoned";
      });
      return allResolved ? "all tracked goals resolved" : undefined;
    }
  }
}
