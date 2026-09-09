import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { guardOperations } from "@/lib/operations/access";
import {
  OperationsError,
  getRequestForOperations,
} from "@/lib/operations/service";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/operations/requests/[id]">,
) {
  const guard = await guardOperations(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { id } = await ctx.params;
  try {
    const requestOutput = await getRequestForOperations(id);
    if (!requestOutput) {
      return fail("NOT_FOUND", "Request not found.", 404);
    }
    return ok({ request: requestOutput });
  } catch (error) {
    if (error instanceof OperationsError) {
      return fail(error.code, error.message, 404);
    }
    throw error;
  }
}