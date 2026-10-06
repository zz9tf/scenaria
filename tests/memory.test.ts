import { describe, expect, it } from "vitest";
import { rankMemories } from "@/engine/memory/retrieval";
import { interactionAnalysisSchema, memorySchema } from "@/schemas";
import type { Memory } from "@/types";

const DAY = 86_400_000;
const now = new Date("2026-10-05T12:00:00Z");

function memory(raw: Partial<Memory> & Pick<Memory, "id" | "content">): Memory {
  return memorySchema.parse({
    ownerType: "character",
    ownerId: "npc",
    importance: 0.5,
    tags: [],
    createdAt: now,
    ...raw,
  });
}

describe("rankMemories", () => {
  it("excludes memories whose owner was not requested", () => {
    const ranked = rankMemories(
      [
        memory({ id: "mine", content: "deadline slipped" }),
        memory({ id: "theirs", content: "deadline slipped", ownerId: "other" }),
      ],
      { ownerKeys: [{ ownerType: "character", ownerId: "npc" }], recentText: [], now },
    );
    expect(ranked.map((entry) => entry.memory.id)).toEqual(["mine"]);
  });

  it("ranks topic-relevant memories above unrelated ones", () => {
    const ranked = rankMemories(
      [
        memory({ id: "unrelated", content: "Enjoys hiking on weekends.", importance: 0.9 }),
        memory({ id: "relevant", content: "Missed an agreed deadline once before.", tags: ["deadline"], importance: 0.5 }),
      ],
      {
        ownerKeys: [{ ownerType: "character", ownerId: "npc" }],
        analysis: interactionAnalysisSchema.parse({ topics: ["deadline"] }),
        recentText: ["I need more time on the deadline"],
        now,
      },
    );
    expect(ranked[0]?.memory.id).toBe("relevant");
  });

  it("decays older memories", () => {
    const ranked = rankMemories(
      [
        memory({ id: "old", content: "same wording here", createdAt: new Date(now.getTime() - 180 * DAY) }),
        memory({ id: "new", content: "same wording here" }),
      ],
      { ownerKeys: [{ ownerType: "character", ownerId: "npc" }], recentText: [], now },
    );
    expect(ranked[0]?.memory.id).toBe("new");
    expect(ranked[0]?.components.recency).toBeGreaterThan(ranked[1]!.components.recency);
  });

  it("honours the limit", () => {
    const memories = Array.from({ length: 10 }, (_, index) =>
      memory({ id: `m${index}`, content: `memory ${index}` }),
    );
    expect(rankMemories(memories, { ownerKeys: [{ ownerType: "character", ownerId: "npc" }], recentText: [], limit: 3, now })).toHaveLength(3);
  });

  it("keeps every component bounded to 0..1", () => {
    const ranked = rankMemories(
      [memory({ id: "m", content: "deadline deadline deadline", importance: 1, emotionalWeight: -1, tags: ["deadline"] })],
      {
        ownerKeys: [{ ownerType: "character", ownerId: "npc" }],
        analysis: interactionAnalysisSchema.parse({ topics: ["deadline"] }),
        recentText: ["deadline"],
        now,
      },
    );
    const entry = ranked[0]!;
    for (const value of Object.values(entry.components)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(entry.score).toBeLessThanOrEqual(1);
  });
});
