import { z } from "zod";

const IMAGE_URL_MAX = 500;

const httpUrl = (value: string) => /^https?:\/\/\S+$/i.test(value);

function isValidFutureDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return parsed.getTime() >= today.getTime();
}

const requestItemSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Each item needs a name.")
    .max(120, "Item names must be 120 characters or fewer."),
  quantity: z
    .string()
    .trim()
    .max(80, "Quantity must be 80 characters or fewer.")
    .optional(),
  note: z
    .string()
    .trim()
    .max(300, "Notes must be 300 characters or fewer.")
    .optional(),
});

export const createRequestSchema = z.object({
  description: z
    .string()
    .trim()
    .min(10, "Tell us a little more so we can find the right thing for you.")
    .max(4000, "Please keep your request under 4000 characters."),
  items: z
    .array(requestItemSchema)
    .max(25, "You can list up to 25 items.")
    .optional(),
  budgetNaira: z
    .number()
    .int("Budget must be a whole number of naira.")
    .min(0, "Budget cannot be negative.")
    .max(50_000_000, "Budget seems too high. Did you mean a smaller amount?")
    .nullable()
    .optional(),
  quantity: z
    .string()
    .trim()
    .min(1, "Quantity tells us the size of what you need.")
    .max(120, "Quantity must be 120 characters or fewer.")
    .optional(),
  location: z
    .string()
    .trim()
    .min(1, "Where should this be delivered or done?")
    .max(160, "Location must be 160 characters or fewer.")
    .optional(),
  deliveryDeadline: z
    .string()
    .refine(isValidFutureDate, {
      message: "Choose a valid date that is not in the past.",
    })
    .optional(),
  instructions: z
    .string()
    .trim()
    .min(1, "Instructions cannot be empty.")
    .max(2000, "Instructions must be under 2000 characters.")
    .optional(),
  images: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Image links cannot be empty.")
        .max(IMAGE_URL_MAX, "Image links must be 500 characters or fewer.")
        .refine(httpUrl, "Each image link must be a valid http(s) URL."),
    )
    .max(5, "You can attach up to 5 image links.")
    .optional(),
});

export type CreateRequestInputSchema = z.infer<typeof createRequestSchema>;