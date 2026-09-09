// Deterministic notification templates. Titles and bodies read as if written
// by a person; every {var} is replaced from a caller-supplied map at send time,
// so the exact wording of each notification is a plain, auditable constant.

export const NOTIFICATION_KINDS = [
  "REQUEST_CREATED",
  "SUPPLIER_LEAD",
  "SUPPLIER_APPLICATION",
  "QUOTE_READY",
  "PAYMENT_PAID",
  "ORDER_PROCESSING",
  "DELIVERED",
  "LOW_STOCK",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

interface Template {
  title: string;
  body: string;
}

export const NOTIFICATION_TEMPLATES: Record<NotificationKind, Template> = {
  REQUEST_CREATED: {
    title: "We received your request {ref}",
    body: "Our team is researching {summary} and will share options with you shortly.",
  },
  SUPPLIER_LEAD: {
    title: "New request matches your catalogue: {ref}",
    body: "{summary} in {categoryLabel}. Take a look and get ready — we may reach out.",
  },
  SUPPLIER_APPLICATION: {
    title: "New supplier application: {businessName}",
    body: "{businessName} applied in {categoryLabel}. Review and approve them.",
  },
  QUOTE_READY: {
    title: "A new option is ready: {ref}",
    body: "{productName} for {priceLabel}. Review it on your request when you are ready.",
  },
  PAYMENT_PAID: {
    title: "Payment received for {ref}",
    body: "Your payment of {amountLabel} for {summary} has been received. Fulfilment will begin.",
  },
  ORDER_PROCESSING: {
    title: "Order paid: {ref}",
    body: "The customer paid {amountLabel} for {summary}. Get ready to fulfil this order.",
  },
  DELIVERED: {
    title: "Delivered: {ref}",
    body: "{summary} has been delivered. Please confirm everything is in order.",
  },
  LOW_STOCK: {
    title: "Low stock: {productName}",
    body: "Only {quantity} left of {productName}. Restock or update your catalogue when you can.",
  },
};

export function isNotificationKind(value: string): value is NotificationKind {
  return (NOTIFICATION_KINDS as readonly string[]).includes(value);
}

// Replace every {key} with the matching variable. Unknown variables resolve to
// empty string so a missing value can never leak raw braces into an inbox;
// unrecognised kinds are typed away before they reach this function.
export function renderTemplate(template: Template, vars: Record<string, string>): {
  title: string;
  body: string;
} {
  const apply = (text: string) =>
    text.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) =>
      Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : "",
    );
  return { title: apply(template.title), body: apply(template.body) };
}