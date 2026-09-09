import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { guardSession, guardCsrf, isSameOrigin } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/rateLimit";
import { markNotificationRead } from "@/lib/notify/service";

export const dynamic = "force-dynamic";

// POST /api/account/notifications/[id] — mark a single notification read.
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/account/notifications/[id]">,
) {
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

  const { id } = await ctx.params;
  const updated = await markNotificationRead(guard.session.user.id, id);
  if (!updated) {
    return fail("NOT_FOUND", "Notification not found.", 404);
  }
  return ok({ updated: true });
}