// Provider-agnostic delivery contracts. Every logistics concern routes through
// this interface so additional providers can be registered later without
// touching routes, services, serializers or UI. All money stays in kobo.

export type DeliveryPriority = "STANDARD" | "EXPRESS";

export interface DeliveryPricingInput {
  dropLocation: string | null;
  priority?: DeliveryPriority;
  now?: Date;
}

export interface FeeLine {
  label: string;
  amountKobo: number;
}

export interface DeliveryPricingResult {
  feeKobo: number;
  breakdown: FeeLine[];
  eta: Date | null;
  method: string;
}

export interface DeliveryProvider {
  key: string;
  label: string;
  description: string;
  supportsTracking: boolean;
  // Compute the delivery fee + ETA deterministically from stored fields. This
  // is the single source of truth for the fee — client input never sets it.
  quote(input: DeliveryPricingInput): DeliveryPricingResult;
  // External provider tracking link for a reference, or null when the provider
  // has no outbound tracking (the platform tracker is used instead).
  trackingUrl(trackingReference: string): string | null;
}

export interface DeliveryProviderDescriptor {
  key: string;
  label: string;
  description: string;
  supportsTracking: boolean;
}

export const DELIVERY_PRIORITIES: readonly DeliveryPriority[] = [
  "STANDARD",
  "EXPRESS",
];

export function isDeliveryPriority(value: string): value is DeliveryPriority {
  return (DELIVERY_PRIORITIES as readonly string[]).includes(value);
}

export function deliveryPriorityLabel(priority: string): string {
  return priority === "EXPRESS" ? "Express" : "Standard";
}