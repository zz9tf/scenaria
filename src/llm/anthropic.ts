import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { LlmFailureError, type LlmProvider, type StructuredRequest, type TextRequest } from "@/llm/types";

export const DEFAULT_MODEL = "claude-opus-5";

export interface AnthropicProviderOptions {
  model?: string;
  client?: Anthropic;
}

/**
 * Structured calls go through `messages.parse` with a Zod output format, so the engine
 * never parses free-form JSON out of prose. A single retry is attempted before failing,
 * matching the fallback policy in §47.
 */
export function createAnthropicProvider(options: AnthropicProviderOptions = {}): LlmProvider {
  const client = options.client ?? new Anthropic();
  const model = options.model ?? process.env.SCENARIA_MODEL ?? DEFAULT_MODEL;

  return {
    name: `anthropic:${model}`,

    async structured<T>(request: StructuredRequest<T>): Promise<T> {
      return withRetry(request.label, async () => {
        const response = await client.messages.parse({
          model,
          max_tokens: request.maxTokens ?? 8000,
          thinking: { type: "adaptive" },
          output_config: { format: zodOutputFormat(request.schema) },
          system: request.system,
          messages: request.messages,
        });

        if (response.stop_reason === "refusal") {
          throw new LlmFailureError(request.label, "model refused the request");
        }
        if (response.parsed_output === null || response.parsed_output === undefined) {
          throw new LlmFailureError(request.label, "model returned no schema-valid output");
        }
        return response.parsed_output as T;
      });
    },

    async text(request: TextRequest): Promise<string> {
      return withRetry(request.label, async () => {
        const response = await client.messages.create({
          model,
          max_tokens: request.maxTokens ?? 2000,
          thinking: { type: "adaptive" },
          system: request.system,
          messages: request.messages,
        });

        if (response.stop_reason === "refusal") {
          throw new LlmFailureError(request.label, "model refused the request");
        }
        const text = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("")
          .trim();
        if (text.length === 0) {
          throw new LlmFailureError(request.label, "model returned empty text");
        }
        return text;
      });
    },
  };
}

async function withRetry<T>(label: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (firstError) {
    try {
      return await run();
    } catch (secondError) {
      throw new LlmFailureError(label, "failed after one retry", { firstError, secondError });
    }
  }
}
