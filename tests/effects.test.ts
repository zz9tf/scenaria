import { describe, expect, it } from "vitest";
import { applyEffects, effectTypes, emptyEffectOutcome, getEffectKind } from "@/engine/effects/registry";
import { UnknownEffectTypeError } from "@/engine/errors";
import { getStateValue } from "@/engine/state/path";
import { testContext } from "./helpers/context";

describe("effect registry", () => {
  it("throws on an unknown effect type", () => {
    expect(() => getEffectKind("teleport")).toThrow(UnknownEffectTypeError);
  });

  it("exposes its known types for content validation", () => {
    expect(effectTypes()).toContain("increment_state");
    expect(effectTypes()).toContain("create_memory");
  });

  it("folds a batch so later effects see earlier writes", () => {
    const context = testContext();
    const outcome = applyEffects(
      [
        { type: "set_state", parameters: { path: "scenario.count", value: 1 } },
        { type: "increment_state", parameters: { path: "scenario.count", amount: 4 } },
      ],
      context,
      emptyEffectOutcome(context.state),
    );
    expect(getStateValue(outcome.state, "scenario.count")).toBe(5);
  });

  it("writes world state, which untrusted proposals may not touch", () => {
    const context = testContext();
    const outcome = applyEffects(
      [{ type: "set_state", parameters: { path: "world.officeOpen", value: false } }],
      context,
      emptyEffectOutcome(context.state),
    );
    expect(getStateValue(outcome.state, "world.officeOpen")).toBe(false);
  });

  it("collects goal updates, memories, scene notes and cast changes", () => {
    const context = testContext();
    const outcome = applyEffects(
      [
        { type: "activate_goal", parameters: { goalId: "g1" } },
        { type: "complete_goal", parameters: { goalId: "g2" } },
        {
          type: "create_memory",
          parameters: {
            ownerType: "character",
            ownerId: "npc",
            content: "Something worth remembering.",
            importance: 0.7,
          },
        },
        { type: "emit_system_context", parameters: { content: "A phone rings." } },
        { type: "add_character", parameters: { characterId: "third" } },
        { type: "end_scenario", parameters: { outcome: "completed" } },
      ],
      context,
      emptyEffectOutcome(context.state),
    );

    expect(outcome.goalUpdates).toEqual([
      { goalId: "g1", status: "active" },
      { goalId: "g2", status: "completed" },
    ]);
    expect(outcome.createdMemories).toHaveLength(1);
    expect(outcome.systemContext).toEqual(["A phone rings."]);
    expect(outcome.addedCharacterIds).toEqual(["third"]);
    expect(outcome.endScenario?.outcome).toBe("completed");
  });
});
