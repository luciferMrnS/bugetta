import { createHash, randomBytes, timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";

// Random, unguessable bearer tokens (session + CSRF).
export function generateToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("hex");
}

// Tokens are stored server-side only as SHA-256 hashes so a DB leak
// never exposes live session/CSRF secrets.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Constant-time string comparison. Inputs may differ in length; both are
// reduced to fixed-length SHA-256 digests before the timing-safe compare.
export function timingSafeEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return nodeTimingSafeEqual(leftDigest, rightDigest);
}