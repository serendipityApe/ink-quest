// scripts/upload-assets.mjs
//
// P0 资源迁移：把本地音频 + 故事封面上传到 Supabase Storage 的 public bucket。
//
// 做三件事：
//   1) 确保 public bucket（默认 "assets"）存在；
//   2) 上传 public/audio/*.{mp3,wav} 到 bucket 的 audio/ 前缀；
//   3) 抓取 CATALOG 里每篇故事的封面（Google 图床或已有 URL），
//      存一份到本地 public/covers/<id>.png（供本地开发直读），并上传到 bucket 的 covers/。
//
// 运行：node scripts/upload-assets.mjs              # 跳过已存在的同名对象
//       node scripts/upload-assets.mjs --force      # 覆盖上传
//       node scripts/upload-assets.mjs --covers-only # 只处理封面
//       node scripts/upload-assets.mjs --audio-only  # 只处理音频
//
// 读取 .env.local：NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY（service role 才能写 Storage）。

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";

// 注：直接用 Supabase Storage REST API（纯 fetch），不经 supabase-js —— 后者会初始化
// realtime client，Node 20 无原生 WebSocket 会报错，而 Storage 操作本就用不到 realtime。

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BUCKET = process.env.ASSET_BUCKET || "assets";

const args = new Set(process.argv.slice(2));
const FORCE = args.has("--force");
const COVERS_ONLY = args.has("--covers-only");
const AUDIO_ONLY = args.has("--audio-only");

// 封面来源：与 registry.ts 的 CATALOG 对应。脚本独立于 TS，故在此显式列出
// 每篇故事的 id 与「封面原始 URL」（迁移一次性使用；迁移后 CATALOG 已改为 /covers/<id>.png）。
const COVER_SOURCES = {
  "master-secret":
    "https://lh3.googleusercontent.com/aida-public/AB6AXuCVCmwDjWWepAYvAZcCqk_xatLu8OYqNUqHUG0Q60x2PRJ2AoTDRrrJnBGq0XoYF8SNjbM2zp6ydg-smBdAjFAWSF9YJuXW1LerMIUdwxPB2__jDs8iIu70UCFjQW7IOptszOBppgCmPOt0k2a7a5iMM2c9GSv0xzuX9Z3sCqIHvH0Y04ZsN8_6MU6JX1MaiCG05aWxbEREymYHdiHd9GVCiIrft4V9ZDo2QE9m1l5oXJ9DzNSc5XyZMYMCHTu0mO52wvh86e_8cFem",
  "last-train":
    "https://lh3.googleusercontent.com/aida-public/AB6AXuDFUoNSnoejdFuBy8VNwharovOHGD6g44r4kKn7_HVILQUTKdbPU48FpekULUMbqrfICHZzk8drJXQlfE7Zmpo2MtjCbaX5wf0AQSDK-XnGV6cfYHSHhlC-3-tSFt-DIcN8vRiPW9SWieyCFiFbFGKKOQl7CjTuUyaYpyKtK0f4zj9gjjXmT6xaztpmGo4yS8sw3HgMexbrkiYBJ2MIVz2X4ykjjgZDEUQSaPMAS49Mble2l-P2mxVaDZr90UrV_jiSw7k_emBDjkZ6",
  "haunted-house":
    "https://lh3.googleusercontent.com/aida-public/AB6AXuByAGR3eAj-islCdaxw-6Hx-2vtqhn3nBZaza3MPUZbedeFnRCjiBZQwwW1Do80PwO5P_o9YyRRQZj6dCsJo6h-CsEcWBw9ZaNKjbEEpya6Aex_415Kqo5VEc60vfrnewFcp97JiesxmS_0a3ou8G3tky6bFtJTTLTv7N5R1lhm6FIpiyJG-rh-kxa7B4Dxv5Ws6OnwY2NyIvCljmxprVpclM6CJH2SW_AiEw2tzcx_pYB45qVstjmN_XtnKebSsTuVVtvY9DIhfZhu",
  "signal-from-the-deep":
    "https://lh3.googleusercontent.com/aida-public/AB6AXuAY23k1btIgdPesyxntFo5G0KN7A7e0i_9IafFx_v-faXzCF0oZ6yJyVxFjZUEh_oRShEWZShJFNoMHdFjJMZlx6tzFr5e0PTd7vlOXLb_9j1FqiaMREgIR7s2R1U_JteAs2f3iY7Drcl7s9lI2pEfcVP0I1b9WDwBFSSWBl-5N3P-1Qi6RkHC9bnruOAtUf3UU-mKI4NqhK8jZq12O3Ju41iokvF9YY1VuOp3I5FMdOO85n6WCEor-x_Qxb_i9K65UiGtqdsw16yR8",
};

const CONTENT_TYPES = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

// PLACEHOLDER_BODY

// ── 读取 .env.local（不引第三方依赖，手写极简解析）─────────────────────────
function loadEnv() {
  const file = join(ROOT, ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv();

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✗ 缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY（请配置 .env.local）");
  process.exit(1);
}

const STORAGE = `${SUPABASE_URL}/storage/v1`;
const authHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

const contentType = (name) => CONTENT_TYPES[extname(name).toLowerCase()] || "application/octet-stream";

// 带重试的 fetch：项目刚从暂停恢复时数据库预热，会间歇 544 DatabaseTimeout 或直接断连
// （fetch failed）。对这类瞬时错误指数退避重试，避免整个迁移因一次抖动失败。
async function fetchRetry(url, opts = {}, label = "", tries = 8) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.status === 544 || res.status === 503 || res.status === 502) {
        lastErr = new Error(`HTTP ${res.status}`);
      } else {
        return res;
      }
    } catch (e) {
      lastErr = e; // fetch failed（连接被重置）
    }
    if (i < tries) {
      const wait = Math.min(3000 * i, 20000);
      console.log(`  …${label || url} 第 ${i} 次失败（${lastErr.message}），${wait / 1000}s 后重试`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error(`${label || url}：重试 ${tries} 次仍失败（${lastErr?.message}）`);
}

async function ensureBucket() {
  const res = await fetchRetry(`${STORAGE}/bucket`, { headers: authHeaders }, "listBuckets");
  if (!res.ok) throw new Error(`listBuckets: HTTP ${res.status} ${await res.text()}`);
  const buckets = await res.json();
  if (buckets.some((b) => b.name === BUCKET || b.id === BUCKET)) {
    console.log(`• bucket "${BUCKET}" 已存在`);
    return;
  }
  const createRes = await fetchRetry(`${STORAGE}/bucket`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  }, "createBucket");
  if (!createRes.ok) throw new Error(`createBucket: HTTP ${createRes.status} ${await createRes.text()}`);
  console.log(`✓ 已创建 public bucket "${BUCKET}"`);
}

async function uploadBuffer(objectPath, buf, type) {
  // POST = 新建（已存在则 409）；PUT + x-upsert = 覆盖。
  const url = `${STORAGE}/object/${BUCKET}/${objectPath}`;
  const res = await fetchRetry(url, {
    method: FORCE ? "PUT" : "POST",
    headers: { ...authHeaders, "Content-Type": type, "x-upsert": String(FORCE) },
    body: buf,
  }, objectPath);
  if (res.ok) return "ok";
  const body = await res.text();
  // 已存在：Storage 有时返回 409，有时把 409 包进 HTTP 400 的 body —— 都按跳过处理。
  if (res.status === 409 || /Duplicate|already exists/i.test(body)) return "skip";
  throw new Error(`upload ${objectPath}: HTTP ${res.status} ${body}`);
}

async function migrateAudio() {
  const dir = join(ROOT, "public", "audio");
  if (!existsSync(dir)) {
    console.log("• public/audio 不存在，跳过音频");
    return;
  }
  const files = readdirSync(dir).filter((f) => /\.(mp3|wav)$/i.test(f));
  console.log(`\n▶ 音频：${files.length} 个文件 → ${BUCKET}/audio/`);
  let ok = 0, skip = 0;
  for (const f of files) {
    const buf = readFileSync(join(dir, f));
    const r = await uploadBuffer(`audio/${f}`, buf, contentType(f));
    if (r === "ok") { ok++; console.log(`  ✓ ${f}`); }
    else { skip++; console.log(`  – ${f}（已存在，--force 可覆盖）`); }
  }
  console.log(`  音频完成：上传 ${ok}，跳过 ${skip}`);
}

async function migrateCovers() {
  const localDir = join(ROOT, "public", "covers");
  mkdirSync(localDir, { recursive: true });
  const ids = Object.keys(COVER_SOURCES);
  console.log(`\n▶ 封面：${ids.length} 张 → public/covers/ + ${BUCKET}/covers/`);
  let ok = 0, skip = 0, fail = 0;
  for (const id of ids) {
    const src = COVER_SOURCES[id];
    try {
      const res = await fetch(src, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      // 本地留一份，供未配 env 的本地开发直读
      const localFile = join(localDir, `${id}.png`);
      if (FORCE || !existsSync(localFile)) writeFileSync(localFile, buf);
      // 上传到 Storage
      const r = await uploadBuffer(`covers/${id}.png`, buf, "image/png");
      if (r === "ok") { ok++; console.log(`  ✓ ${id}.png (${(buf.length / 1024).toFixed(0)}K)`); }
      else { skip++; console.log(`  – ${id}.png（Storage 已存在）`); }
    } catch (e) {
      fail++;
      console.log(`  ✗ ${id}: ${e.message}（源图可能已失效，需手动提供封面）`);
    }
  }
  console.log(`  封面完成：上传 ${ok}，跳过 ${skip}，失败 ${fail}`);
}

async function main() {
  console.log(`Supabase: ${SUPABASE_URL}\nBucket:   ${BUCKET}\nForce:    ${FORCE}`);
  await ensureBucket();
  if (!COVERS_ONLY) await migrateAudio();
  if (!AUDIO_ONLY) await migrateCovers();

  const base = `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}`;
  console.log(`\n✅ 完成。把下面这行加入 .env.local 和 Vercel 环境变量：\n`);
  console.log(`NEXT_PUBLIC_ASSET_BASE_URL=${base}\n`);
}

main().catch((e) => {
  console.error(`\n✗ 失败：${e.message}`);
  process.exit(1);
});

