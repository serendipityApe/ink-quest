export class LlmProviderError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly safeToRetry = false) {
    super(message);
    this.name = "LlmProviderError";
  }
}
