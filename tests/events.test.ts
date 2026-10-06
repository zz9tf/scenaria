import { describe, expect, it } from "vitest";
import { emptyEffectOutcome } from "@/engine/effects/registry";
import { runEventPass } from "@/engine/events/trigger";
import { getStateValue } from "@/engine/state/path";
import { eventDefinitionSchema } from "@/schemas";
import { testContext } from "./helpers/context";

const event = (raw: Record<string, unknown>) => eventDefinitionSchema.parse(raw);

describe("runEventPass", () => {
  it("only considers events for the requested trigger", () => {
    const context = testContext();
    const result = runEventPass(
      "after_user_message",
      [
        event({ id: "e1", trigger: "after_user_message", effects: [{ type: "set_state", parameters: { path: "scenario.a", value: 1 } }] }),
        event({ id: "e2", trigger: "scenario_start", effects: [{ type: "set_state", parameters: { path: "scenario.b", value: 1 } }] }),
      ],
      context,
      emptyEffectOutcome(context.state),
    );

    expect(result.triggered.map((entry) => entry.eventId)).toEqual(["e1"]);
    expect(getStateValue(result.outcome.state, "scenario.b")).toBeUndefined();
  });

  it("applies higher priority first and lets later conditions see earlier writes", () => {
    const context = testContext();
    const result = runEventPass(
      "after_user_message",
      [
        event({
          id: "reaction",
          trigger: "after_user_message",
          priority: 0,
          condition: { type: "state_threshold", parameters: { path: "scenario.opened", operator: "==", value: true } },
          effects: [{ type: "set_state", parameters: { path: "scenario.reacted", value: true } }],
        }),
        event({
          id: "opener",
          trigger: "after_user_message",
          priority: 10,
          effects: [{ type: "set_state", parameters: { path: "scenario.opened", value: true } }],
        }),
      ],
      context,
      emptyEffectOutcome(context.state),
    );

    expect(result.triggered.map((entry) => entry.eventId)).toEqual(["opener", "reaction"]);
    expect(getStateValue(result.outcome.state, "scenario.reacted")).toBe(true);
  });

  it("fires a `once` event a single time and a repeatable event every pass", () => {
    const context = testContext();
    const once = event({
      id: "once",
      trigger: "after_user_message",
      effects: [{ type: "increment_state", parameters: { path: "scenario.n", amount: 1 } }],
    });
    const repeat = event({
      id: "repeat",
      trigger: "after_user_message",
      once: false,
      effects: [{ type: "increment_state", parameters: { path: "scenario.m", amount: 1 } }],
    });

    let outcome = emptyEffectOutcome(context.state);
    for (let pass = 0; pass < 3; pass += 1) {
      outcome = runEventPass("after_user_message", [once, repeat], { ...context, state: outcome.state }, outcome).outcome;
    }

    expect(getStateValue(outcome.state, "scenario.n")).toBe(1);
    expect(getStateValue(outcome.state, "scenario.m")).toBe(3);
  });

  it("skips an event whose condition is unsatisfied without marking it fired", () => {
    const context = testContext();
    const blocked = event({
      id: "blocked",
      trigger: "after_user_message",
      condition: { type: "never" },
      effects: [{ type: "set_state", parameters: { path: "scenario.x", value: 1 } }],
    });

    const result = runEventPass("after_user_message", [blocked], context, emptyEffectOutcome(context.state));
    expect(result.triggered).toHaveLength(0);
    expect(context.firedEventIds.has("blocked")).toBe(false);
  });
});
