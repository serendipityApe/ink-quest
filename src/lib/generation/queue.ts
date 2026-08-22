import { after } from "next/server";

interface GenerationQueue {
  send(message: { jobId: string }): Promise<void>;
}

async function dispatchToDevelopmentWorker(jobId: string) {
  const token = process.env.GENERATION_WORKER_TOKEN;
  if (!token) {
    console.error("Local generation dispatch skipped: GENERATION_WORKER_TOKEN is not configured", { jobId });
    return false;
  }

  const workerUrl = process.env.GENERATION_WORKER_URL?.trim() || "http://127.0.0.1:8080";
  const jobUrl = new URL(`/jobs/${jobId}`, workerUrl);

  after(async () => {
    try {
      const response = await fetch(jobUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(180_000),
      });
      if (!response.ok) {
        console.error("Local generation worker rejected job", {
          jobId,
          status: response.status,
          response: await response.text(),
        });
      }
    } catch (error) {
      console.error("Local generation worker dispatch failed", { jobId, error });
    }
  });

  return true;
}

export async function enqueueGenerationJob(jobId: string) {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const context = await getCloudflareContext({ async: true });
    const queue = (context.env as unknown as { GENERATION_QUEUE?: GenerationQueue }).GENERATION_QUEUE;
    if (queue) {
      await queue.send({ jobId });
      return true;
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "development") {
      console.error("Generation queue dispatch failed", { jobId, error });
    }
  }

  if (process.env.NODE_ENV === "development") return dispatchToDevelopmentWorker(jobId);
  return false;
}
