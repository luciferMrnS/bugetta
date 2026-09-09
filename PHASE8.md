# PHASE 8 STATUS — Supplier Matching Engine

## Status: COMPLETE ✅

## Objective
Rank approved suppliers against a paid request using a deterministic, explainable matching engine — scoring category, product/service, location, budget, availability, delivery capability, reliability, rating, price and fulfillment history — so the operations team sees *why* a supplier is recommended, irrelevant suppliers are filtered out, and the operator (not a machine) makes the final assignment. AI may assist but must never have unrestricted authority over transactions.

## What was built

### Data model (`prisma/schema.prisma`)
- `SupplierRequest.overrideNote` (String?) — operator note stored when they overrode the automated recommendation, keeping an audit trail that a machine never made the call.
- Migration `20260908154233_phase8_supplier_override` applied to dev + test DBs.

### Matching engine (`src/lib/suppliers/matching.ts`)
- Pure, deterministic scorers (no randomness, no network, no AI on the read path):
  - **Category** (weight .20) — full score when the supplier lists the category *and* has an active offering in it; reduced (.7) for listed-only or offered-only.
  - **Product/service** (.20) — stopword-filtered token Jaccard over business name, description and offering titles/descriptions; floors apply when nothing is listed.
  - **Location** (.20) — token Jaccard + substring containment over service area/offering locations.
  - **Price & budget** (.15) — budget-vs-cheapest-priced-offering ratio; neutral when budget/prices unset.
  - **Availability** (.10) — operating hours, offering availability, and whether the delivery deadline is inside 72h.
  - **Delivery capability** (.05) — delivery detail, offering location, service area, and contactability.
  - **Reliability** (.05) — from fulfillment history: fulfilled/assigned, on-time (vs `deliveryDeadline`), declined count. New suppliers are neutral, not punished.
  - **Rating** (.05) — explicit neutral component (`available:false`, "No customer ratings recorded yet") until reviews exist.
- Weights sum to 1.0; `matchScore` = `round(Σ score·weight · 100)`, with per-component contributions and explanations exposed for UI.
- Hard filters (never bypassable): supplier must be `APPROVED`; must cover the request's category. Failures land in `excluded` with human reasons.
- `SUGGESTION_THRESHOLD = 50` — below-threshold candidates are excluded with a reason (kept low so real, minimal suppliers still surface while "no data at all" profiles are filtered).
- Deterministic tie-breaks: matchScore desc → fulfilled count desc → createdAt asc.
- `alreadyAssigned` suppliers are flagged in the ranked list; the recommendation is the top *unassigned* match.
- AI assist hook (`semanticBoostById`) is capped at `MAX_SEMANTIC_ADJUSTMENT = ±10` points, can never change the hard filters, and is not wired to any transaction path. Read path sets `aiNote: null` ("AI advisory only — not enabled").
- No write path: the engine only reads. Money and assignments flow exclusively through the human-driven assignment route.

### API
- `GET /api/operations/requests/[id]/matches` (`guardOperations`, OPERATIONS + ADMIN only). 404 for unknown requests. Read-only — no CSRF needed, no rate-limit burn.
- `POST /api/operations/requests/[id]/supplier` extended with optional `override: boolean` + `overrideNote`; the service stores `overrideNote` when an override occurs (already-recorded `ALREADY_ASSIGNED` → 409, unapproved → 409, unvalidated body → 422).

### UI (`src/components/operations/SupplierMatches.tsx` on `/operations/requests/[id]`)
- Ranked supplier cards: score + band (strong/good/possible), matching priced offerings, weighted breakdown bar, factor-by-factor explanations, reliability history, contact info.
- "Assign supplier" for the recommended pick; "Assign (override)" for any other with an optional override note.
- Excluded suppliers section listing the human-readable reason per supplier.
- Already-assigned suppliers read as non-actionable.

## Verification
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npm run build` — succeeds; new route and component compile.
- `npm test` — **110 / 110 passing** across 15 files. Phase 8 added 10 tests in `src/app/api/operations/requests/matches.test.ts`:
  - role guards (401 anonymous / 403 customer / 200 operator+admin) and 404 unknown request;
  - relevant supplier ranks above weaker ones and is recommended, all matches ≥ threshold;
  - irrelevant-category and unapproved suppliers excluded with reasons; below-threshold supplier excluded;
  - explainability: 8 weighted components map to the score (±3 rounding), rating neutral, reliability "fulfilled 3 of 3";
  - already-assigned flagged and recommendation re-targeted;
  - override note persisted on assignment, plain assignment records no override;
  - double-assignment 409 and invalid body 422;
  - semantic nudge clamped to ±10 and unable to pull hard-filtered suppliers back in;
  - deterministic across repeat calls.

## Notes
- The hot dev server on port 3100 was started before this phase's migration/generate, so its in-memory Prisma client predates `overrideNote` — restart it (`next dev -p 3100`) before exercising assignment overrides on the live server.
- Matching is intentionally advisory: the only way a supplier is ever assigned is the operator invoking `POST .../supplier`. The engine has no side effects and no authority over money, fulfilling the "AI assist must never have unrestricted authority over transactions" constraint.
- Rating stays informational (0.5 neutral) because no review data exists yet; when reviews land, the rating sensor becomes `available:true` without changing the API contract.