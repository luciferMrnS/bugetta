import { describe, expect, it } from "vitest";
import { generateToken, hashToken, timingSafeEqual } from "@/lib/auth/tokens";

describe("tokens", () => {
  it("generates unique, hex tokens", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes deterministically and irreversibly", () => {
    const token = generateToken();
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it("compares equal and unequal digests in constant time", () => {
    const token = generateToken();
    expect(timingSafeEqual(token, token)).toBe(true);
    expect(timingSafeEqual(token, generateToken())).toBe(false);
    // Different-length inputs must not throw.
    expect(timingSafeEqual("abc", generateToken())).toBe(false);
  });
});