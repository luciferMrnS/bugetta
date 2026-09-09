import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { incrementTestCounter } from "@/lib/test/counter";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/auth/roles";
import { POST as registerRoute } from "@/app/api/auth/register/route";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { GET as meRoute } from "@/app/api/auth/me/route";
import {
  ORIGIN,
  makeLogin,
  makeRead as makeMe,
  makeRegister,
  nextClientIp,
  registerAndCollectCookies,
  resetDatabase,
  withCsrfHeader,
} from "@/lib/test/http";

async function prismaUserUpdateStatus(
  email: string,
  status: string,
): Promise<void> {
  await prisma.user.update({ where: { email }, data: { status } });
}

describe("api /api/auth in isolated DB", () => {
  beforeEach(async () => {
    incrementTestCounter();
    await resetDatabase();
  });

  it("registers a user and sets auth cookies", async () => {
    const { res } = await registerAndCollectCookies();
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: { user: { email: string } } };
    expect(json.data.user.email).toMatch(/@example.com$/);
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("bugetta_session="))).toBe(true);
    expect(cookies.some((c) => c.startsWith("bugetta_csrf="))).toBe(true);
  });

  it("rejects a duplicate email", async () => {
    const { email, password } = await registerAndCollectCookies();
    const res = await registerRoute(makeRegister(email, password));
    expect(res.status).toBe(409);
  });

  it("logs in with valid credentials", async () => {
    const { email, password } = await registerAndCollectCookies();
    const req = makeLogin(email, password);
    const res = await loginRoute(req);
    expect(res.status).toBe(200);
    expect(
      res.headers.getSetCookie().some((c) => c.startsWith("bugetta_session=")),
    ).toBe(true);
  });

  it("rejects invalid credentials", async () => {
    const { email } = await registerAndCollectCookies();
    const res = await loginRoute(makeLogin(email, "wrongpassword"));
    expect(res.status).toBe(401);
  });

  it("exposes the current user via /me", async () => {
    const { req } = await registerAndCollectCookies();
    const res = await meRoute(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { user: { email: string } } };
    expect(json.data.user.email).toMatch(/@example.com$/);
  });

  it("returns 401 for /me without a session", async () => {
    const res = await meRoute(makeMe("/api/auth/me"));
    expect(res.status).toBe(401);
  });

  it("logs out and invalidates the session", async () => {
    const { req, csrf } = await registerAndCollectCookies();
    withCsrfHeader(req, csrf);
    const logoutRes = await logoutRoute(req);
    expect(logoutRes.status).toBe(200);

    const meRes = await meRoute(makeMe("/api/auth/me"));
    expect(meRes.status).toBe(401);
  });

  it("rejects logout/CSRF when the security token is missing or wrong", async () => {
    const { req } = await registerAndCollectCookies();
    const missing = await logoutRoute(req);
    expect(missing.status).toBe(403);

    withCsrfHeader(req, "not-the-real-token");
    const wrong = await logoutRoute(req);
    expect(wrong.status).toBe(403);
  });

  it("rejects cross-origin state-changing requests", async () => {
    const attackerOrigin = "https://evil.example";
    const req = new NextRequest(`${ORIGIN}/api/auth/register`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: attackerOrigin,
        "x-forwarded-for": nextClientIp(),
      },
      body: JSON.stringify({
        name: "Attacker",
        email: `evil-${Date.now()}@example.com`,
        password: "somepassword123",
      }),
    });
    const res = await registerRoute(req);
    expect(res.status).toBe(403);
  });

  it("blocks a suspended user at login", async () => {
    const { email, password } = await registerAndCollectCookies();

    // Suspension is an admin operation; simulate it directly in the DB.
    await prismaUserUpdateStatus(email, "SUSPENDED");

    const res = await loginRoute(makeLogin(email, password));
    expect(res.status).toBe(403);
  });

  it("rate limits aggressive registration attempts", async () => {
    // Unique emails but a single client IP must be capped.
    const ip = "198.51.100.9";
    let status = 201;
    for (let i = 0; i < 6; i++) {
      const req = new NextRequest(`${ORIGIN}/api/auth/register`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN,
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({
          name: "Spammer",
          email: `spam-${i}-${Date.now()}@example.com`,
          password: "somepassword123",
        }),
      });
      status = (await registerRoute(req)).status;
    }
    expect(status).toBe(429);
  });

  it("promotes the first invite-coded registration to ADMIN", async () => {
    vi.stubEnv("ADMIN_BOOTSTRAP_EMAIL", "Boss.Admin@Example.com");
    vi.stubEnv("ADMIN_BOOTSTRAP_CODE", "invite-code-123");
    try {
      const req = new NextRequest(`${ORIGIN}/api/auth/register`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN,
          "x-forwarded-for": nextClientIp(),
        },
        body: JSON.stringify({
          name: "Boss Admin",
          email: "boss.admin@example.com",
          password: "somepassword123",
          adminBootstrapCode: "invite-code-123",
        }),
      });
      const res = await registerRoute(req);
      expect(res.status).toBe(201);
      const json = (await res.json()) as {
        data: { user: { email: string; role: string } };
      };
      expect(json.data.user.role).toBe(ROLES.ADMIN);
      const adminCount = await prisma.user.count({
        where: { role: ROLES.ADMIN },
      });
      expect(adminCount).toBe(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("keeps the account CUSTOMER when the invite code is wrong", async () => {
    vi.stubEnv("ADMIN_BOOTSTRAP_EMAIL", "Boss.Admin@Example.com");
    vi.stubEnv("ADMIN_BOOTSTRAP_CODE", "invite-code-123");
    try {
      const req = new NextRequest(`${ORIGIN}/api/auth/register`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN,
          "x-forwarded-for": nextClientIp(),
        },
        body: JSON.stringify({
          name: "Boss Admin",
          email: "boss.admin@example.com",
          password: "somepassword123",
          adminBootstrapCode: "wrong-code",
        }),
      });
      const res = await registerRoute(req);
      expect(res.status).toBe(201);
      const json = (await res.json()) as {
        data: { user: { role: string } };
      };
      expect(json.data.user.role).toBe(ROLES.CUSTOMER);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
