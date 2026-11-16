import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/setup", "/forgot-password", "/reset/", "/invite/", "/api/"];

/**
 * Optimistic check only: bounces visitors with no session cookie to the
 * sign-in page. Real authorisation happens in the pages and data layer
 * (see src/lib/auth/guards.ts), which verify the session against the database.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (!request.cookies.has("or_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico|.*\\.(?:png|jpg|svg|webp|ico)$).*)"],
};
