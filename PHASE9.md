# PHASE 9 STATUS — AI Concierge

## Status: COMPLETE ✅

## Objective
Turn a customer's free-form words ("I need dinner for 6 tonight, nothing too spicy, budget about ₦40k") into a structured understanding — category, items, quantity, budget, preferences, location, deadline — with a minimal set of clarifying questions, and give operations a read-only assistant that summarizes a request, compares stored quotes with deterministic math, flags inconsistencies, proposes verified supplier matches and drafts customer-facing replies. The concierge must never invent suppliers, prices, availability or confirmations, and never touch the write/money paths: requests are still created only through `/api/requests`.

## What was built

### Understanding layer (`src/lib/concierge/` — everything pure/deterministic, no LLM)
- `types.ts` — `Understanding`, `ClarificationQuestion`, `UnderstandResult` shapes shared by routes and UIs.
- `extract.ts` — `understand(text)` reuses the Phase 6 parser (`extractBudgetKobo`, `extractDeadline`, `extractItemLines`, `extractSummary`) plus new deterministic extractors:
  - `extractLocation` — known-areas lexicon, longest key wins, tolerant of punctuation ("Victoria Island, Lagos" → **Victoria Island**; "Ikeja G.R.A" and "Ikeja GRA" both match); "Lagos Island" beats "Lagos".
  - `extractQuantity` — "lunch for 8 people", "a family of 4", "2 pairs of shoes", bare "for 6".
  - `itemQuantity` — per-item leading measures ("2kg rice" → "2 kg").
  - `extractPreferences` — spice ("Nothing spicy" now correctly maps to *Not spicy / mild*), diet (vegan/vegetarian/halal/sugar-free/gluten-free/keto), allergy, delivery preference.
  - `isUrgent` + `deadlineInferenceLabel` — provenance of a deadline ("tonight", "friday").
  - `understand()` composes everything into one object plus `gaps` — the fields the text did not specify. Filler phrases ("please help" → "help") are dropped from items so they never surface as false product names.
- `clarify.ts` — `buildQuestions(understanding)` -> at most **3** questions, only for real gaps, location first whenever it is missing and the deadline is urgent; `applyAnswer` + `applyAnswerAndGaps` fold answers back into the understanding (budget digit parsing takes the last number range; deadline/items/category/location each map deterministically; "No budget" resolves to *no budget*).
- Category suggestions come from `detectCategoryCandidates` (added to `src/lib/requests/categories.ts`) — keyword-matched candidates with a `high|medium|low` confidence and per-candidate matched phrases, ordered consistently with `detectCategory` (`CATEGORY_ORDER` derived from the keyword-array order). Weak meal words score 0.5 so "dinner for six" still surfaces FOOD at low confidence.

### API
- `POST /api/concierge/understand` — `guardSession` → `isSameOrigin` → `guardCsrf` → rate limit (60/…/user) → zod (description 3–2,000 chars, 422 `VALIDATION_ERROR`). Returns `{ understanding, questions }`. Read-only: nothing is persisted.
- `GET /api/operations/requests/[id]/assist` — `guardOperations` (OPERATIONS + ADMIN), 404 when the request is unknown. Returns full assistance (below). Read-only — no CSRF needed.

### Operations assistant (`src/lib/concierge/assist.ts`)
Everything derived from stored rows; the assistant adds nothing:
- **Brief + facts** — summary, category, status, customer, budget (`formatNaira`), location, deadline, item/quote/payment counts, assigned suppliers.
- **Quote comparison** — totals recomputed server-side from stored kobo (`totalKobo`); ranked ascending by total, best value/fastest/lowest price picks, `exceedsBudget` and `optionPriceMismatch` flags.
- **Inconsistencies** (13 checks with severity + suggestion): PAST_DEADLINE, URGENT_NO_LOCATION, MULTIPLE_ACCEPTED_QUOTES, PAID_WITHOUT_ACCEPTED_QUOTE, QUOTE_EXCEEDS_BUDGET, NO_BUDGET_WITH_QUOTES, QUOTE_MATH_MISMATCH, OPTION_PRICE_MISMATCH, CATEGORY_REVIEW, ITEMS_DETECTABLE, MULTIPLE_SUPPLIERS, CANCELLED_WITH_PAID.
- **Supplier picks** — top 3 from the Phase 8 matching engine (real, approved suppliers only); matching failure can never break the view.
- **Response drafts** — acknowledgement, research update, lowest-total quote brief, status check — with `requires` notes (e.g. "Budget shows ₦0 when none was set").
- Closed with a disclaimer: *"Read-only guidance derived from stored records. Nothing here assigns suppliers, moves money, or confirms availability without verification."*

### UI
- `src/components/ConciergeAssistant.tsx` + `/requests/assistant` — customer pastes or types; gets a structured read-back, category suggestion chips, up-to-3 inline questions, and a single "Submit this request" that posts the merged understanding to **`/api/requests`** (the real write path) then redirects to the request page. "Use the structured form instead" links to `/requests/new`.
- `src/components/operations/OperatorAssistant.tsx` mounted at the top of `/operations/requests/[id]` — brief/facts, suggested categories (with matchesCurrent), severity-colored inconsistency cards, quote table with best-value/fastest/lowest badges and budget/option warnings, top-3 supplier picks, copyable response drafts.
- Header nav gains "AI concierge" → `/requests/assistant` for signed-in customers.

## Verification
- `npx tsc --noEmit` — clean (ran `npx next typegen` first so the new `[id]/assist` route is in the generated route-types).
- `npm run lint` — clean (fixed unescaped apostrophe, `<a>` → `<Link>`, unused imports/vars).
- `npm run build` — succeeds; new routes/pages compile.
- `npm test` — **143 / 143 passing** across 19 files (Phase 8 baseline 110 + 33 new):
  - `src/lib/concierge/extract.test.ts` (11) — free-form dinner end-to-end (category/budget/quantity/urgent tonight/mild preference), no-gaps wedding-gown example, most-specific locations incl. "Ikeja GRA", quantities incl. "2kg rice", preferences and allergy/delivery, urgency + deadline provenance, category-candidate ranking consistent with `detectCategory`.
  - `src/lib/concierge/clarify.test.ts` (10) — only-missing questions capped at 3, location-first-when-urgent, no questions when complete, no deadline question when inferred, answers applied per key (budget range → 100k, deadline "Today", category label → stored key, items list, "No budget" → budget stays unset).
  - `src/app/api/concierge/understand/route.test.ts` (7) — 401 anonymous, 403 cross-origin, 403 missing CSRF, structured understanding + location question for a Lekki-less text, zero questions when everything is specified, only-known-categories guarantee, 422 for too short/long descriptions.
  - `src/app/api/operations/requests/assist.test.ts` (10 + 1 split) — role guards (401/403/200) and 404, brief/facts incl. "₦40,000.00" budget and "Not specified" location, all five inconsistency codes triggered without false `QUOTE_MATH_MISMATCH`, quote ranking recomputed from stored kobo (15,000 vs 51,000) with bestValue/fastest/lowestPrice, exceedsBudget + optionPriceMismatch flags, supplier picks restricted to real suppliers, drafts reference only verified numbers ("₦15,000.00") and carry `requires`.

## Notes
- The concierge deliberately **reuses** the parser and matching engine: one money-math source of truth (`kobo`, `totalKobo`), one category rule set (`detectCategory`/`detectCategoryCandidates`), one matching engine.
- The only write path remains `POST /api/requests`; the concierge route, the assist route and the matching read path have zero side effects and no authority over money or assignments.
- Integration tested at the route level; full-browser Playwright coverage of the two new screens is out of scope this phase (consistent with previous phases).
- The hot `next dev -p 3100` server predates Phase 9 additions — restart it before exercising the concierge features live.