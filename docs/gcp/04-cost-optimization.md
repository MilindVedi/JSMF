# GCP V1 Cost Optimization & Free Tier Guide

This guide details how to keep your Google Cloud Platform bill as close to **$0.00/month** as possible during V1.

---

## 1. GCP Free Tier Allowances & Strategy

Google Cloud offers generous monthly "Always Free" tiers alongside the initial $300 90-day trial credit.

| Service | Free Tier Allowance | How JSMF Fits In |
| :--- | :--- | :--- |
| **Cloud Run** | • 2 million requests/month<br>• 360,000 GB-seconds memory<br>• 180,000 vCPU-seconds | With `min-instances: 0` and low concurrency, Next.js & NestJS sit idle and scale to 0 when not receiving traffic, consuming **$0.00**. |
| **Artifact Registry** | 0.5 GB/month free storage per region | Cleaning up old container tags or keeping 1-2 builds keeps cost at **< $0.05/mo**. |
| **Secret Manager** | 6 active secret versions free / month; 10,000 access operations/month | JSMF secrets accessed only upon cold start, well within free limits (**$0.00**). |
| **Cloud Build** | 120 build-minutes per day free | Building images via Cloud Build is completely free for typical deployment frequency (**$0.00**). |
| **Cloud Logging** | First 50 GB/project/month free | App logs are within free allowance (**$0.00**). |

---

## 2. Low-Cost Database Decision

PostgreSQL is the only component that can incur baseline continuous costs on GCP:

### Recommendation for Minimum Cost:

1. **V1 Absolute Minimum Cost ($0.00/month)**:
   - Use a serverless managed PostgreSQL provider with a generous free tier such as **Supabase** (500MB storage, free compute) or **Neon** (0.5GB free).
   - In Cloud Run, simply pass the connection string into the `DATABASE_URL` secret.

2. **GCP Native Minimal Option (~$7.00 - $9.00/month)**:
   - If you require the database to remain inside GCP, use **Cloud SQL PostgreSQL** with:
     - Tier: `db-f1-micro` (Shared Core, 0.6 GB RAM)
     - Storage: 10GB SSD
     - Availability: Single zone (No High Availability / Failover)
     - Backups: Retain 1-3 days

---

## 3. Why Redis is Excluded in V1

- **Cost saving**: Managed Redis (Google Cloud Memorystore) starts at ~$35-$40/month minimum with no scale-to-zero.
- **Application compatibility**: The JSMF backend has been built with `REDIS_ENABLED=false` by design for V1. In-memory caching and rate-limiting handle single-instance or low-traffic scenarios seamlessly without requiring a persistent Redis cluster.

---

## 4. Summary Cost Estimate Table

| Service | Provider | Configuration | Monthly Cost |
| :--- | :--- | :--- | :--- |
| Next.js (`pdf-web`) | GCP Cloud Run | Scale to 0, 256MB RAM | **$0.00** |
| NestJS Backend | GCP Cloud Run | Scale to 0, 512MB RAM | **$0.00** |
| PostgreSQL DB | Supabase / Neon / Cloud SQL | Free Tier or `db-f1-micro` | **$0.00 - $7.50** |
| PDF & Image Storage | Cloudinary | Free tier (25 credits) | **$0.00** |
| Payments | Razorpay | Standard per-transaction fee (no fixed monthly cost) | **$0.00** base |
| Secrets & Registry | GCP Secret Manager / Artifact Registry | Free tier limits | **< $0.10** |
| **Total Baseline Monthly Cost** | | | **$0.00 - $7.50** |
