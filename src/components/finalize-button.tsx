"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function FinalizeButton({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function run() {
    setPending(true);
    setError(undefined);
    const response = await fetch(`/api/conversations/${conversationId}/finalize`, { method: "POST" });
    const body = await response.json();
    setPending(false);
    if (!response.ok) {
      setError(body.error ?? "debrief failed");
      return;
    }
    if (body.failures?.length) setError(body.failures.join("; "));
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-500">{error}</span>}
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded border border-border px-2 py-1 text-xs hover:bg-panel disabled:opacity-50"
      >
        {pending ? "Running…" : "Run debrief"}
      </button>
    </div>
  );
}
