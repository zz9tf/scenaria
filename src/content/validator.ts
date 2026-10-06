import { conditionTypes, getConditionKind } from "@/engine/conditions/registry";
import { effectTypes, getEffectKind } from "@/engine/effects/registry";
import { parseStatePath } from "@/engine/state/path";
import type { ContentIssue, ContentPackage } from "@/content/types";
import type { ConditionDefinition, EffectDefinition, ScenarioDefinition } from "@/types";
import { z } from "zod";

/**
 * Catches the §32 content error classes before runtime. Returns every issue rather than
 * throwing on the first so an author can fix a package in one pass.
 */
export function validatePackage(pkg: ContentPackage): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const packageId = pkg.manifest.id;
  const add = (path: string, message: string) => issues.push({ packageId, path, message });

  for (const world of pkg.worlds.values()) {
    for (const characterId of world.characterIds) {
      if (!pkg.characters.has(characterId)) {
        add(`worlds.${world.id}.characterIds`, `unknown character '${characterId}'`);
      }
    }
  }

  for (const relationship of pkg.relationships.values()) {
    for (const participantId of [relationship.participantAId, relationship.participantBId]) {
      // `user` is the engine-reserved id of the human participant and has no definition file.
      if (participantId !== "user" && !pkg.characters.has(participantId)) {
        add(`relationships.${relationship.id}`, `unknown participant '${participantId}'`);
      }
    }
  }

  for (const memory of pkg.memories) {
    const known =
      (memory.ownerType === "character" && pkg.characters.has(memory.ownerId)) ||
      (memory.ownerType === "relationship" && pkg.relationships.has(memory.ownerId)) ||
      (memory.ownerType === "world" && pkg.worlds.has(memory.ownerId));
    if (!known) {
      add("memories", `memory owner '${memory.ownerType}:${memory.ownerId}' does not exist`);
    }
  }

  for (const scenario of pkg.scenarios.values()) {
    validateScenario(scenario, pkg, add);
  }

  for (const story of pkg.stories.values()) {
    if (!pkg.worlds.has(story.worldId)) {
      add(`stories.${story.id}.worldId`, `unknown world '${story.worldId}'`);
    }
    for (const chapter of story.chapters) {
      if (!pkg.scenarios.has(chapter.scenarioId)) {
        add(`stories.${story.id}.chapters.${chapter.id}`, `unknown scenario '${chapter.scenarioId}'`);
      }
      validateCondition(chapter.unlockCondition, `stories.${story.id}.chapters.${chapter.id}`, add);
    }
  }

  return issues;
}

function validateScenario(
  scenario: ScenarioDefinition,
  pkg: ContentPackage,
  add: (path: string, message: string) => void,
): void {
  const base = `scenarios.${scenario.id}`;

  if (scenario.worldId !== undefined && !pkg.worlds.has(scenario.worldId)) {
    add(`${base}.worldId`, `unknown world '${scenario.worldId}'`);
  }

  const participantIds = new Set<string>();
  for (const participant of scenario.participants) {
    if (participantIds.has(participant.id)) {
      add(`${base}.participants`, `duplicate participant id '${participant.id}'`);
    }
    participantIds.add(participant.id);

    if (participant.kind === "npc") {
      const characterId = participant.characterId ?? participant.id;
      if (!pkg.characters.has(characterId)) {
        add(`${base}.participants.${participant.id}`, `unknown character '${characterId}'`);
      }
    }
  }

  if (scenario.openingMessage && !participantIds.has(scenario.openingMessage.speakerId)) {
    add(`${base}.openingMessage`, `speaker '${scenario.openingMessage.speakerId}' is not a participant`);
  }

  const goalIds = new Set<string>();
  for (const goal of scenario.goals) {
    if (goalIds.has(goal.id)) add(`${base}.goals`, `duplicate goal id '${goal.id}'`);
    goalIds.add(goal.id);
    if (!participantIds.has(goal.ownerId)) {
      add(`${base}.goals.${goal.id}`, `goal owner '${goal.ownerId}' is not a participant`);
    }
    validateCondition(goal.completionCondition, `${base}.goals.${goal.id}.completionCondition`, add);
    validateCondition(goal.failureCondition, `${base}.goals.${goal.id}.failureCondition`, add);
  }

  const eventIds = new Set<string>();
  for (const event of scenario.events) {
    if (eventIds.has(event.id)) add(`${base}.events`, `duplicate event id '${event.id}'`);
    eventIds.add(event.id);
    validateCondition(event.condition, `${base}.events.${event.id}.condition`, add);
    validateEffects(event.effects, `${base}.events.${event.id}.effects`, goalIds, pkg, add);
  }

  validateEffects(scenario.onStart, `${base}.onStart`, goalIds, pkg, add);

  for (const [index, rule] of scenario.completionRules.entries()) {
    validateCondition(rule.condition, `${base}.completionRules.${index}`, add);
    if ((rule.type === "condition" || rule.type === "custom") && !rule.condition) {
      add(`${base}.completionRules.${index}`, `'${rule.type}' completion rule requires a condition`);
    }
  }

  for (const reference of scenario.evaluators) {
    if (!pkg.evaluators.has(reference.evaluatorId)) {
      add(`${base}.evaluators`, `unknown evaluator '${reference.evaluatorId}'`);
    }
  }

  for (const rule of scenario.rules) {
    for (const target of rule.appliesTo) {
      if (!participantIds.has(target)) {
        add(`${base}.rules.${rule.id}`, `rule target '${target}' is not a participant`);
      }
    }
  }
}

function validateCondition(
  condition: ConditionDefinition | undefined,
  path: string,
  add: (path: string, message: string) => void,
): void {
  if (!condition) return;

  if (condition.type) {
    try {
      const kind = getConditionKind(condition.type);
      const parsed = kind.parameters.safeParse(condition.parameters ?? {});
      if (!parsed.success) {
        add(path, `invalid parameters for condition '${condition.type}': ${formatIssues(parsed.error)}`);
      }
    } catch {
      add(path, `unknown condition type '${condition.type}' (known: ${conditionTypes().join(", ")})`);
    }
  }

  condition.all?.forEach((child, index) => validateCondition(child, `${path}.all.${index}`, add));
  condition.any?.forEach((child, index) => validateCondition(child, `${path}.any.${index}`, add));
  validateCondition(condition.not, `${path}.not`, add);
}

function validateEffects(
  effects: EffectDefinition[],
  path: string,
  goalIds: Set<string>,
  pkg: ContentPackage,
  add: (path: string, message: string) => void,
): void {
  for (const [index, effect] of effects.entries()) {
    const effectPath = `${path}.${index}`;
    let kind;
    try {
      kind = getEffectKind(effect.type);
    } catch {
      add(effectPath, `unknown effect type '${effect.type}' (known: ${effectTypes().join(", ")})`);
      continue;
    }

    const parsed = kind.parameters.safeParse(effect.parameters);
    if (!parsed.success) {
      add(effectPath, `invalid parameters for effect '${effect.type}': ${formatIssues(parsed.error)}`);
      continue;
    }

    const parameters = effect.parameters;
    if (typeof parameters.path === "string") {
      try {
        parseStatePath(parameters.path);
      } catch (error) {
        add(effectPath, error instanceof Error ? error.message : String(error));
      }
    }
    if (typeof parameters.goalId === "string" && !goalIds.has(parameters.goalId)) {
      add(effectPath, `unknown goal '${parameters.goalId}'`);
    }
    if (typeof parameters.characterId === "string" && !pkg.characters.has(parameters.characterId)) {
      add(effectPath, `unknown character '${parameters.characterId}'`);
    }
  }
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.map(String).join(".") || "<root>"}: ${issue.message}`)
    .join("; ");
}
