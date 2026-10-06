import { getEventLogs, getGoalStates, getSnapshots } from "@/db/conversations";
import { loadSession } from "@/engine/runtime";
import { rankMemories } from "@/engine/memory/retrieval";
import { handle, isDebugEnabled } from "@/lib/api";
import { NextResponse } from "next/server";

/** Everything §35 asks the debug panel to display. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isDebugEnabled()) {
    return NextResponse.json({ error: "debug mode is disabled" }, { status: 403 });
  }

  return handle(async () => {
    const session = await loadSession(id);
    const [snapshots, goalStates, eventLogs] = await Promise.all([
      getSnapshots(id),
      getGoalStates(id),
      getEventLogs(id),
    ]);
    const lastMessage = session.messages.at(-1);

    return {
      state: session.state,
      goals: session.scenario.goals.map((goal) => ({
        ...goal,
        currentStatus: goalStates.find((state) => state.goalId === goal.id)?.status ?? goal.status,
      })),
      events: eventLogs,
      snapshots: snapshots.map((snapshot) => ({
        id: snapshot.id,
        turnIndex: snapshot.turnIndex,
        createdAt: snapshot.createdAt,
      })),
      analysis: lastMessage?.analysis,
      actionPlan: lastMessage?.actionPlan,
      memories: rankMemories(session.memories, {
        ownerKeys: session.memories.map((memory) => ({
          ownerType: memory.ownerType,
          ownerId: memory.ownerId,
        })),
        recentText: session.messages.slice(-4).map((message) => message.content),
        limit: 10,
      }).map((scored) => ({
        id: scored.memory.id,
        content: scored.memory.content,
        ownerType: scored.memory.ownerType,
        ownerId: scored.memory.ownerId,
        score: Number(scored.score.toFixed(3)),
        components: scored.components,
      })),
    };
  });
}
