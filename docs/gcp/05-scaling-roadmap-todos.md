# Scaling Roadmap & Infrastructure TODOs

This document outlines upcoming architectural enhancements and migration milestones to handle traffic growth, reliability, and security over time.

---

## 1. Database Scaling (Neon & PostgreSQL)

- [ ] **Short Term (Immediate to Moderate Growth):**
  - Monitor Neon compute unit (CU) consumption and connection pool usage.
  - Upgrade Neon tier from Free/Launch to **Neon Scale / Pro** when compute limits or cold starts require dedicated capacity and higher connection pooling.
- [ ] **Long Term (High Traffic / Enterprise Consolidation):**
  - Evaluate migrating from Neon to **Google Cloud SQL for PostgreSQL** (or AlloyDB) within the same GCP region (`asia-south1`) to achieve sub-millisecond private VPC latency and zero egress charges between Cloud Run and Database.
  - Set up read replicas for read-heavy operations (e.g., public catalog browsing, product search).

---

## 2. Email Delivery

- [x] **Done — migrated from Gmail SMTP to Resend** (`MAIL_DRIVER=resend`). Gmail app passwords capped sending at ~500-2000/day with no bounce reporting, and Cloud Run blocks outbound SMTP ports, so an HTTPS API is the right transport here regardless of volume. Implemented as `ResendMailAdapter` behind the existing `MailProvider` port — the SMTP adapter remains available via `MAIL_DRIVER=smtp` for any provider that speaks SMTP.
- [x] **Done — domain authentication:** The custom domain `jsmf.me` is verified in Resend with active SPF and DKIM records via GoDaddy. 
  - *Note:* It is highly recommended to add a `_dmarc` TXT record (`v=DMARC1; p=none;`) to fully comply with 2024 Gmail/Yahoo sender guidelines. Also, brand new domains start with zero sender reputation, so initial emails may go to spam until the AI learns they are safe (users clicking "Not Spam").
- [ ] **Later — volume:** Resend's free tier is 3,000 emails/month (100/day). Move to a paid tier when receipts plus password resets approach that.

---

## 3. Caching & Background Queues (Redis)

- [ ] **When to Enable:**
  - When scaling Cloud Run instances beyond 1 instance to ensure rate-limiting state is globally synchronized.
  - When asynchronous operations (PDF watermark processing, invoice generation, bulk email dispatch) require reliable background workers.
- [ ] **Infrastructure Options:**
  - Option A: **Upstash Redis** (Serverless, pay-per-request, ultra-low cost for low/variable traffic).
  - Option B: **Google Cloud Memorystore for Redis** (Dedicated VPC-peered in `asia-south1`).

---

## 4. Storage & Asset Delivery (GCS, Direct Uploads & In-Browser Reader)

- [x] **Done — GCS & Direct Uploads:** Migrated private asset storage to **Google Cloud Storage (GCS)** with direct browser-to-bucket chunked uploads (up to 500 MB) and byte-range downloads.
- [x] **Done — In-Browser PDF Reader:** Built Kindle-like reader fetching 256 KB pieces directly from GCS with background position tracking.
- [ ] **Reader Signed URL Signing Quota at Massive Scale (10,000+ Concurrent Readers):**
  - Private reader links expire every 5 minutes and auto-renew in the background. On Cloud Run, each signed link invokes Google's IAM credentials signing service. At ~10,000 active concurrent readers, that translates to ~2,000 signing requests/minute.
  - **Why you don't need to worry today:**
    - This only becomes a factor when you reach thousands of simultaneous active readers at the exact same second.
    - If and when you reach that scale, the solution is effortless: you can simply increase the link duration (e.g., from 5 minutes to 30 or 60 minutes via `STORAGE_SIGNED_URL_TTL_SECONDS`), which immediately cuts the requests by 85–90%, or use Cloud CDN signed cookies.
- [x] **Done 2026-11-16 — no listing on the public buckets.** Both granted `allUsers:objectViewer`, which let anyone list and download every file — including every user's avatar under `users/<user id>/`. Now `allUsers:legacyObjectReader`: a file opens by its exact link only (commands in [02-deployment-guide.md](02-deployment-guide.md)).
- [ ] **Low priority — shrink profile pictures in the browser before upload.** The avatar pickers (main-web, pdf-web) send the original file, so a JPEG copied from a phone to a laptop can still carry the GPS location where it was taken. Exposure is small: an avatar is shown only to its owner, its link is unguessable, and the bucket cannot be listed; phone browsers mostly drop location on upload themselves. Drawing the picture onto a canvas at ~512 px and uploading that would drop all photo details as a side effect and make avatars a few dozen KB instead of a few MB. Revisit if avatars are ever shown to other people (a leaderboard, mentor pages). A server-side re-encode (`sharp`) would only add protection against someone uploading through the API directly — i.e. leaking their own photo — so it is not worth a new server dependency.
- [ ] **Plain question import is limited to ~100 KB per file.** The API's JSON body limit is Express's default 100 KB, so the admin's "Import a question file" refuses a full exam paper (413). Content releases avoid it by sending in parts ([../pyq/content-releases.md](../pyq/content-releases.md)), which is the route to production anyway. If large plain imports are needed (e.g. the content pipeline posting straight to production), make that page send in parts the same way — rather than raising the global body limit, which every route would then accept.
- [ ] **Release pushes re-copy a changed question's images.** A question whose text changed gets fresh copies of all its images, even unchanged ones (copies happen inside storage, so it costs a storage operation, not bandwidth). Fine at hundreds of images per push; if pushes grow to thousands of changed questions, remember each image's SHA-256 on the question and copy only the ones that changed.
- [ ] **Question image links at scale.** Each server instance signs a question image's link once per 3 hours (`QUESTION_IMAGE_LINK_TTL_SECONDS` / 2) and caches it in memory, so signing calls grow with *images × instances*, not students — fine for thousands of images. Built that way because one in-memory cache needs no new infrastructure. When images reach tens of thousands or instances many, move to **Cloud CDN with signed cookies** in front of the private bucket: one signature per student session instead of per image, and edge caching. Also set `Cache-Control: private, max-age=86400, immutable` on question image objects (each upload has a new key, so its bytes never change) so a browser keeps an image it has loaded even after its link expires.

---

## 6. Move reconciliation off an in-process timer — **done**

- [x] **Replaced `@Cron` with Cloud Scheduler calling an authenticated endpoint.** The sweep used to run on a timer inside the API process, which forced two Cloud Run settings it should not need — `--min-instances=1` and `--no-cpu-throttling` — together costing the scale-to-zero saving the V1 cost model is built around. It also fired against a pool that had been idle, which is why sweeps failed with `Can't reach database server` once Neon's free tier had suspended.
- [x] Driving it as an ordinary HTTP request removed all three problems at once: Cloud Run allocates CPU for the duration, the database connection is established as part of serving it, and the backend is back to `--min-instances=0`. Cloud Scheduler allows 3 jobs free per month, so this is cheaper than the instance it replaced.
- [x] `PAYMENT_RECONCILIATION_TRIGGER=cron|http` keeps the in-process timer for local development and Docker Compose, where a long-lived container makes it the simpler thing. Both paths call the same code. See *Phase 9.2* of the deployment guide.
- [x] **The trigger endpoint carries no secret of its own.** The backend already restricts `roles/run.invoker` to a single service account — the frontend's — which is how `pdf-web/src/middleware.ts` is able to call it at all. Cloud Scheduler gets a second service account added to that same IAM binding and calls the endpoint with `--oidc-service-account-email`; Cloud Run verifies the identity token at the platform layer before the request reaches the container. Nothing application-level to leak, rotate, or forget to check.

## 5. Frontend & Global Edge Acceleration

- [ ] **Edge rate limiting (the gap backend throttling cannot close).** Every API request reaches the backend *through* the Next.js service, so a flood is absorbed by frontend instances before the backend rejects it: they accept the connection, run middleware, forward it, and Cloud Run bills for all of it. Backend limits protect the database and the expensive work behind it, not the frontend's compute. The fix is rejecting traffic before it reaches any instance - Cloud Armor, or the CDN's own rate limiting - which is a paid component and the reason this is deferred rather than solved. Doing it in the Next.js middleware instead is not equivalent: it would have to verify tokens itself to key by account, and its counters would sit in per-instance memory on a service that scales to zero.


- [ ] **Custom Domain Setup:** Map custom domain on GoDaddy with Cloud Run custom domain mappings / Cloud Load Balancer.
- [ ] **Edge Caching:** Add Cloudflare or Google Cloud Armor / CDN in front of Next.js frontend to cache static assets and marketing pages at the edge across India and globally.
- [ ] **Whenever a proxy is added in front of the app, add its IP range to `TRUST_PROXY_RANGES`.** Client IPs are resolved by walking `X-Forwarded-For` and skipping known-proxy addresses; an unrecognised proxy is taken for the client, so every visitor collapses into one rate-limit bucket. Nothing errors - the limits just stop being per-user. Re-run the checks in *Phase 9.1* of the deployment guide after any change to the chain.
- [ ] **Single front door (deferred):** the service's `.run.app` URL bypasses Firebase and the CDN. Closing it needs a Cloud Load Balancer with ingress set to *Internal and Cloud Load Balancing* - restricting ingress without one locks Firebase out and takes the site down. Not urgent: client-IP resolution is already correct on both paths.
