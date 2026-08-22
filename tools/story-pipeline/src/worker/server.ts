import "../env.js";
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { runGenerationJob } from "./run-job.js";
import { GenerationJobStore } from "./store.js";

const port = Number(process.env.PORT ?? "8080");
const pollingEnabled = process.env.GENERATION_POLL_OUTBOX === "true"
  || (process.env.GENERATION_POLL_OUTBOX !== "false" && process.env.NODE_ENV !== "production");
const pollIntervalMs = Math.max(500, Number(process.env.GENERATION_POLL_INTERVAL_MS ?? "1500"));
let polling = false;

async function pollOutbox() {
  if (polling) return;
  polling = true;
  try {
    const jobIds = await GenerationJobStore.fromEnv().listPendingJobIds();
    for (const jobId of jobIds) {
      const result = await runGenerationJob(jobId);
      console.log("Generation outbox job processed", { jobId, result });
    }
  } catch (error) {
    console.error("Generation outbox polling failed", error);
  } finally {
    polling = false;
  }
}

function authorized(header: string | undefined) {
  const token = process.env.GENERATION_WORKER_TOKEN;
  const supplied = header?.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !supplied || token.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(supplied));
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  const match = request.url?.match(/^\/jobs\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i);
  if (request.method !== "POST" || !match) {
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
    return;
  }
  if (!authorized(request.headers.authorization)) {
    response.writeHead(401, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  try {
    const result = await runGenerationJob(match[1]);
    const status = result === "retry_scheduled" ? 503 : 200;
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ status: result }));
  } catch (error) {
    console.error("Generation worker request failed", error);
    response.writeHead(503, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "worker_unavailable" }));
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`InkQuest generation worker listening on ${port}`);
  if (pollingEnabled) {
    console.log(`Generation outbox polling enabled (${pollIntervalMs}ms)`);
    void pollOutbox();
  }
});

const pollTimer = pollingEnabled ? setInterval(() => void pollOutbox(), pollIntervalMs) : null;
pollTimer?.unref();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (pollTimer) clearInterval(pollTimer);
    server.close(() => process.exit(0));
  });
}
