import { z } from "zod";

// What the sandbox checkout page sends when the customer confirms. The token is
// the one-time capability issued at payment initialization.
export const sandboxChargeSchema = z
  .object({
    reference: z.string().trim().min(1, "Payment reference is required."),
    token: z.string().trim().min(1, "Checkout token is missing."),
    outcome: z
      .enum(["success", "decline"])
      .optional()
      .default("success"),
  })
  .strict();

export type SandboxChargeInput = z.infer<typeof sandboxChargeSchema>;

// Refund reasons are optional; the amount is always the full payment amount
// (computed server-side, never taken from the client).
export const createRefundSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(1, "Reason cannot be empty.")
      .max(2000, "Reason must be under 2000 characters.")
      .optional(),
  })
  .strict();

export type CreateRefundInput = z.infer<typeof createRefundSchema>;