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
- **Direct-to-storage uploads (not built; the upload path does not scale).** Downloads already
  do this correctly — the backend mints a short-lived signed GCS URL and the browser fetches the
  file straight from Google, so no file bytes cross Cloud Run. **Uploads do the opposite:** the
  file is buffered whole in the pdf-web proxy (256Mi) and again in the backend (512Mi) before
  reaching GCS. Three ceilings follow from that, none of which a bigger `MAX_UPLOAD_SIZE_MB` can
  lift:
  - Cloud Run refuses any HTTP/1 request over **32 MiB**, so a larger upload fails in production
    however the app is configured;
  - the file sits in RAM twice, so a large upload can take an instance down;
  - the proxy (`pdf-web/next.config.ts` → `proxyClientMaxBodySize`) has to be raised in step, and
    silently truncates the body when it is not.

  Until this is built, keep **`MAX_UPLOAD_SIZE_MB` at 25** (and `NEXT_PUBLIC_MAX_UPLOAD_MB` to
  match, with the proxy a little above it). 25 rather than 32 leaves room for the multipart
  overhead that counts towards Cloud Run's limit.

  **The correct approach**, which removes all three ceilings at once:
  1. The browser asks the backend for a signed upload URL (`POST /admin/products/:id/assets/upload-url`),
     naming the file's size and type. The backend checks the admin's rights, refuses an
     unreasonable size or type, and returns a URL valid for a few minutes, scoped to one object key
     it chose.
  2. The browser `PUT`s the file **directly to GCS**. Nothing passes through Cloud Run or Next.js.
     GCS takes files up to 5 TB and handles concurrency itself.
  3. The browser calls the backend back (`POST …/assets/confirm` with the object key). The backend
     reads the object's **metadata** from GCS — size, content type, and the checksum GCS already
     computed — and only then writes the `product_assets` row.

  What moves, and must not be lost (today all of it happens while the bytes are in hand, in
  `product-asset.service.ts`): the MIME-type check against the asset kind, the empty-file check,
  the SHA-256 that blocks a byte-identical re-upload, and storing the file before the database row.
  Step 3 can do each of these from GCS metadata without downloading the file (`crc32c`/`md5Hash`
  are returned by the metadata call; the stored checksum column may need to change to one GCS
  provides, or be computed in the browser).

  Two new things the design needs, which the current one does not:
  - **a size cap on the signed URL itself** (`x-goog-content-length-range`), or an admin could
    upload anything to it;
  - **cleanup of abandoned objects** — uploads that completed in step 2 but never reached step 3.
    A sweep over objects with no `product_assets` row, on the existing `SweepRegistry` clock.

  Scope it to `PRIMARY_FILE` PDFs first; cover images and small attachments can keep today's path
  indefinitely, since they are genuinely small. Roughly half a day. Do it before promising anyone
  that large files work — not by raising the limit.
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
