export class LlmProviderError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "LlmProviderError";
  }
}
