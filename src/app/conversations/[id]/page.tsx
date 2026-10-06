import { notFound } from "next/navigation";
import { ConversationView } from "@/components/conversation-view";
import { loadSession } from "@/engine/runtime";
import { ScenarioRuntimeError } from "@/engine/errors";
import { isDebugEnabled } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await loadSession(id).catch((error) => {
    if (error instanceof ScenarioRuntimeError) notFound();
    throw error;
  });

  return (
    <ConversationView
      conversationId={id}
      scenario={{
        id: session.scenario.id,
        name: session.scenario.name,
        initialContext: session.scenario.initialContext,
        participants: session.scenario.participants,
      }}
      initialMessages={session.messages.map((message) => ({
        id: message.id,
        turnIndex: message.turnIndex,
        senderId: message.senderId,
        senderKind: message.senderKind,
        content: message.content,
        tone: message.tone,
      }))}
      initialStatus={session.conversation.status}
      debugEnabled={isDebugEnabled()}
    />
  );
}
