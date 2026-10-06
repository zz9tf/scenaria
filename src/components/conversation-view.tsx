"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { DebugPanel } from "@/components/debug-panel";
import { Transcript, type TranscriptMessage } from "@/components/transcript";
import type { Participant, TurnTrace } from "@/types";

export interface ConversationViewProps {
  conversationId: string;
  scenario: { id: string; name: string; initialContext: string; participants: Participant[] };
  initialMessages: TranscriptMessage[];
  initialStatus: "active" | "completed" | "abandoned";
  debugEnabled: boolean;
}

export function ConversationView({
  conversationId,
  scenario,
  initialMessages,
  initialStatus,
  debugEnabled,
}: ConversationViewProps) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [status, setStatus] = useState(initialStatus);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [trace, setTrace] = useState<TurnTrace>();

  async function send() {
    const content = draft.trim();
    if (content.length === 0 || pending) return;

    setPending(true);
    setError(undefined);
    setDraft("");

    const response = await fetch(`/api/conversations/${conversationId}/turns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const body = await response.json();

    if (!response.ok) {
      setError(body.error ?? "turn failed");
      setDraft(content);
      setPending(false);
      return;
    }

    setMessages((current) => [
      ...current,
      body.userMessage,
      ...(body.systemMessages ?? []),
      ...(body.npcMessages ?? []),
    ]);
    setTrace(body.trace);
    if (body.completed) setStatus("completed");
    setPending(false);
  }

  async function branch(messageId: string) {
    const response = await fetch(`/api/conversations/${conversationId}/branch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messageId }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "branch failed");
      return;
    }
    router.push(`/conversations/${body.conversation.id}`);
  }

  return (
    <div className={debugEnabled ? "grid gap-6 lg:grid-cols-[1fr_22rem]" : "space-y-6"}>
      <div className="space-y-4">
        <header className="space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-lg font-semibold">{scenario.name}</h1>
            <span className="text-xs text-muted">{status}</span>
          </div>
          <p className="text-sm text-muted">{scenario.initialContext}</p>
          <div className="flex gap-3 text-xs">
            <Link href={`/conversations/${conversationId}/replay`} className="underline text-muted hover:text-foreground">
              replay / branches
            </Link>
            <Link href={`/conversations/${conversationId}/debrief`} className="underline text-muted hover:text-foreground">
              debrief
            </Link>
          </div>
        </header>

        <Transcript messages={messages} participants={scenario.participants} onBranch={branch} />

        {status === "active" ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
            className="flex gap-2"
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Your reply"
              disabled={pending}
              className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={pending || draft.trim().length === 0}
              className="rounded border border-border px-3 py-2 text-sm hover:bg-panel disabled:opacity-50"
            >
              {pending ? "…" : "Send"}
            </button>
          </form>
        ) : (
          <p className="rounded border border-border bg-panel px-3 py-2 text-sm text-muted">
            This conversation has ended. Open the debrief, or branch from any earlier turn to try
            a different path.
          </p>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      {debugEnabled && <DebugPanel conversationId={conversationId} lastTrace={trace} />}
    </div>
  );
}
