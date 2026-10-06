import type {
  Character,
  Evaluator,
  PackageManifest,
  Relationship,
  ScenarioDefinition,
  SeedMemory,
  Story,
  World,
} from "@/types";

export interface ContentPackage {
  manifest: PackageManifest;
  worlds: Map<string, World>;
  characters: Map<string, Character>;
  relationships: Map<string, Relationship>;
  scenarios: Map<string, ScenarioDefinition>;
  stories: Map<string, Story>;
  evaluators: Map<string, Evaluator>;
  memories: SeedMemory[];
}

export interface ContentIssue {
  packageId: string;
  file?: string;
  path: string;
  message: string;
}
