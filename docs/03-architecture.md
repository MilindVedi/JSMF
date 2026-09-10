# Architecture

> **Status note:** everything in this document describes a target technical direction and a set of principles, not a finalized or implemented system. Nothing described here has been built yet — the team is currently building only the frontend mock UI described in [UI/UX Plan](./05-ui-ux-plan.md). This document exists so that the mock UI's information architecture (its routes, its data shapes, its notion of what a "session" or a "subscription plan" is) stays compatible with where the real system is headed, even though none of the backend pieces below exist yet.

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
| Cache / queue | **Redis** | Used both for caching frequently read data and as the backing store for background job queues, avoiding the need for a separate queuing system in the early stages. |
| Mobile applications | **Flutter** | A single codebase covering both Android and iOS, sharing as much business logic and UI as practical, rather than maintaining two separate native codebases. |
| Media storage | **Object storage** (e.g. AWS S3 or equivalent) | Images, PDFs, and other media are stored in object storage rather than on local disk, which is a prerequisite for running more than one application server and for eventually fronting media with a CDN. |

## Architectural Style Principles

A few style choices are deliberate and worth stating explicitly, because they trade off some theoretical scalability for reduced complexity at a stage where that complexity is not yet earned:

- **Monolith-first / modular monolith.** The backend is built as a single, well-modularized NestJS application rather than a microservices architecture. There is no Kubernetes, no Kafka, and no service mesh in V1. This is an intentional choice to avoid over-engineering an early-stage product whose real load and organizational scale do not yet justify that operational overhead — see the product philosophy in [Product Vision](./01-product-vision.md) for the broader reasoning.
- **Designed for later separation, not immediate separation.** Being a modular monolith does not mean modules are tangled together. Components that are natural candidates for extraction later — most notably a future dedicated content-ingestion service, described in [Content Pipeline](./04-content-pipeline.md) — should be structured as clearly bounded modules within the monolith from the start, so they can be pulled out into their own service later without a full rewrite.
- **Stateless application servers wherever practical.** The backend API should avoid holding session or request state in server memory, so that any application server instance can serve any request. This is what makes horizontal scaling behind a load balancer possible later without re-architecting.
- **Asynchronous background processing where appropriate.** Operations that do not need to complete within a single request/response cycle — bulk content ingestion, exports, notifications, and similar — should be handled through Redis-backed job queues rather than blocking the request thread. This keeps the API responsive under load and gives a natural place to put work that may take longer or fail and need retrying.

## Scalability Approach for Later Stages

None of the following is built for V1, but the architecture is chosen so that it is a natural next step rather than a rewrite when the time comes:

- Horizontally scale backend API instances behind a load balancer, relying on the statelessness principle above.
- Move to a managed PostgreSQL service rather than a self-managed database server.
- Move to a managed Redis service for the same reason.
- Put a CDN in front of object storage so that images and other media are served from edge locations rather than from the origin store directly.
- Put the web application itself behind a CDN / edge caching layer.
- Keep API servers stateless throughout, so that adding or removing instances is purely an infrastructure operation, not an application change.
- Make long-running or bulk operations asynchronous — content ingestion, bulk exports, notifications — rather than synchronous, so they do not become a scaling bottleneck as volume grows.

## Hosting

The hosting and infrastructure provider has not been finalized. The intent is to start with a relatively small and inexpensive V1 deployment footprint and scale up infrastructure as the user base actually grows, rather than over-provisioning ahead of demonstrated need. Importantly, this does not mean the initial architecture should take on assumptions that would block that later scaling — concretely, this means avoiding things like hard-coding single-server assumptions into application code, using local disk storage instead of object storage for media, or building processing paths as synchronous-only in places where it is already clear they will need to become asynchronous as volume increases. Getting these particular details right early is cheap; undoing them later, once real data and real users depend on them, is not.

## Subscription / Entitlement Modeling

As introduced in [V1 Scope](./02-v1-scope.md), subscription plans should map to a structured **entitlements** model — describing which exams, which products, and which features a given plan unlocks — rather than a single boolean "is paid" flag on a user. This is an architecture-level commitment, not just a V1 feature note: a boolean flag cannot represent a plan that unlocks NEET-PG and FMGE but not INI-CET, or a plan that unlocks the question bank but not a future course product, without an awkward schema migration later. Modeling entitlements as a structured, extensible concept from the start means future products and future plan variations can be introduced as new entitlement types rather than requiring rework of the core subscription schema.

## What We Are Building Right Now

To be unambiguous: at present, the only thing being built is a **frontend Next.js mock UI** using static, hardcoded mock data. None of the backend, database, or infrastructure described in this document exists yet. This document describes the target direction that the mock UI's information architecture — its routes, its data shapes, its assumptions about sessions, entitlements, and content — is designed to remain compatible with, so that the transition from mock UI to real system (laid out in [Roadmap](./06-roadmap.md)) is a matter of implementation, not redesign.
