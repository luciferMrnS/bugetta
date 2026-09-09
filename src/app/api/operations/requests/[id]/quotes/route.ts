import type { NextRequest } from "next/server";
import { fail, ok, readJson, zodFieldErrors } from "@/lib/api";
import { rateLimit } from "@/lib/rateLimit";
import { guardCsrf, isSameOrigin } from "@/lib/auth/guards";
import { guardOperations } from "@/lib/operations/access";
import { createQuoteSchema } from "@/lib/validators/operations";
import {
  OperationsError,
  createRequestQuote,
} from "@/lib/operations/service";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/operations/requests/[id]/quotes">,
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
  const parsed = createQuoteSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Check the quote and try again.", 422, {
      ...zodFieldErrors(parsed.error),
    });
  }

  try {
    const quote = await createRequestQuote(id, parsed.data);
    return ok({ quote }, { status: 201 });
  } catch (error) {
    if (error instanceof OperationsError) {
      if (error.code === "NOT_FOUND") {
        return fail("NOT_FOUND", error.message, 404);
      }
      return fail(error.code, error.message, 422, {
        optionId: [error.message],
      });
    }
    throw error;
  }
}