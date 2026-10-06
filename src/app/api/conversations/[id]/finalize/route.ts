import { finalizeConversation } from "@/engine/runtime";
import { handle } from "@/lib/api";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handle(() => finalizeConversation({ conversationId: id }));
}
