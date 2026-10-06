import Link from "next/link";

const LAYERS = [
  { name: "Experience", detail: "Chat UI, scenario intro, replay, history, debrief" },
  { name: "Scenario runtime", detail: "Turns, goals, events, conditions, branching, completion" },
  { name: "Simulation model", detail: "Characters, relationships, memory, world and conversation state" },
  { name: "LLM layer", detail: "Interpretation, character decision, rendering, evaluation" },
];

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">A content-agnostic scenario engine</h1>
        <p className="max-w-2xl text-sm text-muted">
          The engine knows how interactions work. It does not know what interactions mean
          pedagogically — that belongs to content packages and evaluators. Characters,
          relationships and memories persist across scenarios; every turn is snapshotted so a
          conversation can be replayed or branched from any earlier point.
        </p>
        <Link
          href="/scenarios"
          className="inline-block rounded border border-border px-3 py-1.5 text-sm hover:bg-panel"
        >
          Browse scenarios
        </Link>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Architecture</h2>
        <ul className="divide-y divide-border rounded border border-border">
          {LAYERS.map((layer) => (
            <li key={layer.name} className="px-3 py-2">
              <span className="text-sm font-medium">{layer.name}</span>
              <span className="ml-2 text-sm text-muted">{layer.detail}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
