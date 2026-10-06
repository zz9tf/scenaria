"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StartScenarioButton({
  packageId,
  scenarioId,
}: {
  packageId: string;
  scenarioId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function start() {
    setPending(true);
    setError(undefined);
    const response = await fetch("/api/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packageId, scenarioId }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "failed to start scenario");
      setPending(false);
      return;
    }
    router.push(`/conversations/${body.conversation.id}`);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={start}
        disabled={pending}
        className="rounded border border-border px-3 py-1.5 text-sm hover:bg-panel disabled:opacity-50"
      >
        {pending ? "Starting…" : "Start scenario"}
      </button>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
