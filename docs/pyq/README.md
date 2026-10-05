# PYQ practice app (`web/`)

Previous-year-question practice: question bank, practice sessions, results/review, bookmarks, wrong questions, history and statistics. Same JSMF account, theme and backend as jsmf.me (`main-web/`) and the resources store (`pdf-web/`).

This file is the orientation: how the app is wired, what the API is, how access and content work. Two companions go deeper:

| Document | Read it for |
|---|---|
| [features.md](./features.md) | Every implemented feature, screen by screen and rule by rule, with the file that owns each one — and an honest list of what is not built yet. |
| [user-flows.md](./user-flows.md) | The end-to-end journeys (onboarding, a practice session, a timed test, revision, subscribing, renewal, admin content lifecycle), with PlantUML diagrams in [diagrams/](./diagrams/). |

## 1. Shape

```
web/ (Next.js)
  screens ──► hooks/pyq (react-query) ──► PyqDataSource (lib/data-source/types.ts)
                                            ├─ mock adapter  → data/mock + zustand (browser only)
                                            └─ api adapter   → lib/api/client → /api proxy → backend
backend/src/modules/questions   (NestJS module, owns the `pyq` Postgres schema)
```

- Screens never import mock data or the API client — only the hooks. Swapping data source is one env var.
- `NEXT_PUBLIC_DATA_SOURCE=mock|api` (default `mock`; build-time, needs a rebuild).
- `BACKEND_API_URL` — where `web/src/middleware.ts` forwards `/api/*` (same as main-web).
- `MOCK_UI_BASIC_AUTH_USER` / `_PASSWORD` — optional pre-launch gate on pages (never on `/api`).
- Auth in api mode is the shared JSMF account: bearer access token in memory, rotating refresh token in `localStorage["jsmf.refreshToken"]`. Google sign-in returns to `/auth/callback`, which must be listed in the backend's `OAUTH_ALLOWED_REDIRECTS`.

## 2. Database

All tables live in the separate Postgres schema **`pyq`** (same database, same instance): `exams`, `subjects`, `topics`, `questions`, `question_options`, `practice_sessions`, `session_questions`, `attempts`, `bookmarks`, `question_reports`, `collections`, `collection_questions`, `user_preferences`. The only link outside the schema is to `public.users`.

Why one database, separate schema: subscriptions are ordinary products/entitlements, so the access check is a single query; one instance keeps cost and operations low. The schema boundary means moving PYQ to its own database later is a data copy plus a connection change, no code rework. Split only on a real signal (PYQ load hurting purchases, different scaling/backups, separate team).

Migrations (additive only, so an older app version runs against them unchanged):
- `20261004120000_pyq_question_bank` — the schema, types and Phase 1 tables.
- `20261005130000_pyq_report_resolution` — `admin_note`, `resolved_by_id` on `question_reports` (both nullable).
- `20261005120000_pyq_learning` — `collections` (user-named lists), `collection_questions` (membership + `added_at`), `user_preferences` (target exam slug, daily goal; one row per user, absent = defaults). Streaks, revision and reinforce are computed from attempts, never stored.

## 3. API (all under `/api`, sign-in required unless noted)

| Method & path | Purpose |
|---|---|
| `GET pyq/taxonomy` | Exams → subjects → topics with question counts (public) |
| `GET pyq/access` | Subscribed? Free answers left today; current plan + expiry |
| `GET pyq/plans` | Plans on sale (public) — buy via `POST orders` |
| `GET pyq/questions` | Filter by exam, subject, topic, year, difficulty, status (unattempted/correct/incorrect/bookmarked), own collections; paginated; never includes answers |
| `POST pyq/questions/:id/reports` | Report a problem with a question |
| `POST/GET pyq/sessions`, `GET pyq/sessions/:id` | Start a session / history / load one |
| `POST pyq/sessions/:id/answers` | PRACTICE: returns correctness + explanation; TEST: stored only |
| `PATCH pyq/sessions/:id/questions/:qid/flag` | Flag for review |
| `POST pyq/sessions/:id/submit`, `GET …/review` | Score; answers + explanations after submit |
| `GET/PUT/DELETE pyq/bookmarks(/:qid)` | Bookmarks |
| `GET pyq/wrong-questions`, `GET pyq/stats` | Revision lists and statistics |
| `GET/POST pyq/collections`, `PATCH/DELETE pyq/collections/:id` | My collections (with question ids) / create / rename / delete |
| `PUT/DELETE pyq/collections/:id/questions/:qid` | Add / remove a question (another user's collection is 404) |
| `GET pyq/streak` | Current/longest streak and today's count vs daily goal, by India-time day (a day counts with ≥1 answer; a run stays current until the end of the next day) |
| `GET pyq/revision` | Every attempted/bookmarked/collected question with facts (latest result, last wrong/correct, incorrect count, never-corrected, flagged, bookmarked/collected at, `due` = wrong, flagged, or correct >30 days ago) |
| `GET pyq/reinforce?recentDays=7` | Latest-correct questions, split recent / not revisited |
| `GET/PUT pyq/preferences` | Target exam and daily goal |
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
- Subscribed: an ACTIVE, unexpired entitlement to any product whose `metadata` has `"pyqSubscription": true`. Logic lives only in `PyqAccessService`.
- Known edge: two answers at the exact same instant can exceed the limit by one.

### Plans (Phase 2)

- A plan is an **ordinary product** (type `COURSE`, `accessType PAID`, `PUBLISHED`) whose `metadata` is
  `{"pyqSubscription": true, "durationDays": 30, "period": "month", "popular": false, "features": ["…"]}`.
  `durationDays` is required; `period`/`popular`/`features` are display hints. Shape is read only in `backend/src/shared/pyq-plan.ts`.
- `GET /api/pyq/plans` (public) lists published plans: id, title, subtitle, price (minor units), currency, duration, features.
- Buying is the normal `POST /api/orders {productId}` → Razorpay widget → `POST /api/payments/verify`; the webhook remains the authority (same hardened `settle()`).
- Create one: `cd backend && npm run db:seed:pyq-plans` (monthly ₹999/30d, quarterly ₹2,499/90d, yearly ₹7,999/365d; upsert by slug), or create a COURSE product with that metadata. Reprice/retire = edit/unpublish the product.
- Plans are hidden from the PDF storefront (list, featured, product page) and from the library.
- **Expiry:** on the settlement that moves the order to PAID, `settle()` calls `applyPlanTerm`, which sets the PURCHASE entitlement's `expiresAt = now + durationDays`. Redelivered webhooks / the racing verify call never add days twice. Access checks treat a past `expiresAt` as no access (no sweeper needed).
- **Renewal:** checkout allows buying a plan you already hold. Renewing while active extends from the current expiry (no lost days); after expiry it starts from now. The entitlement row is re-pointed at the newest order.
- **Refund:** refunding the latest plan order revokes the plan entitlement (all-or-nothing, like every product — remaining days from earlier orders go with it). Refunding an older, superseded order revokes nothing. An admin-gifted perpetual grant (`expiresAt` null) is never shortened by a purchase.
- `GET /api/pyq/access` also returns `plan: {productId, title, expiresAt} | null`; `/subscription` shows it and refetches after checkout.
- Log line: `pyq.plan_purchased` (orderNumber, userId, productId, expiresAt, renewal) via `activity()`.
- Tests: `backend/src/modules/orders/application/pyq-plan.integration.spec.ts`.
- Web: `/subscription` in api mode uses `usePlans`/`usePlanCheckout` (`web/src/hooks/pyq/plans.ts`, a copy of main-web's checkout flow); mock mode keeps the illustrative mock plans.

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

## 6. Status (Phase 2 learning features done)

Wired to the backend: login/signup/password reset/Google, dashboard, question bank, practice, results, review, bookmarks, wrong questions, history, custom test, statistics, revision, reinforce, streaks (topbar chip; dashboard card celebrates when the real count reaches the goal), collections (create from the collection button on any question; add/remove; filter bank, custom test, history), profile target exam.

A **timed custom test** runs as a TEST session: answers are saved but correctness and explanations stay hidden (palette shows "answered") until submit. Every other mode is PRACTICE.

Subscription purchase is wired in api mode too: `/subscription` lists real plans and runs the Razorpay checkout (§4). The marketing `/pricing` page and mock mode keep illustrative plans.

Still mock-only: profile name/email/photo. Admin question editor, taxonomy manager, report triage and JSON import are done (pdf-web `/admin/pyq`). Search/sort and smart custom-test ordering are hidden in api mode.

Tests: `backend/src/modules/questions/application/pyq.integration.spec.ts` (import idempotency, hidden answers, practice/test flows, scoring, free limit, cross-user isolation) and `pyq-admin.integration.spec.ts` (editor validation, option-id stability, soft delete keeps review, taxonomy rules, report resolution, ADMIN-only guard) and `learning.integration.spec.ts` (collections CRUD + isolation, streaks across IST midnight, revision/reinforce contents, preferences, timed custom test as TEST).
