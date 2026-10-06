import { prisma } from "@/db/client";
import {
  getEvaluations,
  getEventLogs,
  getGoalStates,
  getSnapshots,
  saveEvaluation,
} from "@/db/conversations";
import { createMemories } from "@/db/memories";
import { ScenarioRuntimeError } from "@/engine/errors";
import {
  loadSession,
  relationshipFor,
  relationshipState,
  type RuntimeSession,
} from "@/engine/runtime/session";
import { llmProvider } from "@/llm";
import { extractMemories, runEvaluator, type EvaluationBundle } from "@/llm/models";
import type { LlmProvider } from "@/llm/types";
import type { EvaluatorInput } from "@/types";

export interface FinalizeInput {
  conversationId: string;
  /** Skipped for abandoned runs, where nothing durable should be remembered. */
  extractMemories?: boolean;
  runEvaluators?: boolean;
  provider?: LlmProvider;
}

export interface FinalizeResult {
  createdMemoryCount: number;
  evaluations: Array<{ evaluatorId: string; result: Record<string, unknown> }>;
  failures: string[];
}

/**
 * Debrief pass for a finished conversation (§27 memory extraction, §25 evaluation).
 * Both halves are optional and independent: an evaluator failure never blocks memory
 * writing, and vice versa.
 */
export async function finalizeConversation(input: FinalizeInput): Promise<FinalizeResult> {
  const provider = input.provider ?? llmProvider();
  const session = await loadSession(input.conversationId);
  const failures: string[] = [];
  let createdMemoryCount = 0;

  if ((input.extractMemories ?? true) && session.worldInstanceId) {
    try {
      const responder = session.npcParticipants[0];
      if (!responder) throw new ScenarioRuntimeError("scenario has no npc participant");
      const character = session.charactersByParticipant.get(responder.id);
      if (!character) throw new ScenarioRuntimeError(`participant '${responder.id}' has no character`);
      const relationship = relationshipFor(session.pkg, session.userParticipant.id, character.id);

      const extraction = await extractMemories(
        {
          scenario: session.scenario,
          participant: responder,
          character,
          participants: session.participants,
          relationship,
          relationshipState: relationshipState(session.state, relationship),
          state: session.state,
          goals: session.scenario.goals,
          memories: [],
          transcript: session.messages,
          systemContext: [],
          policy: session.policy,
        },
        provider,
      );

      const allowedOwners = new Set(
        [
          `character:${character.id}`,
          relationship ? `relationship:${relationship.id}` : undefined,
          session.scenario.worldId ? `world:${session.scenario.worldId}` : undefined,
        ].filter((entry): entry is string => entry !== undefined),
      );

      const accepted = extraction.memories.filter((memory) =>
        allowedOwners.has(`${memory.ownerType}:${memory.ownerId}`),
      );
      if (accepted.length !== extraction.memories.length) {
        failures.push(
          `memory_extraction: dropped ${extraction.memories.length - accepted.length} memory/memories with an out-of-scope owner`,
        );
      }

      createdMemoryCount = await createMemories(
        session.worldInstanceId,
        accepted.map((memory) => ({
          ...memory,
          sourceConversationId: input.conversationId,
          sourceMessageIds: session.messages.map((message) => message.id),
        })),
      );
    } catch (error) {
      failures.push(`memory_extraction: ${String(error)}`);
    }
  }

  const evaluations: FinalizeResult["evaluations"] = [];
  if (input.runEvaluators ?? true) {
    for (const reference of session.scenario.evaluators) {
      const evaluator = session.pkg.evaluators.get(reference.evaluatorId);
      if (!evaluator) {
        failures.push(`evaluation: unknown evaluator '${reference.evaluatorId}'`);
        continue;
      }
      try {
        const bundle = await buildEvaluationBundle(session, evaluator.inputs);
        const result = await runEvaluator(evaluator, bundle, reference.parameters, provider);
        await saveEvaluation(input.conversationId, evaluator.id, result);
        evaluations.push({ evaluatorId: evaluator.id, result });
      } catch (error) {
        failures.push(`evaluation:${evaluator.id}: ${String(error)}`);
      }
    }
  }

  await prisma.conversation.update({
    where: { id: input.conversationId },
    data:
      session.conversation.status === "active"
        ? { status: "completed", completedAt: new Date() }
        : {},
  });

  return { createdMemoryCount, evaluations, failures };
}

/** §26: assembles only the hooks an evaluator declared, so prompts stay as small as possible. */
export async function buildEvaluationBundle(
  session: RuntimeSession,
  inputs: EvaluatorInput[],
): Promise<EvaluationBundle> {
  const wanted = new Set(inputs);
  const bundle: EvaluationBundle = { participants: session.participants };

  if (wanted.has("transcript")) bundle.transcript = session.messages;

  if (wanted.has("state_history")) {
    const snapshots = await getSnapshots(session.conversation.id);
    bundle.stateHistory = snapshots.map((snapshot) => ({
      turnIndex: snapshot.turnIndex,
      state: snapshot.state,
    }));
  }

  if (wanted.has("goal_history")) {
    const goalStates = await getGoalStates(session.conversation.id);
    bundle.goalHistory = session.scenario.goals.map((goal) => ({
      goalId: goal.id,
      ownerId: goal.ownerId,
      description: goal.description,
      hidden: goal.hidden,
      status: goalStates.find((state) => state.goalId === goal.id)?.status ?? goal.status,
    }));
  }

  if (wanted.has("event_history")) {
    bundle.eventHistory = await getEventLogs(session.conversation.id);
  }

  if (wanted.has("memory_changes")) {
    bundle.memoryChanges = session.memories
      .filter((memory) => memory.sourceConversationId === session.conversation.id)
      .map((memory) => ({ content: memory.content, importance: memory.importance, tags: memory.tags }));
  }

  if (wanted.has("relationship_changes")) {
    const snapshots = await getSnapshots(session.conversation.id);
    const first = snapshots.at(0)?.state.relationships ?? {};
    const last = snapshots.at(-1)?.state.relationships ?? {};
    bundle.relationshipChanges = Object.keys({ ...first, ...last }).map((relationshipId) => ({
      relationshipId,
      before: first[relationshipId] ?? {},
      after: last[relationshipId] ?? {},
    }));
  }

  if (wanted.has("branch_info")) {
    bundle.branchInfo = {
      conversationId: session.conversation.id,
      rootConversationId: session.conversation.rootConversationId,
      parentConversationId: session.conversation.parentConversationId,
      branchFromMessageId: session.conversation.branchFromMessageId,
    };
  }

  return bundle;
}

export { getEvaluations };
