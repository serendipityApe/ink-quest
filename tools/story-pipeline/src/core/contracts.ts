import type { Lang, TargetLang } from "../schema.js";
import type { EnrichedTokenItem } from "../types-draft.js";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface StoryPlanInput {
  premise: string;
  targetLang: TargetLang;
  learnerLevel: string;
  setup: Record<string, JsonValue>;
}

export interface StoryPlan {
  title: string;
  worldBible: JsonValue;
  characters: JsonValue[];
  openingIntent: string;
}

export interface SceneGenerationInput {
  storyId: string;
  plan: StoryPlan;
  state: StoryState;
  selectedChoice?: JsonValue;
  directive?: string;
}

export interface GeneratedChoice {
  label: string;
  intent: string;
  branchSeed: JsonValue;
}

export interface SceneDraft {
  text: string;
  summary: string;
  plotWords: string[];
  choices: GeneratedChoice[];
  stateDelta: JsonValue;
}

export interface GlossResolutionInput {
  text: string;
  targetLang: TargetLang;
  glossLang: Lang;
  tokens: EnrichedTokenItem[];
  unresolvedTokenIndexes: number[];
}

export interface ResolvedGloss {
  tokenIndex: number;
  meaning: string;
}

export interface LlmProvider {
  planStory(input: StoryPlanInput): Promise<StoryPlan>;
  writeScene(input: SceneGenerationInput): Promise<SceneDraft>;
  resolveGlosses(input: GlossResolutionInput): Promise<ResolvedGloss[]>;
}

export interface StoryState {
  storyId: string;
  currentNodeId: string | null;
  version: number;
  snapshot: JsonValue;
}

export interface CommitNodeInput {
  jobId: string;
  storyId: string;
  parentNodeId: string | null;
  draft: SceneDraft;
  tokens: EnrichedTokenItem[];
}

export interface StoryRepository {
  loadState(storyId: string): Promise<StoryState>;
  commitNode(input: CommitNodeInput): Promise<{ nodeId: string; version: number }>;
  appendEvent(jobId: string, eventType: string, payload?: JsonValue): Promise<void>;
}

export interface PutAudioInput {
  objectKey: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface AudioStorage {
  put(input: PutAudioInput): Promise<{ objectKey: string; size: number }>;
  createSignedUrl(objectKey: string, expiresInSeconds: number): Promise<string>;
}
