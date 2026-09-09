import type { NextRequest } from "next/server";
import { fail, ok, readJson, zodFieldErrors } from "@/lib/api";
import { guardAdmin } from "@/lib/suppliers/access";
import { guardCsrf, isSameOrigin } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/rateLimit";
import { reviewFraudFlagSchema } from "@/lib/validators/trust";
import { reviewFraudFlag } from "@/lib/trust/fraud";
import { TrustError } from "@/lib/trust/types";
import { serializeFraudFlag } from "@/lib/trust/serialize";

export const dynamic = "force-dynamic";

// POST /api/admin/trust/flags/[id] — admin reviews a fraud flag: mark it
// REVIEWED (acknowledged, kept on record) or CLEARED (no action needed).
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/trust/flags/[id]">,
) {
  const guard = await guardAdmin(request);
  if (!guard.ok) {
    return guard.response;
  }
  if (!isSameOrigin(request)) {
    return fail("CSRF_ORIGIN", "Request origin is not allowed.", 403);
  }
  const csrfBlocked = await guardCsrf(request, guard.session);
  if (csrfBlocked !== true) {
    return csrfBlocked;
  }
  if (!rateLimit(`admin-trust:${guard.session.user.id}`, 60)) {
    return fail(
      "RATE_LIMITED",
      "Too many actions. Please try again in a few minutes.",
      429,
    );
  }

  const { id } = await ctx.params;
  const raw = await readJson(request);
  const parsed = reviewFraudFlagSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "The review is invalid.", 422, {
      ...zodFieldErrors(parsed.error),
    });
  }

  try {
    const flag = await reviewFraudFlag({
      flagId: id,
      adminUserId: guard.session.user.id,
      status: parsed.data.status,
      note: parsed.data.note,
    });
    return ok({ flag: serializeFraudFlag(flag) });
  } catch (err) {
    if (err instanceof TrustError) {
      if (err.code === "NOT_FOUND") {
        return fail("NOT_FOUND", err.message, 404);
      }
      return fail(err.code, err.message, 409);
    }
    throw err;
  }
}