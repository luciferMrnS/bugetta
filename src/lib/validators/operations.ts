import { z } from "zod";
import {
  isRequestStatus,
  REQUEST_STATUS_TRANSITIONS,
} from "@/lib/requests/status";

const IMAGE_URL_MAX = 500;
const httpUrl = (value: string) => /^https?:\/\/\S+$/i.test(value);

const optionalPriceNaira = z
  .number()
  .int("Price must be a whole number of naira.")
  .min(0, "Price cannot be negative.")
  .max(1_000_000_000, "Price seems too high.");

const optionalFeeNaira = z
  .number()
  .int("Fee must be a whole number of naira.")
  .min(0, "Fee cannot be negative.")
  .max(100_000_000, "Fee seems too high.");

const imageLines = z
  .array(
    z
      .string()
      .trim()
      .min(1, "Image links cannot be empty.")
      .max(IMAGE_URL_MAX, "Image links must be 500 characters or fewer.")
      .refine(httpUrl, "Each image link must be a valid http(s) URL."),
  )
  .max(5, "You can attach up to 5 image links.")
  .optional();

export const createOptionSchema = z.object({
  supplier: z
    .string()
    .trim()
    .min(1, "Supplier is required.")
    .max(160, "Supplier must be 160 characters or fewer."),
  productName: z
    .string()
    .trim()
    .min(1, "Product or service is required.")
    .max(200, "Product or service must be 200 characters or fewer."),
  priceNaira: optionalPriceNaira.nullable().optional(),
  availability: z
    .string()
    .trim()
    .min(1, "Availability cannot be empty.")
    .max(200, "Availability must be 200 characters or fewer.")
    .optional(),
  estimatedDelivery: z
    .string()
    .trim()
    .min(1, "Estimated delivery cannot be empty.")
    .max(120, "Estimated delivery must be 120 characters or fewer.")
    .optional(),
  notes: z
    .string()
    .trim()
    .min(1, "Notes cannot be empty.")
    .max(2000, "Notes must be under 2000 characters.")
    .optional(),
  terms: z
    .string()
    .trim()
    .min(1, "Terms cannot be empty.")
    .max(4000, "Terms must be under 4000 characters.")
    .optional(),
  images: imageLines,
});

function isValidDateMonthDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime());
}

export const createQuoteSchema = z.object({
  productName: z
    .string()
    .trim()
    .min(1, "Product or service is required.")
    .max(200, "Product or service must be 200 characters or fewer."),
  priceNaira: z
    .number()
    .int("Price must be a whole number of naira.")
    .min(0, "Price cannot be negative.")
    .max(1_000_000_000, "Price seems too high."),
  serviceFeeNaira: optionalFeeNaira.optional(),
  deliveryFeeNaira: optionalFeeNaira.optional(),
  information: z
    .string()
    .trim()
    .min(1, "Information cannot be empty.")
    .max(2000, "Information must be under 2000 characters.")
    .optional(),
  images: imageLines,
  estimatedDelivery: z
    .string()
    .trim()
    .min(1, "Estimated delivery cannot be empty.")
    .max(120, "Estimated delivery must be 120 characters or fewer.")
    .optional(),
  terms: z
    .string()
    .trim()
    .min(1, "Terms cannot be empty.")
    .max(4000, "Terms must be under 4000 characters.")
    .optional(),
  validUntil: z
    .string()
    .refine(isValidDateMonthDay, {
      message: "Offer validity must be a valid date.",
    })
    .optional(),
  optionId: z.string().trim().min(1).optional(),
});

// Customer decisions on a quote batch. Deliberately strict: only the quote id
// and the chosen action are accepted. Amounts are NEVER read from the client,
// so a crafted payload carrying its own totals is rejected outright.
export const QUOTE_DECISION_ACTIONS = ["SELECT", "REJECT", "REQUEST_ANOTHER"] as const;
export type QuoteDecisionAction = (typeof QUOTE_DECISION_ACTIONS)[number];

// SELECT / REJECT always require a quoteId; REQUEST_ANOTHER requires only the
// action itself. Discriminated by action so zod rejects invalid combinations.
const selectOrRejectDecision = z
  .object({
    quoteId: z.string().trim().min(1, "A quote is required."),
    action: z.enum(["SELECT", "REJECT"]),
  })
  .strict();

const requestAnotherDecision = z
  .object({
    action: z.literal("REQUEST_ANOTHER"),
  })
  .strict();

export const decisionSchema = z.discriminatedUnion("action", [
  selectOrRejectDecision,
  requestAnotherDecision,
]);

export const updateStatusSchema = z.object({
  status: z
    .string()
    .trim()
    .refine(isRequestStatus, { message: "Unknown status." }),
});

// Builds the allowed-targets list a client needs (keyed for serialization).
export const STATUS_CHOICES = Object.fromEntries(
  (Object.keys(REQUEST_STATUS_TRANSITIONS) as Array<keyof typeof REQUEST_STATUS_TRANSITIONS>).map(
    (status) => [status, REQUEST_STATUS_TRANSITIONS[status]],
  ),
) as Record<string, readonly string[]>;

export type CreateOptionInputSchema = z.infer<typeof createOptionSchema>;
export type CreateQuoteInputSchema = z.infer<typeof createQuoteSchema>;