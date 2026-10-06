import type { InteractionAnalysis, Memory } from "@/types";

export interface RetrievalQuery {
  /** Memory owners to consider: the character, its relationship with the user, the world. */
  ownerKeys: Array<{ ownerType: Memory["ownerType"]; ownerId: string }>;
  analysis?: InteractionAnalysis;
  recentText: string[];
  limit?: number;
  now?: Date;
}

export interface ScoredMemory {
  memory: Memory;
  score: number;
  components: { relevance: number; importance: number; recency: number; emotion: number };
}

// §28 lists semantic relevance first, so it outweighs the other three dimensions.
const WEIGHTS = { relevance: 0.5, importance: 0.25, recency: 0.15, emotion: 0.1 } as const;
const RECENCY_HALF_LIFE_DAYS = 30;

/**
 * Lexical-overlap ranking over the four dimensions in §28. Deliberately not a vector
 * search: §36 defers a vector database until memory scale requires one.
 */
export function rankMemories(memories: Memory[], query: RetrievalQuery): ScoredMemory[] {
  const owners = new Set(query.ownerKeys.map((key) => `${key.ownerType}:${key.ownerId}`));
  const now = query.now ?? new Date();
  const queryTokens = tokenize(
    [
      ...(query.analysis?.topics ?? []),
      ...(query.analysis?.intents ?? []),
      ...(query.analysis?.referencedEntities ?? []),
      ...query.recentText,
    ].join(" "),
  );

  const scored = memories
    .filter((memory) => owners.has(`${memory.ownerType}:${memory.ownerId}`))
    .map((memory) => {
      const components = {
        relevance: lexicalOverlap(queryTokens, tokenize(`${memory.content} ${memory.tags.join(" ")}`)),
        importance: memory.importance,
        recency: recencyScore(memory.createdAt, now),
        emotion: Math.abs(memory.emotionalWeight ?? 0),
      };
      const score =
        components.relevance * WEIGHTS.relevance +
        components.importance * WEIGHTS.importance +
        components.recency * WEIGHTS.recency +
        components.emotion * WEIGHTS.emotion;
      return { memory, score, components };
    })
    .sort((a, b) => b.score - a.score || b.memory.importance - a.memory.importance);

  return query.limit === undefined ? scored : scored.slice(0, query.limit);
}

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "has", "have", "i",
  "in", "is", "it", "its", "of", "on", "or", "that", "the", "to", "was", "were", "with", "you",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
  );
}

/**
 * Share of the query covered by the memory, bounded to 0..1 like the other components.
 * Coverage rather than Jaccard, so a long memory is not penalised for its own length.
 */
function lexicalOverlap(query: Set<string>, memory: Set<string>): number {
  if (query.size === 0 || memory.size === 0) return 0;
  let shared = 0;
  for (const token of query) if (memory.has(token)) shared += 1;
  return shared / query.size;
}

function recencyScore(createdAt: Date, now: Date): number {
  const ageDays = Math.max(0, (now.getTime() - createdAt.getTime()) / 86_400_000);
  return 0.5 ** (ageDays / RECENCY_HALF_LIFE_DAYS);
}
