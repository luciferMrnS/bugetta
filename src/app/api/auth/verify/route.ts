import type { NextRequest } from "next/server";
import { fail, ok, readJson, zodFieldErrors } from "@/lib/api";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { isSameOrigin } from "@/lib/auth/guards";
import { consumeVerificationToken } from "@/lib/auth/verification";
import { z } from "zod";

export const dynamic = "force-dynamic";

const verifySchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  token: z.string().min(16, "This verification link is invalid."),
});

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return fail("CSRF_ORIGIN", "Request origin is not allowed.", 403);
  }

  if (!rateLimit(`verify:${clientKey(request)}`, 10)) {
    return fail(
      "RATE_LIMITED",
      "Too many attempts. Please try again later.",
      429,
    );
  }

  const body = await readJson(request);
  const parsed = verifySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Check your details and try again.", 422, {
      ...zodFieldErrors(parsed.error),
    });
  }

  const result = await consumeVerificationToken(
    parsed.data.email,
    parsed.data.token,
  );

  if (!result.ok) {
    if (result.code === "EXPIRED") {
      return fail(
        "VERIFICATION_EXPIRED",
        "This verification link has expired. Request a new one below.",
        410,
      );
    }
    return fail(
      "VERIFICATION_INVALID",
      "This verification link is invalid. Double-check the link, or request a new one below.",
      400,
    );
  }

  return ok({ verified: true, email: parsed.data.email });
}