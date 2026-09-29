# JSMF GCP Cloud Deployment Documentation

This directory contains the documentation and step-by-step guides for deploying the JSMF PDF Web Platform to Google Cloud Platform (GCP) at **minimum cost (V1 - Ultra Low Cost)**.

---

## Documentation Index

1. **[01-architecture.md](file:///docs/gcp/01-architecture.md)**
   - High-level GCP architecture diagram.
   - Component breakdown (Next.js, NestJS, Neon Postgres, Secret Manager, Cloud Storage, Razorpay).
   - Environment separation (Development/Staging vs Production).

2. **[02-deployment-guide.md](file:///docs/gcp/02-deployment-guide.md)**
   - End-to-end deployment runbook with exact copy-paste `gcloud` and `docker` commands.
   - Artifact Registry setup, Cloud SQL setup, Secret Manager provisioning, and Cloud Run deployments for both services.
   - CORS & Webhook configurations.

3. **[03-secrets-and-env.md](file:///docs/gcp/03-secrets-and-env.md)**
   - Complete inventory of environment variables and GCP Secret Manager mappings.
   - RSA Keypair generation commands for JWT RS256 token signing.

4. **[04-cost-optimization.md](file:///docs/gcp/04-cost-optimization.md)**
   - V1 cost analysis and breakdown ($0.00 - $8.00 / month).
   - GCP Free Tier allocation strategy.
   - Database options (Supabase/Neon Free tier vs Cloud SQL `db-f1-micro`).
   - Rationale for omitting Redis in V1 (`REDIS_ENABLED=false`).

5. **[05-scaling-roadmap-todos.md](file:///docs/gcp/05-scaling-roadmap-todos.md)**
   - Scaling milestones (V1 -> V2 -> V3).
   - Redis caching and queue activation path.
   - Database migration runbooks.

6. **[06-capacity-and-security-report.md](file:///docs/gcp/06-capacity-and-security-report.md)**
   - Comprehensive V1 security posture analysis.
   - Concurrent user capacity limits (Cloud Run, Neon DB, Resend, Cloudinary).
   - Dynamic rate-limiting architecture & hostel network resolution.

7. **[07-security-architecture-and-tradeoffs.md](file:///docs/gcp/07-security-architecture-and-tradeoffs.md)**
   - Deep-dive into active security layers (Zero-Trust IAM, RS256 cryptography, token family tracking).
   - Known architectural trade-offs in V1 (Frontend public exposure, in-memory rate limiting drift).
   - Cloud Armor, WAF, Redis Throttling, and Cloudflare Turnstile upgrade roadmap.

8. **[08-pending-actions.md](file:///docs/gcp/08-pending-actions.md)** — **read this before deploying.**
   - The gap between what this repository says and what is currently live: built and documented, not yet applied.
   - Ordered by consequence, each with the exact command that closes it.
   - Also records decisions already investigated and settled, so they are not re-litigated.

### Related, outside this folder

- **[pdf-platform/05 — Storage](file:///docs/pdf-platform/05-storage.md)** — the storage port, the four-bucket topology (one pair per environment), the credential model, and the provider-migration procedure. GCS setup commands live in Phase 3.5 of the deployment guide; the reasoning lives there.
- **[identity/01 — Architecture](file:///docs/identity/01-architecture.md)** — auth endpoints, the one-time-code primitive, and the delivery-channel port that lets a failed email offer another route in.
