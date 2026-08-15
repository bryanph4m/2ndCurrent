export class RequestTooLargeError extends Error {}

export async function readLimitedText(request: Request, maxBytes: number): Promise<string> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestTooLargeError(`Request exceeds ${maxBytes} bytes`);
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new RequestTooLargeError(`Request exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

type RateBucket = { count: number; resetAt: number };

export function createFixedWindowRateLimiter(now: () => number = Date.now) {
  const buckets = new Map<string, RateBucket>();
  return (key: string, limit: number, windowMs: number) => {
    const currentTime = now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= currentTime) {
      buckets.set(key, { count: 1, resetAt: currentTime + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    bucket.count += 1;
    return {
      allowed: bucket.count <= limit,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000)),
    };
  };
}

const checkRateLimit = createFixedWindowRateLimiter();

export function enforcePublicRateLimit(
  request: Request,
  routeKey: string,
  options: { limit: number; windowMs: number },
): Response | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "unknown";
  const result = checkRateLimit(`${routeKey}:${address}`, options.limit, options.windowMs);
  if (result.allowed) return null;
  return Response.json(
    { error: "too many requests" },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
  );
}

export function requestTooLargeResponse(): Response {
  return Response.json({ error: "request too large" }, { status: 413 });
}
