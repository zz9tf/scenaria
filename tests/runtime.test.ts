import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/db/client";
import { getEvaluations, getMessages, getSnapshots } from "@/db/conversations";
import { branchFrom, finalizeConversation, loadSession, startScenario, submitTurn } from "@/engine/runtime";
import { getStateValue } from "@/engine/state/path";
import { scriptedProvider } from "./helpers/provider";

const PACKAGE = "engine-test";

async function start(scenarioId: string) {
  const { conversation } = await startScenario({ packageId: PACKAGE, scenarioId, userExternalId: "test-user" });
  return conversation;
}

beforeAll(async () => {
  await prisma.$connect();
});

describe("scenario start", () => {
  it("builds initial state from world, relationships and scenario, and writes a turn-0 snapshot", async () => {
    const conversation = await start("a_deadline_discussion");
    const session = await loadSession(conversation.id);

    expect(getStateValue(session.state, "world.semester")).toBe("fall");
    expect(getStateValue(session.state, "relationships.rel_user_miller.trust")).toBeCloseTo(0.72);
    expect(getStateValue(session.state, "scenario.newDeadlineAgreed")).toBe(false);

    const snapshots = await getSnapshots(conversation.id);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.turnIndex).toBe(0);

    const messages = await getMessages(conversation.id);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.senderId).toBe("professor_miller");

    const goalStates = await prisma.goalState.findMany({ where: { conversationId: conversation.id } });
    expect(goalStates.map((state) => state.goalId).sort()).toEqual(["npc_goal", "user_goal"]);
  });

  it("applies onStart effects before the first snapshot", async () => {
    const conversation = await start("b_lab_interruption");
    const session = await loadSession(conversation.id);
    // `daniel_reyes` is removed from the cast at start, so only Sarah can answer.
    expect(getStateValue(session.state, "scenario.$activeCharacterIds")).toEqual(["sarah_okafor"]);
  });
});

describe("turn pipeline", () => {
  it("runs events, resolves goals and completes the scenario", async () => {
    const conversation = await start("a_deadline_discussion");
    const result = await submitTurn({
      conversationId: conversation.id,
      content: "I can deliver it Thursday, and here is what I'll cut to get there.",
      provider: scriptedProvider({ analyses: [{ intents: ["commitment"], topics: ["deadline"] }] }),
    });

    expect(getStateValue(result.state, "scenario.newDeadlineAgreed")).toBe(true);
    expect(getStateValue(result.state, "relationships.rel_user_miller.trust")).toBeCloseTo(0.77);
    expect(result.trace.triggeredEventIds).toContain("trust_on_commitment");
    expect(result.trace.goalStatuses.find((goal) => goal.goalId === "user_goal")?.status).toBe("completed");
    expect(result.trace.completion?.outcome).toBe("completed");
    expect(result.completed).toBe(true);

    const row = await prisma.conversation.findUnique({ where: { id: conversation.id } });
    expect(row?.status).toBe("completed");
  });

  it("develops the same scenario differently for different user behaviour", async () => {
    const conversation = await start("a_deadline_discussion");
    const result = await submitTurn({
      conversationId: conversation.id,
      content: "I'm not really sure where it stands, maybe a few more days?",
      provider: scriptedProvider({
        analyses: [{ intents: ["statement"], topics: ["deadline"], inferredSignals: { uncertainty: 0.8 } }],
      }),
    });

    expect(getStateValue(result.state, "relationships.rel_user_miller.tension")).toBeCloseTo(0.23);
    expect(getStateValue(result.state, "scenario.newDeadlineAgreed")).toBe(false);
    expect(result.completed).toBe(false);
  });

  it("rejects proposed state changes outside the mutation policy", async () => {
    const conversation = await start("a_deadline_discussion");
    const result = await submitTurn({
      conversationId: conversation.id,
      content: "Can the office stay open all night?",
      provider: scriptedProvider({
        analyses: [
          {
            intents: ["request"],
            proposedStateChanges: [
              { path: "world.officeOpen", operation: "set", value: false },
              { path: "relationships.rel_user_miller.warmth", operation: "increment", value: 0.9 },
              { path: "conversation.topic", operation: "set", value: "office_hours" },
            ],
          },
        ],
      }),
    });

    expect(result.trace.appliedChanges.map((change) => change.path)).toEqual(["conversation.topic"]);
    expect(result.trace.rejectedChanges.map((change) => change.change.path)).toEqual([
      "world.officeOpen",
      "relationships.rel_user_miller.warmth",
    ]);
    expect(getStateValue(result.state, "world.officeOpen")).toBe(true);
  });

  it("degrades instead of failing when the LLM calls fail", async () => {
    const conversation = await start("a_deadline_discussion");
    const result = await submitTurn({
      conversationId: conversation.id,
      content: "Anything at all.",
      provider: scriptedProvider({ failOn: new Set(["interpreter", "decision", "renderer"]) }),
    });

    expect(result.trace.analysis).toBeUndefined();
    expect(result.trace.llmFailures).toHaveLength(3);
    expect(result.npcMessages[0]?.content.length).toBeGreaterThan(0);
    expect(result.completed).toBe(false);
  });

  it("brings an event-added character into the scene and lets them answer", async () => {
    const conversation = await start("b_lab_interruption");
    const provider = scriptedProvider({ analyses: [{ intents: ["request"], topics: ["analysis"] }] });

    for (const content of ["Could you take the regression half?", "It's about four hours of work."]) {
      const turn = await submitTurn({ conversationId: conversation.id, content, provider });
      expect(turn.npcMessages[0]?.senderId).toBe("sarah_okafor");
    }

    const third = await submitTurn({
      conversationId: conversation.id,
      content: "I can hand you the cleaned inputs tonight.",
      provider,
    });

    expect(third.trace.triggeredEventIds).toContain("daniel_interrupts");
    expect(third.systemMessages.some((message) => message.content.includes("seminar"))).toBe(true);
    expect(third.npcMessages[0]?.senderId).toBe("daniel_reyes");
    // `daniel_leaves` fires after he speaks, so the cast is back to Sarah.
    expect(getStateValue(third.state, "scenario.$activeCharacterIds")).toEqual(["sarah_okafor"]);
  });

  it("retrieves seeded memories for the responding character", async () => {
    const conversation = await start("a_deadline_discussion");
    const result = await submitTurn({
      conversationId: conversation.id,
      content: "About the deadline I promised - I need two more days.",
      provider: scriptedProvider({ analyses: [{ intents: ["request"], topics: ["deadline"] }] }),
    });

    expect(result.trace.retrievedMemories.length).toBeGreaterThan(0);
    expect(result.trace.retrievedMemories[0]?.content).toContain("deadline");
  });
});

describe("branching", () => {
  it("restores the snapshot before the chosen message and keeps both branches independent", async () => {
    const conversation = await start("c_replay_fork");

    const first = await submitTurn({
      conversationId: conversation.id,
      content: "They're still a draft - the error bars are placeholders.",
      provider: scriptedProvider({ analyses: [{ intents: ["explanation"], topics: ["draft"] }] }),
    });
    expect(getStateValue(first.state, "scenario.admittedDraft")).toBe(true);

    const branch = await branchFrom({ conversationId: conversation.id, messageId: first.userMessage.id });
    const branchSession = await loadSession(branch.conversation.id);

    expect(branchSession.conversation.rootConversationId).toBe(conversation.id);
    expect(branchSession.conversation.branchFromMessageId).toBe(first.userMessage.id);
    expect(getStateValue(branchSession.state, "scenario.admittedDraft")).toBe(false);
    expect(getStateValue(branchSession.state, "relationships.rel_user_miller.trust")).toBeCloseTo(0.72);

    // Only the opening message is replayed into the branch.
    const branchMessages = await getMessages(branch.conversation.id);
    expect(branchMessages).toHaveLength(1);
    expect(branchMessages[0]?.senderKind).toBe("npc");

    const alternative = await submitTurn({
      conversationId: branch.conversation.id,
      content: "Yes, those are final.",
      provider: scriptedProvider({ analyses: [{ intents: ["commitment"], topics: ["figures"] }] }),
    });

    expect(getStateValue(alternative.state, "scenario.claimedFinal")).toBe(true);
    expect(getStateValue(alternative.state, "scenario.admittedDraft")).toBe(false);
    expect(getStateValue(alternative.state, "relationships.rel_user_miller.tension")).toBeCloseTo(0.27);

    // The trunk is untouched.
    const trunk = await loadSession(conversation.id);
    expect(getStateValue(trunk.state, "scenario.admittedDraft")).toBe(true);
    expect(getStateValue(trunk.state, "scenario.claimedFinal")).toBe(false);
  });

  it("refuses to branch from a message in another conversation", async () => {
    const a = await start("c_replay_fork");
    const b = await start("c_replay_fork");
    const messages = await getMessages(b.id);
    await expect(
      branchFrom({ conversationId: a.id, messageId: messages[0]!.id }),
    ).rejects.toThrow(/does not belong/);
  });
});

describe("finalization", () => {
  it("runs the scenario's evaluators and persists the result", async () => {
    const conversation = await start("a_deadline_discussion");
    await submitTurn({
      conversationId: conversation.id,
      content: "I need two more days.",
      provider: scriptedProvider({ analyses: [{ intents: ["request"], topics: ["deadline"] }] }),
    });

    const result = await finalizeConversation({
      conversationId: conversation.id,
      provider: scriptedProvider({ evaluation: { summary: "ok", goalOutcomes: [], relationshipShifts: [], turningPoints: [] } }),
    });

    expect(result.failures).toEqual([]);
    expect(result.evaluations.map((entry) => entry.evaluatorId)).toEqual(["generic_interaction"]);

    const stored = await getEvaluations(conversation.id);
    expect(stored[0]?.result.summary).toBe("ok");
  });

  it("persists extracted memories so later scenarios can retrieve them", async () => {
    const conversation = await start("c_replay_fork");
    await submitTurn({
      conversationId: conversation.id,
      content: "They're a draft.",
      provider: scriptedProvider({ analyses: [{ intents: ["explanation"], topics: ["draft"] }] }),
    });

    const session = await loadSession(conversation.id);
    const before = session.memories.length;

    const provider = scriptedProvider();
    const spy: typeof provider.structured = async (request) =>
      request.label === "memory_extraction"
        ? ({
            memories: [
              {
                ownerType: "relationship",
                ownerId: "rel_user_miller",
                content: "The user volunteered that the figures were provisional.",
                importance: 0.75,
                tags: ["candour"],
              },
            ],
          } as never)
        : provider.structured(request);

    const result = await finalizeConversation({
      conversationId: conversation.id,
      provider: { ...provider, structured: spy },
    });

    expect(result.createdMemoryCount).toBe(1);
    const after = await loadSession(conversation.id);
    expect(after.memories.length).toBe(before + 1);
  });

  it("drops extracted memories whose owner is out of scope", async () => {
    const conversation = await start("c_replay_fork");
    const provider = scriptedProvider();
    const spy: typeof provider.structured = async (request) =>
      request.label === "memory_extraction"
        ? ({ memories: [{ ownerType: "character", ownerId: "someone_else", content: "x", importance: 0.5, tags: [] }] } as never)
        : provider.structured(request);

    const result = await finalizeConversation({
      conversationId: conversation.id,
      runEvaluators: false,
      provider: { ...provider, structured: spy },
    });

    expect(result.createdMemoryCount).toBe(0);
    expect(result.failures[0]).toContain("out-of-scope owner");
  });
});
