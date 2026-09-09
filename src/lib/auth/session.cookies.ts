import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import {
  getSessionWithUser,
  SESSION_MAX_AGE_SECONDS,
  type CreatedSession,
  type SessionWithUser,
} from "@/lib/auth/session";
import { CSRF_COOKIE, SESSION_COOKIE } from "@/lib/auth/cookie-names";

const isProduction = process.env.NODE_ENV === "production";

// Read the bearer token from an API request's cookies.
export function sessionTokenFromRequest(request: NextRequest): string | undefined {
  return request.cookies.get(SESSION_COOKIE)?.value;
}

export function csrfTokenFromRequest(request: NextRequest): string | undefined {
  return request.cookies.get(CSRF_COOKIE)?.value;
}

// Read + validate the current session with only the cookie store (Server Components / layouts).
export async function getCurrentSession(): Promise<SessionWithUser | null> {
  const store = await cookies();
  return getSessionWithUser(store.get(SESSION_COOKIE)?.value);
}

// Set the httpOnly session cookie and the readable CSRF cookie on a response.
export function attachSessionCookies(
  response: NextResponse,
  session: CreatedSession,
): NextResponse {
  response.cookies.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    expires: session.expiresAt,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  response.cookies.set(CSRF_COOKIE, session.csrf, {
    httpOnly: false,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    expires: session.expiresAt,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return response;
}

// Expire both auth cookies on a response (logout).
export function clearSessionCookies(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });

  response.cookies.set(CSRF_COOKIE, "", {
    httpOnly: false,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });

  return response;
}