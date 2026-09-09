import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));
const tmpDir = join(rootDir, "tmp");
const dbPath = join(tmpDir, "test-api.db");

export default function globalSetup() {
  // 1. Ensure the tmp directory exists for the dedicated test database.
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true });
  }

  // 2. Point Prisma at the test database via TEST_DB_URL.
  const resolved = dbPath.replaceAll("\\", "/");
  process.env.TEST_DB_URL = `file:${resolved}`;

  // 3. Apply the project migrations to the test database so every test suite
  //    starts with a schema that matches the app's models.
  const cliEntry = join(rootDir, "node_modules/prisma/build/index.js");
  const result = spawnSync(
    process.execPath,
    [cliEntry, "migrate", "deploy", "--schema", "prisma/schema.prisma"],
    {
      cwd: rootDir,
      encoding: "utf8",
      env: {
        ...process.env,
        TEST_DB_URL: `file:${resolved}`,
        DATABASE_URL: `file:${resolved}`,
      },
    },
  );

  if (result.status !== 0) {
    const message = result.stderr || result.stdout || "(no output)";
    throw new Error(`globalSetup: prisma migrate deploy failed\n${message}`);
  }
}