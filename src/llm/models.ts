import {
  interactionAnalysisSchema,
  memoryExtractionSchema,
  npcActionPlanSchema,
  renderedUtteranceSchema,
} from "@/schemas";
import { llmProvider } from "@/llm";
import {
  buildDecisionPrompt,
  buildInterpreterPrompt,
  buildRendererPrompt,
  ENGINE_GUARDRAIL,
  formatTranscript,
  type NpcContext,
} from "@/llm/prompts";
import type { LlmProvider } from "@/llm/types";
import type {
  Evaluator,
  InteractionAnalysis,
  MemoryExtraction,
  Message,
  NPCActionPlan,
  Participant,
} from "@/types";
import { jsonObjectSchema } from "@/schemas";
import type Anthropic from "@anthropic-ai/sdk";

export async function interpretMessage(
  context: NpcContext,
  userMessage: string,
  provider: LlmProvider = llmProvider(),
): Promise<InteractionAnalysis> {
  const prompt = buildInterpreterPrompt(context, userMessage);
  return provider.structured({
    label: "interpreter",
    schema: interactionAnalysisSchema,
    maxTokens: 4000,
    ...prompt,
  });
}

export async function decideNpcAction(
  context: NpcContext,
  provider: LlmProvider = llmProvider(),
): Promise<NPCActionPlan> {
  const prompt = buildDecisionPrompt(context);
  return provider.structured({
    label: "decision",
    schema: npcActionPlanSchema,
    maxTokens: 4000,
    ...prompt,
  });
}

export async function renderUtterance(
  context: NpcContext,
  provider: LlmProvider = llmProvider(),
): Promise<{ content: string; tone?: string }> {
  const prompt = buildRendererPrompt(context);
  const content = await provider.text({ label: "renderer", maxTokens: 1200, ...prompt });
  return renderedUtteranceSchema.parse({ content, tone: context.plan?.emotionalResponse });
}

export async function extractMemories(
  context: NpcContext,
  provider: LlmProvider = llmProvider(),
): Promise<MemoryExtraction> {
  return provider.structured({
    label: "memory_extraction",
    schema: memoryExtractionSchema,
    maxTokens: 4000,
    system: [
      {
        type: "text",
        text: [
          ENGINE_GUARDRAIL,
          "",
          "Role: memory extractor. Record only what would still matter weeks later.",
          "Prefer few, specific, durable memories over many trivial ones. Zero memories is a valid answer.",
          `Valid owners: character '${context.character.id}', relationship '${context.relationship?.id ?? "none"}', world '${context.scenario.worldId ?? "none"}'.`,
        ].join("\n"),
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          `<transcript>\n${formatTranscript(context.transcript, context.participants, 100)}\n</transcript>`,
          `<final_state>\n${JSON.stringify(context.state, null, 2)}\n</final_state>`,
        ].join("\n\n"),
      },
    ],
  });
}

export interface EvaluationBundle {
  transcript?: Message[];
  participants: Participant[];
  stateHistory?: unknown;
  goalHistory?: unknown;
  eventHistory?: unknown;
  memoryChanges?: unknown;
  relationshipChanges?: unknown;
  branchInfo?: unknown;
}

/**
 * Evaluators declare their own output shape (§25), so the engine validates the response as
 * a JSON object and leaves per-evaluator key checking to the caller.
 */
export async function runEvaluator(
  evaluator: Evaluator,
  bundle: EvaluationBundle,
  parameters: Record<string, unknown>,
  provider: LlmProvider = llmProvider(),
): Promise<Record<string, unknown>> {
  const sections: string[] = [];
  const push = (tag: string, value: unknown) => {
    if (value !== undefined) sections.push(`<${tag}>\n${JSON.stringify(value, null, 2)}\n</${tag}>`);
  };

  if (bundle.transcript) {
    sections.push(
      `<transcript>\n${formatTranscript(bundle.transcript, bundle.participants, 200)}\n</transcript>`,
    );
  }
  push("state_history", bundle.stateHistory);
  push("goal_history", bundle.goalHistory);
  push("event_history", bundle.eventHistory);
  push("memory_changes", bundle.memoryChanges);
  push("relationship_changes", bundle.relationshipChanges);
  push("branch_info", bundle.branchInfo);
  push("parameters", parameters);

  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: ENGINE_GUARDRAIL },
    { type: "text", text: `<evaluator_instructions>\n${evaluator.promptTemplate}\n</evaluator_instructions>` },
    {
      type: "text",
      text: `Return a JSON object matching this schema:\n${JSON.stringify(evaluator.outputSchema, null, 2)}`,
    },
  ];

  return provider.structured({
    label: `evaluation:${evaluator.id}`,
    schema: jsonObjectSchema,
    maxTokens: 6000,
    system,
    messages: [{ role: "user", content: sections.join("\n\n") }],
  });
}
