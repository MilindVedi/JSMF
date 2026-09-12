# V1 Scope

## Framing

V1 is focused entirely on the PYQ / question-bank experience described in [Product Vision](./01-product-vision.md). Broader products that JSMF may eventually offer — structured courses, downloadable PDFs, study notes, and similar — are explicitly **out of scope for V1**. They will not be built as functioning features in this release; the only place they appear at all is as "Coming Soon" signals on the public landing page, so that visitors understand the platform's future direction without the team having to build or maintain those products before the core question-bank experience is proven.

This document describes the intended **real** V1 — the version of the product backed by a real backend, real database, real authentication, and real payments. It is important to distinguish that from the **current mock-UI prototype stage**, which is frontend-only and uses static mocked data with none of those real systems in place. The "Current Stage" section at the end of this document makes that distinction explicit; everything above it describes the target feature set once V1 is actually built out.

## In-Scope V1 Features

| Feature area | Description |
|---|---|
| **Authentication** | Sign up, login, logout, forgot/reset password, and a user profile. This is standard account management, but it is the gateway to everything else in the product and needs to be solid before anything else matters. |
| **Question Bank browsing** | Students can filter the full question bank by exam, year, subject (including selecting multiple subjects at once), and topic. This is the primary discovery surface for the entire product. |
| **Question content model** | Each question consists of a stem, multiple-choice options, a correct answer, an explanation, images where the question requires them, and tagging by subject and topic. This model needs to be rich enough to support real exam-style questions, not just plain text trivia. |
| **Question solving experience** | A student selects an answer, submits it, sees whether it was correct or incorrect, reads the explanation, and moves to the next or previous question. This is the single most frequently used interaction in the entire product and needs to be fast and low-friction. |
| **Bookmarks** | A dedicated "My Bookmarks" section where students can save questions to revisit later, independent of any particular test session. |
| **Wrong Questions** | A dedicated "My Wrong Questions" section that collects every question a student has answered incorrectly, specifically to support targeted revision. |
| **Attempt / Test History** | A breakdown of attempted, correct, incorrect, and unattempted questions, along with a history of past test and practice sessions, so students can see what they have already covered. |
| **Custom Tests** | Students can build a test by filtering on exam, year, subject, topic, and number of questions. Timed tests are an important part of realistic exam preparation and should be supported eventually; because a timer requires no backend dependency (it is purely client-side), timed custom tests are being explored as an early, near-native capability rather than something deferred until later backend work is done. |
| **Performance / Statistics** | Accuracy, total questions attempted, correct vs. incorrect breakdowns, subject-wise performance, per-test performance, question-bank coverage (share of the bank attempted at least once, distinct from accuracy), and revision/wrong-question statistics, so students can track their progress over time. |
| **Daily streak / engagement** | A daily-questions streak with a current and best count, shown on the dashboard and in the top navigation, with a restrained visual progression as the streak grows and a short completion celebration when the day's goal is met. Explicitly scoped to feel rewarding without becoming a game — no XP, levels, badges, or leaderboards. See [UI/UX Plan](./05-ui-ux-plan.md) for the full design. |
| **Question Reporting** | Students can report a question they believe has a problem, with reasons such as wrong answer, wrong explanation, incorrect question, image issue, or other. Reporting is user-facing functionality that belongs in V1; the internal content/admin workflow that reviews and acts on these reports is a separate, later effort (see [Content Pipeline](./04-content-pipeline.md) and [Roadmap](./06-roadmap.md)) and is not built as part of V1 itself. |
| **Subscription** | V1 supports paid access to the platform. Critically, the underlying architecture should model subscription **entitlements** — which exams and which content or features a given plan unlocks — rather than a single boolean `is_paid` flag. Different plans may unlock different exams or different feature sets, and this model needs to extend cleanly to future products without requiring a schema rework; see [Architecture](./03-architecture.md) for the architectural implications of this choice. |

## Out of Scope for V1

The following are explicitly not part of V1, even though some of them are part of the long-term vision described in [Product Vision](./01-product-vision.md):

- **Native courses, PDFs, and notes products.** These appear only as "Coming Soon" signals on the landing page in V1; no functioning version of these products is built.
- **The AI content-ingestion pipeline itself.** The pipeline that turns memory-based recalls into candidate questions (described in [Content Pipeline](./04-content-pipeline.md)) is developed as a separate effort from the main application. V1's job is to have a data model that can receive the pipeline's output cleanly, not to build the pipeline.
- **Production infrastructure and deployment.** Standing up real hosting, monitoring, and operational infrastructure is a later stage of the [Roadmap](./06-roadmap.md), not part of defining V1's feature scope.
- **Real payment processing.** V1's subscription feature is scoped to the entitlement data model and the user-facing subscription experience; actually integrating a payment processor and handling real transactions is a later implementation step.
- **A real backend, database, and authentication — specifically for the current mock-UI stage.** This is worth separating clearly from the rest of this list: it is not that these are permanently out of scope for the product, but that the team is currently building a frontend-only mock UI prototype with static, hardcoded sample data, and none of the real backend systems described above exist yet at this stage. The next section describes this current stage in detail.

## Current Stage: Product Discovery / UI Definition

> The team is currently in the **product discovery / UI definition stage**. Work right now consists of building a frontend-only mock UI prototype using realistic static and mocked sample data. There is no real backend, no real database, no real authentication, and no real payment integration at this point. The goal of this stage is to finalize the product experience and the UI/UX before investing engineering effort in the real backend and infrastructure that would be expensive to redo if the product direction changed after the fact.

The detailed plan for this mock UI stage — routes, navigation, components, mock data shapes, and design tokens — is captured in full in [UI/UX Plan](./05-ui-ux-plan.md).

The intended sequence from here follows this order, expanded in full in [Roadmap](./06-roadmap.md):

1. Mock UI
2. Finalize V1 requirements
3. Architecture
4. Database / backend
5. APIs
6. Real content
7. Authentication
8. Subscriptions
9. Production deployment

Each stage builds on the one before it, and the mock UI stage exists specifically so that the decisions made in later, more expensive stages are informed by a validated product experience rather than by guesswork.
