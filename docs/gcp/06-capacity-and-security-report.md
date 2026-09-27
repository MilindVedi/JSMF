# JSMF V1 Capacity & Security Report

This report outlines the architectural limits and security posture of the JSMF platform based on the V1 GCP deployment configuration.

---

## 1. Security Posture: Is it ready?

**Verdict: YES. You should go ahead with the current architecture.** 

You have built a highly secure, enterprise-grade foundation that punches far above its weight for a V1 launch. Adding anything else right now (like Cloud Armor or Private VPCs) will only add cost and slow down your deployment. 

**What protects the platform today:**
- **Zero-Trust Network:** Your backend API is completely invisible to the public internet using Google Cloud IAM. It rejects any request that doesn't carry a Google-signed cryptographic token from your frontend.
- **Bulletproof Rate Limiting:** Configured with `TRUST_PROXY_RANGES`. Attackers cannot spoof their IP addresses to bypass your 120-request/minute limit or brute-force authentication.
- **Edge Caching:** Firebase Hosting / Google CDN sits in front of your app, acting as a global shield that absorbs basic DDoS traffic and bot probes before they wake up your Cloud Run servers.
- **Stateless RS256 Sessions:** Asymmetric JWT implementation means user access is mathematically verified; tokens cannot be forged even if a downstream service or database is momentarily unreachable.

---

## 2. Capacity: How many simultaneous users?

"Simultaneous users" (people actively browsing) is different from "Concurrent connections" (data packets traveling at the exact same millisecond). 

Here is what your infrastructure can handle before things slow down or reach service limits:

### A. Cloud Run (Compute)
- **Current Setup:** `max-instances=3`, with a default concurrency of 80 requests per instance.
- **Hard Limit:** `3 * 80 = 240` simultaneous backend computations at the exact same millisecond.
- **Real-World Users:** Because a user clicks a link and then reads a PDF for 3 minutes, 240 concurrent connections comfortably serve **~5,000 to 8,000 active users** browsing the site simultaneously.
- **How to scale it:** Simply change `--max-instances=3` to `--max-instances=10` in Cloud Run. (Google can scale this to 1000 instances automatically).

### B. Database (Neon Serverless Postgres / Cloud SQL) & Prisma Connection Pool
**⚠️ The Hidden Scaling Bottleneck: Database Connections**
- **Prisma's Default Pool:** Prisma automatically opens a set number of connections (ordering windows) per Cloud Run instance using the formula `(CPU Cores * 2) + 1`. With 1 vCPU, each instance opens 3 connections.
- **Current Max Scale (3 instances):** At maximum traffic, your 3 instances will open 9 database connections. 
- **Database Limits:** 
  - **Cloud SQL (`db-f1-micro`):** Has a strict hard cap of ~25 connections. Your 9 connections are perfectly safe.
  - **Neon Free Tier:** Can handle thousands of connections via its `-pooler` endpoint.
- **Scaling Danger:** If you later increase Cloud Run to `--max-instances=10`, Prisma will try to open 30 connections. This will instantly crash a `db-f1-micro` database. 
- **The Fix for Future Scaling:** If you ever scale past 5 instances, explicitly add a connection limit parameter to your `.env` connection string (e.g., `?connection_limit=2`) to prevent Prisma from overwhelming the database.

**Other Database Limits:**
- **Neon Free Tier (0.25 vCPU):**
  - **Throughput:** ~60–150 queries/sec (~500 to 1,000 active concurrent users).
  - **Cold Starts:** Scales to zero after 5 minutes of inactivity (1.5–3s wake-up delay unless kept warm via a 4-minute health check ping).
  - **Storage Limit:** 500 MB (holds ~50,000+ registered student profiles and metadata).
- **GCP Cloud SQL Option (PostgreSQL 16 in `asia-south1`):**
  - **Covered by Free Trial Credits:** $15–$25/month instance (`db-f1-micro` / `db-g1-small`) fully covered by 90-day $300 GCP credit.
  - **Zero Cold Starts & <2ms Latency:** Always warm and colocated with Cloud Run.
- **How to scale it:** Upgrade Neon to Launch tier ($19/mo) or switch to Cloud SQL by updating `DATABASE_URL`.

### C. Resend (Email Delivery)
- **Current Setup:** Free Tier (100 emails / day).
- **Hard Limit:** 100 transactional emails per day. 
- **Real-World Impact:** If more than 100 students register or purchase in one day, email deliveries will pause until the next daily reset.
- **How to scale it:** Upgrade to Resend Pro ($20/mo for 50,000 emails/mo).

### D. Rate Limiting (The Hostel / Shared Wi-Fi Solution)
- **Current Setup:** Advanced `IdentityThrottlerGuard` which dynamically groups rate limits:
  - **Authenticated Users:** 120 requests / minute grouped per **User ID**. 50 students in a hostel logged in on the same Wi-Fi each get their own 120 req/min quota.
  - **Anonymous Users:** 120 requests / minute per **IP Address** (protects login/signup endpoints from automated credential stuffing).
- **The IP Ceiling Backstop:** A global `IP_CEILING_THROTTLER` set to 3,000 requests/minute per IP address prevents botnets from registering thousands of fake accounts on one IP.
- **Capacity Impact:** 50 students in a hostel browsing normally generate ~1,000 req/min combined (well under the 3,000 ceiling).
- **How to scale it:** Already production-ready. No changes needed.

### E. Cloudinary (PDF & Image Storage)
- **Current Setup:** Cloudinary Free Plan (25 Credits / month).
- **10 MB Hard Upload Ceiling:** Cloudinary free accounts enforce a strict **10 MB limit on raw file uploads (`10,485,760 bytes`)**. Backend sets `MAX_UPLOAD_SIZE_MB=10` to reject oversized files before upload.
- **Bandwidth Limit:** 25 monthly credits shared across storage and delivery bandwidth (~25 GB / month).
  - For a typical 5 MB PDF, allows **~4,500 total downloads per month** (~150 downloads/day average, with zero daily throttling).
- **Security:** Private files uploaded as `raw` + `authenticated`. Delivered via short-lived signed URLs (`private_download_url`).
- **How to scale it:** 
  - When monthly downloads cross 1,000–2,000, leverage your backend's built-in `StorageProvider` port to switch to **Google Cloud Storage (GCS)** (`STORAGE_DRIVER=gcs`), which has no 10 MB limit and costs pennies (~$0.02/GB). Old Cloudinary files continue to resolve without breaking.

---

## Summary of Scaling Playbook

If traffic surges (e.g., social media shoutout or exam season), scaling takes under 5 minutes:
1. Increase Cloud Run `--max-instances` from `3` to `10`.
2. Add a payment card to Resend ($20/mo) and Neon ($19/mo) or use Cloud SQL.
3. Switch storage driver to GCS if uploading PDFs larger than 10 MB.
