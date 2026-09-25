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

## 2. Email Delivery Modernization (SendGrid / Transactional Mail API)

- [ ] **Current State:** Using Gmail SMTP via app passwords (subject to daily sending limits ~500-2000 emails/day and potential delivery throttling).
- [ ] **Next Step (SendGrid / Resend / Mailgun):**
  - Migrate email driver from raw SMTP to a dedicated transactional email provider like **SendGrid** or **Resend**.
  - Configure domain DNS authentication (**SPF, DKIM, DMARC**) on the custom domain (GoDaddy) to ensure 99%+ deliverability into inbox (preventing spam filters).
  - Update NestJS mail module to support native SendGrid API / HTTP dispatch instead of SMTP socket connection latency.

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
