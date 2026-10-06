import type {
  GoalStatus,
  InteractionAnalysis,
  Message,
  Participant,
  ScenarioDefinition,
  SimulationState,
} from "@/types";

/**
 * Read-only view the condition and effect registries evaluate against. It deliberately
 * excludes repositories: conditions must be pure so they stay unit-testable (§46).
 */
export interface EngineContext {
  scenario: ScenarioDefinition;
  participants: Participant[];
  state: SimulationState;
  turnIndex: number;
  /** goalId -> current status. */
  goalStatuses: Map<string, GoalStatus>;
  firedEventIds: Set<string>;
  messages: Message[];
  lastAnalysis?: InteractionAnalysis;
  /** Set once a participant has signalled an exit, consumed by completion rules. */
  exitBy?: "user" | "npc";
  activeCharacterIds: Set<string>;
}
