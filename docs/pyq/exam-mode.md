# Exam mode: the test console, full mocks and shuffled options

How a student sits a test the way the real computer-based exam runs: the instructions screen, the console, full mocks that follow each exam's paper pattern, exact marking, and options in a shuffled order. Also how an admin controls it, and what the server enforces.

## 1. What a student sees

**Practice** (question bank, revision, untimed custom tests) is unchanged: a learning screen, with the answer and explanation straight after each question. The real exam never shows answers, so this screen doesn't copy it.

**A test** runs on the exam console. That means a timed custom test or a full mock.

1. **Instructions first.** The student sees the general instructions, the sections table, the marking, what each palette colour means, and what each button does. "I am ready to begin" stays disabled until they tick "I have read and understood the instructions". **The clock starts only on that tap.** Until then the server withholds the questions, so they can't be read with the clock stopped.
2. **The console.** The question is on the left. On the right is the five-state legend with live counts and the question grid:
   - Not Visited: white square.
   - Not Answered: solid red square.
   - Answered: solid green square.
   - Marked for Review: purple circle.
   - Answered & Marked for Review: purple circle with a green tick.

   The buttons are Save & Next, Mark for Review & Next, Clear Response, Previous, and Submit Test with a summary. Moving away without Save & Next drops the choice on screen, as on the real console. The header has the exam name, the candidate, the clock and an **Instructions** button that reopens the instructions.
3. **Sections (full mocks).** A strip of section tabs sits under the header. With **time-bound sections** (NEET-PG, FMGE):
   - Only the running section can be opened. The others show a lock.
   - The palette and counts are that section's.
   - The clock is that section's ("Section B · Time Left").
   - Save on a section's last question goes back to its first.
   - When the section's time ends, the next section opens on its own. After the last one, the test submits itself.
   - A link or reload into another section lands on the running section's first question.

   Without time-bound sections (INI-CET) there is one clock and free navigation.
4. **Results.** A full mock shows marks first, for example "412 / 720 marks". Under that come accuracy, the marking used, and a per-section table of correct, incorrect, unattempted and marks. History rows show the marks too.

Full mocks are started from the **Full mock test** card on `/custom-test/new` (web) or the custom-test screen (mobile). The card lists only exams whose pattern is on *and* whose bank holds enough published questions to fill the paper. A mock draws the student's unattempted questions first, then fills from the rest at random.

## 2. Exam patterns

Each exam has one pattern (`pyq.exam_patterns`, one JSON document per exam), edited at **PYQ → Exam setup** (`/admin/pyq/exam-setup`):

| Field | Meaning |
|---|---|
| `sections` | Up to 10 sections, in order, each `{ name, questions, minutes }`. Totals: up to 300 questions and 6 hours. |
| `sectionsLocked` | Each section opens when the one before it closes, and closes for good with its own time. There's no going back and no moving on early. It only applies with 2+ sections. |
| `marking.correct` | Marks for a right answer, as an exact fraction. |
| `marking.incorrect` | Marks taken off for a wrong answer (0 = no negative marking). Unanswered always scores 0. |
| `enabled` | Offered to students, once the bank can fill it. |

Marks are stored as exact fractions (`{num, den}`, denominators up to 12), so INI-CET's −⅓ is never 0.33. A score is computed exactly and rounded to two decimals only at the end: 200 wrong answers is −66.67, not −66.

**Seeded by the migration** (matched by exam slug; any exam that is missing just gets none):

| Exam | Paper | Marking |
|---|---|---|
| NEET-PG | 5 time-bound sections of 36 questions × 42 min (180 q, 3 h 30 min) | +4 / −1 |
| FMGE | 2 time-bound parts of 150 questions × 150 min (300 q, 5 h) | +1, no negative |
| INI-CET | One 200-question paper, 3 h, free navigation | +1 / −⅓ |

**[Likely]** These follow the published exam schemes as of 2026. Check them against each year's information bulletin and edit them on the admin page if they change.

**A mock copies its pattern when it starts** (`practice_sessions.pattern`). Editing a pattern never changes a mock in progress or a score already given. The shape carries `version: 1`. A future rule, such as a break between FMGE's parts or marking per section, is a new field and `version: 2`, and `parseExamPattern` keeps reading old copies.

## 3. Shuffled options

- **Per session, per question, stable.** The order comes from SHA-256 of the session and question ids. It is never stored and never random at read time, so a reload, the review and a second device all show the same order, and a new session gets a new one. Labels A, B, C… follow the shown position. Answers are by option id, so scoring is unaffected.
- **The switch** is in **PYQ → Exam setup → Shuffle options** (`pyq.practice_settings`, on by default). A session records the decision when it starts (`practice_sessions.shuffle_options`), so flipping the switch never reorders options under someone mid-test. Sessions from before this change keep their written order.
- **Questions that must keep their order** never shuffle. These are:
  - an option that refers to other options: "All/None/Both of the above", "None of these", "Both A and C", "B & D", "Option B";
  - an explanation that names an option by letter ("Option C is wrong because…");
  - any question with **Keep option order** ticked in the question editor (`questions.keep_option_order`, also settable in import JSON as `keepOptionOrder`).

  The text checks run on every read (`domain/option-order.ts`), so improving the detector covers the whole bank at once with no backfill. A false positive like "Vitamin A and D" just keeps that question in order, which is harmless. The editor says when a saved question is already kept in order, and why.

## 4. What the server enforces

The browser draws the picture. The server decides.

- **Not begun:** a TEST is created with `clock_started_at` null. `GET` returns no questions, and answering, flagging and submitting are refused (409 `PYQ_TEST_NOT_BEGUN` — a never-begun test submitted used to become a finished session with nothing to review). `POST pyq/sessions/:id/begin` sets the clock once. It is idempotent, so a second tap or a second device changes nothing.
- **Deadlines** count from `clock_started_at`, with 30 s grace for network and clock slack. The paper's end is refused after that (409).
- **Sections:** in a time-bound mock, an answer or flag for a question outside the running section's window is refused. That is 409 `PYQ_SECTION_NOT_OPEN` before the window opens, and 409 `PYQ_SECTION_CLOSED` after it closes plus the grace. Which section is open is computed from the session's own copy of the pattern.
- **Clock skew:** every session response carries `serverTime`. The apps count down on the server's clock (`clockOffsetMs`), so a phone set five minutes fast can't close a section early. The countdown runs against a fixed end time rather than ticking down, so backgrounded tabs don't drift.
- **No correctness before submit,** for mocks as for every TEST. `marks` appear only once submitted.
- **No posing as a mock:** `meta.uiMode = "full-mock"` from a client is dropped. Only `POST pyq/mocks` makes a mock. `sourceHref` ("Save & exit") is kept only if it is an in-app path, so no `//other.site`.
- **Admin:** every Exam setup endpoint is ADMIN only and rate-limited to 10 writes a minute. Every change is audited (`pyq.practice_settings_updated`, `pyq.exam_pattern_saved`) in the same transaction, with before and after. A pattern is validated by the DTO and again by `parseExamPattern`.

## 5. API

| Method & path | Who | What |
|---|---|---|
| `GET pyq/mocks` | Signed in | Full mocks on offer: pattern on and bank fillable. Cached 60 s, dropped on every pattern save |
| `POST pyq/mocks` | Signed in | `{ examId, sourceHref? }` → a TEST session waiting to be begun. 409 `PYQ_MOCK_UNAVAILABLE` when off or not fillable |
| `POST pyq/sessions/:id/begin` | Owner | Starts the clock and returns the session with its questions |
| `GET pyq/sessions/:id`, history | Owner | Also carry `clockStartedAt`, `serverTime`, `pattern`, `sectionWindows` (`{index, name, firstPosition, questions, opensAt, closesAt}`) and, once submitted, `marks: {scored, max}` |
| `GET admin/pyq/exam-setup` | ADMIN | Shuffle switch, plus every exam with its pattern and published question count |
| `PATCH admin/pyq/exam-setup/settings` | ADMIN | `{ shuffleOptions }` |
| `PUT admin/pyq/exam-setup/patterns/:examId` | ADMIN | `{ enabled, pattern }` |
| `POST/PATCH admin/pyq/questions` | ADMIN | Accept `keepOptionOrder`; responses carry `keepOptionOrder` and `optionOrderLock` (`{reason, match}` or null) |

## 6. Code map

- `backend/src/modules/questions/domain/exam-pattern.ts`: the pattern shape, validation, section windows, exact marks
- `backend/src/modules/questions/domain/option-order.ts`: the seeded shuffle and the keep-order detector
- `backend/src/modules/questions/application/exam-setup.service.ts`: shuffle switch, patterns, mock offers
- `backend/src/modules/questions/application/practice.service.ts`: `startMock`, `begin`, section enforcement, options in session order, marks
- `backend/src/modules/questions/http/admin-exam-setup.controller.ts`: admin endpoints
- `packages/core/src/domain/exam-pattern.ts`: the same rules for the apps: running section, section clock, redirect, per-section results, marks formatting
- `web/src/components/practice/exam/`: instructions and begin gate, console, section tabs, palette
- `web/src/components/practice/full-mock-card.tsx`: the mock card on `/custom-test/new`
- `mobile/src/components/exam/`: the same for the app (`exam-instructions.tsx`, `exam-screen.tsx`, `full-mock-card.tsx`)
- `pdf-web/src/app/(admin)/admin/pyq/exam-setup/page.tsx`: the admin page. The keep-order switch is in `components/admin/pyq-question-form.tsx`
- Tests: `backend/src/modules/questions/application/exam-mode.integration.spec.ts`

## 7. Not built yet

- A "Question Paper" view (every question of the section on one screen) and a language toggle, which the real console also has.
- A break between FMGE's two parts. It is one session today, with Part B opening as Part A closes.
- Answers chosen but not saved when a section's time runs out are dropped. **[Guessing]** That matches how we understand the real console behaves, but we haven't confirmed it with NBEMS.
