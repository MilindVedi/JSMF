# GCP Cloud Deployment Architecture (V1 - Ultra Low Cost)

This document outlines the end-to-end cloud architecture for deploying the JSMF PDF Web Platform on Google Cloud Platform (GCP) at **ultra-low cost** (within free tier / pennies per month) while keeping production readiness, security, and scalability intact.

---

## 1. High-Level Architecture

```
                                  [ User / Browser ]
                                          │
                        ┌─────────────────┴─────────────────┐
                        │ HTTPS (Custom Domain / Cloud Run) │
                        ▼                                   ▼
        ┌───────────────────────────────┐   ┌───────────────────────────────┐
        │       Next.js (pdf-web)       │   │        NestJS Backend         │
        │     Cloud Run (Frontend)      │──▶│      Cloud Run (API / Auth)   │
        │  • Port: 3001                 │   │  • Port: 4000                 │
        │  • min-instances: 0 (Scale 0) │   │  • min-instances: 0 (Scale 0) │
        │  • Memory: 256MB - 512MB      │   │  • Memory: 512MB              │
        └───────────────────────────────┘   └───────────────┬───────────────┘
                                                            │
                            ┌───────────────────────────────┼───────────────────────────────┐
                            ▼                               ▼                               ▼
            ┌───────────────────────────────┐ ┌───────────────────────────┐ ┌───────────────────────────┐
            │   PostgreSQL Database         │ │   Cloudinary (External)   │ │    Secret Manager / Env   │
            │  Option A: Supabase / Neon    │ │  • PDFs & Raw files       │ │  • JWT Base64 Keys        │
            │            (Free Tier - $0/m) │ │  • Public covers & images │ │  • Cloudinary Secret      │
            │  Option B: Cloud SQL Postgres │ │  • Signed download URLs   │ │  • Razorpay Secret        │
            │            db-f1-micro (~$7)  │ └───────────────────────────┘ │  • Database credentials   │
            └───────────────────────────────┘                               └───────────────────────────┘
```

---

## 2. Cost Optimization Strategy (V1 Minimum Cost)

| Component | Target Service | Sizing / Configuration | Estimated Monthly Cost |
| :--- | :--- | :--- | :--- |
| **Frontend** | GCP Cloud Run | `min-instances: 0`, `max-instances: 2`, `cpu: 1`, `memory: 256Mi` | **$0.00** (Free Tier: 2M req/mo, 360k GB-sec) |
| **Backend API** | GCP Cloud Run | `min-instances: 0`, `max-instances: 3`, `cpu: 1`, `memory: 512Mi` | **$0.00** (Within Cloud Run Free Tier) |
| **Container Images** | Artifact Registry | 1 Repository (Standard storage, few hundred MBs) | **< $0.10 / month** (First 0.5 GB free) |
| **Database (Option 1 - Lowest Cost)** | Supabase / Neon / Render Postgres | Managed Serverless / Free Tier | **$0.00 / month** |
| **Database (Option 2 - Native GCP)** | GCP Cloud SQL for PostgreSQL | `db-f1-micro` or `db-custom-1-3840` shared core, 10GB SSD, No HA (Single zone) | **~$7.00 - $9.00 / month** |
| **Media / PDF Storage** | Cloudinary | Free tier plan (25 credits / month) | **$0.00** |
| **Secrets Management** | Secret Manager | 6 secrets, minimal version accesses | **$0.00** (Free Tier: 6 active secrets free) |
| **Redis Cache** | *Disabled for V1* | `REDIS_ENABLED=false` in NestJS backend | **$0.00** |
| **Total Estimated Cost** | | | **$0.00 - $8.00 / month** |

---

## 3. Core Components & Environments

### Environments:
1. **Development / Staging**: Local Docker Compose or preview Cloud Run services.
2. **Production**: Dedicated GCP Project (`jsmf-prod`) or scoped environment tags.

### External Integrations:
- **Cloudinary**: Holds raw PDFs in `STORAGE_PRIVATE_BUCKET` (`jsmf/private`) and public thumbnails/previews in `STORAGE_PUBLIC_BUCKET` (`jsmf/public`).
- **Razorpay**: Handles checkout, order creation, and payment verification webhooks.
