import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, zodFieldErrors } from "@/lib/api";
import { rateLimit } from "@/lib/rateLimit";
import { isSameOrigin } from "@/lib/auth/guards";
import { issueVerificationToken } from "@/lib/auth/verification";
import { sendVerificationEmail } from "@/lib/email/send";
import { z } from "zod";

export const dynamic = "force-dynamic";

const resendSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
});

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return fail("CSRF_ORIGIN", "Request origin is not allowed.", 403);
  }

  const body = await readJson(request);
  const parsed = resendSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Check your details and try again.", 422, {
      ...zodFieldErrors(parsed.error),
    });
  }

  if (!rateLimit(`verify:resend:${parsed.data.email}`, 3)) {
    return fail(
      "RATE_LIMITED",
      "Too many emails sent. Please try again in a few minutes.",
      429,
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, name: true, email: true, emailVerifiedAt: true },
  });

  // Deliberately uniform: unknown or already-verified addresses are not
  // distinguishable from a caller, so resends don't leak account existence.
  if (!user || user.emailVerifiedAt) {
    return ok({ sent: false });
  }

  const token = await issueVerificationToken(user.id);
  const verifyHref = `${
    request.headers.get("origin") ?? "http://localhost:3000"
  }/verify?token=${token}&email=${encodeURIComponent(user.email)}`;

  await sendVerificationEmail({
    to: user.email,
    name: user.name,
    verifyHref,
  });

  return ok({ sent: true, expiresInSeconds: 3600 });
}