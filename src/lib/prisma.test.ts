import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

describe("database connectivity", () => {
  it("executes a query against the configured database", async () => {
    const rows = await prisma.$queryRaw<Array<{ ok: number | bigint }>>`SELECT 1 AS ok`;

    expect(rows).toHaveLength(1);
    expect(Number(rows[0].ok)).toBe(1);
  });
});