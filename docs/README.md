# JSMF Documentation

JSMF is a production-grade medical exam preparation platform being built from scratch, in the same product category as Marrow and PrepLadder but with its own content, user experience, branding, and technology. The initial release is focused on a single product: a Previous Year Questions (PYQ) and memory-based PYQ question bank covering NEET-PG, FMGE, and INI-CET, with a long-term roadmap toward web and mobile applications, subscription-based access, and additional medical education products.

This `docs/` folder is the single source of truth for what is being built, why, and in what order. It is written for anyone joining the project — engineers, designers, product stakeholders, or future team members — who needs to understand the full picture without having to reconstruct it from chat history or code. The documents below should be read in order the first time, and used as reference material afterward.

## Contents

| Document | Description |
|---|---|
| [01 — Product Vision](./01-product-vision.md) | What JSMF is, the long-term product surface, the initial content and exam scope, and the content-integrity principle that underlies everything else. |
| [02 — V1 Scope](./02-v1-scope.md) | The concrete feature list for the first real release, what is explicitly out of scope, and a clear description of the current mock-UI discovery stage. |
| [03 — Architecture](./03-architecture.md) | The target long-term technical architecture direction — stack, component layout, scalability approach, and hosting philosophy — and what is actually built today. |
| [04 — Content Pipeline](./04-content-pipeline.md) | The philosophy behind how memory-based recalls become original, doctor-authored questions in the JSMF question bank, and the content-integrity commitments that pipeline is built around. |
| [05 — UI/UX Plan](./05-ui-ux-plan.md) | The detailed, already-agreed design and frontend architecture plan for the mock UI prototype — routes, navigation shells, components, mock data model, state management, and design tokens. |
| [06 — Roadmap](./06-roadmap.md) | The ordered sequence of project stages from the current mock UI through real backend, content, authentication, subscriptions, and production deployment. |
| [07 — Future Scope](./07-future-scope.md) | A running backlog of product ideas deliberately deferred past V1 — e.g. making question difficulty (Easy/Medium/Hard) a real, actionable feature rather than just a data field. |
| [Diagrams](./diagrams/) | PlantUML flowcharts of the roadmap and the mock-UI feedback loop, kept in sync with the prose in [06 — Roadmap](./06-roadmap.md) — useful for a quick visual read rather than the full write-up. |

If you are new to the project, start with the [Product Vision](./01-product-vision.md) to understand what JSMF is and why it is being built the way it is, then read the [V1 Scope](./02-v1-scope.md) to understand exactly what the first release contains.

This documentation set is actively maintained, not a one-time snapshot: as the project moves through the stages in [06 — Roadmap](./06-roadmap.md) — including the mock UI's build → deploy → share-for-feedback → iterate loop described there — these documents (and the diagrams) are updated to reflect what actually happened and what was actually decided, not just what was originally planned.
