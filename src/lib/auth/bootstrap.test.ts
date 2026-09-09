import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/auth/roles";
import { hashPassword } from "@/lib/auth/password";
import { resolveRegistrationRole } from "@/lib/auth/bootstrap";
import { resetDatabase, PASSWORD } from "@/lib/test/http";

const EMAIL = "Boss.Admin@Example.com";
const CODE = "correct-horse-battery-staple";

function stubAdminBootstrap() {
  vi.stubEnv("ADMIN_BOOTSTRAP_EMAIL", EMAIL);
  vi.stubEnv("ADMIN_BOOTSTRAP_CODE", CODE);
}

describe("resolveRegistrationRole (env-driven admin bootstrap)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falls back to CUSTOMER when the bootstrap is not configured", async () => {
    expect(
      await resolveRegistrationRole({ email: EMAIL, code: CODE }),
    ).toBe(ROLES.CUSTOMER);
  });

  it("promotes the matching email + code to ADMIN", async () => {
    stubAdminBootstrap();
    expect(
      await resolveRegistrationRole({
        email: "boss.admin@example.com",
        code: CODE,
      }),
    ).toBe(ROLES.ADMIN);
  });

  it("normalizes case and whitespace on email and code", async () => {
    stubAdminBootstrap();
    expect(
      await resolveRegistrationRole({
        email: "  BOSS.ADMIN@example.COM ",
        code: `  ${CODE}  `,
      }),
    ).toBe(ROLES.ADMIN);
  });

  it("refuses a wrong invite code", async () => {
    stubAdminBootstrap();
    expect(
      await resolveRegistrationRole({
        email: "boss.admin@example.com",
        code: "wrong-code",
      }),
    ).toBe(ROLES.CUSTOMER);
  });

  it("refuses a matching code on a different email", async () => {
    stubAdminBootstrap();
    expect(
      await resolveRegistrationRole({
        email: "someone@example.com",
        code: CODE,
      }),
    ).toBe(ROLES.CUSTOMER);
  });

  it("refuses when no code is supplied", async () => {
    stubAdminBootstrap();
    expect(
      await resolveRegistrationRole({ email: "boss.admin@example.com" }),
    ).toBe(ROLES.CUSTOMER);
  });

  it("is first-admin-wins: never promotes once any ADMIN exists", async () => {
    stubAdminBootstrap();
    await prisma.user.create({
      data: {
        email: `existing-admin-${Date.now()}@example.com`,
        passwordHash: await hashPassword(PASSWORD),
        name: "Existing Admin",
        role: ROLES.ADMIN,
      },
    });
    expect(
      await resolveRegistrationRole({
        email: "boss.admin@example.com",
        code: CODE,
      }),
    ).toBe(ROLES.CUSTOMER);
  });
});