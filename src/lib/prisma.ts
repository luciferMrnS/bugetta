import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  // Priority: explicit test override, then process env, then the default.
  const url =
    process.env.TEST_DB_URL ??
    process.env.DATABASE_URL ??
    "file:./prisma/dev.db";

  switch (process.env.DATABASE_PROVIDER ?? "sqlite") {
    case "postgresql":
      // Production target. Swap in the Postgres driver adapter in Phase 5+.
      throw new Error(
        "PostgreSQL driver adapter is not configured yet. Keep DATABASE_PROVIDER=sqlite for local development.",
      );
    case "sqlite":
    default: {
      const adapter = new PrismaBetterSqlite3({ url });
      return new PrismaClient({ adapter });
    }
  }
}

export function getPrisma(): PrismaClient {
  if (process.env.NODE_ENV === "production") {
    return createPrismaClient();
  }

  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }

  return globalForPrisma.prisma;
}

export const prisma = getPrisma();