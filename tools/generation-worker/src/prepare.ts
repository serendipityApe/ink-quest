import type { EnrichSceneInput } from "../../story-pipeline/src/core/enrich-scene.js";
import type { EnrichedTokenItem } from "../../story-pipeline/src/types-draft.js";
import { EdgeConfigurationError, initialSceneTokens, prepareEnrichmentChunk,
  type ChineseSegmenter, type EnrichmentSpan } from "./enrich.js";

export const SEGMENTATION_VERSION = "segments-v1";
export interface Preparation {
  version: typeof SEGMENTATION_VERSION;
  cursor: number;
  spans: EnrichmentSpan[];
  tokens: EnrichedTokenItem[];
  renderCursor: number;
}

export function initialPreparation(): Preparation {
  return { version: SEGMENTATION_VERSION, cursor: 0, spans: [], tokens: [], renderCursor: 0 };
}

// Tokenization and pinyin are bounded separately, just like the existing
// dictionary path. No dictionary/model request is needed to deliver a scene.
export function prepareScene(input: EnrichSceneInput, segment: ChineseSegmenter, previous?: Preparation) {
  // Resume checkpoints written by older workers that did not initialize during write.
  if (!previous) return { preparation: initialPreparation() };
  if (previous.version !== SEGMENTATION_VERSION || !Number.isInteger(previous.cursor)
    || previous.cursor < 0 || previous.cursor > input.text.trim().length
    || previous.spans.length > 2000 || previous.tokens.length !== previous.renderCursor
    || previous.renderCursor < 0 || previous.renderCursor > previous.spans.length)
    throw new EdgeConfigurationError("Invalid scene preparation checkpoint.");
  if (previous.cursor < input.text.trim().length) {
    if (previous.renderCursor) throw new EdgeConfigurationError("Scene preparation order is invalid.");
    const chunk = prepareEnrichmentChunk(input, segment, previous.cursor);
    const spans = [...previous.spans, ...chunk.spans];
    if (spans.length > 2000) throw new EdgeConfigurationError("Scene exceeds the bounded token count.");
    return { preparation: { ...previous, spans, cursor: chunk.prepareCursor } };
  }
  if (previous.renderCursor < previous.spans.length) {
    const tokens = [...previous.tokens,
      ...initialSceneTokens(input, previous.spans.slice(previous.renderCursor, previous.renderCursor + 64))];
    const preparation = { ...previous, tokens, renderCursor: tokens.length };
    // Persist the final bounded batch and its commit-ready tokens together. This
    // avoids a separate no-work delivery without doing more than 64 tokens here.
    return tokens.length === previous.spans.length
      ? { preparation, initialTokens: tokens }
      : { preparation };
  }
  return { initialTokens: previous.tokens };
}
