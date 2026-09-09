// Curated category keys with display labels. Stored as String constants on
// Request.category so SQLite (dev) and PostgreSQL (prod) stay in sync.
export const CATEGORIES = {
  GROCERIES: "GROCERIES",
  FOOD: "FOOD",
  FASHION: "FASHION",
  ELECTRONICS: "ELECTRONICS",
  GIFTS: "GIFTS",
  BEAUTY: "BEAUTY",
  HOME_SERVICES: "HOME_SERVICES",
  ERRANDS: "ERRANDS",
  REPAIRS: "REPAIRS",
  EVENTS: "EVENTS",
  PHOTOGRAPHY: "PHOTOGRAPHY",
  OTHER: "OTHER",
} as const;

export type RequestCategory = keyof typeof CATEGORIES;

export const CATEGORY_LABELS: Record<RequestCategory, string> = {
  GROCERIES: "Groceries",
  FOOD: "Food & Drinks",
  FASHION: "Fashion & Clothing",
  ELECTRONICS: "Electronics & Gadgets",
  GIFTS: "Gifts",
  BEAUTY: "Beauty & Personal Care",
  HOME_SERVICES: "Home Services",
  ERRANDS: "Errands & Delivery",
  REPAIRS: "Repairs & Maintenance",
  EVENTS: "Events & Catering",
  PHOTOGRAPHY: "Photography & Media",
  OTHER: "Other / Not sure",
};

// Curated groupings so long category lists (registration, catalogue forms)
// are readable instead of a flat wall of 12 options.
export const CATEGORY_GROUPS = [
  {
    title: "Everyday essentials",
    keys: ["GROCERIES", "FOOD", "ERRANDS"],
  },
  {
    title: "Shopping",
    keys: ["FASHION", "ELECTRONICS", "GIFTS", "BEAUTY"],
  },
  {
    title: "Services & help",
    keys: ["HOME_SERVICES", "REPAIRS", "EVENTS", "PHOTOGRAPHY"],
  },
  {
    title: "Something else",
    keys: ["OTHER"],
  },
] as const satisfies ReadonlyArray<{ title: string; keys: readonly RequestCategory[] }>;

// Keyword sets evaluated IN ORDER. More specific/mutually-exclusive keywords
// come before generic meal words so signals like "a dress for a birthday
// dinner" classify as FASHION, not FOOD.
// Single-word keywords are matched on word boundaries to avoid collisions
// like "dress" inside "address".
const FOOD_STRONG = [
  "food",
  "jollof",
  "fried rice",
  "pizza",
  "shawarma",
  "amala",
  "fufu",
  "snacks",
  "pastries",
  "fried chicken",
  "restaurant",
];
// Weak meal words only classify as FOOD when nothing more specific matched.
const FOOD_WEAK = ["lunch", "dinner", "breakfast", "stew", "grill", "eat"];

const CATEGORY_KEYWORDS: Array<readonly [RequestCategory, readonly string[]]> = [
  [
    "EVENTS",
    [
      "event",
      "wedding",
      "birthday party",
      "anniversary",
      "catering",
      "decorations",
      "baby shower",
      "hen party",
      "concert ticket",
      "party",
    ],
  ],
  [
    "PHOTOGRAPHY",
    [
      "photography",
      "photographer",
      "videography",
      "photo shoot",
      "snapshots",
      "photoshoot",
    ],
  ],
  [
    "BEAUTY",
    [
      "makeup",
      "make up",
      "beauty",
      "wig",
      "weave",
      "manicure",
      "pedicure",
      "lashes",
      "skincare",
      "facial",
      "salon",
      "gel polish",
      "nail",
    ],
  ],
  [
    "REPAIRS",
    [
      "repair",
      "repairs",
      "fixing",
      "refurbish",
      "broken",
      "maintenance",
      "service my",
    ],
  ],
  [
    "HOME_SERVICES",
    [
      "cleaning",
      "cleaner",
      "plumber",
      "plumbing",
      "electrician",
      "electrical",
      "carpenter",
      "painter",
      "painting",
      "mason",
      "handyman",
      "fumigation",
      "pest control",
      "movers",
      "moving service",
      "tiler",
    ],
  ],
  [
    "ERRANDS",
    [
      "errand",
      "errands",
      "courier",
      "dispatch",
      "pick up",
      "pickup",
      "run an errand",
      "shop for me",
      "buy me",
    ],
  ],
  [
    "FOOD",
    FOOD_STRONG,
  ],
  [
    "GROCERIES",
    [
      "grocery",
      "groceries",
      "rice",
      "yam",
      "beans",
      "cooking oil",
      "tomatoes",
      "onions",
      "garri",
      "provisions",
      "detergent",
      "toiletries",
      "seasoning",
    ],
  ],
  [
    "FASHION",
    [
      "dress",
      "fashion",
      "clothes",
      "clothing",
      "shirt",
      "trousers",
      "shoes",
      "sneakers",
      "jewelry",
      "jewellery",
      "tailor",
      "ankara",
      "gele",
      "agbada",
      "suit",
      "handbag",
      "wristwatch",
      "outfit",
      "fabric",
    ],
  ],
  [
    "ELECTRONICS",
    [
      "phone",
      "iphone",
      "android",
      "laptop",
      "television",
      "tv",
      "charger",
      "power bank",
      "earphone",
      "headphone",
      "earpod",
      "gadget",
      "refrigerator",
      "fridge",
      "generator",
      "air conditioner",
      "camera",
      "printer",
      "monitor",
      "speaker",
    ],
  ],
  [
    "GIFTS",
    [
      "gift",
      "gifts",
      "present for",
      "surprise for",
      "valentine",
      "birthday gift",
    ],
  ],
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordMatches(text: string, keyword: string): boolean {
  const pattern = keyword.includes(" ")
    ? text.includes(keyword)
    : new RegExp(`\\b${escapeRegex(keyword)}\\b`).test(text);
  return pattern;
}

function matchesAny(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => keywordMatches(text, keyword));
}

export function detectCategory(text: string): RequestCategory {
  const normalized = normalize(text);
  if (!normalized) {
    return CATEGORIES.OTHER;
  }

  // Pass 1: specific category signals. FOOD only participates with its
  // strong (unambiguous) keywords.
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (matchesAny(normalized, keywords)) {
      return category;
    }
  }

  // Pass 2: weak meal words imply food alone ("dinner for six tonight").
  if (matchesAny(normalized, FOOD_WEAK)) {
    return CATEGORIES.FOOD;
  }

  return CATEGORIES.OTHER;
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category as RequestCategory] ?? CATEGORY_LABELS.OTHER;
}