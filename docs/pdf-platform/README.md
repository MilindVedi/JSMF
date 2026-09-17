# JSMF PDF & Digital Content Platform

This folder documents the **JSMF PDF platform** — a separate product from the PYQ question-bank application, shipping *before* it, and the first part of JSMF to have a real backend, real payments, and real user accounts.

## Why this exists as its own product

The PYQ application documented in the top-level [`docs/`](../README.md) is a study *tool*: a question bank a student practises against. The PDF platform is a **content storefront**: a place where a doctor publishes a study resource, shares its link from YouTube or Instagram, and a student discovers, buys (or downloads free), and keeps it in their library.

They share a brand, a user account, and eventually a library — but they are different products with different data, different screens, and different release timelines, so they are documented separately rather than folded into the PYQ docs.

## How documentation is organised across the project

| Area | Where | Covers |
|---|---|---|
| **Overall product** | [`docs/01-product-vision.md`](../01-product-vision.md), [`docs/06-roadmap.md`](../06-roadmap.md), [`docs/07-future-scope.md`](../07-future-scope.md), [`docs/03-architecture.md`](../03-architecture.md) | What JSMF is as a company/product, the stage sequence, the platform-wide technical direction, and the running backlog. Applies to every JSMF product. |
| **PYQ web application** | [`docs/02-v1-scope.md`](../02-v1-scope.md), [`docs/04-content-pipeline.md`](../04-content-pipeline.md), [`docs/05-ui-ux-plan.md`](../05-ui-ux-plan.md) | The question-bank product specifically — its scope, its content pipeline, and its UI/UX plan. |
| **PDF platform** | this folder | The PDF/digital-content storefront — scope, architecture, data model, admin panel, and API contract. |

## Contents

| Document | Description |
|---|---|
| [01 — V1 Scope](./01-v1-scope.md) | Exactly what the first release of the PDF platform does and deliberately does not do, plus the long-term product surface it is being built toward. |
| [02 — Architecture](./02-architecture.md) | Service layering, the private-storage and signed-URL model, the payment flow, and the specific decisions that keep this loosely coupled and extensible. |
| [03 — Data Model](./03-data-model.md) | Every database table, column, constraint, and index — and the reasoning behind the ones that are not obvious. **This is the document to review first.** |

Start with [01 — V1 Scope](./01-v1-scope.md) for what is being built, then [03 — Data Model](./03-data-model.md), which is where the extensibility commitments actually live.
