# PYQ practice app (`web/`)

Previous-year-question practice: question bank, practice sessions, results/review, bookmarks, wrong questions, history and statistics. Same JSMF account, theme and backend as jsmf.me (`main-web/`) and the resources store (`pdf-web/`).

This file is the orientation: how the app is wired, what the API is, how access and content work. Two companions go deeper:

| Document | Read it for |
|---|---|
| [features.md](./features.md) | Every implemented feature, screen by screen and rule by rule, with the file that owns each one — and an honest list of what is not built yet. |
| [subscriptions.md](./subscriptions.md) | Plans, pricing, the shared benefits and the free trial: how an admin manages them, the `SUBSCRIPTION_MANAGEMENT_ENABLED` switch, versioning on a price change, and every security control. |
| [exam-mode.md](./exam-mode.md) | Tests on the real exam console: the instructions screen and "begin", full mocks following each exam's pattern (time-bound sections, exact marking), shuffled options and the questions that keep their order, what the server enforces, and the admin's **PYQ → Exam setup**. |
| [user-flows.md](./user-flows.md) | The end-to-end journeys (onboarding, a practice session, a timed test, revision, subscribing, renewal, admin content lifecycle), with PlantUML diagrams in [diagrams/](./diagrams/). |

## 1. Shape

```
packages/core (@jsmf/core — shared by web/ and the mobile/ Expo app, see docs/mobile/README.md)
  hooks (react-query) ──► PyqDataSource port ──► api adapter → api client → {baseUrl}/… → backend
  domain types, selectors, sorting, streak config, legal parsing, auth form schemas
web/ (Next.js)
  screens ──► @/hooks/pyq (core hooks + Next router/toasts) ──► configureCore({ dataSource })
                                            ├─ mock adapter  → data/mock + zustand (web-only demo)
                                            └─ core api adapter, baseUrl "/api" → middleware proxy → backend
backend/src/modules/questions   (NestJS module, owns the `pyq` Postgres schema)
```

- Screens never import mock data or the API client — only the hooks. Swapping data source is one env var.
- **Shared core (`packages/core`, `@jsmf/core`).** Everything platform-free lives there so the Expo app can reuse it: domain types (`/domain`), the API client with its refresh-once-on-401 logic and error classes (`/api`), the `PyqDataSource` port and API adapter (`/data-source`), every react-query hook and query key (`/hooks`), the query-client defaults (`/query`), legal document types and body parsing (`/legal`) and the auth form zod schemas (`/schemas`). It is source-only (no build step): web compiles it through `transpilePackages`. Core never touches `window`, storage, env vars or a router; each app calls `configureCore({ baseUrl, storage, dataSource, onLegalRequired, notify })` once — web does it in `web/src/lib/core.ts`. The signed-in session itself (login, signup + exam preference, Google code exchange, reset, restore, logout, rename) is core's `createAuthSession`; web's zustand auth store only mirrors it. Web keeps only what is browser- or Next-specific: the mock adapter and demo data, the zustand stores, Google's redirect flow (`lib/google-auth.ts`), Razorpay web checkout (`hooks/pyq/plans.ts`), router-driven `useStartSession`, and every React component.
- **Workspaces.** The repo root `package.json` declares npm workspaces `packages/*`, `web` and `mobile` with one root `package-lock.json` (`npm install` at the root, never inside `web/`). backend/, main-web/ and pdf-web/ are not workspaces and keep their own lockfiles. Because of that, `web/Dockerfile` is built from the **repo root** (`docker build -f web/Dockerfile .`; `web/Dockerfile.dockerignore` lets only the root manifests, `packages/core` and `web` in), and the standalone server lands at `web/server.js` inside the image. The Cloud Build trigger (`web-trigger.yaml`) builds with context `.`; note its `includedFiles` is still `web/**`, so a change only under `packages/core/` does not trigger a deploy on its own.
- `NEXT_PUBLIC_DATA_SOURCE=api|mock` — build-time, inlined by `next build`. `web/Dockerfile` (built from the repo root) builds `api` by default (`--build-arg NEXT_PUBLIC_DATA_SOURCE=mock` for a self-contained demo); unset outside Docker means `mock`.
- `BACKEND_API_URL` — runtime, where `web/src/middleware.ts` forwards `/api/*` and where server-rendered pages (`/pricing`, the home page's plan cards) fetch public data. Required on the `jsmf-web-pyqs` Cloud Run service in api mode.
- `MOCK_UI_BASIC_AUTH_USER` / `_PASSWORD` — optional pre-launch gate on pages (never on `/api`).
- Auth in api mode is the shared JSMF account: bearer access token in memory, rotating refresh token in `localStorage["jsmf.refreshToken"]`. Google sign-in returns to `/auth/callback`, which must be listed in the backend's `OAUTH_ALLOWED_REDIRECTS`.

## 2. Database

All tables live in the separate Postgres schema **`pyq`** (same database, same instance): `exams`, `subjects`, `topics`, `questions`, `question_options`, `practice_sessions`, `session_questions`, `attempts`, `bookmarks`, `question_reports`, `collections`, `collection_questions`, `user_preferences`. The only link outside the schema is to `public.users`.

Why one database, separate schema: subscriptions are ordinary products/entitlements, so the access check is a single query; one instance keeps cost and operations low. The schema boundary means moving PYQ to its own database later is a data copy plus a connection change, no code rework. Split only on a real signal (PYQ load hurting purchases, different scaling/backups, separate team).

Migrations (additive only, so an older app version runs against them unchanged):
- `20261004120000_pyq_question_bank` — the schema, types and Phase 1 tables.
- `20261005130000_pyq_report_resolution` — `admin_note`, `resolved_by_id` on `question_reports` (both nullable).
- `20261005120000_pyq_learning` — `collections` (user-named lists), `collection_questions` (membership + `added_at`), `user_preferences` (target exam slug, daily goal; one row per user, absent = defaults).
- `20261011120000_pyq_read_models` — `user_question_states` (one row per user per answered-or-flagged question: latest result, last answered/correct/wrong, attempt and incorrect counts, flagged) and `user_daily_activity` (answers per user per India-time day). Both are **derived** from `attempts` and backfilled by the migration itself; see §7.
- `20261027100000_streak_daily_goal` — `user_daily_activity.goal_met`, recorded on the day itself so that a day counts towards the streak only once it reached the student's daily goal, and so that later changes to that goal never rewrite days already earned. Backfilled from each student's current target.
- `20261027180000_pyq_subscription_settings` — `subscription_settings` (one fixed row: trial on/off, trial length, the benefits list every plan shares; seeded with trials off) and `trials` (one row per student who ever started a trial — the primary key is what makes it once per account). Both additive; see [subscriptions.md](./subscriptions.md).

- `20261028100000_exam_patterns_and_option_shuffle` — `exam_patterns` (one per exam: sections, time-bound or not, exact marking; seeded for NEET-PG, FMGE and INI-CET), `practice_settings` (one fixed row: shuffle options, on), `questions.keep_option_order`, and on `practice_sessions` the shuffle decision, `clock_started_at` (null while a test waits on its instructions screen; existing rows backfilled from `started_at`) and the mock's copied `pattern`. Additive. See [exam-mode.md](./exam-mode.md).

## 3. API (all under `/api`, sign-in required unless noted)

| Method & path | Purpose |
|---|---|
| `GET pyq/taxonomy` | Exams → subjects → topics with question counts (public) |
| `GET pyq/access` | Subscribed? Free answers left today; current plan + expiry |
| `GET pyq/plans` | Plans on sale (public), each with the shared benefits — buy via `POST orders` |
| `GET pyq/trial` | Whether a free trial is on offer and its length (public; for pricing copy) |
| `POST pyq/trial` | Start this student's one free trial; returns their access (409 if off or not eligible) |
| `GET/PATCH/PUT admin/pyq/exam-setup…` | Option shuffling and each exam's paper pattern — ADMIN only, audited (see [exam-mode.md](./exam-mode.md)) |
| `GET/PATCH/POST/PUT admin/pyq/subscription…` | Plans, benefits and trial for the admin page — ADMIN only, writes need `SUBSCRIPTION_MANAGEMENT_ENABLED` (see [subscriptions.md](./subscriptions.md)) |
| `GET pyq/taxonomy` years | The taxonomy also lists `years` (with counts) that have published questions; the year filters use it |
| `GET pyq/questions` | Filter by exam, subject, topic, year, difficulty, status (unattempted/correct/incorrect/bookmarked), own collections, `search` (case-insensitive stem text); `sort` = `newest-exam-year` (default) / `oldest-exam-year` / `name-az` / `name-za` (subject name); paginated; rows are summaries (no options), never answers |
| `POST pyq/questions/:id/reports` | Report a problem with a question |
| `POST/GET pyq/sessions`, `GET pyq/sessions/:id` | Start a session (with filters: optional `order` = `random` / `unattempted-first` / `incorrect-first` / `bookmarked-first`) / history (optional `status=IN_PROGRESS\|SUBMITTED`; each row carries `examIds`, `subjectIds`, `newestYear`, `oldestYear`, `lastWrongAt`, `resumeIndex` computed from its questions) / load one |
| `POST pyq/sessions/:id/begin` | A test's "I am ready to begin": starts its clock (idempotent) and returns its questions — withheld until then |
| `GET/POST pyq/mocks` | Full mocks on offer / start one (`{ examId }`) — see [exam-mode.md](./exam-mode.md) |
| `POST pyq/sessions/:id/answers` | PRACTICE: returns correctness + explanation; TEST: stored only. In a full mock with time-bound sections, only the running section takes answers (409 otherwise) |
| `PATCH pyq/sessions/:id/questions/:qid/flag` | Flag for review |
| `POST pyq/sessions/:id/submit`, `GET …/review` | Score; answers + explanations after submit |
| `GET/PUT/DELETE pyq/bookmarks(/:qid)` | Bookmarks (the list carries each question's `userStatus`) |
| `GET pyq/bookmarks/ids` | Just the bookmarked ids — what every bookmark icon reads |
| `GET pyq/wrong-questions`, `GET pyq/stats` | Revision lists and statistics |
| `GET/POST pyq/collections`, `PATCH/DELETE pyq/collections/:id` | My collections (with question ids) / create / rename / delete |
| `PUT/DELETE pyq/collections/:id/questions/:qid` | Add / remove a question (another user's collection is 404) |
| `GET pyq/streak` | Current/longest streak and today's count vs daily goal, by India-time day (a day counts with ≥1 answer; a run stays current until the end of the next day) |
| `GET pyq/revision` | Every attempted/bookmarked/collected question with facts (latest result, last wrong/correct, incorrect count, never-corrected, flagged, bookmarked/collected at, `due` = wrong, flagged, or correct >30 days ago) |
| `GET pyq/reinforce?recentDays=7` | Latest-correct questions, split recent / not revisited |
| `GET/PUT pyq/preferences` | Target exam and daily goal |
| `PATCH auth/me/name` | Change the display name (identity module, platform-wide) without re-answering the signup questions. `GET auth/me/profile` also returns `memberSince` |
| `POST admin/pyq/questions/import` | Admin bulk import (idempotent by `externalKey`; whole file validated before any write) |
| `GET admin/pyq/questions` | Admin list with answers; filter `examId`, `subjectId`, `topicId`, `status`, `q` (stem text), `reported=true` (open reports); paginated; each row has `reports: { open, total }` |
| `GET/PATCH/DELETE admin/pyq/questions/:id`, `POST admin/pyq/questions` | Get / edit / soft-delete / create. 2–6 options, exactly one correct. Options are matched by `id` on edit; one a student has chosen can be reworded but not removed (409) |
| `PATCH admin/pyq/questions/:id/status` | Publish (`PUBLISHED`) / unpublish (`DRAFT`) |
| `GET admin/pyq/taxonomy` | Exams, subjects, topics with live question counts (any status) |
| `POST admin/pyq/{exams,subjects,topics}`, `PATCH …/:slug`, `PUT …/order`, `DELETE …/:slug` | Create / rename / reorder (`{ slugs }`; topics one subject at a time) / delete — delete is 409 while any question (even a deleted one) or topic references it. Slugs never change |
| `GET admin/pyq/reports`, `PATCH admin/pyq/reports/:id` | Report queue (filter `status`, `questionId`) / resolve or dismiss once (`{ status: RESOLVED\|DISMISSED, note? }`). The note and the admin who closed it are stored on the row and returned in the queue |

All admin routes are `@Roles('ADMIN')` and log `activity` events (`pyq.question_created/updated/deleted/status_changed`, `pyq.report_resolved/dismissed`, `pyq.exam_created`, `pyq.taxonomy_reordered`, …).

Ids: exams/subjects/topics use slugs (`neet-pg`, `anatomy`, `anatomy--upper-limb`); questions/options use UUIDs.

## 4. Access and plans

- Free users: `PYQ_FREE_DAILY_QUESTIONS` answers per day (default 20), resetting at midnight India time. Hitting it returns 403 `PYQ_DAILY_LIMIT_REACHED`; the app shows a message linking to `/subscription`.
- Subscribed (unlimited): an ACTIVE, unexpired entitlement to any product whose `metadata` has `"pyqSubscription": true`, **or** a running free trial. Logic lives only in `PyqAccessService`.
- Known edge: two answers at the exact same instant can exceed the limit by one.

### Plans and the free trial

Managed from the admin panel (pdf-web **PYQ → Plans & trial**, `/admin/pyq/plans`) when the API runs with `SUBSCRIPTION_MANAGEMENT_ENABLED=true`; read-only otherwise. The full rules — versioning on a price change, the trial's eligibility, how terms stack, and every security control — are in **[subscriptions.md](./subscriptions.md)**. In short:

- A plan is an **ordinary product** (type `COURSE`, `accessType PAID`) whose `metadata` is `{"pyqSubscription": true, "durationMonths": N, "popular": bool}`. Older plans carry `durationDays` instead and keep working. Shape is read only in `backend/src/shared/pyq-plan.ts`.
- Every plan shows the same benefits (`pyq.subscription_settings.features`); plans differ only in length and price.
- Price and length never change in place: a change makes a new version and takes the old one off sale, still valid for its holders.
- Plans are hidden from the PDF storefront, the library, and the generic admin Products page, which refuses to edit them.
- **Expiry** on settlement (`applyPlanTerm`): one term from the latest of now, the furthest expiry of any plan the student holds, and the end of a running trial. Redelivered webhooks never add days twice.
- **Refund:** refunding the latest plan order revokes that plan entitlement (all-or-nothing, like every product). An admin-gifted perpetual grant is never shortened by a purchase.
- `GET /api/pyq/access` returns `plan`, `trial` and `trialOffer`; `/subscription` shows them and offers "Start free trial".
- Log lines: `pyq.plan_purchased`, `pyq.trial_started` via `activity()`; admin changes are in the audit log (`pyq.plan_*`, `pyq.subscription_settings_updated`).
- Tests: `backend/src/modules/orders/application/pyq-plan.integration.spec.ts`, `backend/src/modules/questions/application/pyq-subscription.integration.spec.ts`.
- Dev data: `cd backend && npm run db:seed:pyq-plans` creates three starter plans if they don't exist (create-only).

## 5. Content

- Local: `cd backend && npm run db:seed:pyq` loads the mock bank (3 exams, 19 subjects, 93 topics, 187 questions) through the same import code as the admin endpoint. Re-running updates, never duplicates.
- Real bank: upload a JSON file in the admin panel (pdf-web **Question bank → Import**, `/admin/pyq/import`) or POST it to `admin/pyq/questions/import`: `{ exams?, subjects?, topics?, questions }` (a bare array of questions is accepted by the UI). Taxonomy is by slug and upserted; new questions arrive as DRAFT, existing ones keep their status. The result shows created/updated counts or the validation errors (nothing is written if any row is invalid).

Admin workflow (pdf-web `/admin/pyq/*`):

1. **Exams & subjects** — create/rename/reorder exams, subjects and topics. Order is what students see. Anything referenced can be renamed, never deleted.
2. **Import** or **Questions → New question** — new questions are drafts.
3. **Questions** — filter by exam/subject/topic/status/text/open reports, review in the editor (option rows, correct-answer radio, explanation preview), then Publish. Unpublish hides a question from new lists/sessions immediately.
4. **Reports** — students' reports, open first. Fix the question in its editor, then Resolve (or Dismiss if no change is needed), with an optional note.
5. **Delete** is soft (`deleted_at`): the question disappears from students and admin lists, but past sessions, scores, reviews and reports still show it. Editing a correct answer does not re-score past attempts.

Closing a report writes `admin_note` and `resolved_by_id` on the row (migration `20261005130000_pyq_report_resolution`), so the decision and its author survive beyond the activity log and show on the closed row in the queue.

## 6. Status

Every student screen runs against the backend in api mode, including question-bank search and sort, smart custom-test ordering, history sort keys, the real plan badge, name changes and "member since" on `/profile`, the exam picked at signup (saved as the PYQ preference), and the marketing `/pricing` page (server-rendered from `GET pyq/plans`).

Still not built: profile photo upload (no upload endpoint yet, so the photo control is hidden in api mode) and changing the sign-in email. See [features.md §12](./features.md).

A **timed custom test** or a **full mock** runs as a TEST session on the exam console: it opens on an instructions screen and its clock starts on "I am ready to begin"; answers are saved but correctness and explanations stay hidden (palette shows "answered") until submit. A full mock also follows its exam's pattern — sections, their clocks, marking. Every other mode is PRACTICE. Options are shown in a shuffled order per session (admin switch, on by default), except for questions that must keep their order. All of it: [exam-mode.md](./exam-mode.md).

Tests: `pyq.integration.spec.ts` (import idempotency, hidden answers, practice/test flows, scoring, free limit, isolation, search/sort/ordering, history fields, read models), `pyq-admin.integration.spec.ts` (editor validation, option-id stability, soft delete, taxonomy rules, reports, ADMIN-only) and `learning.integration.spec.ts` (collections, streaks across IST midnight, revision/reinforce, preferences, timed test as TEST).

## 7. Performance and scale

Written for many students with long histories. The rules:

- **No request scans a student's whole history.** Per-question facts live in `user_question_states` and per-day counts in `user_daily_activity`, so status filters, list labels, stats, wrong questions, revision, reinforce, smart ordering and streaks are indexed lookups. `QuestionStateService` keeps both tables current inside the same transaction as the write that changes them (a practice answer, a flag outside a running test, a test submit), and always *recomputes* the affected row from `attempts`, never increments, so retries and races converge.
- **Rebuild if they could be stale.** `cd backend && npm run db:pyq:rebuild-read-models` recomputes both tables from `attempts` in one transaction. Needed only if the app was rolled back past `20261011120000_pyq_read_models` and forward again (the older version writes attempts without updating them). Safe to run any time.
- **Lists are summaries.** `GET pyq/questions`, bookmarks, wrong questions, revision and reinforce return id/exam/subject/topic/year/stem/difficulty, no options; only a session's own questions carry options. Responses over 1 KB are gzip-compressed (`compression` in `main.ts`).
- **History is aggregated in SQL.** A page of sessions is three queries regardless of how many questions they hold; the dashboard asks for 1 open + 4 finished sessions, `/history` loads finished sessions 50 at a time.
- **Shared data is cached.** `CacheService` (`backend/src/shared/cache`) caches the taxonomy (5 min, dropped by any admin PYQ write via `InvalidateTaxonomyInterceptor`) and the plans list (1 min). It uses this process's memory by default and **Redis when `REDIS_ENABLED=true`** (the same switch that moves rate-limit counters there), so every instance shares one cache and an invalidation on one is seen by all. If Redis is unreachable, requests fall through to the database and nothing fails. Public responses also carry `Cache-Control` (taxonomy 5 min, plans 1 min).
- **The web app requests only what a screen shows.** An answer updates the cached session from its own response (one request per answer); the allowance and streak move locally, and the streak is re-read only on the day's first answer. A bookmark toggle flips the icon immediately and refetches only the bookmarks list if it is on screen. Other writes mark data stale so it reloads when next opened, never all at once. Bookmark icons read `GET pyq/bookmarks/ids`, not the bookmark list. Search is debounced (300 ms).

When to switch Redis on: more than one API instance (or autoscaling past one), which is also when in-memory rate limiting stops being correct.
