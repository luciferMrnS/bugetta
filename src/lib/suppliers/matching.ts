import { prisma } from "@/lib/prisma";
import { majorUnitsFromMinor } from "@/lib/money";
import { categoryLabel } from "@/lib/requests/categories";
import { SUPPLIER_STATUS, supplierStatusLabel } from "./status";
import { SupplierError } from "./service";

/**
 * Deterministic supplier ⇄ request matching engine.
 *
 * Every scored factor is a pure, explainable computation over data the
 * supplier already provides (profile, offerings, fulfillment history). Scores
 * are never influenced by money moved on the request, and the engine has no
 * write path — recommendations are advisory only. An operator always makes the
 * final assignment (see /api/operations/requests/[id]/supplier).
 *
 * AI/embedding assistance is intentionally NOT wired in: the engine exposes a
 * capped `semanticBoostById` input (see `MAX_SEMANTIC_ADJUSTMENT`) so an LLM
 * could later nudge scores, but it can never add or remove candidates and can
 * shift any supplier's score by at most ±10 points — it has no authority over
 * the transaction.
 */

export const MATCH_WEIGHTS = {
  // Sums to 1.0. Location and price get generous weight because they are the
  // strongest objective signals for "can this supplier actually do the job".
  // Rating is currently informational (no review data), so its weight stays
  // small and returns a neutral score until reviews exist.
  category: 0.2,
  productService: 0.2,
  location: 0.2,
  priceBudget: 0.15,
  availability: 0.1,
  delivery: 0.05,
  reliability: 0.05,
  rating: 0.05,
} as const;

export type MatchComponentKey = keyof typeof MATCH_WEIGHTS;

/** Suppliers scoring below this are filtered out of the ranked list. */
export const SUGGESTION_THRESHOLD = 50;

/** Maximum a semantic/AI nudge may shift a supplier's match score (points). */
export const MAX_SEMANTIC_ADJUSTMENT = 10;

export interface MatchComponent {
  key: MatchComponentKey;
  label: string;
  /** Sub-score 0..1 for this factor. */
  score: number;
  /** Weight 0..1 for this factor. */
  weight: number;
  /** score * weight * 100, rounded (display points). */
  contribution: number;
  /** True when real data contributed; false when there was nothing to score. */
  available: boolean;
  explanation: string;
}

export interface SupplierHistory {
  assigned: number;
  fulfilled: number;
  onTime: number;
  declined: number;
  fulfillmentRate: number | null;
  onTimeRate: number | null;
}

export interface MatchRating {
  value: number | null;
  count: number;
  available: boolean;
}

export interface SupplierMatch {
  supplierId: string;
  businessName: string;
  contactName: string;
  phone: string | null;
  whatsapp: string | null;
  serviceArea: string | null;
  categories: string[];
  categoryLabels: string[];
  rating: MatchRating;
  matchScore: number; // 0..100
  scoreBand: "strong" | "good" | "possible";
  isRecommended: boolean;
  alreadyAssigned: boolean;
  ranking: number;
  breakdown: MatchComponent[];
  explanations: string[];
  offeringMatches: Array<{
    id: string;
    title: string;
    priceNaira: number | null;
    categoryLabel: string;
  }>;
  history: SupplierHistory;
}

export interface ExcludedSupplier {
  supplierId: string;
  businessName: string;
  status: string;
  reasons: string[];
}

export interface RequestMatchSummary {
  id: string;
  reference: string;
  summary: string;
  category: string;
  categoryLabel: string;
  budgetNaira: number | null;
  location: string | null;
  deliveryDeadline: string | null;
}

export interface MatchResult {
  request: RequestMatchSummary;
  recommendedSupplierId: string | null;
  matches: SupplierMatch[];
  excluded: ExcludedSupplier[];
  totalCandidates: number;
  suggestionThreshold: number;
  maxSemanticAdjustment: number;
  aiNote: string | null;
  generatedAt: string;
}

export interface MatchSuppliersOptions {
  /** Capped, advisory semantic nudge keyed by supplierId (AI assist hook). */
  semanticBoostById?: Record<string, number>;
  /** Injectable clock for deterministic tests. */
  now?: Date;
}

/**
 * Minimal request shape the engine scores against. A persisted Request row
 * satisfies this structurally; the concierge composes an in-memory candidate
 * (from an "understood" request) so recommendations exist before submission.
 */
export interface RequestLike {
  id: string;
  reference: string;
  summary: string;
  description: string | null;
  category: string;
  budgetKobo: number | null;
  location: string | null;
  deliveryDeadline: Date | null;
  items: Array<{ name: string; quantity: string | null }>;
}

// ─── Text helpers (deterministic) ─────────────────────────────────────────────

const STOPWORDS = new Set([
  "i", "me", "my", "we", "our", "you", "your", "it", "its", "this", "that",
  "the", "a", "an", "and", "or", "but", "so", "for", "of", "to", "at", "on",
  "in", "with", "from", "by", "as", "is", "are", "was", "were", "be", "been",
  "will", "would", "can", "could", "should", "need", "needs", "needed",
  "please", "kindly", "want", "like", "get", "give", "help", "have", "has",
  "not", "no", "some", "any", "more", "there", "here", "now", "today",
  "tomorrow", "soon", "asap", "deliver", "delivery", "delivered", "arrive",
  "arriving", "also", "then", "than", "really", "much", "very",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function toSet(values: string[]): Set<string> {
  return new Set(values);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const x of a) {
    if (b.has(x)) overlap += 1;
  }
  const union = new Set([...a, ...b]);
  return overlap / union.size;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ─── Candidate model ──────────────────────────────────────────────────────────

interface OfferingCandidate {
  id: string;
  category: string;
  title: string;
  description: string | null;
  priceKobo: number | null;
  availability: string | null;
  location: string | null;
  deliveryDetail: string | null;
}

interface SupplierCandidate {
  id: string;
  businessName: string;
  description: string | null;
  contactName: string;
  phone: string | null;
  whatsapp: string | null;
  serviceArea: string | null;
  operatingHours: string | null;
  status: string;
  createdAt: Date;
  categories: string[];
  offerings: OfferingCandidate[];
  history: SupplierHistory;
  alreadyAssigned: boolean;
}

const HISTORY_CACHE_SIZE = 10_000;

function buildHistory(rows: Array<{
  supplierId: string;
  status: string;
  fulfilledAt: Date | null;
  deadline: Date | null;
}>): Map<string, SupplierHistory> {
  const bySupplier = new Map<string, SupplierHistory>();
  for (const row of rows) {
    let h = bySupplier.get(row.supplierId);
    if (!h) {
      h = { assigned: 0, fulfilled: 0, onTime: 0, declined: 0, fulfillmentRate: null, onTimeRate: null };
      bySupplier.set(row.supplierId, h);
    }
    h.assigned += 1;
    if (row.status === "DECLINED") h.declined += 1;
    if (row.fulfilledAt) {
      h.fulfilled += 1;
      if (row.deadline && row.fulfilledAt.getTime() <= row.deadline.getTime()) {
        h.onTime += 1;
      }
    }
  }
  for (const h of bySupplier.values()) {
    h.fulfillmentRate = h.assigned > 0 ? h.fulfilled / h.assigned : null;
    h.onTimeRate = h.fulfilled > 0 ? h.onTime / h.fulfilled : null;
  }
  if (bySupplier.size > HISTORY_CACHE_SIZE) {
    // Defensive cap so a huge history never balloons memory.
    bySupplier.clear();
  }
  return bySupplier;
}

// ─── Scorers (each returns 0..1 + explanation, and whether real data existed) ─

interface Scored {
  score: number;
  available: boolean;
  explanation: string;
}

function scoreCategory(
  requestCategory: string,
  candidate: SupplierCandidate,
): Scored {
  const listed = candidate.categories.includes(requestCategory);
  const offered = candidate.offerings.some((o) => o.category === requestCategory);
  const label = categoryLabel(requestCategory);
  if (listed && offered) {
    return { score: 1, available: true, explanation: `Lists ${label} and has an offering in it.` };
  }
  if (listed) {
    return { score: 0.7, available: true, explanation: `Lists ${label} but has no active offering for it.` };
  }
  if (offered) {
    return { score: 0.7, available: true, explanation: `Has an active offering in ${label}.` };
  }
  return { score: 0, available: false, explanation: `Does not cover ${label}.` };
}

function scoreProductService(
  requestText: string,
  candidate: SupplierCandidate,
): Scored {
  const requestTokens = toSet(tokenize(requestText));
  const suppliers: string[] = [candidate.businessName];
  if (candidate.description) suppliers.push(candidate.description);
  for (const o of candidate.offerings) {
    suppliers.push(o.title);
    if (o.description) suppliers.push(o.description);
  }
  if (candidate.offerings.length === 0) {
    return {
      score: 0.15,
      available: false,
      explanation: "No products/services listed to match against.",
    };
  }
  let best = 0;
  for (const text of suppliers) {
    const tokens = toSet(tokenize(text));
    best = Math.max(best, jaccard(requestTokens, tokens));
  }
  if (best === 0) {
    return {
      score: 0.15,
      available: false,
      explanation: "Catalogue has no textual overlap with the request.",
    };
  }
  return {
    score: best,
    available: true,
    explanation: "Product/service wording overlaps with the request.",
  };
}

function scoreLocation(
  requestLocation: string | null,
  candidate: SupplierCandidate,
): Scored {
  if (!requestLocation) {
    return { score: 0.3, available: false, explanation: "Customer did not specify a location." };
  }
  const candidates: string[] = [];
  if (candidate.serviceArea) candidates.push(candidate.serviceArea);
  for (const o of candidate.offerings) {
    if (o.location) candidates.push(o.location);
  }
  if (candidates.length === 0) {
    return { score: 0.3, available: false, explanation: "Supplier has not listed a service area or location." };
  }
  const requestTokens = toSet(tokenize(requestLocation));
  const reqLower = requestLocation.toLowerCase();
  let best = 0;
  for (const c of candidates) {
    const tokens = toSet(tokenize(c));
    best = Math.max(best, jaccard(requestTokens, tokens));
    const cLower = c.toLowerCase();
    if (reqLower.includes(cLower) || cLower.includes(reqLower)) best = Math.max(best, 0.8);
  }
  return {
    score: best === 0 ? 0.2 : best,
    available: true,
    explanation: best === 0 ? "No location overlap with the requested area." : "Service area overlaps the requested location.",
  };
}

function scorePriceBudget(
  requestBudgetKobo: number | null,
  candidate: SupplierCandidate,
): Scored {
  // Cheapest priced offering the supplier has for this request's category,
  // falling back to any priced offering.
  const eligiblePriced = candidate.offerings
    .filter((o) => o.priceKobo !== null)
    .sort((a, b) => (a.priceKobo ?? 0) - (b.priceKobo ?? 0));
  const bestPriced = eligiblePriced[0]?.priceKobo ?? null;

  if (requestBudgetKobo === null) {
    return { score: 0.5, available: false, explanation: "Customer set no budget — price not compared." };
  }
  if (bestPriced === null) {
    return { score: 0.4, available: false, explanation: "Supplier has no list price (negotiable) — underisability unknown." };
  }
  const ratio = requestBudgetKobo / bestPriced;
  const score = ratio >= 1 ? 1 : 0.2 + 0.8 * ratio;
  return {
    score,
    available: true,
    explanation:
      score >= 1
        ? `Cheapest listed price (${priceLabel(bestPriced)}) fits the ${priceLabel(requestBudgetKobo)} budget.`
        : `Cheapest listed price (${priceLabel(bestPriced)}) exceeds the ${priceLabel(requestBudgetKobo)} budget.`,
  };
}

function scoreAvailability(
  candidate: SupplierCandidate,
  requestDeadline: Date | null,
  now: Date,
): Scored {
  const hasOfferingAvailability = candidate.offerings.some((o) => o.availability);
  let score = 0.4;
  const notes: string[] = [];
  if (candidate.operatingHours) {
    score += 0.1;
    notes.push("operating hours listed");
  }
  if (hasOfferingAvailability) {
    score += 0.2;
    notes.push("availability listed");
  }
  if (requestDeadline) {
    const hours = (requestDeadline.getTime() - now.getTime()) / 3_600_000;
    if (hours >= 0 && hours <= 72) {
      if (hasOfferingAvailability || candidate.operatingHours) {
        score = Math.min(1, score + 0.2);
        notes.push("can likely meet the tight deadline");
      } else {
        score = Math.max(0, score - 0.2);
        notes.push("tight deadline with no availability info");
      }
    } else if (hours >= 0) {
      score = Math.min(1, score + 0.05);
      notes.push("deadline is not within 72 hours");
    }
  }
  return {
    score: clamp(score, 0, 1),
    available: requestDeadline !== null || hasOfferingAvailability || Boolean(candidate.operatingHours),
    explanation:
      notes.length > 0
        ? notes.join("; ").replace(/^./, (c) => c.toUpperCase()) + "."
        : "No availability or operating-hours information listed.",
  };
}

function scoreDelivery(candidate: SupplierCandidate): Scored {
  let score = 0;
  const notes: string[] = [];
  const hasDeliveryDetail = candidate.offerings.some((o) => o.deliveryDetail);
  const hasOfferingLocation = candidate.offerings.some((o) => o.location);
  if (hasDeliveryDetail) {
    score += 0.45;
    notes.push("delivery option described");
  }
  if (hasOfferingLocation) {
    score += 0.2;
    notes.push("offering location known");
  }
  if (candidate.serviceArea) {
    score += 0.2;
    notes.push("service area known");
  }
  if (candidate.whatsapp || candidate.phone) {
    score += 0.15;
    notes.push("contactable");
  }
  if (score === 0) {
    return { score: 0.2, available: false, explanation: "No delivery capability details listed." };
  }
  return {
    score: clamp(score, 0, 1),
    available: true,
    explanation: notes.join("; ").replace(/^./, (c) => c.toUpperCase()) + ".",
  };
}

function scoreReliability(history: SupplierHistory): Scored {
  const { assigned, fulfilled, onTime } = history;
  if (assigned === 0) {
    return { score: 0.5, available: true, explanation: "No fulfillment history yet — treated as neutral." };
  }
  let score = fulfilled / assigned;
  if (fulfilled > 0) {
    score += (onTime / fulfilled) * 0.2;
    if (fulfilled >= 3) score += 0.1;
  }
  const parts = [`fulfilled ${fulfilled} of ${assigned} assigned orders`];
  if (onTime > 0) parts.push(`${onTime} on time`);
  if (history.declined > 0) parts.push(`${history.declined} declined`);
  return {
    score: clamp(score, 0, 1),
    available: true,
    explanation: parts.join(", ") + ".",
  };
}

function scoreRating(): Scored {
  return {
    score: 0.5,
    available: false,
    explanation: "No customer ratings recorded yet — neutral.",
  };
}

function priceLabel(kobo: number): string {
  const naira = majorUnitsFromMinor(kobo);
  const formatted = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
  }).format(naira);
  return formatted;
}

// ─── Ranking ──────────────────────────────────────────────────────────────────

function bandFor(score: number): "strong" | "good" | "possible" {
  if (score >= 75) return "strong";
  if (score >= 55) return "good";
  return "possible";
}

export async function matchSuppliersToRequest(
  requestId: string,
  options: MatchSuppliersOptions = {},
): Promise<MatchResult> {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: { items: { orderBy: { sortOrder: "asc" as const } } },
  });
  if (!request) {
    throw new SupplierError("NOT_FOUND", "Request not found.");
  }
  return scoreRequestLike(request, requestId, options);
}

export async function scoreRequestLike(
  request: RequestLike,
  requestId: string | null,
  options: MatchSuppliersOptions = {},
): Promise<MatchResult> {
  const now = options.now ?? new Date();
  const semanticBoost = options.semanticBoostById ?? {};

  const requestText = [
    request.summary,
    request.description,
    ...request.items.map((item) => item.name),
  ].join(" ");

  const [suppliers, alreadyAssignedRows, historyRows] = await Promise.all([
    prisma.supplier.findMany({
      select: {
        id: true,
        businessName: true,
        description: true,
        contactName: true,
        phone: true,
        whatsapp: true,
        serviceArea: true,
        operatingHours: true,
        status: true,
        createdAt: true,
        supplierCategories: {
          select: { categoryKey: true },
        },
        offerings: {
          where: { isActive: true },
          select: {
            id: true,
            category: true,
            title: true,
            description: true,
            priceKobo: true,
            availability: true,
            location: true,
            deliveryDetail: true,
          },
        },
      },
    }),
    requestId
      ? prisma.supplierRequest.findMany({
          where: { requestId },
          select: { supplierId: true },
        })
      : [],
    prisma.supplierRequest.findMany({
      select: {
        supplierId: true,
        status: true,
        fulfilledAt: true,
        request: { select: { deliveryDeadline: true } },
      },
    }),
  ]);

  const alreadyAssigned = new Set(alreadyAssignedRows.map((r) => r.supplierId));
  const history = buildHistory(
    historyRows.map((r) => ({
      supplierId: r.supplierId,
      status: r.status,
      fulfilledAt: r.fulfilledAt,
      deadline: r.request.deliveryDeadline,
    })),
  );

  const excluded: ExcludedSupplier[] = [];

  const candidates: SupplierCandidate[] = [];
  for (const supplier of suppliers) {
    const categories = supplier.supplierCategories.map((c) => c.categoryKey);
    const offerings: OfferingCandidate[] = supplier.offerings;
    const reasons: string[] = [];

    if (supplier.status !== SUPPLIER_STATUS.APPROVED) {
      reasons.push(`Supplier is not approved (${supplierStatusLabel(supplier.status)}).`);
    }
    const coversCategory =
      categories.includes(request.category) ||
      offerings.some((o) => o.category === request.category);
    if (!coversCategory) {
      reasons.push(`Does not cover ${categoryLabel(request.category)}.`);
    }

    if (reasons.length > 0) {
      excluded.push({
        supplierId: supplier.id,
        businessName: supplier.businessName,
        status: supplier.status,
        reasons,
      });
      continue;
    }

    candidates.push({
      id: supplier.id,
      businessName: supplier.businessName,
      description: supplier.description,
      contactName: supplier.contactName,
      phone: supplier.phone,
      whatsapp: supplier.whatsapp,
      serviceArea: supplier.serviceArea,
      operatingHours: supplier.operatingHours,
      status: supplier.status,
      createdAt: supplier.createdAt,
      categories,
      offerings,
      history: history.get(supplier.id) ?? {
        assigned: 0,
        fulfilled: 0,
        onTime: 0,
        declined: 0,
        fulfillmentRate: null,
        onTimeRate: null,
      },
      alreadyAssigned: alreadyAssigned.has(supplier.id),
    });
  }

  // Score every candidate (deterministic).
  const scored = candidates.map((candidate) => {
    const components = [
      scoreCategory(request.category, candidate),
      scoreProductService(requestText, candidate),
      scoreLocation(request.location, candidate),
      scorePriceBudget(request.budgetKobo, candidate),
      scoreAvailability(candidate, request.deliveryDeadline, now),
      scoreDelivery(candidate),
      scoreReliability(candidate.history),
      scoreRating(),
    ] satisfies Scored[];

    const keys = Object.keys(MATCH_WEIGHTS) as MatchComponentKey[];
    const contributionByKey = new Map<MatchComponentKey, Scored>(
      keys.map((key, i) => [key, components[i]]),
    );

    const breakdown: MatchComponent[] = keys.map((key) => {
      const component = contributionByKey.get(key)!;
      const contribution = Math.round(component.score * MATCH_WEIGHTS[key] * 100);
      return {
        key,
        label: labelFor(key),
        score: Math.round(component.score * 100) / 100,
        weight: MATCH_WEIGHTS[key],
        contribution,
        available: component.available,
        explanation: component.explanation,
      };
    });

    const rawTotal = keys.reduce((sum, key) => {
      const component = contributionByKey.get(key)!;
      return sum + component.score * MATCH_WEIGHTS[key];
    }, 0);

    // Advisory semantic nudge: capped, never removes a candidate.
    const rawBoost = semanticBoost[candidate.id] ?? 0;
    const clampedBoost = clamp(rawBoost, -MAX_SEMANTIC_ADJUSTMENT, MAX_SEMANTIC_ADJUSTMENT);
    const matchScore = Math.round(clamp(rawTotal + clampedBoost / 100, 0, 1) * 100);
    const explanations = breakdown.map((b) => `${b.label}: ${b.explanation}`);

    return { candidate, breakdown, matchScore, explanations, clampedBoost };
  });

  scored.sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    if ((b.candidate.history.fulfilled ?? 0) !== (a.candidate.history.fulfilled ?? 0)) {
      return (b.candidate.history.fulfilled ?? 0) - (a.candidate.history.fulfilled ?? 0);
    }
    return a.candidate.createdAt.getTime() - b.candidate.createdAt.getTime();
  });

  const matches: SupplierMatch[] = [];
  for (const item of scored) {
    const { candidate } = item;
    if (item.matchScore < SUGGESTION_THRESHOLD) {
      excluded.push({
        supplierId: candidate.id,
        businessName: candidate.businessName,
        status: candidate.status,
        reasons: [`Match score (${item.matchScore}) is below the ${SUGGESTION_THRESHOLD}-point suggestion threshold.`],
      });
      continue;
    }
    matches.push({
      supplierId: candidate.id,
      businessName: candidate.businessName,
      contactName: candidate.contactName,
      phone: candidate.phone,
      whatsapp: candidate.whatsapp,
      serviceArea: candidate.serviceArea,
      categories: candidate.categories,
      categoryLabels: candidate.categories.map(categoryLabel),
      rating: { value: null, count: 0, available: false },
      matchScore: item.matchScore,
      scoreBand: bandFor(item.matchScore),
      isRecommended: false,
      alreadyAssigned: candidate.alreadyAssigned,
      ranking: 0,
      breakdown: item.breakdown,
      explanations: item.explanations,
      offeringMatches: candidate.offerings
        .filter((o) => o.category === request.category)
        .map((o) => ({
          id: o.id,
          title: o.title,
          priceNaira: o.priceKobo === null ? null : majorUnitsFromMinor(o.priceKobo),
          categoryLabel: categoryLabel(o.category),
        })),
      history: candidate.history,
    });
  }

  // Rank and mark the recommendation (skip suppliers already assigned).
  matches.forEach((match, index) => {
    match.ranking = index + 1;
  });
  const recommended = matches.find((m) => !m.alreadyAssigned) ?? matches[0] ?? null;
  if (recommended) {
    recommended.isRecommended = true;
  }

  return {
    request: {
      id: request.id,
      reference: request.reference,
      summary: request.summary,
      category: request.category,
      categoryLabel: categoryLabel(request.category),
      budgetNaira: request.budgetKobo === null ? null : majorUnitsFromMinor(request.budgetKobo),
      location: request.location,
      deliveryDeadline: request.deliveryDeadline ? request.deliveryDeadline.toISOString() : null,
    },
    recommendedSupplierId: recommended?.supplierId ?? null,
    matches,
    excluded,
    totalCandidates: candidates.length,
    suggestionThreshold: SUGGESTION_THRESHOLD,
    maxSemanticAdjustment: MAX_SEMANTIC_ADJUSTMENT,
    aiNote: null, // AI assist is advisory-only and not enabled; no AI wrote, moved or decided anything.
    generatedAt: now.toISOString(),
  };
}

function labelFor(key: MatchComponentKey): string {
  const labels: Record<MatchComponentKey, string> = {
    category: "Category",
    productService: "Product / service",
    location: "Location",
    priceBudget: "Price & budget",
    availability: "Availability",
    delivery: "Delivery capability",
    reliability: "Reliability",
    rating: "Rating",
  };
  return labels[key];
}