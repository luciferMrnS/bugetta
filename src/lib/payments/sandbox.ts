import { randomHex } from "@/lib/payments/provider";

// The "sandbox" gateway: a deterministic, DB-backed simulation of a payment
// provider. It issues checkout intents (reference + one-time capability token)
// and signs the webhook events our own webhook endpoint verifies. Swapping in a
// real provider later means implementing the same interface and driving the
// same event shapes — the rest of the pipeline is provider-agnostic.

const TOKEN_HEX_BYTES = 24;
const REFERENCE_ALNUM = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomAlnum(length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += REFERENCE_ALNUM[Math.floor(Math.random() * REFERENCE_ALNUM.length)];
  }
  return out;
}

export interface SandboxCheckoutIntent {
  provider: "sandbox";
  providerReference: string;
  providerToken: string;
  paymentUrl: string; // the page the customer browses to pay (public page)
}

// Open a checkout session for a platform payment reference.
export function sandboxCreateCheckout(paymentReference: string): SandboxCheckoutIntent {
  const providerReference = `SBOX-${randomAlnum(10)}`;
  const providerToken = randomHex(TOKEN_HEX_BYTES);
  return {
    provider: "sandbox",
    providerReference,
    providerToken,
    paymentUrl: `/pay/${paymentReference}?token=${providerToken}`,
  };
}

// The gateway's payment-page path is stable (no per-intent route).
export const SANDBOX_CHECKOUT_PATH = "/pay";