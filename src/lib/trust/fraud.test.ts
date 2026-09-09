import { describe, expect, it } from "vitest";
import { evaluateSignals } from "@/lib/trust/fraud";

describe("evaluateSignals", () => {
  it("flags a customer with two open disputes as MEDIUM", () => {
    const matches = evaluateSignals("CUSTOMER", "u1", { openDisputes: 2 });
    expect(matches).toHaveLength(1);
    expect(matches[0].signal).toBe("CUSTOMER_MULTIPLE_OPEN_DISPUTES");
    expect(matches[0].severity).toBe("MEDIUM");
  });

  it("escalates repeated refunds to HIGH with heavy history", () => {
    const matches = evaluateSignals("CUSTOMER", "u1", { recentRefunds: 4 });
    expect(matches).toHaveLength(1);
    expect(matches[0].signal).toBe("CUSTOMER_REPEATED_REFUNDS");
    expect(matches[0].severity).toBe("HIGH");
  });

  it("ignores below-threshold activity", () => {
    expect(evaluateSignals("CUSTOMER", "u1", { openDisputes: 1 })).toEqual([]);
    expect(evaluateSignals("CUSTOMER", "u1", { recentRefunds: 1 })).toEqual([]);
    expect(evaluateSignals("CUSTOMER", "u1", { recentCancellations: 2 })).toEqual([]);
  });

  it("flags suppliers with refund disputes and repeated complaints", () => {
    const matches = evaluateSignals("SUPPLIER", "s1", {
      refundDisputes: 4,
      openComplaints: 2,
      unfulfilledOrders: 0,
    });
    const signals = matches.map((match) => match.signal).sort();
    expect(signals).toEqual([
      "SUPPLIER_MULTIPLE_REFUND_DISPUTES",
      "SUPPLIER_REPEATED_COMPLAINTS",
    ]);
    const disputes = matches.find(
      (match) => match.signal === "SUPPLIER_MULTIPLE_REFUND_DISPUTES",
    );
    expect(disputes?.severity).toBe("HIGH");
  });
});