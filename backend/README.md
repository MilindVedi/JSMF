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
webhooks and entitlement-gated download — runs end to end before any Cloudinary
or Razorpay account exists:

| Concern | Dev default | Production |
|---|---|---|
| File storage | `STORAGE_DRIVER=local` — writes under `.storage/`, serves time-limited signed URLs from this API | `STORAGE_DRIVER=cloudinary` |
| Payments | `PAYMENT_DRIVER=stub` — simulates Razorpay's order creation, signature and webhook lifecycle | `PAYMENT_DRIVER=razorpay` |
| Rate-limit state | `REDIS_ENABLED=false` — counters in process memory | Still `false` for V1's single instance; `true` + `REDIS_URL` once a second instance exists |

Switching any of them is a `.env` change; no application code moves. Env
validation refuses to boot in `NODE_ENV=production` with either development
adapter selected, so a stub cannot reach production by accident, and it refuses
`REDIS_ENABLED=true` without a `REDIS_URL`.

Redis is the odd one out: it is not a development stand-in for something else,
it is simply **not needed by V1 and therefore not run**, which keeps hosting
costs down. `npm run db:up` still starts one locally so the flag can be flipped
and tested without infra work. The trigger for turning it on — and why it
matters for correctness, not just speed — is in
[docs/03-architecture.md](../docs/03-architecture.md#redis-is-off-in-v1-on-purpose);
the short version is that in-memory rate limiting stops being correct the moment
a second API instance exists.

Neither development adapter is a mock. The local storage driver really writes
files and really rejects a tampered or expired link; the payment stub uses the
same HMAC constructions, header names and event vocabulary as Razorpay, so
signature verification can fail here for the same reasons it would fail in
production.

Note the asymmetry between the two, which is deliberate:

- **Storage keeps every adapter reachable.** Writes go to the configured
  driver; reads go to the provider recorded on the object itself. Switching to
  Cloudinary therefore leaves files already on disk still readable, instead of
  turning them all into 404s.
- **Payments binds one adapter at a time.** A stored file's location is a
  historical fact that outlives a config change; a payment is always transacted
  with whoever is live now. Past payments record their provider for audit, but
  nothing needs to call a provider no longer in use.

### ⚠️ Production credentials in a local `.env`

`.env` currently holds **real production Cloudinary credentials**, commented
in alongside the test-account ones. `.env` is gitignored, so this is not a
leak risk by itself — but be deliberate about switching `STORAGE_DRIVER` to
`cloudinary` locally while those are the active (uncommented) lines: any
upload, delete, or cleanup script run against this backend in that state
touches the **real production Cloudinary account**, not a disposable test one.
This has already caused real deletions once during test cleanup on the test
account — the same command against production would not be recoverable in the
same way. Prefer switching back to the commented-out test credentials (or
`STORAGE_DRIVER=local`) before running anything exploratory.

## Running the whole stack in Docker

The commands above run the API directly on your machine against a containerized database. To run everything — database, cache, API, and [`pdf-web`](../pdf-web) — in containers, use the root-level compose file instead (`../docker-compose.yml`, not this folder's, which stays as the lighter database-only setup above):

```bash
cd ..                                  # repo root
docker compose up -d --build
cd backend && npm run db:seed          # first run only
```

The seed script uses `tsx`, a dev-only dependency that isn't in the production container image, so it's run from the host — this works because `DATABASE_URL` in `.env` already points at `localhost:5433`, which the compose file exposes even when Postgres itself is containerized.

The API container runs `prisma migrate deploy` on every start before serving traffic, so a fresh database is never a separate manual step. `pdf-web` is built with `NEXT_PUBLIC_API_URL` baked in at build time (it's a browser-side value) — the default in `docker-compose.yml` assumes the API is reachable at `http://localhost:4000/api` from the browser, which is true as long as you're not also running the non-Docker API on the same port.

### Dev mode: hot reload inside Docker

The command above builds production images, so every code change needs a
rebuild. For day-to-day work, add the dev override instead:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

Source is bind-mounted and both services run their watch-mode dev servers, so
an edit on the host is live in a few seconds with no rebuild and no restart.
`--build` is only needed the first time and after a `package.json` change.

Two things in there are not obvious, and both were found by the watcher
silently failing rather than erroring:

- **`node_modules` is an anonymous volume, never bind-mounted.** The container's
  Linux-built native binaries (Prisma's query engine, `@node-rs/argon2`) would
  otherwise be shadowed by the host's — which on Windows is built for the wrong
  OS entirely, and the container dies on startup.
- **Both watchers are forced into polling.** Docker Desktop bind mounts from a
  Windows host don't reliably deliver filesystem events into the container, so
  the defaults just never fire. The API uses `tsconfig.docker.json`
  (`watchOptions` polling — `tsc --watch` ignores `CHOKIDAR_USEPOLLING`), and
  the web app runs `next dev --webpack` with `WATCHPACK_POLLING`, because
  Turbopack has no polling fallback at all.

Don't run both setups' Postgres/Redis at once — `backend/docker-compose.yml` and the root one use the same container names and host ports and will conflict.

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
  common/
    decorators/        @Public, @Roles, @CurrentUser
    guards/            JwtAuthGuard, RolesGuard (both registered globally)
  shared/
    prisma/            PrismaService + module
    audit/             AuditService — admin trail, written transactionally
  modules/
    health/            real DB-touching health check
    identity/          platform-wide auth — see docs/03-architecture.md
      domain/          PasswordHasher port
      application/     AuthService (register/login/refresh/logout), TokenService
      infrastructure/  Argon2PasswordHasher, JwtKeyProvider (RS256 + JWKS)
      http/            AuthController + DTOs
    storage/           file storage behind a provider port
      domain/          StorageProvider port (upload/sign/delete/exists)
      application/     StorageService — writes to the active provider,
                       reads from the provider each object records
      infrastructure/  LocalStorageAdapter, CloudinaryStorageAdapter
      http/            signed-URL download route for the local driver
    payments/          payment providers behind a port
      domain/          PaymentProvider port
      infrastructure/  StubPaymentAdapter, RazorpayPaymentAdapter
    catalog/           products, assets, taxonomy
      domain/          slug rules
      application/     ProductService, ProductAssetService, TaxonomyService
      http/            admin + public storefront controllers
    entitlements/      who may have what
      application/     EntitlementService (the only access check), DownloadService
      http/            library + signed-URL download routes
    orders/            selling: checkout, settlement, provider webhook
      application/     OrderService, PaymentService
      http/            order/verify controllers, webhook receiver
prisma/
  schema.prisma        the data model — see docs/pdf-platform/03-data-model.md
  migrations/          includes hand-written integrity constraints, below
  seed.ts              roles, admin, taxonomies
```

## Authentication

Platform-wide, not PDF-platform-specific: this is the identity service every
JSMF application will use. See [`docs/identity/`](../docs/identity/README.md)
for the full design and data model.

Access tokens are **RS256**-signed — the private key never leaves this service,
and anything else verifies with the public key from `GET /api/auth/jwks`. That
is what makes extracting this into a standalone auth service later a deployment
change rather than a rewrite. Refresh tokens are opaque, single-use, and rotate;
replaying one revokes its whole family.

Guards are registered **globally and fail closed** — every route needs a bearer
token unless marked `@Public()`.

Generate a dev keypair for `.env` (the command is in `.env.example`), then:

```bash
curl -X POST localhost:4000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","name":"You","password":"a-very-long-passphrase"}'
```

### Admin accounts

Admins are created **by invitation from an existing admin** — sign in, open
`/admin/team`, and invite by email. The invitee receives a single-use link
(valid 48 hours) and sets a password or signs in with Google. There is no
public endpoint for requesting admin access, by design — see
[`docs/identity/01-architecture.md`](../docs/identity/01-architecture.md#admin-accounts-are-created-by-invitation)
for why the earlier "email an approval code to the owner" design was rejected.

To bootstrap, `npm run db:seed` creates `SEED_ADMIN_EMAIL` **only when no admin
exists at all**, and stops doing so once a real one is registered. Change that
password immediately, or invite yourself properly and stop using it.

With `MAIL_DRIVER=log` (the default) the invitation is printed to the API's
console rather than sent, so the whole flow works with no mail account.

### Google sign-in

**Google Cloud setup is required**, and the one step that is easy to miss is
registering the callback. In the
[credentials console](https://console.cloud.google.com/apis/credentials), open
the OAuth 2.0 Client ID and add this under **Authorised redirect URIs**, exactly:

```
http://localhost:4000/api/auth/google/callback
```

It must match `GOOGLE_CALLBACK_URL` character for character — Google compares
the full string, so a trailing slash or `127.0.0.1` instead of `localhost` is a
mismatch. Without it every sign-in fails with `Error 400: redirect_uri_mismatch`
at Google's consent screen, before the request ever reaches this API. Add the
production callback the same way when deploying.

Off until `GOOGLE_OAUTH_ENABLED=true` and credentials are set. It is
platform-wide: `OAUTH_ALLOWED_REDIRECTS` lists which front-ends may receive a
completed sign-in, so the PYQ app and the PDF platform share one flow. The
allowlist is matched exactly — it is the control that stops an attacker having
a real session delivered to a site they own.

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
