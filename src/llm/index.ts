import { createAnthropicProvider } from "@/llm/anthropic";
import { createStubProvider } from "@/llm/stub";
import type { LlmProvider } from "@/llm/types";

let cached: LlmProvider | undefined;

/**
 * Picks the provider from the environment: explicit `SCENARIA_LLM_PROVIDER` wins, otherwise
 * Anthropic when credentials are present and the deterministic stub when they are not.
 */
export function llmProvider(): LlmProvider {
  if (cached) return cached;

  const explicit = process.env.SCENARIA_LLM_PROVIDER;
  const hasCredentials = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

  if (explicit === "stub" || (!explicit && !hasCredentials)) {
    cached = createStubProvider();
  } else {
    cached = createAnthropicProvider();
  }
  return cached;
}

export function setLlmProvider(provider: LlmProvider | undefined): void {
  cached = provider;
}

export { createAnthropicProvider, createStubProvider };
export type { LlmProvider } from "@/llm/types";
