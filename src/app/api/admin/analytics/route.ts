import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { rateLimit } from "@/lib/rateLimit";
import { guardAdmin } from "@/lib/suppliers/access";
import {
  getAnalyticsDashboard,
  DEFAULT_DAYS,
  MAX_DAYS,
} from "@/lib/analytics/service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const daysSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_DAYS)
  .default(DEFAULT_DAYS);

// GET /api/admin/analytics?days=30 — the business-intelligence dashboard.
// Admin-only (operations is deliberately blocked: this is business data).
export async function GET(request: NextRequest) {
  const guard = await guardAdmin(request);
  if (!guard.ok) {
    return guard.response;
  }
  if (!rateLimit(`admin-analytics:${guard.session.user.id}`, 60)) {
    return fail("RATE_LIMITED", "Too many requests. Please try again shortly.", 429);
  }

  const url = new URL(request.url);
  const parsed = daysSchema.safeParse(url.searchParams.get("days"));
  if (!parsed.success) {
    return fail(
      "VALIDATION_ERROR",
      `days must be a whole number between 1 and ${MAX_DAYS}.`,
      422,
    );
  }

  return ok(await getAnalyticsDashboard(parsed.data));
}