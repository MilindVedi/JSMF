# Roadmap

This document lays out the intended sequence of stages for JSMF, from the current mock UI work through to a production system. Each stage is described with what it involves and what "done" looks like for that stage, so that progress can be tracked against a shared understanding of the path rather than an open-ended list of work.

## 1. Mock UI / Product Discovery (current stage)

This is where the project stands today: a frontend-only Next.js prototype built against static, hardcoded mock data, with no real backend of any kind behind it. The detailed plan for this stage is in [UI/UX Plan](./05-ui-ux-plan.md). The goal of this stage is to align the team on the product experience, the information architecture, and the visual identity before any engineering effort is spent on real infrastructure that would be expensive to redo if the product direction shifted after the fact. This stage is "done" when the mock UI covers the full V1 feature surface described in [V1 Scope](./02-v1-scope.md) convincingly enough for the team to sign off on the product experience it represents.

## 2. Finalize V1 Requirements

Using what is learned from reviewing the mock UI — what works, what doesn't, what was missing, what turned out to be unnecessary — the exact V1 feature set and content scope are locked. This stage is "done" when there is a settled, specific feature list and content scope that the rest of the project builds toward, superseding the working draft in [V1 Scope](./02-v1-scope.md) with whatever refinements the mock UI review surfaced.

## 3. Architecture Finalization

The real technology stack and high-level architecture are confirmed, building on the direction already laid out in [Architecture](./03-architecture.md), including making concrete decisions on hosting and infrastructure that document currently leaves open. This stage is "done" when there is a specific, agreed technical architecture that the backend and database work in the next stage can be built against, rather than a directional document.

## 4. Database / Backend Implementation

The real PostgreSQL schema is designed and the NestJS backend is built out, including the entitlements-based subscription model described in [V1 Scope](./02-v1-scope.md) and [Architecture](./03-architecture.md). This stage is "done" when the backend can support the full V1 feature set against a real database, independent of whether real content or real users are in it yet.

## 5. APIs

The API contracts consumed by both the web application and the future Flutter mobile apps are defined and implemented — whether these end up being REST, GraphQL, or some mix has not yet been decided. This stage is "done" when both the web client and the mobile client have a stable, documented contract to build against, so that frontend and backend work can proceed without constant renegotiation of what each endpoint returns.

## 6. Real Content

The question bank begins to be populated with real, doctor-authored, pipeline-reviewed content, replacing the placeholder mock data used through the earlier stages. The content pipeline itself — described in [Content Pipeline](./04-content-pipeline.md) — is developed as a separate effort from the main application; this stage is where its output starts flowing into the real system. This stage is "done" when there is a real, meaningfully sized question bank in place, built through the doctor-review process rather than mock data.

## 7. Authentication

Real authentication — sign up, login, logout, password reset, and real session handling — is implemented, replacing the mock auth store described in [UI/UX Plan](./05-ui-ux-plan.md). This stage is "done" when user accounts and sessions are real and secure, with no remaining reliance on the mock, UI-only auth flow from the prototype stage.

## 8. Subscriptions

Real payment processing is integrated and entitlement enforcement is implemented against the model designed in stage 4, replacing the mock "Upgrade" behavior from the prototype. This stage is "done" when a user's actual paid plan determines what content and features they can access, and payments are processed through a real payment provider rather than simulated.

## 9. Production Deployment

Real hosting and infrastructure are stood up, following the scaling principles described in [Architecture](./03-architecture.md) — starting from a small, appropriately sized footprint and scaling as the user base grows, rather than over-provisioning ahead of demonstrated need. This stage is "done" when JSMF is live to real users on real infrastructure.

## Downstream Workstreams

Two categories of work sit outside this core sequence and are treated as separate, downstream workstreams layered on top of it once the web platform is solid:

- **Android and iOS application development** using Flutter, as described in [Architecture](./03-architecture.md), which depends on the APIs defined in stage 5 but is not itself a blocking part of getting the web platform to production.
- **Additional future medical education products** — courses, PDFs, notes, and anything else beyond the initial PYQ question bank described in [Product Vision](./01-product-vision.md) — which are deliberately not part of this roadmap's core sequence and are picked up only once the core web platform described above is stable and proven.
