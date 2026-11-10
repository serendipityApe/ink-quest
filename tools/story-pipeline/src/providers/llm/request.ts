import { LlmProviderError, safeLlmHttpDiagnostics } from "./errors.js";

export interface LlmRequestPolicy { timeoutMs: number; attempts: number; }
export function requestPolicyFromEnv(env: Record<string, string | undefined>): LlmRequestPolicy {
  const timeoutMs = Number(env.LLM_REQUEST_TIMEOUT_MS ?? 120_000);
  const attempts = Number(env.LLM_REQUEST_ATTEMPTS ?? 3);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000 ||
      !Number.isSafeInteger(attempts) || attempts < 1 || attempts > 3) {
    throw new LlmProviderError("Invalid LLM request timeout or attempts.", false);
  }
  return { timeoutMs, attempts };
}

// Never include upstream bodies or transport errors: these can contain prompts or credentials.
export async function requestLlmJson(
  url: string,
  request: { headers: Record<string, string>; body: string },
  parse: (body: unknown) => unknown,
  policy: LlmRequestPolicy = { timeoutMs: 120_000, attempts: 3 },
): Promise<unknown> {
  for (let attempt = 0; attempt < policy.attempts; attempt++) {
    try {
      const response = await fetch(url, {
        ...request,
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(policy.timeoutMs),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: { code?: string } } | null;
        const quotaExhausted = body?.error?.code === "insufficient_quota";
        const retryable = !quotaExhausted && (response.status === 429 || response.status >= 500);
        throw new LlmProviderError(`LLM request failed with status ${response.status}.`, retryable,
          !quotaExhausted && response.status === 429, safeLlmHttpDiagnostics(response.status, body));
      }
      return parse(await response.json());
    } catch (error) {
      const safeError = error instanceof LlmProviderError
        ? error
        : new LlmProviderError("LLM request could not be completed.", true);
      if (!safeError.retryable || attempt === policy.attempts - 1) throw safeError;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw new LlmProviderError("LLM request failed.", true);
}
