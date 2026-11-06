export function isGenerationBackendUnavailable(error: { code?: string; message?: string }): boolean {
  // Missing readiness migration also fails closed before reserving any credit.
  return error.code === "PGRST202" || Boolean(error.message?.includes("generation_backend_unavailable"));
}
