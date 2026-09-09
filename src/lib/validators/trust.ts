import { z } from "zod";
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_SUBJECT_TYPES,
  DISPUTE_REASONS,
  RATING_MAX,
  RATING_MIN,
} from "@/lib/trust/types";

// Ratings are 1–5 integers; the comment is optional and free-form.
export const submitRatingSchema = z
  .object({
    supplierId: z.string().trim().min(1, "Supplier is required."),
    score: z
      .number()
      .int("Rating must be a whole number.")
      .min(RATING_MIN, `Rating must be at least ${RATING_MIN}.`)
      .max(RATING_MAX, `Rating must be at most ${RATING_MAX}.`),
    comment: z
      .string()
      .trim()
      .max(1000, "Comment must be under 1000 characters.")
      .optional(),
  })
  .strict();

export type SubmitRatingInput = z.infer<typeof submitRatingSchema>;

export const raiseDisputeSchema = z
  .object({
    reason: z.enum(DISPUTE_REASONS),
    description: z
      .string()
      .trim()
      .min(10, "Please describe the issue in a little more detail.")
      .max(3000, "Description must be under 3000 characters."),
    expectedResolution: z
      .string()
      .trim()
      .max(500, "Expected resolution must be under 500 characters.")
      .optional(),
  })
  .strict();

export type RaiseDisputeInput = z.infer<typeof raiseDisputeSchema>;

export const raiseComplaintSchema = z
  .object({
    subjectType: z.enum(COMPLAINT_SUBJECT_TYPES),
    subjectId: z.string().trim().min(1, "Subject is required."),
    requestId: z.string().trim().optional(),
    category: z.enum(COMPLAINT_CATEGORIES),
    description: z
      .string()
      .trim()
      .min(10, "Please describe the issue in a little more detail.")
      .max(3000, "Description must be under 3000 characters."),
  })
  .strict();

export type RaiseComplaintInput = z.infer<typeof raiseComplaintSchema>;

export const resolveDisputeSchema = z
  .object({
    decision: z.enum(["REFUND", "NO_REFUND"]),
    resolutionNote: z
      .string()
      .trim()
      .max(2000, "Resolution note must be under 2000 characters.")
      .optional(),
  })
  .strict();

export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;

export const resolveComplaintSchema = z
  .object({
    resolution: z
      .string()
      .trim()
      .min(1, "Resolution is required.")
      .max(2000, "Resolution must be under 2000 characters."),
  })
  .strict();

export const reviewFraudFlagSchema = z
  .object({
    status: z.enum(["REVIEWED", "CLEARED"]),
    note: z
      .string()
      .trim()
      .max(2000, "Note must be under 2000 characters.")
      .optional(),
  })
  .strict();