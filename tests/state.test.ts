import { describe, expect, it } from "vitest";
import { StateMutationError, StatePathError } from "@/engine/errors";
import { applyProposedChanges, applyStateChange, DEFAULT_MUTATION_POLICY } from "@/engine/state/mutate";
import { deleteStateValue, emptySimulationState, getStateValue, hasStatePath, setStateValue } from "@/engine/state/path";

const base = () => ({
  ...emptySimulationState(),
  relationships: { rel: { trust: 0.5, tension: 0.1 } },
  scenario: { flag: false },
});

describe("state paths", () => {
  it("reads and writes nested paths without mutating the input", () => {
    const state = base();
    const next = setStateValue(state, "relationships.rel.trust", 0.9);
    expect(getStateValue(next, "relationships.rel.trust")).toBe(0.9);
    expect(getStateValue(state, "relationships.rel.trust")).toBe(0.5);
  });

  it("creates intermediate containers on write", () => {
    const next = setStateValue(base(), "conversation.topic.current", "deadline");
    expect(getStateValue(next, "conversation.topic.current")).toBe("deadline");
  });

  it("distinguishes a missing path from a falsy value", () => {
    const state = base();
    expect(hasStatePath(state, "scenario.flag")).toBe(true);
    expect(hasStatePath(state, "scenario.missing")).toBe(false);
    expect(getStateValue(state, "scenario.missing")).toBeUndefined();
  });

  it("deletes a path", () => {
    const next = deleteStateValue(base(), "relationships.rel.tension");
    expect(hasStatePath(next, "relationships.rel.tension")).toBe(false);
    expect(hasStatePath(next, "relationships.rel.trust")).toBe(true);
  });

  it("rejects paths outside the four state scopes", () => {
    expect(() => getStateValue(base(), "character.traits.patience")).toThrow(StatePathError);
    expect(() => getStateValue(base(), "world")).toThrow(StatePathError);
  });
});

describe("controlled mutation", () => {
  it("increments from an absent numeric path", () => {
    const next = applyStateChange(
      base(),
      { path: "conversation.intensity", operation: "increment", value: 0.2 },
      { trusted: true },
    );
    expect(getStateValue(next, "conversation.intensity")).toBeCloseTo(0.2);
  });

  it("clamps untrusted increments into the policy range", () => {
    const next = applyStateChange(base(), {
      path: "relationships.rel.trust",
      operation: "increment",
      value: 0.2,
    });
    expect(getStateValue(next, "relationships.rel.trust")).toBeCloseTo(0.7);

    const raised = applyStateChange(
      next,
      { path: "relationships.rel.trust", operation: "set", value: 0.9 },
      { trusted: true },
    );
    const clamped = applyStateChange(raised, {
      path: "relationships.rel.trust",
      operation: "increment",
      value: 0.25,
    });
    expect(getStateValue(clamped, "relationships.rel.trust")).toBe(1);
  });

  it("lets trusted effects exceed the policy range", () => {
    const next = applyStateChange(
      base(),
      { path: "relationships.rel.trust", operation: "increment", value: 5 },
      { trusted: true },
    );
    expect(getStateValue(next, "relationships.rel.trust")).toBe(5.5);
  });

  it("refuses an oversized untrusted increment", () => {
    expect(() =>
      applyStateChange(base(), {
        path: "relationships.rel.trust",
        operation: "increment",
        value: 0.9,
      }),
    ).toThrow(StateMutationError);
  });

  it("refuses writes outside the allowed prefixes and operations", () => {
    expect(() =>
      applyStateChange(base(), { path: "world.semester", operation: "set", value: "spring" }),
    ).toThrow(StateMutationError);
    expect(() =>
      applyStateChange(base(), { path: "scenario.flag", operation: "delete" }),
    ).toThrow(StateMutationError);
  });

  it("refuses arithmetic on a non-numeric value", () => {
    expect(() =>
      applyStateChange(
        base(),
        { path: "scenario.flag", operation: "increment", value: 1 },
        { trusted: true },
      ),
    ).toThrow(StateMutationError);
  });

  it("collects rejections instead of aborting a batch", () => {
    const result = applyProposedChanges(
      base(),
      [
        { path: "relationships.rel.trust", operation: "increment", value: 0.1 },
        { path: "world.semester", operation: "set", value: "spring" },
        { path: "conversation.topic", operation: "set", value: "deadline" },
      ],
      DEFAULT_MUTATION_POLICY,
    );

    expect(result.applied).toHaveLength(2);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.change.path).toBe("world.semester");
    expect(getStateValue(result.state, "conversation.topic")).toBe("deadline");
  });
});
