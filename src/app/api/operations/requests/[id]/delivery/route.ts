import type { NextRequest } from "next/server";
import { fail, ok, readJson, zodFieldErrors } from "@/lib/api";
import { rateLimit } from "@/lib/rateLimit";
import { guardCsrf, isSameOrigin } from "@/lib/auth/guards";
import { guardOperations } from "@/lib/operations/access";
import { createDeliverySchema } from "@/lib/validators/delivery";
import {
  createDeliveryForRequest,
  DeliveryError,
  getDeliveryForRequest,
} from "@/lib/delivery/service";

export const dynamic = "force-dynamic";

// GET /api/operations/requests/[id]/delivery — delivery detail incl. fee
// breakdown, tracking and the immutable event trail. Read-only.
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/operations/requests/[id]/delivery">,
) {
  const guard = await guardOperations(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { id } = await ctx.params;
  const delivery = await getDeliveryForRequest(id);
  if (!delivery) {
    return fail("NOT_FOUND", "No delivery for this request yet.", 404);
  }
  return ok({ delivery });
}

// POST /api/operations/requests/[id]/delivery — assign a delivery to a paid
// request. The provider/drop area choose the fee and ETA, which are computed
// server-side; client-supplied money is never accepted.
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/operations/requests/[id]/delivery">,
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

  if (!rateLimit(`delivery:ops:${guard.session.user.id}`, 60)) {
    return fail(
      "RATE_LIMITED",
      "Too many delivery actions. Please try again in a few minutes.",
      429,
    );
  }

  const { id } = await ctx.params;
  const body = await readJson(request);
  const parsed = createDeliverySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Check the delivery and try again.", 422, {
      ...zodFieldErrors(parsed.error),
    });
  }

  try {
    const delivery = await createDeliveryForRequest({
      requestId: id,
      operatorUserId: guard.session.user.id,
      operatorRole: guard.session.user.role,
      providerKey: parsed.data.provider ?? null,
      priority: parsed.data.priority ?? "STANDARD",
      dropLocation: parsed.data.dropLocation ?? null,
      pickup: parsed.data.pickup ?? null,
      notes: parsed.data.notes ?? null,
    });
    return ok({ delivery });
  } catch (error) {
    if (error instanceof DeliveryError) {
      if (error.code === "NOT_FOUND") {
        return fail("NOT_FOUND", error.message, 404);
      }
      return fail(error.code, error.message, 409);
    }
    throw error;
  }
}