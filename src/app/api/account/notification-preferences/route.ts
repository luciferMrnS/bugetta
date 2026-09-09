import type { NextRequest } from "next/server";
import { fail, ok, readJson, zodFieldErrors } from "@/lib/api";
import { guardSession, guardCsrf, isSameOrigin } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/rateLimit";
import {
  listNotificationPreferences,
  updateNotificationPreferences,
} from "@/lib/notify/service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const preferencesSchema = z.object({
  email: z.boolean(),
  sms: z.boolean(),
  push: z.boolean(),
  whatsapp: z.boolean(),
});

// GET /api/account/notification-preferences — the user's channel toggles.
export async function GET(request: NextRequest) {
  const guard = await guardSession(request);
  if (!guard.ok) {
    return guard.response;
  }
  const preferences = await listNotificationPreferences(guard.session.user.id);
  return ok({ preferences });
}

// PUT /api/account/notification-preferences — save channel toggles.
export async function PUT(request: NextRequest) {
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
  if (!rateLimit(`notification-preferences:${guard.session.user.id}`, 10)) {
    return fail("RATE_LIMITED", "Too many updates. Please try again in a few minutes.", 429);
  }

  const body = await readJson(request);
  const parsed = preferencesSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid notification preferences.", 422, {
      ...zodFieldErrors(parsed.error),
    });
  }

  const preferences = await updateNotificationPreferences(
    guard.session.user.id,
    parsed.data,
  );
  return ok({ preferences });
}