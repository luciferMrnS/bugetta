import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/cookie-names";

// Optimistic guard: if no session cookie is present, redirect to /login.
// This is what the docs call an optimistic check — not a session store.
// Authoritative authorization happens in each Server Component / API handler.
export function proxy(request: NextRequest) {
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  // Pages requiring authentication.
  if (
    request.nextUrl.pathname.startsWith("/account") ||
    request.nextUrl.pathname.startsWith("/requests") ||
    request.nextUrl.pathname.startsWith("/operations")
  ) {
    if (!hasSessionCookie) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", request.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Sign-in pages are public — no redirect even if a cookie exists.
  // This prevents an infinite redirect loop when the session cookie is
  // stale (cookie present but the DB row is gone after a deploy/expire).

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/account/:path*",
    "/requests/:path*",
    "/requests",
    "/operations/:path*",
    "/operations",
    "/login",
    "/register",
  ],
};