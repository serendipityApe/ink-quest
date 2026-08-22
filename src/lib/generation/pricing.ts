export type TtsMode = "off" | "every_scene";

export interface GenerationQuote {
  pricingVersion: string;
  total: number;
  items: Array<{ code: "scene_text" | "scene_tts"; credits: number }>;
}

function readPositiveCredit(name: string) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function quoteOpening(ttsMode: TtsMode): GenerationQuote | null {
  return quoteAction("GENERATION_OPENING", ttsMode);
}

export function quoteScene(ttsMode: TtsMode): GenerationQuote | null {
  return quoteAction("GENERATION_SCENE", ttsMode);
}

function quoteAction(prefix: "GENERATION_OPENING" | "GENERATION_SCENE", ttsMode: TtsMode): GenerationQuote | null {
  const textCredits = readPositiveCredit(`${prefix}_TEXT_CREDITS`);
  if (!textCredits) return null;

  const items: GenerationQuote["items"] = [{ code: "scene_text", credits: textCredits }];
  if (ttsMode === "every_scene") {
    const ttsCredits = readPositiveCredit(`${prefix}_TTS_CREDITS`);
    if (!ttsCredits) return null;
    items.push({ code: "scene_tts", credits: ttsCredits });
  }

  return {
    pricingVersion: process.env.GENERATION_PRICING_VERSION ?? "v1",
    total: items.reduce((sum, item) => sum + item.credits, 0),
    items,
  };
}
