import { loadSession } from "@/engine/runtime";
import { listBranches } from "@/engine/runtime/branch";
import { handle } from "@/lib/api";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handle(async () => {
    const session = await loadSession(id);
    return { branches: await listBranches(session.conversation.rootConversationId) };
  });
}
