interface Env {
  GENERATION_WORKER_URL: string;
  GENERATION_WORKER_TOKEN: string;
}

interface GenerationMessage {
  jobId: string;
}

interface QueueMessage<T> {
  body: T;
  attempts: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

interface MessageBatch<T> {
  messages: Array<QueueMessage<T>>;
}

async function forward(message: QueueMessage<GenerationMessage>, env: Env) {
  const jobId = message.body?.jobId;
  if (!jobId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    message.ack();
    return;
  }

  try {
    const response = await fetch(`${env.GENERATION_WORKER_URL.replace(/\/$/, "")}/jobs/${jobId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GENERATION_WORKER_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (response.ok || (response.status >= 400 && response.status < 500)) {
      message.ack();
      return;
    }
  } catch (error) {
    console.error("Generation worker request failed", { jobId, error });
  }

  message.retry({ delaySeconds: Math.min(300, 15 * 2 ** message.attempts) });
}

const dispatcher = {
  async queue(batch: MessageBatch<GenerationMessage>, env: Env) {
    await Promise.all(batch.messages.map((message) => forward(message, env)));
  },
};

export default dispatcher;
