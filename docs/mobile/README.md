# JSMF PYQs — mobile app (`mobile/`)

The Android + iOS app for the PYQ product (the same product as `web/`), built with **Expo SDK 57** (React Native 0.86, React 19.2.3), **Expo Router**, **NativeWind 4** and the shared **`@jsmf/core`** package. It talks to the same NestJS backend and the same platform-wide JSMF account as web, jsmf.me and the store.

| | |
|---|---|
| App name | JSMF PYQs |
| Slug / scheme | `jsmf-med-prep` / `jsmfmedprep` |
| Bundle id / package | `me.jsmf.medprep` (iOS and Android) |
| Workspace | `mobile` is an npm workspace of the repo root, next to `packages/*` and `web` |

## Running it

Install once from the **repo root** (never inside `mobile/`):

```bash
npm install
```

Then, from `mobile/`:

```bash
npx expo start            # Metro + QR code; press a / i / w for Android / iOS / web
npx expo start --android  # opens an Android emulator if one is running
npx tsc --noEmit          # typecheck
npx expo-doctor           # dependency / config checks (see "Known doctor warning")
npx expo export --platform android   # production bundle, no device needed
```

**Expo Go vs a development build.** Everything except Google sign-in works in Expo Go: the app only uses native modules Expo Go ships (secure store, web browser, fonts, reanimated, svg, safe area, gesture handler). Google sign-in needs a **development build** (`npx eas-cli@latest build --profile development`, or `npx expo run:android` / `run:ios` locally) because Expo Go's deep link is an `exp://…` URL that the API will not redirect to — see "Google sign-in" below.

### Pointing the app at the backend

| Variable | Meaning | Default |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | The backend's **absolute** URL, ending in `/api`. Public (inlined into the bundle) — never a secret. | `http://localhost:4000/api` |
| `EXPO_PUBLIC_CLIENT_ERRORS_ENABLED` | Crash reports (JS errors and screens that crash) sent to the backend's `POST /client-errors` — see [Observability](../observability/README.md). `"false"` turns them off. | *(unset — on)* |

Where the backend is from the device's point of view:

| Device | `EXPO_PUBLIC_API_URL` |
|---|---|
| iOS simulator, or Expo web on the same computer | `http://localhost:4000/api` |
| Android emulator | `http://10.0.2.2:4000/api` (the emulator's alias for the host) |
| A real phone on the same Wi-Fi | `http://<your computer's LAN IP>:4000/api` |
| Preview / production builds | set per profile in `mobile/eas.json` (placeholders now) |

Put it in `mobile/.env.local` (ignored by git) or prefix the command: `EXPO_PUBLIC_API_URL=http://10.0.2.2:4000/api npx expo start`.

**Expo web and CORS.** A phone app has no CORS. Expo web (handy for quick checks) does: it runs on `localhost:8081`, which the backend's `CORS_ORIGINS` does not list. Either add the origin to your *local* `backend/.env`, or put a same-origin proxy in front (what the automated test run did — see "How it was verified").

## Screens (V1)

Tabs (a floating bar, November 2026 redesign): **Dashboard · PYQs · Custom Test · Revision · My Progress**. Every tab opens with the brand lockup (logo, "JSMF PYQs", "Jab Studies Met Fun"), the streak chip and a violet avatar button that opens **Profile**. Pushed screens: Profile, practice runner, results, review, bookmarks, reinforce, plan, legal documents. `/history` redirects to My Progress (History). Auth screens: sign in, sign up, forgot / reset password, and the Google callback landing.

| Area | What it does (mirrors web) |
|---|---|
| Dashboard (`/home`) | Onboarding variant for a brand-new account (no session ever created: the selected exam on the violet hero, "Start your first practice"), otherwise: the violet **next session** hero (session in progress with a % done ring and Resume, or "One question closer." with the last session's score ring), four stat tiles (wrong questions tinted red), today's goal, "Your study tools" (Question Bank, Custom Test, Revision, Bookmarks), recent activity (score pills), focus areas (score bars). |
| PYQs (`/practice`) | The question bank: search, status chips, exam / year / subject / topic / collection filters (bottom sheets), sort, a list of question cards ("FMGE 2025" pill, subject, the stem, "Solve →", bookmark and collection in place) that loads more as you scroll, "Practice these questions". |
| Custom Test (`/custom-test`) | A **Full mock test** card (each exam whose pattern is on and whose bank can fill it), then count presets, a slider and a typed number (as web), optional timer with realistic / balanced / relaxed pace, a slider and typed minutes, then "Start N-question test"; include / ordering / name in the confirm dialog. |
| Practice runner | One question per screen; Submit shows the verdict and explanation; bookmark, flag, report, palette sheet; Previous / Next buttons. |
| Test mode | A timed custom test opens the **exam console**: exam title, candidate name, Time Left (warning colour in the last 5 minutes, auto-submit at zero); Answered / Not Answered / Not Visited / Marked for Review / Answered & Marked counts under the header; the legend + jump grid in a bottom sheet; Mark for Review & Next, Clear Response, Previous, Save & Next, Submit with the counts dialog. Clear Response follows web's rule — there is no un-answer API, so it only drops a choice that has not been saved. Every test first shows the **instructions** with "I am ready to begin" (the clock starts there); a full mock adds a section strip, the running section's own clock and palette, and moves on by itself when a section's time ends. Same rules as web: [exam-mode.md](../pyq/exam-mode.md). |
| Results / Review | Accuracy (and, for a full mock, marks and a per-section breakdown), tiles that filter the question list, subject breakdown; review with All / Correct / Incorrect / Unattempted, a strip of questions and wrapping Previous / Next. |
| Revision | Four tiles (Wrong, Bookmarked, Collections, Reinforce — each opens its section), then collapsible section cards: Needs practice (Wrong / Never corrected / By subject), Bookmarked, Your collections, Reinforce — each with a recent / By subject switch, exam / year, date window (presets or a **custom range** on a calendar sheet, as web), search, sort, compact question cards and "Revise these N" (kept in the By-subject view for Bookmarked / Collections / Reinforce, as web). Reinforce's "View all" opens the **Reinforce** screen (All correct / Recently correct / Not revisited, as web's /reinforce). |
| My Progress (`/progress`) | History and Statistics behind one switch (`?view=history|statistics`). History: totals, session type chips, All time / 30 / 7 days / **custom range**, sort, the sessions. Statistics: overall accuracy on the violet hero (ring in its score band), correct / incorrect / left, coverage (tap for per-subject coverage), subject-wise accuracy bars with the band legend, accuracy over time, the correct / incorrect / unattempted ring, links onward. |
| Profile (`/profile`, from the avatar) | Rename (the shared account name), email read-only, plan read-only, target exam, daily goal, legal links, contact support, Visit JSMF website, sign out, request account deletion. |
| Plan (`/subscription`) | The current plan, read-only, and **Start free trial** when the API offers one (`trialOffer`), as web. Buying stays on the website (store rules). |
| Streak | Header chip on every tab (hidden at 0 days, as web), home streak card, and the daily-goal celebration: the badge pops with embers where the goal was reached (in place on the practice screens) or flies on an arc into the header chip, which pulses on landing; milestones ring. The flame is always fire-coloured; the box takes the tier colour. Reduce-motion skips the flicker, embers and flight. |
| Legal | Terms / Privacy / Refund screens fetched from `legal/documents/:type?app=PYQ` and drawn with core's parsers, each with **Previous versions** (the archive list and earlier versions, marked as such). The acceptance gate opens when `legal/me` reports a document as `required`, and again whenever the API answers 403 `LEGAL_ACCEPTANCE_REQUIRED`: unticked boxes, Accept disabled until all are ticked, recorded with `app: "PYQ"`, the documents readable inside the gate, Sign out as the only other way out. A minor update shows a dismissible notice instead. |

### Kept in step with web (parity pass, November 2026)

A side-by-side audit of web and mobile found these differences, now closed on the phone:

- **Timed tests:** a test (or a full mock's section) reopened after its time ran out now auto-submits / moves on instead of showing no clock; Submit and time-up wait for an answer that is still saving, so it counts; Save & Next keeps the review mark when the daily limit stopped the save.
- **Results and history:** a full mock's results show the per-section marks; history rows show a full mock's marks; history can filter by collection.
- **Fresh data:** tabs stay mounted on a phone, so screens now refetch what a write marked stale when they come back into view (the question bank's statuses and tabs after a session, home, revision, stats, history, bookmarks).
- **Streak:** the header chip no longer freezes on yesterday's count after the celebration; Home no longer celebrates behind a practice session; a 0-day streak shows web's dimmed, smouldering flame.
- **Errors:** a screen that crashes shows the error screen in its own place (the rest of the app keeps working) with **Try again** and **Go home**; unhandled promise rejections are crash-reported in release builds; a failed legal acceptance shows its error inside the gate; the Google callback screen no longer spins forever when the in-app flow ends without signing in.

A second pass closed the smaller differences:

- **Home:** web's masthead — the streak eyebrow and the check-in line ("3 of 10 done today — 7 to go."), now shared from core (`streakCheckInLine`, `streakEyebrow`) so both apps say the same thing — and the exams pill; stat cards with web's hints and no "10/187" fraction; Today's goal with one pip per question (a bar past 24); the chip and badge breathe at the hotter tiers and the chip glows (iOS); the first-run hero waits for the saved exam instead of assuming NEET-PG.
- **Revision and stats:** Stats → Wrong / Collections opens Revision on that section, expanded and scrolled to (`/revision?section=…`), and the tiles do the same; By subject keeps the chosen sort; correct bookmark empty-state wording, "View all N bookmarks" only past 5; "+N more" under a long collection; "Go to Question Bank" on the empty Needs Practice list; tap the accuracy chart to read a test's values; History has the Unattempted tile and its Retry reloads both queries.
- **Exam console:** an **Instructions** button reopens the instructions mid-test; section tabs show question counts and say why a tab is locked; web's fuller instructions copy (negative marking, palette jump, answers changeable until submit) and the candidate on the begin screen; the full-mock dialog stays open with its spinner until the mock is created ("Continue to instructions"); opened-but-unsaved questions stay **Not Answered** after the OS kills the app (kept in AsyncStorage per session, removed on submit).
- **Legal:** **Previous versions** under each document, the versions list, and an earlier version with web's banner (`legal/[slug]/versions`, `legal/[slug]/v/[version]`, using core's new `legalApi.versions` / `legalApi.version`); an in-document link to a website-only page reads as plain text instead of a dead link; the minor-update notice can no longer be pushed out of the toast queue by later toasts.
- **App shell:** an unknown route or deep link shows the app's own "This page doesn't exist" screen (`+not-found.tsx`) instead of expo-router's developer screen, and `/_sitemap` redirects home; after a lost session, signing in again returns to the screen the student was on (web's `?next=`); React Query pauses while the phone is offline and reloads on reconnect (`expo-network`); a failed "load more" in the question bank keeps the loaded rows and offers Try again; "Member since" is a per-user query (`pyqKeys.memberSince`, web too) so switching accounts never shows the last one's; exam chips wrap on sign-up and profile; text fields carry their label for screen readers.
- **Crash reports:** the reporter is installed from `mobile/index.js` (the app's entry, before any app module loads), queued reports are sent when the app goes to the background, and a screen that crashes on its first render is reported under its own route.

New native dependencies: `expo-network` and `@react-native-async-storage/async-storage` (installed with `npx expo install`). They need a fresh development / store build — nothing has been released yet, so there is no over-the-air update to break.

The free trial can be started on the phone (no money changes hands); buying a plan stays website-only (store rules on digital goods) — product decision, November 2026.

### Look (November 2026 redesign)
Built from the design mockup, in the shared pieces so every screen follows: the brand gradient (`brand-deep` → `primary`) on the main buttons, the tab bar's active pill and the hero cards; lavender (`accent`) shortcut tiles; white cards with a hairline border; pill chips for every one-of-several choice (`Segmented`); headings in Sora with a violet full stop.

**Score colours.** A score — accuracy on a bar, ring or pill — is coloured by core's `scoreBand`, never purple: red under 40% (Needs improvement), amber 40–69% (Developing), green 70–84% (Good), deep teal 85–100% (Excellent). The `band-*` tokens are in `palette.json` (the website has the same values in `globals.css` and uses the same bands); `components/ui/score.tsx` has `ScoreBar`, `ScorePill`, `BandLegend`. Plain progress (coverage, today's goal, a session's progress) stays the brand purple `ProgressBar`.

**Motion (calm).** Buttons, cards, chips and tabs give a little when pressed; a tab's parts rise in one after another when it opens (`motion/rise.tsx`); numbers count up; bars and rings fill; the tab pill glides. Nothing loops on its own. Everything is skipped under the phone's reduce-motion setting.

**Tab bar.** It floats over the page (as in the design): five equal slots, sized with plain style, with the gradient pill measured on the same row so it always sits exactly on its tab. Every tab's scroll view leaves `useTabBarClearance()` at its end so the last item clears the bar.

**Practice screen.** Back button, purple progress bar and "n/N" on top; the tag line "FMGE 2025 · subject · topic · difficulty · bookmark"; options with a lettered square that turn green / red after Submit (the right one pops, a wrong pick shakes); the explanation on a lavender panel with a violet edge; the next step as one big violet button beside Previous, palette and report. Same features and steps as the website (choose, then Submit).

**Rule — animated styles never share an element's `className` merge.** On a phone, NativeWind merges `className` and `style` into one object; a Reanimated animated style merged that way makes Reanimated drop every class (size, padding, background, flex). The web export uses plain CSS, so this never shows in browser screenshots — only on a device. `motion/animated.tsx`'s `AnimatedView` / `AnimatedPressable` take the animation in a separate `animatedStyle` prop; always use that, never put an animated style in `style` next to a `className`.

**Chip rows inside a card wrap** (`Segmented wrap`, `FilterBar wrap`); only full-width page rows scroll sideways edge to edge.

The redesign added no native module (gradients and the calendar are react-native-svg / plain views; the slider uses the installed gesture handler), so it ships without a new build.

## What is shared and what is app-only

**Shared — `packages/core` (`@jsmf/core`), used unchanged by web and mobile:** the API client and token refresh, the **auth session** (`createAuthSession`: login, signup + exam preference, Google code exchange, password reset, restore, logout, rename), every react-query hook, query key and optimistic update, the data-source port and API adapter, domain types and rules (streak tiers, exam statuses, question sort, session labels, results / review navigation, history sort, custom-test counts and paces, revision date windows), legal parsing and fetching, zod auth schemas.

Moved into core in this step (web now uses them too, behaviour unchanged): the API half of web's auth store (`api/session.ts`); session / results / review helpers (`domain/sessions.ts`); history sort and the session scope line (`domain/history.ts`); custom-test and revision rules (`domain/practice-rules.ts`); the legal gate's checkbox wording and load-error text; `legalApi.document()`; and a new `useInfiniteQuestions` hook.

**Mobile only — `mobile/src`:**

- `lib/core.ts` — `configureCore` with the absolute API URL, the **secure store** for the refresh token (`lib/storage.ts`: expo-secure-store on phones, localStorage on Expo web), toasts for failed writes, and the legal-required signal.
- `lib/auth-store.ts` — a small zustand mirror of core's auth session for the navigation guard (`Stack.Protected`).
- `lib/google-auth.ts` — Google sign-in via `expo-web-browser`.
- `lib/streak.ts` — the celebration coordination (which day was celebrated is kept in the secure store).
- `theme/` — `palette.json` (hex copies of web's oklch tokens, light and dark, plus streak tier colours and the score bands) feeding NativeWind through CSS variables; system light/dark.
- Every screen and component (React Native, not shared with web's DOM components).

### One React per app (monorepo note)

Web pins `react@19.2.8`; Expo SDK 57 needs exactly `react@19.2.3` (the renderer checks the version). npm hoists web's copy to the repo root and nests mobile's in `mobile/node_modules`. Packages hoisted to the root (`@jsmf/core`, `@tanstack/react-query`, parts of expo-router) would otherwise import web's React from the mobile bundle. `mobile/metro.config.js` therefore resolves `react`, `react-dom`, `react-native`, `react-native-web`, `@tanstack/react-query`, `react-native-reanimated`, `react-native-safe-area-context` and `react-native-svg` **as if imported from `mobile/`**, so the bundle contains exactly one copy of each (verified: the web export contains only React 19.2.3). Web is untouched and keeps resolving its own.

NativeWind 4 needs Tailwind 3 while web uses Tailwind 4; npm keeps Tailwind 4 inside `web/` and the `@tailwindcss/*` packages, Tailwind 3 at the root. If a web build ever fails with `Cannot read properties of undefined (reading 'All')` from `@tailwindcss/postcss`, run `npm install` at the root and delete `web/.next`.

**Known doctor warning.** `npx expo-doctor` passes 17/18; the failing check reports the two React / React DOM versions above. That duplication is on disk only and deliberate; the Metro config above keeps a single copy in the app. Revisit when web and Expo land on the same React patch version.

## Store-rules decisions

- **No purchases in the app.** No plans, no prices, no buy / upgrade buttons, and no text or links pointing to buying on the website (Apple 3.1.1 / 3.1.3, Google Play payments policy). The Plan screen shows the current plan read-only. When the free daily allowance is used up the app says, neutrally, *"You've used today's free questions. Come back tomorrow."* — the server's own message mentions upgrading, so it is not shown.
- **Legal documents are server text.** Terms / Privacy / Refund are rendered as the backend publishes them for `app=PYQ`. Before submission, check the PYQ-visible sections contain no links or calls to action to buy elsewhere (the Refund policy is the one to read).
- **Account deletion.** Apple requires an in-app way to start deleting the account (Guideline 5.1.1(v)); Google Play requires one too. Profile → **Request account deletion** confirms and opens an email to `support@jsmf.me` with the account email and id. Apple accepts this only if the request is actually processed; a self-serve deletion endpoint (identity is platform-wide — the account also covers jsmf.me and the store) would be the stronger answer and needs backend work. Google Play additionally asks for a **web page** where users can request deletion; that URL goes in the Play Console data-safety form.

## Google sign-in

The app opens `{API}/auth/google/start?redirect=jsmfmedprep://auth/callback` with `WebBrowser.openAuthSessionAsync`, reads the single-use `code` from the returned URL and trades it with core's `authApi.googleExchange`. If the OS delivers the deep link to the app instead (a cold start on Android), the `auth/callback` screen exchanges it — never twice. The button appears only when `authApi.methods().google` is true, as on web.

## Before store submission — what you need to do

1. **Accounts:** an Apple Developer Program membership (paid) and a Google Play Console account (one-time fee).
2. **EAS:** `npx eas-cli@latest login`, then `npx eas-cli@latest init` in `mobile/` to create the EAS project (it writes `extra.eas.projectId` into the app config). `mobile/eas.json` has `development`, `preview` and `production` profiles with **placeholder** API URLs — replace `https://REPLACE-WITH-…/api` with the real staging / production API. No submission credentials are stored in the repo.
3. **Backend config:** add `jsmfmedprep://auth/callback` to the API's `OAUTH_ALLOWED_REDIRECTS` (each environment) — without it Google sign-in fails with a redirect error. Production builds call the API directly, so nothing is needed in `CORS_ORIGINS`.
4. **Sign in with Apple:** required on iOS because the app offers Google (Guideline 4.8). It needs a backend flow first; `mobile/src/lib/apple-auth.ts` is the marked hook point (no button is shown today). Until it exists, either ship iOS without the Google button or add Apple sign-in before the iOS review.
5. **Account deletion:** decide whether the email request is enough for launch (see above) and publish the deletion-request web page for Google Play.
6. **Store listing:** privacy policy URL, data-safety / privacy-nutrition answers (email, name, practice activity; no tracking), screenshots, age rating.
7. **Real devices:** run a development build on at least one Android phone and one iPhone — see "Not verified" below.

## How it was verified (Step 2)

- `npx tsc --noEmit` clean in `mobile/`, `packages/core` and `web/`; `next build` of web succeeds.
- `npx expo export --platform android` and `--platform ios` both bundle on Windows.
- The Expo web export was driven with Playwright at 390×844 against the real local API, through a test-only Node server that served the export and proxied `/api` on the same origin (no backend change): sign up → onboarding home → question bank + filter sheet → 10 practice answers with feedback (daily-goal celebration seen) → bookmark → palette → results → timed custom test → exam console (statuses updating, grid, Clear Response, submit dialog) → results → review → stats → revision → dashboard → history → profile rename → Terms → plan → sign out → sign in again; plus home and stats in dark mode. The throwaway accounts were deleted afterwards.

**Not verified:** real iOS / Android devices and simulators (no device or emulator was available), Google sign-in end to end, the legal acceptance gate (the local backend does not enforce acceptance, so it never opened), the badge's flight into the header chip (it only flies when the goal is reached away from the practice screens and Home), and the daily-limit notice.
