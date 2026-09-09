import type { NextRequest } from "next/server";
import { fail, ok, readJson, zodFieldErrors } from "@/lib/api";
import { rateLimit } from "@/lib/rateLimit";
import { ROLES } from "@/lib/auth/roles";
import {
  ensureRole,
  guardCsrf,
  guardSession,
  isSameOrigin,
} from "@/lib/auth/guards";
import { createRequestSchema } from "@/lib/validators/requests";
import { createRequest, listRequestsForUser } from "@/lib/requests/service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const guard = await guardSession(request);
  if (!guard.ok) {
    return guard.response;
  }

  const roleBlocked = ensureRole(guard.session, [ROLES.CUSTOMER]);
  if (roleBlocked) {
    return roleBlocked;
  }

  if (!isSameOrigin(request)) {
    return fail("CSRF_ORIGIN", "Request origin is not allowed.", 403);
  }

  const csrf = await guardCsrf(request, guard.session);
  if (csrf !== true) {
    return csrf;
  }

  if (!rateLimit(`request-create:user:${guard.session.user.id}`, 30)) {
    return fail(
      "RATE_LIMITED",
      "Too many requests. Please try again in a few minutes.",
      429,
    );
  }

  const body = await readJson(request);
  const parsed = createRequestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Check your request and try again.", 422, {
      ...zodFieldErrors(parsed.error),
    });
  }

  try {
    const requestOutput = await createRequest({
      userId: guard.session.user.id,
      ...parsed.data,
    });
    return ok({ request: requestOutput }, { status: 201 });
  } catch (error) {
    console.error("Failed to create request", error);
    return fail(
      "INTERNAL",
      "We could not save your request. Please try again.",
      500,
    );
  }
}

export async function GET(request: NextRequest) {
  const guard = await guardSession(request);
  if (!guard.ok) {
    return guard.response;
  }

  const requests = await listRequestsForUser(guard.session.user.id);
  return ok({ requests });
}