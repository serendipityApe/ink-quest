import { ChatCompletionsProvider } from "./chat-completions.js";
import { LlmProviderError } from "./errors.js";
import { OpenAIResponsesProvider } from "./openai-responses.js";

export { LlmProviderError } from "./errors.js";

export function createLlmProvider(env: NodeJS.ProcessEnv = process.env) {
  // Existing deployments stay on their configured chat-completions endpoint.
  const selected = env.LLM_PROVIDER?.trim() || "chat-completions";
  switch (selected) {
    case "openai": return OpenAIResponsesProvider.fromEnv(env);
    case "gemini":
    case "chat-completions": return ChatCompletionsProvider.fromEnv(env, selected);
    default: throw new LlmProviderError("Unsupported LLM_PROVIDER. Use openai, gemini or chat-completions.", false);
  }
}
