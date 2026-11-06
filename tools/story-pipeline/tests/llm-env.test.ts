import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

// Synthetic fixture values only: never read or copy the repository's private .env files.
test("Worker loads OPENAI_KEY from root .env; nested files override same names and shell values win", (t) => {
  const root = mkdtempSync(join(tmpdir(), "inkquest-env-fixture-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const pipeline = join(root, "tools", "story-pipeline");
  mkdirSync(join(pipeline, "src"), { recursive: true });
  const loader = join(pipeline, "src", "env.ts");
  copyFileSync(fileURLToPath(new URL("../src/env.ts", import.meta.url)), loader);
  writeFileSync(join(root, ".env"), 'OPENAI_KEY="fixture-root-alias"\nLLM_PROVIDER=openai\n');
  writeFileSync(join(root, ".env.local"), 'OPENAI_MODEL=fixture-root-model\n');
  writeFileSync(join(pipeline, ".env.local"), 'OPENAI_MODEL=fixture-pipeline-model\n');
  const require = createRequire(import.meta.url);
  const tsx = pathToFileURL(require.resolve("tsx")).href;
  const script = `await import(${JSON.stringify(pathToFileURL(loader).href)}); console.log(JSON.stringify({ alias: process.env.OPENAI_KEY, model: process.env.OPENAI_MODEL, provider: process.env.LLM_PROVIDER }));`;
  const run = (extra: Record<string, string> = {}) => {
    const result = spawnSync(process.execPath, ["--import", tsx, "--input-type=module", "--eval", script], {
      env: { PATH: process.env.PATH, TSX_DISABLE_CACHE: "1", ...extra }, encoding: "utf8",
    });
    assert.equal(result.status, 0, "synthetic environment loader subprocess failed");
    return JSON.parse(result.stdout);
  };
  assert.deepEqual(run(), { alias: "fixture-root-alias", model: "fixture-pipeline-model", provider: "openai" });
  assert.deepEqual(run({ OPENAI_KEY: "fixture-shell-alias", OPENAI_MODEL: "fixture-shell-model" }), {
    alias: "fixture-shell-alias", model: "fixture-shell-model", provider: "openai",
  });
});
