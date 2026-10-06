import Link from "next/link";
import { notFound } from "next/navigation";
import { ScenarioRuntimeError } from "@/engine/errors";
import { loadSession } from "@/engine/runtime";
import { listBranches } from "@/engine/runtime/branch";
import { Transcript } from "@/components/transcript";

export const dynamic = "force-dynamic";

/** §33 replay / branch viewer: every branch of one root, side by side. */
export default async function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await loadSession(id).catch((error) => {
    if (error instanceof ScenarioRuntimeError) notFound();
    throw error;
  });

  const branches = await listBranches(session.conversation.rootConversationId);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">Replay · {session.scenario.name}</h1>
        <p className="text-sm text-muted">
          {branches.length} conversation{branches.length === 1 ? "" : "s"} share this root. Each
          branch restored the state snapshot taken before its fork point and continued
          independently.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {branches.map(({ conversation, messages }) => (
          <section
            key={conversation.id}
            className={`space-y-2 rounded border p-3 ${
              conversation.id === id ? "border-foreground" : "border-border"
            }`}
          >
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium">
                {conversation.parentConversationId ? "branch" : "trunk"} · {conversation.status}
              </span>
              <Link href={`/conversations/${conversation.id}`} className="underline text-muted hover:text-foreground">
                open
              </Link>
            </div>
            {conversation.branchFromMessageId && (
              <p className="text-xs text-muted">forked before message {conversation.branchFromMessageId}</p>
            )}
            <Transcript messages={messages} participants={session.scenario.participants} />
          </section>
        ))}
      </div>
    </div>
  );
}
