# PYQ user flows

End-to-end journeys through the PYQ practice app (`web/`) and its admin panel (`pdf-web/src/app/(admin)/admin/pyq`), written for someone who has never seen this code. [`README.md`](./README.md) is the reference — what the tables are, what every endpoint does, what a plan is. This document is the other half: what actually happens, in order, when a student or an admin does something, and which file to open to follow along.

Read [`README.md`](./README.md) first for the vocabulary (taxonomy, session, mode, entitlement, plan, soft delete). Everything below assumes it.

## Reading these diagrams

Each section embeds a [PlantUML](https://plantuml.com/) source file from [`diagrams/`](./diagrams/). They are plain text on purpose — version-controlled like any other doc, rather than screenshots that go stale. [`docs/diagrams/README.md`](../diagrams/README.md) explains how to render them (VS Code extension, the public PlantUML server, or a local `.jar`); the same instructions apply to these.

| Diagram | Shows |
|---|---|
| [`student-journey.puml`](./diagrams/student-journey.puml) | The whole student path, with the free limit and the subscription gate in place |
| [`practice-session.puml`](./diagrams/practice-session.puml) | Browser to Postgres for one session, including the PRACTICE/TEST divergence |
| [`subscription-purchase.puml`](./diagrams/subscription-purchase.puml) | Checkout, the two settlement paths, `applyPlanTerm`, renewal and refund |
| [`data-source-switch.puml`](./diagrams/data-source-switch.puml) | How `NEXT_PUBLIC_DATA_SOURCE` decides whether screens talk to mocks or the backend |
| [`admin-content-lifecycle.puml`](./diagrams/admin-content-lifecycle.puml) | A question from import to publish to report triage to soft delete |
| [`pyq-erd.puml`](./diagrams/pyq-erd.puml) | The `pyq` schema and its single link to `public.users` |

## 0. The one piece of wiring to understand first

Diagram: [`diagrams/data-source-switch.puml`](./diagrams/data-source-switch.puml)

Nothing else in this document makes sense until you know that a PYQ screen never talks to the backend directly.

```
screen → hook (web/src/hooks/pyq) → PyqDataSource → mock adapter | api adapter → /api proxy → NestJS
```

- `web/src/lib/data-source/types.ts` defines the port. The shapes on it are the UI's, not the wire's; adapters translate.
- `web/src/lib/data-source/index.ts` picks the adapter, from `DATA_SOURCE_KIND` in `kind.ts`, which is `NEXT_PUBLIC_DATA_SOURCE === "api" ? "api" : "mock"`. Next inlines that at build time, so changing it needs a rebuild, not a restart.
- `web/src/hooks/pyq/index.ts` wraps every port call in react-query. Query keys matter: `["pyq","taxonomy"]` is public content cached forever (`staleTime: Infinity`), and everything under `["pyq","user",…]` is the signed-in user's and is invalidated as a group after any write that changes progress (`useInvalidateUser`).
- `web/src/lib/data-source/api-adapter.ts` turns a 403 whose body carries `code: "PYQ_DAILY_LIMIT_REACHED"` into a typed `DailyLimitError`, and a 404 into `NotFoundError`. That is the only reason the hooks can show an upgrade prompt instead of a generic failure.
- `dataSource.capabilities` tells a screen what the active adapter cannot do. Free-text search and smart custom-test ordering are mock-only, so those controls are hidden when `isApiDataSource` is true.

The practical consequence: if a screen behaves differently on your machine than in staging, check `NEXT_PUBLIC_DATA_SOURCE` before anything else.

## 1. New-user onboarding

Diagram: [`diagrams/student-journey.puml`](./diagrams/student-journey.puml)

| Step | Route / file | Backend |
|---|---|---|
| Marketing pages | `web/src/app/(marketing)` | `GET /api/pyq/taxonomy` is the only PYQ endpoint with `@Public()` |
| Sign up / sign in | `web/src/app/(auth)/{signup,login,forgot-password,reset-password}` | `backend/src/modules/identity` |
| Google return | `web/src/app/auth/callback` | must be listed in `OAUTH_ALLOWED_REDIRECTS` |
| Dashboard | `web/src/app/(app)/dashboard` | `GET pyq/access`, `pyq/streak`, `pyq/stats` |

There is no PYQ-specific signup. The account is the shared JSMF account — the same one that buys PDFs on `pdf-web` and seats on `main-web` — so identity, password reset and Google OAuth all live in the identity module and are documented in [`docs/identity`](../identity). The access token is held in memory; the rotating refresh token is `localStorage["jsmf.refreshToken"]`.

The first thing the dashboard asks for is `GET pyq/access` (`useAccess` → `PyqAccessService.describe`). Its answer shapes the whole app: either `subscribed: true` with a `plan`, or `remainingToday` out of `PYQ_FREE_DAILY_QUESTIONS` (default 20). A brand-new user is free, with the full allowance.

Optional and cheap to skip: `/profile` writes a target exam and daily goal through `PUT pyq/preferences` into `pyq.user_preferences`. Absent means defaults — one row per user, created on first save.

## 2. A practice session, end to end

Diagram: [`diagrams/practice-session.puml`](./diagrams/practice-session.puml)

This is the core loop. Routes: `/question-bank` to choose, `/practice/[sessionId]` to answer, then `/practice/[sessionId]/results` and `/practice/[sessionId]/review`.

### Browsing

`useQuestions(query, page, pageSize)` → `GET pyq/questions` → `QuestionBankService.list`. Filters are exam, subject, topic, year, difficulty, user status (`unattempted` / `correct` / `incorrect` / `bookmarked`) and your own collections. The response never contains answers or explanations, for any caller, under any filter — `backend/src/modules/questions/domain/question-view.ts` has two projections (`toQuestionView` and `toAnsweredQuestionView`) and the browse path only ever uses the first.

### Starting

`useStartSession()` (`web/src/hooks/pyq/index.ts`) calls `POST pyq/sessions` → `PracticeService.start`. In order:

1. Resolve the question ids. An explicit `questionIds` list wins and is filtered to visible questions; otherwise `QuestionBankService.matchingIds` plus a crypto-random shuffle, capped at `MAX_SESSION_QUESTIONS` (200).
2. Empty set → 400.
3. `PyqAccessService.assertCanAnswer`. Checked *before* the row is written, because a session the student cannot answer a single question in is a dead end.
4. Insert `practice_sessions` and one `session_questions` row per question with its `position`. The set is fixed here and never re-derived — `config` stores the filters only so history can describe the session.

The hook captures `window.location.pathname` as `sourceHref` into `config` before navigating, which is what "Save & exit" later uses to return you to the page you came from. It then pushes `/practice/{id}?i={startIndex}`.

### Answering — and the PRACTICE/TEST divergence

`useAnswer(sessionId)` → `POST pyq/sessions/:id/answers` → `PracticeService.answer`:

- The session is loaded owner-scoped. Another user's session id is a **404, not a 403**, so ids cannot be probed.
- `assertOpen` rejects a submitted session (409) and one past `timeLimitSec` plus a 30-second `DEADLINE_GRACE_MS` for network and clock slack.
- The option must belong to the question (400), and the question must be in the session (400).
- In PRACTICE or CUSTOM, an already-answered question returns the stored attempt unchanged. Answers are final once the explanation has been shown — otherwise "change it to the right one" would inflate every score.
- `assertCanAnswer` runs only on a *first* answer. Changing a TEST answer costs no allowance.

The divergence is at the end of the method, driven by `revealsAnswers(session)` — `mode !== TEST || status === SUBMITTED`:

| | PRACTICE / CUSTOM | TEST, not yet submitted |
|---|---|---|
| Response | `isCorrect`, `correctOptionId`, `explanation`, `explanationFigure` | `{ questionId, selectedOptionId, recorded: true }` |
| Session reads (`GET pyq/sessions/:id`) | answered questions use `toAnsweredQuestionView` | every question uses `toQuestionView` |
| Session summary | full score | `totalQuestions`, `attempted`, `unattempted`, `totalTimeSec` only |
| UI | answer revealed inline | palette shows "answered" and nothing more |

Correctness is still *stored* in TEST mode — `attempts.is_correct` is written on every answer. It is simply not serialised until the session is submitted.

### Flagging

`useSetFlag` → `PATCH pyq/sessions/:id/questions/:qid/flag`. This upserts an `attempts` row, so a row can exist with `selected_option_id` null — flagged but unanswered. Anything reading attempts must tolerate that; note `scoreOf` counts only rows with `answered_at` set.

### Submitting and reviewing

`useSubmitSession()` → `POST pyq/sessions/:id/submit`. The status move is a conditional `updateMany` with `status: IN_PROGRESS` in the WHERE, so submitting twice scores once; the same review comes back either way, and only the call that changed a row logs `practice.session_submitted`. Score fields (`correct_count`, `incorrect_count`, `unattempted_count`, `accuracy`) are written once, here.

`submit()` then returns `review()`, which is `get()` guarded by "409 unless SUBMITTED". The hook seeds both the session and review query caches with that payload and invalidates `["pyq","user"]`, so stats, streak, wrong-questions and access all refresh. `/results` shows the score; `/review` (or `useSessionReview` later) replays the same payload with every answer and explanation.

### Collecting

From any question card: `useBookmarkToggle` → `PUT`/`DELETE pyq/bookmarks/:qid` (idempotent), or the collection button → `PUT pyq/collections/:id/questions/:qid`. A bookmark saves one question; a collection is a user-named themed set you can filter the bank by, build a custom test from, and see in history. Another user's collection id is a 404.

## 3. A timed custom test

`/custom-test/new` builds a `CreateSessionInput` with the UI mode `"custom-test"`, `timed: true` and a `durationSec`. The api adapter (`createSession`) is where that becomes a backend mode: **`PracticeMode.TEST` only when the UI mode is `custom-test` *and* `timed` is true — every other screen sends `PRACTICE`.** The UI's own mode is round-tripped in `config.uiMode` (`meta` on the way in) so history and "Save & exit" can describe the session; `durationSec` becomes `timeLimitSec`, floored at 30 seconds. The `CUSTOM` value of the `PracticeMode` enum exists in the schema but the api adapter never sends it.

Everything else is the ordinary session flow above, with three differences the reader should expect:

- Nothing reveals correctness until submit (see the table in §2).
- The clock is server-enforced. The browser counts down, but the authority is `assertOpen`: `started_at + time_limit_sec + 30s`. Past that, answers are refused with 409 `Time is up for this session — submit it to see your score` — a 409, not a silent discard, so the UI can route to submit.
- A TEST answer may be changed, and changing it does not spend free allowance. Only the first answer to a question does.

## 4. The revision loop

Three screens, all derived — **nothing about revision is stored**, it is all computed from `pyq.attempts` on each read (`backend/src/modules/questions/application/learning.service.ts`).

| Screen | Hook | Endpoint | What it is |
|---|---|---|---|
| `/revision` | `useRevision` | `GET pyq/revision` | Every attempted, bookmarked or collected question with its facts: latest result, last wrong/correct, incorrect count, never-corrected, flagged, and `due` |
| `/reinforce` | `useReinforce(days)` | `GET pyq/reinforce?recentDays=7` | Latest-correct questions, split into recently revisited and not |
| `/wrong-questions` | `useWrongQuestions` | `GET pyq/wrong-questions` | Questions whose *latest* answer was wrong |
| `/statistics` | `useStats` | `GET pyq/stats` | Accuracy overall, by subject, over time |
| topbar + dashboard card | `useStreak` | `GET pyq/streak` | Current/longest streak and today's count against the daily goal |

`due` means wrong, or flagged, or last answered correctly more than `REVISION_STALE_DAYS` (30) ago. Streaks are counted in India time (`IST_OFFSET_MS`, a fixed +5:30 with no DST, so the arithmetic is exact): a day counts with at least one answer, and a run stays current until the end of the *next* day, so you have not broken a streak until you have actually missed a day.

From any of these lists, "Practise these" calls the same `useStartSession` with an explicit `questionIds` array. There is no separate revision code path: it is an ordinary untimed `PRACTICE` session over a hand-picked set, so feedback appears per answer exactly as elsewhere.

## 5. Hitting the free limit, and subscribing

Diagram: [`diagrams/subscription-purchase.puml`](./diagrams/subscription-purchase.puml)

### The gate

`PyqAccessService` is the only place that knows what a subscription is, how big the free allowance is, and when a day starts. Two call sites matter: `describe()` (what `GET pyq/access` returns) and `assertCanAnswer()` (before starting a session, and before every first answer).

Free users get `PYQ_FREE_DAILY_QUESTIONS` answers per India-time day, counted as `attempts WHERE user_id = ? AND answered_at >= startOfIndiaDay()`. Running out throws 403 with `code: PYQ_DAILY_LIMIT_REACHED`; the api adapter turns it into `DailyLimitError`; `notifyDailyLimit` shows a toast with a "See plans" action that routes to `/subscription`.

The check is deliberately a read-then-write rather than a database constraint, so two answers in the same instant can overshoot by one. That is a known, accepted edge — see §4 of the README.

Hitting the limit mid-session does not destroy the session: already-answered questions, flagging and submit all still work. Only the next *first* answer is refused.

### Buying

`/subscription` (`web/src/app/(app)/subscription/page.tsx`) branches on `isApiDataSource`: mock mode keeps illustrative plans backed by the zustand auth store, api mode renders `web/src/components/subscription/api-subscription.tsx` on `usePlans` and `usePlanCheckout` (`web/src/hooks/pyq/plans.ts`).

A plan is not a special entity. It is an ordinary `COURSE` product, `PUBLISHED`, `accessType PAID`, whose `metadata` carries `{"pyqSubscription": true, "durationDays": N, …}`. `backend/src/shared/pyq-plan.ts` is the only file that reads that shape — `readPyqPlan`, the `IS_PYQ_PLAN` / `NOT_A_PYQ_PLAN` Prisma filters that hide plans from the PDF storefront and the library, and `extendedExpiry`.

The purchase is therefore the ordinary checkout:

1. `POST /api/orders { productId }` → `OrderService.checkout`. The server prices the product; the browser never sends an amount. The usual "you already own this" conflict is skipped when `readPyqPlan(product.metadata)` is non-null, because a plan is the one product you may buy again while you still hold it.
2. The response is `kind: PAYMENT_REQUIRED` with `providerOrderId`, `checkoutKeyId` and `amountMinor`; `usePlanCheckout` loads `checkout.razorpay.com/v1/checkout.js` and opens the widget. When `PAYMENT_DRIVER=stub`, `checkoutKeyId === "stub_key_id"` and the hook calls `POST orders/:id/simulate-payment` instead — which still produces a real signature and goes through the same verification path.
3. Razorpay's `handler` → `POST /api/payments/verify` → `PaymentService.verifyCheckout` → `settle(source: 'verify')`.
4. Independently, Razorpay posts to `POST /api/webhooks/razorpay` → `handleWebhook` → `settle(source: 'webhook')`.

### Why the webhook is the authority

Both paths call the same `settle()`. The webhook is what *guarantees* access, because a buyer who closes the tab after paying never calls verify; the verify call exists only so the page can show success immediately. The webhook controller is `@Public()` — Razorpay has no JSMF account, and the HMAC over the raw request body is the authentication (which is why `rawBody: true` in `main.ts` is load-bearing) — and `@SkipThrottle()`, because throttling it would throttle revenue. It answers 200 to duplicates as well as fresh events, since providers retry until they get a success.

### Why redelivery never adds days twice

Inside the `settle()` transaction:

```
const transitioned = await tx.order.updateMany({
  where: { id, status: { notIn: [PAID, REFUNDED, PARTIALLY_REFUNDED] } },
  data: { status: PAID, paidAt: new Date() },
});
…
if (transitioned.count === 1) {
  const term = await this.applyPlanTerm(tx, granted, item.product.metadata, payment.orderId);
}
```

Reading the status first and updating after would let the webhook and the browser callback — which routinely arrive milliseconds apart — both see "not paid yet". The conditional `updateMany` takes the row lock instead, so the second transaction waits, re-evaluates against the committed `PAID` row, and matches zero rows. `transitioned.count === 1` is therefore the race winner's flag, and `applyPlanTerm` is called only by that winner. `EntitlementService.grant` is idempotent and runs either way; only the term extension is gated.

A settlement replayed after a refund returns early, so a redelivered capture never flips the payment back to CAPTURED or re-grants revoked access.

### `applyPlanTerm`, including renewal

```ts
const fresh = entitlement.sourceOrderId === orderId && entitlement.expiresAt === null;
if (!fresh && entitlement.expiresAt === null) return null;   // admin gift: never shortened
const expiresAt = extendedExpiry(fresh ? null : entitlement.expiresAt, plan.durationDays);
await tx.entitlement.update({ where: { id }, data: { expiresAt, sourceOrderId: orderId } });
```

- Not a plan (`readPyqPlan` returns null, including a missing or non-positive `durationDays`) → nothing happens.
- **First purchase**: the entitlement was just created by this order and has no expiry, so the term starts from now: `expiresAt = now + durationDays`.
- **Renewal**: `extendedExpiry(current, days)` bases from the current expiry when it is still in the future, otherwise from now. Renewing early loses no paid-for days; renewing after expiry starts from today. The entitlement row is re-pointed at the newest order.
- **Admin-gifted perpetual grant** (`expiresAt` null but not from this order) → returns null, so a purchase can never shorten a gift.

Access checks treat a past `expiresAt` as no access, so no sweeper job is needed. Both `isSubscribed` and `currentPlan` use the same predicate: `ACTIVE` and (`expiresAt IS NULL OR expiresAt > now()`).

After any outcome, `usePlanCheckout` invalidates `["pyq","user","access"]` in its `finally`, so `/subscription` and the whole app pick up the new state. A `pending-confirmation` outcome (payment succeeded but verify failed) is shown as "active within a few minutes", which is exactly what the webhook will do.

Log lines to grep for: `payment.settled` (with `firstSettlement`) and `pyq.plan_purchased` (`orderNumber`, `userId`, `productId`, `expiresAt`, `renewal`). Tests: `backend/src/modules/orders/application/pyq-plan.integration.spec.ts`.

### Refund

Refunding an order calls `EntitlementService.revokeForOrder(orderId)`, which revokes every ACTIVE entitlement whose `sourceOrderId` is that order. It is all-or-nothing, like every other product. Because a renewal re-points the entitlement at the newest order, refunding *that* order takes the whole plan with it, including days paid for by earlier orders; refunding an older, superseded order revokes nothing, because nothing still points at it.

## 6. Admin content lifecycle

Diagram: [`diagrams/admin-content-lifecycle.puml`](./diagrams/admin-content-lifecycle.puml)

The admin panel lives in `pdf-web`, not `web`: `pdf-web/src/app/(admin)/admin/pyq/{page,import,questions,questions/[id],questions/new,reports,taxonomy}`. Every call goes through `pdf-web/src/lib/api/admin-pyq.ts`. Server side, `admin-questions.controller.ts` (import) and `admin-question-content.controller.ts` (everything else) are both `@Roles('ADMIN')`, and every mutation writes an `activity` line.

| Stage | Admin route | Endpoint | Service |
|---|---|---|---|
| Import | `/admin/pyq/import` | `POST admin/pyq/questions/import` | `QuestionImportService` |
| Create / edit | `/admin/pyq/questions/new`, `/admin/pyq/questions/[id]` | `POST`/`PATCH admin/pyq/questions[/:id]` | `QuestionAdminService` |
| Publish / unpublish | question editor | `PATCH admin/pyq/questions/:id/status` | `QuestionAdminService` |
| Triage | `/admin/pyq/reports` | `GET`/`PATCH admin/pyq/reports[/:id]` | `QuestionAdminService.resolveReport` |
| Taxonomy | `/admin/pyq/taxonomy` | `POST`/`PATCH`/`PUT …/order`/`DELETE` | `PyqTaxonomyAdminService` |

1. **Import or create.** Import upserts on `external_key`, so re-running the same file updates rather than duplicates. The whole file is validated before anything is written — a single bad row means nothing is saved, and the UI shows the errors instead of a half-loaded bank. Taxonomy in the file is matched by slug and upserted. New questions arrive as `DRAFT`; existing ones keep their status, so re-importing never silently unpublishes or publishes anything.
2. **Edit as a draft.** 2–6 options, exactly one correct. Options are matched by `id` on edit, which is what lets an option a student has already chosen be reworded but not removed — removing it is a 409, because `attempts.selected_option_id` would be left pointing at nothing and an old review would change.
3. **Publish.** `DRAFT` → `PUBLISHED`. `PUBLISHED` is the only status the student-facing bank and session builder draw from, so unpublishing hides a question from new lists and new sessions immediately — while leaving sessions already in progress intact, since a session's question set is fixed at `session_questions` when it starts.
4. **A student reports it.** `POST pyq/questions/:id/reports` (`ProgressService.report`, logged as `questions.reported`) writes an `OPEN` row to `pyq.question_reports`. It surfaces two ways: the queue at `/admin/pyq/reports`, and `GET admin/pyq/questions?reported=true`, where each row also carries `reports: { open, total }`.
5. **Triage.** `PATCH admin/pyq/reports/:id { status: RESOLVED | DISMISSED, note? }`. The note **is persisted** — `admin_note`, alongside `resolved_by_id` and `resolved_at`, added by migration `20261005130000_pyq_report_resolution` — as well as logged as `pyq.report_resolved` / `pyq.report_dismissed`. Closing an already-closed report is a 409: the decision is made once. The usual order is fix the question in its editor (unpublishing first if it is actively wrong), then resolve; dismiss when no change is needed.
6. **Soft delete.** `DELETE admin/pyq/questions/:id` sets `deleted_at`. The row stays. The question disappears from students *and* from admin lists, but past sessions, scores, reviews and reports still render it, and it still blocks deleting its exam, subject or topic (409). Two reasons it is soft: `session_questions` and `attempts` reference the question with `onDelete: Restrict`, and a student's old result should not change under them. For the same reason, correcting a question's right answer does not re-score attempts already made.

Taxonomy is managed separately. Slugs are the public identifiers (`neet-pg`, `anatomy`, `anatomy--upper-limb`) and never change; renaming changes the display name only. Reordering is `PUT admin/pyq/{exams,subjects,topics}/order { slugs }`, topics one subject at a time, and the order is exactly what students see. Anything still referenced — even by a soft-deleted question — cannot be deleted.

Tests worth reading before changing any of this: `backend/src/modules/questions/application/pyq-admin.integration.spec.ts` (editor validation, option-id stability, soft delete keeps review, taxonomy rules, report resolution, the ADMIN-only guard).

## 7. The data behind all of it

Diagram: [`diagrams/pyq-erd.puml`](./diagrams/pyq-erd.puml)

Every table lives in the Postgres schema `pyq`, in the same database and instance as `public`. Read `backend/prisma/schema.prisma` (the `@@schema("pyq")` models) for the authoritative column list.

Three things to notice:

- **One link out.** The only cross-schema reference is to `public.users`. Subscriptions are ordinary products, orders and entitlements in `public`, reached through `EntitlementService` and never by a join from here — which is what makes moving `pyq` to its own database later a data copy plus a connection string rather than a rewrite. Split only on a real signal.
- **Nothing derived is stored.** Streaks, due-for-revision, reinforcement, wrong-questions and statistics are all computed from `attempts` on each read. There is no job and no cache to go stale.
- **`attempts.user_id` is denormalised** from the session, so the daily-allowance count and per-user statistics are single-index reads rather than a join through `practice_sessions`.

Migrations are additive (expand-contract), so an older app version runs unchanged against a newer database: `20261004120000_pyq_question_bank` (schema, enums, Phase 1 tables), `20261005120000_pyq_learning` (collections, membership, preferences), `20261005130000_pyq_report_resolution` (`admin_note`, `resolved_by_id`).
