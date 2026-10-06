import { notFound } from "next/navigation";
import { resolveScenario } from "@/content/registry";
import { ContentValidationError } from "@/engine/errors";
import { StartScenarioButton } from "@/components/start-scenario-button";

export const dynamic = "force-dynamic";

export default async function ScenarioIntro({
  params,
}: {
  params: Promise<{ packageId: string; scenarioId: string }>;
}) {
  const { packageId, scenarioId } = await params;

  const resolved = await resolveScenario(packageId, scenarioId).catch((error) => {
    if (error instanceof ContentValidationError) notFound();
    throw error;
  });
  const { scenario } = resolved;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold">{scenario.name}</h1>
        {scenario.description && <p className="text-sm text-muted">{scenario.description}</p>}
      </header>

      <section className="rounded border border-border bg-panel p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Context</h2>
        <p className="mt-2 whitespace-pre-line text-sm">{scenario.initialContext}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Participants</h2>
        <ul className="space-y-1 text-sm">
          {scenario.participants.map((participant) => {
            const character = resolved.charactersByParticipant.get(participant.id);
            return (
              <li key={participant.id}>
                <span className="font-medium">
                  {participant.displayName ?? character?.name ?? participant.id}
                </span>
                <span className="ml-2 text-muted">
                  {participant.kind === "user" ? "you" : (character?.role ?? "npc")}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Visible goals only; hidden goals are never shown to the player (§34). */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Your goals</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {scenario.goals
            .filter((goal) => !goal.hidden && goal.ownerId === "user")
            .map((goal) => (
              <li key={goal.id}>{goal.description}</li>
            ))}
        </ul>
      </section>

      <StartScenarioButton packageId={packageId} scenarioId={scenarioId} />
    </div>
  );
}
