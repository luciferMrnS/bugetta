import type { NextRequest } from "next/server";
import { fail, ok, readJson, zodFieldErrors } from "@/lib/api";
import { ROLES } from "@/lib/auth/roles";
import { ensureRole, guardSession, guardCsrf, isSameOrigin } from "@/lib/auth/guards";
import { decideOnQuote, type QuoteDecisionAction } from "@/lib/requests/service";
import { decisionSchema } from "@/lib/validators/operations";
import { RequestServiceError } from "@/lib/requests/service";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/requests/[id]/decision">,
) {
  const guard = await guardSession(request);
  if (!guard.ok) {
    return guard.response;
  }

  const roleBlocked = ensureRole(guard.session, [ROLES.CUSTOMER]);
  if (roleBlocked) {
    return roleBlocked;
  }

  const originBlocked = isSameOrigin(request);
  if (!originBlocked) {
    return fail("CSRF_ORIGIN", "Request origin is not allowed.", 403);
  }

  const csrfBlocked = await guardCsrf(request, guard.session);
  if (csrfBlocked !== true) {
    return csrfBlocked;
  }

  const raw = await readJson(request);
  if (!raw) {
    return fail("INVALID_BODY", "A JSON body is required.", 400);
  }

  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) {
    return fail(
      "VALIDATION_ERROR",
      "The decision is invalid.",
      422,
      zodFieldErrors(parsed.error),
    );
  }

  const { id } = await ctx.params;

  try {
    const requestOutput = await decideOnQuote(
      guard.session.user.id,
      id,
      "quoteId" in parsed.data ? parsed.data.quoteId : "0",
      parsed.data.action as QuoteDecisionAction,
    );
    return ok({ request: requestOutput });
  } catch (err) {
    if (err instanceof RequestServiceError) {
      if (err.code === "NOT_FOUND" || err.code === "QUOTE_NOT_FOUND") {
        return fail(err.code, err.message, 404);
      }
      if (
        err.code === "NOT_DECIDABLE" ||
        err.code === "QUOTE_NOT_PENDING"
      ) {
        return fail(err.code, err.message, 409);
      }
    }
    throw err;
  }
}
