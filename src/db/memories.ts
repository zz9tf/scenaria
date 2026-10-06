import { prisma } from "@/db/client";
import { jsonStringArray, toJson } from "@/db/json";
import { memorySchema } from "@/schemas";
import type { Memory, MemoryOwnerType } from "@/types";

export async function listMemories(worldInstanceId: string): Promise<Memory[]> {
  const rows = await prisma.memory.findMany({ where: { worldInstanceId } });
  return rows.map((row) =>
    memorySchema.parse({
      id: row.id,
      ownerType: row.ownerType,
      ownerId: row.ownerId,
      content: row.content,
      type: row.type ?? undefined,
      importance: row.importance,
      emotionalWeight: row.emotionalWeight ?? undefined,
      tags: jsonStringArray(row.tags),
      sourceConversationId: row.sourceConversationId ?? undefined,
      sourceMessageIds: jsonStringArray(row.sourceMessageIds),
      createdAt: row.createdAt,
    }),
  );
}

export interface NewMemory {
  ownerType: MemoryOwnerType;
  ownerId: string;
  content: string;
  type?: string;
  importance: number;
  emotionalWeight?: number;
  tags: string[];
  sourceConversationId?: string;
  sourceMessageIds?: string[];
}

export async function createMemories(
  worldInstanceId: string,
  memories: NewMemory[],
): Promise<number> {
  if (memories.length === 0) return 0;
  const result = await prisma.memory.createMany({
    data: memories.map((memory) => ({
      worldInstanceId,
      ownerType: memory.ownerType,
      ownerId: memory.ownerId,
      content: memory.content,
      type: memory.type ?? null,
      importance: memory.importance,
      emotionalWeight: memory.emotionalWeight ?? null,
      tags: toJson(memory.tags),
      sourceConversationId: memory.sourceConversationId ?? null,
      sourceMessageIds: toJson(memory.sourceMessageIds ?? []),
    })),
  });
  return result.count;
}
