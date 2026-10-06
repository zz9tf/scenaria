import { submitTurn } from "@/engine/runtime";
import { handle, isDebugEnabled } from "@/lib/api";
import { z } from "zod";

const turnInput = z.object({ content: z.string().min(1).max(4000) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handle(async () => {
    const { content } = turnInput.parse(await request.json());
    const result = await submitTurn({ conversationId: id, content });

    return {
      userMessage: result.userMessage,
      systemMessages: result.systemMessages,
      npcMessages: result.npcMessages,
      completed: result.completed,
      // The trace is the debug payload of §35 and stays off by default.
      trace: isDebugEnabled() ? result.trace : undefined,
      state: isDebugEnabled() ? result.state : undefined,
    };
  });
}
