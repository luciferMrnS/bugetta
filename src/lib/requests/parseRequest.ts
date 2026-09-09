// Deterministic, testable natural-language parsing for request intake.
// The plain description the customer sends is stored verbatim; these
// functions only derive lighter-weight metadata (summary, items, budget,
// deadline) for lists and matching.

const MAX_ITEM_LENGTH = 60;
const MAX_ITEMS = 15;
const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const LEADING_NOISE = /\b(i need|i want|need|want|please|also)\b\s*/i;
const BUDGET_MARKERS =
  /(naira|ngn|₦|budget|budget of|more than|no more than|not more than|at most|at least|up to|under|below|less than|within|above|over|max|maximum|only|about|around|roughly|approximately)/i;
const META_MARKERS =
  /(deliver|delivered|delivery|location|by\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|this week|next week)|before\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\bfamily\b|deadline)/i;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// --- Budget ---------------------------------------------------------------

// Matches "₦50,000", "N50,000", "NGN 50,000", "50,000 naira", "30k naira".
// The amount pattern requires at least one digit (commas only between digits).
const PREFIX_AMOUNT = /(?:₦|ngn|naira|\bn)\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)([km])?/i;
const SUFFIX_AMOUNT =
  /(\d+(?:,\d{3})*(?:\.\d{1,2})?)([km])?\s*(?:naira|ngn)\b/i;
// Spoken budget intents with no currency symbol, e.g. "don't have more than
// 50k", "can only spend 50000", "max of 30k". The lead-in markers make bare
// amounts budget words rather than quantities.
const VERBAL_INTENT =
  /(?:at\s+most|no\s+more\s+than|not\s+more\s+than|more\s+than|at\s+least|up\s+to|under\s+|below\s+|less\s+than\s+|within\s+|above\s+|over\s+|max(?:imum)?\s+(?:of\s+)?|only\s+|just\s+|about\s+|around\s+|roughly\s+|approximately\s+|budget(?:ing)?\s+(?:for\s+|of\s+)?|spend(?:ing)?\s+(?:as\s+much\s+as\s+|more\s+than\s+|up\s+to\s+)?|can\s+afford\s+|able\s+to\s+spend\s+|have\s+(?:only\s+)?)/i;
const VERBAL_AMOUNT = new RegExp(
  `${VERBAL_INTENT.source}(?:₦|ngn|naira|\\bn)?\\s*(\\d+(?:,\\d{3})*(?:\\.\\d{1,2})?)([km])?`,
  "i",
);

// Amount extraction keeps the ₦ symbol, so it must not be normalized away.
function normalizeForAmounts(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function extractBudgetKobo(text: string): number | null {
  const normalized = normalizeForAmounts(text);
  if (!normalized) {
    return null;
  }

  for (const pattern of [PREFIX_AMOUNT, VERBAL_AMOUNT, SUFFIX_AMOUNT]) {
    const match = normalized.match(pattern);
    if (match) {
      const multiplier = match[2] === "m" ? 1_000_000 : match[2] === "k" ? 1_000 : 1;
      const value = Number(match[1].replace(/,/g, "")) * multiplier;
      if (!Number.isFinite(value) || value < 0) {
        continue;
      }
      // A symbol-less number that isn't a k/m shorthand is far too small to
      // be a money amount (it's usually a quantity, e.g. "only 2 bags").
      if (multiplier === 1 && pattern === VERBAL_AMOUNT && value < 1000) {
        continue;
      }
      return Math.round(value * 100);
    }
  }

  return null;
}

// --- Items ----------------------------------------------------------------

// Splits free text into candidate item lines:
// commas/semicolons/periods/newlines/bullets, plus short " and " lists.
function splitItems(text: string): string[] {
  const cleaned = text
    .replace(/\r/g, "")
    .replace(/^[\s*•·\-–—]+/gm, "")
    .replace(/^\s*\d+[.)]\s*/gm, "");

  let segments: string[] = [];
  for (const line of cleaned.split(/\n+/)) {
    segments = segments.concat(line.split(/[,;.]+/));
  }

  const expanded: string[] = [];
  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.length <= 80 && / and /.test(trimmed)) {
      const parts = trimmed.split(/\s+and\s+/i).map((p) => p.trim());
      if (parts.length >= 2 && parts.every((p) => p.length >= 1)) {
        expanded.push(...parts);
        continue;
      }
    }
    expanded.push(trimmed);
  }

  return expanded;
}

function looksLikeItem(candidate: string): boolean {
  const value = candidate.trim();
  if (value.length < 2 || value.length > MAX_ITEM_LENGTH) {
    return false;
  }
  if (/^\d+(\.\d+)?([km]|%)?$/.test(value)) {
    return false;
  }
  // Drop segments that carry budget/deadline/delivery meta information.
  if (BUDGET_MARKERS.test(value) && /\d/.test(value)) {
    return false;
  }
  if (META_MARKERS.test(value)) {
    return false;
  }
  return true;
}

export function extractItemLines(text: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];

  for (const candidate of splitItems(text)) {
    if (items.length >= MAX_ITEMS) {
      break;
    }
    const item = candidate.replace(LEADING_NOISE, "").trim();
    const normalized = normalize(item);
    if (normalized.length === 0 || !looksLikeItem(normalized)) {
      continue;
    }
    const key = normalized;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push(item);
  }

  return items;
}

// --- Deadline -------------------------------------------------------------

function toEndOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function nextWeekday(weekdayIndex: number, now: Date): Date {
  const daysAhead = (weekdayIndex - now.getDay() + 7) % 7 || 7;
  const date = new Date(now);
  date.setDate(date.getDate() + daysAhead);
  return toEndOfDay(date);
}

export function extractDeadline(text: string, now = new Date()): Date | null {
  const normalized = normalize(text);
  if (!normalized) {
    return null;
  }

  if (/\btomorrow\b/.test(normalized)) {
    const date = new Date(now);
    date.setDate(date.getDate() + 1);
    return toEndOfDay(date);
  }

  if (/\b(?:today|tonight|this evening|this afternoon)\b/.test(normalized)) {
    return toEndOfDay(now);
  }

  const inDays = normalized.match(/\bin\s+(\d+)\s+days?\b/);
  if (inDays) {
    const date = new Date(now);
    date.setDate(date.getDate() + Number(inDays[1]));
    return toEndOfDay(date);
  }

  if (/\bnext week\b/.test(normalized)) {
    const date = new Date(now);
    date.setDate(date.getDate() + 7);
    return toEndOfDay(date);
  }

  for (let i = 0; i < WEEKDAYS.length; i += 1) {
    const weekday = WEEKDAYS[i];
    const match = normalized.match(
      new RegExp(`\\b(?:by\\s+|on\\s+|before\\s+)?${weekday}\\b`),
    );
    if (match) {
      return nextWeekday(i, now);
    }
  }

  return null;
}

// --- Summary --------------------------------------------------------------

// Short "Needs X" label shown on list cards; the stored description remains
// the exact words the customer sent and is what the team reads on the detail
// page. Prefers the object of the last "need/want" phrase and cuts budget,
// deadline and delivery clauses so cards stay scannable.
const NEED_MARKER =
  /\b(?:(?:i|we|he|she|they|you)\s+)?(?:would\s+|really\s+|just\s+|urgently\s+)?(?:wanted|want|would\s+like|needs|needed|need)\s+(?:you\s+to\s+|to\s+)?/gi;
const NEED_LEAD_ACTION =
  /^(?:to\s+)?(?:buy|get|purchase|order|source|arrange|find|hire|fix|repair|make|cook|deliver|have|pick|help)\s+/i;
const NEED_CUT =
  /\s+(?:but\s+|so\s+|until\s+|and\s+i\s+|i\s+(?:don['']?t|do\s+not|cant|cannot|can['']?t|have\s+|need\s+|want\s+)|budget\b|cost\s+|price\s+|deliver\b|delivered\b|delivery\b|within\b|under\b|below\b|over\b|less\s+than\b|max\s+|maximum\s+|urgently\b|asap\b|please\b)/i;

export function extractSummary(text: string, maxLength = 60): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "";
  }

  const markers = [...cleaned.matchAll(NEED_MARKER)];
  let phrase: string;
  if (markers.length > 0) {
    const end = markers[markers.length - 1].index + markers[markers.length - 1][0].length;
    phrase = cleaned.slice(end);
  } else {
    phrase = cleaned;
  }

  phrase = phrase.trim().replace(/^[,:\-\s]+/, "");
  phrase = phrase.replace(NEED_LEAD_ACTION, "");
  phrase = phrase.replace(/^(?:an?|the)\s+/i, "");
  phrase = ((phrase.split(NEED_CUT)[0] ?? phrase) ?? "").trim();
  const sentences = phrase.split(/\.\s+/);
  if (sentences.length > 1 && phrase.length > 40) {
    phrase = sentences[0];
  }
  phrase = phrase.replace(/[,\s]+$/g, "").trim();

  if (!phrase) {
    phrase = cleaned.replace(/^i\s+need\s+/i, "").trim();
  }

  let summary = `Needs ${phrase}`;

  if (summary.length > maxLength) {
    const cut = summary.slice(0, maxLength);
    const lastBreak = cut.lastIndexOf(" ");
    summary = `${lastBreak > 20 ? cut.slice(0, lastBreak) : cut}…`;
  }
  return summary;
}

// --- Images ---------------------------------------------------------------

// Accepts one URL per line; only https/http URLs are kept.
export function parseImageLines(text: string, maxImages = 5): string[] {
  if (!text) {
    return [];
  }
  const seen = new Set<string>();
  const images: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const url = line.trim();
    if (!url || images.length >= maxImages) {
      continue;
    }
    if (!/^https?:\/\/.+/i.test(url) || url.length > 500) {
      continue;
    }
    const key = url.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    images.push(url);
  }
  return images;
}