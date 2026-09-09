import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { incrementTestCounter } from "@/lib/test/counter";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/auth/roles";
import { hashPassword } from "@/lib/auth/password";
import {
  nextClientIp,
  ORIGIN,
  PASSWORD,
  createAdminAndCollectCookies,
  registerAndCollectCookies,
  resetDatabase,
  withCsrfHeader,
} from "@/lib/test/http";
import { SUPPLIER_STATUS } from "@/lib/suppliers/status";
import { matchSuppliersToRequest, MAX_SEMANTIC_ADJUSTMENT } from "@/lib/suppliers/matching";
import { GET as matchesGetRoute } from "@/app/api/operations/requests/[id]/matches/route";
import { POST as assignRoute } from "@/app/api/operations/requests/[id]/supplier/route";

function copyCookies(from: NextRequest, to: NextRequest): void {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
}

function makeGet(session: NextRequest | null, path: string): NextRequest {
  const req = new NextRequest(`${ORIGIN}${path}`, { method: "GET" });
  if (session) copyCookies(session, req);
  return req;
}

function makePost(
  session: NextRequest,
  csrf: string,
  path: string,
  body: Record<string, unknown>,
): NextRequest {
  const req = new NextRequest(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "x-forwarded-for": nextClientIp(),
    },
    body: JSON.stringify(body),
  });
  if (csrf) withCsrfHeader(req, csrf);
  copyCookies(session, req);
  return req;
}

async function expectBody<T>(value: T | undefined | null, label: string): Promise<T> {
  expect(value).toBeDefined();
  if (value === undefined || value === null) {
    throw new Error(`Missing ${label}`);
  }
  return value;
}

async function seedSupplier(opts: {
  businessName: string;
  categories: string[];
  status?: string;
  description?: string;
  serviceArea?: string;
  operatingHours?: string;
  phone?: string;
}): Promise<string> {
  const email = `match-sup-${incrementTestCounter()}-${Date.now()}@example.com`;
  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword(PASSWORD), name: "Supplier", role: ROLES.SUPPLIER },
  });
  const supplier = await prisma.supplier.create({
    data: {
      userId: user.id,
      businessName: opts.businessName,
      supplierCategories: {
        create: opts.categories.map((categoryKey) => ({ categoryKey })),
      },
      status: opts.status ?? SUPPLIER_STATUS.APPROVED,
      description: opts.description ?? null,
      serviceArea: opts.serviceArea ?? null,
      operatingHours: opts.operatingHours ?? null,
      phone: opts.phone ?? null,
    },
  });
  return supplier.id;
}

async function seedOffering(
  supplierId: string,
  opts: {
    category: string;
    title: string;
    description?: string;
    priceKobo?: number;
    availability?: string;
    location?: string;
    deliveryDetail?: string;
  },
): Promise<string> {
  const offering = await prisma.offering.create({
    data: {
      supplierId,
      category: opts.category,
      title: opts.title,
      description: opts.description ?? null,
      priceKobo: opts.priceKobo ?? null,
      availability: opts.availability ?? null,
      location: opts.location ?? null,
      deliveryDetail: opts.deliveryDetail ?? null,
      isActive: true,
    },
  });
  return offering.id;
}

async function seedRequest(opts?: {
  category?: string;
  description?: string;
  budgetKobo?: number;
  location?: string;
  deliveryDeadline?: Date;
}): Promise<string> {
  const email = `match-cust-${incrementTestCounter()}-${Date.now()}@example.com`;
  const customer = await prisma.user.create({
    data: { email, passwordHash: await hashPassword(PASSWORD), name: "Customer", role: ROLES.CUSTOMER },
  });
  const request = await prisma.request.create({
    data: {
      reference: `REF-${incrementTestCounter()}-${Date.now()}`,
      customerId: customer.id,
      category: opts?.category ?? "HOME_SERVICES",
      summary: "Deep clean a 3-bedroom apartment",
      description:
        opts?.description ??
        "Need a deep cleaning service for a 3-bedroom apartment in Gbagada Lagos. Must include bathroom and kitchen scrubbing, mopping, wiping of all surfaces, and trash removal. Please bring your own cleaning products.",
      budgetKobo: opts?.budgetKobo ?? 10_000_000,
      location: opts?.location ?? "Gbagada, Lagos",
      deliveryDeadline: opts?.deliveryDeadline ?? new Date("2027-06-01T10:00:00.000Z"),
      status: "PAID",
    },
  });
  return request.id;
}

async function seedSupplierRequest(
  supplierId: string,
  requestId: string,
  opts?: { fulfilledAt?: Date } | { declined?: true },
): Promise<string> {
  const row = await prisma.supplierRequest.create({
    data: {
      supplierId,
      requestId,
      status:
        opts && "declined" in opts && opts.declined ? "DECLINED" : "ACCEPTED",
      fulfilledAt: opts && "fulfilledAt" in opts ? opts.fulfilledAt : null,
    },
  });
  return row.id;
}

interface Fixture {
  requestId: string;
  supplierA: string;
  supplierB: string;
  supplierE: string;
  supplierF: string;
  supplierC: string;
  supplierD: string;
}

async function seedFullFixture(): Promise<Fixture> {
  const requestId = await seedRequest();

  const supplierA = await seedSupplier({
    businessName: "Sparkle Clean Ltd",
    categories: ["HOME_SERVICES"],
    description:
      "Professional cleaning company. We do deep cleaning, apartment cleaning and office cleaning in Gbagada, Lagos.",
    serviceArea: "Gbagada, Lagos",
    operatingHours: "Mon-Sat 9am-6pm",
    phone: "08000000001",
  });
  await seedOffering(supplierA, {
    category: "HOME_SERVICES",
    title: "Deep cleaning service",
    description: "Deep clean of an apartment: kitchen, bathroom, surfaces, mopping.",
    priceKobo: 8_000_000,
    availability: "in stock",
    location: "Gbagada, Lagos",
    deliveryDetail: "Produce and deliver cleaning",
  });
  // Reliability history: 3 fulfilled-on-time orders on earlier requests.
  for (let i = 0; i < 3; i += 1) {
    const historyRequest = await seedRequest();
    await seedSupplierRequest(supplierA, historyRequest, {
      fulfilledAt: new Date("2026-05-01T10:00:00.000Z"),
    });
  }

  const supplierB = await seedSupplier({
    businessName: "QuickClean Lagos",
    categories: ["HOME_SERVICES"],
    description: "Cleaning service in Ikeja.",
    serviceArea: "Ikeja, Lagos",
  });
  await seedOffering(supplierB, {
    category: "HOME_SERVICES",
    title: "General cleaning service",
    priceKobo: 15_000_000,
    availability: "on request",
  });

  const supplierE = await seedSupplier({
    businessName: "Budget Clean",
    categories: ["HOME_SERVICES"],
    description: "Cleaning",
    serviceArea: "Surulere, Lagos",
  });
  await seedOffering(supplierE, {
    category: "HOME_SERVICES",
    title: "Budget cleaning",
    priceKobo: 1_000_000,
  });

  const supplierF = await seedSupplier({
    businessName: "Tiny Moppers",
    categories: ["HOME_SERVICES"],
  });

  // Irrelevant category → must be filtered even though approved.
  const supplierC = await seedSupplier({
    businessName: "WrongCat Co",
    categories: ["EVENTS"],
  });
  await seedOffering(supplierC, { category: "EVENTS", title: "Party catering" });

  // Not approved → must be filtered regardless of category.
  const supplierD = await seedSupplier({
    businessName: "Suspended Clean",
    categories: ["HOME_SERVICES"],
    status: SUPPLIER_STATUS.SUSPENDED,
  });
  await seedOffering(supplierD, {
    category: "HOME_SERVICES",
    title: "Deep clean",
    priceKobo: 5_000_000,
  });

  return {
    requestId,
    supplierA,
    supplierB,
    supplierE,
    supplierF,
    supplierC,
    supplierD,
  };
}

describe("supplier matching engine (deterministic, explainable, advisory)", () => {
  beforeEach(async () => {
    incrementTestCounter();
    await resetDatabase();
  });

  it("guards the matches endpoint: anonymous 401, customer 403, operator/admin 200", async () => {
    const requestId = await seedRequest();

    const anon = makeGet(null, `/api/operations/requests/${requestId}/matches`);
    expect((await matchesGetRoute(anon, { params: Promise.resolve({ id: requestId }) })).status).toBe(401);

    const customer = await registerAndCollectCookies();
    const customerRes = await matchesGetRoute(
      makeGet(customer.req, `/api/operations/requests/${requestId}/matches`),
      { params: Promise.resolve({ id: requestId }) },
    );
    expect(customerRes.status).toBe(403);

    const admin = await createAdminAndCollectCookies();
    const res = await matchesGetRoute(
      makeGet(admin.req, `/api/operations/requests/${requestId}/matches`),
      { params: Promise.resolve({ id: requestId }) },
    );
    expect(res.status).toBe(200);
  });

  it("returns 404 for an unknown request", async () => {
    const admin = await createAdminAndCollectCookies();
    const res = await matchesGetRoute(
      makeGet(admin.req, "/api/operations/requests/missing-id/matches"),
      { params: Promise.resolve({ id: "missing-id" }) },
    );
    expect(res.status).toBe(404);
  });

  it("ranks relevant suppliers higher and flags the best as recommended", async () => {
    const fx = await seedFullFixture();
    const admin = await createAdminAndCollectCookies();
    const res = await matchesGetRoute(
      makeGet(admin.req, `/api/operations/requests/${fx.requestId}/matches`),
      { params: Promise.resolve({ id: fx.requestId }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const match = await expectBody(json.data?.match, "match");

    expect(match.recommendedSupplierId).toBe(fx.supplierA);
    expect(match.request.categoryLabel).toBe("Home Services");
    expect(match.request.budgetNaira).toBe(100_000);

    const ids = match.matches.map((m: { supplierId: string }) => m.supplierId);
    expect(ids).toContain(fx.supplierA);
    expect(ids).toContain(fx.supplierB);
    expect(ids).toContain(fx.supplierE);
    expect(ids).not.toContain(fx.supplierF);

    const a = match.matches.find((m: { supplierId: string }) => m.supplierId === fx.supplierA);
    const b = match.matches.find((m: { supplierId: string }) => m.supplierId === fx.supplierB);
    expect(a.isRecommended).toBe(true);
    expect(a.matchScore).toBeGreaterThan(60);
    expect(a.matchScore).toBeGreaterThan(b.matchScore);
    for (const m of match.matches) {
      expect(m.matchScore).toBeGreaterThanOrEqual(match.suggestionThreshold);
    }
  });

  it("filters irrelevant and unapproved suppliers with reasons", async () => {
    const fx = await seedFullFixture();
    const admin = await createAdminAndCollectCookies();
    const res = await matchesGetRoute(
      makeGet(admin.req, `/api/operations/requests/${fx.requestId}/matches`),
      { params: Promise.resolve({ id: fx.requestId }) },
    );
    const json = await res.json();
    const match = await expectBody(json.data?.match, "match");

    const excluded = match.excluded as Array<{ supplierId: string; reasons: string[] }>;
    const c = await expectBody(
      excluded.find((e) => e.supplierId === fx.supplierC),
      "excluded wrong-category supplier",
    );
    const d = await expectBody(
      excluded.find((e) => e.supplierId === fx.supplierD),
      "excluded suspended supplier",
    );
    const f = await expectBody(
      excluded.find((e) => e.supplierId === fx.supplierF),
      "excluded below-threshold supplier",
    );

    expect(c.reasons.some((r) => r.includes("Does not cover"))).toBe(true);
    expect(d.reasons.some((r) => r.includes("not approved"))).toBe(true);
    expect(f.reasons.some((r) => r.includes("suggestion threshold"))).toBe(true);
  });

  it("is explainable: weighted breakdown maps cleanly to the score and each factor explains itself", async () => {
    const fx = await seedFullFixture();
    const admin = await createAdminAndCollectCookies();
    const res = await matchesGetRoute(
      makeGet(admin.req, `/api/operations/requests/${fx.requestId}/matches`),
      { params: Promise.resolve({ id: fx.requestId }) },
    );
    const json = await res.json();
    const match = await expectBody(json.data?.match, "match");

    const a = match.matches.find((m: { supplierId: string }) => m.supplierId === fx.supplierA);
    expect(a.breakdown.length).toBe(8);
    expect(a.explanations.length).toBe(8);
    const contributionSum = a.breakdown.reduce(
      (sum: number, c: { contribution: number }) => sum + c.contribution,
      0,
    );
    // Rounding per component allows ±3 points of drift from the integer score.
    expect(Math.abs(contributionSum - a.matchScore)).toBeLessThanOrEqual(3);

    const rating = a.breakdown.find((c: { key: string }) => c.key === "rating");
    expect(rating.available).toBe(false);
    expect(rating.score).toBe(0.5);
    expect(rating.explanation).toMatch(/No customer ratings/);

    const reliability = a.breakdown.find((c: { key: string }) => c.key === "reliability");
    expect(reliability.available).toBe(true);
    expect(reliability.explanation).toMatch(/fulfilled 3 of 3/);
    expect(a.history.fulfillmentRate).toBe(1);
    expect(a.history.assigned).toBe(3);

    // AI alter-ego note is always null on the read path (advisory only).
    expect(match.aiNote).toBeNull();
    expect(match.maxSemanticAdjustment).toBe(10);

    for (const m of match.matches) {
      expect(m.breakdown.every((c: { explanation: string }) => c.explanation.length > 0)).toBe(true);
    }
  });

  it("marks already-assigned suppliers and recommends the next best unassigned match", async () => {
    const fx = await seedFullFixture();
    await seedSupplierRequest(fx.supplierA, fx.requestId);

    const admin = await createAdminAndCollectCookies();
    const res = await matchesGetRoute(
      makeGet(admin.req, `/api/operations/requests/${fx.requestId}/matches`),
      { params: Promise.resolve({ id: fx.requestId }) },
    );
    const json = await res.json();
    const match = await expectBody(json.data?.match, "match");

    const a = match.matches.find((m: { supplierId: string }) => m.supplierId === fx.supplierA);
    expect(a.alreadyAssigned).toBe(true);
    expect(a.isRecommended).toBe(false);
    expect(match.recommendedSupplierId).not.toBe(fx.supplierA);
    const recommended = match.matches.find((m: { isRecommended: boolean }) => m.isRecommended);
    expect(recommended.alreadyAssigned).toBe(false);
  });

  it("records an operator override note on assignment and flags the assignment", async () => {
    const fx = await seedFullFixture();
    const admin = await createAdminAndCollectCookies();

    // Operator deliberately picks supplier F (below threshold) and overrides.
    const note = "Customer knows this cleaner personally.";
    const assignRes = await assignRoute(
      makePost(
        admin.req,
        admin.csrf,
        `/api/operations/requests/${fx.requestId}/supplier`,
        { supplierId: fx.supplierB, override: true, overrideNote: note },
      ),
      { params: Promise.resolve({ id: fx.requestId }) },
    );
    expect(assignRes.status).toBe(200);
    const assignJson = await assignRes.json();
    const assignment = await expectBody(assignJson.data?.assignment, "assignment");
    expect(assignment.overrideNote).toBe(note);

    const row = await prisma.supplierRequest.findUnique({
      where: { supplierId_requestId: { supplierId: fx.supplierB, requestId: fx.requestId } },
    });
    expect(row?.overrideNote).toBe(note);

    // The recommended pick is not overridden: no overrideNote recorded.
    const normalRes = await assignRoute(
      makePost(
        admin.req,
        admin.csrf,
        `/api/operations/requests/${fx.requestId}/supplier`,
        { supplierId: fx.supplierE },
      ),
      { params: Promise.resolve({ id: fx.requestId }) },
    );
    expect(normalRes.status).toBe(200);
    const normalJson = await normalRes.json();
    const normalAssignment = await expectBody(normalJson.data?.assignment, "assignment");
    expect(normalAssignment.overrideNote).toBeNull();
  });

  it("resists double-assignment and rejects invalid assignment bodies", async () => {
    const fx = await seedFullFixture();
    const admin = await createAdminAndCollectCookies();

    const missing = await assignRoute(
      makePost(admin.req, admin.csrf, `/api/operations/requests/${fx.requestId}/supplier`, {}),
      { params: Promise.resolve({ id: fx.requestId }) },
    );
    expect(missing.status).toBe(422);

    const first = await assignRoute(
      makePost(
        admin.req,
        admin.csrf,
        `/api/operations/requests/${fx.requestId}/supplier`,
        { supplierId: fx.supplierA },
      ),
      { params: Promise.resolve({ id: fx.requestId }) },
    );
    expect(first.status).toBe(200);

    const second = await assignRoute(
      makePost(
        admin.req,
        admin.csrf,
        `/api/operations/requests/${fx.requestId}/supplier`,
        { supplierId: fx.supplierA },
      ),
      { params: Promise.resolve({ id: fx.requestId }) },
    );
    expect(second.status).toBe(409);
  });

  it("caps the semantic AI nudge and never lets it alter hard filters", async () => {
    const fx = await seedFullFixture();
    const baseline = await matchSuppliersToRequest(fx.requestId, {
      now: new Date("2026-01-15T00:00:00.000Z"),
    });
    const baselineA = baseline.matches.find((m) => m.supplierId === fx.supplierA)!;
    const baselineF = baseline.excluded.find((e) => e.supplierId === fx.supplierF);

    // Absurdly large boost clamps to +MAX_SEMANTIC_ADJUSTMENT.
    const boosted = await matchSuppliersToRequest(fx.requestId, {
      now: new Date("2026-01-15T00:00:00.000Z"),
      semanticBoostById: { [fx.supplierA]: 9_999, [fx.supplierF]: 9_999 },
    });
    const boostedA = boosted.matches.find((m) => m.supplierId === fx.supplierA)!;
    expect(boostedA.matchScore).toBeLessThanOrEqual(baselineA.matchScore + MAX_SEMANTIC_ADJUSTMENT + 1);

    // The boost cannot pull a hard-filtered supplier (wrong category / unapproved) back in.
    expect(boosted.matches.some((m) => m.supplierId === fx.supplierC)).toBe(false);
    expect(boosted.matches.some((m) => m.supplierId === fx.supplierD)).toBe(false);

    // It can only *assist* a borderline candidate into the rank list — capped.
    const boostedF = boosted.matches.find((m) => m.supplierId === fx.supplierF);
    const baselineFScore = baselineF
      ? Number((baselineF.reasons[0].match(/\((\d+)\)/) ?? [])[1] ?? 0)
      : 0;
    if (boostedF) {
      expect(boostedF.matchScore).toBeLessThanOrEqual(baselineFScore + MAX_SEMANTIC_ADJUSTMENT + 1);
    }
  });

  it("is deterministic across repeat calls", async () => {
    const fx = await seedFullFixture();
    const admin = await createAdminAndCollectCookies();
    const run = async () => {
      const res = await matchesGetRoute(
        makeGet(admin.req, `/api/operations/requests/${fx.requestId}/matches`),
        { params: Promise.resolve({ id: fx.requestId }) },
      );
      const json = await res.json();
      const match = await expectBody(json.data?.match, "match");
      return match;
    };
    const first = await run();
    const second = await run();
    expect(second.recommendedSupplierId).toBe(first.recommendedSupplierId);
    expect(second.matches.map((m: { supplierId: string }) => m.supplierId)).toEqual(
      first.matches.map((m: { supplierId: string }) => m.supplierId),
    );
  });
});