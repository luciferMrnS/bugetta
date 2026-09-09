import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { incrementTestCounter } from "@/lib/test/counter";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/auth/roles";
import { minorUnitsFromMajor } from "@/lib/money";
import { POST as createRoute, GET as listRoute } from "@/app/api/requests/route";
import { GET as detailRoute } from "@/app/api/requests/[id]/route";
import {
  ORIGIN,
  makeRead,
  nextClientIp,
  registerAndCollectCookies,
  resetDatabase,
  withCsrfHeader,
} from "@/lib/test/http";
import type { RequestOutput } from "@/lib/requests/serialize";

interface SubmitResult {
  status: number;
  request?: RequestOutput;
  code?: string;
}

function inDays(date: Date, days: number): string {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy.toISOString().slice(0, 10);
}

function copyCookies(from: NextRequest, to: NextRequest): void {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
}

function makeApiPost(
  session: NextRequest,
  csrf: string,
  body: Record<string, unknown>,
): NextRequest {
  const req = new NextRequest(`${ORIGIN}/api/requests`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "x-forwarded-for": nextClientIp(),
    },
    body: JSON.stringify(body),
  });
  withCsrfHeader(req, csrf);
  copyCookies(session, req);
  return req;
}

function makeApiGet(session: NextRequest, path: string): NextRequest {
  const req = makeRead(path);
  copyCookies(session, req);
  return req;
}

async function submit(
  session: NextRequest,
  csrf: string,
  body: Record<string, unknown>,
): Promise<SubmitResult> {
  const res = await createRoute(makeApiPost(session, csrf, body));
  const json = (await res.json()) as {
    data?: { request?: RequestOutput };
    error?: { code?: string };
  };
  return { status: res.status, request: json.data?.request, code: json.error?.code };
}

async function detail(session: NextRequest, id: string) {
  return detailRoute(makeApiGet(session, `/api/requests/${id}`), {
    params: Promise.resolve({ id }),
  } as never);
}

describe("api /api/requests in isolated DB", () => {
  beforeEach(async () => {
    incrementTestCounter();
    await resetDatabase();
  });

  it("requires authentication on create, list and detail", async () => {
    const create = await createRoute(
      new NextRequest(`${ORIGIN}/api/requests`, { method: "POST" }),
    );
    expect(create.status).toBe(401);

    const list = await listRoute(makeRead("/api/requests"));
    expect(list.status).toBe(401);

    const detailRes = await detailRoute(
      makeRead("/api/requests/some-id"),
      { params: Promise.resolve({ id: "some-id" }) } as never,
    );
    expect(detailRes.status).toBe(401);
  });

  it("creates a structured request from natural language", async () => {
    const { req, csrf } = await registerAndCollectCookies();
    const { status, request } = await submit(req, csrf, {
      description:
        "I need groceries for a family of four. Rice, chicken, tomatoes, onions and cooking oil. Budget ₦50,000. delivered to Surulere by Saturday.",
    });

    expect(status).toBe(201);
    expect(request).toBeDefined();
    expect(request!.status).toBe("REQUESTED");
    expect(request!.statusEvents).toEqual([
      expect.objectContaining({
        toStatus: "REQUESTED",
        fromStatus: null,
        cause: "created",
      }),
    ]);
    expect(request!.category).toBe("GROCERIES");
    expect(request!.categoryLabel).toBe("Groceries");
    expect(request!.budgetNaira).toBe(50_000);
    expect(request!.items.map((i) => i.name)).toEqual([
      "Rice",
      "chicken",
      "tomatoes",
      "onions",
      "cooking oil",
    ]);
    expect(request!.deliveryDeadline).toBeTruthy();

    // Persisted: the detail endpoint returns the same record.
    const persisted = await detail(req, request!.id);
    expect(persisted.status).toBe(200);
    const persistedJson = (await persisted.json()) as {
      data: { request: RequestOutput };
    };
    expect(persistedJson.data.request.id).toBe(request!.id);
  });

  it("respects explicit structured fields over parsed values", async () => {
    const { req, csrf } = await registerAndCollectCookies();
    const { status, request } = await submit(req, csrf, {
      description: "A black dress for a birthday dinner",
      items: [
        { name: "Black dress", quantity: "Size 12", note: "Prefer cotton" },
      ],
      budgetNaira: 55_000,
      quantity: "1",
      location: "Lekki Phase 1",
      deliveryDeadline: inDays(new Date(), 21),
      instructions: "Contact before delivery",
      images: ["https://example.com/similar-dress.jpg"],
    });

    expect(status).toBe(201);
    expect(request!.category).toBe("FASHION");
    expect(request!.items).toEqual([
      expect.objectContaining({
        name: "Black dress",
        quantity: "Size 12",
        note: "Prefer cotton",
      }),
    ]);
    expect(request!.budgetNaira).toBe(55_000);
    expect(request!.location).toBe("Lekki Phase 1");
    expect(request!.instructions).toBe("Contact before delivery");
    expect(request!.images).toEqual(["https://example.com/similar-dress.jpg"]);

    // Budget is stored in minor units (kobo), never floats.
    const row = await prisma.request.findFirst({
      where: { id: request!.id },
    });
    expect(row?.budgetKobo).toBe(minorUnitsFromMajor(55_000));
  });

  it("lists only the owner's requests, newest first", async () => {
    const { req, csrf } = await registerAndCollectCookies();
    await submit(req, csrf, { description: "I need a phone charger and cable" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await submit(req, csrf, {
      description: "I need a birthday cake, chocolate flavour",
    });
    expect(second.status).toBe(201);

    const other = await registerAndCollectCookies();
    const otherList = await listRoute(makeApiGet(other.req, "/api/requests"));
    const otherJson = (await otherList.json()) as {
      data: { requests: RequestOutput[] };
    };
    expect(otherJson.data.requests).toEqual([]);

    const ownerList = await listRoute(makeApiGet(req, "/api/requests"));
    const ownerJson = (await ownerList.json()) as {
      data: { requests: RequestOutput[] };
    };
    expect(ownerJson.data.requests).toHaveLength(2);
    expect(ownerJson.data.requests[0].id).toBe(second.request!.id);
  });

  it("hides other customers' requests with a 404", async () => {
    const owner = await registerAndCollectCookies();
    const created = await submit(owner.req, owner.csrf, {
      description: "A red handbag for a friend's graduation",
    });
    expect(created.status).toBe(201);

    const intruder = await registerAndCollectCookies();
    const detailRes = await detail(intruder.req, created.request!.id);
    expect(detailRes.status).toBe(404);

    const missing = await detail(owner.req, "does-not-exist");
    expect(missing.status).toBe(404);
  });

  it("validates payloads: short text, past dates, bad budgets, bad image links", async () => {
    const { req, csrf } = await registerAndCollectCookies();

    expect((await submit(req, csrf, { description: "hi" })).status).toBe(422);

    expect(
      (
        await submit(req, csrf, {
          description: "I need something useful delivered again",
          deliveryDeadline: inDays(new Date(), -1),
        })
      ).status,
    ).toBe(422);

    expect(
      (
        await submit(req, csrf, {
          description: "I need something useful delivered again",
          budgetNaira: -100,
        })
      ).status,
    ).toBe(422);

    expect(
      (
        await submit(req, csrf, {
          description: "I need something useful delivered again",
          images: ["javascript:alert(1)"],
        })
      ).status,
    ).toBe(422);
  });

  it("rejects request creation by non-customer roles", async () => {
    const ops = await registerAndCollectCookies();
    await prisma.user.update({
      where: { email: ops.email },
      data: { role: ROLES.OPERATIONS },
    });

    const { status, code } = await submit(ops.req, ops.csrf, {
      description: "I need a drill machine, 500 watt",
    });
    expect(status).toBe(403);
    expect(code).toBe("FORBIDDEN");
  });
});