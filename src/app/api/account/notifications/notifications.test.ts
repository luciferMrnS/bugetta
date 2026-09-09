import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/auth/roles";
import { hashPassword } from "@/lib/auth/password";
import {
  ORIGIN,
  makeRead,
  nextClientIp,
  registerAndCollectCookies,
  resetDatabase,
  withCsrfHeader,
  PASSWORD,
} from "@/lib/test/http";
import { GET as notificationsGetRoute, POST as notificationsPostRoute } from "@/app/api/account/notifications/route";
import { POST as notificationReadRoute } from "@/app/api/account/notifications/[id]/route";
import { GET as prefsGetRoute, PUT as prefsPutRoute } from "@/app/api/account/notification-preferences/route";

function makeApiRequest(
  session: NextRequest,
  csrf: string,
  path: string,
  method: "GET" | "POST" | "PUT",
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
  for (const cookie of session.cookies.getAll()) {
    req.cookies.set(cookie);
  }
  return req;
}

function makeApiGet(session: NextRequest, path: string): NextRequest {
  const req = makeRead(path);
  for (const cookie of session.cookies.getAll()) {
    req.cookies.set(cookie);
  }
  return req;
}

async function seedNotification(userId: string, kind: string, reference: string): Promise<string> {
  const row = await prisma.notification.create({
    data: {
      userId,
      kind,
      reference,
      title: `Test ${kind}`,
      body: `Body for ${reference}`,
      channels: JSON.stringify(["email"]),
      status: "SENT",
    },
  });
  return row.id;
}

beforeEach(async () => {
  await resetDatabase();
});

describe("GET /api/account/notifications", () => {
  it("requires a session", async () => {
    const res = await notificationsGetRoute(makeRead("/api/account/notifications"));
    expect(res.status).toBe(401);
  });

  it("lists the signed-in user's notifications newest first with an unread count", async () => {
    const { req } = await registerAndCollectCookies();
    const userId = (await prisma.user.findFirst({ where: { role: ROLES.CUSTOMER } }))?.id;
    expect(userId).toBeDefined();

    await seedNotification(userId as string, "REQUEST_CREATED", "REQ-1");
    await seedNotification(userId as string, "PAYMENT_PAID", "REQ-2");
    await prisma.notification.updateMany({
      where: { reference: "REQ-2" },
      data: { readAt: new Date() },
    });

    const res = await notificationsGetRoute(makeApiGet(req, "/api/account/notifications"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data?: { notifications: Array<{ kind: string; reference: string; readAt: string | null }>; unreadCount: number };
    };
    expect(json.data?.unreadCount).toBe(1);
    expect(json.data?.notifications).toHaveLength(2);
    expect(json.data?.notifications[0].reference).toBe("REQ-2");
  });
});

describe("POST /api/account/notifications (mark all read)", () => {
  it("marks all notifications read and returns the count", async () => {
    const { req, csrf } = await registerAndCollectCookies();
    const userId = (await prisma.user.findFirst({ where: { role: ROLES.CUSTOMER } }))?.id as string;
    await seedNotification(userId, "REQUEST_CREATED", "REQ-A");
    await seedNotification(userId, "LOW_STOCK", "REQ-B");

    const res = await notificationsPostRoute(
      makeApiRequest(req, csrf, "/api/account/notifications", "POST", { action: "read_all" }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data?: { updated: number } };
    expect(json.data?.updated).toBe(2);
  });

  it("rejects a non-read_all action", async () => {
    const { req, csrf } = await registerAndCollectCookies();
    const res = await notificationsPostRoute(
      makeApiRequest(req, csrf, "/api/account/notifications", "POST", { action: "nuke" }),
    );
    expect(res.status).toBe(422);
  });
});

describe("POST /api/account/notifications/[id]", () => {
  it("marks a single owned notification read", async () => {
    const { req, csrf } = await registerAndCollectCookies();
    const userId = (await prisma.user.findFirst({ where: { role: ROLES.CUSTOMER } }))?.id as string;
    const id = await seedNotification(userId, "DELIVERED", "REQ-C");

    const res = await notificationReadRoute(
      makeApiRequest(req, csrf, `/api/account/notifications/${id}`, "POST"),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(200);
    const stored = await prisma.notification.findUnique({ where: { id } });
    expect(stored?.readAt).not.toBeNull();
  });

  it("returns 404 for a notification owned by another user", async () => {
    const { req, csrf } = await registerAndCollectCookies();
    const stranger = await prisma.user.create({
      data: {
        email: `stranger-${Date.now()}@example.com`,
        passwordHash: await hashPassword(PASSWORD),
        name: "Stranger",
        role: ROLES.CUSTOMER,
      },
    });
    const id = await seedNotification(stranger.id, "DELIVERED", "REQ-D");

    const res = await notificationReadRoute(
      makeApiRequest(req, csrf, `/api/account/notifications/${id}`, "POST"),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(404);
  });
});

describe("notification preferences route", () => {
  it("returns sensible defaults before any row exists", async () => {
    const { req } = await registerAndCollectCookies();
    const res = await prefsGetRoute(makeApiGet(req, "/api/account/notification-preferences"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data?: { preferences: Array<{ channel: string; enabled: boolean }> };
    };
    for (const prefix of ["email", "sms", "push", "whatsapp"]) {
      const pref = json.data?.preferences.find((p) => p.channel === prefix);
      expect(pref?.enabled).toBe(true);
    }
  });

  it("saves channel toggles and reflects them on read-back", async () => {
    const { req, csrf } = await registerAndCollectCookies();
    const putRes = await prefsPutRoute(
      makeApiRequest(req, csrf, "/api/account/notification-preferences", "PUT", {
        email: true,
        sms: false,
        push: true,
        whatsapp: true,
      }),
    );
    expect(putRes.status).toBe(200);

    const getRes = await prefsGetRoute(makeApiGet(req, "/api/account/notification-preferences"));
    const json = (await getRes.json()) as {
      data?: { preferences: Array<{ channel: string; enabled: boolean; updatedAt: string | null }> };
    };
    const sms = json.data?.preferences.find((p) => p.channel === "sms");
    expect(sms?.enabled).toBe(false);
    expect(sms?.updatedAt).not.toBeNull();
  });
});