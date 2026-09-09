import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { guardSession } from "@/lib/auth/guards";
import { serializeUser } from "@/lib/auth/user";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await guardSession(request);
  if (!guard.ok) {
    return guard.response;
  }

  return ok({ user: serializeUser(guard.session.user) });
}