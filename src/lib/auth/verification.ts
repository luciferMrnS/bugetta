import { prisma } from "@/lib/prisma";
import { generateToken, hashToken } from "@/lib/auth/tokens";

export const VERIFICATION_TOKEN_TTL_MS = 60 * 60 * 1000;

// Creates (or rotates) the single active verification token for a user and
// returns the raw token — the only time it is ever seen in plaintext.
export async function issueVerificationToken(userId: string): Promise<string> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

  await prisma.emailVerificationToken.upsert({
    where: { userId },
    create: { userId, tokenHash, expiresAt, createdAt: new Date() },
    update: { tokenHash, expiresAt, createdAt: new Date() },
  });

  return token;
}

export type VerificationResult =
  | { ok: true }
  | { ok: false; code: "INVALID" | "EXPIRED" };

export async function consumeVerificationToken(
  email: string,
  token: string,
): Promise<VerificationResult> {
  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!record || record.user.email !== email.toLowerCase()) {
    return { ok: false, code: "INVALID" };
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    await prisma.emailVerificationToken
      .delete({ where: { id: record.id } })
      .catch(() => {});
    return { ok: false, code: "EXPIRED" };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
    }),
    prisma.emailVerificationToken.delete({ where: { id: record.id } }),
  ]);

  return { ok: true };
}