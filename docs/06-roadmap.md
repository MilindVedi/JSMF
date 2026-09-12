# Roadmap

This document lays out the intended sequence of stages for JSMF, from the current mock UI work through to a production system. Each stage is described with what it involves and what "done" looks like for that stage, so that progress can be tracked against a shared understanding of the path rather than an open-ended list of work. This is a living document — as each stage actually plays out, it gets updated to reflect what really happened (dates, decisions, scope changes) rather than staying a static plan written once and left behind. A visual, at-a-glance version of the full sequence is kept in sync in [`diagrams/roadmap-phases.puml`](./diagrams/roadmap-phases.puml).

## 1. Mock UI / Product Discovery (current stage)

This is where the project stands today: a frontend-only Next.js prototype built against static, hardcoded mock data, with no real backend of any kind behind it. The detailed plan for this stage is in [UI/UX Plan](./05-ui-ux-plan.md). The goal of this stage is to align on the product experience, the information architecture, and the visual identity before any engineering effort is spent on real infrastructure that would be expensive to redo if the product direction shifted after the fact.

**1a. Build.** The mock UI is built out screen by screen against the feature surface in [V1 Scope](./02-v1-scope.md), using static mock data and mock auth/subscription state as described in [UI/UX Plan](./05-ui-ux-plan.md) — no backend dependency, so iteration speed is limited only by frontend build time.

**1b. Deploy for review.** The prototype is deployed to Vercel from this repository so it can be reviewed as a real, clickable product rather than a local dev server or a set of static screenshots — first with a small, trusted circle (friends, informal reviewers) before any wider or more formal review round. Because everything is mock data behind mock auth ("any email/password works" — see [UI/UX Plan](./05-ui-ux-plan.md), "Assumptions & Open Questions"), a Vercel preview URL is safe to hand out without any real user data, payment processing, or backend exposure being at stake. The deployment itself is also gated behind a separate, unrelated HTTP Basic Auth prompt (`src/middleware.ts`, credentials set as Vercel environment variables) — `robots.ts`/`noindex` only keep the URL out of search results, they don't stop anyone who has the link from opening it, so Basic Auth is the actual access control while this is a one-recipient-at-a-time review link rather than a public product.
**1c. Share and collect feedback.** The deployed link is shared with reviewers along with enough context to review it meaningfully — what's real vs. mocked, what to focus on, what's already a known gap (tracked in [Future Scope](./07-future-scope.md) and the "Assumptions & Open Questions" section of [UI/UX Plan](./05-ui-ux-plan.md), so reviewers aren't re-reporting things already deliberately deferred). Feedback is collected as concretely as possible — specific screens, specific flows, specific reactions — rather than only general impressions.
**1d. Iterate.** Feedback is triaged and folded back into the mock UI: genuine UX problems and missing pieces get fixed directly; larger product-direction questions get raised explicitly rather than silently absorbed into a UI tweak. Steps 1b–1d repeat — redeploy, reshare, re-collect, re-iterate — for as many rounds as it takes. See [`diagrams/mock-ui-feedback-loop.puml`](./diagrams/mock-ui-feedback-loop.puml) for this loop laid out as a flowchart.
**1e. Sign-off.** This stage (and the loop above) is "done" when the mock UI covers the full V1 feature surface described in [V1 Scope](./02-v1-scope.md) convincingly enough, and enough review rounds have converged on no more significant open feedback, to sign off on the product experience it represents and move on to locking down what V1 actually is.

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

Product ideas that are deferred past V1 but worth keeping on record — rather than staged work needed to reach V1 — are tracked separately in [Future Scope](./07-future-scope.md).
