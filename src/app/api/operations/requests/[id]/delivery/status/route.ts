import type { NextRequest } from "next/server";
import { fail, ok, readJson, zodFieldErrors } from "@/lib/api";
import { rateLimit } from "@/lib/rateLimit";
import { guardCsrf, isSameOrigin } from "@/lib/auth/guards";
import { guardOperations } from "@/lib/operations/access";
import { updateDeliveryStatusSchema } from "@/lib/validators/delivery";
import {
  DeliveryError,
  getDeliveryForRequest,
  transitionDeliveryStatus,
} from "@/lib/delivery/service";

export const dynamic = "force-dynamic";

// POST /api/operations/requests/[id]/delivery/status — advance a delivery
// through its guarded state machine. DELIVERED captures proof fields and pins
// the deliveredAt timestamp; every move is appended to the event trail.
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/operations/requests/[id]/delivery/status">,
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

  if (!rateLimit(`delivery:status:${guard.session.user.id}`, 60)) {
    return fail(
      "RATE_LIMITED",
      "Too many delivery actions. Please try again in a few minutes.",
      429,
    );
  }

  const { id } = await ctx.params;

  const current = await getDeliveryForRequest(id);
  if (!current) {
    return fail("NOT_FOUND", "No delivery for this request yet.", 404);
  }

  const body = await readJson(request);
  const parsed = updateDeliveryStatusSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Check the delivery status and try again.", 422, {
      ...zodFieldErrors(parsed.error),
    });
  }

  try {
    const delivery = await transitionDeliveryStatus({
      deliveryId: current.id,
      operatorUserId: guard.session.user.id,
      operatorRole: guard.session.user.role,
      nextStatus: parsed.data.status,
      recipientName: parsed.data.recipientName ?? null,
      proofType: parsed.data.proofType ?? null,
      proofReference: parsed.data.proofReference ?? null,
      proofNote: parsed.data.proofNote ?? null,
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