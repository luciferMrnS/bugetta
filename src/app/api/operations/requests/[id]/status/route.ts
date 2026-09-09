import type { NextRequest } from "next/server";
import { fail, ok, readJson, zodFieldErrors } from "@/lib/api";
import { rateLimit } from "@/lib/rateLimit";
import { guardCsrf, isSameOrigin } from "@/lib/auth/guards";
import { guardOperations } from "@/lib/operations/access";
import { updateStatusSchema } from "@/lib/validators/operations";
import {
  OperationsError,
  transitionRequestStatus,
} from "@/lib/operations/service";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/operations/requests/[id]/status">,
) {
  const guard = await guardOperations(request);
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

  if (!rateLimit(`operations:${guard.session.user.id}`, 120)) {
    return fail(
      "RATE_LIMITED",
      "Too many actions. Please try again in a few minutes.",
      429,
    );
  }

  const { id } = await ctx.params;
  const body = await readJson(request);
  const parsed = updateStatusSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Check the status and try again.", 422, {
      ...zodFieldErrors(parsed.error),
    });
  }

  try {
    const requestOutput = await transitionRequestStatus({
      requestId: id,
      nextStatus: parsed.data.status,
      operatorUserId: guard.session.user.id,
      operatorRole: guard.session.user.role,
    });
    return ok({ request: requestOutput });
  } catch (error) {
    if (error instanceof OperationsError) {
      if (error.code === "NOT_FOUND") {
        return fail("NOT_FOUND", error.message, 404);
      }
      return fail(error.code, error.message, 409);
    }
    throw error;
  }
}