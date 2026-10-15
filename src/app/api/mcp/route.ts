import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createInkquestMcpServer } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;
const RATE_LIMIT = 90;
const RATE_WINDOW_MS = 60_000;

const ALLOWED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "inkquest.dev",
  "www.inkquest.dev",
]);

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, MCP-Protocol-Version",
};

const hits = new Map<string, { count: number; reset: number }>();

function hostnameOf(host: string): string {
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end === -1 ? host.toLowerCase() : host.slice(0, end + 1).toLowerCase();
  }
  return (host.split(":")[0] ?? "").toLowerCase();
}

function jsonRpcError(status: number, message: string): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message }, id: null },
    { status, headers: { "cache-control": "no-store", ...CORS_HEADERS } },
  );
}

function rejectUnknownHost(request: Request): Response | null {
  const host = request.headers.get("host");
  if (!host) return null;
  if (ALLOWED_HOSTS.has(hostnameOf(host))) return null;
  return jsonRpcError(403, "Forbidden host");
}

function rateLimit(request: Request): Response | null {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local";
  const now = Date.now();
  if (hits.size > 1000) {
    for (const [key, entry] of hits) {
      if (now > entry.reset) hits.delete(key);
    }
  }
  const entry = hits.get(ip);
  if (!entry || now > entry.reset) {
    hits.set(ip, { count: 1, reset: now + RATE_WINDOW_MS });
    return null;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT) {
    return jsonRpcError(429, "Too many requests");
  }
  return null;
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  if (response.status === 200 && !headers.has("cache-control")) {
    headers.set("cache-control", "public, max-age=60");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Stateless Streamable HTTP. GET would open a standalone SSE stream, which
 * this Worker does not offer; the spec allows 405 in that case.
 */
export function GET(request: Request): Response {
  const blocked = rejectUnknownHost(request);
  if (blocked) return blocked;
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed. POST JSON-RPC to this endpoint." },
      id: null,
    }),
    {
      status: 405,
      headers: {
        Allow: "POST, DELETE, OPTIONS",
        "Content-Type": "application/json",
        "cache-control": "no-store",
        ...CORS_HEADERS,
      },
    },
  );
}

export function OPTIONS(request: Request): Response {
  const blocked = rejectUnknownHost(request);
  if (blocked) return blocked;
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

async function handleRpc(request: Request): Promise<Response> {
  const blocked = rejectUnknownHost(request) ?? rateLimit(request);
  if (blocked) return blocked;

  const server = createInkquestMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: MAX_BODY_BYTES,
  });

  try {
    await server.connect(transport);
    return withCors(await transport.handleRequest(request));
  } finally {
    await server.close().catch(() => undefined);
  }
}

export const POST = handleRpc;
export const DELETE = handleRpc;
