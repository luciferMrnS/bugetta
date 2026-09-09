# PHASE 10 STATUS — Delivery & Logistics

## Status: COMPLETE ✅

## Objective
Introduce delivery management behind a **provider abstraction**: assign a delivery to a paid request, compute the delivery fee and ETA **server-side**, track it through a guarded status machine, expose a customer-facing tracker (ETA, courier link, proof of delivery once delivered) and an operations card for assigning/updating deliveries with a full audit trail. The provider layer is a registry seam so real couriers (GIG, DHL, dispatch apps…) can be plugged in later without touching the service, routes or UI.

## What was built

### Data model
- `Delivery` (one per request via `@@unique([requestId])`, linked from `Request.delivery`) — reference `DLV-…`, provider key, status, pick-up/drop location, `feeKobo` + `feeBreakdown` (JSON), `eta`, `trackingReference` `TRK-…`, optional `trackingUrl`, proof fields (`recipientName`, `proofType`, `proofReference`, `proofNote`), `deliveredAt`, notes.
- `DeliveryEvent` — the immutable audit trail: `fromStatus`/`toStatus`, cause (`created` | `operator`), actor, details, timestamp.
- Migration `20260908181200_phase10_delivery_logistics` applied to `dev.db` (`prisma migrate deploy`); the test DB picks it up automatically via `vitest.global-setup.ts`.

### Status machine (`src/lib/delivery/status.ts`)
`ASSIGNED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED`, with `FAILED` (→ `CANCELLED`) and `CANCELLED` terminal concern states. Constants (`DELIVERY_STATUS`, labels, `DELIVERY_LIFECYCLE` + positions, `TERMINAL_DELIVERY_STATUSES`), helper predicates (`isDeliveryStatus`, `isTerminalDeliveryStatus`, `isMainlineDeliveryStatus`) and `deliveryAllowedTransitions` — a transition is only ever offered if it is legal from the current status.

### Provider abstraction (`src/lib/delivery/providers/`)
- `types.ts` — the `DeliveryProvider` contract (`key`, `label`, `description`, `supportsTracking`, `quote(input) → { feeKobo, breakdown, eta, method }`, `trackingUrl(ref)`), `DeliveryPriority` (STANDARD | EXPRESS), `FeeLine`, descriptors.
- `sandbox/pricing.ts` — the deterministic built-in fee engine: zone base (Lagos metro **₦3,000**; anywhere else **₦5,000**) + express surcharge rounded to whole naira, ETA as a fixed end-of-day offset (metro 2/express 1 day; other 3/2). Area detection is a lexicon with punctuation tolerance ("Ikeja G.R.A" → metro).
- `sandbox/provider.ts` — the "sandbox" provider: fees from the deterministic rules, tracking handled in-platform (`trackingUrl` → null).
- `registry.ts` — `getDeliveryProvider` (unknown keys fall back to the default sandbox), `listDeliveryProviders`, `describeProvider`, `registerDeliveryProvider`.

### Service + serializers (`src/lib/delivery/`)
- `service.ts` — `createDeliveryForRequest` (request must exist and be **paid** via `REQUEST_LIFECYCLE_POSITION` → else `NOT_FOUND` / `REQUEST_NOT_PAID`; one delivery per request → `DUPLICATE_DELIVERY`; drop location defaults to the request location; **fee/ETA computed only server-side** from the provider; `DLV-` reference with P2002-retry), `getDeliveryForRequest`, `getCustomerDeliveryTracker` (ownership enforced via the request's `customerId`), `transitionDeliveryStatus` (`INVALID_TRANSITION` guard; `DELIVERED` pins `deliveredAt` + proof fields). Every create/transition is transactional with an accompanying `DeliveryEvent`.
- `serialize.ts` — `DeliveryView` (ops-facing: fee + breakdown, allowed transitions, full event trail) and `DeliveryTrackerView` (customer-facing: status/ETA/tracking/proof only — **no fees, courier references or notes leak**).

### API
- `POST /api/operations/requests/[id]/delivery` — `guardOperations` → origin → CSRF → rate limit (60/…) → zod (`provider`, `priority`, `drop/pickup` ≤200, `notes` ≤2000). 409 codes `REQUEST_NOT_PAID` / `DUPLICATE_DELIVERY`; 404 unknown request.
- `GET /api/operations/requests/[id]/delivery` — read-only ops detail (no CSRF), 404 when no delivery yet.
- `POST /api/operations/requests/[id]/delivery/status` — the guarded state machine (proof fields + `recipientName` on `DELIVERED`); 409 `INVALID_TRANSITION`.
- `GET /api/operations/delivery/providers` — registry read for the ops assignment dropdown.
- `GET /api/requests/[id]/delivery` — customer tracker: only the owning customer (403 for other roles), returns `{ delivery: null }` when the request is owned but not yet assigned, 404 when the request isn't theirs. **Read-only, no fee fields.**

### UI
- `src/components/operations/DeliveryCard.tsx` (mounted on `/operations/requests/[id]`) — assignment form (provider dropdown from the registry, priority, drop/pickup, notes → **fee/ETA always from the server**), live lifecycle progress bar, fee breakdown, courier reference, delivered-proof panel, a guarded status mover (proof fields appear only when `DELIVERED` is chosen) and the event timeline.
- `src/components/customer/DeliveryTracker.tsx` (mounted on `/requests/[id]`) — courier, ETA, drop location, reference, tracking link, delivery-proof card and a compact event timeline. Graceful "We have not started delivery for this request yet." empty state.

## Verification
- `npx prisma migrate deploy` on `dev.db` (migration applied) and `npx next typegen` (new route types for the four delivery routes).
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean (fixed a synchronous setState-in-effect, unused vars, unused `endOfDay` helper in the pricing module).
- `npm run build` — succeeds; all new routes/pages compile.
- `npm test` — **178 / 178 passing** across 24 files (Phase 9 baseline 143 + 35 new):
  - `src/lib/delivery/status.test.ts` (6) — labels, lifecycle order, guarded transitions (no reverse lifecycle moves), true terminal set.
  - `src/lib/delivery/providers/sandbox/pricing.test.ts` (7) — zone classification (null → UNKNOWN, "Ikeja G.R.A" → METRO, Kano → OTHER), metro base ₦3,000 + fixed ETA, express ₦1,500 surcharge + shorter ETA, non-metro ₦5,000, UNKNOWN fallback + method note, determinism, omitted-input defaults.
  - `src/lib/delivery/providers/registry.test.ts` (5) — sandbox always present, resolution by key, unknown-key → default fallback, null/undefined → default, stable descriptor shape.
  - `src/app/api/operations/requests/[id]/delivery.test.ts` (13) — role guards (401/403/operator 404), unknown/empty 404, CSRF/foreign-origin rejection, REQUEST_NOT_PAID 409, paid-request assignment (DLV-/TRK- references, metro fee ₦3,000 server-side, defaulted drop location, express Kano ₦7,500 with pickup/notes), DUPLICATE_DELIVERY 409, invalid priority 422, full lifecycle to DELIVERED with proof capture + 5-event trail, INVALID_TRANSITION 409, 404 base + unknown status 422.
  - `src/app/api/requests/[id]/delivery.test.ts` (4) — 401 anonymous, owner-without-delivery → `{ delivery: null }`, non-owner 404, tracker exposes **no** `feeNaira`/`trackingReference`/`notes`/`provider`, delivered proof visible to the owner.

## Notes
- **Money invariance:** the fee is always the provider's server-side computation from stored data/rules; client-supplied numbers are never accepted on any delivery path. Tests pin the exact kobo figures.
- Any real courier integrates by registering a `DeliveryProvider`; sandbox stays the fallback default so existing flows keep working.
- Sandbox deliveries never auto-transition — every move is an operator action logged to `DeliveryEvent`; a future provider can map remote tracking webhooks onto these same guarded transitions.
- The hot `next dev -p 3100` server predates Phase 10 — restart it (and dev still caches the old Prisma client) before exercising delivery features live.