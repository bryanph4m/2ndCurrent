import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminSessionToken } from "@/lib/adminSession";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/admin/login") return NextResponse.next();
  const secret = process.env.ADMIN_SESSION_SECRET;
  const token = request.cookies.get("secondcurrent_admin")?.value;
  if (!secret || !(await verifyAdminSessionToken(token, secret))) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
