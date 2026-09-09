import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, zodFieldErrors } from "@/lib/api";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { registerSchema } from "@/lib/validators/auth";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { attachSessionCookies } from "@/lib/auth/session.cookies";
import { serializeUser } from "@/lib/auth/user";
import { isSameOrigin } from "@/lib/auth/guards";
import { issueVerificationToken } from "@/lib/auth/verification";
import { sendVerificationEmail } from "@/lib/email/send";
import { resolveRegistrationRole } from "@/lib/auth/bootstrap";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return fail("CSRF_ORIGIN", "Request origin is not allowed.", 403);
  }

  if (!rateLimit(`register:${clientKey(request)}`, 5)) {
    return fail(
      "RATE_LIMITED",
      "Too many registration attempts. Please try again later.",
      429,
    );
  }

  const body = await readJson(request);
  const parsed = registerSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Check your details and try again.", 422, {
      ...zodFieldErrors(parsed.error),
    });
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });
  if (existing) {
    return fail(
      "EMAIL_TAKEN",
      "An account with this email already exists.",
      409,
    );
  }

  const passwordHash = await hashPassword(parsed.data.password);

  // Ordinary registrations become CUSTOMER. The env-driven bootstrap (see
  // lib/auth/bootstrap.ts) may promote the first, invite-code-authenticated
  // registration to ADMIN — it self-disables once any admin exists.
  const role = await resolveRegistrationRole({
    email: parsed.data.email,
    code: parsed.data.adminBootstrapCode,
  });

  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      phone: parsed.data.phone ?? null,
      passwordHash,
      role,
    },
  });

  const createdSession = await createSession({
    userId: user.id,
    ipAddress: clientKey(request),
    userAgent: request.headers.get("user-agent"),
  });

  // Every new account starts unverified: issue a one-hour token and email a
  // verification link. Delivery problems never block signup — the /verify
  // resend endpoint is the recovery path.
  try {
    const token = await issueVerificationToken(user.id);
    const verifyHref = `${
      request.headers.get("origin") ?? "http://localhost:3000"
    }/verify?token=${token}&email=${encodeURIComponent(user.email)}`;
    await sendVerificationEmail({ to: user.email, name: user.name, verifyHref });
  } catch (err) {
    console.error("[register] verification email failed", err);
  }

  return attachSessionCookies(
    ok({ user: serializeUser(user) }, { status: 201 }),
    createdSession,
  );
}