import { notFound } from "next/navigation";
import { getEvaluations, getEventLogs, getGoalStates } from "@/db/conversations";
import { ScenarioRuntimeError } from "@/engine/errors";
import { loadSession } from "@/engine/runtime";
import { FinalizeButton } from "@/components/finalize-button";
import { isDebugEnabled } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function DebriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await loadSession(id).catch((error) => {
    if (error instanceof ScenarioRuntimeError) notFound();
    throw error;
  });

  const [evaluations, goalStates, events] = await Promise.all([
    getEvaluations(id),
    getGoalStates(id),
    getEventLogs(id),
  ]);

  const visibleGoals = isDebugEnabled()
    ? session.scenario.goals
    : session.scenario.goals.filter((goal) => !goal.hidden);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">Debrief · {session.scenario.name}</h1>
        <p className="text-sm text-muted">
          {session.scenario.evaluators.length === 0
            ? "This scenario attaches no evaluators. Not every scenario needs success or failure."
            : `Evaluators attached: ${session.scenario.evaluators.map((entry) => entry.evaluatorId).join(", ")}`}
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Goals</h2>
        <ul className="divide-y divide-border rounded border border-border text-sm">
          {visibleGoals.map((goal) => (
            <li key={goal.id} className="flex items-baseline justify-between gap-4 px-3 py-2">
              <span>
                {goal.description}
                {goal.hidden && <span className="ml-2 text-xs text-muted">(hidden)</span>}
              </span>
              <span className="text-xs text-muted">
                {goalStates.find((state) => state.goalId === goal.id)?.status ?? goal.status}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Events that fired
        </h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted">No events fired.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {events.map((event) => (
              <li key={event.id}>
                <span className="font-mono text-xs">{event.eventId}</span>
                <span className="ml-2 text-muted">
                  turn {event.turnIndex} · {event.trigger}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Evaluation</h2>
          <FinalizeButton conversationId={id} />
        </div>
        {evaluations.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing recorded yet. Run the debrief to extract memories and invoke the evaluators.
          </p>
        ) : (
          evaluations.map((evaluation) => (
            <article key={evaluation.id} className="rounded border border-border p-3">
              <h3 className="text-sm font-medium">{evaluation.evaluatorId}</h3>
              <pre className="mt-2 overflow-x-auto text-[11px] leading-relaxed">
                {JSON.stringify(evaluation.result, null, 2)}
              </pre>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
