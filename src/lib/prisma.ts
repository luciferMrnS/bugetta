import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

let cachedClient: PrismaClient | null = null;

// Render's filesystem is rebuilt on every deploy, so a SQLite database must
// live on an attached persistent disk. The DB URL must therefore be an
// absolute file path in production — a relative default like ./prisma/dev.db
// would silently sit on ephemeral storage and be wiped on the next push,
// taking every account with it. Fail loudly instead of losing data.
//
// The client is created lazily (first DB access, not module import) so that
// `next build` can still compile the app even though the build environment
// does not receive DATABASE_URL. The guard then runs when the server actually
// starts serving requests.
function createPrismaClient(): PrismaClient {
  const url = resolveDatabaseUrl();

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

function resolveDatabaseUrl(): string {
  const testUrl = process.env.TEST_DB_URL;
  if (testUrl) {
    return testUrl;
  }

  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";

  if (process.env.NODE_ENV === "production") {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is not set in production. SQLite databases must live on a " +
          "Persistent Disk or every deploy creates a fresh database and all data " +
          "is lost. Set e.g. DATABASE_URL=file:/var/data/bugetta.db and attach a " +
          "Render Persistent Disk mounted at /var/data.",
      );
    }

    const rest = url.startsWith("file://")
      ? url.slice("file://".length)
      : url.startsWith("file:")
        ? url.slice("file:".length)
        : url;
    if (!rest.startsWith("/")) {
      throw new Error(
        `DATABASE_URL must be an absolute path on a persistent disk in ` +
          `production (got "${url}"). Relative paths resolve inside the app ` +
          `directory, which Render rebuilds on every deploy.`,
      );
    }

    // If the mount point is missing, the disk was never attached — creating
    // the file there would just recreate ephemeral storage in disguise.
    const filePath = rest.startsWith("//") ? rest.slice(1) : rest;
    if (!existsSync(dirname(filePath))) {
      throw new Error(
        `The databases directory does not exist: ${dirname(filePath)}. ` +
          `Attach a Render Persistent Disk to this service mounted there before ` +
          `deploying, or data will be lost on every push.`,
      );
    }
  }

  return url;
}

// Which database file is actually in use — surfaced by /api/health so you can
// confirm on Render that data is (and stays) on the persistent disk.
export function getDatabasePath(): string | null {
  if (process.env.DATABASE_PROVIDER === "postgresql") {
    return null;
  }
  const url = resolveDatabaseUrl();
  const rest = url.startsWith("file://")
    ? url.slice("file://".length)
    : url.startsWith("file:")
      ? url.slice("file:".length)
      : url;
  return rest.startsWith("//") ? rest.slice(1) : rest;
}

export function getPrisma(): PrismaClient {
  if (!cachedClient) {
    // First use constructs and validates the client (including the production
    // persistent-disk guard); every subsequent access reuses the same instance.
    cachedClient = createPrismaClient();
  }

  return cachedClient;
}

// Lazy proxy: importing this module never touches the database (so `next build`
// and test collection stay light), but the first property access constructs and
// validates the real client.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getPrisma(), prop, receiver);
  },
});