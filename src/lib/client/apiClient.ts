const CSRF_COOKIE = "bugetta_csrf";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors?: Record<string, string[]>;

  constructor(
    status: number,
    code: string,
    message: string,
    fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

interface ApiOptions {
  method?: "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
}

// Thin typed wrapper supplying the double-submit CSRF header on mutations.
export async function apiFetch<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const stateChanging = method !== "GET" && method !== "HEAD";

  const csrf = getCookie(CSRF_COOKIE);
  const isSecure =
    typeof window !== "undefined" && window.location.protocol === "https:";

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (stateChanging && csrf) {
    headers["x-csrf-token"] = csrf;
  }

  const response = await fetch(path, {
    method,
    headers,
    credentials: isSecure ? "include" : "same-origin",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | { data?: T; error?: { code: string; message: string; fieldErrors?: Record<string, string[]> } }
    | null;

  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "UNKNOWN_ERROR",
      error?.message ?? "Something went wrong. Please try again.",
      error?.fieldErrors,
    );
  }

  return payload?.data as T;
}

// Read the CSRF token so an unauthenticated form can attach it for its first
// state-changing call when no API call has set cookies yet.
export { getCookie, CSRF_COOKIE };