import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { destroySession } from "@/lib/auth/session";
import {
  clearSessionCookies,
  sessionTokenFromRequest,
} from "@/lib/auth/session.cookies";
import { getSessionWithUser } from "@/lib/auth/session";
import { guardCsrf, isSameOrigin } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return fail("CSRF_ORIGIN", "Request origin is not allowed.", 403);
  }

  const session = await getSessionWithUser(sessionTokenFromRequest(request));
  if (session) {
    const csrf = await guardCsrf(request, session);
    if (csrf !== true) {
      return csrf;
    }
  }

  await destroySession(sessionTokenFromRequest(request));
  return clearSessionCookies(ok({}));
}