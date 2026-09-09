# PHASE 7 STATUS — Supplier System

## Status: COMPLETE ✅

## Objective
Bring verified, informal suppliers onto BUGETTA: supplier onboarding and registration, admin verification/approval, a supplier-owned catalogue (offerings), receiving the paid requests the platform operator assigns to them, fulfilling assigned orders with earnings tracking, and strict data isolation between suppliers.

## What was built

### Data model (`prisma/schema.prisma`)
- `Supplier` — profile for a User (`role = SUPPLIER`), holds business/contact info, service categories, service area, hours, payment details, and a `status` (`PENDING` / `APPROVED` / `SUSPENDED` / `REJECTED`) with `approvedAt`.
- `Offering` — supplier catalogue entry: category, title, optional description, optional price (informal suppliers may leave unpriced), availability, location, delivery detail, images, `isActive`.
- `SupplierRequest` — the operator-assigned order: request link, status (`ASSIGNED` / `ACCEPTED` / `DECLINED`), `fulfilledAt`, `earnedKobo`, notes.
- `SupplierEarning` — one row per fulfilled order (unique on supplier+request) so re-fulfillment never double-counts.
- Migration `20260908143558_phase7_supplier_system` applied to dev + test DBs.

### Domain logic (`src/lib/suppliers/`)
- `status.ts` — status constants + human labels.
- `access.ts` — `guardSupplier` (session → profile PENDING gates for operating endpoints; profile itself readable/editable while pending) and `guardAdmin`.
- `serialize.ts` — ownership-scoped serializers.
- `service.ts` — register, profile get/update, admin list/review, offerings CRUD, assign/action/fulfill, earnings + summary, inbound opportunity matching.
- `validators/supplier.ts` — registration/profile/offering/action/fulfillment/review schemas.

### API
- `POST /api/suppliers/register` — self-service onboarding → `SUPPLIER` account + `PENDING` profile.
- `GET|PUT /api/suppliers/profile`.
- `GET|POST /api/suppliers/offerings`, `PUT|DELETE /api/suppliers/offerings/[id]` — ownership-checked.
- `GET /api/suppliers/requests`, `POST /api/suppliers/requests/[id]/action`, `POST /api/suppliers/requests/[id]/fulfill`.
- `GET /api/suppliers/earnings`, `GET /api/suppliers/opportunities`.
- `GET /api/admin/suppliers`, `POST /api/admin/suppliers/[id]` — admin review (approve/suspend/reject).
- `POST /api/operations/requests/[id]/supplier` — operator assigns a paid request to a supplier.

### UI
- `/suppliers/register` — client onboarding form.
- `/suppliers` — supplier dashboard (pending banner, assigned orders, stats).
- `/suppliers/offerings` — client-side catalogue CRUD.
- `/suppliers/earnings` — ledger + summary.
- `/admin/suppliers` (+ `AdminSuppliersList`, `ReviewSupplier`) — review queue for admins.
- Header nav + home-page "Are you a supplier? Sell through BUGETTA" entry points.

### Security / isolation
- Pending suppliers get `403 NOT_APPROVED` on operating endpoints but keep profile access.
- Anonymous/other roles blocked (401/403).
- Cross-supplier reads, edits, and actions return `404` (no existence leak).
- Fulfillment is idempotent (single `SupplierEarning` per order).

## Verification
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npm run build` — succeeds; all routes compile including `/admin/suppliers` and the new API routes.
- `npm test` — **100 / 100 passing** across 14 files (Phase 7 added 15 tests in `src/app/api/suppliers/suppliers.test.ts` covering onboarding, gates, role guards, admin review, offerings CRUD + privacy, and the assign→accept→fulfill→earnings path).

## Live e2e (dev server, http://localhost:3100)
Ran end-to-end against a running dev server and real `prisma/dev.db`. All checks passed:

1. Onboarding → PENDING with correct labels/role; session + CSRF captured.
2. Pending supplier blocked from offerings (`403 NOT_APPROVED`) but can read their profile; anonymous blocked (`401`).
3. Admin review queue shows the pending supplier; approval sets status → APPROVED + `approvedAt`.
4. Offered catalogue: priced + unpriced offerings created; invalid category → `422`.
5. Cross-supplier isolation: supplier B sees zero of A's offerings; B's PUT on A's offering and B's action on A's order → `404`.
6. Full paid order path: customer request (classified EVENTS/catering) → ops adds option + quote → statuses to AWAITING_CUSTOMER → customer SELECT-quote → APPROVED → sandbox payment → PAID → ops assigns to supplier A → A accepts → fulfills (earned NGN 175,000).
7. Earnings ledger shows the single entry and a NGN 175,000 total; re-fulfill does not duplicate it.

## Notes
- A dev server was already running on port 3000 with a stale in-memory Prisma client (started before the Phase-7 migration/generate). It was stopped and the phase was verified on a freshly started dev server on port 3100.
- For e2e only, the seeded `e2e-ops@example.com` account was promoted to `ADMIN` directly in `prisma/dev.db` (test-only fixture; dev DB has no seeded ADMIN otherwise).
- CSRF/rate-limit lessons: curl in PowerShell needs `--data-binary @file` bodies; the supplier-register limiter is 5 per 15 min per key (in-memory, resets on server restart).