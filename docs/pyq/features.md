# PYQ features — what exists, and where

This is the inventory of the previous-year-question practice product: the student app in [`web/`](../../web), its backend module [`backend/src/modules/questions/`](../../backend/src/modules/questions) and the admin panel at [`pdf-web/src/app/(admin)/admin/pyq/`](../../pdf-web/src/app/%28admin%29/admin/pyq). [README.md](./README.md) gives the shape, the database and the API table; this file goes one level down — for every feature, what the student or admin actually sees, the exact rule behind it, the file that owns that rule, and the edge cases a new engineer would otherwise discover the hard way. One thing to hold on to while reading: the web app talks to a port, [`PyqDataSource`](../../web/src/lib/data-source/types.ts), with two adapters (`mock`, `api`) chosen at build time by `NEXT_PUBLIC_DATA_SOURCE`, so "built" is always two questions — is the screen built, and does it work against the backend.

## 1. Student screens

Every `(app)` route is behind the app shell; `practice/*` has its own full-screen layout. "Hook" is from [`web/src/hooks/pyq/index.ts`](../../web/src/hooks/pyq/index.ts) unless stated. "api mode" means the screen is fully wired to the backend through [`api-adapter.ts`](../../web/src/lib/data-source/api-adapter.ts).

| Route | What it does | Hook(s) | Backend endpoint(s) | api mode |
|---|---|---|---|---|
| `/dashboard` | Greeting, streak card, recent sessions, quick links into bank / custom test / revision / bookmarks | `useStats`, `useSessionHistory`, `useStreak` (via `useStreakState`), `usePreferences` | `GET pyq/stats`, `pyq/sessions`, `pyq/streak`, `pyq/preferences` | Yes |
| `/question-bank` | Filter the bank by exam, year, subject, topic and per-user status; start a session from the result | `useQuestions`, `useStartSession` | `GET pyq/questions`, `POST pyq/sessions` | Yes (search/sort hidden) |
| `/custom-test/new` | Build a test: filters, question count, optional timer; shows the live match count before starting | `useQuestionCount`, `useStartSession`, `useTaxonomyLookup` | `GET pyq/questions` (count only), `POST pyq/sessions` | Yes (ordering hidden) |
| `/practice/[sessionId]` | The runner: one question at a time, palette, flagging, bookmarking, reporting, timer | `useSessionDetail`, `useAnswer`, `useSetFlag`, `useSubmitSession`, `useBookmarkToggle` | `GET/POST pyq/sessions/:id…` | Yes |
| `/practice/[sessionId]/results` | Score card after submit, with the breakdown by subject | `useSessionDetail`, `useTaxonomyLookup` | `GET pyq/sessions/:id` | Yes |
| `/practice/[sessionId]/review` | Question-by-question review with correct answers and explanations | `useSessionReview` | `GET pyq/sessions/:id/review` | Yes |
| `/bookmarks` | Saved questions; "Practice all bookmarks" starts a session from them | `useBookmarks`, `useStartSession` | `GET pyq/bookmarks` | Yes |
| `/wrong-questions` | Questions whose latest answer was wrong; practise them as a set | `useWrongQuestions`, `useStartSession` | `GET pyq/wrong-questions` | Yes |
| `/revision` | The four-section revision hub: Needs Practice, Bookmarked, Your Collections, Reinforce — each with date-range, subject grouping, search and sort | `useRevision`, `useCollections`, `useStartSession` | `GET pyq/revision`, `GET pyq/collections` | Yes |
| `/reinforce` | Standalone view of correctly-answered questions, split recent / not revisited | `useReinforce`, `useStartSession` | `GET pyq/reinforce` | Yes |
| `/history` | Every past session with score, filters by type and period | `useSessionHistory`, `useStats`, `useCollections` | `GET pyq/sessions`, `pyq/stats` | Yes |
| `/statistics` | Overall accuracy and coverage, per-subject table, accuracy over time | `useStats`, `useTaxonomyLookup`, `useCollections` | `GET pyq/stats` | Yes |
| `/subscription` | Plans and checkout. In api mode renders `ApiSubscription`; in mock mode a non-functional plan switcher | `usePlans`, `usePlanCheckout` ([`plans.ts`](../../web/src/hooks/pyq/plans.ts)) | `GET pyq/plans`, `POST orders`, `POST payments/verify` | Yes |
| `/profile` | Target exam and daily goal; name, email and photo | `usePreferences`, `useUpdatePreferences` | `GET/PUT pyq/preferences` | Partly — preferences only |
| `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/callback` | The shared JSMF account, including Google sign-in | `useAuthStore` | identity module | Yes |
| `/`, `/about`, `/contact`, `/pricing`, `/privacy`, `/terms`, `/roadmap` | Marketing and static pages | — | — | Static (`/pricing` renders mock plans) |

Capabilities differ per adapter, declared on the data source and read by screens through `pyqCapabilities`: the mock adapter has `{search, sort, collections, sessionOrdering}` all true; the api adapter has only `collections` true. Screens hide the controls they cannot honour rather than failing silently.

## 2. Access and subscriptions

**What the student sees.** Free users may answer a fixed number of questions a day; the count and what is left are shown in the app, and the answer that would cross the line fails with a toast offering "See plans". A subscriber sees no limit and their plan's expiry on `/subscription`.

**The rules.** All of them live in [`pyq-access.service.ts`](../../backend/src/modules/questions/application/pyq-access.service.ts):

- Subscribed means holding an `ACTIVE` entitlement, not expired, to a product whose `metadata` has `"pyqSubscription": true`. The metadata flag rather than a product type means a plan needs no schema change.
- The free allowance is `PYQ_FREE_DAILY_QUESTIONS` (default 20) answers per India-time day. The day boundary is `startOfIndiaDay()` in [`question-view.ts`](../../backend/src/modules/questions/domain/question-view.ts) — a fixed +05:30 shift, exact because India has no DST. "Used today" counts `attempts` rows with `answeredAt` after that instant, so it resets at IST midnight with no job to run.
- `assertCanAnswer` runs before the write, in `PracticeService.start` (so a student is never dropped into a session they cannot answer) and on every first answer. Changing an answer inside a TEST does not spend allowance a second time.
- Exceeding the limit is `403` with code `PYQ_DAILY_LIMIT_REACHED`; the adapter turns it into `DailyLimitError`, and `notifyDailyLimit` shows the upgrade toast.
- When several plan entitlements exist, the one with the furthest expiry wins (a perpetual grant, `expiresAt` null, beats everything).

**Buying.** A plan is an ordinary `COURSE` product; its terms are parsed only by [`backend/src/shared/pyq-plan.ts`](../../backend/src/shared/pyq-plan.ts) (`readPyqPlan`, `IS_PYQ_PLAN`, `NOT_A_PYQ_PLAN`, `extendedExpiry`). Checkout is the normal order flow. On settlement, `applyPlanTerm` in [`payment.service.ts`](../../backend/src/modules/orders/application/payment.service.ts) sets the entitlement's `expiresAt`:

- A grant made by *this* order with a null expiry is "fresh" and gets `now + durationDays`.
- Otherwise the term extends from `max(now, current expiry)`, so renewing early loses no paid days.
- An entitlement that is already perpetual and was not created by this order is left alone — an admin gift is never shortened by a purchase.
- Because the decision keys on `sourceOrderId`, a redelivered webhook racing the browser's verify call cannot add days twice.

**Edge cases.** Two answers submitted in the same instant can overshoot the free limit by one; this is deliberate (a check, not a constraint). A refund of the latest plan order revokes the plan entitlement outright, including days bought in earlier orders; refunding a superseded order revokes nothing.

## 3. Question bank and filtering

**What the student sees.** A filter panel (exam, year, subject, topic) plus status tabs — unattempted, correct, incorrect, bookmarked — and, in mock mode only, free-text search and sort. Each row shows the student's own status and bookmark state and never the answer.

**The rules**, in [`question-bank.service.ts`](../../backend/src/modules/questions/application/question-bank.service.ts):

- Students only ever see `VISIBLE_QUESTION` — `status: PUBLISHED, deletedAt: null`. Unpublishing hides a question from new lists and sessions immediately.
- Taxonomy filters take slugs (`neet-pg`, `anatomy`, `anatomy--upper-limb`); questions and options are UUIDs. A topic slug is conventionally `${subject}--${topic}`, so it reveals its subject.
- `status` is derived, not stored. `latestAttempts()` is a `DISTINCT ON (question_id)` query taking each question's most recent answered attempt — and it excludes attempts in a TEST that is still `IN_PROGRESS`. That exclusion is the thing to remember: without it a student could learn their test answers by filtering the bank for "incorrect" mid-test.
- `collectionIds` filters to the user's own collections only (the join checks `collection.userId`).
- Listing is ordered newest year first, then `externalKey`, and paginated (`pageSize` ≤ 100).
- The answer-free shape is enforced structurally: `toQuestionView` lists option fields explicitly so spreading a row can never leak `isCorrect`; only `toAnsweredQuestionView` carries `correctOptionId` and the explanation.

## 4. Practice sessions

A session is a fixed, ordered set of questions chosen when it starts; [`practice.service.ts`](../../backend/src/modules/questions/application/practice.service.ts) owns the whole lifecycle.

**Starting.** Either an explicit `questionIds` list (deduplicated, capped at `MAX_SESSION_QUESTIONS` = 200, filtered down to visible questions) or `filters` + `count`, in which case the matching ids are shuffled with `crypto.randomInt` and sliced. An empty selection is a `400`. The filters, plus whatever the client put in `meta`, are stored on `config` so history can describe the session — they are never used to re-derive its questions, so a session stays stable even if the bank changes.

**PRACTICE vs TEST.** The database has three modes (`PRACTICE`, `TEST`, `CUSTOM`) but the api adapter only ever sends two: a custom test with a timer becomes `TEST`, everything else `PRACTICE`, with the UI's own notion of the mode (`browse`, `bookmarks`, `custom-test`, …) kept in `config.uiMode` ([`api-adapter.ts`](../../web/src/lib/data-source/api-adapter.ts)). The split that matters is `revealsAnswers()`: feedback is immediate unless the session is a TEST that has not been submitted.

| | PRACTICE | TEST (unsubmitted) |
|---|---|---|
| Answering returns | correctness, correct option, explanation | `{recorded: true}` only |
| Changing an answer | refused — the first answer stands | allowed, and does not re-spend allowance |
| Session summary shows | full score | totals, attempted, time — never correctness |
| Palette shows | right/wrong | "answered" |
| Counts toward wrong-questions / revision | yes | not until submit |

Practice answers are final once the explanation has been shown; otherwise "change it to the right one" would inflate every score.

**Flagging.** `PATCH …/questions/:qid/flag` upserts an attempt row with no selected option, which is why `Attempt.selectedOptionId` is nullable. A flag persists into the revision list.

**Timers.** `timeLimitSec` is stored on the session; answers are refused once `startedAt + timeLimitSec + 30s` has passed (`DEADLINE_GRACE_MS`, slack for network and clock skew), with a message telling the student to submit.

**Submitting.** Idempotent: the score is written under a conditional `updateMany` on `status = IN_PROGRESS`, so a double submit scores once and the second caller simply gets the review back. Submit returns the review directly; `GET …/review` on an unsubmitted session is a `409`.

**Ownership.** Every read and write goes through `owned()`, which returns `404` — not `403` — for someone else's session, so ids cannot be probed.

## 5. Results and review

`/practice/[sessionId]/results` shows the score card built from the same `scoreOf()` numbers the session row stores at submit: total, attempted, correct, incorrect, unattempted, accuracy (correct over *attempted*, rounded), and total time from the summed `timeSpentMs`. `/review` lists every question with the chosen option, the correct option and the explanation. Review is only reachable after submit; in PRACTICE the answered questions already carry their answers in `GET /sessions/:id`, question by question, as they are answered.

Edge case worth knowing: editing a question's correct answer in admin does **not** re-score past attempts. Historic `attempts.isCorrect` is frozen at the moment of answering, deliberately — a student's past score should not move under them.

## 6. Bookmarks and collections

**Bookmarks** ([`progress.service.ts`](../../backend/src/modules/questions/application/progress.service.ts)) are one-per-user-per-question, idempotent on `PUT`, and bookmarking a non-visible question is a `404`. The list is newest first and silently drops questions that have since been unpublished or deleted. `useBookmarkToggle` keeps every list in step by invalidating the whole `["pyq","user"]` key space after a write.

**Collections** ([`collections.service.ts`](../../backend/src/modules/questions/application/collections.service.ts)) are user-named lists — a themed set practised and filtered as a group, as against a bookmark which saves one question. Created from the "add to collection" button on any question row ([`add-to-collection-button.tsx`](../../web/src/components/question-bank/add-to-collection-button.tsx)). Create, rename, re-describe, delete, add/remove a question (`PUT`/`DELETE`, both idempotent). Guard rails, not product limits: 100 collections per user, 2000 questions per collection. Another user's collection id is a `404`. Membership rows carry `addedAt`, which feeds `collectedAt` on the revision list. Collections survive a question being unpublished — the row stays, but the question is filtered out of every read.

## 7. Revision, reinforce and wrong questions

Three overlapping lists, all computed on read from attempts, bookmarks and collections. Nothing is stored, so nothing can drift.

**Wrong questions** (`GET pyq/wrong-questions`): questions whose *latest* answer was wrong, newest first. Answering one correctly removes it from the list. Built on the same `latestAttempts()` as the bank, so unsubmitted TEST answers do not appear.

**Revision** (`GET pyq/revision`, [`learning.service.ts`](../../backend/src/modules/questions/application/learning.service.ts)): every question worth another look — attempted, bookmarked *or* collected — each with the facts the screen filters and sorts by: `latestCorrect`, `lastAttemptedAt`, `lastCorrectAt`, `lastWrongAt`, `attemptCount`, `incorrectCount`, `neverCorrected` (answered at least once, never correctly), `flagged` (in any session), `bookmarkedAt`, `collectedAt` and `due`. An item is **due** when any of these holds:

1. its latest answer was wrong, or
2. it was flagged in any session, or
3. its latest answer was correct but older than `REVISION_STALE_DAYS` (30) — spaced revision, so a concept that was right a month ago comes round again.

The window is returned as `staleDays` so the UI never hard-codes 30.

**Reinforce** (`GET pyq/reinforce?recentDays=7`): questions whose latest answer was correct, split into `recentIds` (answered within the last `recentDays` India-time days) and `notRevisitedIds`. The split is by IST day string, not by a rolling instant, so "7 days" means seven calendar days.

The `/revision` screen stacks all of this into four sections — Needs Practice, Bookmarked, Your Collections, Reinforce — each with a date-range preset, a "by subject" grouping, search and sort, and a button that starts a session from whatever is on screen.

## 8. Streaks and preferences

`GET pyq/streak` returns `currentStreak`, `longestStreak`, `today`, `todayCount`, `dailyTarget`, `todayDone` and `lastActiveDay`. The counting rule, in `computeStreak()`:

- A **day** is an India-time calendar day (`to_char(answered_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`), and it counts as active with **one** answered attempt — the daily goal affects `todayDone`, not the streak.
- The **current** streak counts back from today if today is active, otherwise from yesterday. A run therefore stays "current" for the whole of the day after its last active day: you have all of today to keep yesterday's streak alive.
- The **longest** streak is the longest run of consecutive active days ever, recomputed on every read.
- Unlike the rest of the learning queries, the streak query does *not* exclude unsubmitted TEST attempts — answering inside a running test still keeps the day alive, which is the behaviour a student expects.

Preferences (`pyq.user_preferences`, one row per user, absent means defaults) hold `targetExam` (an exam slug, validated against `exams` but deliberately not a foreign key, so retiring an exam never cascades into preferences) and `dailyTarget` (default 10, 1–500). Set from `/profile`; `todayDone` is `todayCount >= dailyTarget`. The dashboard streak card celebrates when the real count reaches the goal.

## 9. Statistics

`GET pyq/stats` returns, all computed per request:

- `totalQuestions` (published, undeleted — the denominator for coverage), `attempted`, `correct`, `incorrect`, `unattempted`, `accuracy`, `coverage`, `wrongQuestionCount`, `bookmarkCount`.
- `bySubject`: attempted / correct / incorrect / accuracy per subject slug, counted from each question's *latest* attempt, so a question moves between buckets rather than being double counted.
- `accuracyTrend`: one row per India-time day with that day's `answered`, that day's `accuracy`, and a running `cumulativeAccuracy`. Only days with activity appear — the chart has no zero rows to filter.

Percentages are integers (`Math.round`), and an empty denominator yields 0 rather than `NaN`.

## 10. Reporting a question

From the runner, "Report a problem" ([`report-question-modal.tsx`](../../web/src/components/practice/report-question-modal.tsx)) sends `POST pyq/questions/:id/reports` with a reason — `WRONG_ANSWER`, `WRONG_EXPLANATION`, `INCORRECT_QUESTION`, `IMAGE_ISSUE`, `OTHER` — and up to 2000 characters of detail. The DTO accepts `wrong-answer` style as well as the enum spelling. Reporting an invisible question is a `404`. There is no per-user rate limit and no de-duplication: a student may file the same report repeatedly, and triage sees them all. Each report logs `questions.reported`.

## 11. Admin

All routes are `@Roles('ADMIN')` and emit `activity` events. The panel lives under `/admin/pyq` in pdf-web with four tabs ([`layout.tsx`](../../pdf-web/src/app/%28admin%29/admin/pyq/layout.tsx)); `/admin/pyq` redirects to Questions.

| Screen | What it can do |
|---|---|
| [Questions](../../pdf-web/src/app/%28admin%29/admin/pyq/questions/page.tsx) | Paginated list with answers and per-question report counts; filter by exam, subject, topic, status, stem text (`q`) and "has open reports"; publish/unpublish inline; link into the editor |
| [Question editor](../../pdf-web/src/app/%28admin%29/admin/pyq/questions/[id]/page.tsx) and [New question](../../pdf-web/src/app/%28admin%29/admin/pyq/questions/new/page.tsx) | Full edit — taxonomy, year, stem, options with the correct-answer radio, explanation, difficulty; publish/unpublish; soft delete behind a confirm; a link to this question's reports |
| [Reports](../../pdf-web/src/app/%28admin%29/admin/pyq/reports/page.tsx) | The triage queue, open first; filter by status or by `questionId`; resolve or dismiss with a note |
| [Exams & subjects](../../pdf-web/src/app/%28admin%29/admin/pyq/taxonomy/page.tsx) | Create, rename, reorder (up/down) and delete exams, subjects and topics, each row showing its live question count |
| [Import](../../pdf-web/src/app/%28admin%29/admin/pyq/import/page.tsx) | Upload a JSON file; shows created/updated counts or the full list of validation errors |

**Draft / publish lifecycle.** Questions are created and imported as `DRAFT` and are invisible to students until `PATCH …/status` publishes them. Unpublishing takes effect immediately for new lists and sessions, but a session already holding the question keeps working — `SessionQuestion` is `onDelete: Restrict` and the review path does not re-check status.

**Soft delete.** `DELETE admin/pyq/questions/:id` sets `deletedAt`. The question vanishes from students *and* from admin lists, while past sessions, scores, reviews and reports still render it. There is no undelete in the UI.

**Option identity.** On edit, options are matched by `id`: an option some student has chosen can be reworded but not removed — attempting it is a `409` ("reword it instead of removing it"), because their past answer would otherwise point at nothing. Validation is 2–6 options, exactly one correct, every option with text, no duplicate ids. Reordering parks kept options at `sortOrder = 1000 + i` inside the transaction so the `(questionId, sortOrder)` unique index does not trip mid-shuffle. Labels A–F are assigned by position, not stored by the editor.

**Taxonomy rules** ([`pyq-taxonomy-admin.service.ts`](../../backend/src/modules/questions/application/pyq-taxonomy-admin.service.ts)). Slugs are permanent — they are the ids filters, imports and the student app use — so "rename" only changes the display name. Delete is a `409` while anything references the entry, counting soft-deleted questions too: an exam used by any question, a subject with any question *or* topic, a topic used by any question. Reorder takes the full `{slugs}` list and writes the array position to `sortOrder`; topics must be reordered one subject at a time; a duplicate or unknown slug is a `400`. A clashing slug on create is a `409`.

**Import idempotency** ([`question-import.service.ts`](../../backend/src/modules/questions/application/question-import.service.ts)). The whole file is validated first (duplicate `externalKey` within the file, option count, exactly one correct), so a bad row fails the import before anything is written. Taxonomy is upserted by slug; taxonomy referenced but not described is created with a name derived from the slug. Questions are upserted on `externalKey`, options upserted by `(questionId, sortOrder)` and surplus options deleted — updating in place keeps option ids stable, so a typo fix does not orphan anyone's past answer. New questions arrive as `DRAFT`; existing ones keep their status unless the file states one. Re-running the same file changes nothing. The UI also accepts a bare array of questions as shorthand for `{questions: [...]}`.

**Report triage.** `PATCH admin/pyq/reports/:id` with `{status: RESOLVED|DISMISSED, note?}` closes a report exactly once — a second attempt is a `409`. The outcome persists `adminNote` and `resolvedById` on `pyq.question_reports` (migration `20261005130000_pyq_report_resolution`), and the list returns both along with the resolving admin's name. This closes the gap the README describes as open: the note is no longer activity-log-only. Reports closed before the migration have `resolvedById` null.

## 12. Not built yet

- **Profile identity in api mode.** Name, email and avatar on `/profile` still read and write the browser-persisted `auth-store`; the avatar is a data URL in `localStorage` capped at 2MB, as there is no upload endpoint. Only target exam and daily goal reach the backend.
- **Search and sort in the question bank** are mock-only. The api adapter declares `search: false, sort: false`, and `QuestionQuery.search` / `.sort` are ignored; the backend has no stem search for students (only admin's `q` filter) and no sort parameter.
- **Smart custom-test ordering** (`unattempted-first`, `incorrect-first`, `bookmarked-first`) is mock-only — `sessionOrdering: false` in api mode. The backend always shuffles when drawing from filters.
- **The `CUSTOM` practice mode** exists in the schema but nothing writes it; the api adapter sends only `PRACTICE` or `TEST`.
- **Marketing `/pricing`** still renders the static mock plans from `web/src/data/mock/plans.ts`, not `GET pyq/plans`. Mock mode's `/subscription` is likewise an illustrative switcher that enforces nothing.
- **Session-list sort keys** `newestYear`, `oldestYear` and `lastWrongAt` are optional on the port and supplied only by the mock adapter.
- **No undelete** for questions, no bulk publish, no bulk report action, no per-user report rate limit, and no re-scoring of past attempts after a correct-answer edit.

## 13. Test coverage

| Spec | What it locks down |
|---|---|
| [`pyq.integration.spec.ts`](../../backend/src/modules/questions/application/pyq.integration.spec.ts) | Import idempotency and stable option ids; listings never carry answers and hide drafts; PRACTICE returns feedback and locks the answer; TEST hides correctness until submit, then scores (and scores once); another user's session is a 404; the free daily allowance blocks answers unless subscribed; bookmarks and reports |
| [`pyq-admin.integration.spec.ts`](../../backend/src/modules/questions/application/pyq-admin.integration.spec.ts) | Option validation on create and edit; unknown or cross-subject taxonomy rejected; edits keep option ids and refuse to remove a chosen option; soft delete hides the question but keeps a past session's review working; taxonomy rename/reorder and the delete-while-referenced 409; report counts and resolve/dismiss exactly once; every admin endpoint is ADMIN-only |
| [`learning.integration.spec.ts`](../../backend/src/modules/questions/application/learning.integration.spec.ts) | Collections CRUD and cross-user isolation; streaks counted in India time, not UTC, across an IST midnight; revision and reinforce contents (wrong, flagged, stale-correct, bookmarked, collected) with their facts; preference defaults and exam validation; a timed custom test behaves as TEST and stays off the revision list until submit |
| [`pyq-plan.integration.spec.ts`](../../backend/src/modules/orders/application/pyq-plan.integration.spec.ts) | Plans listed publicly with duration and features; buying grants unlimited access for `durationDays`; a redelivered webhook does not add days twice; expiry is respected and a post-expiry purchase starts fresh; renewing while active extends from the current expiry; a refund revokes access; plans stay out of the PDF library |
