import { scryptSync, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminSessionToken } from "@/lib/adminSession";
import { getServerEnvironment, requireServerEnvironmentValue } from "@/lib/env";
import {
  enforcePublicRateLimit,
  readLimitedText,
  requestTooLargeResponse,
} from "@/lib/requestSafety";

function verifyPassword(password: string, stored: string): boolean {
  const [algorithm, saltBase64, hashBase64, extra] = stored.split("$");
  if (algorithm !== "scrypt" || !saltBase64 || !hashBase64 || extra) return false;
  const expected = Buffer.from(hashBase64, "base64");
  const actual = scryptSync(password, Buffer.from(saltBase64, "base64"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function POST(request: Request): Promise<Response> {
  const limited = enforcePublicRateLimit(request, "admin-login", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const expectedOrigin = new URL(getServerEnvironment().APP_BASE_URL).origin;
  if (request.headers.get("origin") !== expectedOrigin) {
    return Response.json({ error: "invalid origin" }, { status: 403 });
  }

  let body: string;
  try {
    body = await readLimitedText(request, 4_096);
  } catch {
    return requestTooLargeResponse();
  }
  const password = new URLSearchParams(body).get("password") ?? "";
  if (!verifyPassword(password, requireServerEnvironmentValue("ADMIN_PASSWORD_HASH"))) {
    return NextResponse.redirect(new URL("/admin/login?error=1", request.url), 303);
  }

  const response = NextResponse.redirect(new URL("/admin", request.url), 303);
  response.cookies.set({
    name: "secondcurrent_admin",
    value: await createAdminSessionToken(requireServerEnvironmentValue("ADMIN_SESSION_SECRET")),
    httpOnly: true,
    secure: getServerEnvironment().NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: 28_800,
  });
  return response;
}
