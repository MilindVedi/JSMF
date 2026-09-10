# UI/UX Plan — Mock Prototype Stage

This document is the definitive design and frontend architecture plan for the current mock UI prototype described in [V1 Scope](./02-v1-scope.md). Everything described here concerns the frontend-only prototype: static and mocked data, no real backend, and no real authentication or payments, exactly as scoped in the "Current Stage" section of [V1 Scope](./02-v1-scope.md). Where this document refers forward to a real backend or real content, that is describing how the mock is deliberately shaped to make that later transition easy — not something implemented now.

This document has been updated to match what was actually built, not just what was originally planned — a few details changed during implementation, and those are called out explicitly (in the technology table, the component structure, the mock data model, and state management) rather than left to drift silently out of sync with the code.

The repository this plan targets was confirmed empty before work began — no prior commits, no scaffolding — so this was a genuine from-scratch build. The available tooling was Node v20.19.0 with npm 10.8.2 and no yarn or pnpm, so the app was scaffolded with `npx create-next-app@latest` using npm as the sole package manager.

**Repository layout.** The Next.js application lives in this repository under [`web/`](../web), not at the repository root — see the root [`README.md`](../README.md) for why: the repository is a small monorepo, and `web/` sits alongside `docs/` and (eventually) `backend/` and `mobile/` folders for the pieces described in [Architecture](./03-architecture.md). Every path below (e.g. `src/app`, `src/components`) is relative to `web/`, i.e. the landing page actually lives at `web/src/app/(marketing)/page.tsx`.

## Design Principles & Direction

JSMF's mock UI is designed to feel premium, modern, clean, and unmistakably medical-academic and professional, while remaining fast to use. It is explicitly **not** a visual copy of Marrow or PrepLadder — both the palette and typography decisions later in this document are chosen in part specifically to avoid resembling either competitor. Because this is a study product where a single sitting can mean working through dozens or hundreds of questions in one session, a recurring design constraint throughout this plan is that the interface must hold up over long, repeated use: color choices, typography, and layout decisions are all made with sustained readability and reduced visual fatigue in mind, not just first-impression polish.

## Technology Choices for the Mock

| Choice | Reasoning |
|---|---|
| **Next.js App Router** | Non-negotiable for a new build — the Pages Router is legacy-maintenance mode at this point. More importantly, the App Router's nested layouts are the exact mechanism needed to solve the single hardest layout problem in this product: the practice/question-solving screen must **not** inherit the sidebar-and-topbar app shell that every other authenticated page uses. Route groups solve this cleanly, without prop-drilling or conditional rendering to fake a different shell. |
| **TypeScript, strict mode** | Used throughout, with a `src/` directory layout (`src/app`, `src/components`, `src/data`, `src/lib`, `src/store`, `src/types`) to keep the repository root clean, and an `@/*` import alias for ergonomic imports. |
| **Tailwind CSS v4** | Its CSS-first configuration model — a `@theme` block inside `globals.css` — is exactly what is needed to define JSMF's custom design-token palette as CSS variables, and that integrates natively with shadcn/ui's own CSS-variable-based theming model. |
| **shadcn/ui** | Chosen over both hand-rolling every primitive and over adopting a heavy, opinionated component library such as MUI, Chakra, or Ant Design. shadcn/ui components are copied directly into the repository (`src/components/ui`), so there is no black-box runtime dependency and no fight against a foreign design system when trying to establish JSMF's own premium visual identity — every primitive is just Tailwind plus an accessible headless library, fully restyleable. **Implementation note:** the shadcn CLI, run against this project's dependency versions, generated primitives built on [Base UI](https://base-ui.com) (`@base-ui/react`) rather than classic Radix UI — Base UI is the same team's newer headless library, with a very similar Root/Trigger/Content composition pattern, but it replaces Radix's `asChild` prop with a `render` prop and a few hook names differ. This is noted here because it matters for anyone extending these components later; it did not change which primitives were used or how they're composed at the call-site level. The project uses Dialog (Report Question modal), Popover (Question Palette, keyboard-shortcuts help, filter menus), Tabs (switching between exams), Accordion (FAQ), Checkbox and Sheet/Drawer (mobile filter panel and mobile sidebar), Dropdown Menu (the topbar's account menu), and Toast via `sonner` — all accessible and keyboard-navigable out of the box, which matters directly for the fast, keyboard-friendly navigation the solving screen needs. MCQ options and multi-select filters are, deliberately, **not** built on shadcn's RadioGroup/Select — see Component Structure and Mock Data Model below for why. |
| **lucide-react** | The icon set, chosen because it pairs natively with shadcn/ui, is tree-shakeable, and keeps a consistent single-stroke style across the whole product. |
| **Fonts, via `next/font/google`** | See the dedicated typography discussion under Design Tokens below; in summary, `Plus Jakarta Sans` for UI and headings, `Source Serif 4` for reading content, and `JetBrains Mono` as a sparing accent for numerals. |
| **react-hook-form + zod** | Handles forms and their validation across the app (auth forms, filter forms, the custom test builder). |
| **recharts** | Powers the statistics and performance charts. |
| **zustand, nanoid, date-fns, next-themes, clsx / tailwind-merge** | Supporting utilities: zustand for state management (discussed in its own section below), nanoid for generating session IDs, date-fns for date handling, next-themes wired in from day one for a future dark-mode pass even though it is not fully polished in v1, and clsx/tailwind-merge for conditional class composition. |

## Full Route / Page Structure

Routes are organized using App Router route groups, which let different sections of the site have entirely different layouts while sharing one root layout:

```
src/app/
  layout.tsx
  globals.css

  (marketing)/
    layout.tsx                        # MarketingHeader + MarketingFooter
    page.tsx                          # "/" Landing page (single long-scroll, anchor-nav sections)
    pricing/page.tsx                  # "/pricing" Public plan comparison

  (auth)/
    layout.tsx                        # centered card, logo only, no nav
    login/page.tsx
    signup/page.tsx
    forgot-password/page.tsx
    reset-password/page.tsx           # mock: no real token/email flow

  (app)/
    layout.tsx                        # AppShell: Sidebar + Topbar, auth-gated
    dashboard/page.tsx
    question-bank/page.tsx            # filters live in URL search params
    custom-test/new/page.tsx
    bookmarks/page.tsx
    wrong-questions/page.tsx
    history/page.tsx
    statistics/page.tsx
    subscription/page.tsx
    profile/page.tsx

  practice/
    layout.tsx                        # minimal focused chrome — sibling to (app), NOT nested in it
    [sessionId]/
      page.tsx                        # "/practice/[sessionId]?i=<index>" the solving screen
      results/page.tsx                # "/practice/[sessionId]/results"
```

The key structural decision here is that `practice/` sits at the same level as `(app)` and `(marketing)` rather than being nested inside `(app)`. This is what allows it to have its own minimal layout — described under Navigation & App Shell below — while still sharing the root layout, without the practice screen ever picking up the sidebar and topbar chrome that every other logged-in page uses.

### Question-Solving as a Session, Not a Single-Question Route

A second important structural decision is that question-solving is modeled around a **session**, not a single-question page. A `TestSession` is shaped as `{ id, mode, questionIds[], config, flags, attempts }`, and every entry point into practicing questions — browsing the question bank, launching a custom test, resuming bookmarks, resuming wrong questions, or clicking a row in a results list — funnels into creating (or reusing) a session and redirecting to `/practice/[sessionId]`.

Concretely: clicking a row in the Question Bank results starts a session containing the entire current filtered result set, positioned at the clicked question. Submitting the Custom Test builder creates a session with `mode: 'custom-test'` and `config.timed`. The "Practice these" buttons on Bookmarks and Wrong Questions each create a session from that respective list. The current position within a session is tracked as a URL search parameter (`?i=4`), so it is shareable and survives a refresh. Finishing a session redirects to its results page, and the History section lists every completed session — both plain practice and custom-test — with a badge indicating which type it was.

## Navigation & App Shell

The product uses four distinct navigational contexts, each with a shell deliberately scoped to what that context needs:

- **Marketing shell.** A sticky header carrying the logo, anchor links to sections of the landing page, and Login/Sign Up buttons. The footer uses a column layout, and further down the landing page there is a small "Coming Soon: Courses · PDFs · Notes" strip that signals the broader future product surface described in [Product Vision](./01-product-vision.md) without implying any of it exists yet.
- **Auth shell.** A centered `AuthCard`, showing only the logo, a link back to the marketing homepage, and a toggle link between the login and signup forms — deliberately free of any app navigation.
- **App shell.** A collapsible left sidebar paired with a topbar, gating every logged-in, non-practice page. The sidebar's sections, in order, are: Dashboard, Question Bank, Custom Test, Bookmarks, Wrong Questions, History, Statistics — then a divider — Subscription, Profile. At medium widths the sidebar collapses to an icon-only rail, and on mobile it becomes a slide-over Sheet. The topbar carries the page title or breadcrumb on the left, and a streak chip, plan badge, and avatar dropdown on the right.
- **Practice shell.** This is deliberately the most minimal of the four. It consists of a single slim top bar: an exit / "Save & Exit" control and the logo mark on the left, "Question 7 of 20" together with a thin progress bar in the center, and — when the session is timed — a timer alongside bookmark and flag quick-icons on the right. There is no sidebar and no footer. The reading content itself sits in a single column capped at roughly 720–760px and centered on the page, which is the single highest-leverage readability decision on this screen. A sticky `PracticeActionBar` at the bottom of the screen holds Previous, Next, Submit, and Finish controls, plus a trigger for the `QuestionPalette` — a popover grid, color-coded for answered/flagged/unanswered/current, that is deliberately kept on-demand rather than permanently visible on screen, as a quieter alternative to how competitor products handle the same idea. Keyboard shortcuts are supported throughout this screen (1–4 to select an option, Enter or N for next, P for previous, B to bookmark, F to flag) and are discoverable via a small "?" popover rather than being hidden.

## Component Structure

Components are organized by concern into the following folders: `components/ui` (the shadcn primitives), `components/layout` (`Sidebar`, `SidebarNav`, `Topbar`, `MarketingHeader`, `MarketingFooter`, `AuthCard`, `PracticeTopbar`), `components/marketing`, `components/practice`, `components/question-bank`, `components/dashboard`, `components/history`, `components/statistics`, `components/subscription`, and `components/common`.

The key reusable components built across these folders are: `QuestionCard`, `OptionButton` (with default, selected, correct, incorrect, and muted/disabled states), `ExplanationPanel`, `ProgressIndicator` (via shadcn's `Progress`), `QuestionPalette`, `PracticeActionBar`, `BookmarkButton`, `FlagButton`, `ReportQuestionModal`, `TimerDisplay`, `KeyboardShortcutsPopover`, `FilterPanel`, `MultiSelectPopover`, `ExamTabs`, `QuestionListRow`, `Sidebar`, `Topbar`, `StatCard`, `QuickActionCard`, `StreakWidget`, `SessionHistoryRow`, `TestSummaryCard`, `PricingCard`, `CurrentPlanBanner`, `SubjectPerformanceChart`, `AccuracyTrendChart`, `DonutBreakdown`, `EmptyState`, `PageHeader`, `SubjectBadge`, `ExamBadge`, `Logo`, and `FigurePlaceholder`.

**MCQ options are deliberately not built on shadcn's RadioGroup.** `OptionButton` is a plain button (with `role="radio"` for accessibility) so it can carry the richer set of visual states a solved question needs — default, selected-before-submit, correct, incorrect-selection, and muted-after-submit — which don't map cleanly onto a standard radio control's checked/unchecked states.

**Question Bank and Custom Test filtering are built on a custom `MultiSelectPopover`** (a `Popover` containing a `Checkbox` list), not shadcn's `Select`, because Year, Subject, and Topic all need multi-selection with a visible selected-count badge; `ExamTabs` (built on `Tabs`) remains single-select, since a student browses one exam context at a time.

One component is worth calling out specifically for its purpose rather than just its shape: `QuestionPreviewDemo`, which lives on the landing page. It is a genuinely interactive, unauthenticated mini-instance of the question-solving UI, built around a real question pulled from the seeded question bank — clicking an option produces an instant correct/incorrect result and reveals the explanation, without creating a real session. The intent is that this is materially more convincing to a prospective user than a static screenshot of the product would be.

A `SeedDemoData` component, mounted once inside the authenticated app shell, populates the practice-session and bookmarks stores with a handful of plausible completed sessions and bookmarks the first time the mock is used (see `lib/seed-demo-data.ts`), so the Dashboard, History, Statistics, Bookmarks, and Wrong Questions screens are never empty on a first visit. It never overwrites real activity — it only fills in stores that are still empty after localStorage rehydration completes.

## Mock Data Model

The mock prototype is built around the following core TypeScript entities:

- **Exam** — `id`, `name`, `shortName`, `description`, covering NEET-PG, FMGE, and INI-CET.
- **Subject** — `id`, `name`, `slug`, and `group`, where `group` is one of pre-clinical, para-clinical, or clinical; this grouping is what drives the grouped filter UI in the question bank.
- **Topic** — `id`, `subjectId`, `name`.
- **Option** — `id`, `text`, `imageUrl` (present in the type for forward-compatibility; unused by the seeded content, which relies on `stemFigure`/`explanationFigure` instead — see below).
- **Question** — `id`, `examId`, `year`, `subjectId`, `topicId`, `stem`, `stemFigure`, `options`, `correctOptionId`, `explanation`, `explanationFigure`, `difficulty`.
- **BookmarkEntry** — `id`, `questionId`, `createdAt`; bookmarks are persistent and independent of any particular session.
- **Attempt** — `questionId`, `selectedOptionId`, `isCorrect`, `timeSpentSec`, `answeredAt`.
- **TestSession** — `id`, `mode` (one of `browse`, `custom-test`, `bookmarks`, `wrong-questions`), `label`, `filters`, `questionIds`, `config` (including whether the session is timed and its duration in seconds), `flags`, `attempts`, `startedAt`, `completedAt`.
- **UserProfile** — `id`, `name`, `email`, `avatarUrl`, `targetExamId`, `joinedAt`, `currentPlanId`, `streakDays`, `lastActiveAt`.
- **SubscriptionPlan** — `id`, `name`, `tagline`, `priceMonthly`, `priceYearly`, `entitlements` (comprising `examIds` and `features`), `highlight`.

**Images are modeled as stylized placeholders, not real image files.** Rather than `stemImageUrl`/`explanationImageUrl` string fields pointing at real (or stock) images, a question carries an optional `stemFigure` / `explanationFigure` of shape `{ kind: FigureKind, caption: string }`, where `FigureKind` is one of `xray`, `ct`, `histology`, `ecg`, `clinical-photo`, `diagram`, or `chart`. A `FigurePlaceholder` component renders this as a clearly-labeled placeholder card (an icon matching the modality, a label, and the caption) rather than an actual radiograph, slide, or photo. This was a deliberate implementation choice: it satisfies the "images where required" requirement from [V1 Scope](./02-v1-scope.md) without needing real (and potentially license-encumbered) medical imagery for a mock, while still exercising the layout and information a real image would eventually occupy.

A deliberate modeling choice here is that wrong-question lists and all statistics are **derived, not stored**. They are computed by selector functions (`getWrongQuestions`, `getStatistics`, `getSessionSummary` in `lib/selectors`) operating over `Question[]`, `TestSession[]` (which carry the attempts and flags), and `BookmarkEntry[]`, rather than being written and maintained as their own persisted records. This avoids the class of bugs that comes from having the same fact — for example, "was this question answered incorrectly" — represented in two places that can drift out of sync.

On seeding volume: all nineteen MBBS subjects are present with full metadata and topics, so that filtering feels realistic across the entire subject list. Six "hero" subjects — General Medicine, General Surgery, Pathology, Obstetrics & Gynaecology, Pediatrics, and Pharmacology — carry roughly 16 questions each; the remaining thirteen subjects carry roughly 7 each, for a seeded bank of about 187 original questions in total, each with a mix of difficulty levels and a spread across all three exams and the last five years, with a subset carrying a `stemFigure`/`explanationFigure`. These hero subjects back the landing-page demo and the default custom-test flows. All seeded content is original, textbook-standard-fact medical-exam-style text — it is never scraped or reproduced from real NEET-PG, FMGE, or INI-CET content, nor from any competitor's content, consistent with the content-integrity principle described in [Product Vision](./01-product-vision.md) and [Content Pipeline](./04-content-pipeline.md).

## State Management

State is managed with **zustand** rather than React Context, because the state that changes most frequently in this product — a practice session's per-question answers, flags, and a possibly-ticking timer — updates often enough that Context would trigger broad, unnecessary re-renders across the tree.

The stores are:

- **`useAuthStore`** — holds a mock `isAuthenticated` flag and the current `UserProfile` (including `currentPlanId`); `login`, `signup`, `logout`, and `updateProfile` simply set local state (and persist it to `localStorage`) rather than talking to any real backend. **Implementation note:** plan changes are handled here too, via an `upgradePlan(planId)` action on this same store, rather than through a separate subscription store — since the mock's only subscription state is "which plan id is the current user on," folding it into the profile avoided a second store with almost nothing in it. A real backend-backed implementation would likely still want subscription/entitlement state to live in its own service, per [Architecture](./03-architecture.md); this is purely a mock-stage simplification.
- **`usePracticeStore`** — holds the record of sessions and exposes `createSession`, `submitAnswer`, `toggleFlag`, and `finishSession`. This store is persisted via zustand's `persist` middleware to `localStorage`, and it is the single source of truth that history, wrong-questions, and statistics all read from.
- **`useBookmarksStore`** — holds a persisted `BookmarkEntry[]` and a `toggleBookmark` action.

Every persisted store exposes a `hasHydrated` flag (set once zustand's `persist` middleware finishes reading from `localStorage`), and every page that reads one of these stores waits for it before rendering real content — otherwise a page could briefly flash the store's default empty state before the real persisted data loads. A shared `safeLocalStorage` helper (`store/persist-storage.ts`) makes the underlying storage a no-op during server rendering (where `localStorage` doesn't exist) and the real `window.localStorage` in the browser, so the same store code works in both environments without special-casing.

Derived data — `getWrongQuestions`, `getStatistics`, `getSessionSummary`, and similar — is computed via plain selector functions rather than being kept in its own store, consistent with the "derived, not stored" principle described in the data model section above.

Separately, URL search parameters are treated as the source of truth for anything that should be navigable or shareable — question-bank filters and the current question index within a session both live there rather than purely in a store. One practical benefit of this, combined with everything being in-memory mock data, is that question-bank filtering can update instantly against in-memory arrays with no network round-trip at all.

Finally, the mock is deliberately built to make a later transition to a real backend cheap: all data access is wrapped behind small functions — `getQuestions(filters)`, `createTestSession(config)`, `submitAnswer(...)`, and similar — that are written as `async` even though today they resolve synchronously against local arrays and stores. Because call sites already `await` them, swapping their internals for real `fetch()` calls against the future NestJS backend described in [Architecture](./03-architecture.md) will require no changes at the component or page level.

## Design Tokens

**Color.** The palette centers on a deep ink-navy as the primary color — trustworthy and academic, used sparingly rather than covering large surfaces — set against a warm off-white "paper" background rather than a stark white, which is meant to evoke a printed journal and is easier on the eyes across long study sessions. A full cool-gray neutral scale handles borders, secondary text, and surfaces. A single restrained amber/gold accent is used for premium, streak, and highlight moments, deliberately avoiding both the purple/pink gradients common in ed-tech products and green as a primary color, which would lean into the medical-cross cliché. Correct and incorrect states use a muted, emerald-leaning green and a muted terracotta/brick red respectively, rather than saturated pure red or green — calmer choices that hold up better across the hundreds of repeated exposures a student sees them in a single study session. The total palette is kept to roughly six or seven named colors; that restraint is itself part of the premium signal.

**Typography.** The type system is deliberately split into two tiers. "Reading" contexts — the question stem, its options, its explanation, and long-form marketing copy — use `Source Serif 4` at a larger base size of 17–18px with a generous 1.6–1.7 line-height. Using a serif for the reading surface is a deliberate differentiator from Marrow and PrepLadder, both of which are sans-serif throughout, and it reinforces an "academic journal" positioning while genuinely reducing eye strain across long reading sessions compared to a sans body set at length. "UI/data" contexts — the sidebar, tables, stat cards, and filters — instead use `Plus Jakarta Sans`, a geometric-humanist sans chosen specifically to avoid the generic "Inter on every SaaS product" look, at weights 500/600/700 for navigation, buttons, stat numbers, and headings, set at a tighter 14–15px base for information density. Headings follow a modular scale of roughly 1.2–1.25. A small, deliberately sparing accent role is reserved for `JetBrains Mono`, used only for timer, score, and streak numerals, as a "precision instrument" touch.

**Spacing and layout.** The project uses Tailwind's default 4px-based spacing scale, with generous vertical rhythm on marketing sections. App content is capped at a max-width of roughly 1200–1280px, alongside a fixed 260px sidebar (72px when collapsed to its icon rail). The practice screen's reading column is capped at 720–760px and centered regardless of viewport width — as noted above, the single highest-leverage readability decision on that screen. Surfaces use crisp 8–12px corner radii rather than the "bubbly" 20px-plus radii seen elsewhere, favor flat surfaces with subtle borders over heavy drop shadows, and avoid gradients throughout except for possibly one restrained hero background treatment on the landing page.

## Assumptions & Open Questions

The following assumptions are treated as settled for this stage of the project but are worth surfacing explicitly, since several of them are the kind of thing a stakeholder should be able to confirm or challenge:

- **Dark mode** is not fully polished in v1, but `next-themes` and the CSS-variable token system are wired in from day one specifically so that a proper dark mode is a cheap follow-up rather than a retrofit.
- **Responsive scope** is desktop-first and desktop-primary, reflecting that this is fundamentally a laptop-session study product. The layout is fluid enough that it should not visibly break on a tablet, but there is no dedicated mobile-app-grade polish pass for this web mock — the real mobile experience is expected to come from the separate Flutter app described in [Architecture](./03-architecture.md), not from a fully mobile-optimized web build.
- The project is a **single Next.js app using route groups**, rather than a separate marketing subdomain, purely for simplicity at this stage; this can be split apart later if there is a reason to.
- **Auth is entirely mock.** There is no real password hashing, session handling, or JWT issuance; signup and login accept any input and simply set local state, and the forgot/reset-password flow is a UI-only simulation with no real email being sent. None of this should be treated as security-reviewable — it is a UI stand-in, not a real authentication implementation, consistent with the "Current Stage" description in [V1 Scope](./02-v1-scope.md).
- **Subscription and payment are UI-only.** Clicking "Upgrade" or "Switch plan" simply calls `upgradePlan()` on `useAuthStore`, flipping local state; there is no real billing integration behind it.
- **Content originality** is a hard requirement even for placeholder content: every seeded question must be original or clearly placeholder-style, never copied from real exam banks or from competitor products, in keeping with the content-integrity principle in [Product Vision](./01-product-vision.md).
- **Images** are represented as stylized placeholders (see `FigurePlaceholder` in the Mock Data Model section above) rather than real image files, specifically to avoid needing licensed medical imagery for a mock; a real image upload and CDN pipeline is out of scope for the mock.
- **Internationalization** is not attempted — the product is English-only for v1.
- **Testing** does not require an automated test suite at this pure-UI prototype stage, beyond type-checking and linting.
- The **practice-session timer**, despite everything else being mocked, can be genuinely functional as a real client-side countdown, since it requires no backend dependency to work correctly.
