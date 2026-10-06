import Link from "next/link";
import { prisma } from "@/db/client";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const rows = await prisma.conversation.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { scenarioInstance: true, _count: { select: { messages: true } } },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Conversation history</h1>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No conversations yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded border border-border text-sm">
          {rows.map((row) => (
            <li key={row.id} className="flex items-baseline justify-between gap-4 px-3 py-2">
              <div>
                <Link href={`/conversations/${row.id}`} className="font-medium hover:underline">
                  {row.scenarioInstance.scenarioDefinitionId}
                </Link>
                {row.parentConversationId && (
                  <span className="ml-2 text-xs text-muted">branch</span>
                )}
                <p className="text-xs text-muted">
                  {row.startedAt.toISOString()} · {row._count.messages} messages
                </p>
              </div>
              <span className="text-xs text-muted">
                {row.scenarioInstance.outcome ?? row.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
