import { connection } from "next/server";

export const dynamic = "force-dynamic";

const RECORD = /^v=MCPv1;\s*k=(?:ed25519|ecdsap384);\s*p=[A-Za-z0-9+/=]+$/;

/**
 * Public half of the MCP registry domain proof.
 * Read through a dynamic env lookup so Next.js does not inline the value at
 * build time. The private key is never stored here.
 */
function registryAuthRecord(): string | undefined {
  const name = "MCP_REGISTRY_AUTH";
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function GET() {
  await connection();
  const record = registryAuthRecord();
  if (!record || !RECORD.test(record)) {
    return new Response("MCP registry auth record is not configured.\n", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  return new Response(`${record}\n`, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
