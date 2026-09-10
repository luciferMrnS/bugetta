import { prisma, getDatabasePath } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.error("health check: database connectivity failed", err);
    return Response.json(
      {
        status: "error",
        service: "bugetta-api",
        db: "disconnected",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }

  return Response.json({
    status: "ok",
    service: "bugetta-api",
    db: "connected",
    dbPath: getDatabasePath(),
    latencyMs: Math.round(performance.now() - startedAt),
    timestamp: new Date().toISOString(),
  });
}