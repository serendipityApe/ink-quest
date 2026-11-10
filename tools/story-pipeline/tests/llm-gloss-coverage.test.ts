import assert from "node:assert/strict";
import test from "node:test";
import type { GlossResolutionInput } from "../src/core/contracts.js";
import { StructuredFictionProvider } from "../src/providers/llm/structured-fiction.js";
import { GlossValidationError } from "../src/providers/llm/errors.js";

const input: GlossResolutionInput = {
  text: "Private fixture scene with repeated names and context.", targetLang: "en", glossLang: "zh",
  tokens: Array.from({ length: 7 }, (_, index) => ({ word: index === 2 || index === 6 ? "Mia" : "and",
    tier: index === 2 || index === 6 ? "key" as const : "base" as const,
    reading: null, level: null, meaning: null, candidates: ["private dictionary candidate"] })),
  unresolvedTokenIndexes: [2, 6],
};
class FixtureProvider extends StructuredFictionProvider {
  readonly provider = "fixture"; readonly model = "fixture"; readonly promptVersion = "fixture";
  calls = 0; payload: unknown;
  constructor(readonly result: unknown) { super(); }
  protected async completeJson(payload: unknown): Promise<unknown> { this.calls++; this.payload = payload; return this.result; }
}
const full = [{ tokenIndex: 2, meaning: "米娅" }, { tokenIndex: 6, meaning: "米娅" }];

test("gloss payload supplies explicit full-scene indexes for only requested tokens, including repeated words", async () => {
  const provider = new FixtureProvider({ resolutions: [full[1], { ...full[0], meaning: " 米娅 " }] });
  assert.deepEqual(await provider.resolveGlosses(input), full);
  const payload = provider.payload as { input: Record<string, unknown>; requirements: string[] };
  assert.deepEqual(payload.input, { text: input.text, targetLang: "en", glossLang: "zh",
    unresolvedTokenIndexes: [2, 6], requestedTokens: [{ tokenIndex: 2, word: "Mia" }, { tokenIndex: 6, word: "Mia" }] });
  assert.match(payload.requirements.join(" "), /JSON.*EVERY.*Never renumber/);
  assert.doesNotMatch(JSON.stringify(payload), /private dictionary candidate|candidates|reading/);
  assert.equal(provider.calls, 1);
});

test("empty gloss input performs no completion and meanings retain the bounded size", async () => {
  const provider = new FixtureProvider({ resolutions: [{ tokenIndex: 2, meaning: "x".repeat(200) }, full[1]] });
  assert.deepEqual(await provider.resolveGlosses({ ...input, unresolvedTokenIndexes: [] }), []);
  assert.equal(provider.calls, 0);
  assert.equal((await provider.resolveGlosses(input))[0].meaning.length, 160);
});

for (const [name, indexes] of Object.entries({ duplicate: [2, 2], negative: [-1], fractional: [2.5],
  outside: [7], base: [1], nonfinite: [NaN, Infinity] })) {
  test(`invalid gloss input ${name} fails before a model request`, async () => {
    const provider = new FixtureProvider({ resolutions: full });
    await assert.rejects(provider.resolveGlosses({ ...input, unresolvedTokenIndexes: indexes }), (error: unknown) => {
      assert.ok(error instanceof GlossValidationError);
      assert.equal(error.diagnostics.reason, "invalid_input");
      assert.equal(error.retryable, false); assert.equal(error.safeToRetry, false); return true;
    });
    assert.equal(provider.calls, 0);
  });
}

for (const [name, result, reason, missing] of [
  ["missing", { resolutions: [full[0]] }, "incomplete_coverage", 1],
  ["empty", { resolutions: [] }, "incomplete_coverage", 2],
  ["duplicate", { resolutions: [...full, full[0]] }, "invalid_items", 0],
  ["unexpected", { resolutions: [...full, { tokenIndex: 0, meaning: "private response" }] }, "invalid_items", 0],
  ["subset renumbered", { resolutions: [{ tokenIndex: 0, meaning: "private response" }, { tokenIndex: 1, meaning: "private response" }] }, "invalid_items", 2],
  ["blank", { resolutions: [{ tokenIndex: 2, meaning: "  " }, full[1]] }, "invalid_items", 1],
  ["wrong meaning type", { resolutions: [{ tokenIndex: 2, meaning: 42 }, full[1]] }, "invalid_items", 1],
  ["fractional index", { resolutions: [{ tokenIndex: 2.5, meaning: "private response" }, full[1]] }, "invalid_items", 1],
  ["string index", { resolutions: [{ tokenIndex: "2", meaning: "private response" }, full[1]] }, "invalid_items", 1],
  ["null item", { resolutions: [null, full[1]] }, "invalid_items", 1],
  ["nonarray", { resolutions: "private response" }, "invalid_shape", 2],
  ["null result", null, "invalid_shape", 2],
] as const) {
  test(`invalid gloss output ${name} is terminal with count-only diagnostics`, async () => {
    const provider = new FixtureProvider(result);
    await assert.rejects(provider.resolveGlosses(input), (error: unknown) => {
      assert.ok(error instanceof GlossValidationError);
      assert.equal(error.retryable, false); assert.equal(error.safeToRetry, false);
      assert.equal(error.diagnostics.reason, reason); assert.equal(error.diagnostics.missingCount, missing);
      assert.equal(error.diagnostics.requestedCount, 2); assert.ok(Object.isFrozen(error.diagnostics));
      assert.doesNotMatch(JSON.stringify(error) + error.message, /Private fixture|private response|Mia|private dictionary/);
      assert.ok(Object.entries(error.diagnostics).every(([key, value]) => key === "reason" || Number.isSafeInteger(value)));
      return true;
    });
    assert.equal(provider.calls, 1);
  });
}

test("gloss diagnostics discard additional fields and invalid counters", () => {
  const error = new GlossValidationError({ reason: "invalid_items", requestedCount: 2, receivedCount: 1,
    acceptedCount: 0, missingCount: 2, duplicateCount: 0, unexpectedCount: 0, emptyMeaningCount: NaN,
    malformedCount: -1, ...{ privateText: "never retain this" } });
  assert.equal(error.diagnostics.emptyMeaningCount, 0); assert.equal(error.diagnostics.malformedCount, 0);
  assert.doesNotMatch(JSON.stringify(error), /privateText|never retain/);
});
