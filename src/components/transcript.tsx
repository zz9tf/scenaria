import type { Participant } from "@/types";

export interface TranscriptMessage {
  id: string;
  turnIndex: number;
  senderId: string;
  senderKind: "user" | "npc" | "system";
  content: string;
  tone?: string;
}

function label(participants: Participant[], message: TranscriptMessage): string {
  if (message.senderKind === "system") return "scene";
  const participant = participants.find((entry) => entry.id === message.senderId);
  return participant?.displayName ?? message.senderId;
}

export function Transcript({
  messages,
  participants,
  onBranch,
}: {
  messages: TranscriptMessage[];
  participants: Participant[];
  onBranch?: (messageId: string) => void;
}) {
  return (
    <ol className="space-y-3">
      {messages.map((message) => (
        <li
          key={message.id}
          className={
            message.senderKind === "system"
              ? "rounded border border-dashed border-border px-3 py-2 text-sm italic text-muted"
              : message.senderKind === "user"
                ? "ml-auto max-w-[80%] rounded border border-border bg-panel px-3 py-2"
                : "max-w-[80%] rounded border border-border px-3 py-2"
          }
        >
          {message.senderKind !== "system" && (
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium text-muted">
                {label(participants, message)}
                {message.tone ? ` · ${message.tone}` : ""}
              </span>
              {onBranch && message.senderKind === "user" && (
                <button
                  type="button"
                  onClick={() => onBranch(message.id)}
                  className="text-xs text-muted underline hover:text-foreground"
                  title="Replay the conversation from this point with a different answer"
                >
                  branch here
                </button>
              )}
            </div>
          )}
          <p className="mt-1 whitespace-pre-line text-sm">{message.content}</p>
        </li>
      ))}
    </ol>
  );
}
