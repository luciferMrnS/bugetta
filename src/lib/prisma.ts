import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

let cachedClient: PrismaClient | null = null;

// The database is selected by DATABASE_PROVIDER (see .env.example):
//   - sqlite      -> local dev / tests, a file on the machine
//   - postgresql  -> Supabase (or any Postgres), via DATABASE_URL
//
// Render's filesystem is rebuilt on every deploy, so SQLite in production must
// live on an attached persistent disk — but Supabase removes that constraint
// entirely. The client is created lazily (first DB access, not module import)
// so `next build` can compile the app even when the build environment does not
// receive DATABASE_URL. Validation then runs when the server serves requests.
function createPrismaClient(): PrismaClient {
  switch (process.env.DATABASE_PROVIDER ?? "sqlite") {
    case "postgresql": {
      const url = resolvePostgresUrl();
      const adapter = new PrismaPg({ connectionString: url });
      return new PrismaClient({ adapter });
    }
    case "sqlite":
    default: {
      const url = resolveSqliteUrl();
      const adapter = new PrismaBetterSqlite3({ url });
      return new PrismaClient({ adapter });
    }
  }
}

// Supabase is a managed Postgres database, so DATABASE_URL is a connection
// string that must point at a real database — fail loudly if it is missing or
// malformed rather than silently connecting to nothing.
function resolvePostgresUrl(): string {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "DATABASE_PROVIDER=postgresql requires DATABASE_URL. Create a Supabase " +
        "project, copy its connection string and set it as DATABASE_URL e.g. " +
        "DATABASE_URL=\"postgresql://postgres:<password>@<host>:5432/postgres?sslmode=require\"",
    );
  }

  if (!/^postgres(ql)?:\/\//.test(url)) {
    throw new Error(
      `DATABASE_URL must be a postgresql:// connection string (got "${url}"). ` +
        "Paste the connection string from the Supabase dashboard.",
    );
  }

  return url;
}

function resolveSqliteUrl(): string {
  const testUrl = process.env.TEST_DB_URL;
  if (testUrl) {
    return testUrl;
  }

  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";

  if (process.env.NODE_ENV === "production") {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is not set in production. Either set DATABASE_PROVIDER=postgresql " +
          "with a Supabase connection string, or configure a SQLite database on a " +
          "Persistent Disk (see .env.example).",
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

// Which database is actually in use — surfaced by /api/health so you can
// confirm on Render that production points at Supabase (postgresql) rather
// than a SQLite file.
export function getDatabaseDescriptor(): { provider: string; location: string } {
  if (process.env.DATABASE_PROVIDER === "postgresql") {
    const url = resolvePostgresUrl();
    return { provider: "postgresql", location: url };
  }

  const url = resolveSqliteUrl();
  const rest = url.startsWith("file://")
    ? url.slice("file://".length)
    : url.startsWith("file:")
      ? url.slice("file:".length)
      : url;
  return { provider: "sqlite", location: rest.startsWith("//") ? rest.slice(1) : rest };
}

export function getPrisma(): PrismaClient {
  if (!cachedClient) {
    // First use constructs and validates the client; every subsequent access
    // reuses the same instance.
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