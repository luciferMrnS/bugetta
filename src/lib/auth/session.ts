import { prisma } from "@/lib/prisma";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { USER_STATUS } from "@/lib/auth/roles";
import { CSRF_COOKIE, SESSION_COOKIE } from "@/lib/auth/cookie-names";

const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 7 * DAY_MS;
const SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_TTL_MS / 1000);

export interface CreatedSession {
  token: string;
  csrf: string;
  expiresAt: Date;
}

export interface SessionWithUser {
  session: {
    id: string;
    csrfHash: string;
    expiresAt: Date;
  };
  user: {
    id: string;
    email: string;
    name: string;
    phone: string | null;
    role: string;
    status: string;
    createdAt: Date;
  };
}

export async function createSession(input: {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<CreatedSession> {
  const token = generateToken();
  const csrf = generateToken(24);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      csrfHash: hashToken(csrf),
      userId: input.userId,
      expiresAt,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });

  await deleteExpiredSessions(input.userId);

  return { token, csrf, expiresAt };
}

export async function deleteExpiredSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({
    where: { userId, expiresAt: { lte: new Date() } },
  });
}

export async function getSessionWithUser(
  token: string | undefined | null,
): Promise<SessionWithUser | null> {
  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt <= new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  if (session.user.status !== USER_STATUS.ACTIVE) {
    return null;
  }

  return {
    session: {
      id: session.id,
      csrfHash: session.csrfHash,
      expiresAt: session.expiresAt,
    },
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      phone: session.user.phone,
      role: session.user.role,
      status: session.user.status,
      createdAt: session.user.createdAt,
    },
  };
}

export async function destroySession(
  token: string | undefined | null,
): Promise<void> {
  if (!token) {
    return;
  }
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export {
  SESSION_COOKIE,
  CSRF_COOKIE,
  SESSION_MAX_AGE_SECONDS,
};