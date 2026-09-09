# PHASE 13 STATUS — Scale & Automation

## Status: COMPLETE ✅

## Objective
Turn BUGETTA's manually-run marketplace into one that responds automatically: customers get instant receipts the moment their request is captured, suppliers in a category get warm leads when a matching request lands, machine-made quotes are assembled from the catalogue for the best-priced matches, stock levels can be batch-synced from suppliers' own files (with a low-stock alert when inventory dips), the invoice/ledger for all of this is auditable by operations, and the Concierge can recommend suppliers **before** a request even exists. All of it is sandbox-safe, fully tested, and lint/type/build clean in one pass.

## What was built

### Automation ledger & triggers (`src/lib/automation/service.ts`)
- `runAutomation({ trigger, requestId?, supplierId?, offeringId?, now? })` — the single entry point. Never throws: every failure is recorded as a run row (status `FAILED`, error captured), so automation can never break the primary write that fired it.
- Triggers (each idempotent by design):
  - `REQUEST_CREATED` — customer ack + supplier discovery via the matching engine (top 5 leads) + **auto-quotes** from priced catalogue offerings for up to `MAX_AUTO_QUOTES` (3) suppliers, with `AUTO_QUOTE_SERVICE_FEE_NAIRA` (1500) transparent in the price. Deduped per request: a second run for the same request is `SKIPPED`.
  - `PAYMENT_PAID` — RECEIPT to the customer + processing notice to the assigned supplier, fired on the captured-payment webhook path.
  - `DELIVERED` — delivery confirmation to the customer (+ supplier if in fulfilment), fired when a delivery transitions to `DELIVERED`.
  - `LOW_STOCK` — alert to the supplier when stock crosses below `LOW_STOCK_THRESHOLD` (5). Deduped per offering with a 24-hour window.
- Every run gets a `AUTO-` reference, a human `summary`, structured `results` (`notify.customer`, `notify.supplier`, `match`, `auto_quote`), and an ISO `createdAt` — the **automation ledger**.
- Hooks are fire-and-forget (`.catch(() => {})`) at: `createRequest`, payment capture, delivery delivered, and catalog sync.

### Notifications (`src/lib/notify/`)
- `sendNotification` renders one of seven templates (REQUEST_CREATED, SUPPLIER_LEAD, QUOTE_READY, PAYMENT_PAID, ORDER_PROCESSING, DELIVERED, LOW_STOCK) through the channel registry (email / SMS / push / WhatsApp), filtered by per-user preferences. **Missing preference rows now default to enabled** — a new user starts fully reachable, and a user who disables every channel gets a `FAILED` notification with the reason.
- Account surfaces: `GET|POST /api/account/notifications` (feed + `unreadCount`; `read_all`), `POST /api/account/notifications/[id]` (read one), `GET|PUT /api/account/notification-preferences` (startup↔settings). `NotificationBell` in the header, `/notifications` page, and the preferences panel on `/account` all live and wired.

### Inventory sync + low stock (`src/lib/suppliers/catalog.ts`)
- `runCatalogSync({ provider, entries })` — batch upsert of `offeringId → quantityAvailable` from suppliers' own stock files (the "web" provider pastes `id: quantity` lines). Per-run `SYN-` reference; status `COMPLETED` / `PARTIAL` / `FAILED`. Offerings that hit 0 are deactivated; crossing below `LOW_STOCK_THRESHOLD` fires `LOW_STOCK` automation (with the 24h dedupe). `quantityAvailable` and `lastSyncedAt` are now permanent offering fields (migration included) and exposed on the offerings API.
- `POST|GET /api/suppliers/catalog/sync` — supplier-scoped; a full `CatalogSyncPanel` on the supplier offerings page.

### Concierge recommendations (`src/lib/concierge/recommendations.ts`)
- `buildRecommendations` runs the **same** matching engine as persisted requests, against an in-memory request (reference: "(not yet created)") — so a browser-side "can you source this?" yields the top N suppliers, the best match, qualifier copy and a "suggestions are advisory" note. **Read-only**: `GET /api/concierge/recommendations` never writes a row. Wired into the assistant as the `GoMarketRecommendations` block, and backed by the matching refactor (`scoreRequestLike(request, null)`).

### Operations audit (`src/app/api/operations/automation/runs`)
- `GET /api/operations/automation/runs` — the ledger for ops: runs with request reference, totals by status, and the trigger set. UI: `/operations/automation` (`AutomationLedger`), linked from the ops dashboard.

## Verification
- `npx next typegen` — clean (all new routes registered).
- `npx tsc --noEmit` — clean (including the new test suites).
- `npm run lint` — clean (0 errors, 0 warnings).
- `npm run build` — **Compiled successfully** (Turbopack), all routes/pages tree-shaken.
- `npm test` — **249 / 249 passing** across 37 files (Phase 12 baseline 204 + 45 new):
  - `src/lib/notify/service.test.ts` (8) — defaults on, toggles, bulk/individual reads, foreign-user isolation.
  - `src/lib/suppliers/catalog.test.ts` (7) — sync upsert, deactivate-at-0, PARTIAL on missing offering, LOW_STOCK dedupe window, reference uniqueness.
  - `src/lib/automation/service.test.ts` (5) — REQUEST_CREATED auto-quote path, idempotent skip, PAYMENT_PAID/DELIVERED notifications, LOW_STOCK.
  - `src/lib/automation/hooks.test.ts` (4) — the lifecycle, end to end: create-request → run + customer ack, captured webhook → RECEIPT, delivery `DELIVERED` → confirmations, and a run that succeeds even when nobody can supply.
  - `src/lib/concierge/recommendations.test.ts` (3) — top suppliers, qualifier, the "(not yet created)" request never persists.
  - `src/app/api/account/notifications/notifications.test.ts` (8) — guards, feed+unread, read_all, read-one (incl. 404 for foreign-owned), preferences defaults + toggle round-trip.
  - `src/app/api/suppliers/catalog/sync/route.test.ts` (4) — supplier guard, validation field errors, seeded COMPLETED run + ledger row, GET scoping.
  - `src/app/api/concierge/recommendations/route.test.ts` (4) — 401/422 guards, seeded advisory recommendations, and a "never writes" assertion.
  - `src/app/api/operations/automation/runs/route.test.ts` (2) — operator-only, ledger + totals + trigger set.

## Notes
- **Money discipline holds:** auto-quotes are priced from kobo internally (`minorUnitsFromMajor`) and only exposed to the browser in naira; `quantityAvailable` is a count, never currency.
- **Automation is observable, not silent:** every run is an auditable row ops can inspect, and the customer always has a receipt/timeline entry — automation supplements the manual flow, it never hides behind it.
- **Idempotency is pre-emptive:** REQUEST_CREATED has a per-request uniqueness guard; LOW_STOCK a 24h offering window; PAYMENT_PAID/DELIVERED inherit the webhook/status guards already in payments and delivery.
- The hot `next dev` server predates this phase — restart it to exercise notifications, catalog sync and the automation ledger live.