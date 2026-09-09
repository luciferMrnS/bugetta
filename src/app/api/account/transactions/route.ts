import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { ROLES } from "@/lib/auth/roles";
import { ensureRole, guardSession } from "@/lib/auth/guards";
import { customerTransactionHistory } from "@/lib/trust/history";
import { serializeLedgerEntry } from "@/lib/trust/serialize";

export const dynamic = "force-dynamic";

// GET /api/account/transactions — the customer's own transaction history
// (charges and refunds across all their requests), newest first.
export async function GET(request: NextRequest) {
  const guard = await guardSession(request);
  if (!guard.ok) {
    return guard.response;
  }
  const roleBlocked = ensureRole(guard.session, [ROLES.CUSTOMER]);
  if (roleBlocked) {
    return roleBlocked;
  }

  const history = await customerTransactionHistory(guard.session.user.id);
  return ok({ transactions: history.map(serializeLedgerEntry) });
}