// Deterministic delivery pricing used by the sandbox provider. Distance isn't
// known (no real geo data yet), so the fee is derived from the drop area with
// transparent rules: an area-aware base in kobo plus an express surcharge,
// rounded to whole naira. ETA is a fixed end-of-day offset per zone/priority.
// This is the seam where a real provider's price engine would plug in.

import type {
  DeliveryPricingInput,
  DeliveryPricingResult,
  DeliveryPriority,
  FeeLine,
} from "@/lib/delivery/providers/types";

export type DeliveryZone = "METRO" | "OTHER" | "UNKNOWN";

// Lagos metro areas where a denser courier network exists.
const LAGOS_METRO_AREAS = [
  "lekki",
  "victoria island",
  "ikoyi",
  "ikeja",
  "yaba",
  "gbagada",
  "surulere",
  "maryland",
  "oworonshoki",
  "apapa",
  "ajah",
  "festac",
  "sangotedo",
  "lagos island",
  "lagos mainland",
  "lagos",
];

const BASE_NAIRA: Record<DeliveryZone, number> = {
  METRO: 3_000,
  OTHER: 5_000,
  UNKNOWN: 5_000,
};

const EXPRESS_DAYS: Record<DeliveryZone, number> = {
  METRO: 1,
  OTHER: 2,
  UNKNOWN: 2,
};

const STANDARD_DAYS: Record<DeliveryZone, number> = {
  METRO: 2,
  OTHER: 3,
  UNKNOWN: 3,
};

export function deliveryZoneFor(dropLocation: string | null): DeliveryZone {
  if (!dropLocation) {
    return "UNKNOWN";
  }
  const normalized = dropLocation.toLowerCase().replace(/\s+/g, " ").trim();
  for (const area of LAGOS_METRO_AREAS) {
    if (new RegExp(`(?:^|[, ])${area}(?:[, ]|$)`).test(normalized)) {
      return "METRO";
    }
  }
  return "OTHER";
}

function etaFor(
  zone: DeliveryZone,
  priority: DeliveryPriority,
  now: Date,
): Date {
  const days = (priority === "EXPRESS" ? EXPRESS_DAYS : STANDARD_DAYS)[zone];
  const copy = new Date(now);
  copy.setDate(copy.getDate() + days);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

const ZONE_METHOD: Record<DeliveryZone, string> = {
  METRO: "Base for a Lagos metro area.",
  OTHER: "Base for a non-metro area.",
  UNKNOWN: "No area recorded — base rate, confirm the area with the customer.",
};

export function calculateDeliveryFee(
  input: DeliveryPricingInput,
): DeliveryPricingResult {
  const priority = input.priority ?? "STANDARD";
  const now = input.now ?? new Date();
  const zone = deliveryZoneFor(input.dropLocation);

  const baseKobo = BASE_NAIRA[zone] * 100;
  const lines: FeeLine[] = [
    { label: `Base delivery (${zone.toLowerCase() === "metro" ? "metropolitan" : "area"})`, amountKobo: baseKobo },
  ];
  if (priority === "EXPRESS") {
    const surchargeKobo = Math.round((baseKobo * 0.5) / 100) * 100;
    lines.push({ label: "Express priority", amountKobo: surchargeKobo });
  }
  const feeKobo = lines.reduce((sum, line) => sum + line.amountKobo, 0);

  return {
    feeKobo,
    breakdown: lines,
    // ETA is always derived (deterministic); never stored from a client.
    eta: etaFor(zone, priority, now),
    method: ZONE_METHOD[zone],
  };
}