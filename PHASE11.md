# PHASE 11 STATUS — Ratings, Trust & Disputes

## Status: COMPLETE ✅

## Objective
Turn BUGETTA's refund workflow into a trust platform: satisfied buyers leave **star ratings** (1–5) on completed requests (in-flight ones show a trusted due-date estimator); problem-charged requests flow through a **dispute → admin resolution** path that either refunds via the existing `createRefund` payment pipeline or closes the dispute; dissatisfied customers file **complaints**; a deterministic **fraud-flag engine** (fixed thresholds, no randomness) surfaces suspicious customers and suppliers; a **supplier reliability score** and per-role **transaction-history ledgers** give buyers, suppliers and operations one auditable view of money movement. Admin gets a **trust center** to resolve disputes/complaints/flags with cross-role guards (`guardOperations` vs `guardAdmin`).

## What was built

### Data model
- `Rating` (one per `[requestId, supplierId, customerId]` via `@@unique`) — score 1–5, comment ≤600, linked to Supplier + named `CustomerRatings` relation on User.
- `Complaint` — subject type/id (supplier or platform), category, description ≤2000, admin resolution note + status (`OPEN` → `RESOLVED`/`DISMISSED`), reference `CMP-…` (FK-less on purpose — a complaint can target the platform itself).
- `Dispute` (one per request via `@@unique([requestId])`) — reason (enum), description, status (`OPEN` → `RESOLVED_REFUND` | `RESOLVED_NO_REFUND`), `refundReference` `RFD-…` (reused from the refund pipeline rewrite) or `noRefundReason`, resolution fields, reference `DSP-…`.
- `FraudFlag` (one per `[subjectType, subjectId, signal]` via `@@unique`) — signal + severity (`LOW`/`MEDIUM`/`HIGH`), detail, status (`FLAGGED` → `REVIEWED`/`DISMISSED`), reference `FLG-…`.
- Migration `20260908203000_phase11_ratings_trust_disputes` applied to `dev.db` (`prisma migrate deploy`, non-interactive shell); client regenerated; the test DB picks it up automatically via `vitest.global-setup.ts`.

### Trust libraries (`src/lib/trust/`)
- `types.ts` — shared constants + the `TrustError` service error (`NOT_FOUND` → 404, everything else → 409 in route guards): `RATING_MIN/MAX`, eligible rating statuses, disputable request statuses, dispute/complaint/flag enums, the `FRAUD_SIGNALS` registry (signal → predicate), `DISPUTE_REFUND_REASON`.
- `ratings.ts` — `submitRating` (status eligibility + supplier-assignment eligibility + one-rating upsert, transactional), `loadRatableContext`, `getRatableSuppliers`, `supplierRatingSummary` (count/avg), `listSupplierRatings`.
- `disputes.ts` — `raiseDispute` (request must exist **and belong to the raiser** → 404 otherwise; duplicate → `DUPLICATE_DISPUTE`; status guard → `NOT_DISPUTABLE`; moves request `DISPUTED` with a `RequestEvent` + re-evaluates fraud flags), `resolveDispute` (`REFUND` → `createRefund` from `src/lib/payments` → `RESOLVED_REFUND` + `RFD-` reference, request `DISPUTED → REFUNDED`; `NO_REFUND` → request `DISPUTED → COMPLETED` with `RequestEvent` cause `admin`), `getDisputeForRequest`, `listDisputes`, `getDispute`.
- `complaints.ts` — `raiseComplaint` with `expectedOwnerId` ownership guard (404 when the linked request isn't the caller's), list/get/resolve.
- `fraud.ts` — deterministic `evaluateSignals` over the registry, `recordFraudFlags` (idempotent upsert + dedupe), list/get/review with `TrustError`. Thresholds: e.g. customer `CUSTOMER_MULTIPLE_OPEN_DISPUTES` ≥2 (MEDIUM), `CUSTOMER_REPEATED_REFUNDS` ≥4 (HIGH) / 2–3 (MEDIUM), `CUSTOMER_REPEATED_CANCELLATIONS` ≥6 (MEDIUM); supplier `SUPPLIER_MULTIPLE_REFUND_DISPUTES` ≥4 (HIGH) / 2–3 (MEDIUM), `SUPPLIER_REPEATED_COMPLAINTS` ≥2 (MEDIUM), `SUPPLIER_UNFULFILLED_ORDERS` >0 (LOW).
- `scores.ts` — `supplierReliability` 0–100 (rating avg + on-time completion + fulfillment counts, banded to LOW/MEDIUM/HIGH) and `customerTrust` 0–100 (RFE/refund/flag penalties) — all server-side, documented formulas.
- `history.ts` — refund, earning, transfer, platform-fee ledgers via `LedgerRow` aggregation into `customerTransactionHistory`, `supplierTransactionHistory`, `platformLedger`.
- `serialize.ts` — `RatingView`, `DisputeView`, `ComplaintView`, `FraudFlagView`, `LedgerEntryView` (money always `amountNaira` derived from kobo server-side).
- `src/lib/validators/trust.ts` — zod schemas: `submitRatingSchema`, `raiseDisputeSchema`, `raiseComplaintSchema`, `resolveDisputeSchema`, `resolveComplaintSchema`, `reviewFraudFlagSchema`.

### API (guard chains applied: session → origin → CSRF → rate limit → role)
- Customer: `GET`/`POST /api/requests/[id]/ratings` (422 bad score, 409 `NOT_ASSIGNED`/`NOT_RATEABLE`), `GET /api/requests/[id]/dispute` (null when none), `POST /api/requests/[id]/disputes`, `POST /api/requests/[id]/complaints`, `GET /api/account/transactions`.
- Supplier: `GET /api/suppliers/ratings` (supplier-only), `GET /api/suppliers/transactions`.
- Operations: `GET /api/operations/trust/dashboard` (summary + queues).
- Admin: `POST /api/admin/trust/disputes/[id]`, `POST /api/admin/trust/complaints/[id]`, `POST /api/admin/trust/flags/[id]` — **all three guarded by `guardAdmin`** (a 403 test pins operators out).
- Edited `POST /api/payments/[id]/refund` → re-runs `recordFraudFlags("CUSTOMER", …)` after a refund.
- Every route returns the shared `ok(...)`/`fail(...)` shape with domain `{CODE}` errors at 409 / 422.

### UI
- `src/components/customer/OrderFeedback.tsx` (mounted on `/requests/[id]` after DeliveryTracker) — 5-star rating + comment, dispute raising form, dispute card, complaint form.
- `src/components/supplier/SupplierRatings.tsx` (mounted on `/suppliers`) — summary + recent ratings.
- `src/components/account/TransactionHistory.tsx` (mounted on `/account`) — per-role ledger.
- `src/app/admin/trust/` (`page.tsx` + `AdminTrustCenter.tsx`, nav link in Header for admins) — summary cards + dispute/complaint/flag queues with resolution actions.

## Verification
- `npx prisma migrate deploy` on `dev.db`, `npx prisma generate`, `npx next typegen` (new route types for the 13 routes) — all OK; `prisma migrate dev` is unusable in this non-interactive shell.
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean (removed an unused var from the new test file).
- `npm run build` — **Compiled successfully**, all new routes/pages compile.
- `npm test` — **197 / 197 passing** across 26 files (Phase 10 baseline 178 + 19 new):
  - `src/app/api/trust/trust.test.ts` (15) — anon 401; not-assigned 409; 422 bad score; not-rateable 409; one-rating upsert; ownership 404; supplier ratings 403 for a customer; disputes: OPEN + `DISPUTED` transition, duplicate-before-eligibility ordering → `DUPLICATE_DISPUTE`, outsider 404, `NOT_DISPUTABLE` for cancelled; customer multiple-open-disputes auto-flag; admin REFUND → `RFD-` reference + request/payment `REFUNDED` + `ALREADY_RESOLVED`; NO_REFUND → request `COMPLETED`, payment stays `PAID`; complaint resolve 403 for ops / 200 for admin; flag review 403 for ops / 200 for admin; customer + supplier transaction ledgers (`CHARGE`/`REFUND`, `EARNING` ₦9,000); reliability drops 100 → 90 after a resolved-refund dispute.
  - `src/lib/trust/fraud.test.ts` (4) — two open disputes → MEDIUM customer flag; ≥4 refunds → HIGH; below-threshold activity ignored; supplier refunds + complaints → both signals at the pinned severities.

## Notes
- **Duplicate-before-eligibility ordering:** `raiseDispute` checks an existing dispute *before* the status guard, so a second raise on an already-`DISPUTED` request answers `DUPLICATE_DISPUTE`, not `NOT_DISPUTABLE` — pinned by test.
- **Money invariance:** kobo everywhere in the DB; every API view exposes `amountNaira` derived server-side; refund amounts come from `createRefund` (never from the client). No invented data — every ledger row and reliability score is computed from stored payments/ratings/statuses.
- **Fraud is deterministic:** signal thresholds are fixed constants in `FRAUD_SIGNALS`; no randomness, no external data; flags auto-rise inside transactions and are only cleared by an admin review.
- A customer can only dispute/complain about their **own** request (ownership → 404), keeping dispute IDs un-leakable.
- The hot `next dev -p 3100` server predates Phase 11 — restart it (dev still caches the old Prisma client) before exercising trust features live.