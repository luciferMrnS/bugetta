import { describe, expect, it } from "vitest";
import {
  dayKey,
  endOfUtcDay,
  percentRate,
  startOfUtcDay,
} from "@/lib/analytics/service";

describe("analytics pure helpers", () => {
  it("percentRate rounds to one decimal and never divides by zero", () => {
    expect(percentRate(50, 100)).toBe(50);
    expect(percentRate(1, 3)).toBe(33.3);
    expect(percentRate(1, 6)).toBe(16.7);
    expect(percentRate(0, 0)).toBe(0);
    expect(percentRate(4, 0)).toBe(0);
  });

  it("dayKey returns the UTC calendar day", () => {
    expect(dayKey(new Date("2026-05-01T08:00:00.000Z"))).toBe("2026-05-01");
    expect(dayKey(new Date("2026-12-31T23:59:59.999Z"))).toBe("2026-12-31");
  });

  it("startOfUtcDay and endOfUtcDay bound a calendar day in UTC", () => {
    const at = new Date("2026-05-01T12:30:45.000Z");
    expect(startOfUtcDay(at).toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(endOfUtcDay(at).toISOString()).toBe("2026-05-01T23:59:59.999Z");
  });
});