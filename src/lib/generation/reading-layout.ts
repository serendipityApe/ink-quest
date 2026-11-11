/** Presentation-only layout. Never inserts/removes/reorders learning tokens or audio indexes. */
export interface ReadingToken { word: string }
export interface ReadingRun { text: string; tokenIndex?: number }
export interface ReadingParagraph { start: number; end: number; runs: ReadingRun[] }

export function readingLayout(text: string | null | undefined, tokens: ReadingToken[], lang: "en" | "zh") {
  let source = text ?? "";
  let ranges = alignTokens(source, tokens);
  // Some imported/legacy records have stale or absent raw text. Retain their existing
  // token content and learning interactions instead of attaching meanings to wrong words.
  if (!ranges && tokens.length) {
    source = tokens.map((token, i) => `${lang === "en" && i && !/^[.,!?:;)\]}]/u.test(token.word) ? " " : ""}${token.word}`).join("");
    ranges = alignTokens(source, tokens);
  }
  ranges ??= [];
  const offsets = [0];
  const explicit = [...source.matchAll(/\r?\n[\t \r\n]*/g)].map(match => match.index! + match[0].length);
  if (explicit.length) offsets.push(...explicit);
  else {
    // Legacy single-block prose: group complete sentences, never cut by token count.
    const sentences = [...new Intl.Segmenter(lang, { granularity: "sentence" }).segment(source)];
    let count = 0;
    let start = 0;
    let inDoubleQuote = false;
    for (const sentence of sentences) {
      count++;
      for (const character of sentence.segment) {
        if (character === "“" || character === "「" || character === "『") inDoubleQuote = true;
        else if (character === "”" || character === "」" || character === "』") inDoubleQuote = false;
        else if (character === '"') inDoubleQuote = !inDoubleQuote;
      }
      const end = sentence.index + sentence.segment.length;
      if (!inDoubleQuote && count >= 3 && end - start >= (lang === "en" ? 180 : 90)) {
        offsets.push(end); count = 0; start = end;
      }
    }
  }
  offsets.push(source.length);
  const boundaries = [...new Set(offsets)].filter(offset => !ranges.some(range => range.start < offset && range.end > offset));
  const runs: Array<ReadingRun & { start: number; end: number }> = [];
  let cursor = 0;
  const prefixes: string[] = [];
  ranges.forEach((range, tokenIndex) => {
    prefixes[tokenIndex] = source.slice(cursor, range.start);
    if (range.start > cursor) runs.push({ start: cursor, end: range.start, text: source.slice(cursor, range.start) });
    runs.push({ ...range, text: source.slice(range.start, range.end), tokenIndex });
    cursor = range.end;
  });
  if (cursor < source.length) runs.push({ start: cursor, end: source.length, text: source.slice(cursor) });
  const paragraphs: ReadingParagraph[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i]; const end = boundaries[i + 1];
    if (start === end) continue;
    paragraphs.push({ start, end, runs: runs.filter(run => run.end > start && run.start < end).map(run => ({
      text: source.slice(Math.max(start, run.start), Math.min(end, run.end)),
      ...(run.tokenIndex === undefined ? {} : { tokenIndex: run.tokenIndex }),
    })) });
  }
  return { source, paragraphs, prefixes };
}

function alignTokens(source: string, tokens: ReadingToken[]) {
  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const token of tokens) {
    if (!token.word) return null;
    const start = source.indexOf(token.word, cursor);
    if (start < 0 || /\S/u.test(source.slice(cursor, start))) return null;
    ranges.push({ start, end: start + token.word.length });
    cursor = start + token.word.length;
  }
  return tokens.length && /\S/u.test(source.slice(cursor)) ? null : ranges;
}
