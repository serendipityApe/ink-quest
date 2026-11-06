import { StructuredFictionProvider } from "./structured-fiction.js";
import { LlmProviderError } from "./errors.js";
import { requestLlmJson, requestPolicyFromEnv, type LlmRequestPolicy } from "./request.js";

interface OpenAIProviderConfig {
  requestPolicy?: LlmRequestPolicy;
  apiKey: string;
  model: string;
  promptVersion: string;
  organizationId?: string;
  projectId?: string;
  maxOutputTokens: number;
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max";
}

export class OpenAIResponsesProvider extends StructuredFictionProvider {
  readonly provider = "openai";
  readonly model: string;
  readonly promptVersion: string;

  constructor(private readonly config: OpenAIProviderConfig) {
    super();
    this.model = config.model;
    this.promptVersion = config.promptVersion;
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env) {
    // Never reuse the legacy Gemini key, endpoint or model for OpenAI.
    const apiKey = env.OPENAI_API_KEY?.trim() || env.OPENAI_KEY?.trim();
    const model = env.OPENAI_MODEL?.trim();
    if (!apiKey || !model) {
      throw new LlmProviderError("OpenAI provider is not configured. Set OPENAI_API_KEY (or OPENAI_KEY) and OPENAI_MODEL.", false);
    }
    const maxOutputTokens = Number(env.OPENAI_MAX_OUTPUT_TOKENS ?? "6000");
    if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1) {
      throw new LlmProviderError("OPENAI_MAX_OUTPUT_TOKENS must be a positive integer.", false);
    }
    const reasoningEffort = env.OPENAI_REASONING_EFFORT?.trim() || undefined;
    if (reasoningEffort && !["none", "low", "medium", "high", "xhigh", "max"].includes(reasoningEffort)) {
      throw new LlmProviderError("OPENAI_REASONING_EFFORT must be none, low, medium, high, xhigh or max.", false);
    }
    return new OpenAIResponsesProvider({
      requestPolicy: requestPolicyFromEnv(env),
      apiKey, model, maxOutputTokens,
      promptVersion: env.LLM_PROMPT_VERSION ?? "opening-v1",
      organizationId: env.OPENAI_ORG_ID?.trim() || undefined,
      projectId: env.OPENAI_PROJECT_ID?.trim() || undefined,
      reasoningEffort: reasoningEffort as OpenAIProviderConfig["reasoningEffort"],
    });
  }

  protected completeJson(payload: unknown): Promise<unknown> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
    };
    if (this.config.organizationId) headers["OpenAI-Organization"] = this.config.organizationId;
    if (this.config.projectId) headers["OpenAI-Project"] = this.config.projectId;

    return requestLlmJson("https://api.openai.com/v1/responses", {
      headers,
      body: JSON.stringify({
        model: this.model,
        instructions: "You are InkQuest's structured fiction engine. Return valid JSON only.",
        input: JSON.stringify(payload),
        // Existing story state contains arbitrary JSON; reuse the shared runtime validators.
        text: { format: { type: "json_object" } },
        max_output_tokens: this.config.maxOutputTokens,
        ...(this.config.reasoningEffort ? { reasoning: { effort: this.config.reasoningEffort } } : {}),
        store: false,
      }),
    }, parseOpenAIResponse, this.config.requestPolicy);
  }
}

function parseOpenAIResponse(body: unknown): unknown {
  if (!isRecord(body)) throw new LlmProviderError("OpenAI response was invalid.", true);
  if (body.status === "incomplete") {
    // Retrying the same token budget or filtered content will not resolve truncation.
    throw new LlmProviderError("OpenAI response was incomplete. Check output token limits and content restrictions.", false);
  }
  if (body.status === "failed") {
    const code = isRecord(body.error) ? body.error.code : undefined;
    throw new LlmProviderError("OpenAI response failed.", code === "server_error" || code === "rate_limit_exceeded");
  }
  if (body.status !== "completed" || !Array.isArray(body.output)) {
    throw new LlmProviderError("OpenAI response was not completed.", true);
  }

  const parts: string[] = [];
  for (const item of body.output) {
    if (!isRecord(item) || item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (!isRecord(part)) continue;
      if (part.type === "refusal") throw new LlmProviderError("OpenAI declined this story request.", false);
      if (part.type === "output_text" && typeof part.text === "string") parts.push(part.text);
    }
  }
  if (!parts.length) throw new LlmProviderError("OpenAI response content was missing.", true);
  return JSON.parse(parts.join(""));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
