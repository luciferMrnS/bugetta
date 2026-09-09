import type { NextRequest } from "next/server";
import { fail, ok, readJson, zodFieldErrors } from "@/lib/api";
import { guardCsrf, isSameOrigin } from "@/lib/auth/guards";
import { guardSupplier } from "@/lib/suppliers/access";
import { rateLimit } from "@/lib/rateLimit";
import { runCatalogSync, listCatalogSyncs } from "@/lib/suppliers/catalog";
import { SupplierError } from "@/lib/suppliers/service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const syncSchema = z.object({
  provider: z.enum(["api", "web"]).default("api"),
  entries: z
    .array(
      z.object({
        offeringId: z.string().min(1, "offeringId is required."),
        quantityAvailable: z
          .number()
          .int("Quantity must be a whole number.")
          .nonnegative("Quantity must be zero or positive.")
          .nullable(),
      }),
    )
    .min(1, "Supply at least one catalogue entry."),
});

// POST /api/suppliers/catalog/sync — submit batch inventory counts (the
// "supplier ERP / API" surface). Creates an audited CatalogSync run, applies
// stock updates, deactivates zero-stock offers and raises low-stock alerts.
export async function POST(
  request: NextRequest,
) {
  const guard = await guardSupplier(request);
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
  if (!rateLimit(`supplier-catalog-sync:${guard.supplierId}`, 30)) {
    return fail("RATE_LIMITED", "Too many catalogue syncs. Please try again in a few minutes.", 429);
  }

  const body = await readJson(request);
  const parsed = syncSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Check the catalogue entries and try again.", 422, {
      ...zodFieldErrors(parsed.error),
    });
  }

  try {
    const run = await runCatalogSync(guard.supplierId, {
      provider: parsed.data.provider,
      entries: parsed.data.entries,
    });
    return ok({ run });
  } catch (error) {
    if (error instanceof SupplierError) {
      if (error.code === "EMPTY_SYNC") return fail(error.code, error.message, 422);
      return fail(error.code, error.message, 409);
    }
    throw error;
  }
}

// GET /api/suppliers/catalog/sync — recent sync history for this supplier.
export async function GET(request: NextRequest) {
  const guard = await guardSupplier(request);
  if (!guard.ok) {
    return guard.response;
  }
  const runs = await listCatalogSyncs(guard.supplierId);
  return ok({ runs });
}