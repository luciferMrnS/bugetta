import { describe, expect, it } from "vitest";
import {
  minorUnitsFromMajor,
  majorUnitsFromMinor,
  formatNaira,
} from "@/lib/money";
import { totalKobo, PRICE_LIMITS_NAIRA } from "@/lib/operations/pricing";

describe("totalKobo", () => {
  it("sums price, service fee and delivery fee entirely in integer kobo", () => {
    const total = totalKobo({
      priceKobo: 85_000_000,
      serviceFeeKobo: 1_000_000,
      deliveryFeeKobo: 500_000,
    });
    expect(total).toBe(86_500_000);
    expect(Number.isInteger(total)).toBe(true);
  });

  it("never introduces floats even for awkward major inputs", () => {
    const priceKobo = minorUnitsFromMajor(850_000.37);
    const serviceFeeKobo = minorUnitsFromMajor(7_000.12);
    const deliveryFeeKobo = minorUnitsFromMajor(1_250.5);
    const total = totalKobo({ priceKobo, serviceFeeKobo, deliveryFeeKobo });
    expect(total).toBe(priceKobo + serviceFeeKobo + deliveryFeeKobo);
    expect(Number.isSafeInteger(total)).toBe(true);
  });

  it("round-trips through major display without a kobo of drift", () => {
    const priceNaira = 125_000;
    const serviceNaira = 5_000;
    const deliveryNaira = 2_000;
    const priceKobo = minorUnitsFromMajor(priceNaira);
    const serviceFeeKobo = minorUnitsFromMajor(serviceNaira);
    const deliveryFeeKobo = minorUnitsFromMajor(deliveryNaira);
    const totalNaira = majorUnitsFromMinor(
      totalKobo({ priceKobo, serviceFeeKobo, deliveryFeeKobo }),
    );
    expect(totalNaira).toBe(priceNaira + serviceNaira + deliveryNaira);
    expect(formatNaira(totalKobo({ priceKobo, serviceFeeKobo, deliveryFeeKobo }))).toContain(
      "132,000",
    );
  });

  it("defaults to the price when fees are zero", () => {
    expect(totalKobo({ priceKobo: 100_000_000, serviceFeeKobo: 0, deliveryFeeKobo: 0 })).toBe(
      100_000_000,
    );
  });
});

describe("pricing limits", () => {
  it("caps price and fees within safe naira ranges", () => {
    expect(PRICE_LIMITS_NAIRA.price).toBeGreaterThan(0);
    expect(PRICE_LIMITS_NAIRA.fee).toBeGreaterThan(0);
    // The fee cap never lets a single fee dominate a legit quote total.
    expect(PRICE_LIMITS_NAIRA.fee).toBeLessThan(PRICE_LIMITS_NAIRA.price);
  });
});
