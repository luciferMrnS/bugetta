# PHASE 12 STATUS — Analytics & Business Intelligence

## Status: COMPLETE ✅

## Objective
Give BUGETTA's admins a read-only **business-intelligence dashboard** over the existing marketplace ledger: requests-per-day and conversion, order value, revenue (gross / net / refunds), gross margin (revenue minus supplier payouts), supplier performance, category demand, fulfilment time, cancellation rate, repeat-purchase behaviour and customer acquisition — plus the key question the board keeps asking: **what are people asking for that we currently cannot fulfil?** That unmet-demand view aggregates never-converted requests (cancelled or still open before payment) by category, states the naira value of the budgets at risk, lists the most-requested items and shows, per category, how many approved suppliers cover it — so an empty "Active suppliers" cell is a direct supplier-acquisition lead.

## What was built

### Analytics library (`src/lib/analytics/`)
- `service.ts` — `getAnalyticsDashboard(days)` with every number **derived on demand** from stored rows (never cached, never mutated):
  - Window: `days` (default 30, max 365), bounded to whole UTC calendar days (`startOfUtcDay`/`endOfUtcDay`) so the dashboard is timezone-deterministic. Demand is windowed by `request.createdAt`, money by `payment.paidAt`, refunds by `refund.createdAt`.
  - **Requests/day** — daily series (`requests`, `paid`, `newCustomers`) for every day in the window including zeros.
  - **Conversion rate** — requests with a captured payment ÷ requests created in the window.
  - **Average order value** — gross charges ÷ paid requests.
  - **Revenue** — gross = sum of captured payment amounts; refunds = sum of refund rows; net = gross − refunds.
  - **Gross margin** — gross − supplier payouts (`SupplierEarning.amountKobo` for in-window requests), stated as both naira and rate.
  - **Supplier performance** — fulfilment count, earned naira, windowed average rating and the Phase 11 `supplierReliability` score+band, for every supplier active in the window.
  - **Category demand** — requests / paid / open / cancelled / conversion / revenue per category, labelled.
  - **Fulfilment time** — mean hours from request creation to `SupplierRequest.fulfilledAt`.
  - **Cancellation rate** — `CANCELLED` ÷ created.
  - **Repeat customers** — distinct paying customers, one-time vs repeat (≥2 captured payments in window) and the repeat-purchase rate; **acquisition** — new customer sign-ups, first-ever buyers and buyer conversion.
  - **Unmet demand** — requests that never produced a captured payment, grouped by category (`cancelled` vs still-open, budget in naira, and `activeSuppliers` = approved suppliers covering that category from `Supplier.categories` JSON or Offerings), plus top requested item names and recent examples. Pure helpers `dayKey`, `startOfUtcDay`, `endOfUtcDay`, `percentRate` are exported and unit-tested.
- **Money discipline:** all arithmetic is in kobo; only display values are converted to naira (via `majorUnitsFromMinor`), rounded server-side. No client-supplied numbers exist anywhere on the path.

### API
- `GET /api/admin/analytics?days=N` — `guardAdmin` (operations and customers are deliberately blocked: 403 tested), rate limit 60, zod-validated `days` (1–365; out-of-range/invalid → 422 `VALIDATION_ERROR`). Returns the full dashboard via the shared `ok(...)` shape.

### UI
- `src/app/admin/analytics/page.tsx` (admin-only page guard, mirrors Trust Center) + `src/components/…` free — component colocated as `src/app/admin/analytics/AdminAnalytics.tsx`:
  - Window switcher (7 / 30 / 90 days).
  - KPI cards: requests (+ per-day), conversion rate, AOV, gross/net revenue, gross-margin rate + naira, cancellation rate, average fulfilment hours, supplier payouts.
  - Requests-per-day bar chart (pure CSS, no chart library) with paid + new-customer counts.
  - Category demand table, supplier performance table, customer acquisition cards.
  - **Unmet demand** section: per-category table with budget and *"No supplier — recruit"* in red when zero approved suppliers cover the category, item chips, and recent example requests.
- `src/components/Header.tsx` — "Analytics" nav link for admins.

## Verification
- `npx next typegen` (new route), `npx tsc --noEmit` — clean.
- `npm run lint` — clean (fixed the `set-state-in-effect` pattern, removed unused vars/imports).
- `npm run build` — **Compiled successfully**; the new route/page compile.
- `npm test` — **204 / 204 passing** across 28 files (Phase 11 baseline 197 + 7 new):
  - `src/lib/analytics/analytics.test.ts` (3) — `percentRate` rounding + zero-division safety, UTC `dayKey`, `startOfUtcDay`/`endOfUtcDay` bounds.
  - `src/app/api/admin/analytics/analytics.test.ts` (4) — role guards (anon 401, customer 403, ops 403); `days` validation (bad/0/too-large → 422); empty-DB zeroed dashboard; and a full seeded-ledger dataset asserting exact numbers: 6 requests (0.2/day), 4 paid → 66.7% conversion, ₦18,500 gross / ₦5,000 refunds / ₦13,500 net, ₦4,625 AOV, ₦3,000 payouts → 83.8% margin, 16.7% cancellation, 1.8h avg fulfilment (2 fulfilled), requests-per-day buckets (today 4 requests / 2 paid / 4 new, d-2 and d-5 buckets), category demand per category, supplier row (2 fulfilled, ₦3,000, rating 4.5, reliability ≥ 0), customers (3 paying / 1 repeat / 33.3%, 4 new users / 3 new buyers / 75% conversion), and unmet demand (₦47,500 at risk across ELECTRONICS with **0 active suppliers** and FOOD with 1, item chips, examples).

## Notes
- **Everything is derived:** no analytics tables, no jobs, no caching — the dashboard recomputes from the ledger on request, so it can never drift from the source of truth and needs no migration.
- **Unmet demand = never converted:** a request counts only if it produced no captured payment in the window; `stage` distinguishes cancelled (lost) from still-open pipeline, and `activeSuppliers` turns the aggregate into a concrete acquisition target.
- Delivery fees are counted as platform revenue (final courier cost is not tracked yet), so `grossMarginRate` is documented as *revenue minus supplier payouts* — the margin on the collected basket, not a full P&L.
- The hot `next dev -p 3100` server predates Phase 12 — restart it before exercising analytics live.