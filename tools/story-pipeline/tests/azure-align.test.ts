import assert from "node:assert/strict";
import test from "node:test";
import { alignAzureBoundaries, spokenText } from "../src/tts/azure-align.js";

const boundary = (textOffset: number, wordLength: number, startMs: number, durationMs: number) => ({
  textOffset,
  wordLength,
  audioOffset: startMs * 10_000,
  duration: durationMs * 10_000,
});

test("Chinese Azure boundaries preserve InkQuest word and punctuation order", () => {
  const words = ["你好", "，", "今天", "。"];
  assert.equal(spokenText(words, "zh"), "你好，今天。");
  assert.deepEqual(alignAzureBoundaries(words, "zh", [
    boundary(0, 2, 50, 400),
    boundary(2, 1, 450, 20),
    boundary(3, 2, 520, 480),
  ]), [
    { start: 50, end: 450 },
    { start: 450, end: 470 },
    { start: 520, end: 1000 },
    { start: 1000, end: 1001 },
  ]);
});

test("English offsets include spaces and split an Azure word spanning two segments", () => {
  const words = ["Hello", ",", "we", "are"];
  assert.equal(spokenText(words, "en"), "Hello, we are");
  assert.deepEqual(alignAzureBoundaries(words, "en", [
    boundary(0, 5, 100, 400),
    boundary(7, 6, 600, 600),
  ]), [
    { start: 100, end: 500 },
    { start: 500, end: 501 },
    { start: 600, end: 800 },
    { start: 900, end: 1200 },
  ]);
});

test("a missing spoken word boundary fails instead of publishing made-up timing", () => {
  assert.throws(
    () => alignAzureBoundaries(["hello", "world"], "en", [boundary(0, 5, 50, 300)]),
    /no word boundary for segment 1/,
  );
});
