import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");

const ENV_FILES = [
  join(REPO_ROOT, ".env"),
  join(REPO_ROOT, ".env.local"),
  join(REPO_ROOT, "tools", "story-pipeline", ".env"),
  join(REPO_ROOT, "tools", "story-pipeline", ".env.local"),
];

const ORIGINAL_KEYS = new Set(Object.keys(process.env));

let loaded = false;

export function loadStoryPipelineEnv() {
  if (loaded) return;
  loaded = true;

  for (const file of ENV_FILES) {
    if (!existsSync(file)) continue;
    const parsed = parseEnvFile(readFileSync(file, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (ORIGINAL_KEYS.has(key)) continue;
      process.env[key] = value;
    }
  }
}

loadStoryPipelineEnv();

function parseEnvFile(source: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of source.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice(7).trimStart();

    const eq = line.indexOf("=");
    if (eq < 0) continue;

    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    const value = line.slice(eq + 1).trimStart();
    result[key] = parseEnvValue(value);
  }

  return result;
}

function parseEnvValue(value: string): string {
  if (!value) return "";

  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' || first === "'") && last === first && value.length >= 2) {
    const inner = value.slice(1, -1);
    return first === '"' ? unescapeDoubleQuoted(inner) : inner;
  }

  const commentIndex = value.search(/\s+#/);
  const cleaned = commentIndex >= 0 ? value.slice(0, commentIndex) : value;
  return cleaned.trimEnd();
}

function unescapeDoubleQuoted(value: string): string {
  return value
    .replace(/\\\\/g, "\\")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");
}
