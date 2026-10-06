import Link from "next/link";
import { listScenarios } from "@/content/registry";

export const dynamic = "force-dynamic";

export default async function ScenarioBrowser() {
  const scenarios = await listScenarios();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Scenario browser</h1>
      <ul className="space-y-3">
        {scenarios.map(({ packageId, packageName, scenario }) => (
          <li key={`${packageId}:${scenario.id}`} className="rounded border border-border p-4">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-base font-medium">{scenario.name}</h2>
              <span className="text-xs text-muted">{packageName}</span>
            </div>
            {scenario.description && (
              <p className="mt-1 text-sm text-muted">{scenario.description}</p>
            )}
            <p className="mt-2 text-xs text-muted">
              {scenario.participants.length} participants · {scenario.goals.length} goals ·{" "}
              {scenario.events.length} events · {scenario.completionRules.length} completion rules
            </p>
            <Link
              href={`/scenarios/${packageId}/${scenario.id}`}
              className="mt-3 inline-block rounded border border-border px-3 py-1 text-sm hover:bg-panel"
            >
              Open
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
