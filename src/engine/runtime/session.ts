import type { ScenarioInstance as ScenarioInstanceRow } from "@prisma/client";
import { getPackage } from "@/content/registry";
import type { ContentPackage } from "@/content/types";
import { prisma } from "@/db/client";
import {
  getEventLogs,
  getGoalStates,
  getMessages,
  latestSnapshot,
  toConversation,
} from "@/db/conversations";
import { listMemories } from "@/db/memories";
import type { EngineContext } from "@/engine/context";
import type { EffectOutcome } from "@/engine/effects/registry";
import { ScenarioRuntimeError } from "@/engine/errors";
import { initialGoalStatuses } from "@/engine/goals/resolve";
import { applyStateChange, DEFAULT_MUTATION_POLICY } from "@/engine/state/mutate";
import { getStateValue } from "@/engine/state/path";
import type {
  Character,
  Conversation,
  GoalStatus,
  InteractionAnalysis,
  Memory,
  Message,
  Participant,
  Relationship,
  ScenarioDefinition,
  SimulationState,
  StateMutationPolicy,
  World,
} from "@/types";

/** State keys the engine owns. The `$` prefix keeps them out of content authors' namespace. */
export const ACTIVE_CHARACTERS_PATH = "scenario.$activeCharacterIds";
/**
 * Goal statuses are mirrored into the snapshot so restoring a snapshot restores goal
 * progress too; the `GoalState` table stays as the queryable projection (§23).
 */
export const GOAL_STATUSES_PATH = "scenario.$goalStatuses";

export interface RuntimeSession {
  pkg: ContentPackage;
  scenario: ScenarioDefinition;
  world?: World;
  worldInstanceId?: string;
  scenarioInstance: ScenarioInstanceRow;
  conversation: Conversation;
  participants: Participant[];
  userParticipant: Participant;
  npcParticipants: Participant[];
  charactersByParticipant: Map<string, Character>;
  state: SimulationState;
  messages: Message[];
  goalStatuses: Map<string, GoalStatus>;
  firedEventIds: Set<string>;
  memories: Memory[];
  policy: StateMutationPolicy;
  /** Set during a turn and read by conditions; not persisted. */
  lastAnalysis?: InteractionAnalysis;
  exitBy?: "user" | "npc";
}

export async function loadSession(conversationId: string): Promise<RuntimeSession> {
  const row = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { scenarioInstance: true },
  });
  if (!row) throw new ScenarioRuntimeError(`unknown conversation '${conversationId}'`);

  const scenarioInstance = row.scenarioInstance;
  const pkg = await getPackage(scenarioInstance.packageId);
  const scenario = pkg.scenarios.get(scenarioInstance.scenarioDefinitionId);
  if (!scenario) {
    throw new ScenarioRuntimeError(
      `scenario '${scenarioInstance.scenarioDefinitionId}' is no longer in package '${scenarioInstance.packageId}'`,
    );
  }

  const snapshot = await latestSnapshot(conversationId);
  if (!snapshot) {
    throw new ScenarioRuntimeError(`conversation '${conversationId}' has no state snapshot`);
  }

  const [messages, goalStates, eventLogs, memories] = await Promise.all([
    getMessages(conversationId),
    getGoalStates(conversationId),
    getEventLogs(conversationId),
    scenarioInstance.worldInstanceId ? listMemories(scenarioInstance.worldInstanceId) : Promise.resolve([]),
  ]);

  const goalStatuses = initialGoalStatuses(scenario.goals);
  for (const goalState of goalStates) goalStatuses.set(goalState.goalId, goalState.status);
  for (const [goalId, status] of Object.entries(snapshotGoalStatuses(snapshot.state))) {
    goalStatuses.set(goalId, status);
  }

  return {
    pkg,
    scenario,
    world: scenario.worldId ? pkg.worlds.get(scenario.worldId) : undefined,
    worldInstanceId: scenarioInstance.worldInstanceId ?? undefined,
    scenarioInstance,
    conversation: toConversation(row),
    ...splitParticipants(scenario, pkg),
    state: snapshot.state,
    messages,
    goalStatuses,
    firedEventIds: new Set(eventLogs.map((entry) => entry.eventId)),
    memories,
    policy: scenario.stateMutationPolicy ?? DEFAULT_MUTATION_POLICY,
  };
}

export function splitParticipants(
  scenario: ScenarioDefinition,
  pkg: ContentPackage,
): Pick<
  RuntimeSession,
  "participants" | "userParticipant" | "npcParticipants" | "charactersByParticipant"
> {
  const userParticipant = scenario.participants.find((participant) => participant.kind === "user");
  if (!userParticipant) {
    throw new ScenarioRuntimeError(`scenario '${scenario.id}' has no user participant`);
  }

  const npcParticipants = scenario.participants.filter((participant) => participant.kind === "npc");
  const charactersByParticipant = new Map<string, Character>();
  for (const participant of npcParticipants) {
    const characterId = participant.characterId ?? participant.id;
    const character = pkg.characters.get(characterId);
    if (!character) {
      throw new ScenarioRuntimeError(`unknown character '${characterId}'`, { scenarioId: scenario.id });
    }
    charactersByParticipant.set(participant.id, character);
  }

  return { participants: scenario.participants, userParticipant, npcParticipants, charactersByParticipant };
}

export function snapshotGoalStatuses(state: SimulationState): Record<string, GoalStatus> {
  const value = getStateValue(state, GOAL_STATUSES_PATH);
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, GoalStatus>)
    : {};
}

export function withGoalStatuses(
  state: SimulationState,
  goalStatuses: Map<string, GoalStatus>,
): SimulationState {
  return applyStateChange(
    state,
    { path: GOAL_STATUSES_PATH, operation: "set", value: Object.fromEntries(goalStatuses) },
    { trusted: true },
  );
}

export function activeCharacterIds(state: SimulationState): Set<string> {
  const value = getStateValue(state, ACTIVE_CHARACTERS_PATH);
  return new Set(Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);
}

/**
 * Folds `add_character` / `remove_character` into the engine-owned active-actor list.
 * Shared by scenario start and the turn pipeline so both honour cast changes.
 */
export function applySceneChanges(outcome: EffectOutcome): EffectOutcome {
  if (outcome.addedCharacterIds.length === 0 && outcome.removedCharacterIds.length === 0) {
    return outcome;
  }
  const active = activeCharacterIds(outcome.state);
  for (const characterId of outcome.addedCharacterIds) active.add(characterId);
  for (const characterId of outcome.removedCharacterIds) active.delete(characterId);

  return {
    ...outcome,
    state: applyStateChange(
      outcome.state,
      { path: ACTIVE_CHARACTERS_PATH, operation: "set", value: [...active] },
      { trusted: true },
    ),
    addedCharacterIds: [],
    removedCharacterIds: [],
  };
}

export function buildContext(
  session: RuntimeSession,
  overrides: Partial<EngineContext> = {},
): EngineContext {
  return {
    scenario: session.scenario,
    participants: session.participants,
    state: session.state,
    turnIndex: currentTurnIndex(session.messages),
    goalStatuses: session.goalStatuses,
    firedEventIds: session.firedEventIds,
    messages: session.messages,
    activeCharacterIds: activeCharacterIds(session.state),
    lastAnalysis: session.lastAnalysis,
    exitBy: session.exitBy,
    ...overrides,
  };
}

export function currentTurnIndex(messages: Message[]): number {
  return messages.reduce((max, message) => Math.max(max, message.turnIndex), 0);
}

/** The relationship between the human participant and one character, if the package defines one. */
export function relationshipFor(
  pkg: ContentPackage,
  userParticipantId: string,
  characterId: string,
): Relationship | undefined {
  return [...pkg.relationships.values()].find((relationship) => {
    const pair = new Set([relationship.participantAId, relationship.participantBId]);
    return pair.has(userParticipantId) && pair.has(characterId);
  });
}

export function relationshipState(
  state: SimulationState,
  relationship: Relationship | undefined,
): Record<string, unknown> | undefined {
  if (!relationship) return undefined;
  return state.relationships[relationship.id] ?? {};
}
