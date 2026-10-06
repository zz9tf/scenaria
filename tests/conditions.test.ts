import { describe, expect, it } from "vitest";
import { evaluateCondition } from "@/engine/conditions/evaluate";
import { conditionTypes, getConditionKind } from "@/engine/conditions/registry";
import { UnknownConditionTypeError } from "@/engine/errors";
import { interactionAnalysisSchema } from "@/schemas";
import { testContext } from "./helpers/context";

describe("condition registry", () => {
  it("throws on an unknown type rather than defaulting to false", () => {
    expect(() => getConditionKind("no_such_condition")).toThrow(UnknownConditionTypeError);
  });

  it("exposes its known types for content validation", () => {
    expect(conditionTypes()).toContain("state_threshold");
    expect(conditionTypes()).toContain("goal_status");
  });
});

describe("evaluateCondition", () => {
  it("treats an absent condition as satisfied", () => {
    expect(evaluateCondition(undefined, testContext())).toBe(true);
  });

  it("compares numeric state", () => {
    const context = testContext({
      state: { world: {}, relationships: { rel: { tension: 0.75 } }, scenario: {}, conversation: {} },
    });
    const condition = {
      type: "state_threshold",
      parameters: { path: "relationships.rel.tension", operator: ">=", value: 0.7 },
    };
    expect(evaluateCondition(condition, context)).toBe(true);
    expect(
      evaluateCondition(
        { type: "state_threshold", parameters: { path: "relationships.rel.tension", operator: "<", value: 0.7 } },
        context,
      ),
    ).toBe(false);
  });

  it("returns false for ordering comparisons against a missing path", () => {
    expect(
      evaluateCondition(
        { type: "state_threshold", parameters: { path: "scenario.missing", operator: ">=", value: 1 } },
        testContext(),
      ),
    ).toBe(false);
  });

  it("combines all / any / not conjunctively", () => {
    const context = testContext({ turnIndex: 3, goalStatuses: new Map([["g1", "active"]]) });
    const condition = {
      all: [
        { type: "turn_count", parameters: { operator: ">=", value: 3 } },
        { type: "goal_status", parameters: { goalId: "g1", status: "active" } },
      ],
      not: { type: "event_fired", parameters: { eventId: "e1" } },
    };
    expect(evaluateCondition(condition, context)).toBe(true);

    context.firedEventIds.add("e1");
    expect(evaluateCondition(condition, context)).toBe(false);
  });

  it("matches intents and topics from the latest analysis", () => {
    const context = testContext({
      lastAnalysis: interactionAnalysisSchema.parse({
        intents: ["request", "explanation"],
        topics: ["deadline"],
        inferredSignals: { uncertainty: 0.8 },
      }),
    });

    expect(evaluateCondition({ type: "intent_present", parameters: { values: ["request"] } }, context)).toBe(true);
    expect(
      evaluateCondition({ type: "intent_present", parameters: { values: ["request", "apology"], mode: "all" } }, context),
    ).toBe(false);
    expect(evaluateCondition({ type: "topic_mentioned", parameters: { values: ["DEADLINE"] } }, context)).toBe(true);
    expect(
      evaluateCondition(
        { type: "signal_threshold", parameters: { signal: "uncertainty", operator: ">=", value: 0.6 } },
        context,
      ),
    ).toBe(true);
  });

  it("counts messages per sender", () => {
    const context = testContext({
      messages: [
        { id: "m1", conversationId: "c", turnIndex: 1, senderId: "user", senderKind: "user", content: "a", createdAt: new Date() },
        { id: "m2", conversationId: "c", turnIndex: 1, senderId: "npc", senderKind: "npc", content: "b", createdAt: new Date() },
        { id: "m3", conversationId: "c", turnIndex: 2, senderId: "user", senderKind: "user", content: "c", createdAt: new Date() },
      ],
    });
    expect(
      evaluateCondition({ type: "message_count", parameters: { senderId: "user", operator: "==", value: 2 } }, context),
    ).toBe(true);
  });
});
