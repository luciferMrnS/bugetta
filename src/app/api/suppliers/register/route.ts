import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, zodFieldErrors } from "@/lib/api";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { supplierRegistrationSchema } from "@/lib/validators/supplier";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { attachSessionCookies } from "@/lib/auth/session.cookies";
import { serializeUser } from "@/lib/auth/user";
import { ROLES } from "@/lib/auth/roles";
import { isSameOrigin } from "@/lib/auth/guards";
import {
  SupplierError,
  getSupplierProfile,
} from "@/lib/suppliers/service";
import { issueVerificationToken } from "@/lib/auth/verification";
import { sendVerificationEmail } from "@/lib/email/send";
import { sendNotification } from "@/lib/notify/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/suppliers/register
 *
 * Creates a SUPPLIER user and their supplier profile in one step. The user is
 * created ACTIVE so they can immediately sign in and see their onboarding
 * status, but the supplier profile starts PENDING until an admin approves it.
 * Themes: low-friction onboarding for informal suppliers.
 *
 * Every new account also gets a one-hour email verification token (delivery
 * failures never block signup), and every admins-in-range is notified that a
 * new application landed in their review queue.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return fail("CSRF_ORIGIN", "Request origin is not allowed.", 403);
  }

  if (!rateLimit(`supplier-register:${clientKey(request)}`, 5)) {
    return fail(
      "RATE_LIMITED",
      "Too many registration attempts. Please try again later.",
      429,
    );
  }

  const body = await readJson(request);
  const parsed = supplierRegistrationSchema.safeParse(body ?? {});
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

  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: parsed.data.email,
          name: parsed.data.name,
          phone: null,
          passwordHash,
          role: ROLES.SUPPLIER,
        },
      });
      await tx.supplier.create({
        data: {
          userId: created.id,
          businessName: parsed.data.businessName.trim(),
          description: parsed.data.description?.trim() || null,
          contactName: parsed.data.contactName?.trim() || parsed.data.name,
          phone: parsed.data.phone?.trim() || null,
          whatsapp: parsed.data.whatsapp?.trim() || null,
          email: parsed.data.email?.trim() || null,
          supplierCategories: {
            create: (parsed.data.categories ?? []).map((categoryKey) => ({
              categoryKey,
            })),
          },
          serviceArea: parsed.data.serviceArea?.trim() || null,
          operatingHours: parsed.data.operatingHours?.trim() || null,
          paymentDetails: parsed.data.paymentDetails?.trim() || null,
          logoUrl: parsed.data.logoUrl?.trim() || null,
          status: "PENDING",
        },
      });
      return created;
    });

    const profile = await getSupplierProfile(user.id);
    if (!profile) {
      throw new SupplierError("NOT_CREATED", "Supplier profile was not created.");
    }

    // Email verification: same non-blocking pattern as customer signup. The
    // /verify page has a resend path, so a failed send can never strand a
    // signup. Suppliers can sign in and see their pending status either way;
    // the verify banner on the dashboard is the recovery prompt.
    try {
      const token = await issueVerificationToken(user.id);
      const verifyHref = `${
        request.headers.get("origin") ?? "http://localhost:3000"
      }/verify?token=${token}&email=${encodeURIComponent(user.email)}`;
      await sendVerificationEmail({ to: user.email, name: user.name, verifyHref });
    } catch (err) {
      console.error("[suppliers/register] verification email failed", err);
    }

    // Notify every active admin that an application is in their queue. The
    // admin review page is the place to act on it. Delivery problems must not
    // fail the registration.
    try {
      const admins = await prisma.user.findMany({
        where: { role: ROLES.ADMIN, status: "ACTIVE" },
        select: { id: true },
      });
      const categoryLabel = profile.categoryLabels?.join(", ") || "General";
      await Promise.all(
        admins.map((admin) =>
          sendNotification({
            userId: admin.id,
            kind: "SUPPLIER_APPLICATION",
            reference: profile.id,
            vars: { businessName: profile.businessName, categoryLabel },
          }),
        ),
      );
    } catch (err) {
      console.error("[suppliers/register] admin notification failed", err);
    }

    const createdSession = await createSession({
      userId: user.id,
      ipAddress: clientKey(request),
      userAgent: request.headers.get("user-agent"),
    });

    return attachSessionCookies(
      ok(
        {
          user: serializeUser(user),
          supplier: profile,
        },
        { status: 201 },
      ),
      createdSession,
    );
  } catch (error) {
    if (error instanceof SupplierError) {
      return fail(error.code, error.message, 409);
    }
    throw error;
  }
}