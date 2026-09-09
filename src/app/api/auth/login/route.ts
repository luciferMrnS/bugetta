import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, zodFieldErrors } from "@/lib/api";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { loginSchema } from "@/lib/validators/auth";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { attachSessionCookies } from "@/lib/auth/session.cookies";
import { serializeUser } from "@/lib/auth/user";
import { USER_STATUS } from "@/lib/auth/roles";
import { isSameOrigin } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return fail("CSRF_ORIGIN", "Request origin is not allowed.", 403);
  }

  if (!rateLimit(`login:${clientKey(request)}`, 10)) {
    return fail(
      "RATE_LIMITED",
      "Too many login attempts. Please try again later.",
      429,
    );
  }

  const body = await readJson(request);
  const parsed = loginSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Check your details and try again.", 422, {
      ...zodFieldErrors(parsed.error),
    });
  }

  // Rate limiting is also keyed per account to blunt credential stuffing.
  if (!rateLimit(`login:${parsed.data.email}`, 10)) {
    return fail(
      "RATE_LIMITED",
      "Too many login attempts. Please try again later.",
      429,
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });

  const passwordOk =
    user !== null && (await verifyPassword(parsed.data.password, user.passwordHash));

  // Uniform 401 for unknown email vs wrong password (no account enumeration).
  if (!user || !passwordOk) {
    return fail("INVALID_CREDENTIALS", "Invalid email or password.", 401);
  }

  if (user.status !== USER_STATUS.ACTIVE) {
    return fail("ACCOUNT_SUSPENDED", "This account is not active.", 403);
  }

  const createdSession = await createSession({
    userId: user.id,
    ipAddress: clientKey(request),
    userAgent: request.headers.get("user-agent"),
  });

  return attachSessionCookies(ok({ user: serializeUser(user) }), createdSession);
}