import { prisma } from "@/db/client";
import { startScenario } from "@/engine/runtime";
import { handle } from "@/lib/api";
import { z } from "zod";

const startInput = z.object({
  packageId: z.string().min(1),
  scenarioId: z.string().min(1),
  userExternalId: z.string().min(1).default("local-user"),
});

export async function POST(request: Request) {
  return handle(async () => {
    const body = startInput.parse(await request.json());
    return startScenario(body);
  });
}

export async function GET() {
  return handle(async () => {
    const rows = await prisma.conversation.findMany({
      orderBy: { startedAt: "desc" },
      take: 50,
      include: { scenarioInstance: true, _count: { select: { messages: true } } },
    });
    return {
      conversations: rows.map((row) => ({
        id: row.id,
        scenarioId: row.scenarioInstance.scenarioDefinitionId,
        packageId: row.scenarioInstance.packageId,
        status: row.status,
        outcome: row.scenarioInstance.outcome,
        isBranch: row.parentConversationId !== null,
        rootConversationId: row.rootConversationId,
        messageCount: row._count.messages,
        startedAt: row.startedAt,
      })),
    };
  });
}
