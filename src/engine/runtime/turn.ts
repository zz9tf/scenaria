import { prisma } from "@/db/client";
import { logEvents, saveMessage, saveSnapshot, upsertGoalState } from "@/db/conversations";
import { createMemories } from "@/db/memories";
import type { EngineContext } from "@/engine/context";
import { emptyEffectOutcome, type EffectOutcome } from "@/engine/effects/registry";
import { ScenarioRuntimeError } from "@/engine/errors";
import { runEventPass, type TriggeredEvent } from "@/engine/events/trigger";
import { evaluateCompletion } from "@/engine/goals/completion";
import { resolveGoals } from "@/engine/goals/resolve";
import { TurnLogger } from "@/engine/logging";
import { rankMemories } from "@/engine/memory/retrieval";
import {
  activeCharacterIds,
  applySceneChanges,
  buildContext,
  currentTurnIndex,
  loadSession,
  relationshipFor,
  relationshipState,
  withGoalStatuses,
  type RuntimeSession,
} from "@/engine/runtime/session";
import { applyProposedChanges } from "@/engine/state/mutate";
import { llmProvider } from "@/llm";
import { decideNpcAction, interpretMessage, renderUtterance } from "@/llm/models";
import type { NpcContext } from "@/llm/prompts";
import type { LlmProvider } from "@/llm/types";
import type {
  GoalDefinition,
  InteractionAnalysis,
  Memory,
  Message,
  NPCActionPlan,
  Participant,
  SimulationState,
  StateChange,
  TurnTrace,
} from "@/types";

const MEMORY_LIMIT = 6;

export interface SubmitTurnInput {
  conversationId: string;
  content: string;
  provider?: LlmProvider;
}

export interface SubmitTurnResult {
  userMessage: Message;
  npcMessages: Message[];
  systemMessages: Message[];
  trace: TurnTrace;
  state: SimulationState;
  completed: boolean;
}

/**
 * The deterministic orchestration pipeline of §16. LLM calls are wrapped so a failure
 * degrades the turn rather than aborting it (§47): a failed interpreter yields no analysis,
 * a failed decision yields a minimal acknowledging plan, and a failed renderer falls back
 * to a neutral line derived from the plan.
 */
export async function submitTurn(input: SubmitTurnInput): Promise<SubmitTurnResult> {
  const provider = input.provider ?? llmProvider();
  const logger = new TurnLogger();
  const session = await loadSession(input.conversationId);

  if (session.conversation.status !== "active") {
    throw new ScenarioRuntimeError(`conversation '${input.conversationId}' is not active`, {
      status: session.conversation.status,
    });
  }

  const turnIndex = currentTurnIndex(session.messages) + 1;
  const trace: TurnTrace = {
    turnIndex,
    retrievedMemories: [],
    appliedChanges: [],
    rejectedChanges: [],
    triggeredEventIds: [],
    goalStatuses: [],
    llmFailures: [],
  };
  const triggered: TriggeredEvent[] = [];
  let outcome = emptyEffectOutcome(session.state);

  // Step 1-2: persist the raw user message before anything can fail.
  const snapshotBefore = await saveSnapshot(input.conversationId, turnIndex, session.state);
  const userMessage = await saveMessage({
    conversationId: input.conversationId,
    turnIndex,
    senderId: session.userParticipant.id,
    senderKind: "user",
    content: input.content,
    stateSnapshotBeforeId: snapshotBefore.id,
  });
  session.messages = [...session.messages, userMessage];

  const context = () => buildContext(session, { turnIndex, state: outcome.state });

  // Scene notes produced by effects are written to the transcript in the order they were
  // emitted, so an event that fires before the NPC speaks reads before its reply.
  const systemMessages: Message[] = [];
  let flushedScene = 0;
  const flushScene = async (): Promise<Message[]> => {
    const pending = outcome.systemContext.slice(flushedScene);
    flushedScene = outcome.systemContext.length;
    const written: Message[] = [];
    for (const entry of pending) {
      written.push(
        await saveMessage({
          conversationId: input.conversationId,
          turnIndex,
          senderId: "engine",
          senderKind: "system",
          content: entry,
          stateSnapshotBeforeId: snapshotBefore.id,
        }),
      );
    }
    session.messages = [...session.messages, ...written];
    return written;
  };

  // Step 6 (before_turn half): events that set up the turn.
  outcome = runPass("before_turn", session, outcome, context(), triggered);

  // Step 3-4: structured interpretation of the user message.
  let analysis: InteractionAnalysis | undefined;
  const responder = pickResponder(session, outcome.state);
  const npcContextFor = (overrides: Partial<NpcContext> = {}): NpcContext =>
    buildNpcContext(session, responder, outcome.state, overrides);

  try {
    analysis = await interpretMessage(npcContextFor(), input.content, provider);
    logger.info("interpreter", "analysis produced", { intents: analysis.intents });
  } catch (error) {
    trace.llmFailures.push(`interpreter: ${String(error)}`);
    logger.warn("interpreter", "falling back to no analysis", { error: String(error) });
  }
  trace.analysis = analysis;
  session.lastAnalysis = analysis;

  // Step 5: validated state mutation from the interpreter's proposals.
  outcome = applyProposals(outcome, analysis?.proposedStateChanges ?? [], session, trace, logger);

  // Step 6-7: user-message and state-change event passes.
  outcome = runPass("after_user_message", session, outcome, context(), triggered);
  outcome = runPass("state_change", session, outcome, context(), triggered);
  outcome = applySceneChanges(outcome);
  systemMessages.push(...(await flushScene()));

  // Step 8: memory retrieval for the responding character.
  const responderNow = pickResponder(session, outcome.state);
  const memories = retrieveMemories(session, responderNow, analysis);
  trace.retrievedMemories = memories;

  // Step 9-10: decide, then render.
  let plan: NPCActionPlan | undefined;
  try {
    plan = await decideNpcAction(
      buildNpcContext(session, responderNow, outcome.state, {
        analysis,
        memories,
        systemContext: outcome.systemContext,
      }),
      provider,
    );
  } catch (error) {
    trace.llmFailures.push(`decision: ${String(error)}`);
    plan = {
      intent: "acknowledge",
      emotionalResponse: "neutral",
      responseStrategy: "ask_clarifying_question",
      usedMemoryIds: [],
      proposedStateChanges: [],
      wantsToEndConversation: false,
    };
  }
  trace.actionPlan = plan;

  outcome = applyProposals(outcome, plan.proposedStateChanges, session, trace, logger);

  let rendered: { content: string; tone?: string };
  try {
    rendered = await renderUtterance(
      buildNpcContext(session, responderNow, outcome.state, {
        analysis,
        memories,
        plan,
        systemContext: outcome.systemContext,
      }),
      provider,
    );
  } catch (error) {
    trace.llmFailures.push(`renderer: ${String(error)}`);
    rendered = { content: fallbackLine(plan), tone: plan.emotionalResponse };
  }

  // Step 11: persist the NPC message.
  const npcMessage = await saveMessage({
    conversationId: input.conversationId,
    turnIndex,
    senderId: responderNow.id,
    senderKind: "npc",
    content: rendered.content,
    tone: rendered.tone,
    analysis,
    actionPlan: plan,
    stateSnapshotBeforeId: snapshotBefore.id,
  });
  session.messages = [...session.messages, npcMessage];

  // Step 12: post-response events.
  if (plan.wantsToEndConversation) session.exitBy = "npc";
  outcome = runPass("after_npc_message", session, outcome, context(), triggered);
  outcome = runPass("state_change", session, outcome, context(), triggered);
  outcome = applySceneChanges(outcome);
  systemMessages.push(...(await flushScene()));

  // Step 13: goals.
  outcome = await commitGoalUpdates(outcome, session, input.conversationId);
  const resolutions = resolveGoals(session.scenario.goals, context());
  for (const resolution of resolutions) {
    session.goalStatuses.set(resolution.goalId, resolution.status);
    await upsertGoalState(
      session.scenarioInstance.id,
      input.conversationId,
      resolution.goalId,
      resolution.ownerId,
      resolution.status,
    );
  }
  trace.goalStatuses = session.scenario.goals.map((goal: GoalDefinition) => ({
    goalId: goal.id,
    ownerId: goal.ownerId,
    status: session.goalStatuses.get(goal.id) ?? goal.status,
    hidden: goal.hidden,
  }));

  // Step 14: completion.
  const decision =
    outcome.endScenario !== undefined
      ? { outcome: outcome.endScenario.outcome, ruleType: "custom" as const, reason: outcome.endScenario.reason ?? "ended by effect" }
      : evaluateCompletion(session.scenario.completionRules, session.scenario.goals, context());

  if (decision) {
    trace.completion = { outcome: decision.outcome, ruleType: decision.ruleType };
    await prisma.conversation.update({
      where: { id: input.conversationId },
      data: { status: "completed", completedAt: new Date() },
    });
    await prisma.scenarioInstance.update({
      where: { id: session.scenarioInstance.id },
      data: { status: "completed", outcome: decision.outcome, completedAt: new Date() },
    });
  }

  // Step 15: snapshot and event log.
  const finalState = withGoalStatuses(outcome.state, session.goalStatuses);
  const snapshotAfter = await saveSnapshot(input.conversationId, turnIndex, finalState);
  await prisma.message.updateMany({
    where: { conversationId: input.conversationId, turnIndex },
    data: { stateSnapshotAfterId: snapshotAfter.id },
  });
  await logEvents(input.conversationId, turnIndex, triggered);
  await persistMemories(outcome, session, input.conversationId);

  trace.triggeredEventIds = triggered.map((event) => event.eventId);

  return {
    userMessage,
    npcMessages: [npcMessage],
    systemMessages,
    trace,
    state: finalState,
    completed: decision !== undefined,
  };
}

function runPass(
  trigger: Parameters<typeof runEventPass>[0],
  session: RuntimeSession,
  outcome: EffectOutcome,
  context: EngineContext,
  collected: TriggeredEvent[],
): EffectOutcome {
  const pass = runEventPass(trigger, session.scenario.events, context, outcome);
  collected.push(...pass.triggered);
  return pass.outcome;
}

function applyProposals(
  outcome: EffectOutcome,
  changes: StateChange[],
  session: RuntimeSession,
  trace: TurnTrace,
  logger: TurnLogger,
): EffectOutcome {
  if (changes.length === 0) return outcome;
  const result = applyProposedChanges(outcome.state, changes, session.policy);
  trace.appliedChanges.push(...result.applied);
  trace.rejectedChanges.push(...result.rejected);
  for (const rejection of result.rejected) {
    logger.warn("state", "rejected proposed change", {
      path: rejection.change.path,
      reason: rejection.reason,
    });
  }
  return { ...outcome, state: result.state };
}

/**
 * A character added by an event answers the next turn, so "a third character enters the
 * room" is observable in the transcript instead of only in state.
 */
function pickResponder(session: RuntimeSession, state: SimulationState): Participant {
  const active = activeCharacterIds(state);
  const candidates = session.npcParticipants.filter((participant) => {
    const character = session.charactersByParticipant.get(participant.id);
    return character !== undefined && active.has(character.id);
  });
  const responder = candidates.at(-1) ?? session.npcParticipants[0];
  if (!responder) {
    throw new ScenarioRuntimeError(`scenario '${session.scenario.id}' has no npc participant`);
  }
  return responder;
}

function buildNpcContext(
  session: RuntimeSession,
  participant: Participant,
  state: SimulationState,
  overrides: Partial<NpcContext> = {},
): NpcContext {
  const character = session.charactersByParticipant.get(participant.id);
  if (!character) {
    throw new ScenarioRuntimeError(`participant '${participant.id}' has no character`);
  }
  const relationship = relationshipFor(session.pkg, session.userParticipant.id, character.id);

  return {
    scenario: session.scenario,
    participant,
    character,
    participants: session.participants,
    relationship,
    relationshipState: relationshipState(state, relationship),
    state,
    // The decision model sees its own hidden goals but never another participant's.
    goals: session.scenario.goals.filter(
      (goal) => goal.ownerId === participant.id || !goal.hidden,
    ),
    memories: [],
    transcript: session.messages,
    systemContext: [],
    policy: session.policy,
    ...overrides,
  };
}

function retrieveMemories(
  session: RuntimeSession,
  participant: Participant,
  analysis: InteractionAnalysis | undefined,
): Memory[] {
  const character = session.charactersByParticipant.get(participant.id);
  if (!character) return [];
  const relationship = relationshipFor(session.pkg, session.userParticipant.id, character.id);

  const ownerKeys: Array<{ ownerType: Memory["ownerType"]; ownerId: string }> = [
    { ownerType: "character", ownerId: character.id },
  ];
  if (relationship) ownerKeys.push({ ownerType: "relationship", ownerId: relationship.id });
  if (session.scenario.worldId) {
    ownerKeys.push({ ownerType: "world", ownerId: session.scenario.worldId });
  }

  return rankMemories(session.memories, {
    ownerKeys,
    analysis,
    recentText: session.messages.slice(-4).map((message) => message.content),
    limit: MEMORY_LIMIT,
  }).map((scored) => scored.memory);
}

async function commitGoalUpdates(
  outcome: EffectOutcome,
  session: RuntimeSession,
  conversationId: string,
): Promise<EffectOutcome> {
  for (const update of outcome.goalUpdates) {
    const goal = session.scenario.goals.find((entry) => entry.id === update.goalId);
    if (!goal) continue;
    session.goalStatuses.set(goal.id, update.status);
    await upsertGoalState(
      session.scenarioInstance.id,
      conversationId,
      goal.id,
      goal.ownerId,
      update.status,
    );
  }
  return { ...outcome, goalUpdates: [] };
}

async function persistMemories(
  outcome: EffectOutcome,
  session: RuntimeSession,
  conversationId: string,
): Promise<void> {
  if (!session.worldInstanceId || outcome.createdMemories.length === 0) return;
  await createMemories(
    session.worldInstanceId,
    outcome.createdMemories.map((memory) => ({ ...memory, sourceConversationId: conversationId })),
  );
}

/** Safe default utterance when the renderer fails twice (§47). */
function fallbackLine(plan: NPCActionPlan): string {
  return `Give me a moment - I want to be sure I understand what you're asking (${plan.intent}) before I answer.`;
}
