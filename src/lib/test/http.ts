import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import BetterSqlite3 from "better-sqlite3";
import { NextRequest } from "next/server";
import { testCounter } from "@/lib/test/counter";
import { POST as registerRoute } from "@/app/api/auth/register/route";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { ROLES } from "@/lib/auth/roles";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DB_PATH = join(__dirname, "../../../tmp/test-api.db");

export const ORIGIN = "http://localhost:3000";

// Schema is applied by vitest.global-setup.ts; each test isolates rows.
export async function resetDatabase(): Promise<void> {
  const client = new BetterSqlite3(DB_PATH);
  try {
    for (const table of [
      "EmailVerificationToken",
      "NotificationPreference",
      "Notification",
      "AutomationRun",
      "CatalogSync",
      "Rating",
      "Complaint",
      "Dispute",
      "FraudFlag",
      "SupplierEarning",
      "SupplierRequest",
      "Offering",
      "Supplier",
      "RequestEvent",
      "Refund",
      "Transaction",
      "Payment",
      "Quote",
      "RequestOption",
      "RequestItem",
      "DeliveryEvent",
      "Delivery",
      "Request",
      "Session",
      "User",
    ]) {
      client.prepare(`DELETE FROM "${table}"`).run();
    }
  } finally {
    client.close();
  }
}

let ipCounter = 0;
export function nextClientIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

export function makeRegister(
  email: string,
  password: string,
  name = "Ada Obi",
) {
  return new NextRequest(`${ORIGIN}/api/auth/register`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "x-forwarded-for": nextClientIp(),
    },
    body: JSON.stringify({ email, password, name }),
  });
}

export function makeLogin(email: string, password: string) {
  return new NextRequest(`${ORIGIN}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "x-forwarded-for": nextClientIp(),
    },
    body: JSON.stringify({ email, password }),
  });
}

export function makeRead(nextUrl: string) {
  return new NextRequest(`${ORIGIN}${nextUrl}`, { method: "GET" });
}

// The CSRF cookie is the plaintext value (readable by JS), so attach it as a
// header to mimic what the client's apiFetch does.
export function withCsrfHeader(request: NextRequest, csrf: string): void {
  request.headers.set("x-csrf-token", csrf);
}

// Copy both auth cookies from a response onto a request so downstream calls
// carry the freshly created session, and capture the plaintext CSRF value.
export function adoptCookies(request: NextRequest, response: Response): string {
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

const PASSWORD = "correcthorsebatterystaple123";

export interface RegisterResult {
  req: NextRequest;
  res: Response;
  email: string;
  password: string;
  csrf: string;
}

// Registers a fresh customer and returns a request carrying the session.
export async function registerAndCollectCookies(): Promise<RegisterResult> {
  const email = `api-test-${testCounter()}-${Date.now()}@example.com`;
  const req = makeRegister(email, PASSWORD);
  const res = await registerRoute(req);
  const csrf = adoptCookies(req, res);
  return { req, res, email, password: PASSWORD, csrf };
}

// Seeds an OPERATIONS user directly and logs them in, returning a request
// carrying that role's session (used for the operations-dashboard tests).
export async function createOperatorAndCollectCookies(): Promise<RegisterResult> {
  const email = `ops-test-${testCounter()}-${Date.now()}@example.com`;
  const password = PASSWORD;
  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: "Ops Desk Umunna",
      role: ROLES.OPERATIONS,
    },
  });
  const req = makeLogin(email, password);
  const res = await loginRoute(req);
  const csrf = adoptCookies(req, res);
  return { req, res, email, password, csrf };
}

// Seeds an ADMIN user directly and logs them in, returning a request carrying
// that role's session (used for the admin-supplier-review tests).
export async function createAdminAndCollectCookies(): Promise<RegisterResult> {
  const email = `admin-test-${testCounter()}-${Date.now()}@example.com`;
  const password = PASSWORD;
  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: "Admin Ngozi",
      role: ROLES.ADMIN,
    },
  });
  const req = makeLogin(email, password);
  const res = await loginRoute(req);
  const csrf = adoptCookies(req, res);
  return { req, res, email, password, csrf };
}

export { PASSWORD };