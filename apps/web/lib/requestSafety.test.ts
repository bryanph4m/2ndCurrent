import { describe, expect, it } from "vitest";
import {
  RequestTooLargeError,
  createFixedWindowRateLimiter,
  readLimitedText,
} from "./requestSafety";

describe("request safety", () => {
  it("rejects declared and streamed bodies over the limit", async () => {
    await expect(
      readLimitedText(
        new Request("https://example.com", {
          method: "POST",
          headers: { "content-length": "20" },
          body: "small",
        }),
        10,
      ),
    ).rejects.toBeInstanceOf(RequestTooLargeError);
    await expect(
      readLimitedText(
        new Request("https://example.com", { method: "POST", body: "01234567890" }),
        10,
      ),
    ).rejects.toBeInstanceOf(RequestTooLargeError);
  });

  it("resets fixed-window rate limits", () => {
    let now = 1_000;
    const check = createFixedWindowRateLimiter(() => now);
    expect(check("route:ip", 2, 1_000).allowed).toBe(true);
    expect(check("route:ip", 2, 1_000).allowed).toBe(true);
    expect(check("route:ip", 2, 1_000).allowed).toBe(false);
    now = 2_000;
    expect(check("route:ip", 2, 1_000).allowed).toBe(true);
  });
});
