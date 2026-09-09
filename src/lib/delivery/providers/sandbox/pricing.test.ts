import { describe, expect, it } from "vitest";
import {
  calculateDeliveryFee,
  deliveryZoneFor,
} from "@/lib/delivery/providers/sandbox/pricing";

const NOW = new Date("2026-09-08T10:00:00.000Z");

function endOfDayIn(days: number): Date {
  const copy = new Date(NOW);
  copy.setDate(copy.getDate() + days);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

describe("deliveryZoneFor", () => {
  it("classifies Lagos metro areas and nothing else", () => {
    expect(deliveryZoneFor(null)).toBe("UNKNOWN");
    expect(deliveryZoneFor("")).toBe("UNKNOWN");
    expect(deliveryZoneFor("Ikeja G.R.A")).toBe("METRO");
    expect(deliveryZoneFor("12 Victoria Island, Lagos")).toBe("METRO");
    expect(deliveryZoneFor("Kano, Kano State")).toBe("OTHER");
    expect(deliveryZoneFor("Abuja")).toBe("OTHER");
  });
});

describe("calculateDeliveryFee (sandbox provider)", () => {
  it("charges the metro base for metro drops and derives a fixed ETA", () => {
    const result = calculateDeliveryFee({
      dropLocation: "Ikeja",
      priority: "STANDARD",
      now: NOW,
    });
    expect(result.method).toContain("metro");
    expect(result.feeKobo).toBe(300_000); // ₦3,000
    expect(result.breakdown).toEqual([
      { label: "Base delivery (metropolitan)", amountKobo: 300_000 },
    ]);
    expect(result.eta).toEqual(endOfDayIn(2));
  });

  it("adds a rounded 50% express surcharge and shortens the ETA", () => {
    const result = calculateDeliveryFee({
      dropLocation: "Lekki",
      priority: "EXPRESS",
      now: NOW,
    });
    expect(result.feeKobo).toBe(450_000); // ₦3,000 + ₦1,500
    expect(result.breakdown).toHaveLength(2);
    expect(result.breakdown[1]).toEqual({
      label: "Express priority",
      amountKobo: 150_000,
    });
    expect(result.eta).toEqual(endOfDayIn(1));
  });

  it("applies the non-metro base outside Lagos with a longer ETA", () => {
    const result = calculateDeliveryFee({
      dropLocation: "Kano",
      priority: "STANDARD",
      now: NOW,
    });
    expect(result.feeKobo).toBe(500_000); // ₦5,000
    expect(result.eta).toEqual(endOfDayIn(3));
  });

  it("uses the same fallback base when no area is recorded", () => {
    const result = calculateDeliveryFee({
      dropLocation: null,
      priority: "STANDARD",
      now: NOW,
    });
    expect(result.feeKobo).toBe(500_000);
    expect(result.method).toContain("No area recorded");
  });

  it("is deterministic for the same inputs", () => {
    const a = calculateDeliveryFee({
      dropLocation: "Ikeja",
      priority: "EXPRESS",
      now: NOW,
    });
    const b = calculateDeliveryFee({
      dropLocation: "Ikeja",
      priority: "EXPRESS",
      now: NOW,
    });
    expect(a).toEqual(b);
  });

  it("defaults priority and now when omitted", () => {
    const result = calculateDeliveryFee({ dropLocation: "Ikeja" });
    expect(result.feeKobo).toBe(300_000);
    expect(typeof result.eta?.getTime()).toBe("number");
  });
});