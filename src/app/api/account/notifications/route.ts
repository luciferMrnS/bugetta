import type { NextRequest } from "next/server";
import { fail, ok, readJson } from "@/lib/api";
import { guardSession, guardCsrf, isSameOrigin } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/rateLimit";
import {
  listNotificationsForUser,
  unreadNotificationCount,
  markAllNotificationsRead,
} from "@/lib/notify/service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const markAllSchema = z.object({ action: z.literal("read_all") });

// GET /api/account/notifications — the user's notification bell feed, newest
// first, plus the unread count for a badge.
export async function GET(request: NextRequest) {
  const guard = await guardSession(request);
  if (!guard.ok) {
    return guard.response;
  }

  const [notifications, unreadCount] = await Promise.all([
    listNotificationsForUser(guard.session.user.id, { limit: 50 }),
    unreadNotificationCount(guard.session.user.id),
  ]);
  return ok({ notifications, unreadCount });
}

// POST /api/account/notifications — mark all notifications read (the "clear
// the bell" action).
export async function POST(request: NextRequest) {
  const guard = await guardSession(request);
  if (!guard.ok) {
    return guard.response;
  }
  if (!isSameOrigin(request)) {
    return fail("CSRF_ORIGIN", "Request origin is not allowed.", 403);
  }
  const csrf = await guardCsrf(request, guard.session);
  if (csrf !== true) {
    return csrf;
  }
  if (!rateLimit(`notifications:${guard.session.user.id}`, 20)) {
    return fail("RATE_LIMITED", "Too many actions. Please try again in a few minutes.", 429);
  }

  const body = await readJson(request);
  const parsed = markAllSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid notification action.", 422);
  }

  const updated = await markAllNotificationsRead(guard.session.user.id);
  return ok({ updated });
}