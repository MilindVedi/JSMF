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
- [x] **Done — domain authentication:** The custom domain `stackmint.live` is verified in Resend with active SPF and DKIM records via GoDaddy. 
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

## 4. Storage & Asset Delivery (Cloudinary to GCS / CDN)

- [ ] **Short Term:** Monitor Cloudinary bandwidth and transformation quota.
- [ ] **Long Term:** For large raw PDF storage and downloads, consider migrating the private asset store to **Google Cloud Storage (GCS)** with **Cloud CDN** and signed URL generation to optimize bandwidth cost.

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
