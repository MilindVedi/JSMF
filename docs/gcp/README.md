# JSMF GCP Cloud Deployment Documentation

This directory contains the documentation and step-by-step guides for deploying the JSMF PDF Web Platform to Google Cloud Platform (GCP) at **minimum cost (V1 - Ultra Low Cost)**.

---

## Documentation Index

1. **[01-architecture.md](file:///docs/gcp/01-architecture.md)**
   - High-level GCP architecture diagram.
   - Component breakdown (Next.js, NestJS, Cloud SQL, Secret Manager, Cloudinary, Razorpay).
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
