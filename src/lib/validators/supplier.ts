import { z } from "zod";

/**
 * Registration: a first-time supplier records their profile. Some fields
 * are blank/optional — informal suppliers rarely have perfect information
 * upfront and we want a low-friction onboarding flow.
 */
export const supplierRegistrationSchema = z.object({
  businessName: z
    .string()
    .min(1, "Business name is required.")
    .max(200, "Business name must be 200 characters or fewer."),
  description: z
    .string()
    .max(1000, "Description must be 1 000 characters or fewer.")
    .optional()
    .or(z.literal("")),
  contactName: z
    .string()
    .max(200, "Contact name must be 200 characters or fewer.")
    .optional()
    .or(z.literal("")),
  phone: z.string().max(50, "Phone must be 50 characters or fewer.").optional().or(z.literal("")),
  whatsapp: z.string().max(50, "WhatsApp must be 50 characters or fewer.").optional().or(z.literal("")),
  email: z.string().email("Enter a valid email address.").min(1, "Email is required."),
  categories: z.array(z.string()).default([]),
  serviceArea: z
    .string()
    .max(200, "Service area must be 200 characters or fewer.")
    .optional()
    .or(z.literal("")),
  operatingHours: z
    .string()
    .max(200, "Operating hours must be 200 characters or fewer.")
    .optional()
    .or(z.literal("")),
  paymentDetails: z
    .string()
    .max(500, "Payment details must be 500 characters or fewer.")
    .optional()
    .or(z.literal("")),
  logoUrl: z
    .string()
    .max(500, "Logo URL must be 500 characters or fewer.")
    .optional()
    .or(z.literal("")),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(100, "Password must be 100 characters or fewer."),
  name: z
    .string()
    .min(1, "Name is required.")
    .max(100, "Name must be 100 characters or fewer."),
});

export type SupplierRegistrationInput = z.infer<typeof supplierRegistrationSchema>;

/**
 * Profile update (PUT /api/suppliers/profile) — identical shape to registration
 * minus password (profile editing never touches authentication secrets). All
 * fields are optional so the supplier can edit details in any order; email is
 * preserved from the account when omitted.
 */
export const supplierProfileUpdateSchema = supplierRegistrationSchema
  .omit({ password: true })
  .partial();

export type SupplierProfileUpdateInput = z.infer<typeof supplierProfileUpdateSchema>;

/**
 * Offering CRUD. Price is optional (unpriced / negotiable), availability is
 * optional (informal suppliers may not track inventory).
 */
export const offeringInputSchema = z.object({
  category: z.string().min(1, "Category is required."),
  title: z.string().min(1, "Title is required.").max(200, "Title must be 200 characters or fewer."),
  description: z
    .string()
    .max(1000, "Description must be 1 000 characters or fewer.")
    .optional()
    .or(z.literal("")),
  priceNaira: z
    .number()
    .nonnegative("Price must be zero or positive.")
    .optional(),
  currency: z.string().default("NGN"),
  availability: z
    .string()
    .max(200, "Availability must be 200 characters or fewer.")
    .optional()
    .or(z.literal("")),
  location: z
    .string()
    .max(200, "Location must be 200 characters or fewer.")
    .optional()
    .or(z.literal("")),
  deliveryDetail: z
    .string()
    .max(200, "Delivery detail must be 200 characters or fewer.")
    .optional()
    .or(z.literal("")),
  images: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  quantityAvailable: z
    .number()
    .int("Quantity must be a whole number.")
    .nonnegative("Quantity must be zero or positive.")
    .nullable()
    .optional(),
});

export type OfferingInput = z.infer<typeof offeringInputSchema>;

/**
 * Supplier requests an action on an inbound request.
 */
export const supplierRequestActionSchema = z.object({
  action: z.enum(["accept", "decline"]),
});

export type SupplierRequestActionInput = z.infer<typeof supplierRequestActionSchema>;

/**
 * Supplier marks an order fulfilled with optional notes.
 */
export const supplierFulfillmentSchema = z.object({
  earnedNaira: z
    .number()
    .nonnegative("Earned amount must be zero or positive.")
    .optional(),
  notes: z
    .string()
    .max(500, "Notes must be 500 characters or fewer.")
    .optional()
    .or(z.literal("")),
});

export type SupplierFulfillmentInput = z.infer<typeof supplierFulfillmentSchema>;

/**
 * Admin supplier review action.
 */
export const supplierReviewSchema = z.object({
  action: z.enum(["approve", "reject", "suspend"]),
  reason: z
    .string()
    .max(500, "Reason must be 500 characters or fewer.")
    .optional()
    .or(z.literal("")),
});

export type SupplierReviewInput = z.infer<typeof supplierReviewSchema>;
