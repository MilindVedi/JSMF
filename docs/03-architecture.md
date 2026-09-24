# Architecture

> **Status note:** most of this document describes a target technical direction for the **PYQ question-bank application**, which is still frontend-only — see [UI/UX Plan](./05-ui-ux-plan.md). That part has not been built yet.
>
> **One exception:** work on the [PDF platform](./pdf-platform/README.md) started this backend early, and because identity is explicitly meant to be shared across every JSMF application (see **Centralized Identity** below), the auth module, storage, payments and the product catalogue described in this document are now real and running — see each section's **Status: built** note for what exists and how it was verified. When the PYQ application gets its own backend, it will consume this same identity module rather than growing a second user table, which is the entire reason identity was designed and built as a platform-wide concern from the start rather than as a PDF-platform feature.

## High-Level Component Picture

At a high level, the long-term system looks like users on web and mobile clients talking to a single backend API, which in turn is backed by a primary relational database, a cache/queue layer, object storage for media, and background job processing for anything that should not block a request/response cycle.

```
                 ┌────────────┐        ┌────────────┐
                 │  Web Client │        │ Mobile App │
                 │  (Next.js)  │        │ (Flutter)  │
                 └──────┬─────┘        └──────┬─────┘
                        │                     │
                        └─────────┬───────────┘
                                  │
                          ┌───────▼────────┐
                          │  Backend API   │
                          │   (NestJS)     │
                          └───────┬────────┘
                 ┌────────────────┼────────────────┐
                 │                │                 │
          ┌──────▼─────┐  ┌───────▼──────┐  ┌───────▼───────┐
          │ PostgreSQL │  │    Redis     │  │ Object Storage │
          │ (primary   │  │ (cache +     │  │ (images, PDFs,│
          │  database) │  │ job queue)   │  │  media)       │
          └────────────┘  └──────┬───────┘  └────────────────┘
                                  │
                          ┌───────▼────────┐
                          │ Background Jobs │
                          └─────────────────┘
```

Both the web client and the future mobile clients are consumers of the same backend API rather than talking to the database directly, which keeps business logic, validation, and access control centralized in one place regardless of which client platform a request comes from.

## Proposed Stack

| Layer | Choice | Why |
|---|---|---|
| Web application | **Next.js + TypeScript** | Serves both the public marketing site and the logged-in application from a single codebase, with the flexibility to render pages statically, server-side, or client-side as each page needs. |
| Backend API | **NestJS + TypeScript** | A separate, structured backend service consumed by both the web app and the mobile app, giving a single authoritative source for business logic, data access, and access control shared across all clients. |
| Primary database | **PostgreSQL** | A mature, relational database well suited to the structured, relationship-heavy data JSMF works with — questions, subjects, topics, users, plans, entitlements, attempts. |
| Cache / queue | **Redis** — *deliberately off in V1* | The long-term choice for caching frequently read data and backing background job queues, avoiding a separate queuing system. **V1 ships with `REDIS_ENABLED=false` and does not run it**, because it is a paid service nothing in V1 needs — see [Redis is off in V1 on purpose](#redis-is-off-in-v1-on-purpose). |
| Mobile applications | **Flutter** | A single codebase covering both Android and iOS, sharing as much business logic and UI as practical, rather than maintaining two separate native codebases. |
| Media storage | **Object storage** (e.g. AWS S3 or equivalent) | Images, PDFs, and other media are stored in object storage rather than on local disk, which is a prerequisite for running more than one application server and for eventually fronting media with a CDN. |

## Architectural Style Principles

A few style choices are deliberate and worth stating explicitly, because they trade off some theoretical scalability for reduced complexity at a stage where that complexity is not yet earned:

- **Monolith-first / modular monolith.** The backend is built as a single, well-modularized NestJS application rather than a microservices architecture. There is no Kubernetes, no Kafka, and no service mesh in V1. This is an intentional choice to avoid over-engineering an early-stage product whose real load and organizational scale do not yet justify that operational overhead — see the product philosophy in [Product Vision](./01-product-vision.md) for the broader reasoning.
- **Designed for later separation, not immediate separation.** Being a modular monolith does not mean modules are tangled together. Components that are natural candidates for extraction later — most notably a future dedicated content-ingestion service, described in [Content Pipeline](./04-content-pipeline.md) — should be structured as clearly bounded modules within the monolith from the start, so they can be pulled out into their own service later without a full rewrite.
- **Stateless application servers wherever practical.** The backend API should avoid holding session or request state in server memory, so that any application server instance can serve any request. This is what makes horizontal scaling behind a load balancer possible later without re-architecting.
- **Asynchronous background processing where appropriate.** Operations that do not need to complete within a single request/response cycle — bulk content ingestion, exports, notifications, and similar — should be handled through Redis-backed job queues rather than blocking the request thread. This keeps the API responsive under load and gives a natural place to put work that may take longer or fail and need retrying.

### Redis is off in V1 on purpose

Redis remains the stack's choice for caching and queues, but **V1 does not run it**. It is a paid service in production, and nothing in V1 needs it: there are no background jobs, no cache layer, and rate-limit counters fit comfortably in the API process's memory while exactly one instance is running. Paying for it to sit idle would be cost without benefit.

Keeping that decision cheap to reverse was the requirement, so it is an environment switch rather than a code change — the same pattern as `STORAGE_DRIVER` and `PAYMENT_DRIVER`:

```bash
REDIS_ENABLED=false                      # V1 default — counters in process memory
REDIS_ENABLED=true                       # counters move to Redis, shared across instances
REDIS_URL=redis://localhost:6380
```

`ThrottlerModule` in `backend/src/app.module.ts` is the only place that reads it: with the flag off it passes no `storage` and the throttler uses its in-memory default; with it on it passes `ThrottlerStorageRedisService`. No `@Throttle()` decorator, guard, or call site differs between the two. Env validation refuses to boot with `REDIS_ENABLED=true` and no `REDIS_URL`, so the flag cannot be half-set.

Both paths are verified, not assumed: with the flag off, flooding the login endpoint returns `401 ×10` then `429`, and Redis key count is unchanged; with it on, the same flood produces the same `429` and the counters appear in Redis as `{…:default}:hits` / `:blocked`.

**Turn it on when any one of these becomes true — these are the actual triggers, not a vague "at scale":**

1. **A second API instance is deployed.** In-memory counters are per process, so N instances silently permit N× the intended rate limit, and a user is throttled inconsistently depending on which instance they hit. This is the most likely trigger and the one that matters for correctness rather than performance.
2. **The first background job is introduced** — bulk ingestion, exports, notification sending. That work arrives together with BullMQ, which requires Redis.
3. **A read path gets hot enough that PostgreSQL alone is not enough.** No such path exists today; the catalogue is small and reads are cheap.

Until one of those is true, the cheapest correct configuration is the one V1 ships with.

## Scalability Approach for Later Stages

None of the following is built for V1, but the architecture is chosen so that it is a natural next step rather than a rewrite when the time comes:

- Horizontally scale backend API instances behind a load balancer, relying on the statelessness principle above.
- Move to a managed PostgreSQL service rather than a self-managed database server.
- Turn Redis on (`REDIS_ENABLED=true`) and point it at a managed Redis service. Note this is a **prerequisite** for the first bullet above, not an independent step: the moment there is more than one API instance, rate-limit state has to be shared.
- Put a CDN in front of object storage so that images and other media are served from edge locations rather than from the origin store directly.
- Put the web application itself behind a CDN / edge caching layer.
- Keep API servers stateless throughout, so that adding or removing instances is purely an infrastructure operation, not an application change.
- Make long-running or bulk operations asynchronous — content ingestion, bulk exports, notifications — rather than synchronous, so they do not become a scaling bottleneck as volume grows.

## Hosting

The hosting and infrastructure provider has not been finalized. The intent is to start with a relatively small and inexpensive V1 deployment footprint and scale up infrastructure as the user base actually grows, rather than over-provisioning ahead of demonstrated need. Importantly, this does not mean the initial architecture should take on assumptions that would block that later scaling — concretely, this means avoiding things like hard-coding single-server assumptions into application code, using local disk storage instead of object storage for media, or building processing paths as synchronous-only in places where it is already clear they will need to become asynchronous as volume increases. Getting these particular details right early is cheap; undoing them later, once real data and real users depend on them, is not.

## Centralized Identity

JSMF is becoming more than one product — the PYQ question bank, the [PDF platform](./pdf-platform/README.md), a future Flutter app, and whatever follows. A person is one JSMF account across all of them, not a separate login per product, and that identity system is documented in its own place: **[`docs/identity/`](./identity/README.md)**.

It is not folded into this document or into the PDF platform's docs because it is not a feature of either — it is a platform-wide concern that happens to have been built first as part of the PDF platform's backend, the same way this document distinguishes "target direction" from "what is actually running" elsewhere. See [Identity — Architecture](./identity/01-architecture.md) for the design and what is built and verified today, and [Identity — Data Model](./identity/02-data-model.md) for the `users` / `roles` / `refresh_tokens` tables.

## Subscription / Entitlement Modeling

As introduced in [V1 Scope](./02-v1-scope.md), subscription plans should map to a structured **entitlements** model — describing which exams, which products, and which features a given plan unlocks — rather than a single boolean "is paid" flag on a user. This is an architecture-level commitment, not just a V1 feature note: a boolean flag cannot represent a plan that unlocks NEET-PG and FMGE but not INI-CET, or a plan that unlocks the question bank but not a future course product, without an awkward schema migration later. Modeling entitlements as a structured, extensible concept from the start means future products and future plan variations can be introduced as new entitlement types rather than requiring rework of the core subscription schema.

**Intended real-product behavior for exam-scoped filters (Question Bank, Custom Test):** a plan's `entitlements.examIds` (already modeled in the mock's `data/mock/plans.ts` — see `single-exam-pro`, entitled to `["neet-pg"]` only, vs. `all-access-pro`, entitled to all three) should gate which exams a student can select in the Exam multi-select filter. A `single-exam-pro` student would see their one entitled exam plain and the others shown locked (🔒), and attempting to select a locked one should prompt "🔒 Upgrade to All Access" rather than silently applying the filter. **This is not built in the current mock UI**, and the `/subscription` page's plan-switching CTA now makes that gap unreachable on purpose rather than merely unaddressed: switching to `free` or `single-exam-pro` is disabled ("Not selectable in this preview" — `pricing-card.tsx`'s `disabledReason` prop), because nothing downstream actually restricts content by entitlement yet, so letting a student switch to a lower tier would silently do nothing except relabel the current-plan banner — a mock lying about its own gating being worse than not offering the switch at all. The mock's single demo user therefore always stays on `all-access-pro` (seeded that way in `data/mock/demo-user.ts`, and re-asserted on every login/signup in `auth-store.ts`), which is why every enhancement built against this mock — Custom Test filters, Question Bank, Statistics, etc. — has only ever needed to assume unrestricted exam access. This is recorded here so the gap is a known, deliberate deferral rather than something to rediscover later.

## What We Are Building Right Now

To be unambiguous about the two things in flight at once:

- The **PYQ question-bank application** is still a **frontend Next.js mock UI** using static, hardcoded mock data. None of its backend, database, or infrastructure described elsewhere in this document (the question bank, attempts, statistics, subscriptions) exists yet. This document describes the target direction that the mock UI's information architecture — its routes, its data shapes, its assumptions about sessions, entitlements, and content — is designed to remain compatible with, so that the transition from mock UI to real system (laid out in [Roadmap](./06-roadmap.md)) is a matter of implementation, not redesign.
- The **backend that now actually exists** — identity, storage, payments, and the product catalogue — was built for the [PDF platform](./pdf-platform/README.md), not for the PYQ app. See that document's own status sections for what is implemented and verified. It is real NestJS + PostgreSQL code, not a mock, and it is the same identity module the PYQ app's future backend will consume rather than duplicate.
