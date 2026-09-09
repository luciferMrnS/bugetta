import { describe, expect, it } from "vitest";
import { rateLimit, resetRateLimits } from "@/lib/rateLimit";

describe("rateLimit", () => {
  it("allows requests up to the limit", () => {
    resetRateLimits();
    const key = `t:${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, 3)).toBe(true);
    }
  });

  it("blocks requests beyond the limit", () => {
    resetRateLimits();
    const key = `t:${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      rateLimit(key, 3);
    }
    expect(rateLimit(key, 3)).toBe(false);
  });

  it("allows new keys independently", () => {
    resetRateLimits();
    expect(rateLimit("a", 1)).toBe(true);
    expect(rateLimit("a", 1)).toBe(false);
    expect(rateLimit("b", 1)).toBe(true);
  });
});