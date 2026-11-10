import { StructuredFictionProvider } from "./structured-fiction.js";
import { LlmProviderError } from "./errors.js";
import { requestLlmJson, requestPolicyFromEnv, type LlmRequestPolicy } from "./request.js";

interface OpenAIProviderConfig {
  requestPolicy?: LlmRequestPolicy;
  usageTelemetry?: boolean;
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
      usageTelemetry: env.LLM_USAGE_TELEMETRY === "true",
      apiKey, model, maxOutputTokens,
      promptVersion: env.LLM_PROMPT_VERSION ?? "opening-v1",
      organizationId: env.OPENAI_ORG_ID?.trim() || undefined,
      projectId: env.OPENAI_PROJECT_ID?.trim() || undefined,
      reasoningEffort: reasoningEffort as OpenAIProviderConfig["reasoningEffort"],
    });
  }

  protected async completeJson(payload: unknown): Promise<unknown> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
    };
    if (this.config.organizationId) headers["OpenAI-Organization"] = this.config.organizationId;
    if (this.config.projectId) headers["OpenAI-Project"] = this.config.projectId;

    const started=Date.now();let responseBody:unknown;let outcome="unavailable";let httpStatus:number|null=null;let failureKind:string|null=null;
    try{return await requestLlmJson("https://api.openai.com/v1/responses", {
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
    }, body=>{responseBody=body;return parseOpenAIResponse(body);}, this.config.requestPolicy).then(result=>{outcome="completed";return result;});}
    catch(error){
      const status=error instanceof LlmProviderError?error.message.match(/^LLM request failed with status (\d{3})\.$/):null;
      httpStatus=status?Number(status[1]):null;
      failureKind=status?"http_error":responseBody!==undefined?"response_error":"transport_or_decode_error";
      throw error;
    }
    finally{if(this.config.usageTelemetry){
      const body=isRecord(responseBody)?responseBody:{};const usage=isRecord(body.usage)?body.usage:{};
      const inputDetails=isRecord(usage.input_tokens_details)?usage.input_tokens_details:{};
      const outputDetails=isRecord(usage.output_tokens_details)?usage.output_tokens_details:{};
      const number=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0?Number(v):null;
      const task=isRecord(payload)?payload.task:undefined;
      const stage=task==="Plan a safe interactive language-learning story."?"plan":task==="Write the opening scene for an interactive language-learning story."?"write":task==="Resolve missing learner glosses using the scene context."?"gloss":"unknown";
      // Only fixed stage labels, timestamps and allowlisted usage numbers. No prompts, keys or output text.
      console.log(JSON.stringify({event:"generation_llm_usage",stage,model:this.model,startedAt:new Date(started).toISOString(),endedAt:new Date().toISOString(),durationMs:Date.now()-started,outcome,httpStatus,failureKind,responseStatus:["completed","failed","incomplete"].includes(String(body.status))?body.status:null,
        inputTokens:number(usage.input_tokens),cachedInputTokens:number(inputDetails.cached_tokens),cacheWriteTokens:number(inputDetails.cache_write_tokens??inputDetails.cache_creation_tokens),serviceTier:typeof body.service_tier==="string"&&/^[a-z_]{1,32}$/.test(body.service_tier)?body.service_tier:null,outputTokens:number(usage.output_tokens),reasoningTokens:number(outputDetails.reasoning_tokens),totalTokens:number(usage.total_tokens)}));
    }}
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
