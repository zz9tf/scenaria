import { interactionAnalysisSchema, npcActionPlanSchema } from "@/schemas";
import type { LlmProvider, StructuredRequest, TextRequest } from "@/llm/types";
import type { InteractionAnalysis, NPCActionPlan } from "@/types";

export interface Script {
  /** Consumed one per turn; the last entry repeats once exhausted. */
  analyses?: Array<Partial<InteractionAnalysis>>;
  plans?: Array<Partial<NPCActionPlan>>;
  text?: string;
  evaluation?: Record<string, unknown>;
  failOn?: Set<string>;
}

/**
 * Deterministic provider that lets a test drive the engine through a chosen sequence of
 * interpreter and decision outputs, which is what makes the LLM-adjacent pipeline testable
 * without asserting anything about model prose.
 */
export function scriptedProvider(script: Script = {}): LlmProvider {
  let analysisIndex = 0;
  let planIndex = 0;

  const next = <T>(entries: T[] | undefined, index: number): T | undefined =>
    entries === undefined || entries.length === 0
      ? undefined
      : (entries[Math.min(index, entries.length - 1)] as T);

  return {
    name: "scripted",

    async structured<T>(request: StructuredRequest<T>): Promise<T> {
      if (script.failOn?.has(request.label)) {
        throw new Error(`scripted failure for '${request.label}'`);
      }

      if (request.label === "interpreter") {
        const analysis = interactionAnalysisSchema.parse(next(script.analyses, analysisIndex) ?? {});
        analysisIndex += 1;
        return analysis as T;
      }
      if (request.label === "decision") {
        const plan = npcActionPlanSchema.parse(
          next(script.plans, planIndex) ?? { intent: "respond", responseStrategy: "direct" },
        );
        planIndex += 1;
        return plan as T;
      }
      if (request.label === "memory_extraction") {
        return { memories: [] } as T;
      }
      return (script.evaluation ?? { summary: "scripted" }) as T;
    },

    async text(request: TextRequest): Promise<string> {
      if (script.failOn?.has(request.label)) {
        throw new Error(`scripted failure for '${request.label}'`);
      }
      return script.text ?? "Scripted reply.";
    },
  };
}
