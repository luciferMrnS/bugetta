import type { NextRequest, NextResponse } from "next/server";
import { ROLES } from "@/lib/auth/roles";
import {
  ensureRole,
  guardSession,
} from "@/lib/auth/guards";
import type { SessionWithUser } from "@/lib/auth/session";

export type OperationsGuard =
  | { ok: true; session: SessionWithUser }
  | { ok: false; response: NextResponse };

// Session + role check for the operations area. Only OPERATIONS and ADMIN
// may touch the dashboard and its management endpoints.
export async function guardOperations(
  request: NextRequest,
): Promise<OperationsGuard> {
  const guard = await guardSession(request);
  if (!guard.ok) {
    return guard;
  }

  const blocked = ensureRole(guard.session, [ROLES.OPERATIONS, ROLES.ADMIN]);
  if (blocked) {
    return { ok: false, response: blocked };
  }

  return guard;
}