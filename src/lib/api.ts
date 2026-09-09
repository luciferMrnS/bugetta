import { NextResponse } from "next/server";
import { type ZodError } from "zod";

export type FieldErrors = Record<string, string[]>;

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fieldErrors?: FieldErrors;
  };
}

export function ok<T>(data: T, init?: { status?: number }): NextResponse {
  return NextResponse.json({ data }, init);
}

export function fail(
  code: string,
  message: string,
  status: number,
  fieldErrors?: FieldErrors,
): NextResponse {
  const body: ApiErrorBody = {
    error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) },
  };
  return NextResponse.json(body, { status });
}

export function zodFieldErrors(error: ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export function firstFieldError(
  fieldErrors: FieldErrors | undefined,
): string | undefined {
  if (!fieldErrors) return undefined;
  const key = Object.keys(fieldErrors)[0];
  return key ? fieldErrors[key][0] : undefined;
}

export async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}