import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";
import "dotenv/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const testDbPath = path.join(rootDir, "tmp", "test-api.db");
const resolved = testDbPath.replaceAll("\\", "/");
const testDbUrl = `file:${resolved}`;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
    globalSetup: "./vitest.global-setup.ts",
    // bcrypt (cost 12) + SQLite make individual integration cases slow under
    // full-suite CPU load; keep a generous ceiling so we test behavior, not
    // timing.
    testTimeout: 20000,
    // Integration suites share a single SQLite test DB; run files serially
    // so one suite's fixtures can't be wiped mid-test by another.
    fileParallelism: false,
    env: {
      TEST_DB_URL: testDbUrl,
    },
  },
});