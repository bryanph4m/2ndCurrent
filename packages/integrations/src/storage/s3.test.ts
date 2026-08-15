import { describe, expect, it, vi } from "vitest";
import { S3ObjectStorage } from "./s3";

const fixedDate = new Date("2026-08-15T12:00:00.000Z");

function createStorage(fetchFn: typeof fetch) {
  return new S3ObjectStorage({
    endpoint: "https://objects.example.com",
    region: "us-west-2",
    bucket: "private-media",
    accessKeyId: "access",
    secretAccessKey: "secret",
    fetchFn,
    now: () => fixedDate,
  });
}

describe("S3ObjectStorage", () => {
  it("uploads without any public ACL and signs the request", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const storage = createStorage(fetchFn);

    await storage.putPrivateObject({
      objectKey: "items/a/photo.webp",
      bytes: Buffer.from("private"),
      mimeType: "image/webp",
    });

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toBe("https://objects.example.com/private-media/items/a/photo.webp");
    expect(init?.method).toBe("PUT");
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toContain("AWS4-HMAC-SHA256");
    expect(headers).not.toHaveProperty("x-amz-acl");
  });

  it("creates a bounded signed read URL", async () => {
    const storage = createStorage(vi.fn<typeof fetch>());
    const url = new URL(await storage.createSignedReadUrl("items/a photo.webp", 300));

    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
    expect(url.pathname).toBe("/private-media/items/a%20photo.webp");
    await expect(storage.createSignedReadUrl("x", 604_801)).rejects.toThrow("TTL");
  });
});
