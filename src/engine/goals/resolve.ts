import { evaluateCondition } from "@/engine/conditions/evaluate";
import type { EngineContext } from "@/engine/context";
import type { GoalDefinition, GoalStatus } from "@/types";

export interface GoalResolution {
  goalId: string;
  ownerId: string;
  hidden: boolean;
  previous: GoalStatus;
  status: GoalStatus;
}

const TERMINAL: ReadonlySet<GoalStatus> = new Set(["completed", "failed", "abandoned"]);

/**
 * Re-evaluates completion and failure conditions for every non-terminal goal.
 * Failure is checked first so a goal that satisfies both conditions resolves as failed.
 */
export function resolveGoals(goals: GoalDefinition[], context: EngineContext): GoalResolution[] {
  return goals.flatMap((goal) => {
    const previous = context.goalStatuses.get(goal.id) ?? goal.status;
    if (TERMINAL.has(previous)) return [];

    const next = nextStatus(goal, previous, context);
    if (next === previous) return [];
    return [{ goalId: goal.id, ownerId: goal.ownerId, hidden: goal.hidden, previous, status: next }];
  });
}

function nextStatus(
  goal: GoalDefinition,
  previous: GoalStatus,
  context: EngineContext,
): GoalStatus {
  if (goal.failureCondition && evaluateCondition(goal.failureCondition, context)) return "failed";
  if (goal.completionCondition && evaluateCondition(goal.completionCondition, context)) {
    return "completed";
  }
  return previous;
}

export function initialGoalStatuses(goals: GoalDefinition[]): Map<string, GoalStatus> {
  return new Map(goals.map((goal) => [goal.id, goal.status]));
}
