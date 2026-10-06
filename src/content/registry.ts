import { loadAllPackages } from "@/content/loader";
import { validatePackage } from "@/content/validator";
import type { ContentPackage } from "@/content/types";
import { ContentValidationError } from "@/engine/errors";
import type { Character, ScenarioDefinition, World } from "@/types";

let cache: Promise<Map<string, ContentPackage>> | undefined;

/**
 * Packages are loaded once per process and validated on load, so a broken package fails
 * at startup rather than mid-conversation (§32).
 */
export function contentRegistry(): Promise<Map<string, ContentPackage>> {
  cache ??= loadAllPackages().then((packages) => {
    const issues = [...packages.values()].flatMap(validatePackage);
    if (issues.length > 0) {
      throw new ContentValidationError(`content validation failed with ${issues.length} issue(s)`, {
        issues,
      });
    }
    return packages;
  });
  return cache;
}

/** Test and script hook; the Next.js dev server picks up edits on reload. */
export function resetContentRegistry(): void {
  cache = undefined;
}

export async function getPackage(packageId: string): Promise<ContentPackage> {
  const pkg = (await contentRegistry()).get(packageId);
  if (!pkg) throw new ContentValidationError(`unknown content package '${packageId}'`);
  return pkg;
}

export interface ResolvedScenario {
  packageId: string;
  scenario: ScenarioDefinition;
  world?: World;
  /** Keyed by participant id, which may differ from the character definition id. */
  charactersByParticipant: Map<string, Character>;
}

export async function resolveScenario(
  packageId: string,
  scenarioId: string,
): Promise<ResolvedScenario> {
  const pkg = await getPackage(packageId);
  const scenario = pkg.scenarios.get(scenarioId);
  if (!scenario) {
    throw new ContentValidationError(`unknown scenario '${scenarioId}' in package '${packageId}'`);
  }

  const charactersByParticipant = new Map<string, Character>();
  for (const participant of scenario.participants) {
    if (participant.kind !== "npc") continue;
    const characterId = participant.characterId ?? participant.id;
    const character = pkg.characters.get(characterId);
    if (!character) {
      throw new ContentValidationError(`unknown character '${characterId}'`, { scenarioId });
    }
    charactersByParticipant.set(participant.id, character);
  }

  return {
    packageId,
    scenario,
    world: scenario.worldId ? pkg.worlds.get(scenario.worldId) : undefined,
    charactersByParticipant,
  };
}

export async function listScenarios(): Promise<
  Array<{ packageId: string; packageName: string; scenario: ScenarioDefinition }>
> {
  const packages = await contentRegistry();
  return [...packages.values()].flatMap((pkg) =>
    [...pkg.scenarios.values()].map((scenario) => ({
      packageId: pkg.manifest.id,
      packageName: pkg.manifest.name,
      scenario,
    })),
  );
}
