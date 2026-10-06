import { getPackage, resolveScenario } from "@/content/registry";
import { prisma } from "@/db/client";
import { logEvents, saveMessage, saveSnapshot, toConversation, upsertGoalState } from "@/db/conversations";
import { ensureUser, ensureWorldInstance } from "@/db/instances";
import { createMemories } from "@/db/memories";
import { toJson } from "@/db/json";
import type { EngineContext } from "@/engine/context";
import { applyEffects, emptyEffectOutcome, type EffectOutcome } from "@/engine/effects/registry";
import { runEventPass } from "@/engine/events/trigger";
import {
  ACTIVE_CHARACTERS_PATH,
  applySceneChanges,
  splitParticipants,
  withGoalStatuses,
} from "@/engine/runtime/session";
import { applyStateChange } from "@/engine/state/mutate";
import { simulationStateSchema } from "@/schemas";
import type { Conversation, SimulationState } from "@/types";

export interface StartScenarioInput {
  packageId: string;
  scenarioId: string;
  /** Stable id of the human player. The MVP has no authentication (§48). */
  userExternalId?: string;
}

export interface StartScenarioResult {
  conversation: Conversation;
}

/**
 * Composes the initial `SimulationState` from world instance state, relationship instance
 * state and the scenario's own `initialState`, then runs `onStart` effects and the
 * `scenario_start` event pass before the first snapshot is written.
 */
export async function startScenario(input: StartScenarioInput): Promise<StartScenarioResult> {
  const resolved = await resolveScenario(input.packageId, input.scenarioId);
  const { scenario } = resolved;
  const pkg = await getPackage(input.packageId);

  const worldInstance = resolved.world ? await ensureWorldInstance(pkg, resolved.world) : undefined;
  const user = input.userExternalId ? await ensureUser(input.userExternalId) : undefined;

  const relationshipRows = worldInstance
    ? await prisma.relationshipInstance.findMany({ where: { worldInstanceId: worldInstance.id } })
    : [];

  const participants = splitParticipants(scenario, pkg);
  const baseState: SimulationState = simulationStateSchema.parse({
    world: worldInstance?.globalState ?? resolved.world?.globalState ?? {},
    relationships: Object.fromEntries(
      relationshipRows.map((row) => [row.relationshipDefinitionId, row.state]),
    ),
    scenario: scenario.initialState,
    conversation: {},
  });

  const stateWithActors = applyStateChange(
    baseState,
    {
      path: ACTIVE_CHARACTERS_PATH,
      operation: "set",
      value: [...participants.charactersByParticipant.values()].map((character) => character.id),
    },
    { trusted: true },
  );

  const scenarioInstance = await prisma.scenarioInstance.create({
    data: {
      packageId: input.packageId,
      scenarioDefinitionId: scenario.id,
      worldInstanceId: worldInstance?.id ?? null,
      userId: user?.id ?? null,
    },
  });

  const conversationRow = await prisma.conversation.create({
    data: {
      scenarioInstanceId: scenarioInstance.id,
      // A trunk conversation is its own root; branches inherit this id (§23).
      rootConversationId: "pending",
      participantIds: toJson(scenario.participants.map((participant) => participant.id)),
    },
  });
  const conversation = await prisma.conversation.update({
    where: { id: conversationRow.id },
    data: { rootConversationId: conversationRow.id },
  });

  const context: EngineContext = {
    scenario,
    participants: scenario.participants,
    state: stateWithActors,
    turnIndex: 0,
    goalStatuses: new Map(scenario.goals.map((goal) => [goal.id, goal.status])),
    firedEventIds: new Set(),
    messages: [],
    activeCharacterIds: new Set(
      [...participants.charactersByParticipant.values()].map((character) => character.id),
    ),
  };

  let outcome: EffectOutcome = applyEffects(
    scenario.onStart,
    context,
    emptyEffectOutcome(stateWithActors),
  );
  const startPass = runEventPass(
    "scenario_start",
    scenario.events,
    { ...context, state: outcome.state },
    outcome,
  );
  outcome = applySceneChanges(startPass.outcome);

  for (const goal of scenario.goals) {
    await upsertGoalState(scenarioInstance.id, conversation.id, goal.id, goal.ownerId, goal.status);
  }
  for (const update of outcome.goalUpdates) {
    const goal = scenario.goals.find((entry) => entry.id === update.goalId);
    if (goal) {
      await upsertGoalState(scenarioInstance.id, conversation.id, goal.id, goal.ownerId, update.status);
    }
  }

  if (worldInstance && outcome.createdMemories.length > 0) {
    await createMemories(
      worldInstance.id,
      outcome.createdMemories.map((memory) => ({ ...memory, sourceConversationId: conversation.id })),
    );
  }

  const goalStatuses = new Map(context.goalStatuses);
  for (const update of outcome.goalUpdates) goalStatuses.set(update.goalId, update.status);
  const snapshot = await saveSnapshot(
    conversation.id,
    0,
    withGoalStatuses(outcome.state, goalStatuses),
  );
  await logEvents(conversation.id, 0, startPass.triggered);

  for (const entry of outcome.systemContext) {
    await saveMessage({
      conversationId: conversation.id,
      turnIndex: 0,
      senderId: "engine",
      senderKind: "system",
      content: entry,
      stateSnapshotAfterId: snapshot.id,
    });
  }

  if (scenario.openingMessage) {
    await saveMessage({
      conversationId: conversation.id,
      turnIndex: 0,
      senderId: scenario.openingMessage.speakerId,
      senderKind: "npc",
      content: scenario.openingMessage.content,
      stateSnapshotAfterId: snapshot.id,
    });
  }

  return { conversation: toConversation(conversation) };
}
