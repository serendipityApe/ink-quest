import { StructuredFictionProvider } from "./structured-fiction.js";
import { LlmProviderError } from "./errors.js";
import { requestLlmJson } from "./request.js";

// Keep the old export available to existing callers.
export { LlmProviderError } from "./errors.js";

interface ChatProviderConfig {
  url: string;
  apiKey: string;
  model: string;
  promptVersion: string;
  provider?: "gemini" | "chat-completions";
}

export class ChatCompletionsProvider extends StructuredFictionProvider {
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;

  constructor(private readonly config: ChatProviderConfig) {
    super();
    this.provider = config.provider ?? "chat-completions";
    this.model = config.model;
    this.promptVersion = config.promptVersion;
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env, provider: ChatProviderConfig["provider"] = "chat-completions") {
    const url = env.LLM_CHAT_COMPLETIONS_URL?.trim();
    const apiKey = env.LLM_API_KEY?.trim();
    const model = env.LLM_MODEL?.trim();
    if (!url || !apiKey || !model) {
      throw new LlmProviderError("LLM provider is not configured. Set LLM_CHAT_COMPLETIONS_URL, LLM_API_KEY and LLM_MODEL.", false);
    }
    return new ChatCompletionsProvider({
      url, apiKey, model, provider,
      promptVersion: env.LLM_PROMPT_VERSION ?? "opening-v1",
    });
  }

  protected completeJson(payload: unknown): Promise<unknown> {
    return requestLlmJson(this.config.url, {
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: "You are InkQuest's structured fiction engine. Return valid JSON only." },
          { role: "user", content: JSON.stringify(payload) },
        ],
        temperature: 0.8,
        response_format: { type: "json_object" },
      }),
    }, (body) => {
      const result = body as { choices?: Array<{ message?: { content?: unknown } }> } | null;
      const content = result?.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new LlmProviderError("LLM response content was missing.", true);
      return JSON.parse(content.replace(/^```json\s*|\s*```$/g, ""));
    });
  }
}
