export const LLM_ERROR_CODES = [
  "invalid_request_error", "invalid_request", "insufficient_quota", "rate_limit_exceeded",
  "context_length_exceeded", "model_not_found", "unsupported_parameter", "invalid_value",
] as const;
export const LLM_ERROR_TYPES = [
  "invalid_request_error", "authentication_error", "permission_error", "rate_limit_error", "server_error",
] as const;
export const LLM_ERROR_PARAMS = [
  "input", "instructions", "model", "text.format", "text.format.type",
  "max_output_tokens", "reasoning.effort",
] as const;

type SafeValue<T extends readonly string[]> = T[number] | "unknown" | null;
export interface LlmHttpDiagnostics {
  readonly status: number;
  readonly code: SafeValue<typeof LLM_ERROR_CODES>;
  readonly type: SafeValue<typeof LLM_ERROR_TYPES>;
  readonly param: SafeValue<typeof LLM_ERROR_PARAMS>;
  readonly category: "json_mode_input_missing" | "other_http_error";
}

function fixedValue<T extends readonly string[]>(value: unknown, allowed: T): SafeValue<T> {
  if (value === null || value === undefined) return null;
  return allowed.find((candidate) => candidate === value) ?? "unknown";
}

export function safeLlmHttpDiagnostics(status: number, body: unknown): LlmHttpDiagnostics {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const error = isRecord(body) && isRecord(body.error) ? body.error : {};
  const param = fixedValue(error.param, LLM_ERROR_PARAMS);
  // Match one known validation shape into a fixed label; never retain its raw message.
  const jsonModeInputMissing = status === 400 && param === "input" &&
    typeof error.message === "string" && error.message.length < 300 &&
    /^Response input messages must contain the word ['"]json['"] in some form to use ['"]text\.format['"] of type ['"]json_object['"]\.$/i.test(error.message);
  return Object.freeze({
    status,
    code: fixedValue(error.code, LLM_ERROR_CODES),
    type: fixedValue(error.type, LLM_ERROR_TYPES),
    param,
    category: jsonModeInputMissing ? "json_mode_input_missing" : "other_http_error",
  });
}

export class LlmProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly safeToRetry = false,
    readonly httpDiagnostics?: LlmHttpDiagnostics,
  ) {
    super(message);
    this.name = "LlmProviderError";
  }
}

export interface GlossValidationDiagnostics {
  readonly reason: "invalid_input" | "invalid_shape" | "invalid_items" | "incomplete_coverage";
  readonly requestedCount: number;
  readonly receivedCount: number;
  readonly acceptedCount: number;
  readonly missingCount: number;
  readonly duplicateCount: number;
  readonly unexpectedCount: number;
  readonly emptyMeaningCount: number;
  readonly malformedCount: number;
}

// Only fixed reasons and counts may enter logs. Never retain model output or token text.
export class GlossValidationError extends LlmProviderError {
  readonly diagnostics: GlossValidationDiagnostics;
  constructor(diagnostics: GlossValidationDiagnostics) {
    super("Gloss response did not cover the requested tokens.", false, false);
    this.name = "GlossValidationError";
    const count = (value: number) => Number.isSafeInteger(value) && value >= 0 ? value : 0;
    this.diagnostics = Object.freeze({
      reason: ["invalid_input", "invalid_shape", "invalid_items", "incomplete_coverage"].includes(diagnostics.reason)
        ? diagnostics.reason : "invalid_shape",
      requestedCount: count(diagnostics.requestedCount), receivedCount: count(diagnostics.receivedCount),
      acceptedCount: count(diagnostics.acceptedCount), missingCount: count(diagnostics.missingCount),
      duplicateCount: count(diagnostics.duplicateCount), unexpectedCount: count(diagnostics.unexpectedCount),
      emptyMeaningCount: count(diagnostics.emptyMeaningCount), malformedCount: count(diagnostics.malformedCount),
    });
  }
}
