import { createHash, createHmac } from "node:crypto";
import type { ObjectStorage, PutObjectInput, StoredObject } from "./types";

export type S3ObjectStorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  fetchFn?: typeof fetch;
  now?: () => Date;
};

const EMPTY_SHA256 = createHash("sha256").update("").digest("hex");

function encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodePath(value: string): string {
  return value.split("/").map(encode).join("/");
}

function hash(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function timestamp(date: Date): { amzDate: string; dateStamp: string } {
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

function signingKey(secret: string, date: string, region: string): Buffer {
  const day = hmac(`AWS4${secret}`, date);
  const scopedRegion = hmac(day, region);
  const service = hmac(scopedRegion, "s3");
  return hmac(service, "aws4_request");
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly endpoint: URL;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly config: S3ObjectStorageConfig) {
    this.endpoint = new URL(config.endpoint);
    this.fetchFn = config.fetchFn ?? fetch;
    this.now = config.now ?? (() => new Date());
  }

  async putPrivateObject(input: PutObjectInput): Promise<StoredObject> {
    await this.request("PUT", input.objectKey, input.bytes, input.mimeType);
    return { objectKey: input.objectKey, sizeBytes: input.bytes.byteLength };
  }

  async getPrivateObject(objectKey: string): Promise<Buffer> {
    const response = await this.request("GET", objectKey);
    return Buffer.from(await response.arrayBuffer());
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.request("DELETE", objectKey);
  }

  async createSignedReadUrl(objectKey: string, ttlSeconds: number): Promise<string> {
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 604_800) {
      throw new Error("S3 signed URL TTL must be an integer from 1 to 604800 seconds");
    }

    const url = this.objectUrl(objectKey);
    const { amzDate, dateStamp } = timestamp(this.now());
    const scope = `${dateStamp}/${this.config.region}/s3/aws4_request`;
    const query: Record<string, string> = {
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": `${this.config.accessKeyId}/${scope}`,
      "X-Amz-Date": amzDate,
      "X-Amz-Expires": String(ttlSeconds),
      "X-Amz-SignedHeaders": "host",
    };
    const canonicalQuery = Object.entries(query)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${encode(key)}=${encode(value)}`)
      .join("&");
    const canonicalRequest = [
      "GET",
      url.pathname,
      canonicalQuery,
      `host:${url.host}\n`,
      "host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, hash(canonicalRequest)].join("\n");
    const signature = createHmac(
      "sha256",
      signingKey(this.config.secretAccessKey, dateStamp, this.config.region),
    )
      .update(stringToSign)
      .digest("hex");
    url.search = `${canonicalQuery}&X-Amz-Signature=${signature}`;
    return url.toString();
  }

  private objectUrl(objectKey: string): URL {
    const basePath = this.endpoint.pathname.replace(/\/$/, "");
    const path = encodePath(objectKey);
    const url = new URL(this.endpoint);
    if (this.config.forcePathStyle ?? true) {
      url.pathname = `${basePath}/${encode(this.config.bucket)}/${path}`;
    } else {
      url.hostname = `${this.config.bucket}.${url.hostname}`;
      url.pathname = `${basePath}/${path}`;
    }
    return url;
  }

  private async request(
    method: "PUT" | "GET" | "DELETE",
    objectKey: string,
    body?: Buffer,
    mimeType?: string,
  ): Promise<Response> {
    const url = this.objectUrl(objectKey);
    const { amzDate, dateStamp } = timestamp(this.now());
    const payloadHash = body ? hash(body) : EMPTY_SHA256;
    const headers: Record<string, string> = {
      host: url.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };
    if (mimeType) headers["content-type"] = mimeType;
    const headerNames = Object.keys(headers).sort();
    const canonicalHeaders = headerNames
      .map((name) => `${name}:${headers[name]!.trim()}\n`)
      .join("");
    const signedHeaders = headerNames.join(";");
    const canonicalRequest = [
      method,
      url.pathname,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");
    const scope = `${dateStamp}/${this.config.region}/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, hash(canonicalRequest)].join("\n");
    const signature = createHmac(
      "sha256",
      signingKey(this.config.secretAccessKey, dateStamp, this.config.region),
    )
      .update(stringToSign)
      .digest("hex");
    headers.authorization =
      `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const response = await this.fetchFn(url, {
      method,
      headers,
      ...(body ? { body: new Uint8Array(body) } : {}),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`S3 ${method} ${objectKey} failed (${response.status}): ${detail}`);
    }
    return response;
  }
}
