import type { WorldInstance } from "@prisma/client";
import type { ContentPackage } from "@/content/types";
import { prisma } from "@/db/client";
import { toJson } from "@/db/json";
import type { World } from "@/types";

/**
 * Materialises the §39 instance side of a world the first time it is played, including
 * character instances, relationship instances and the package's seed memories. Later
 * playthroughs reuse the same instance, which is what makes characters persist across
 * scenarios (§49).
 */
export async function ensureWorldInstance(
  pkg: ContentPackage,
  world: World,
): Promise<WorldInstance> {
  const existing = await prisma.worldInstance.findUnique({
    where: { packageId_worldDefinitionId: { packageId: pkg.manifest.id, worldDefinitionId: world.id } },
  });
  if (existing) return existing;

  return prisma.$transaction(async (tx) => {
    const worldInstance = await tx.worldInstance.create({
      data: {
        packageId: pkg.manifest.id,
        worldDefinitionId: world.id,
        globalState: toJson(world.globalState),
      },
    });

    await tx.characterInstance.createMany({
      data: world.characterIds.map((characterId) => ({
        worldInstanceId: worldInstance.id,
        characterDefinitionId: characterId,
        state: toJson({}),
      })),
    });

    const relationships = [...pkg.relationships.values()];
    await tx.relationshipInstance.createMany({
      data: relationships.map((relationship) => ({
        worldInstanceId: worldInstance.id,
        relationshipDefinitionId: relationship.id,
        participantAId: relationship.participantAId,
        participantBId: relationship.participantBId,
        type: relationship.type ?? null,
        state: toJson(relationship.state),
        history: toJson(relationship.history),
      })),
    });

    await tx.memory.createMany({
      data: pkg.memories.map((memory) => ({
        worldInstanceId: worldInstance.id,
        ownerType: memory.ownerType,
        ownerId: memory.ownerId,
        content: memory.content,
        type: memory.type ?? null,
        importance: memory.importance,
        emotionalWeight: memory.emotionalWeight ?? null,
        tags: toJson(memory.tags),
        sourceMessageIds: toJson([]),
      })),
    });

    return worldInstance;
  });
}

export async function ensureUser(externalId: string, displayName = "Learner") {
  return prisma.user.upsert({
    where: { externalId },
    update: {},
    create: { externalId, displayName },
  });
}
