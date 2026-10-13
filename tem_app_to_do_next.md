# JSMF Med Prep — mobile app: what's next

Status as of 11 October 2026. Nothing below is committed yet.

## Where things stand

- The Expo app lives in `mobile/` (Expo SDK 57, React Native 0.86). It is part of the npm workspace alongside `packages/core` and `web/`.
- Setup and run instructions: [docs/mobile/README.md](docs/mobile/README.md).
- **Built:**
  - five tabs: Home, Practice, Revision, Stats, Profile;
  - email sign-up and sign-in, plus Google sign-in;
  - question bank with filters, and practice with instant explanations;
  - the exam-style timed test (five status counts, Save & Next, Mark for Review, Submit), with results and review;
  - custom tests, history, bookmarks, and statistics with charts;
  - streak celebration;
  - Terms, Privacy and Refund pages, and the legal acceptance gate;
  - light and dark mode.
- **No buying anywhere in the app**, by decision. There are no prices and no buy links. When the free daily limit is hit, the app says "Come back tomorrow".
- **Shared with the website through `packages/core`:**
  - sign-in and sessions, and all data access;
  - results wording, custom-test rules, revision and history logic;
  - legal text.
- **Verified:**
  - the code compiles in mobile, core and web;
  - the web build passes, and the production web Docker image builds and serves;
  - both the Android and iOS bundles build;
  - a full phone-size run in the web preview passed, with no errors.
- **Not verified yet:**
  - real iOS and Android devices or emulators;
  - Google sign-in end to end;
  - the legal gate opening;
  - the badge flying to the header chip;
  - the daily-limit message.

## Before store submission (your actions)

1. **Sign in with Apple.** Apple requires it because the app offers Google sign-in. It needs a backend endpoint first, which I can build. The hook point is `mobile/src/lib/apple-auth.ts`.
2. **Account deletion.** It is currently an email request to support@jsmf.me. Apple accepts that only if requests are actually handled. Google Play also wants a web page where users can request deletion.
3. **Backend config:** add `jsmfmedprep://auth/callback` to `OAUTH_ALLOWED_REDIRECTS`.
4. **Google sign-in on phones** needs a development build, because it does not work in the plain Expo Go app.
5. **Accounts:** create an Apple Developer account ($99/year) and a Google Play Console account ($25 one-time), then an EAS project. Fill in the real API URLs in `mobile/eas.json`.
6. **Refund policy:** check that its PYQ section has no "buy on our website" wording, because the app shows it.
7. **First device run:** check the bottom tab labels. They sit close to the edge in the web preview.

## Known follow-ups

- **Two React versions.** Web pins React 19.2.8, while Expo needs 19.2.3. Metro forces one copy into the app bundle, so it works. `expo-doctor` still flags it (17/18). It goes away once both use the same version.
- **Android security.** Another installed app could claim the `jsmfmedprep://` sign-in address. The proper fix is verified App Links on `pyqs.jsmf.me`.
- **Left out on phones for now:**
  - custom date ranges in Revision and History (presets only);
  - sliders in Custom test (steppers instead);
  - profile photo upload.

## Also open (website and backend)

- **Re-import the Cloud Build trigger:** `gcloud builds triggers import --source=web-trigger.yaml`. The web image now builds from the repo root. Watch the first Cloud Build after pushing.
- **Set `BACKEND_API_URL` on Cloud Run `jsmf-web-pyqs`.** Without it, the PYQ legal pages show "could not be loaded".
- **Review migrations before committing:**
  - `20261011120000_pyq_read_models`
  - `20261011140000_legal_documents`
- **Unfinished review.** It stopped at the usage limit. These areas have not been reviewed yet:
  - the legal system;
  - the PYQ backend and caching;
  - the shared-code move;
  - legal pages and auth forms;
  - deploy config;
  - the mobile app.
- **Minor issues:**
  - "already celebrated today" is remembered per browser, not per account;
  - the flag rollback can be wrong if two quick changes to the same question both fail.
- **Exam patterns (step 2 of the exam screen):** per-exam sections, section locking and marking. This needs a database change, to be reviewed before building.
- **jsmf.me activity analytics** (built, not deployed):
  - Review migration `20261011160000_analytics_events` before committing. It adds one new table and needs the legal migration deployed first.
  - After deploying, add the analytics sentence to the Privacy Policy through Admin → Legal → Privacy. A minor version is enough; the text is in [docs/analytics/README.md](docs/analytics/README.md).
  - Results show in Admin → Analytics.
  - To turn analytics off: set `ANALYTICS_ENABLED=false` on the backend. No rebuild needed.
  - Share UTM-tagged links on Telegram and Instagram, because those apps strip the referrer.
- **Question sourcing pipeline:** recall PDFs and a student recall form → extract → group by concept → confidence score → AI draft → doctor review → publish.
- **Two decisions pending:**
  - whether a streak day should require the daily goal (today, one answer counts);
  - whether to remove or move the second "Note for Angad" on the custom-test page.
- **One-to-one mentorship calls** (built, not deployed). Details in [docs/mentorship/README.md](docs/mentorship/README.md).
  - Review migration `20261013120000_mentorship` before committing. It is additive and uses the bundled `btree_gist` extension.
  - Set these on the backend Cloud Run service:
    - `MENTORSHIP_ADMIN_NOTIFY_EMAIL=milindvedi80@gmail.com`
    - optionally `MAIN_WEBSITE_URL`, `MENTORSHIP_HOLD_MINUTES`, `MENTORSHIP_REMINDER_LEAD_MINUTES`.
  - Deploy the backend before main-web and pdf-web.
  - In Admin → 1:1 calls: create the offering, set the weekly hours, then publish. Until it is published, nothing changes on jsmf.me.
  - Add a 1:1 line to the Refund Policy through Admin → Legal (reschedule up to 24h before; cancellations through support).
