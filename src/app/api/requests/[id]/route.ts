import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { ROLES } from "@/lib/auth/roles";
import { ensureRole, guardSession } from "@/lib/auth/guards";
import { getRequestForUser } from "@/lib/requests/service";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/requests/[id]">,
) {
  const guard = await guardSession(request);
  if (!guard.ok) {
    return guard.response;
  }

  const roleBlocked = ensureRole(guard.session, [ROLES.CUSTOMER]);
  if (roleBlocked) {
    return roleBlocked;
  }

  const { id } = await ctx.params;
  const requestOutput = await getRequestForUser(guard.session.user.id, id);
  if (!requestOutput) {
    return fail("NOT_FOUND", "Request not found.", 404);
  }

  return ok({ request: requestOutput });
}