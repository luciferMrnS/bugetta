import { describe, expect, it } from "vitest";
import {
  DELIVERY_LIFECYCLE,
  DELIVERY_LIFECYCLE_POSITION,
  DELIVERY_STATUS,
  DELIVERY_STATUS_TRANSITIONS,
  TERMINAL_DELIVERY_STATUSES,
  deliveryAllowedTransitions,
  deliveryStatusLabel,
  isDeliveryStatus,
  isMainlineDeliveryStatus,
  isTerminalDeliveryStatus,
} from "@/lib/delivery/status";

describe("delivery status machine", () => {
  it("labels every status deterministically", () => {
    for (const status of Object.values(DELIVERY_STATUS)) {
      expect(deliveryStatusLabel(status).length).toBeGreaterThan(3);
    }
  });

  it("recognizes statuses and rejects junk", () => {
    expect(isDeliveryStatus("ASSIGNED")).toBe(true);
    expect(isDeliveryStatus("DELIVERED")).toBe(true);
    expect(isDeliveryStatus("LOST")).toBe(false);
  });

  it("keeps the happy-path lifecycle strictly ordered", () => {
    expect(DELIVERY_LIFECYCLE).toEqual([
      "ASSIGNED",
      "PICKED_UP",
      "IN_TRANSIT",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
    ]);
    expect(DELIVERY_LIFECYCLE_POSITION.DELIVERED).toBe(4);
    expect(DELIVERY_LIFECYCLE_POSITION.ASSIGNED).toBe(0);
  });

  it("guards transitions and never allows terminal moves backwards", () => {
    expect(deliveryAllowedTransitions("ASSIGNED")).toEqual([
      "PICKED_UP",
      "FAILED",
      "CANCELLED",
    ]);
    expect(deliveryAllowedTransitions("OUT_FOR_DELIVERY")).toEqual([
      "DELIVERED",
      "FAILED",
    ]);
    expect(deliveryAllowedTransitions("DELIVERED")).toEqual([]);
    expect(deliveryAllowedTransitions("CANCELLED")).toEqual([]);
    expect(deliveryAllowedTransitions("FAKE")).toEqual([]);

    for (const [from, tos] of Object.entries(DELIVERY_STATUS_TRANSITIONS)) {
      for (const to of tos) {
        expect(from, `reverse move ${to} → ${from}`).not.toBe(to);
      }
      // None of these move a delivery backwards through the lifecycle:
      for (const [from, tos] of Object.entries(DELIVERY_STATUS_TRANSITIONS)) {
        const fromPos = DELIVERY_LIFECYCLE_POSITION[
          from as keyof typeof DELIVERY_LIFECYCLE_POSITION
        ];
        for (const to of tos) {
          const toPos = DELIVERY_LIFECYCLE_POSITION[
            to as keyof typeof DELIVERY_LIFECYCLE_POSITION
          ];
          if (fromPos !== undefined && toPos !== undefined) {
            expect(toPos, `${from} → ${to}`).toBeGreaterThan(fromPos);
          }
        }
      }
    }
  });

  it("flags only the truly terminal statuses", () => {
    expect(isTerminalDeliveryStatus("DELIVERED")).toBe(true);
    expect(isTerminalDeliveryStatus("CANCELLED")).toBe(true);
    expect(isTerminalDeliveryStatus("FAILED")).toBe(false);
    expect(TERMINAL_DELIVERY_STATUSES).toContain("DELIVERED");
  });

  it("marks lifecycle steps, not concern states", () => {
    expect(isMainlineDeliveryStatus("IN_TRANSIT")).toBe(true);
    expect(isMainlineDeliveryStatus("FAILED")).toBe(false);
    expect(isMainlineDeliveryStatus("CANCELLED")).toBe(false);
  });
});