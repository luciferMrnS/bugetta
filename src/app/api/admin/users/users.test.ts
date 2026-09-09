import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/auth/roles";
import {
  ORIGIN,
  createAdminAndCollectCookies,
  makeRead,
  nextClientIp,
  registerAndCollectCookies,
  resetDatabase,
  withCsrfHeader,
} from "@/lib/test/http";
import { GET as listUsersRoute } from "@/app/api/admin/users/route";
import { DELETE as deleteUserRoute } from "@/app/api/admin/users/[id]/route";

async function bodyOf(response: Response): Promise<
  | { data?: { users?: Array<{ email: string }>; deleted?: unknown }; error?: { code: string; message: string } }
  | null
> {
  return (await response.json()) as never;
}

describe("admin users management", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("lists all users for an admin", async () => {
    const admin = await createAdminAndCollectCookies();
    await registerAndCollectCookies();
    await registerAndCollectCookies();

    const req = makeRead("/api/admin/users");
    for (const cookie of admin.req.cookies.getAll()) {
      req.cookies.set(cookie);
    }
    const res = await listUsersRoute(req);

    expect(res.status).toBe(200);
    const json = await bodyOf(res);
    const users = json?.data?.users ?? [];
    expect(users.length).toBeGreaterThanOrEqual(3);
    expect(users.some((u) => u.email === admin.email)).toBe(true);
  });

  it("requires an admin session (anonymous 401, customer 403)", async () => {
    const anonRes = await listUsersRoute(makeRead("/api/admin/users"));
    expect(anonRes.status).toBe(401);

    const customer = await registerAndCollectCookies();
    const req = makeRead("/api/admin/users");
    for (const cookie of customer.req.cookies.getAll()) {
      req.cookies.set(cookie);
    }
    const customerRes = await listUsersRoute(req);
    expect(customerRes.status).toBe(403);
  });

  it("can delete a user and their cascading data", async () => {
    const admin = await createAdminAndCollectCookies();
    await registerAndCollectCookies();

    const victim = await prisma.user.findFirstOrThrow({ where: { role: ROLES.CUSTOMER } });
    const victimId = victim.id;

    const req = new NextRequest(`${ORIGIN}/api/admin/users/${victimId}`, {
      method: "DELETE",
      headers: { origin: ORIGIN, "x-forwarded-for": nextClientIp() },
    });
    withCsrfHeader(req, admin.csrf);
    for (const cookie of admin.req.cookies.getAll()) {
      req.cookies.set(cookie);
    }

    const res = await deleteUserRoute(req, {
      params: Promise.resolve({ id: victimId }),
    });
    expect(res.status).toBe(200);

    const gone = await prisma.user.findUnique({ where: { id: victimId } });
    expect(gone).toBeNull();
  });

  it("refuses to delete your own account (prevents admin lockout)", async () => {
    const admin = await createAdminAndCollectCookies();
    const onlyAdmin = await prisma.user.findFirstOrThrow({ where: { role: ROLES.ADMIN } });

    const req = new NextRequest(`${ORIGIN}/api/admin/users/${onlyAdmin.id}`, {
      method: "DELETE",
      headers: { origin: ORIGIN, "x-forwarded-for": nextClientIp() },
    });
    withCsrfHeader(req, admin.csrf);
    for (const cookie of admin.req.cookies.getAll()) {
      req.cookies.set(cookie);
    }

    const res = await deleteUserRoute(req, {
      params: Promise.resolve({ id: onlyAdmin.id }),
    });
    expect(res.status).toBe(409);

    const stillThere = await prisma.user.findUnique({ where: { id: onlyAdmin.id } });
    expect(stillThere).not.toBeNull();
  });
});