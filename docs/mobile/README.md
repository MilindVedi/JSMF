# JSMF Med Prep — mobile app (`mobile/`)

The Android + iOS app for the PYQ product (the same product as `web/`), built with **Expo SDK 57** (React Native 0.86, React 19.2.3), **Expo Router**, **NativeWind 4** and the shared **`@jsmf/core`** package. It talks to the same NestJS backend and the same platform-wide JSMF account as web, jsmf.me and the store.

| | |
|---|---|
| App name | JSMF Med Prep |
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

Tabs: **Home · Practice · Revision · Stats · Profile**. Pushed screens: practice runner, results, review, custom test, history, bookmarks, plan, legal documents. Auth screens: sign in, sign up, forgot / reset password, and the Google callback landing.

| Area | What it does (mirrors web) |
|---|---|
| Home | Onboarding variant for a brand-new account (no session ever created), otherwise the dashboard: stat cards, continue / last-session card, streak card, quick actions, recent activity, focus areas. |
| Practice | The question bank: status tabs, exam / year / subject / topic / collection filters (bottom sheets), debounced search, sort, a list that loads more as you scroll, "Practice these questions"; links to Custom test and History. |
| Custom test | Count presets + stepper, optional timer with realistic / balanced / relaxed pace + stepper, then include / ordering / name in the confirm dialog. |
| Practice runner | One question per screen; Submit shows the verdict and explanation; bookmark, flag, report, palette sheet; Previous / Next buttons. |
| Test mode | A timed custom test opens the **exam console**: exam title, candidate name, Time Left (warning colour in the last 5 minutes, auto-submit at zero); Answered / Not Answered / Not Visited / Marked for Review / Answered & Marked counts under the header; the legend + jump grid in a bottom sheet; Mark for Review & Next, Clear Response, Previous, Save & Next, Submit with the counts dialog. Clear Response follows web's rule — there is no un-answer API, so it only drops a choice that has not been saved. |
| Results / Review | Accuracy, tiles that filter the question list, subject breakdown; review with All / Correct / Incorrect / Unattempted, a strip of questions and wrapping Previous / Next. |
| Revision | Needs Practice (Wrong / Never corrected / By subject), Bookmarked, Your Collections, Reinforce — each with exam / year, date window, search, sort and "Practise N". (Web's calendar custom range is not offered on the phone; the presets are.) |
| Stats | Overview tiles, coverage (tap for per-subject coverage), subject-wise accuracy bars, correct / incorrect / unattempted ring, accuracy-over-time line chart (react-native-svg), links onward. |
| Profile | Rename (the shared account name), email read-only, plan read-only, target exam, daily goal, legal links, contact support, sign out, request account deletion. |
| Streak | Header chip on every tab (hidden at 0 days, as web), home streak card, and the daily-goal celebration: the badge pops with embers where the goal was reached (in place on the practice screens) or flies on an arc into the header chip, which pulses on landing; milestones ring. The flame is always fire-coloured; the box takes the tier colour. Reduce-motion skips the flicker, embers and flight. |
| Legal | Terms / Privacy / Refund screens fetched from `legal/documents/:type?app=PYQ` and drawn with core's parsers. The acceptance gate opens when `legal/me` reports a document as `required`, and again whenever the API answers 403 `LEGAL_ACCEPTANCE_REQUIRED`: unticked boxes, Accept disabled until all are ticked, recorded with `app: "PYQ"`, the documents readable inside the gate, Sign out as the only other way out. A minor update shows a dismissible notice instead. |

## What is shared and what is app-only

**Shared — `packages/core` (`@jsmf/core`), used unchanged by web and mobile:** the API client and token refresh, the **auth session** (`createAuthSession`: login, signup + exam preference, Google code exchange, password reset, restore, logout, rename), every react-query hook, query key and optimistic update, the data-source port and API adapter, domain types and rules (streak tiers, exam statuses, question sort, session labels, results / review navigation, history sort, custom-test counts and paces, revision date windows), legal parsing and fetching, zod auth schemas.

Moved into core in this step (web now uses them too, behaviour unchanged): the API half of web's auth store (`api/session.ts`); session / results / review helpers (`domain/sessions.ts`); history sort and the session scope line (`domain/history.ts`); custom-test and revision rules (`domain/practice-rules.ts`); the legal gate's checkbox wording and load-error text; `legalApi.document()`; and a new `useInfiniteQuestions` hook.

**Mobile only — `mobile/src`:**

- `lib/core.ts` — `configureCore` with the absolute API URL, the **secure store** for the refresh token (`lib/storage.ts`: expo-secure-store on phones, localStorage on Expo web), toasts for failed writes, and the legal-required signal.
- `lib/auth-store.ts` — a small zustand mirror of core's auth session for the navigation guard (`Stack.Protected`).
- `lib/google-auth.ts` — Google sign-in via `expo-web-browser`.
- `lib/streak.ts` — the celebration coordination (which day was celebrated is kept in the secure store).
- `theme/` — `palette.json` (hex copies of web's oklch tokens, light and dark, plus streak tier colours) feeding NativeWind through CSS variables; system light/dark.
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
