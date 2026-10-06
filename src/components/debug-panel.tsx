"use client";

import { useState } from "react";
import type { TurnTrace } from "@/types";

interface DebugSnapshot {
  state: unknown;
  goals: unknown;
  events: unknown;
  memories: unknown;
  analysis?: unknown;
  actionPlan?: unknown;
  snapshots: unknown;
}

function Section({ title, value }: { title: string; value: unknown }) {
  if (value === undefined) return null;
  return (
    <details className="border-t border-border py-2 first:border-t-0">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </summary>
      <pre className="mt-2 overflow-x-auto text-[11px] leading-relaxed">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

/** §35. Developer-only; the route behind it returns 403 unless SCENARIA_DEBUG=1. */
export function DebugPanel({
  conversationId,
  lastTrace,
}: {
  conversationId: string;
  lastTrace?: TurnTrace;
}) {
  const [snapshot, setSnapshot] = useState<DebugSnapshot>();
  const [error, setError] = useState<string>();

  async function refresh() {
    const response = await fetch(`/api/conversations/${conversationId}/debug`);
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "debug unavailable");
      setSnapshot(undefined);
      return;
    }
    setError(undefined);
    setSnapshot(body);
  }

  return (
    <aside className="rounded border border-border bg-panel p-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Debug</h2>
        <button
          type="button"
          onClick={refresh}
          className="rounded border border-border px-2 py-0.5 text-xs hover:bg-background"
        >
          Refresh
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      <div className="mt-2">
        <Section title="Last turn trace" value={lastTrace} />
        <Section title="Simulation state" value={snapshot?.state} />
        <Section title="Goals" value={snapshot?.goals} />
        <Section title="Triggered events" value={snapshot?.events} />
        <Section title="Retrieved memories" value={snapshot?.memories} />
        <Section title="Interaction analysis" value={snapshot?.analysis} />
        <Section title="NPC action plan" value={snapshot?.actionPlan} />
        <Section title="State snapshots" value={snapshot?.snapshots} />
      </div>
    </aside>
  );
}
