import { describe, expect, it } from "vitest";
import {
  formatNaira,
  majorUnitsFromMinor,
  minorUnitsFromMajor,
} from "@/lib/money";

describe("minorUnitsFromMajor", () => {
  it("converts major amounts to integer minor units without float drift", () => {
    expect(minorUnitsFromMajor(0.1 + 0.2)).toBe(30);
    expect(minorUnitsFromMajor(100)).toBe(10000);
    expect(minorUnitsFromMajor(80_000)).toBe(8_000_000);
    expect(minorUnitsFromMajor(79_999.99)).toBe(7_999_999);
  });

  it("rejects non-finite input", () => {
    expect(() => minorUnitsFromMajor(Number.NaN)).toThrow(TypeError);
    expect(() => minorUnitsFromMajor(Number.POSITIVE_INFINITY)).toThrow(
      TypeError,
    );
  });
});

describe("majorUnitsFromMinor", () => {
  it("converts integer minor units back to major amounts", () => {
    expect(majorUnitsFromMinor(30)).toBe(0.3);
    expect(majorUnitsFromMinor(8_000_000)).toBe(80_000);
  });
});

describe("formatNaira", () => {
  it("formats minor units as naira currency", () => {
    expect(formatNaira(8_000_000)).toContain("80,000");
    expect(formatNaira(0)).toContain("0");
  });
});