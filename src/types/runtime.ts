import type {
  EventTrigger,
  GoalStatus,
  InteractionAnalysis,
  Memory,
  NPCActionPlan,
  ScenarioOutcome,
  SimulationState,
  StateChange,
} from "@/schemas";

/** §20. A conversation is one linear thread; branches fork into their own conversation. */
export interface Conversation {
  id: string;
  scenarioInstanceId: string;
  rootConversationId: string;
  parentConversationId?: string;
  branchFromMessageId?: string;
  participantIds: string[];
  status: "active" | "completed" | "abandoned";
  startedAt: Date;
  completedAt?: Date;
}

/** §21. */
export interface Message {
  id: string;
  conversationId: string;
  turnIndex: number;
  senderId: string;
  senderKind: "user" | "npc" | "system";
  content: string;
  tone?: string;
  createdAt: Date;
  analysis?: InteractionAnalysis;
  actionPlan?: NPCActionPlan;
  stateSnapshotBeforeId?: string;
  stateSnapshotAfterId?: string;
}

/** §22. */
export interface StateSnapshot {
  id: string;
  conversationId: string;
  turnIndex: number;
  state: SimulationState;
  createdAt: Date;
}

/** §38. Runtime counterpart of `ScenarioDefinition` (§39). */
export interface ScenarioInstance {
  id: string;
  scenarioDefinitionId: string;
  packageId: string;
  worldInstanceId?: string;
  status: "active" | "completed" | "abandoned";
  outcome?: ScenarioOutcome;
  createdAt: Date;
  completedAt?: Date;
}

export interface GoalState {
  id: string;
  scenarioInstanceId: string;
  conversationId: string;
  goalId: string;
  ownerId: string;
  status: GoalStatus;
  updatedAt: Date;
}

export interface EventLogEntry {
  id: string;
  conversationId: string;
  turnIndex: number;
  eventId: string;
  trigger: EventTrigger;
  appliedEffects: string[];
  createdAt: Date;
}

export interface EvaluationRecord {
  id: string;
  conversationId: string;
  evaluatorId: string;
  result: unknown;
  createdAt: Date;
}

/** Everything the turn pipeline produced, surfaced to the debug panel (§35). */
export interface TurnTrace {
  turnIndex: number;
  analysis?: InteractionAnalysis;
  actionPlan?: NPCActionPlan;
  retrievedMemories: Memory[];
  appliedChanges: StateChange[];
  rejectedChanges: Array<{ change: StateChange; reason: string }>;
  triggeredEventIds: string[];
  goalStatuses: Array<{ goalId: string; ownerId: string; status: GoalStatus; hidden: boolean }>;
  completion?: { outcome: ScenarioOutcome; ruleType: string };
  llmFailures: string[];
}
