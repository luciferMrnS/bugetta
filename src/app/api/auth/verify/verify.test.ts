import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { incrementTestCounter } from "@/lib/test/counter";
import { prisma } from "@/lib/prisma";
import { POST as verifyRoute } from "@/app/api/auth/verify/route";
import { POST as resendRoute } from "@/app/api/auth/verify/resend/route";
import { POST as registerRoute } from "@/app/api/auth/register/route";
import {
  issueVerificationToken,
  VERIFICATION_TOKEN_TTL_MS,
} from "@/lib/auth/verification";
import {
  ORIGIN,
  makeRegister,
  nextClientIp,
  resetDatabase,
} from "@/lib/test/http";

function makeVerify(email: string, token: string) {
  return new NextRequest(`${ORIGIN}/api/auth/verify`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "x-forwarded-for": nextClientIp(),
    },
    body: JSON.stringify({ email, token }),
  });
}

function makeResend(email: string) {
  return new NextRequest(`${ORIGIN}/api/auth/verify/resend`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "x-forwarded-for": nextClientIp(),
    },
    body: JSON.stringify({ email }),
  });
}

describe("api /api/auth/verify in isolated DB", () => {
  beforeEach(async () => {
    incrementTestCounter();
    await resetDatabase();
  });

  it("registers a user with a pending verification token", async () => {
    const email = `verify-test-${Date.now()}@example.com`;
    const res = await registerRoute(makeRegister(email, "correcthorsebatterystaple123"));
    expect(res.status).toBe(201);

    const created = await prisma.user.findUnique({
      where: { email },
      select: { emailVerifiedAt: true, verificationTokens: true },
    });
    expect(created?.emailVerifiedAt).toBeNull();
    expect(created?.verificationTokens).toHaveLength(1);
  });

  it("verifies an unverified user with the correct token", async () => {
    const email = `verify-test-${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        name: "Ada Obi",
        passwordHash: "unused-hash",
      },
    });
    const token = await issueVerificationToken(user.id);

    const res = await verifyRoute(makeVerify(email, token));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { verified: boolean } };
    expect(json.data.verified).toBe(true);

    const after = await prisma.user.findUnique({
      where: { id: user.id },
      select: { emailVerifiedAt: true, verificationTokens: true },
    });
    expect(after?.emailVerifiedAt).not.toBeNull();
    expect(after?.verificationTokens).toHaveLength(0);
  });

  it("rejects an unknown token", async () => {
    const email = `verify-test-${Date.now()}@example.com`;
    const res = await verifyRoute(makeVerify(email, "a".repeat(64)));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("VERIFICATION_INVALID");
  });

  it("rejects a token that does not belong to the email", async () => {
    const email = `verify-test-${Date.now()}@example.com`;
    const other = `verify-other-${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: { email, name: "Ada Obi", passwordHash: "unused-hash" },
    });
    const token = await issueVerificationToken(user.id);

    const res = await verifyRoute(makeVerify(other, token));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("VERIFICATION_INVALID");
  });

  it("rejects an expired token and cleans it up", async () => {
    const email = `verify-test-${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: { email, name: "Ada Obi", passwordHash: "unused-hash" },
    });
    const token = await issueVerificationToken(user.id);
    await prisma.emailVerificationToken.update({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const res = await verifyRoute(makeVerify(email, token));
    expect(res.status).toBe(410);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("VERIFICATION_EXPIRED");

    const leftover = await prisma.emailVerificationToken.count({
      where: { userId: user.id },
    });
    expect(leftover).toBe(0);
    expect(
      (
        await prisma.user.findUnique({
          where: { id: user.id },
          select: { emailVerifiedAt: true },
        })
      )?.emailVerifiedAt,
    ).toBeNull();
  });

  it("cannot consume a token twice", async () => {
    const email = `verify-test-${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: { email, name: "Ada Obi", passwordHash: "unused-hash" },
    });
    const token = await issueVerificationToken(user.id);

    const first = await verifyRoute(makeVerify(email, token));
    expect(first.status).toBe(200);
    const second = await verifyRoute(makeVerify(email, token));
    expect(second.status).toBe(400);
    const json = (await second.json()) as { error: { code: string } };
    expect(json.error.code).toBe("VERIFICATION_INVALID");
  });

  it("resends by rotating to a single fresh token", async () => {
    const email = `verify-test-${Date.now()}@example.com`;
    const res = await registerRoute(makeRegister(email, "correcthorsebatterystaple123"));
    expect(res.status).toBe(201);

    const before = await prisma.emailVerificationToken.findMany({
      where: { user: { email } },
    });
    expect(before).toHaveLength(1);

    const resend = await resendRoute(makeResend(email));
    expect(resend.status).toBe(200);
    const json = (await resend.json()) as { data: { sent: boolean } };
    expect(json.data.sent).toBe(true);

    const after = await prisma.user.findUnique({
      where: { email },
      select: { verificationTokens: true },
    });
    expect(after?.verificationTokens).toHaveLength(1);
    expect(after?.verificationTokens[0]?.tokenHash).not.toBe(
      before[0]?.tokenHash,
    );
    expect(after?.verificationTokens[0]?.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + VERIFICATION_TOKEN_TTL_MS - 60_000,
    );
  });

  it("resend is uniform for unknown and already-verified emails", async () => {
    const unknown = await resendRoute(makeResend(`nobody-${Date.now()}@example.com`));
    expect(unknown.status).toBe(200);
    expect(((await unknown.json()) as { data: { sent: boolean } }).data.sent).toBe(
      false,
    );

    const email = `verify-test-${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: { email, name: "Ada Obi", passwordHash: "unused-hash" },
    });
    const token = await issueVerificationToken(user.id);
    await verifyRoute(makeVerify(email, token));

    const verified = await resendRoute(makeResend(email));
    expect(verified.status).toBe(200);
    expect(
      ((await verified.json()) as { data: { sent: boolean } }).data.sent,
    ).toBe(false);
  });
});