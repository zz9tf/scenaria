import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { ContentValidationError } from "@/engine/errors";
import {
  characterSchema,
  evaluatorSchema,
  packageManifestSchema,
  relationshipSchema,
  scenarioDefinitionSchema,
  seedMemorySchema,
  storySchema,
  worldSchema,
} from "@/schemas";
import type { ContentPackage } from "@/content/types";
import type { z } from "zod";

export const CONTENT_ROOT = path.join(process.cwd(), "content", "packages");

/**
 * Manifest entries are file stems; both `.yaml` and `.yml` are accepted so authors are
 * not forced onto one extension.
 */
async function readYaml(dir: string, stem: string): Promise<unknown> {
  for (const extension of [".yaml", ".yml"]) {
    const file = path.join(dir, `${stem}${extension}`);
    try {
      return YAML.parse(await fs.readFile(file, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new ContentValidationError(`failed to parse ${file}`, { cause: String(error) });
      }
    }
  }
  throw new ContentValidationError(`missing content file '${stem}.yaml' in ${dir}`);
}

async function loadAll<T>(
  packageDir: string,
  kind: string,
  stems: string[],
  schema: z.ZodType<T, unknown>,
  idOf: (value: T) => string,
): Promise<Map<string, T>> {
  const dir = path.join(packageDir, kind);
  const entries = new Map<string, T>();

  for (const stem of stems) {
    const raw = await readYaml(dir, stem);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new ContentValidationError(`invalid ${kind} file '${stem}'`, {
        issues: parsed.error.issues,
      });
    }
    const id = idOf(parsed.data);
    if (entries.has(id)) {
      throw new ContentValidationError(`duplicate ${kind} id '${id}'`, { stem });
    }
    entries.set(id, parsed.data);
  }

  return entries;
}

export async function listPackageIds(root = CONTENT_ROOT): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

export async function loadPackage(packageId: string, root = CONTENT_ROOT): Promise<ContentPackage> {
  const packageDir = path.join(root, packageId);
  const manifest = packageManifestSchema.parse(await readYaml(packageDir, "package"));

  if (manifest.id !== packageId) {
    throw new ContentValidationError(
      `manifest id '${manifest.id}' does not match directory '${packageId}'`,
    );
  }

  const memoryFiles = await Promise.all(
    manifest.memories.map((stem) => readYaml(path.join(packageDir, "memories"), stem)),
  );

  return {
    manifest,
    worlds: await loadAll(packageDir, "worlds", manifest.worlds, worldSchema, (w) => w.id),
    characters: await loadAll(
      packageDir,
      "characters",
      manifest.characters,
      characterSchema,
      (c) => c.id,
    ),
    relationships: await loadAll(
      packageDir,
      "relationships",
      manifest.relationships,
      relationshipSchema,
      (r) => r.id,
    ),
    scenarios: await loadAll(
      packageDir,
      "scenarios",
      manifest.scenarios,
      scenarioDefinitionSchema,
      (s) => s.id,
    ),
    stories: await loadAll(packageDir, "stories", manifest.stories, storySchema, (s) => s.id),
    evaluators: await loadAll(
      packageDir,
      "evaluators",
      manifest.evaluators,
      evaluatorSchema,
      (e) => e.id,
    ),
    memories: memoryFiles.flatMap((file) =>
      (Array.isArray(file) ? file : [file]).map((entry) => seedMemorySchema.parse(entry)),
    ),
  };
}

export async function loadAllPackages(root = CONTENT_ROOT): Promise<Map<string, ContentPackage>> {
  const ids = await listPackageIds(root);
  const packages = await Promise.all(ids.map((id) => loadPackage(id, root)));
  return new Map(packages.map((pkg) => [pkg.manifest.id, pkg]));
}
