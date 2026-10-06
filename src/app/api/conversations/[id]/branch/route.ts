import { branchFrom } from "@/engine/runtime";
import { handle } from "@/lib/api";
import { z } from "zod";

const branchInput = z.object({ messageId: z.string().min(1) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handle(async () => {
    const { messageId } = branchInput.parse(await request.json());
    return branchFrom({ conversationId: id, messageId });
  });
}
