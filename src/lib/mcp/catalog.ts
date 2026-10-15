import { listCards, loadStory, premiumNodeIds } from "@/lib/stories/registry";
import { SITE_URL } from "@/lib/seo";
import type { StoryCard, TargetLang, TextSegment } from "@/types/story";

/**
 * Read-only view of the built-in public catalog.
 * User-generated stories and subscriber-only scenes never pass through here.
 */

const MAX_LIST = 20;
const MAX_ANNOTATIONS = 120;
const MAX_OPENING_CHARS = 4000;
const MAX_CHOICES = 8;
const STORY_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PUNCTUATION = /^[\p{P}\p{S}]+$/u;

const INTEREST_ALIASES: ReadonlyArray<readonly string[]> = [
  ["xianxia", "仙侠", "cultivation", "wuxia"],
  ["mystery", "detective", "noir", "悬疑"],
  ["romance", "爱情", "浪漫"],
  ["comedy", "喜剧"],
  ["science fiction", "sci-fi", "scifi", "科幻"],
  ["thriller", "惊悚"],
  ["supernatural", "灵异"],
  ["psychological", "心理"],
];

export interface ListStoriesQuery {
  target_language?: TargetLang;
  hsk_level?: number | string;
  genre?: string;
}

export interface RecommendQuery {
  hsk_level?: number | string;
  target_language?: TargetLang;
  genre?: string;
  interests?: string;
}

export interface PublicStoryCard {
  id: string;
  target_language: TargetLang;
  title: string;
  title_cn: string;
  title_en: string;
  level: string;
  level_system: string;
  genre: string;
  description: string;
  description_cn: string;
  series?: string;
  url: string;
}

export interface PublicOpening {
  id: string;
  target_language: TargetLang;
  gloss_language: string;
  title: string;
  title_cn: string;
  title_en: string;
  level: string;
  level_system: string;
  genre: string;
  url: string;
  opening_text: string;
  text_truncated: boolean;
  annotation_note: string;
  annotations: Array<{
    word: string;
    reading?: string;
    meaning?: string;
    level?: string;
  }>;
  annotations_truncated: boolean;
  choices: Array<{ text: string; premium: boolean }>;
  premium_notice: string;
}

const openingCache = new Map<string, PublicOpening>();

export function storyUrl(id: string): string {
  return `${SITE_URL}/stories/${id}`;
}

export function parseHsk(value: number | string): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 9) {
    return value;
  }
  if (typeof value === "string") {
    const match = /^(?:hsk\s*)?([1-9])$/i.exec(value.trim());
    if (match) return Number(match[1]);
  }
  return null;
}

function publicCards(): StoryCard[] {
  return listCards().filter((card) => !card.locked);
}

function haystack(card: StoryCard): string {
  return `${card.genre} ${card.title_en} ${card.title_cn} ${card.description_en} ${card.description_cn}`.toLowerCase();
}

export function keywordHit(card: StoryCard, keyword: string): boolean {
  const query = keyword.trim().toLowerCase();
  if (query.length < 2 || query.length > 40) return false;
  const text = haystack(card);
  if (text.includes(query)) return true;
  for (const group of INTEREST_ALIASES) {
    const queryInGroup = group.some((alias) => {
      const normalized = alias.toLowerCase();
      return normalized === query || (query.length >= 4 && (normalized.includes(query) || query.includes(normalized)));
    });
    if (!queryInGroup) continue;
    if (group.some((alias) => text.includes(alias.toLowerCase()))) return true;
  }
  return false;
}

function keywords(...parts: Array<string | undefined>): string[] {
  const raw = parts.filter(Boolean).join(",");
  const seen = new Set<string>();
  for (const part of raw.split(/[,，/|]+|\s+/)) {
    const token = part.trim().toLowerCase();
    if (token.length < 2 || token.length > 40) continue;
    seen.add(token);
    if (seen.size >= 8) break;
  }
  return [...seen];
}

function toCard(card: StoryCard): PublicStoryCard {
  const series = card.series
    ? `${card.target_lang === "zh" ? card.series.title_cn : card.series.title_en} · part ${card.series.part}`
    : undefined;
  return {
    id: card.id,
    target_language: card.target_lang,
    title: card.target_lang === "zh" ? card.title_cn : card.title_en,
    title_cn: card.title_cn,
    title_en: card.title_en,
    level: card.level,
    level_system: card.level_system,
    genre: card.genre,
    description: card.description_en,
    description_cn: card.description_cn,
    ...(series ? { series } : {}),
    url: storyUrl(card.id),
  };
}

export function listStories(query: ListStoriesQuery) {
  const hsk = query.hsk_level === undefined ? null : parseHsk(query.hsk_level);
  if (query.hsk_level !== undefined && hsk === null) {
    return {
      stories: [] as PublicStoryCard[],
      count: 0,
      note: 'hsk_level must be an integer 1-9 or a string like "HSK 4".',
    };
  }
  if (hsk !== null && query.target_language === "en") {
    return {
      stories: [] as PublicStoryCard[],
      count: 0,
      note: 'hsk_level filters Chinese stories. For English stories, call list_stories with target_language "en" and omit hsk_level. English levels are CEFR (A1–C2), not HSK.',
    };
  }

  let cards = publicCards();
  if (query.target_language) {
    cards = cards.filter((card) => card.target_lang === query.target_language);
  }
  if (hsk !== null) {
    cards = cards.filter((card) => card.level_system === "HSK" && parseHsk(card.level) === hsk);
  }
  if (query.genre) {
    cards = cards.filter((card) => keywordHit(card, query.genre!));
  }

  const stories = cards.slice(0, MAX_LIST).map(toCard);
  return {
    stories,
    count: stories.length,
    ...(cards.length > MAX_LIST ? { truncated: true } : {}),
    ...(query.genre && stories.length === 0
      ? { note: "No public story matches that genre. Try mystery, romance, xianxia, comedy, or science fiction." }
      : {}),
  };
}

function joinSegments(segments: TextSegment[], lang: TargetLang): string {
  if (lang === "zh") return segments.map((segment) => segment.word).join("");
  let text = "";
  for (const segment of segments) {
    const word = segment.word;
    if (!text) {
      text = word;
      continue;
    }
    if (PUNCTUATION.test(word) || word.startsWith("'")) text += word;
    else text += ` ${word}`;
  }
  return text.replace(/[ \t]{2,}/g, " ");
}

function openingFromCard(card: StoryCard, storyTarget: TargetLang, glossLang: string, node: {
  text_segments: TextSegment[];
  choices: Array<{ text: string; premium?: boolean }>;
}): PublicOpening {
  let openingText = joinSegments(node.text_segments, storyTarget);
  let textTruncated = false;
  if (openingText.length > MAX_OPENING_CHARS) {
    openingText = `${openingText.slice(0, MAX_OPENING_CHARS).trimEnd()}…`;
    textTruncated = true;
  }

  const annotations: PublicOpening["annotations"] = [];
  let annotationsTruncated = false;
  for (const segment of node.text_segments) {
    if (!segment.reading && !segment.meaning) continue;
    if (PUNCTUATION.test(segment.word)) continue;
    if (annotations.length >= MAX_ANNOTATIONS) {
      annotationsTruncated = true;
      break;
    }
    annotations.push({
      word: segment.word,
      ...(segment.reading ? { reading: segment.reading } : {}),
      ...(segment.meaning ? { meaning: segment.meaning } : {}),
      ...(segment.level ? { level: segment.level } : {}),
    });
  }

  const choices = node.choices.slice(0, MAX_CHOICES).map((choice) => ({
    text: choice.text.slice(0, 240),
    premium: Boolean(choice.premium),
  }));

  return {
    id: card.id,
    target_language: card.target_lang,
    gloss_language: glossLang,
    title: card.target_lang === "zh" ? card.title_cn : card.title_en,
    title_cn: card.title_cn,
    title_en: card.title_en,
    level: card.level,
    level_system: card.level_system,
    genre: card.genre,
    url: storyUrl(card.id),
    opening_text: openingText,
    text_truncated: textTruncated,
    annotation_note:
      storyTarget === "zh"
        ? "reading is Hanyu Pinyin. meaning is the story gloss. Tokens without either are omitted."
        : "reading is pronunciation. meaning is the story gloss. Tokens without either are omitted.",
    annotations,
    annotations_truncated: annotationsTruncated,
    choices,
    premium_notice: choices.some((choice) => choice.premium)
      ? "Choices marked premium continue in subscriber-only scenes. Those scenes are not included. Open the url to keep reading."
      : "Only the free opening scene is included. Later scenes stay on inkquest.dev. Open the url to keep reading.",
  };
}

export async function getStoryOpening(storyId: string): Promise<
  { ok: true; opening: PublicOpening } | { ok: false; error: string }
> {
  const id = storyId.trim().toLowerCase();
  if (!STORY_ID.test(id) || id.length > 80) {
    return {
      ok: false,
      error: 'story_id must be a public catalog id such as "before-the-rain-stops". User-generated stories are not available.',
    };
  }

  const cached = openingCache.get(id);
  if (cached) return { ok: true, opening: cached };

  const card = publicCards().find((entry) => entry.id === id);
  if (!card) {
    return {
      ok: false,
      error: "No public InkQuest story uses that id. Call list_stories for the free catalog. Withdrawn demos and user-generated stories are not available on this server.",
    };
  }

  const story = await loadStory(id);
  const start = story?.nodes.start;
  if (!story || !start) {
    return { ok: false, error: "That catalog story has no public opening scene." };
  }

  // premiumNodeIds only inspects choice flags. The body below reads the start
  // node alone, and refuses when that node itself is subscriber-only.
  if (premiumNodeIds(story).has("start")) {
    return {
      ok: false,
      error: `The opening of this story is subscriber-only and is not returned here. Continue at ${storyUrl(id)}.`,
    };
  }

  const opening = openingFromCard(card, story.target_lang, story.gloss_lang, {
    text_segments: start.text_segments,
    choices: start.choices,
  });
  openingCache.set(id, opening);
  return { ok: true, opening };
}

function matchPayload(card: StoryCard, reasons: string[]) {
  return {
    ...toCard(card),
    reasons,
  };
}

export function recommendStories(query: RecommendQuery) {
  const hsk = query.hsk_level === undefined ? null : parseHsk(query.hsk_level);
  if (query.hsk_level !== undefined && hsk === null) {
    return {
      matches: [],
      note: 'hsk_level must be an integer 1-9 or a string like "HSK 4".',
    };
  }

  const keys = keywords(query.genre, query.interests);
  let pool = publicCards();
  const notes: string[] = [];

  if (query.target_language) {
    pool = pool.filter((card) => card.target_lang === query.target_language);
  } else if (hsk !== null) {
    pool = pool.filter((card) => card.level_system === "HSK");
    notes.push('hsk_level ranks Chinese stories. Pass target_language "en" to recommend English stories instead.');
  }

  if (pool.length === 0) {
    return { matches: [], note: "No public stories match that language." };
  }

  if (hsk === null && keys.length === 0) {
    const sample = pickSample(pool);
    return {
      matches: sample.map((card) =>
        matchPayload(card, [
          `Sample pick: ${card.level} ${card.genre}. Pass hsk_level and an interest for a closer match.`,
        ]),
      ),
      note: "No level or interest was given, so these are a short sample of the public catalog.",
    };
  }

  const ranked = pool.map((card, index) => {
    const reasons: string[] = [];
    let score = 0;
    const cardHsk = card.level_system === "HSK" ? parseHsk(card.level) : null;
    if (hsk !== null && cardHsk !== null) {
      const distance = Math.abs(cardHsk - hsk);
      if (distance === 0) {
        score += 100;
        reasons.push(`Exact match for HSK ${hsk}.`);
      } else if (distance === 1) {
        score += 60;
        reasons.push(`One band from HSK ${hsk} (${card.level}), still a comfortable next read.`);
      } else if (distance === 2) {
        score += 30;
        reasons.push(`Two bands from HSK ${hsk} (${card.level}).`);
      } else {
        score += 8;
        reasons.push(`Further from HSK ${hsk}; this story is ${card.level}.`);
      }
      if (cardHsk < hsk) score += 2;
    } else if (card.level_system === "CEFR") {
      score += 10;
      reasons.push(`English story at CEFR ${card.level}. HSK bands do not apply.`);
    } else {
      score += 10;
      reasons.push(`${card.level} Chinese story.`);
    }

    const hits = keys.filter((key) => keywordHit(card, key));
    if (hits.length > 0) {
      score += 45 * hits.length;
      reasons.push(`Matches interests: ${hits.join(", ")}.`);
    }
    return { card, index, score, reasons, hits };
  });

  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  const top = ranked.slice(0, 3);
  if (keys.length > 0 && top.every((item) => item.hits.length === 0)) {
    notes.push("No catalog story matched those interests closely. These are the nearest public stories by level.");
  }

  return {
    matches: top.map((item) => matchPayload(item.card, item.reasons)),
    ...(notes.length > 0 ? { note: notes.join(" ") } : {}),
  };
}

function pickSample(pool: StoryCard[]): StoryCard[] {
  const wanted = [
    (card: StoryCard) => card.level === "HSK 3",
    (card: StoryCard) => card.level === "HSK 4",
    (card: StoryCard) => card.level === "B1",
  ];
  const chosen: StoryCard[] = [];
  for (const predicate of wanted) {
    const found = pool.find((card) => predicate(card) && !chosen.includes(card));
    if (found) chosen.push(found);
  }
  for (const card of pool) {
    if (chosen.length >= 3) break;
    if (!chosen.includes(card)) chosen.push(card);
  }
  return chosen.slice(0, 3);
}
