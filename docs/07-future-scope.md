# Future Scope

This document collects product ideas that are deliberately **not** part of V1 but are worth keeping on record so they aren't lost or re-litigated from scratch later. Unlike [Roadmap](./06-roadmap.md), which sequences the stages needed to ship V1 itself, this file is a running backlog of feature ideas to revisit once V1 is stable — add to it whenever a good idea comes up that isn't worth building now.

## Difficulty (Easy / Medium / Hard) as a first-class feature

The `Question` data model already carries a `difficulty: "easy" | "medium" | "hard"` field (see [UI/UX Plan](./05-ui-ux-plan.md), "Data Model"), and it is already visible in a couple of places — the difficulty badge on the practice question card, the landing page's interactive question preview, and the new-user onboarding flow (which seeds a first practice session from `difficulty === "easy"` questions so a brand-new student's first session isn't intimidating). But difficulty is not yet a feature a student can deliberately act on. Ideas for making it one:

- **Difficulty as a Question Bank / Custom Test filter**, alongside Exam, Year, Subject, and Topic — letting a student practice only Hard questions in a subject they're already comfortable with, or only Easy/Medium ones when starting a new subject.
- **Difficulty breakdown in Statistics** — accuracy split by Easy/Medium/Hard (in addition to the existing per-subject breakdown), so a student can see whether their wrong answers cluster in harder questions specifically, rather than being spread evenly.
- **Difficulty-aware Custom Test composition** — a difficulty mix control (e.g. "mostly Easy," "balanced," "mostly Hard") rather than only a flat count, similar in spirit to the "Question selection" ordering control already in the Custom Test builder.
- **Difficulty-based revision suggestions** — e.g. surfacing Hard questions a student got wrong before Easy ones in the Revision hub, on the theory that they're more likely to reappear in a real exam in a similar form.
- **Possible adaptive practice down the line** — using difficulty plus a student's accuracy history to bias which questions come up next, though this is explicitly a later idea and would need real usage data to validate, not something to build against mock data.

None of this is built yet. It's recorded here specifically because the underlying data already supports it (every mock question already has a `difficulty` value), so the gap is in UI/UX and product decisions, not in the schema.

## Collection management UI

Collections (see [UI/UX Plan](./05-ui-ux-plan.md), "Collections") are currently seeded and read-only in the mock — a student can browse, filter by, and practise from a collection, but cannot create, rename, delete one, or add/remove individual questions to one. Ideas for closing that gap later:

- **"Add to collection" on a question** — similar to the existing `BookmarkButton`, but presenting a picker over the student's existing collections (plus "New collection…") instead of a single toggle.
- **A collections management page** — list, rename, delete, reorder; likely living under Profile or its own route once it's more than a handful of seeded sets.
- **Sharing/importing a collection** — e.g. a batch of curated collections an instructor or the content team publishes for all students, distinct from a student's own personal ones — would need a `createdBy`/`isOfficial` distinction on the `Collection` type that doesn't exist yet.

This was left out of the initial build deliberately: the ask was to demonstrate collections as a browsing/filtering concept across Question Bank, Custom Test, Revision, History, and Statistics, not to build full CRUD for a seeded, mock-only data set.

## Retaking a previous Custom Test

A student can already see their past Custom Test sessions listed in History, but there is currently no way to re-run one — only to view its summary or resume it if still in progress. A "retake" action would start a brand-new session using that same test's configuration (exam/subject/topic/year filters, question count, timed setting, ordering), rather than reusing the same `questionIds`, so a retake is a fresh attempt at an equivalent test rather than literally the same set of questions answered a second time from memory of the first attempt.

Ideas for how this could work:

- **A "Retake" button on each Custom Test entry in History**, alongside the existing view/resume actions, that reopens the Custom Test builder pre-filled with that session's original filters rather than immediately starting a new session — so a student can tweak the configuration before running it again instead of being locked into an identical rerun.
- **Storing the originating filters on the session itself** — `TestSession.filters` already exists and is populated for Custom Test sessions, so this is mostly a UI gap (surfacing a retake entry point) rather than a data-model gap.
- **Distinguishing a retake from the original in History/Statistics** — e.g. so accuracy trends over multiple attempts at "the same" Custom Test configuration can be compared, rather than the two runs just looking like two unrelated sessions.

Not built yet because History's Custom Test row currently only supports viewing a completed session or resuming an in-progress one — see [UI/UX Plan](./05-ui-ux-plan.md) for how History and Custom Test sessions currently work.
