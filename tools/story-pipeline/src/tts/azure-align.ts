import type { TargetLang } from "../schema.js";
import type { WordTiming } from "./types.js";

/** Azure WordBoundary offsets and durations are 100 ns ticks; text offsets use JS string indices. */
export interface AzureBoundary {
  audioOffset: number;
  duration: number;
  textOffset: number;
  wordLength: number;
}

const TICKS_PER_MS = 10_000;
const PUNCTUATION = /^[\p{P}\p{S}\s]+$/u;
const NO_SPACE_BEFORE = /^[,.;:!?%)\]}，。！？：；、”’]/u;
const NO_SPACE_AFTER = /[(\[{“‘]$/u;

function buildInput(words: string[], lang: TargetLang) {
  let text = "";
  const spans = words.map((word, index) => {
    if (lang === "en" && index > 0 && !NO_SPACE_BEFORE.test(word) && !NO_SPACE_AFTER.test(words[index - 1])) {
      text += " ";
    }
    const start = text.length;
    text += word;
    return { start, end: text.length };
  });
  return { text, spans };
}

export function spokenText(words: string[], lang: TargetLang): string {
  return buildInput(words, lang).text;
}

/** Align Azure's text spans to our existing segments, including separate punctuation tokens. */
export function alignAzureBoundaries(words: string[], lang: TargetLang, boundaries: AzureBoundary[]): WordTiming[] {
  const { spans } = buildInput(words, lang);
  const hits: Array<WordTiming | null> = words.map(() => null);

  for (const boundary of boundaries) {
    const { audioOffset, duration, textOffset, wordLength } = boundary;
    if (![audioOffset, duration, textOffset, wordLength].every(Number.isFinite) ||
        audioOffset < 0 || duration < 0 || textOffset < 0 || wordLength <= 0) continue;
    const eventEnd = textOffset + wordLength;
    for (let index = 0; index < spans.length; index++) {
      const overlapStart = Math.max(spans[index].start, textOffset);
      const overlapEnd = Math.min(spans[index].end, eventEnd);
      if (overlapStart >= overlapEnd) continue;
      // A provider word may span several InkQuest tokens; split its duration by text position.
      const start = (audioOffset + duration * (overlapStart - textOffset) / wordLength) / TICKS_PER_MS;
      const end = (audioOffset + duration * (overlapEnd - textOffset) / wordLength) / TICKS_PER_MS;
      const previous = hits[index];
      hits[index] = previous ? { start: Math.min(previous.start, start), end: Math.max(previous.end, end) } : { start, end };
    }
  }

  for (let index = 0; index < words.length; index++) {
    if (!hits[index] && !PUNCTUATION.test(words[index])) {
      throw new Error(`Azure TTS returned no word boundary for segment ${index} (${words[index]}).`);
    }
  }

  let previousEnd = 0;
  return hits.map((hit, index) => {
    // Azure can omit silent punctuation. Give it a minimal slot for the UI's 1:1 contract.
    const start = Math.max(previousEnd, Math.round(hit?.start ?? previousEnd));
    const nextStart = hits.slice(index + 1).find((next) => next !== null)?.start;
    const proposedEnd = hit?.end ?? start + 1;
    const end = Math.max(start + 1, Math.round(nextStart === undefined ? proposedEnd : Math.min(proposedEnd, nextStart)));
    previousEnd = end;
    return { start, end };
  });
}
