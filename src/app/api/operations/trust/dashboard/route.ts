import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { guardOperations } from "@/lib/operations/access";
import { listDisputes } from "@/lib/trust/disputes";
import { listComplaints } from "@/lib/trust/complaints";
import { listFraudFlags } from "@/lib/trust/fraud";
import {
  serializeDispute,
  serializeComplaint,
  serializeFraudFlag,
} from "@/lib/trust/serialize";

export const dynamic = "force-dynamic";

// GET /api/operations/trust/dashboard — the trust queue for operations/admin:
// pending disputes, complaints and fraud flags plus open-counts. Resolution
// happens through the /api/admin/trust/* routes (admin-only).
export async function GET(request: NextRequest) {
  const guard = await guardOperations(request);
  if (!guard.ok) {
    return guard.response;
  }

  const [disputes, complaints, flags] = await Promise.all([
    listDisputes(),
    listComplaints(),
    listFraudFlags(),
  ]);

  const openDisputes = disputes.filter(
    (d) => d.status === "OPEN" || d.status === "IN_REVIEW",
  ).length;
  const openComplaints = complaints.filter(
    (c) => c.status === "OPEN" || c.status === "IN_REVIEW",
  ).length;
  const flaggedFraud = flags.filter(
    (f) => f.status === "FLAGGED" || f.status === "REVIEWED",
  ).length;

  return ok({
    summary: {
      openDisputes,
      openComplaints,
      flaggedFraud,
      totalDisputes: disputes.length,
      totalComplaints: complaints.length,
      totalFlags: flags.length,
    },
    disputes: disputes.map(serializeDispute),
    complaints: complaints.map(serializeComplaint),
    flags: flags.map(serializeFraudFlag),
  });
}