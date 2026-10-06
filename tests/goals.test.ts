import { describe, expect, it } from "vitest";
import { evaluateCompletion } from "@/engine/goals/completion";
import { initialGoalStatuses, resolveGoals } from "@/engine/goals/resolve";
import { completionRuleSchema, goalDefinitionSchema } from "@/schemas";
import { testContext } from "./helpers/context";

const goal = (raw: Record<string, unknown>) => goalDefinitionSchema.parse(raw);
const rule = (raw: Record<string, unknown>) => completionRuleSchema.parse(raw);

describe("resolveGoals", () => {
  const goals = [
    goal({
      id: "g1",
      ownerId: "user",
      description: "Reach agreement.",
      completionCondition: { type: "state_threshold", parameters: { path: "scenario.agreed", operator: "==", value: true } },
      failureCondition: { type: "state_threshold", parameters: { path: "scenario.walkedOut", operator: "==", value: true } },
    }),
  ];

  it("reports no change while neither condition holds", () => {
    expect(resolveGoals(goals, testContext())).toEqual([]);
  });

  it("completes a goal when its condition holds", () => {
    const context = testContext({
      state: { world: {}, relationships: {}, scenario: { agreed: true }, conversation: {} },
      goalStatuses: initialGoalStatuses(goals),
    });
    expect(resolveGoals(goals, context)).toEqual([
      { goalId: "g1", ownerId: "user", hidden: false, previous: "active", status: "completed" },
    ]);
  });

  it("prefers failure when both conditions hold", () => {
    const context = testContext({
      state: { world: {}, relationships: {}, scenario: { agreed: true, walkedOut: true }, conversation: {} },
      goalStatuses: initialGoalStatuses(goals),
    });
    expect(resolveGoals(goals, context)[0]?.status).toBe("failed");
  });

  it("never revisits a terminal goal", () => {
    const context = testContext({
      state: { world: {}, relationships: {}, scenario: { agreed: true }, conversation: {} },
      goalStatuses: new Map([["g1", "abandoned" as const]]),
    });
    expect(resolveGoals(goals, context)).toEqual([]);
  });
});

describe("evaluateCompletion", () => {
  it("returns undefined when no rule fires", () => {
    expect(evaluateCompletion([rule({ type: "turn_limit", parameters: { limit: 5 } })], [], testContext())).toBeUndefined();
  });

  it("fires the turn limit", () => {
    const decision = evaluateCompletion(
      [rule({ type: "turn_limit", outcome: "natural_end", parameters: { limit: 3 } })],
      [],
      testContext({ turnIndex: 3 }),
    );
    expect(decision?.outcome).toBe("natural_end");
    expect(decision?.ruleType).toBe("turn_limit");
  });

  it("returns the first matching rule in authoring order", () => {
    const decision = evaluateCompletion(
      [
        rule({ type: "user_exit", outcome: "abandoned" }),
        rule({ type: "turn_limit", outcome: "natural_end", parameters: { limit: 1 } }),
      ],
      [],
      testContext({ turnIndex: 5, exitBy: "user" }),
    );
    expect(decision?.outcome).toBe("abandoned");
  });

  it("never fires a condition rule that has no condition", () => {
    expect(evaluateCompletion([rule({ type: "condition" })], [], testContext())).toBeUndefined();
  });

  it("fires goal_resolution only once every tracked goal is terminal", () => {
    const goals = [
      goal({ id: "g1", ownerId: "user", description: "a" }),
      goal({ id: "g2", ownerId: "npc", description: "b" }),
    ];
    const rules = [rule({ type: "goal_resolution", outcome: "completed", parameters: { goalIds: ["g1", "g2"] } })];

    expect(
      evaluateCompletion(rules, goals, testContext({ goalStatuses: new Map([["g1", "completed"], ["g2", "active"]]) })),
    ).toBeUndefined();

    expect(
      evaluateCompletion(rules, goals, testContext({ goalStatuses: new Map([["g1", "completed"], ["g2", "failed"]]) }))
        ?.outcome,
    ).toBe("completed");
  });
});
