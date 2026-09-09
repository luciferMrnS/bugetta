import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { incrementTestCounter } from "@/lib/test/counter";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/auth/roles";
import { hashPassword } from "@/lib/auth/password";
import { SUPPLIER_STATUS } from "@/lib/suppliers/status";
import {
  ORIGIN,
  createAdminAndCollectCookies,
  createOperatorAndCollectCookies,
  makeLogin,
  makeRead,
  nextClientIp,
  registerAndCollectCookies,
  resetDatabase,
  withCsrfHeader,
  PASSWORD,
} from "@/lib/test/http";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as registerRoute } from "@/app/api/suppliers/register/route";
import { GET as profileGetRoute } from "@/app/api/suppliers/profile/route";
import { PUT as profilePutRoute } from "@/app/api/suppliers/profile/route";
import { GET as offeringsGetRoute } from "@/app/api/suppliers/offerings/route";
import { POST as offeringsPostRoute } from "@/app/api/suppliers/offerings/route";
import {
  PUT as offeringPutRoute,
  DELETE as offeringDeleteRoute,
} from "@/app/api/suppliers/offerings/[id]/route";
import { GET as requestsGetRoute } from "@/app/api/suppliers/requests/route";
import { POST as requestActionRoute } from "@/app/api/suppliers/requests/[id]/action/route";
import { POST as fulfillRoute } from "@/app/api/suppliers/requests/[id]/fulfill/route";
import { GET as earningsGetRoute } from "@/app/api/suppliers/earnings/route";
import { GET as opportunitiesGetRoute } from "@/app/api/suppliers/opportunities/route";
import { GET as adminListRoute } from "@/app/api/admin/suppliers/route";
import { POST as adminReviewRoute } from "@/app/api/admin/suppliers/[id]/route";
import { POST as assignRoute } from "@/app/api/operations/requests/[id]/supplier/route";
import { POST as createRequestRoute } from "@/app/api/requests/route";
import type { SupplierProfileOutput } from "@/lib/suppliers/serialize";
import type { SupplierOfferingOutput } from "@/lib/suppliers/serialize";
import type { RequestOutput as CustomerRequestOutput } from "@/lib/requests/serialize";

function copyCookies(from: NextRequest, to: NextRequest): void {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
}

function expectBody<T>(value: T | undefined | null, label: string): T {
  expect(value).toBeDefined();
  if (value === undefined || value === null) {
    throw new Error(`Missing ${label}`);
  }
  return value;
}

function makeApiRequest(
  session: NextRequest,
  csrf: string,
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
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

async function createSupplierUser(options?: {
  status?: string;
  categories?: string[];
}): Promise<{
  email: string;
  userId: string;
  supplierId: string;
  req: NextRequest;
  csrf: string;
}> {
  const email = `supplier-test-${incrementTestCounter()}-${Date.now()}@example.com`;
  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: "Supplier Chidi",
      role: ROLES.SUPPLIER,
    },
  });
  const supplier = await prisma.supplier.create({
    data: {
      userId: user.id,
      businessName: "Chidi Supply Co",
      contactName: "Chidi",
      supplierCategories: {
        create: (options?.categories ?? ["FOOD", "GROCERIES"]).map((categoryKey) => ({
          categoryKey,
        })),
      },
      status: options?.status ?? SUPPLIER_STATUS.APPROVED,
    },
  });

  const req = makeLogin(email, PASSWORD);
  const res = await loginRoute(req);
  const csrf = await adoptCookiesFromResponse(req, res);
  return { email, userId: user.id, supplierId: supplier.id, req, csrf };
}

async function adoptCookiesFromResponse(
  request: NextRequest,
  response: Response,
): Promise<string> {
  let csrf = "";
  const setCookies = (response.headers as Headers).getSetCookie();
  for (const cookie of setCookies) {
    const [raw] = cookie.split(";");
    const eq = raw.indexOf("=");
    const name = raw.slice(0, eq).trim();
    const value = raw.slice(eq + 1).trim();
    if (name === "bugetta_session") {
      request.cookies.set({ name, value: decodeURIComponent(value) });
    } else if (name === "bugetta_csrf") {
      csrf = decodeURIComponent(value);
      request.cookies.set({ name, value: csrf });
    }
  }
  return csrf;
}

async function createPaidRequestForCategory(
  description: string,
): Promise<{ id: string; ref: string }> {
  const { req, csrf } = await registerAndCollectCookies();
  const res = await createRequestRoute(
    makeApiRequest(req, csrf, "/api/requests", "POST", { description }),
  );
  expect(res.status).toBe(201);
  const json = (await res.json()) as { data?: { request?: CustomerRequestOutput } };
  const request = expectBody(json.data?.request, "request");
  // Simulate the payment system landing the request in PAID (as the webhook
  // does in the payments phase).
  await prisma.request.update({
    where: { id: request.id },
    data: { status: "PAID" },
  });
  return { id: request.id, ref: request.reference };
}

describe("supplier system in isolated DB", () => {
  beforeEach(async () => {
    incrementTestCounter();
    await resetDatabase();
  });

  // ─── Onboarding ─────────────────────────────────────────────────────────

  it("onboards a supplier: creates a SUPPLIER user and a PENDING profile", async () => {
    const admin = await prisma.user.create({
      data: {
        email: `admin-${incrementTestCounter()}-${Date.now()}@example.com`,
        passwordHash: await hashPassword(PASSWORD),
        name: "Queue Manager",
        role: ROLES.ADMIN,
        status: "ACTIVE",
      },
    });

    const req = new NextRequest(`${ORIGIN}/api/suppliers/register`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        "x-forwarded-for": nextClientIp(),
      },
      body: JSON.stringify({
        name: "Ngozi Foods",
        email: `onboard-${incrementTestCounter()}-${Date.now()}@example.com`,
        password: PASSWORD,
        businessName: "Ngozi Foods",
        contactName: "Ngozi",
        phone: "0801000000",
        whatsapp: "0801111111",
        categories: ["FOOD"],
        serviceArea: "Ikeja, Lagos",
        operatingHours: "Mon–Sat 8am–6pm",
        paymentDetails: "Bank: GTB · Acct 0123456789",
      }),
    });
    const res = await registerRoute(req);
    expect(res.status).toBe(201);
    const json = (await res.json()) as {
      data?: { user?: { role?: string; id?: string }; supplier?: SupplierProfileOutput };
    };
    expect(json.data?.user?.role).toBe("SUPPLIER");
    const supplier = expectBody(json.data?.supplier, "supplier");
    expect(supplier.businessName).toBe("Ngozi Foods");
    expect(supplier.status).toBe("PENDING");
    expect(supplier.statusLabel).toBe("Awaiting review");
    expect(supplier.paymentDetails).toContain("GTB");
    expect(supplier.categoryLabels).toEqual(["Food & Drinks"]);

    // Every signup starts unverified: a one-hour verification token exists.
    const userId = json.data?.user?.id;
    expect(userId).toBeDefined();
    const token = await prisma.emailVerificationToken.findFirst({
      where: { userId: userId as string },
    });
    expect(token).not.toBeNull();
    expect(token?.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // Active admins are notified that the application is in their queue.
    const notice = await prisma.notification.findFirst({
      where: { kind: "SUPPLIER_APPLICATION", userId: admin.id },
      orderBy: { createdAt: "desc" },
    });
    expect(notice).not.toBeNull();
    expect(notice?.reference).toBe(supplier.id);
    expect(notice?.title).toContain("Ngozi Foods");
    expect(notice?.body).toContain("Review and approve");
  });

  it("rejects a duplicate supplier email and invalid input", async () => {
    const email = `dup-${incrementTestCounter()}-${Date.now()}@example.com`;
    const base = {
      name: "Dup",
      email,
      password: PASSWORD,
      businessName: "Dup Business",
    };
    const first = await registerRoute(
      new NextRequest(`${ORIGIN}/api/suppliers/register`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN,
          "x-forwarded-for": nextClientIp(),
        },
        body: JSON.stringify(base),
      }),
    );
    expect(first.status).toBe(201);

    const second = await registerRoute(
      new NextRequest(`${ORIGIN}/api/suppliers/register`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN,
          "x-forwarded-for": nextClientIp(),
        },
        body: JSON.stringify(base),
      }),
    );
    expect(second.status).toBe(409);
    expect(((await second.json()) as { error?: { code?: string } }).error?.code).toBe(
      "EMAIL_TAKEN",
    );

    const invalid = await registerRoute(
      new NextRequest(`${ORIGIN}/api/suppliers/register`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN,
          "x-forwarded-for": nextClientIp(),
        },
        body: JSON.stringify({ name: "X", email: "not-an-email", password: "short", businessName: "" }),
      }),
    );
    expect(invalid.status).toBe(422);
  });

  it("a newly registered supplier can read their profile but not operate yet", async () => {
    const { req } = await createSupplierUser({ status: SUPPLIER_STATUS.PENDING });
    // Profile readable while pending (used by the onboarding screen).
    const profile = await profileGetRoute(makeApiGet(req, "/api/suppliers/profile"));
    expect(profile.status).toBe(200);

    const offerings = await offeringsGetRoute(makeApiGet(req, "/api/suppliers/offerings"));
    expect(offerings.status).toBe(403);
    expect(((await offerings.json()) as { error?: { code?: string } }).error?.code).toBe(
      "NOT_APPROVED",
    );

    const requests = await requestsGetRoute(makeApiGet(req, "/api/suppliers/requests"));
    expect(requests.status).toBe(403);
  });

  // ─── Role / consent guards ──────────────────────────────────────────────

  it("rejects anonymous, customer and operations users from supplier endpoints", async () => {
    const anon = await offeringsGetRoute(makeRead("/api/suppliers/offerings"));
    expect(anon.status).toBe(401);

    const customer = await registerAndCollectCookies();
    const customerOfferings = await offeringsGetRoute(
      makeApiGet(customer.req, "/api/suppliers/offerings"),
    );
    expect(customerOfferings.status).toBe(403);
    expect(
      ((await customerOfferings.json()) as { error?: { code?: string } }).error?.code,
    ).toBe("FORBIDDEN");

    // SUPPLIER user with no profile row yet.
    await prisma.user.create({
      data: {
        email: `noprofile-${incrementTestCounter()}-${Date.now()}@example.com`,
        passwordHash: await hashPassword(PASSWORD),
        name: "No Profile",
        role: ROLES.SUPPLIER,
      },
    });
    const { req } = await createSupplierUser();
    // A SUPPLIER can never reach ADMIN endpoints.
    const adminList = await adminListRoute(makeApiGet(req, "/api/admin/suppliers"));
    expect(adminList.status).toBe(403);
    expect(((await adminList.json()) as { error?: { code?: string } }).error?.code).toBe(
      "FORBIDDEN",
    );
  });

  it("rejects non-admin users from admin review endpoints", async () => {
    const customer = await registerAndCollectCookies();
    const customerReview = await adminReviewRoute(
      makeApiRequest(customer.req, customer.csrf, "/api/admin/suppliers/x", "POST", {
        action: "approve",
      }),
      { params: Promise.resolve({ id: "x" }) } as never,
    );
    expect(customerReview.status).toBe(403);

    const ops = await createOperatorAndCollectCookies();
    const opsReview = await adminReviewRoute(
      makeApiRequest(ops.req, ops.csrf, "/api/admin/suppliers/x", "POST", {
        action: "approve",
      }),
      { params: Promise.resolve({ id: "x" }) } as never,
    );
    expect(opsReview.status).toBe(403);
  });

  // ─── Admin review ───────────────────────────────────────────────────────

  it("admin approves, rejects and suspends supplier registrations", async () => {
    const pending = await createSupplierUser({ status: SUPPLIER_STATUS.PENDING });

    const admin = await createAdminAndCollectCookies();

    // Admin sees the pending application.
    const pendingList = await adminListRoute(makeApiGet(admin.req, "/api/admin/suppliers?status=PENDING"));
    expect(pendingList.status).toBe(200);
    const pendingJson = (await pendingList.json()) as {
      data?: { suppliers?: SupplierProfileOutput[] };
    };
    expect(pendingJson.data?.suppliers?.some((s) => s.id === pending.supplierId)).toBe(true);

    // Approve it.
    const approveRes = await adminReviewRoute(
      makeApiRequest(
        admin.req,
        admin.csrf,
        `/api/admin/suppliers/${pending.supplierId}`,
        "POST",
        { action: "approve" },
      ),
      { params: Promise.resolve({ id: pending.supplierId }) } as never,
    );
    expect(approveRes.status).toBe(200);
    const approveJson = (await approveRes.json()) as {
      data?: { supplier?: SupplierProfileOutput };
    };
    const approved = expectBody(approveJson.data?.supplier, "supplier");
    expect(approved.status).toBe(SUPPLIER_STATUS.APPROVED);
    expect(approved.approvedAt).not.toBeNull();

    // The supplier can now operate.
    const offerings = await offeringsGetRoute(makeApiGet(pending.req, "/api/suppliers/offerings"));
    expect(offerings.status).toBe(200);

    // Suspend it — supplier can no longer operate.
    const suspendRes = await adminReviewRoute(
      makeApiRequest(
        admin.req,
        admin.csrf,
        `/api/admin/suppliers/${pending.supplierId}`,
        "POST",
        { action: "suspend" },
      ),
      { params: Promise.resolve({ id: pending.supplierId }) } as never,
    );
    expect(suspendRes.status).toBe(200);
    const suspendedOfferings = await offeringsGetRoute(makeApiGet(pending.req, "/api/suppliers/offerings"));
    expect(suspendedOfferings.status).toBe(403);
    expect(
      ((await suspendedOfferings.json()) as { error?: { code?: string } }).error?.code,
    ).toBe("NOT_APPROVED");

    // Reject a different supplier.
    const second = await createSupplierUser({ status: SUPPLIER_STATUS.PENDING });
    const rejectRes = await adminReviewRoute(
      makeApiRequest(
        admin.req,
        admin.csrf,
        `/api/admin/suppliers/${second.supplierId}`,
        "POST",
        { action: "reject" },
      ),
      { params: Promise.resolve({ id: second.supplierId }) } as never,
    );
    expect(rejectRes.status).toBe(200);
    const rejectJson = (await rejectRes.json()) as { data?: { supplier?: SupplierProfileOutput } };
    expect(rejectJson.data?.supplier?.status).toBe(SUPPLIER_STATUS.REJECTED);
  });

  it("admin cannot review a supplier that does not exist", async () => {
    const admin = await createAdminAndCollectCookies();
    const res = await adminReviewRoute(
      makeApiRequest(admin.req, admin.csrf, "/api/admin/suppliers/missing", "POST", {
        action: "approve",
      }),
      { params: Promise.resolve({ id: "missing" }) } as never,
    );
    expect(res.status).toBe(404);
  });

  // ─── Profile editing ────────────────────────────────────────────────────

  it("supplier updates their own profile", async () => {
    const { req, csrf } = await createSupplierUser();
    const res = await profilePutRoute(
      makeApiRequest(req, csrf, "/api/suppliers/profile", "PUT", {
        businessName: "Chidi Supply Co 2",
        contactName: "Chidi",
        description: "Fresh produce, delivered same-day in Ikeja.",
        categories: ["GROCERIES"],
        serviceArea: "Ikeja & environs",
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data?: { supplier?: SupplierProfileOutput } };
    const profile = expectBody(json.data?.supplier, "supplier");
    expect(profile.businessName).toBe("Chidi Supply Co 2");
    expect(profile.description).toContain("Ikeja");
    expect(profile.categoryLabels).toEqual(["Groceries"]);
  });

  // ─── Offerings ──────────────────────────────────────────────────────────

  it("supplier creates, lists, updates and removes their own offerings", async () => {
    const { req, csrf } = await createSupplierUser();

    const createRes = await offeringsPostRoute(
      makeApiRequest(req, csrf, "/api/suppliers/offerings", "POST", {
        category: "FOOD",
        title: "Jollof rice with chicken",
        description: "Serves 4, party packs available",
        priceNaira: 3500,
        availability: "Made to order",
        location: "Ikeja, Lagos",
        deliveryDetail: "Delivered or pickup",
        images: [],
        isActive: true,
      }),
    );
    expect(createRes.status).toBe(201);
    const created = expectBody(
      ((await createRes.json()) as { data?: { offering?: SupplierOfferingOutput } })
        .data?.offering,
      "offering",
    );
    expect(created.priceNaira).toBe(3500);
    expect(created.categoryLabel).toBe("Food & Drinks");

    // Unpriced offering: informal suppliers may not set a price.
    const unpriced = await offeringsPostRoute(
      makeApiRequest(req, csrf, "/api/suppliers/offerings", "POST", {
        category: "HOME_SERVICES",
        title: "Generator repairs",
      }),
    );
    expect(unpriced.status).toBe(201);
    const unpricedOffering = expectBody(
      ((await unpriced.json()) as { data?: { offering?: SupplierOfferingOutput } })
        .data?.offering,
      "unpriced offering",
    );
    expect(unpricedOffering.priceNaira).toBeNull();

    const listRes = await offeringsGetRoute(makeApiGet(req, "/api/suppliers/offerings"));
    expect(listRes.status).toBe(200);
    const listJson = (await listRes.json()) as { data?: { offerings?: SupplierOfferingOutput[] } };
    expect(listJson.data?.offerings?.map((o) => o.id)).toEqual(
      expect.arrayContaining([created.id, unpricedOffering.id]),
    );

    // Update.
    const updateRes = await offeringPutRoute(
      makeApiRequest(req, csrf, `/api/suppliers/offerings/${created.id}`, "PUT", {
        priceNaira: 4000,
        isActive: false,
      }),
      { params: Promise.resolve({ id: created.id }) } as never,
    );
    expect(updateRes.status).toBe(200);
    const updated = expectBody(
      ((await updateRes.json()) as { data?: { offering?: SupplierOfferingOutput } })
        .data?.offering,
      "updated offering",
    );
    expect(updated.priceNaira).toBe(4000);
    expect(updated.isActive).toBe(false);

    // Delete.
    const deleteRes = await offeringDeleteRoute(
      makeApiRequest(req, csrf, `/api/suppliers/offerings/${unpricedOffering.id}`, "DELETE"),
      { params: Promise.resolve({ id: unpricedOffering.id }) } as never,
    );
    expect(deleteRes.status).toBe(200);

    const afterDelete = await offeringsGetRoute(makeApiGet(req, "/api/suppliers/offerings"));
    const afterDeleteJson = (await afterDelete.json()) as {
      data?: { offerings?: SupplierOfferingOutput[] };
    };
    expect(afterDeleteJson.data?.offerings).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: unpricedOffering.id })]),
    );
  });

  it("does not allow a supplier to touch another supplier's offering", async () => {
    const supplierA = await createSupplierUser();
    const supplierB = await createSupplierUser();
    const { csrf } = supplierA;

    const createRes = await offeringsPostRoute(
      makeApiRequest(supplierA.req, csrf, "/api/suppliers/offerings", "POST", {
        category: "FOOD",
        title: "A's secret recipe",
      }),
    );
    const offering = expectBody(
      ((await createRes.json()) as { data?: { offering?: SupplierOfferingOutput } })
        .data?.offering,
      "offering",
    );

    // B cannot see A's offering via GET (their list only returns own rows).
    const bList = await offeringsGetRoute(makeApiGet(supplierB.req, "/api/suppliers/offerings"));
    const bListJson = (await bList.json()) as {
      data?: { offerings?: SupplierOfferingOutput[] };
    };
    expect(bListJson.data?.offerings?.some((o) => o.id === offering.id)).toBe(false);

    // B cannot read/update/delete A's offering by id.
    const bUpdate = await offeringPutRoute(
      makeApiRequest(supplierB.req, supplierB.csrf, `/api/suppliers/offerings/${offering.id}`, "PUT", {
        title: "stolen",
      }),
      { params: Promise.resolve({ id: offering.id }) } as never,
    );
    expect(bUpdate.status).toBe(404);

    const bDelete = await offeringDeleteRoute(
      makeApiRequest(supplierB.req, supplierB.csrf, `/api/suppliers/offerings/${offering.id}`, "DELETE"),
      { params: Promise.resolve({ id: offering.id }) } as never,
    );
    expect(bDelete.status).toBe(404);
  });

  it("rejects invalid offering categories", async () => {
    const { req, csrf } = await createSupplierUser();
    const res = await offeringsPostRoute(
      makeApiRequest(req, csrf, "/api/suppliers/offerings", "POST", {
        category: "NOT_A_CATEGORY",
        title: "Thing",
      }),
    );
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error?: { code?: string } }).error?.code).toBe(
      "INVALID_CATEGORY",
    );
  });

  // ─── Requests, assignments, fulfillment, earnings ──────────────────────

  it("supplier receives, accepts and fulfills their assigned requests", async () => {
    const supplier = await createSupplierUser();
    const { csrf, req } = supplier;

    const paid = await createPaidRequestForCategory(
      "I need fresh groceries delivered to Ikeja tomorrow",
    );

    // Operations assigns the paid request to the approved supplier.
    const ops = await createOperatorAndCollectCookies();
    const assignRes = await assignRoute(
      makeApiRequest(
        ops.req,
        ops.csrf,
        `/api/operations/requests/${paid.id}/supplier`,
        "POST",
        { supplierId: supplier.supplierId },
      ),
      { params: Promise.resolve({ id: paid.id }) } as never,
    );
    expect(assignRes.status).toBe(200);

    // The supplier sees their own assignment.
    const requestsRes = await requestsGetRoute(makeApiGet(req, "/api/suppliers/requests"));
    expect(requestsRes.status).toBe(200);
    const requestsJson = (await requestsRes.json()) as {
      data?: { requests?: Array<{ id: string; requestId: string; status: string }> };
    };
    const assignment = expectBody(
      requestsJson.data?.requests?.find((r) => r.requestId === paid.id),
      "assignment",
    );
    expect(assignment.status).toBe("ASSIGNED");

    // Accept.
    const acceptRes = await requestActionRoute(
      makeApiRequest(req, csrf, `/api/suppliers/requests/${assignment.id}/action`, "POST", {
        action: "accept",
      }),
      { params: Promise.resolve({ id: assignment.id }) } as never,
    );
    expect(acceptRes.status).toBe(200);
    expect(
      ((await acceptRes.json()) as { data?: { request?: { status?: string } } }).data?.request
        ?.status,
    ).toBe("ACCEPTED");

    // Fulfill and record earnings.
    const fulfillRes = await fulfillRoute(
      makeApiRequest(req, csrf, `/api/suppliers/requests/${assignment.id}/fulfill`, "POST", {
        earnedNaira: 150_000,
        notes: "Delivered to customer at 14:30",
      }),
      { params: Promise.resolve({ id: assignment.id }) } as never,
    );
    expect(fulfillRes.status).toBe(200);
    const fulfilled = expectBody(
      ((await fulfillRes.json()) as { data?: { request?: { fulfilledAt?: string | null; earnedNaira?: number | null } } })
        .data?.request,
      "fulfilled request",
    );
    expect(fulfilled.fulfilledAt).not.toBeNull();
    expect(fulfilled.earnedNaira).toBe(150_000);

    // Earnings ledger reflects the fulfillment.
    const earningsRes = await earningsGetRoute(makeApiGet(req, "/api/suppliers/earnings"));
    expect(earningsRes.status).toBe(200);
    const earningsJson = (await earningsRes.json()) as {
      data?: { earnings?: Array<{ amountNaira: number; status: string }>; summary?: { totalEarnedNaira: number } };
    };
    expect(earningsJson.data?.earnings?.some((e) => e.amountNaira === 150_000)).toBe(true);
    expect(earningsJson.data?.summary?.totalEarnedNaira).toBe(150_000);
  });

  it("a supplier cannot accept or fulfill another supplier's assigned request", async () => {
    const supplierA = await createSupplierUser();
    const supplierB = await createSupplierUser();

    const paid = await createPaidRequestForCategory(
      "I need a birthday cake for 40 guests in Surulere",
    );

    const supplierBUser = await prisma.supplier.findUnique({
      where: { id: supplierB.supplierId },
      select: { user: { select: { email: true } } },
    });
    void supplierBUser;

    // Assign to A.
    const ops = await createOperatorAndCollectCookies();
    const assignRes = await assignRoute(
      makeApiRequest(
        ops.req,
        ops.csrf,
        `/api/operations/requests/${paid.id}/supplier`,
        "POST",
        { supplierId: supplierA.supplierId },
      ),
      { params: Promise.resolve({ id: paid.id }) } as never,
    );
    expect(assignRes.status).toBe(200);
    const assignment = expectBody(
      ((await assignRes.json()) as { data?: { assignment?: { id: string; requestId: string } } })
        .data?.assignment,
      "assignment",
    );

    // B sees no requests.
    const bRequests = await requestsGetRoute(makeApiGet(supplierB.req, "/api/suppliers/requests"));
    const bRequestsJson = (await bRequests.json()) as {
      data?: { requests?: Array<{ requestId: string }> };
    };
    expect(bRequestsJson.data?.requests?.some((r) => r.requestId === paid.id)).toBe(false);

    // B acting on A's assignment is denied (404 — existence is not revealed).
    const bAccept = await requestActionRoute(
      makeApiRequest(supplierB.req, supplierB.csrf, `/api/suppliers/requests/${assignment.id}/action`, "POST", {
        action: "accept",
      }),
      { params: Promise.resolve({ id: assignment.id }) } as never,
    );
    expect(bAccept.status).toBe(404);

    const bFulfill = await fulfillRoute(
      makeApiRequest(supplierB.req, supplierB.csrf, `/api/suppliers/requests/${assignment.id}/fulfill`, "POST", {
        earnedNaira: 999,
      }),
      { params: Promise.resolve({ id: assignment.id }) } as never,
    );
    expect(bFulfill.status).toBe(404);
  });

  it("rejects invalid supplier request actions and only accepts assigned ones", async () => {
    const supplier = await createSupplierUser();
    const { csrf, req } = supplier;

    const paid = await createPaidRequestForCategory(
      "I need a laptop repair service in Yaba",
    );

    const ops = await createOperatorAndCollectCookies();
    const assignRes = await assignRoute(
      makeApiRequest(
        ops.req,
        ops.csrf,
        `/api/operations/requests/${paid.id}/supplier`,
        "POST",
        { supplierId: supplier.supplierId },
      ),
      { params: Promise.resolve({ id: paid.id }) } as never,
    );
    const assignment = expectBody(
      ((await assignRes.json()) as { data?: { assignment?: { id: string } } }).data?.assignment,
      "assignment",
    );

    // Fulfilling a non-accepted request is invalid.
    const earlyFulfill = await fulfillRoute(
      makeApiRequest(req, csrf, `/api/suppliers/requests/${assignment.id}/fulfill`, "POST", {
        earnedNaira: 100,
      }),
      { params: Promise.resolve({ id: assignment.id }) } as never,
    );
    expect(earlyFulfill.status).toBe(409);
    expect(
      ((await earlyFulfill.json()) as { error?: { code?: string } }).error?.code,
    ).toBe("INVALID_TRANSITION");

    // Invalid action value.
    const badAction = await requestActionRoute(
      makeApiRequest(req, csrf, `/api/suppliers/requests/${assignment.id}/action`, "POST", {
        action: "maybe",
      }),
      { params: Promise.resolve({ id: assignment.id }) } as never,
    );
    expect(badAction.status).toBe(422);
  });

  // ─── Opportunities ─────────────────────────────────────────────────────

  it("lists inbound opportunities matching the supplier's categories", async () => {
    const supplier = await createSupplierUser({ categories: ["FOOD"] });
    const { req } = supplier;

    const food = await createPaidRequestForCategory("I need jollof rice for 50 guests tomorrow");
    const groceries = await createPaidRequestForCategory("I need review-grade groceries, gulder?");

    const oppsRes = await opportunitiesGetRoute(makeApiGet(req, "/api/suppliers/opportunities"));
    expect(oppsRes.status).toBe(200);
    const oppsJson = (await oppsRes.json()) as { data?: { opportunities?: Array<{ id: string }> } };

    // The FOOD request shows as an opportunity; the other categories are not
    // guaranteed to match a role scan — only "groceries" would.
    const ids = oppsJson.data?.opportunities?.map((o) => o.id) ?? [];
    expect(ids).toContain(food.id);
    expect(ids).not.toContain(groceries.id);
  });
});