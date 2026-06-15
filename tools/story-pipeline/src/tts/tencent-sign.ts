import { createHash, createHmac } from "node:crypto";

/**
 * 腾讯云 API 签名 v3（TC3-HMAC-SHA256）。
 * 文档：https://cloud.tencent.com/document/api/1073/30649
 * 仅依赖 Node crypto，无需 SDK。
 */

function sha256hex(s: string | Buffer): string {
  return createHash("sha256").update(s).digest("hex");
}

function hmac(key: string | Buffer, msg: string): Buffer {
  return createHmac("sha256", key).update(msg).digest();
}

export interface Tc3Options {
  secretId: string;
  secretKey: string;
  service: string;   // "tts"
  host: string;      // "tts.tencentcloudapi.com"
  action: string;    // "TextToVoice"
  version: string;   // "2019-08-23"
  region?: string;
  payload: string;   // JSON body
}

/** 返回调用所需的完整 headers。 */
export function buildHeaders(o: Tc3Options): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10); // UTC YYYY-MM-DD

  // 1. 规范请求串
  const httpMethod = "POST";
  const canonicalUri = "/";
  const canonicalQuery = "";
  const canonicalHeaders =
    `content-type:application/json; charset=utf-8\nhost:${o.host}\nx-tc-action:${o.action.toLowerCase()}\n`;
  const signedHeaders = "content-type;host;x-tc-action";
  const hashedPayload = sha256hex(o.payload);
  const canonicalRequest = [
    httpMethod, canonicalUri, canonicalQuery,
    canonicalHeaders, signedHeaders, hashedPayload,
  ].join("\n");

  // 2. 待签字符串
  const algorithm = "TC3-HMAC-SHA256";
  const credentialScope = `${date}/${o.service}/tc3_request`;
  const stringToSign = [
    algorithm, timestamp, credentialScope, sha256hex(canonicalRequest),
  ].join("\n");

  // 3. 计算签名
  const secretDate = hmac(`TC3${o.secretKey}`, date);
  const secretService = hmac(secretDate, o.service);
  const secretSigning = hmac(secretService, "tc3_request");
  const signature = createHmac("sha256", secretSigning).update(stringToSign).digest("hex");

  // 4. 组装 Authorization
  const authorization =
    `${algorithm} Credential=${o.secretId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Host": o.host,
    "X-TC-Action": o.action,
    "X-TC-Version": o.version,
    "X-TC-Timestamp": String(timestamp),
    "Authorization": authorization,
  };
  if (o.region) headers["X-TC-Region"] = o.region;
  return headers;
}
