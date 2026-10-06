import { prisma } from "@/db/client";
import { fromJson, jsonStringArray, toJson } from "@/db/json";
import { simulationStateSchema } from "@/schemas";
import type {
  Conversation,
  EventLogEntry,
  EventTrigger,
  GoalState,
  GoalStatus,
  InteractionAnalysis,
  Message,
  NPCActionPlan,
  SimulationState,
  StateSnapshot,
} from "@/types";
import type {
  Conversation as ConversationRow,
  EventLog as EventLogRow,
  GoalState as GoalStateRow,
  Message as MessageRow,
  StateSnapshot as StateSnapshotRow,
} from "@prisma/client";

export function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    scenarioInstanceId: row.scenarioInstanceId,
    rootConversationId: row.rootConversationId,
    parentConversationId: row.parentConversationId ?? undefined,
    branchFromMessageId: row.branchFromMessageId ?? undefined,
    participantIds: jsonStringArray(row.participantIds),
    status: row.status as Conversation["status"],
    startedAt: row.startedAt,
    completedAt: row.completedAt ?? undefined,
  };
}

export function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    turnIndex: row.turnIndex,
    senderId: row.senderId,
    senderKind: row.senderKind as Message["senderKind"],
    content: row.content,
    tone: row.tone ?? undefined,
    createdAt: row.createdAt,
    analysis: row.analysis === null ? undefined : (row.analysis as unknown as InteractionAnalysis),
    actionPlan: row.actionPlan === null ? undefined : (row.actionPlan as unknown as NPCActionPlan),
    stateSnapshotBeforeId: row.stateSnapshotBeforeId ?? undefined,
    stateSnapshotAfterId: row.stateSnapshotAfterId ?? undefined,
  };
}

export function toSnapshot(row: StateSnapshotRow): StateSnapshot {
  return {
    id: row.id,
    conversationId: row.conversationId,
    turnIndex: row.turnIndex,
    state: simulationStateSchema.parse(row.state),
    createdAt: row.createdAt,
  };
}

export function toGoalState(row: GoalStateRow): GoalState {
  return {
    id: row.id,
    scenarioInstanceId: row.scenarioInstanceId,
    conversationId: row.conversationId,
    goalId: row.goalId,
    ownerId: row.ownerId,
    status: row.status as GoalStatus,
    updatedAt: row.updatedAt,
  };
}

export function toEventLog(row: EventLogRow): EventLogEntry {
  return {
    id: row.id,
    conversationId: row.conversationId,
    turnIndex: row.turnIndex,
    eventId: row.eventId,
    trigger: row.trigger as EventTrigger,
    appliedEffects: jsonStringArray(row.appliedEffects),
    createdAt: row.createdAt,
  };
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: [{ turnIndex: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toMessage);
}

export async function getSnapshots(conversationId: string): Promise<StateSnapshot[]> {
  const rows = await prisma.stateSnapshot.findMany({
    where: { conversationId },
    orderBy: { turnIndex: "asc" },
  });
  return rows.map(toSnapshot);
}

export async function latestSnapshot(conversationId: string): Promise<StateSnapshot | undefined> {
  const row = await prisma.stateSnapshot.findFirst({
    where: { conversationId },
    orderBy: [{ turnIndex: "desc" }, { createdAt: "desc" }],
  });
  return row ? toSnapshot(row) : undefined;
}

export async function saveSnapshot(
  conversationId: string,
  turnIndex: number,
  state: SimulationState,
): Promise<StateSnapshot> {
  const row = await prisma.stateSnapshot.create({
    data: { conversationId, turnIndex, state: toJson(state) },
  });
  return toSnapshot(row);
}

export interface NewMessage {
  conversationId: string;
  turnIndex: number;
  senderId: string;
  senderKind: Message["senderKind"];
  content: string;
  tone?: string;
  analysis?: InteractionAnalysis;
  actionPlan?: NPCActionPlan;
  stateSnapshotBeforeId?: string;
  stateSnapshotAfterId?: string;
}

export async function saveMessage(message: NewMessage): Promise<Message> {
  const row = await prisma.message.create({
    data: {
      conversationId: message.conversationId,
      turnIndex: message.turnIndex,
      senderId: message.senderId,
      senderKind: message.senderKind,
      content: message.content,
      tone: message.tone ?? null,
      analysis: message.analysis === undefined ? undefined : toJson(message.analysis),
      actionPlan: message.actionPlan === undefined ? undefined : toJson(message.actionPlan),
      stateSnapshotBeforeId: message.stateSnapshotBeforeId ?? null,
      stateSnapshotAfterId: message.stateSnapshotAfterId ?? null,
    },
  });
  return toMessage(row);
}

export async function getGoalStates(conversationId: string): Promise<GoalState[]> {
  const rows = await prisma.goalState.findMany({ where: { conversationId } });
  return rows.map(toGoalState);
}

export async function upsertGoalState(
  scenarioInstanceId: string,
  conversationId: string,
  goalId: string,
  ownerId: string,
  status: GoalStatus,
): Promise<void> {
  await prisma.goalState.upsert({
    where: { conversationId_goalId: { conversationId, goalId } },
    update: { status },
    create: { scenarioInstanceId, conversationId, goalId, ownerId, status },
  });
}

export async function getEventLogs(conversationId: string): Promise<EventLogEntry[]> {
  const rows = await prisma.eventLog.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toEventLog);
}

export async function logEvents(
  conversationId: string,
  turnIndex: number,
  events: Array<{ eventId: string; trigger: EventTrigger; appliedEffects: string[] }>,
): Promise<void> {
  if (events.length === 0) return;
  await prisma.eventLog.createMany({
    data: events.map((event) => ({
      conversationId,
      turnIndex,
      eventId: event.eventId,
      trigger: event.trigger,
      appliedEffects: toJson(event.appliedEffects),
    })),
  });
}

export async function saveEvaluation(
  conversationId: string,
  evaluatorId: string,
  result: unknown,
): Promise<void> {
  await prisma.evaluation.create({
    data: { conversationId, evaluatorId, result: toJson(result) },
  });
}

export async function getEvaluations(conversationId: string) {
  const rows = await prisma.evaluation.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    evaluatorId: row.evaluatorId,
    result: fromJson<Record<string, unknown>>(row.result, {}),
    createdAt: row.createdAt,
  }));
}
