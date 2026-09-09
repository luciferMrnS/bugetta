import { prisma } from "@/lib/prisma";
import { ROLES, type UserRole } from "@/lib/auth/roles";
import { timingSafeEqual } from "@/lib/auth/tokens";

// Environment-driven, one-shot admin bootstrap. Values are read from .env
// (which is git-ignored; .env.example only documents the variable names) so
// nothing sensitive ever lands in the repository. The gate additionally
// self-disables after the FIRST admin exists: a leaked email or code can
// never promote a second account afterwards.
const BOOTSTRAP_EMAIL = "ADMIN_BOOTSTRAP_EMAIL";
const BOOTSTRAP_CODE = "ADMIN_BOOTSTRAP_CODE";

function adminBootstrapConfig(): { email: string; code: string } | null {
  const email = process.env[BOOTSTRAP_EMAIL]?.trim().toLowerCase();
  const code = process.env[BOOTSTRAP_CODE]?.trim();
  if (!email || !code) {
    return null;
  }
  return { email, code };
}

async function adminAccountExists(): Promise<boolean> {
  const admin = await prisma.user.findFirst({
    where: { role: ROLES.ADMIN },
    select: { id: true },
  });
  return admin !== null;
}

// Decides the role for a brand-new registration. Returns ADMIN only when the
// bootstrap is configured, the email matches exactly, the invite code matches
// (both compared in constant time) and no ADMIN account exists yet. Every
// other outcome silently falls back to CUSTOMER so an attacker cannot learn
// whether a code was correct.
export async function resolveRegistrationRole(input: {
  email: string;
  code?: string;
}): Promise<UserRole> {
  const config = adminBootstrapConfig();
  if (!config || !input.code) {
    return ROLES.CUSTOMER;
  }

  const email = input.email.trim().toLowerCase();
  if (!timingSafeEqual(email, config.email)) {
    return ROLES.CUSTOMER;
  }
  if (!timingSafeEqual(input.code.trim(), config.code)) {
    return ROLES.CUSTOMER;
  }

  if (await adminAccountExists()) {
    return ROLES.CUSTOMER;
  }
  return ROLES.ADMIN;
}