import { z } from "zod";
import {
  isDeliveryPriority,
  DELIVERY_PRIORITIES,
} from "@/lib/delivery/providers/types";
import { isDeliveryStatus } from "@/lib/delivery/status";

// Client input for creating/assigning a delivery. Money is deliberately never
// read here: the fee is computed server-side by the delivery provider.
export const createDeliverySchema = z.object({
  provider: z
    .string()
    .trim()
    .min(1, "Provider cannot be empty.")
    .max(60, "Provider key must be 60 characters or fewer.")
    .optional(),
  priority: z
    .string()
    .trim()
    .refine(isDeliveryPriority, {
      message: `Priority must be one of: ${DELIVERY_PRIORITIES.join(", ")}.`,
    })
    .optional(),
  dropLocation: z
    .string()
    .trim()
    .min(1, "Drop location cannot be empty.")
    .max(200, "Drop location must be 200 characters or fewer.")
    .optional(),
  pickup: z
    .string()
    .trim()
    .min(1, "Pickup cannot be empty.")
    .max(200, "Pickup must be 200 characters or fewer.")
    .optional(),
  notes: z
    .string()
    .trim()
    .min(1, "Notes cannot be empty.")
    .max(2000, "Notes must be under 2000 characters.")
    .optional(),
});

// Status transitions for a delivery. Proof fields are only meaningful with
// DELIVERED; a delivered delivery may still arrive without proof (recorded
// later as a note), but the route enforces the timing.
export const updateDeliveryStatusSchema = z.object({
  status: z
    .string()
    .trim()
    .refine(isDeliveryStatus, { message: "Unknown delivery status." }),
  recipientName: z
    .string()
    .trim()
    .min(1, "Recipient name cannot be empty.")
    .max(120, "Recipient name must be 120 characters or fewer.")
    .optional(),
  proofType: z
    .string()
    .trim()
    .min(1, "Proof type cannot be empty.")
    .max(120, "Proof type must be 120 characters or fewer.")
    .optional(),
  proofReference: z
    .string()
    .trim()
    .min(1, "Proof reference cannot be empty.")
    .max(300, "Proof reference must be 300 characters or fewer.")
    .optional(),
  proofNote: z
    .string()
    .trim()
    .min(1, "Proof note cannot be empty.")
    .max(2000, "Proof note must be under 2000 characters.")
    .optional(),
  notes: z
    .string()
    .trim()
    .min(1, "Notes cannot be empty.")
    .max(2000, "Notes must be under 2000 characters.")
    .optional(),
});