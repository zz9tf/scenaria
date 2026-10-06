import type { EngineContext } from "@/engine/context";
import { emptySimulationState } from "@/engine/state/path";
import { scenarioDefinitionSchema } from "@/schemas";
import type { ScenarioDefinition } from "@/types";

export function testScenario(overrides: Record<string, unknown> = {}): ScenarioDefinition {
  return scenarioDefinitionSchema.parse({
    id: "test_scenario",
    name: "Test Scenario",
    participants: [
      { id: "user", kind: "user" },
      { id: "npc", kind: "npc", characterId: "npc" },
    ],
    initialContext: "A test scenario.",
    ...overrides,
  });
}

export function testContext(overrides: Partial<EngineContext> = {}): EngineContext {
  const scenario = overrides.scenario ?? testScenario();
  return {
    scenario,
    participants: scenario.participants,
    state: emptySimulationState(),
    turnIndex: 0,
    goalStatuses: new Map(),
    firedEventIds: new Set(),
    messages: [],
    activeCharacterIds: new Set(["npc"]),
    ...overrides,
  };
}
