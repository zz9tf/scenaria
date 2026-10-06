import { getEvaluations, getGoalStates } from "@/db/conversations";
import { loadSession } from "@/engine/runtime";
import { handle, isDebugEnabled } from "@/lib/api";

/** Hidden state is withheld unless debug mode is on (§34). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handle(async () => {
    const session = await loadSession(id);
    const goalStates = await getGoalStates(id);

    return {
      conversation: session.conversation,
      scenario: {
        id: session.scenario.id,
        name: session.scenario.name,
        initialContext: session.scenario.initialContext,
        participants: session.scenario.participants,
      },
      messages: session.messages.map((message) => ({
        id: message.id,
        turnIndex: message.turnIndex,
        senderId: message.senderId,
        senderKind: message.senderKind,
        content: message.content,
        tone: message.tone,
        createdAt: message.createdAt,
      })),
      goals: isDebugEnabled()
        ? session.scenario.goals.map((goal) => ({
            ...goal,
            status: goalStates.find((state) => state.goalId === goal.id)?.status ?? goal.status,
          }))
        : session.scenario.goals
            .filter((goal) => !goal.hidden)
            .map((goal) => ({
              id: goal.id,
              ownerId: goal.ownerId,
              description: goal.description,
              status: goalStates.find((state) => state.goalId === goal.id)?.status ?? goal.status,
            })),
      evaluations: await getEvaluations(id),
    };
  });
}
