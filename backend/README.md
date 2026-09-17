# JSMF Backend

NestJS + PostgreSQL API for the [JSMF PDF & digital content platform](../docs/pdf-platform/README.md).

## Getting started

Requires Node 20+ and Docker Desktop running.

```bash
cd backend
npm install
cp .env.example .env      # then generate real secrets (see below)
npm run db:up             # starts PostgreSQL on :5433 and Redis on :6380
npm run prisma:migrate    # creates the schema
npm run db:seed           # roles, first admin, starting taxonomies
npm run start:dev
```

The API is then on http://localhost:4000/api, with Swagger docs at
http://localhost:4000/api/docs and a real health check (it actually queries the
database) at http://localhost:4000/api/health.

Generate the four secrets `.env` needs:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## No cloud accounts required

Both external dependencies sit behind an interface with a development adapter,
so the entire product — including upload, checkout, payment verification,
webhooks and entitlement-gated download — runs end to end before any Google
Cloud or Razorpay account exists:

| Concern | Dev default | Production |
|---|---|---|
| File storage | `STORAGE_DRIVER=local` — writes under `.storage/`, serves time-limited signed URLs from this API | `STORAGE_DRIVER=gcs` |
| Payments | `PAYMENT_DRIVER=stub` — simulates Razorpay's order creation, signature and webhook lifecycle | `PAYMENT_DRIVER=razorpay` |

Switching either one is a `.env` change; no application code moves. Env
validation refuses to boot in `NODE_ENV=production` with either development
adapter selected, so a stub cannot reach production by accident.

## Scripts

| Command | What it does |
|---|---|
| `npm run start:dev` | Watch-mode API |
| `npm run build` / `npm run start:prod` | Compile and run |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, zero warnings tolerated |
| `npm run test` | Vitest |
| `npm run db:up` / `db:down` | Local PostgreSQL + Redis |
| `npm run prisma:migrate` | Create and apply a migration |
| `npm run prisma:studio` | Browse the database |
| `npm run db:seed` | Seed reference data (idempotent) |

## Layout

```
src/
  config/              env validation (zod) — the process refuses to boot if invalid
  shared/prisma/       PrismaService + module
  modules/
    health/            real DB-touching health check
prisma/
  schema.prisma        the data model — see docs/pdf-platform/03-data-model.md
  migrations/          includes hand-written integrity constraints, below
  seed.ts              roles, admin, taxonomies
```

## The constraints worth knowing about

`prisma/migrations/*_add_integrity_constraints/migration.sql` contains rules
Prisma's schema language cannot express. They are load-bearing:

- **One active entitlement per (user, product)** — a partial unique index. This
  is what makes a duplicated Razorpay webhook or a double-submitted payment
  unable to grant access twice, without depending on application code to check
  first.
- **One current asset per (product, kind)** — so a corrected re-upload has a
  deterministic answer to "which file does a buyer get?".
- **Pricing coherence** — a `FREE` product with a price, or a `PAID` product
  without one, is rejected by the database.
- **Order totals must equal subtotal − discount + tax** — an arithmetic bug in
  coupon or tax handling fails loudly at write time rather than being discovered
  during a refund dispute.

## Conventions

- Money is `BigInt` in **minor units** (paise). `₹199.00` is `19900n`. It is
  serialised to JSON as a **string**, never a number, because `Number` silently
  loses precision above 2^53.
- All timestamps are `timestamptz`.
- Nothing purchasable is ever hard-deleted; products are archived.
