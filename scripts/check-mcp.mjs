#!/usr/bin/env node
import http from "node:http";

/**
 * Exercise the local InkQuest MCP endpoint:
 * initialize, tools/list, tools/call, and ping.
 *
 *   pnpm dev:web
 *   node scripts/check-mcp.mjs
 *
 * MCP_BASE_URL defaults to http://127.0.0.1:3000.
 * EXPECT_REGISTRY_AUTH=1 when the server was started with an MCP_REGISTRY_AUTH override.
 */

const base = (process.env.MCP_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const protocol = "2025-11-25";
let failed = 0;

function fail(message) {
  failed += 1;
  console.error(`FAIL ${message}`);
}

function ok(message) {
  console.log(`ok   ${message}`);
}

async function rpc(method, params, id) {
  const body = { jsonrpc: "2.0", method };
  if (id !== undefined) body.id = id;
  if (params !== undefined) body.params = params;
  const response = await fetch(`${base}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": protocol,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: response.status, json, text };
}

function postWithHost(hostHeader, body) {
  const url = new URL(base);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: "/api/mcp",
        method: "POST",
        headers: {
          host: hostHeader,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "content-length": Buffer.byteLength(body),
        },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode ?? 0));
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

function toolText(message) {
  const content = message?.result?.content;
  if (!Array.isArray(content) || content[0]?.type !== "text") return null;
  return content[0].text;
}

async function main() {
  const init = await rpc(
    "initialize",
    {
      protocolVersion: protocol,
      capabilities: {},
      clientInfo: { name: "inkquest-check-mcp", version: "1.0.0" },
    },
    1,
  );
  if (init.status !== 200 || init.json?.result?.serverInfo?.name !== "inkquest") {
    fail(`initialize status=${init.status} body=${init.text.slice(0, 400)}`);
  } else if (!init.json.result.capabilities?.tools || !init.json.result.protocolVersion) {
    fail(`initialize missing capabilities: ${init.text.slice(0, 400)}`);
  } else {
    ok(`initialize protocol=${init.json.result.protocolVersion}`);
  }

  const initialized = await rpc("notifications/initialized", {});
  if (initialized.status !== 202) {
    fail(`notifications/initialized status=${initialized.status} body=${initialized.text.slice(0, 200)}`);
  } else {
    ok("notifications/initialized 202");
  }

  const ping = await rpc("ping", {}, 2);
  if (ping.status !== 200 || !ping.json?.result || ping.json.error) {
    fail(`ping status=${ping.status} body=${ping.text.slice(0, 200)}`);
  } else {
    ok("ping");
  }

  const listed = await rpc("tools/list", {}, 3);
  const names = (listed.json?.result?.tools ?? []).map((tool) => tool.name).sort();
  const expected = ["get_story_opening", "list_stories", "recommend_story"];
  const listTool = listed.json?.result?.tools?.find((tool) => tool.name === "list_stories");
  if (listed.status !== 200 || names.join(",") !== expected.join(",")) {
    fail(`tools/list got ${names.join(",") || listed.text.slice(0, 300)}`);
  } else if (listed.json.result.tools.some((tool) => !tool.description || tool.description.length < 40)) {
    fail("tools/list descriptions are missing");
  } else if (!listTool?.inputSchema?.properties?.target_language || !listTool.inputSchema.properties.hsk_level) {
    fail(`list_stories input schema missing: ${JSON.stringify(listTool?.inputSchema)}`);
  } else {
    ok(`tools/list ${names.join(", ")}`);
  }

  const stories = await rpc(
    "tools/call",
    { name: "list_stories", arguments: { target_language: "zh", hsk_level: 3 } },
    4,
  );
  const storyPayload = toolText(stories.json);
  let openingId = "before-the-rain-stops";
  if (stories.status !== 200 || stories.json?.result?.isError || !storyPayload) {
    fail(`list_stories failed: ${stories.text.slice(0, 400)}`);
  } else {
    const parsed = JSON.parse(storyPayload);
    const urlsOk = parsed.stories?.every((story) => /^https:\/\/inkquest\.dev\/stories\/[a-z0-9-]+$/.test(story.url));
    const levelsOk = parsed.stories?.every((story) => story.level === "HSK 3" && story.target_language === "zh");
    const ids = new Set(parsed.stories?.map((story) => story.id));
    if (!urlsOk || !levelsOk || !ids.has("before-the-rain-stops") || ids.has("master-secret")) {
      fail(`list_stories payload unexpected: ${storyPayload.slice(0, 400)}`);
    } else {
      openingId = parsed.stories[0].id;
      ok(`list_stories HSK 3 count=${parsed.count}`);
    }
  }

  const opening = await rpc(
    "tools/call",
    { name: "get_story_opening", arguments: { story_id: openingId } },
    5,
  );
  const openingText = toolText(opening.json);
  if (opening.status !== 200 || opening.json?.result?.isError || !openingText) {
    fail(`get_story_opening failed: ${opening.text.slice(0, 400)}`);
  } else {
    const parsed = JSON.parse(openingText);
    const leaked =
      openingText.includes("你从书架上取下最后几本没放对位置的书") ||
      openingText.includes("audio_url") ||
      openingText.includes("text_segments") ||
      openingText.includes("诡异的香气");
    if (
      leaked ||
      typeof parsed.opening_text !== "string" ||
      parsed.opening_text.length < 20 ||
      parsed.url !== `https://inkquest.dev/stories/${openingId}` ||
      !Array.isArray(parsed.choices) ||
      parsed.choices.length < 1
    ) {
      fail(`opening payload unexpected: ${openingText.slice(0, 400)}`);
    } else {
      const glosses = parsed.annotations?.filter((item) => item.reading || item.meaning).length ?? 0;
      ok(`get_story_opening ${openingId} chars=${parsed.opening_text.length} glosses=${glosses}`);
    }
  }

  const english = await rpc(
    "tools/call",
    { name: "get_story_opening", arguments: { story_id: "receipt-from-tomorrow" } },
    11,
  );
  const englishText = toolText(english.json);
  if (english.status !== 200 || english.json?.result?.isError || !englishText) {
    fail(`english opening failed: ${english.text.slice(0, 300)}`);
  } else {
    const parsed = JSON.parse(englishText);
    if (!parsed.opening_text?.includes("p.m.") || parsed.opening_text.includes("p.m .") || !parsed.url?.endsWith("/receipt-from-tomorrow")) {
      fail(`english opening text unexpected: ${parsed.opening_text?.slice(0, 180)}`);
    } else {
      ok("get_story_opening english punctuation");
    }
  }

  const hidden = await rpc(
    "tools/call",
    { name: "get_story_opening", arguments: { story_id: "master-secret" } },
    6,
  );
  const hiddenText = toolText(hidden.json) ?? "";
  if (hidden.status !== 200 || hidden.json?.result?.isError !== true || hiddenText.includes("诡异的香气")) {
    fail(`withdrawn story was readable: ${hidden.text.slice(0, 300)}`);
  } else {
    ok("get_story_opening rejects withdrawn master-secret");
  }

  const recommended = await rpc(
    "tools/call",
    { name: "recommend_story", arguments: { hsk_level: 3, genre: "romance" } },
    7,
  );
  const recommendText = toolText(recommended.json);
  if (recommended.status !== 200 || recommended.json?.result?.isError || !recommendText) {
    fail(`recommend_story failed: ${recommended.text.slice(0, 400)}`);
  } else {
    const parsed = JSON.parse(recommendText);
    const first = parsed.matches?.[0];
    const linksOk = parsed.matches?.every((match) => match.url?.startsWith("https://inkquest.dev/stories/"));
    if (first?.id !== "before-the-rain-stops" || !linksOk || !first.reasons?.length) {
      fail(`recommend_story unexpected: ${recommendText.slice(0, 500)}`);
    } else {
      ok(`recommend_story top=${first.id}`);
    }
  }

  const invalid = await rpc(
    "tools/call",
    { name: "list_stories", arguments: { hsk_level: 99 } },
    8,
  );
  if (invalid.status !== 200 || invalid.json?.result?.isError !== true) {
    fail(`invalid hsk_level should be a tool error: ${invalid.text.slice(0, 300)}`);
  } else {
    ok("invalid hsk_level rejected");
  }

  const oversized = await fetch(`${base}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: `{"jsonrpc":"2.0","id":9,"method":"ping","params":{"pad":"${"x".repeat(20_000)}"}}`,
  });
  if (oversized.status !== 413) {
    fail(`oversized body status=${oversized.status}`);
  } else {
    ok("oversized body 413");
  }

  const evilStatus = await postWithHost("evil.example", JSON.stringify({ jsonrpc: "2.0", id: 10, method: "ping" }));
  if (evilStatus !== 403) {
    fail(`unknown host status=${evilStatus}`);
  } else {
    ok("unknown host 403");
  }

  const auth = await fetch(`${base}/.well-known/mcp-registry-auth`);
  const authBody = (await auth.text()).trim();
  const defaultRecord = "v=MCPv1; k=ed25519; p=+8OxSXGv5QhPV557c8T71jJIYeNIpjFbGCZMjq0oUbY=";
  if (process.env.EXPECT_REGISTRY_AUTH === "1") {
    if (auth.status !== 200 || !authBody.startsWith("v=MCPv1;")) {
      fail(`registry auth status=${auth.status} body=${authBody}`);
    } else {
      ok("mcp-registry-auth serves the public record");
    }
  } else if (auth.status !== 200 || authBody !== defaultRecord) {
    fail(`registry auth status=${auth.status} body=${authBody}`);
  } else {
    ok("mcp-registry-auth serves the committed public record");
  }

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("\nMCP endpoint checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
