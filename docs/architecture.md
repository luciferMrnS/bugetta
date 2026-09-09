# BUGETTA — Architecture

## Product concept

> Tell us what you need. We'll find it, arrange it, and get it to you.

BUGETTA is a **digital commerce concierge / demand aggregation + fulfillment
platform**, not a traditional marketplace. The core abstraction:

1. **Request** — a customer expresses a need in natural language.
2. **Discovery** — the system finds ways to satisfy it.
3. **Options** — verified possibilities with prices are presented.
4. **Approval** — the customer chooses.
5. **Payment** — server-verified payment.
6. **Fulfillment** — the platform coordinates completion.
7. **Trust** — ratings, disputes, audit history protect the transaction.

This abstraction is generalized across all categories (food, groceries,
fashion, electronics, services…); there is no per-category subsystem.

## Decisions (Phase 0)

| Area | Decision | Rationale |
| --- | --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript | One deployable full-stack codebase |
| Styling | Tailwind CSS v4 | Mobile-first, minimal ceremony |
| ORM | Prisma 7 | Type-safe, clean migrations, multi-provider |
| Database | SQLite (dev) → PostgreSQL (production) | Zero-install local dev; Postgres later via driver adapter |
| Auth | Custom DB-backed sessions (bcrypt + httpOnly cookies + CSRF); planned Phase 1 | Transparent, auditable, exact control over CUSTOMER/OPERATIONS/ADMIN roles |
| Payments | Paystack (init/verify/webhook, server-side verification); planned Phase 5 | ₦ market, never trusts client-side payment status |
| Money | Integer minor units (kobo) in `src/lib/money.ts` | No floating-point drift |
| Validation | Zod schemas shared client/server (Phase 2+) | Deterministic validation |

## Phased roadmap

| Phase | Deliverable |
| --- | --- |
| 0 | **Foundation** — Next.js + Prisma + SQLite wiring, health check, test suite, env docs |
| 1 | Customer authentication (register/login/logout/profile, protected routes) |
| 2 | Request engine — “What do you need?” structured request intake & persistence |
| 3 | Operations dashboard — status management, manual supplier options |
| 4 | Customer quotes & approval — server-authoritative pricing |
| 5 | Payments — initialization, verification, webhooks, duplicate protection |
| 6 | Order & fulfillment state machine |
| 7 | Supplier system (onboarding, verification, offerings) |
| 8 | Deterministic supplier matching engine |
| 9 | AI concierge (assistive only; never authoritative over money/roles) |
| 10 | Delivery & logistics abstraction |
| 11 | Ratings, trust & disputes |
| 12 | Analytics & BI |
| 13 | Scale & automation |

## Security principles (enforced from Phase 1)

- Server-side authorization on every route; never trust client claims.
- All money, prices, fees, payment status computed/verified server-side.
- Password hashing (bcrypt), rate-limited auth, CSRF protection, secure cookies.
- Secrets only via environment variables; webhook signatures verified.
- Audit logs for composed actions (added in later phases).

## Phase completion protocol

Every phase ends with a status report listing implemented scope, tests,
known issues, security checks, DB/API/frontend changes, and every acceptance
criterion marked PASS/FAIL. A phase with any failing critical criterion is
not advanced past until fixed.