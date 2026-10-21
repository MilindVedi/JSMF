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
- **Buyers added by hand (offline sales)** (built, not deployed). Details in [docs/offline-sales/README.md](docs/offline-sales/README.md).
  - Review migration `20261016120000_offline_sales` before committing. It is additive: one table, two enums, one new `PaymentProvider` value. It also copies anyone the old script already added into the new list.
  - Deploy the backend before pdf-web. No env changes.
  - Then: store admin → Sessions → a session → **Buyers added by hand → Add buyers**.
- **Feedback forms (replace the Google Form)** (built, not deployed). Steps: [docs/main-website/admin-guide.md](docs/main-website/admin-guide.md). Reasoning and API: [docs/main-website/README.md](docs/main-website/README.md) §3f.
  - Review migration `20261018100000_feedback_forms` before committing. It is additive: four enums, six tables, and CHECK constraints. Nothing existing changes.
  - Deploy the backend before pdf-web and main-web.
  - Optional: set `FEEDBACK_LINK_SECRET` on the backend. Without it the key is derived from `STORAGE_SIGNING_SECRET`; changing either breaks links already emailed.
  - Needs the `session-reminders` Cloud Scheduler job below, which also sends the automatic feedback emails.
  - Check the Privacy Policy says feedback may be shown on the website, before showing replies there.
- **Home page and header changes** (built, not deployed; main-web only): the "Book a 1:1 session" button at the top, the no-session Telegram button moved to the "coming soon" band, and **JSMF Resources** in the header. Details: [docs/main-website/README.md](docs/main-website/README.md) §3g.
- **Admin session page sections are collapsible** (built, not deployed; pdf-web only). Details: §3g.
- **Session short name** (built, not deployed): a steady name for emails and the library, separate from the booking-card title. Details: [docs/main-website/README.md](docs/main-website/README.md) §2.
  - Review migration `20261018120000_session_short_name` before committing. Additive: one nullable column; blank means the title, so nothing changes until it is filled in.
  - Deploy the backend before pdf-web.
- **Partial and manual refunds, keep-or-revoke access** (built, not deployed): Orders → Refund either through Razorpay or as "I already refunded it myself" (UPI/bank/cash), full or partial, with a Revoke access switch and an Email the buyer switch; plus a **Revoke access** button for refunded orders that kept access. Details: [docs/pdf-platform/02-architecture.md](docs/pdf-platform/02-architecture.md) "Three actions, two separate decisions"; steps in [docs/main-website/admin-guide.md](docs/main-website/admin-guide.md) "Refunds".
  - Review migration `20261018140000_manual_refunds` before committing. Additive: one enum, two nullable columns on `refunds`, two CHECK constraints. Existing rows read as "through the provider".
  - Deploy the backend before pdf-web: the new Orders page reads fields the old backend does not send.
  - Razorpay partial refunds from the panel have only been tested against the stub; try one small partial refund in Razorpay test mode before relying on it.
- **Feedback without signing in on the Telegram link** (built, not deployed): a per-form switch in Settings; the Telegram form then asks for **Your name** (required). Details: [docs/main-website/README.md](docs/main-website/README.md) §3f.
  - Review migration `20261018160000_feedback_open_link` before committing. Additive: one enum value, one column defaulting to off, `feedback_responses.user_id` made nullable, two nullable columns, one unique index, two CHECKs. Every existing reply satisfies them.
  - Deploy the backend before pdf-web and main-web. Optional env: `FEEDBACK_OPEN_LINK_PER_HOUR` (default 300 — one hostel or college shares one address, so it is sized above a whole class).
  - It needs the feedback forms migration (`20261018100000_feedback_forms`) deployed first, as it changes those tables.
- **PDF bundles** (built, not deployed): several PDFs sold as one product, each PDF also sold on its own or only in bundles (admin's choice per PDF); holders always have the current contents; part-owners pay pro rata over the paid PDFs (free ones take nothing off); a bundle can be a day material. Details: [docs/pdf-platform/02-architecture.md](docs/pdf-platform/02-architecture.md) "PDF bundles"; steps in [docs/main-website/admin-guide.md](docs/main-website/admin-guide.md) "PDF bundles".
  - **No migration.** It uses the existing `product_bundle_items` table and `BUNDLE` product type.
  - Deploy the backend before pdf-web: the store and library read new fields (`contents`, `bundleSize`, the quote endpoint).
  - Not tested against Razorpay: a paid bundle checkout was tested with the stub (full price and part-owner price). Try one small paid bundle in Razorpay test mode before selling one.
- **Day materials: several PDFs per day** (built, not deployed; pdf-web only): the PDF search now asks for PDFs only and says "Searching…" while it loads; it stays open after adding one.
- **Hand-picked testimonials while no session is upcoming** (built 2026-10-21, not deployed): pick screenshots and feedback replies from any sessions for the home page band; replies show as quote cards above the screenshots. Steps: [docs/main-website/admin-guide.md](docs/main-website/admin-guide.md) "Testimonials when no session is upcoming".
  - Review migration `20261021100000_no_session_hand_picked` before committing. It is additive: one boolean column on `platform_settings` (default off) and two new tables (`no_session_screenshots`, `no_session_quotes`).
  - Deploy the backend, then pdf-web and main-web. An older main-web ignores the new `quotes` field.
  - Also review migration `20261021140000_quotes_layout`: one new enum and one column on `platform_settings` (default `SCROLL`, today's sideways-scrolling row), for the admin choice between the scrolling row and the earlier wrapping block. Additive.
  - Also review migration `20261021120000_longer_quotes`: it widens `feedback_highlights.quote` and `no_session_quotes.quote` from 1000 to 5000 characters, so a reply of any length can be shown ("Read more" opens it in a pop-up). Widening only, no rewrite; run it after `20261021100000_no_session_hand_picked`.
- **Direct-to-storage uploads** (built 2026-10-20/21, not deployed). Every upload goes from the browser straight to GCS in 8 MB pieces, with progress, cancel and resume after a dropped connection: PDFs, attachments, covers and session screenshots. One `uploads` module and table serve them, and each kind is a registered *purpose*, so user avatars or files later are one class. Public files (covers, screenshots) are checked in private staging and published only once accepted. Limits: 500 MB for PDFs (`MAX_DIRECT_UPLOAD_SIZE_MB`) and 8 MB for images (`MAX_IMAGE_UPLOAD_SIZE_MB`). Details: [docs/pdf-platform/05-storage.md](docs/pdf-platform/05-storage.md) §3b.
  - Review migration `20261020100000_direct_uploads` before committing. It is additive: one enum, one table (`uploads`), and one nullable column (`product_assets.checksum_md5`).
  - **Before deploying, apply the CORS rule to the prod private bucket** (one command, in §3b; the rule is in `docs/gcp/gcs-private-bucket-cors.json`). Without it, uploads stop after the first piece with a clear message. The dev bucket already has its rule. The public bucket needs none.
  - Deploy the backend before pdf-web. Each falls back to the multipart path against an older other half.
  - **After both are deployed**, lower `MAX_UPLOAD_SIZE_MB` to 5 on the backend and `NEXT_PUBLIC_MAX_UPLOAD_MB` to 5 for the pdf-web build. They then only cap the multipart fallback. Not before: until the new pdf-web is live, the old one still sends PDFs that way.
  - Not tested on Cloud Run itself: the full flow was tested locally against the real dev buckets (a 30 MB PDF, a dropped connection, a lost last reply, a fake PDF, a cancel, a cover, a screenshot). Upload one large PDF and one cover in prod after deploying.
  - For user uploads later: image processing, per-user quotas and malware scanning are still to add (§3b, "Adding a kind of upload").
- **Cloud Scheduler `session-reminders` job:** without it, no session reminders go out in production. The commands are in [docs/gcp/02-deployment-guide.md](docs/gcp/02-deployment-guide.md).
- **Feedback sections ("What students said after Day 1")** (built, not deployed). Details are in [docs/main-website/README.md](docs/main-website/README.md) §3e.
  - Review migration `20261017190000_testimonial_sections` before committing. It is additive: one table and one nullable column.
  - Deploy the backend before pdf-web and main-web.
- **Day materials (PDFs per session day) and "Show in store"** (built, not deployed). Details are in [docs/main-website/README.md](docs/main-website/README.md) §3d-bis.
  - Review migration `20261017150000_session_materials` before committing. It is additive: two columns with defaults that keep today's behaviour, one new entitlement source, two tables.
  - Deploy the backend before pdf-web.
  - Recordings are deliberately not built yet (cost).
- **Session details (dates, joining link, Telegram group)** (built, not deployed). It replaces "Notify attendees". Details are in [docs/main-website/README.md](docs/main-website/README.md) §3d.
  - Review migration `20261016150000_session_details` before committing. It is additive: one column (`telegram_url`), two enums and two tables.
  - Deploy the backend before pdf-web.
  - After deploying, links sent before then show as "Not sent", because nothing recorded which link those emails held. The first "Send everything outstanding" sends them once more.
