import { LlmProviderError } from "./errors.js";

// Never include upstream bodies or transport errors: these can contain prompts or credentials.
export async function requestLlmJson(
  url: string,
  request: { headers: Record<string, string>; body: string },
  parse: (body: unknown) => unknown,
): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        ...request,
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: { code?: string } } | null;
        const quotaExhausted = body?.error?.code === "insufficient_quota";
        const retryable = !quotaExhausted && (response.status === 429 || response.status >= 500);
        throw new LlmProviderError(`LLM request failed with status ${response.status}.`, retryable);
      }
      return parse(await response.json());
    } catch (error) {
      const safeError = error instanceof LlmProviderError
        ? error
        : new LlmProviderError("LLM request could not be completed.", true);
      if (!safeError.retryable || attempt === 2) throw safeError;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw new LlmProviderError("LLM request failed.", true);
}
