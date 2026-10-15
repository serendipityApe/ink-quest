import { connection } from "next/server";

export const dynamic = "force-dynamic";

const RECORD = /^v=MCPv1;\s*k=(?:ed25519|ecdsap384);\s*p=[A-Za-z0-9+/=]+$/;

/** Public domain proof. The matching private key is not in this repo. */
const DEFAULT_RECORD =
  "v=MCPv1; k=ed25519; p=+8OxSXGv5QhPV557c8T71jJIYeNIpjFbGCZMjq0oUbY=";

/**
 * Public half of the MCP registry domain proof.
 * MCP_REGISTRY_AUTH can replace the committed line. The lookup is dynamic so
 * Next.js does not inline an empty build-time value over the default.
 * The private key is never stored here.
 */
function registryAuthRecord(): string {
  const name = "MCP_REGISTRY_AUTH";
  const value = process.env[name];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (RECORD.test(trimmed)) return trimmed;
  }
  return DEFAULT_RECORD;
}

export async function GET() {
  await connection();
  const record = registryAuthRecord();

  return new Response(`${record}\n`, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
