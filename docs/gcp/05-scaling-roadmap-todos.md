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

## 5. Frontend & Global Edge Acceleration

- [ ] **Custom Domain Setup:** Map custom domain on GoDaddy with Cloud Run custom domain mappings / Cloud Load Balancer.
- [ ] **Edge Caching:** Add Cloudflare or Google Cloud Armor / CDN in front of Next.js frontend to cache static assets and marketing pages at the edge across India and globally.
- [ ] ⚠️ **Whenever a proxy is added or removed in front of the app, re-check `TRUST_PROXY_HOPS`.** Every proxy adds an entry to `X-Forwarded-For`, and that variable says how many of them to trust. Adding a CDN without raising it means the backend reads the CDN's address instead of the user's — every visitor collapses into one rate-limit bucket again. Nothing errors; the limits simply stop being per-user. Re-run *Phase 9.1* of the deployment guide after any change to the chain, including the Firebase Hosting step.
