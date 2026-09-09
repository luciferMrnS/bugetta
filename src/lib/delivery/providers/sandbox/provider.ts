import type { DeliveryProvider } from "@/lib/delivery/providers/types";
import { calculateDeliveryFee } from "@/lib/delivery/providers/sandbox/pricing";

// The built-in logistics provider. It computes fees and ETAs from deterministic
// rules (no network, no real courier API) so the full delivery lifecycle —
// assignment, fee, ETA, tracking references, status, proof — is exercised
// end-to-end. Real couriers integrate later by registering a provider behind
// the same contract.
export const sandboxProvider: DeliveryProvider = {
  key: "sandbox",
  label: "Bugetta delivery (sandbox)",
  description:
    "Built-in logistics provider. Fees and ETAs are derived from transparent zone rules; the platform tracker shows progress.",
  supportsTracking: true,
  quote: calculateDeliveryFee,
  trackingUrl: () => null, // tracking is handled in-platform until a courier link exists
};