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

  // Sign-in pages are irrelevant once a session exists.
  if (
    hasSessionCookie &&
    (request.nextUrl.pathname === "/login" ||
      request.nextUrl.pathname === "/register")
  ) {
    return NextResponse.redirect(new URL("/account", request.url));
  }

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