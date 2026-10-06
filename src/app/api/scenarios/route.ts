import { listScenarios } from "@/content/registry";
import { handle } from "@/lib/api";

export async function GET() {
  return handle(async () => ({
    scenarios: (await listScenarios()).map(({ packageId, packageName, scenario }) => ({
      packageId,
      packageName,
      id: scenario.id,
      name: scenario.name,
      description: scenario.description,
      participantCount: scenario.participants.length,
      goalCount: scenario.goals.length,
      eventCount: scenario.events.length,
      tests: scenario.metadata.tests ?? [],
    })),
  }));
}
