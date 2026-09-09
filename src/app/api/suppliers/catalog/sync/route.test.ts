import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/auth/roles";
import { hashPassword } from "@/lib/auth/password";
import { SUPPLIER_STATUS } from "@/lib/suppliers/status";
import {
  ORIGIN,
  makeLogin,
  makeRead,
  nextClientIp,
  resetDatabase,
  withCsrfHeader,
  PASSWORD,
} from "@/lib/test/http";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as syncPostRoute, GET as syncGetRoute } from "@/app/api/suppliers/catalog/sync/route";

function copyCookies(from: NextRequest, to: NextRequest): void {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
}

function makeApiRequest(
  session: NextRequest,
  csrf: string,
  path: string,
  method: "GET" | "POST",
  body?: Record<string, unknown>,
): NextRequest {
  const req = new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      origin: ORIGIN,
      "x-forwarded-for": nextClientIp(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (csrf !== "") {
    withCsrfHeader(req, csrf);
  }
  copyCookies(session, req);
  return req;
}

function makeApiGet(session: NextRequest, path: string): NextRequest {
  const req = makeRead(path);
  copyCookies(session, req);
  return req;
}

async function createSupplierWithOffering(): Promise<{
  req: NextRequest;
  csrf: string;
  supplierId: string;
  offeringId: string;
}> {
  const email = `catalog-route-${Date.now()}-${Math.random()}@example.com`;
  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: "Catalog Route Kim",
      role: ROLES.SUPPLIER,
    },
  });
  const supplier = await prisma.supplier.create({
    data: {
      userId: user.id,
      businessName: "Route Catalogue",
      contactName: "Kim",
      supplierCategories: { create: [{ categoryKey: "GROCERIES" }] },
      status: SUPPLIER_STATUS.APPROVED,
    },
  });
  const offering = await prisma.offering.create({
    data: {
      supplierId: supplier.id,
      category: "GROCERIES",
      title: "Route soybeans",
      priceKobo: 300000,
      currency: "NGN",
      images: "[]",
      isActive: true,
    },
  });

  const req = makeLogin(email, PASSWORD);
  const res = await loginRoute(req);
  let csrf = "";
  const setCookies = (res.headers as Headers).getSetCookie();
  for (const cookie of setCookies) {
    const [raw] = cookie.split(";");
    const eq = raw.indexOf("=");
    const name = raw.slice(0, eq).trim();
    const value = raw.slice(eq + 1).trim();
    if (name === "bugetta_session") {
      req.cookies.set({ name, value: decodeURIComponent(value) });
    } else if (name === "bugetta_csrf") {
      csrf = decodeURIComponent(value);
      req.cookies.set({ name, value: csrf });
    }
  }
  return { req, csrf, supplierId: supplier.id, offeringId: offering.id };
}

beforeEach(async () => {
  await resetDatabase();
});

describe("POST /api/suppliers/catalog/sync", () => {
  it("requires an approved supplier session", async () => {
    const res = await syncPostRoute(makeRead("/api/suppliers/catalog/sync"));
    expect(res.status).toBe(401);
  });

  it("rejects malformed entries with a field error", async () => {
    const { req, csrf } = await createSupplierWithOffering();
    const res = await syncPostRoute(
      makeApiRequest(req, csrf, "/api/suppliers/catalog/sync", "POST", {
        provider: "web",
        entries: [],
      }),
    );
    expect(res.status).toBe(422);
  });

  it("syncs stock and returns an audited run", async () => {
    const { req, csrf, offeringId } = await createSupplierWithOffering();
    const res = await syncPostRoute(
      makeApiRequest(req, csrf, "/api/suppliers/catalog/sync", "POST", {
        provider: "web",
        entries: [{ offeringId, quantityAvailable: 12 }],
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data?: { run: { status: string; reference: string; provider: string; entries: Array<{ quantityAvailable: number }> } };
    };
    expect(json.data?.run.status).toBe("COMPLETED");
    expect(json.data?.run.reference).toMatch(/^SYN-/);
    expect(json.data?.run.provider).toBe("web");
    expect(json.data?.run.entries[0].quantityAvailable).toBe(12);

    const stored = await prisma.catalogSync.count({ where: { supplierId: (await prisma.supplier.findFirst())?.id ?? "" } });
    expect(stored).toBe(1);
  });
});

describe("GET /api/suppliers/catalog/sync", () => {
  it("is scoped to the supplier and returns recent runs", async () => {
    const { req, csrf, offeringId } = await createSupplierWithOffering();
    await syncPostRoute(
      makeApiRequest(req, csrf, "/api/suppliers/catalog/sync", "POST", {
        entries: [{ offeringId, quantityAvailable: 5 }],
      }),
    );
    const res = await syncGetRoute(makeApiGet(req, "/api/suppliers/catalog/sync"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data?: { runs: unknown[] } };
    expect(json.data?.runs).toHaveLength(1);
  });
});