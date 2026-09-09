import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import {
  csrfTokenFromRequest,
  sessionTokenFromRequest,
} from "@/lib/auth/session.cookies";
import { getSessionWithUser, type SessionWithUser } from "@/lib/auth/session";
import { hashToken, timingSafeEqual } from "@/lib/auth/tokens";

export type SessionGuard =
  | { ok: true; session: SessionWithUser }
  | { ok: false; response: NextResponse };

// Requires a valid, unexpired session pointing at an ACTIVE user.
export async function guardSession(
  request: NextRequest,
): Promise<SessionGuard> {
  const session = await getSessionWithUser(sessionTokenFromRequest(request));
  if (!session) {
    return {
      ok: false,
      response: fail(
        "UNAUTHENTICATED",
        "You must be signed in to continue.",
        401,
      ),
    };
  }
  return { ok: true, session };
}

// Requires the session's user to hold one of the allowed roles.
export function ensureRole(
  session: SessionWithUser,
  allowed: readonly string[],
): NextResponse | null {
  if (allowed.includes(session.user.role)) {
    return null;
  }
  return fail(
    "FORBIDDEN",
    "You are not allowed to perform this action.",
    403,
  );
}

// Double-submit CSRF check for state-changing requests: the x-csrf-token
// header must equal the readable csrf cookie AND hash-match the token bound
// to the session row.
export async function guardCsrf(
  request: NextRequest,
  session: SessionWithUser,
): Promise<true | NextResponse> {
  const headerToken = request.headers.get("x-csrf-token");
  const cookieToken = csrfTokenFromRequest(request);

  if (!headerToken || !cookieToken) {
    return fail("CSRF_TOKEN_MISSING", "Security token missing.", 403);
  }

  if (
    !timingSafeEqual(headerToken, cookieToken) ||
    !timingSafeEqual(hashToken(headerToken), session.session.csrfHash)
  ) {
    return fail("CSRF_TOKEN_INVALID", "Security token invalid.", 403);
  }

  return true;
}

// Origin check for endpoints that must work before a CSRF token exists
// (login / register / logout are CSRF-self-protecting). When the browser
// sends an Origin header it must match our own host; non-browser clients
// (no Origin) are permitted.
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }
  try {
    const expectedHost =
      request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      new URL(request.url).host;
    return new URL(origin).host === expectedHost;
  } catch {
    return false;
  }
}