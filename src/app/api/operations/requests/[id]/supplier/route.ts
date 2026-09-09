import type { NextRequest } from "next/server";
import { fail, ok, readJson, zodFieldErrors } from "@/lib/api";
import { rateLimit } from "@/lib/rateLimit";
import { guardCsrf, isSameOrigin } from "@/lib/auth/guards";
import { guardOperations } from "@/lib/operations/access";
import { z } from "zod";
import { assignRequestToSupplier, SupplierError } from "@/lib/suppliers/service";

export const dynamic = "force-dynamic";

const assignSchema = z.object({
  supplierId: z.string().min(1, "Supplier is required."),
  override: z.boolean().optional(),
  overrideNote: z
    .string()
    .max(500, "Note must be 500 characters or fewer.")
    .optional()
    .or(z.literal("")),
});

// POST /api/operations/requests/[id]/supplier — assign an approved supplier to
// fulfill a paid request. This is how requests reach suppliers (criterion 4).
// Assignment is always operator-driven: the automated matching engine only
// recommends, so `override` (+ a note) is available when the operator chooses
// a supplier other than the top recommendation.
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/operations/requests/[id]/supplier">,
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
  const parsed = assignSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Select a supplier to assign.", 422, {
      ...zodFieldErrors(parsed.error),
    });
  }

  try {
    const assignment = await assignRequestToSupplier(parsed.data.supplierId, id, {
      override: parsed.data.override,
      overrideNote: parsed.data.overrideNote,
    });
    return ok({ assignment });
  } catch (error) {
    if (error instanceof SupplierError) {
      if (error.code === "NOT_FOUND") return fail("NOT_FOUND", error.message, 404);
      if (error.code === "NOT_APPROVED") return fail(error.code, error.message, 409);
      if (error.code === "ALREADY_ASSIGNED") return fail(error.code, error.message, 409);
      return fail(error.code, error.message, 409);
    }
    throw error;
  }
}