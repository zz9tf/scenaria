import type Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

export interface StructuredRequest<T> {
  /** Identifies the call site in logs and in the stub provider's dispatch. */
  label: string;
  system: Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
  /** Output type only; the input side is `unknown` so schemas with defaults are accepted. */
  schema: z.ZodType<T, unknown>;
  maxTokens?: number;
}

export interface TextRequest {
  label: string;
  system: Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
}

export interface LlmProvider {
  readonly name: string;
  /** Must return schema-valid data or throw; retries belong to the implementation (§47). */
  structured<T>(request: StructuredRequest<T>): Promise<T>;
  text(request: TextRequest): Promise<string>;
}

export class LlmFailureError extends Error {
  constructor(
    readonly label: string,
    message: string,
    readonly cause?: unknown,
  ) {
    super(`${label}: ${message}`);
    this.name = "LlmFailureError";
  }
}
