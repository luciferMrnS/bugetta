import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { guardCsrf, isSameOrigin } from "@/lib/auth/guards";
import { guardAdmin } from "@/lib/suppliers/access";
import { rateLimit } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// DELETE /api/admin/users/[id] — permanently delete a user along with all
// cascading rows (sessions, requests, notifications, supplier profile).
// Guarded so an admin can never delete their own account (keeps at least
// one ADMIN alive).
export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/users/[id]">,
) {
  const guard = await guardAdmin(request);
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
  if (!rateLimit(`admin-users:${guard.session.user.id}`, 60)) {
    return fail("RATE_LIMITED", "Too many actions. Please try again in a few minutes.", 429);
  }

  const { id } = await ctx.params;

  // Never delete your own account through this flow.
  if (id === guard.session.user.id) {
    return fail("SELF_DELETE", "You cannot delete your own account.", 409);
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, status: true, email: true },
  });
  if (!target) {
    return fail("NOT_FOUND", "User not found.", 404);
  }

  await prisma.user.delete({ where: { id } });
  return ok({ deleted: { id, email: target.email, role: target.role, status: target.status } });
}