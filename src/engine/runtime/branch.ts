import { prisma } from "@/db/client";
import { toConversation, toMessage, toSnapshot } from "@/db/conversations";
import { toJson } from "@/db/json";
import { ScenarioRuntimeError } from "@/engine/errors";
import { snapshotGoalStatuses } from "@/engine/runtime/session";
import type { Conversation } from "@/types";

export interface BranchInput {
  conversationId: string;
  /** The message to replay from; it and everything after it are excluded from the branch. */
  messageId: string;
}

/**
 * §23: restore the state snapshot taken before the chosen message, copy the conversation
 * context that preceded it, and continue in an independent conversation. Nothing in the
 * parent conversation is modified, so both branches keep their own state.
 */
export async function branchFrom(input: BranchInput): Promise<{ conversation: Conversation }> {
  const target = await prisma.message.findUnique({ where: { id: input.messageId } });
  if (!target || target.conversationId !== input.conversationId) {
    throw new ScenarioRuntimeError(
      `message '${input.messageId}' does not belong to conversation '${input.conversationId}'`,
    );
  }

  const parent = await prisma.conversation.findUnique({ where: { id: input.conversationId } });
  if (!parent) throw new ScenarioRuntimeError(`unknown conversation '${input.conversationId}'`);

  const restoreFrom = target.stateSnapshotBeforeId
    ? await prisma.stateSnapshot.findUnique({ where: { id: target.stateSnapshotBeforeId } })
    : await prisma.stateSnapshot.findFirst({
        where: { conversationId: input.conversationId, turnIndex: { lt: target.turnIndex } },
        orderBy: [{ turnIndex: "desc" }, { createdAt: "desc" }],
      });
  if (!restoreFrom) {
    throw new ScenarioRuntimeError(`no snapshot to restore before message '${input.messageId}'`);
  }

  const keptMessages = await prisma.message.findMany({
    where: { conversationId: input.conversationId, turnIndex: { lt: target.turnIndex } },
    orderBy: [{ turnIndex: "asc" }, { createdAt: "asc" }],
  });
  const keptTurn = keptMessages.reduce((max, message) => Math.max(max, message.turnIndex), 0);

  const historicalSnapshots = await prisma.stateSnapshot.findMany({
    where: { conversationId: input.conversationId, turnIndex: { lt: target.turnIndex } },
    orderBy: [{ turnIndex: "asc" }, { createdAt: "asc" }],
  });
  const keptEvents = await prisma.eventLog.findMany({
    where: { conversationId: input.conversationId, turnIndex: { lt: target.turnIndex } },
  });

  return prisma.$transaction(async (tx) => {
    const branch = await tx.conversation.create({
      data: {
        scenarioInstanceId: parent.scenarioInstanceId,
        rootConversationId: parent.rootConversationId,
        parentConversationId: parent.id,
        branchFromMessageId: target.id,
        participantIds: parent.participantIds ?? toJson([]),
      },
    });

    const snapshotIdMap = new Map<string, string>();
    for (const snapshot of historicalSnapshots) {
      const copy = await tx.stateSnapshot.create({
        data: {
          conversationId: branch.id,
          turnIndex: snapshot.turnIndex,
          state: snapshot.state ?? toJson({}),
        },
      });
      snapshotIdMap.set(snapshot.id, copy.id);
    }

    for (const message of keptMessages) {
      await tx.message.create({
        data: {
          conversationId: branch.id,
          turnIndex: message.turnIndex,
          senderId: message.senderId,
          senderKind: message.senderKind,
          content: message.content,
          tone: message.tone,
          analysis: message.analysis ?? undefined,
          actionPlan: message.actionPlan ?? undefined,
          stateSnapshotBeforeId: remap(snapshotIdMap, message.stateSnapshotBeforeId),
          stateSnapshotAfterId: remap(snapshotIdMap, message.stateSnapshotAfterId),
        },
      });
    }

    if (keptEvents.length > 0) {
      await tx.eventLog.createMany({
        data: keptEvents.map((entry) => ({
          conversationId: branch.id,
          turnIndex: entry.turnIndex,
          eventId: entry.eventId,
          trigger: entry.trigger,
          appliedEffects: entry.appliedEffects ?? toJson([]),
        })),
      });
    }

    // Written last so `latestSnapshot` resolves to the restored state even when a copied
    // snapshot shares its turn index.
    const restored = await tx.stateSnapshot.create({
      data: { conversationId: branch.id, turnIndex: keptTurn, state: restoreFrom.state ?? toJson({}) },
    });

    const statuses = snapshotGoalStatuses(toSnapshot(restored).state);
    for (const [goalId, status] of Object.entries(statuses)) {
      const parentGoal = await tx.goalState.findUnique({
        where: { conversationId_goalId: { conversationId: parent.id, goalId } },
      });
      await tx.goalState.create({
        data: {
          scenarioInstanceId: parent.scenarioInstanceId,
          conversationId: branch.id,
          goalId,
          ownerId: parentGoal?.ownerId ?? "unknown",
          status,
        },
      });
    }

    return { conversation: toConversation(branch) };
  });
}

function remap(map: Map<string, string>, id: string | null): string | null {
  return id === null ? null : (map.get(id) ?? null);
}

export async function listBranches(rootConversationId: string) {
  const rows = await prisma.conversation.findMany({
    where: { rootConversationId },
    orderBy: { startedAt: "asc" },
    include: { messages: { orderBy: [{ turnIndex: "asc" }, { createdAt: "asc" }] } },
  });
  return rows.map((row) => ({
    conversation: toConversation(row),
    messages: row.messages.map(toMessage),
  }));
}
