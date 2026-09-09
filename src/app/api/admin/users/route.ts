import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { rateLimit } from "@/lib/rateLimit";
import { guardAdmin } from "@/lib/suppliers/access";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

const ALL_ROLES: readonly string[] = Object.values(ROLES);

// GET /api/admin/users — list every registered user (admin-only). Optional
// ?role=CUSTOMER|OPERATIONS|ADMIN|SUPPLIER filter for the management UI.
export async function GET(request: NextRequest) {
  const guard = await guardAdmin(request);
  if (!guard.ok) {
    return guard.response;
  }
  if (!rateLimit(`admin-users:${guard.session.user.id}`, 120)) {
    return fail("RATE_LIMITED", "Too many actions. Please try again in a few minutes.", 429);
  }

  const url = new URL(request.url);
  const role = url.searchParams.get("role");
  const where = role && ALL_ROLES.includes(role) ? { role } : undefined;

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      status: true,
      createdAt: true,
      _count: {
        select: {
          requests: true,
          sessions: true,
          notifications: true,
        },
      },
      supplier: { select: { status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return ok({
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      requestCount: user._count.requests,
      sessionCount: user._count.sessions,
      notificationCount: user._count.notifications,
      supplierStatus: user.supplier?.status ?? null,
    })),
  });
}