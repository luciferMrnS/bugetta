# BUGETTA — Universal Commerce Concierge

> Tell us what you need. We'll find it, arrange it, and get it to you.

BUGETTA is a demand-first commerce platform. Customers describe almost
anything they need; the platform structures the request, researches verified
options, gets the customer's approval, handles payment, and coordinates
fulfillment. It is built phase by phase — see the roadmap in
`docs/architecture.md`.

## Stack

- **Next.js 16 (App Router) + React 19 + TypeScript**
- **Tailwind CSS v4** — mobile-first UI
- **Prisma 7 (SQLite for local dev → PostgreSQL for production)**
- **Vitest** — unit + integration tests
- Money stored as **integer minor units** (kobo), never floats.

## Getting started

Prerequisites: Node.js 20+ (developed on Node 24).

```bash
npm install
cp .env.example .env   # Windows: copy .env.example .env
npm run db:generate    # generate the Prisma client
npm run db:migrate     # apply migrations (creates prisma/dev.db locally)
npm run dev            # http://localhost:3000
```

## Environment configuration

| Variable | Local value | Production |
| --- | --- | --- |
| `DATABASE_PROVIDER` | `sqlite` | `postgresql` (planned) |
| `DATABASE_URL` | `file:./prisma/dev.db` | `postgresql://…` (planned) |

Secrets (payment keys, production credentials) are loaded exclusively from
environment variables and are never committed. `.env` is gitignored;
`.env.example` documents the schema.

## Available scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | ESLint |
| `npm test` | Run unit + integration tests (Vitest) |
| `npm run db:generate` | Regenerate the Prisma client into `src/generated/prisma` |
| `npm run db:migrate` | Create/apply a new database migration |
| `npm run db:studio` | Open Prisma Studio |

## Health check

`GET /api/health` verifies API and database connectivity:

```bash
curl http://localhost:3000/api/health
# {"status":"ok","service":"bugetta-api","db":"connected","latencyMs":…,"timestamp":"…"}
```

## Repository layout

```
prisma/          Prisma schema + migrations + local dev.db
src/app/         App Router pages and API route handlers
src/lib/         Server-side application code (db client, business logic)
src/generated/   Generated Prisma client (do not edit; run npm run db:generate)
tests (via src/*.test.ts)   Vitest unit + integration tests
```