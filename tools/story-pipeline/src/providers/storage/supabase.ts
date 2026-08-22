import { createHash } from "node:crypto";

export interface StoredAudio {
  objectKey: string;
  contentHash: string;
}

export class SupabaseAudioStorage {
  constructor(
    private readonly supabaseUrl: string,
    private readonly serviceRoleKey: string,
    private readonly bucket: string,
  ) {}

  static fromEnv() {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = process.env.GENERATED_AUDIO_BUCKET ?? "generated-audio";
    if (!url || !key) throw new Error("Supabase storage environment variables are not configured.");
    return new SupabaseAudioStorage(url, key, bucket);
  }

  async put(input: { userId: string; storyId: string; nodeId: string; nodeVersion: number; audio: Buffer }): Promise<StoredAudio> {
    const contentHash = createHash("sha256").update(input.audio).digest("hex");
    const objectKey = `${input.userId}/${input.storyId}/${input.nodeId}/v${input.nodeVersion}/${contentHash}.mp3`;
    const response = await fetch(`${this.supabaseUrl.replace(/\/$/, "")}/storage/v1/object/${this.bucket}/${objectKey}`, {
      method: "POST",
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        "Content-Type": "audio/mpeg",
        "x-upsert": "true",
        "Cache-Control": "31536000, immutable",
      },
      body: new Uint8Array(input.audio),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Supabase audio upload failed (${response.status}): ${error.slice(0, 500)}`);
    }
    return { objectKey, contentHash };
  }
}
