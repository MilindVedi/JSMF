# Step-by-Step GCP Deployment Guide (UI Console & CLI Walkthrough)

This guide is designed for you to follow along and execute each step yourself. For every phase, you will find both:
- **🖥️ GCP Console (Web UI) Instructions**: Click-by-click instructions in the browser.
- **⚡ Command-Line (CLI) Instructions**: Exact terminal commands for Windows PowerShell or Bash.

---

## 📋 Overview of Deployment Flow

```
[Phase 1] GCP Project & APIs Setup
    │
[Phase 2] Create Artifact Registry Repository (Docker Image Storage)
    │
[Phase 3] Create PostgreSQL Database (Cloud SQL or Supabase/Neon)
    │
[Phase 4] Configure Secrets in Secret Manager (Keys, Credentials)
    │
[Phase 5] Build & Deploy Backend (NestJS to Cloud Run)
    │
[Phase 6] Build & Deploy Frontend (Next.js to Cloud Run)
    │
[Phase 7] Connect Frontend & Backend (CORS & Webhooks)
    │
[Phase 8] Seed the Production Database
    │
[Phase 9] Live Health Check & Verification
    │
[Phase 10] Custom Domain via Firebase Hosting (Optional)
```

---

## Phase 1: GCP Project & APIs Setup

### 🖥️ Option 1: Using GCP Web Console (UI)
1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. In the top navigation bar, click the **Project Dropdown** > **New Project**.
3. Name your project (e.g. `jsmf-production`) and click **Create**.
4. Select your new project from the top dropdown.
5. In the top search bar, search for **"APIs & Services"** > **Library**.
6. Search for and **Enable** each of the following 5 APIs:
   - **Cloud Run Admin API** (`run.googleapis.com`)
   - **Artifact Registry API** (`artifactregistry.googleapis.com`)
   - **Secret Manager API** (`secretmanager.googleapis.com`)
   - **Cloud SQL Admin API** (`sqladmin.googleapis.com`)
   - **Cloud Build API** (`cloudbuild.googleapis.com`)

### ⚡ Option 2: Using CLI (PowerShell / Terminal)
```powershell
# Set your target project ID & region
$PROJECT_ID = "YOUR_PROJECT_ID"
$REGION = "asia-south1"   # Mumbai (or us-central1)

# Authenticate & set project
gcloud auth login
gcloud config set project $PROJECT_ID

# Enable all required APIs at once
gcloud services enable `
  run.googleapis.com `
  artifactregistry.googleapis.com `
  secretmanager.googleapis.com `
  sqladmin.googleapis.com `
  cloudbuild.googleapis.com
```

---

## Phase 2: Create Artifact Registry for Docker Images

Artifact Registry stores your Docker container images before deploying them to Cloud Run.

### 🖥️ Option 1: Using GCP Web Console (UI)
1. In the GCP Console navigation menu (☰), go to **Artifact Registry** > **Repositories**.
2. Click **+ CREATE REPOSITORY**.
3. Set the following:
   - **Name**: `jsmf-repo`
   - **Format**: `Docker`
   - **Mode**: Standard
   - **Location type**: Region
   - **Region**: `asia-south1` (or your chosen region)
4. Click **CREATE**.

### ⚡ Option 2: Using CLI
```powershell
gcloud artifacts repositories create jsmf-repo `
  --repository-format=docker `
  --location=$REGION `
  --description="JSMF Docker repository"

# Authorize Docker locally to push to this registry
gcloud auth configure-docker ${REGION}-docker.pkg.dev
```

---

## Phase 3: Setup PostgreSQL Database

Choose whichever option fits your budget preference:

### Option A: GCP Cloud SQL PostgreSQL (~$7/month)
#### 🖥️ Console (UI):
1. Navigate to **Cloud SQL** > **Create Instance**.
2. Choose **PostgreSQL**.
3. Set:
   - **Instance ID**: `jsmf-postgres`
   - **Password**: Enter a secure password (and save it).
   - **Database version**: PostgreSQL 15 or 16.
   - **Edition**: Enterprise (Sandboxed/Cost-optimized).
   - **Preset**: Development (Single zone, no high availability).
   - **Machine type**: Shared core > `db-f1-micro` (1 vCPU, 0.6 GB RAM).
   - **Storage**: 10 GB SSD, uncheck "Enable automatic storage increases" if you want fixed cost.
4. Click **CREATE INSTANCE** (takes ~3-5 mins).
5. Once created, click on `jsmf-postgres` > **Databases** tab > **+ CREATE DATABASE** > Name it `jsmf_db`.

#### ⚡ CLI:
```powershell
gcloud sql instances create jsmf-postgres `
  --database-version=POSTGRES_15 `
  --tier=db-f1-micro `
  --region=$REGION `
  --storage-size=10GB `
  --storage-type=SSD `
  --no-deletion-protection

gcloud sql users set-password postgres `
  --instance=jsmf-postgres `
  --password="YOUR_STRONG_DB_PASSWORD"

gcloud sql databases create jsmf_db --instance=jsmf-postgres
```

### Option B: Free Serverless Postgres via Neon ($0/month - Recommended for V1)
1. Go to [neon.tech](https://neon.tech) and create a project.
2. In the project creation modal:
   - **Project name**: `Studies and Fun` (or `jsmf-prod`)
   - **Region**: `AWS Asia Pacific 1 (Singapore)` (or closest available region)
   - **Services**:
     - 🟢 **Postgres database**: **TOGGLE ON (Enabled)**
     - ⚪ **Object storage**: **TOGGLE OFF (Disabled)** *(we use Cloudinary for PDFs/images)*
     - ⚪ **Functions**: **TOGGLE OFF (Disabled)**
     - ⚪ **AI gateway**: **TOGGLE OFF (Disabled)**
     - ⚪ **Neon Auth**: **TOGGLE OFF (Disabled)** *(NestJS handles RS256 JWT auth)*
3. Click **Create Project**.
4. On the dashboard, copy the **Connection string** (select **Pooled connection** or direct connection):
   `postgresql://username:password@ep-xyz.region.aws.neon.tech/neondb?sslmode=require`
   *(Save this string to use as your `DATABASE_URL` in Secret Manager in Phase 4).*

---

## Phase 4: Configure Secrets in Secret Manager

We store passwords, JWT keys, and API tokens securely in GCP Secret Manager.

### Step 4.1: Generate Base64 RSA Keys for JWT
Run this in PowerShell to generate the RS256 Base64 keys:
```powershell
# In PowerShell:
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -outform PEM -pubout -out public.pem

$PRIVATE_KEY_B64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("private.pem"))
$PUBLIC_KEY_B64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("public.pem"))

# View them (copy values)
Write-Output "PRIVATE: $PRIVATE_KEY_B64"
Write-Output "PUBLIC: $PUBLIC_KEY_B64"
```

### Step 4.2: Add Secrets to Secret Manager

#### 🖥️ Console (UI):
1. Navigate to **Security** > **Secret Manager**.
2. Click **+ CREATE SECRET** for each secret:
   - `DATABASE_URL`: 
     - *If Cloud SQL*: `postgresql://postgres:YOUR_PASSWORD@/jsmf_db?host=/cloudsql/YOUR_PROJECT_ID:asia-south1:jsmf-postgres`
     - *If Supabase/Neon*: `postgresql://postgres:PASSWORD@HOST:5432/dbname?sslmode=require`
   - `CLOUDINARY_CLOUD_NAME`: Your Cloudinary cloud name
   - `CLOUDINARY_API_KEY`: Your Cloudinary API key
   - `CLOUDINARY_API_SECRET`: Your Cloudinary API secret
   - `RAZORPAY_KEY_ID`: Your Razorpay Key ID
   - `RAZORPAY_KEY_SECRET`: Your Razorpay Secret Key
   - `JWT_PRIVATE_KEY_BASE64`: Paste `$PRIVATE_KEY_B64`
   - `JWT_PUBLIC_KEY_BASE64`: Paste `$PUBLIC_KEY_B64`
   - `STORAGE_SIGNING_SECRET`: Random 32-character string (e.g. `secret_signing_token_for_jsmf_v1`)

#### ⚡ CLI:
```powershell
# Create secrets
echo -n "postgresql://postgres:YOUR_PASSWORD@/jsmf_db?host=/cloudsql/${PROJECT_ID}:${REGION}:jsmf-postgres" | gcloud secrets create DATABASE_URL --data-file=-
echo -n "YOUR_CLOUDINARY_CLOUD_NAME" | gcloud secrets create CLOUDINARY_CLOUD_NAME --data-file=-
echo -n "YOUR_CLOUDINARY_API_KEY" | gcloud secrets create CLOUDINARY_API_KEY --data-file=-
echo -n "YOUR_CLOUDINARY_API_SECRET" | gcloud secrets create CLOUDINARY_API_SECRET --data-file=-
echo -n "YOUR_RAZORPAY_KEY_ID" | gcloud secrets create RAZORPAY_KEY_ID --data-file=-
echo -n "YOUR_RAZORPAY_KEY_SECRET" | gcloud secrets create RAZORPAY_KEY_SECRET --data-file=-
echo -n "$PRIVATE_KEY_B64" | gcloud secrets create JWT_PRIVATE_KEY_BASE64 --data-file=-
echo -n "$PUBLIC_KEY_B64" | gcloud secrets create JWT_PUBLIC_KEY_BASE64 --data-file=-
echo -n "random_secure_signing_secret_12345" | gcloud secrets create STORAGE_SIGNING_SECRET --data-file=-

# Grant Cloud Run permission to read secrets
$PROJECT_NUMBER = (gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" `
  --role="roles/secretmanager.secretAccessor"
```

---

## Phase 5: Build & Deploy Backend (NestJS)

### Step 5.1: Build & Push Image

You can build directly via **Google Cloud Build** (recommended - no local Docker setup needed):

```powershell
# One-time IAM permission setup for Cloud Build (if not already done):
$PROJECT_ID = "YOUR_PROJECT_ID"
$PROJECT_NUMBER = (gcloud projects describe $PROJECT_ID --format="value(projectNumber)")

gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" `
  --role="roles/cloudbuild.builds.builder"

gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" `
  --role="roles/storage.objectViewer"

gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" `
  --role="roles/artifactregistry.writer"

# Submit build to Cloud Build and push directly to Artifact Registry:
gcloud builds submit backend --tag asia-south1-docker.pkg.dev/${PROJECT_ID}/jsmf-repo/backend:latest
```

*(Alternatively, to build locally with Docker Desktop:)*
```powershell
docker build -t asia-south1-docker.pkg.dev/${PROJECT_ID}/jsmf-repo/backend:latest ./backend
docker push asia-south1-docker.pkg.dev/${PROJECT_ID}/jsmf-repo/backend:latest
```

### Step 5.2: Deploy to Cloud Run

#### 🖥️ Console (UI):
1. Navigate to **Cloud Run** > **CREATE SERVICE**.
2. Click **Select** on container image > Choose `jsmf-repo/backend:latest`.
3. Set:
   - **Service name**: `jsmf-backend`
   - **Region**: `asia-south1`
   - **Authentication**: Select *Allow unauthenticated invocations*.
4. Expand **Container, Volumes, Networking, Security**:
   - **Container port**: `4000`
   - **Capacity**: Memory `512 MiB`, CPU `1`
   - **Scaling**: Minimum instances `0`, Maximum instances `3`
   - **Environment variables**:
     - `NODE_ENV` = `production`
     - `STORAGE_DRIVER` = `cloudinary`
     - `PAYMENT_DRIVER` = `razorpay`
     - `REDIS_ENABLED` = `false`
     - `MAX_UPLOAD_SIZE_MB` = `10`
     - `STORAGE_PRIVATE_BUCKET` = `jsmf/private`
     - `STORAGE_PUBLIC_BUCKET` = `jsmf/public`
   - **Secrets**: Add references to the 9 secrets created in Secret Manager.
   - **Cloud SQL Connections** (if using Cloud SQL): Add `jsmf-postgres`.
5. Click **CREATE**.

#### ⚡ CLI:
```powershell
gcloud run deploy jsmf-backend `
  --image="${REGION}-docker.pkg.dev/${PROJECT_ID}/jsmf-repo/backend:latest" `
  --region=$REGION `
  --platform=managed `
  --allow-unauthenticated `
  --port=4000 `
  --min-instances=1 `
  --max-instances=3 `
  --memory=512Mi `
  --cpu=2 `
  --no-cpu-throttling `
  --set-env-vars="NODE_ENV=production,STORAGE_DRIVER=cloudinary,PAYMENT_DRIVER=razorpay,REDIS_ENABLED=false,MAX_UPLOAD_SIZE_MB=10,STORAGE_PRIVATE_BUCKET=jsmf/private,STORAGE_PUBLIC_BUCKET=jsmf/public" `
  --set-secrets="DATABASE_URL=DATABASE_URL:latest,JWT_PRIVATE_KEY_BASE64=JWT_PRIVATE_KEY_BASE64:latest,JWT_PUBLIC_KEY_BASE64=JWT_PUBLIC_KEY_BASE64:latest,STORAGE_SIGNING_SECRET=STORAGE_SIGNING_SECRET:latest,CLOUDINARY_CLOUD_NAME=CLOUDINARY_CLOUD_NAME:latest,CLOUDINARY_API_KEY=CLOUDINARY_API_KEY:latest,CLOUDINARY_API_SECRET=CLOUDINARY_API_SECRET:latest,RAZORPAY_KEY_ID=RAZORPAY_KEY_ID:latest,RAZORPAY_KEY_SECRET=RAZORPAY_KEY_SECRET:latest" `
  --add-cloudsql-instances="${PROJECT_ID}:${REGION}:jsmf-postgres"
```

> 📌 **Copy your Backend URL from the output!** (e.g. `https://jsmf-backend-67890.a.run.app`)

---

## Phase 6: Build & Deploy Frontend (`pdf-web` Next.js)

The Next.js app uses Middleware to dynamically proxy `/api/*` requests to the backend at **runtime**. This means you do **not** need to bake URLs into the image at build time.

### Step 6.1: Build & Push Frontend Image

```powershell
docker build `
  -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/jsmf-repo/pdf-web:latest `
  ./pdf-web

docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/jsmf-repo/pdf-web:latest
```

### Step 6.2: Deploy Frontend to Cloud Run

#### 🖥️ Console (UI):
1. Navigate to **Cloud Run** > **CREATE SERVICE**.
2. Select container: `jsmf-repo/pdf-web:latest`.
3. Set:
   - **Service name**: `jsmf-pdf-web`
   - **Region**: `asia-south1`
   - **Authentication**: *Allow unauthenticated invocations*
   - **Container port**: `3001`
   - **Memory**: `512 MiB`
   - **Min instances**: `0`, **Max instances**: `3`
   - **Environment variables**: Add `BACKEND_API_URL` and set it to your Backend Cloud Run URL (e.g. `https://jsmf-backend-67890.a.run.app`).
4. Click **CREATE**.

#### ⚡ CLI:
```powershell
gcloud run deploy jsmf-pdf-web `
  --image="${REGION}-docker.pkg.dev/${PROJECT_ID}/jsmf-repo/pdf-web:latest" `
  --region=$REGION `
  --platform=managed `
  --allow-unauthenticated `
  --port=3001 `
  --min-instances=0 `
  --max-instances=3 `
  --memory=512Mi `
  --cpu=2 `
  --set-env-vars="BACKEND_API_URL=https://jsmf-backend-67890.a.run.app"
```

> 📌 **Copy your Frontend URL from the output!** (e.g. `https://jsmf-pdf-web-12345.a.run.app`)

---

## Phase 7: Security Lockdown & External Services

### Step 7.1: Enable "Military-Grade" IAM Security
To prevent the public internet from accessing your backend directly, we enforce IAM restrictions. Only your Next.js Frontend is allowed to talk to the backend.

```powershell
# 1. Grant the Frontend Service Account permission to invoke the Backend
$PROJECT_NUMBER = (gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
gcloud run services add-iam-policy-binding jsmf-backend `
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" `
  --role="roles/run.invoker" `
  --region=$REGION `
  --project=$PROJECT_ID

# 2. Remove public access from the Backend
gcloud run services remove-iam-policy-binding jsmf-backend `
  --member="allUsers" `
  --role="roles/run.invoker" `
  --region=$REGION `
  --project=$PROJECT_ID

# 3. Explicitly enforce the IAM check on the Backend
gcloud run services update jsmf-backend `
  --region=$REGION `
  --project=$PROJECT_ID `
  --invoker-iam-check
```

### Step 7.2: Inform Backend of Public URL
The backend needs to know its public-facing URL to construct absolute links (like email invites or payment callbacks).

```powershell
$BACKEND_URL = "https://jsmf-backend-67890.a.run.app/api"

gcloud run services update jsmf-backend `
  --region=$REGION `
  --update-env-vars="APP_PUBLIC_URL=${BACKEND_URL}"
```

### Step 7.3: Configure Razorpay Webhooks (Frontend Proxy)
Because your backend is now private, Razorpay must send webhooks to your **Frontend URL**. The frontend will automatically attach its IAM token and proxy it to the backend.

1. Log in to [Razorpay Dashboard](https://dashboard.razorpay.com/) > **Settings** > **Webhooks**.
2. Click **+ Add New Webhook**.
3. **Webhook URL**: `https://jsmf-pdf-web-12345.a.run.app/api/webhooks/razorpay` *(Use your actual frontend URL)*
4. **Secret**: Enter the same secret you stored in `RAZORPAY_WEBHOOK_SECRET`.
5. **Active Events**: `payment.captured`, `payment.failed`, `order.paid`
6. Click **Save**.

### Step 7.4: Update Google OAuth Settings
Just like Razorpay, Google OAuth must redirect users back to the frontend proxy.

1. Go to the [Google Cloud Console Credentials Page](https://console.cloud.google.com/apis/credentials).
2. Click on your OAuth 2.0 Client ID.
3. Add your Frontend URL to **Authorized JavaScript origins**:
   `https://jsmf-pdf-web-12345.a.run.app`
4. Add your Frontend Callback URL to **Authorized redirect URIs**:
   `https://jsmf-pdf-web-12345.a.run.app/api/auth/google/callback`
5. Click **Save**.

---

## Phase 8: Seed the Production Database

Your Cloud SQL or Neon database is currently completely empty! (The automated entrypoint only runs `prisma migrate deploy`, which creates tables but does not insert the seed admin account).

You must seed the production database so you can log in.

### 🖥️ How to Seed (Serverless/Neon Database):
1. In your local `backend/.env` file, temporarily swap your `DATABASE_URL` to your production URL.
2. Open your terminal in the `/backend` folder.
3. Run the following command:
```powershell
npm run db:seed
```
4. Once it finishes successfully, immediately revert your `DATABASE_URL` in `.env` back to localhost.

> 🎉 You can now log into your production admin dashboard using `admin@jsmf.local` / `ChangeMe123!`.

---

## Phase 9: Verification & Health Check

1. Try opening your backend health endpoint in browser:
   `https://jsmf-backend-67890.a.run.app/api/health`
   *(It should securely return a **403 Forbidden** because you are not the frontend!)*
2. Try opening it through your frontend proxy:
   `https://jsmf-pdf-web-12345.a.run.app/api/health`
   *(It should return `{ status: "ok" }`!)*
3. Test actions:
   - Browse public documents & listings.
   - Test PDF upload (verifying Cloudinary storage).
   - Test admin login with your seeded credentials (`admin@jsmf.local`).
   - Test checkout with Razorpay test mode.

### Phase 9.1: Verify client IP resolution

Rate limiting counts requests **per client IP**. Behind a proxy the connecting
address is the proxy's - identical for every visitor - so the real one is read
from `X-Forwarded-For`. `TRUST_PROXY_RANGES` lists which upstream addresses are
proxies we control; the app walks that header from the right, skips those, and
stops at the first address they did not write.

**This is configured correctly by default and normally needs no change.** The
built-in list covers Cloud Run (`34.96.0.0/12`), Firebase Hosting
(`66.249.64.0/19`), Google's load balancers, and local/container networks.

#### Why a list and not a count of proxies

This deployment is reachable through **two chains of different lengths**:

| Path | `X-Forwarded-For` at the backend |
| :--- | :--- |
| `https://<custom-domain>` | `<client>,<firebase>,<cloudrun>` - Firebase discards anything the caller sent |
| `https://<service>.run.app` | `<whatever the caller sent>,<client>,<cloudrun>` - preserved |

A fixed hop count cannot serve both. Counting three entries back is right for
the first and, for the second, lands on an attacker-supplied value - letting
anyone forge a fresh IP per request and bypass rate limiting entirely while the
logs look healthy. Matching on address is correct for both paths, because it
stops at the first address Google did not write however many precede it.

Closing the `.run.app` route would remove the ambiguity, but Firebase Hosting
reaches Cloud Run over the public path: restricting ingress or removing the
`allUsers` invoker binding locks Firebase out too and takes the site down with
a 404. Doing it properly needs a Cloud Load Balancer in front with ingress set
to *Internal and Cloud Load Balancing* - a separate piece of work, and not
required, because address matching is already correct on both paths.

#### Verify after deploying

```powershell
curl "https://<your-domain>/api/health/client-ip"
```

1. `clientIp` must be **your own public address**, not `34.96.x` or `66.249.x`.
   If it is one of those, an upstream proxy is missing from the list - add its
   range to `TRUST_PROXY_RANGES`.
2. Confirm it cannot be forged:

   ```powershell
   curl "https://<your-domain>/api/health/client-ip" -H "X-Forwarded-For: 1.2.3.4"
   ```

   `clientIp` must **not** be `1.2.3.4`.
3. Opening it on two different networks (phone on mobile data, laptop on wi-fi)
   must give two different `clientIp` values.

`forwardedFor` in the response shows the whole chain, so a new proxy is visible
as an extra entry.

> **Adding a proxy later** - another CDN, a WAF, a load balancer - puts a new
> address in that chain. Add its range to `TRUST_PROXY_RANGES` and re-run the
> checks above. Miss it and nothing errors; every visitor silently collapses
> into one rate-limit bucket.

---

### Phase 9.2: Schedule the reconciliation sweep (Cloud Scheduler)

The payment reconciliation sweep is the safety net for a payment whose webhook
never arrived — the one piece of background work that must actually run, because
without it a buyer who closed the tab mid-payment can be charged and never
receive anything.

It supports two clocks, chosen by `PAYMENT_RECONCILIATION_TRIGGER`:

| Mode | Clock | Use where |
| :--- | :--- | :--- |
| `cron` (default) | in-process `@Cron`, every 5 min | Docker Compose, a VM, or Cloud Run with `--min-instances=1 --no-cpu-throttling` |
| `http` | Cloud Scheduler POSTs an endpoint | **Cloud Run with `--min-instances=0`** |

**On Cloud Run, use `http`.** An in-process timer needs a process, and a
scaled-to-zero service does not have one between bursts of traffic; CPU is also
frozen outside request handling, so even a live instance gives a self-scheduled
timer no cycles. This is not theoretical — in `cron` mode the sweep fired 8
times in 24 hours instead of ~288, and every run failed to reach the database,
because a throttled container cannot hold a connection open either.

A scheduled HTTP request fixes all of it at once: the request wakes the
instance, CPU is allocated for its duration, and the database connection is
opened as part of serving it. Cloud Scheduler's free tier covers 3 jobs, so
this also costs less than the always-on instance it replaces.

#### 1. Point the backend at `http` mode

**Via CLI:**
```powershell
gcloud run services update jsmf-backend --region=$REGION `
  --update-env-vars=PAYMENT_RECONCILIATION_TRIGGER=http `
  --min-instances=0
```

**Via GCP Console (UI):**
1. Navigate to **Cloud Run** > click **`jsmf-backend`** > click **Edit & Deploy New Revision**.
2. In the **Variables & Secrets** (or Container) tab, add/update the environment variable:
   * **Name**: `PAYMENT_RECONCILIATION_TRIGGER`
   * **Value**: `http`
3. Under **Scaling**, ensure **Minimum number of instances** is set to `0`.
4. Click **Deploy**.

No secret is needed. The backend's IAM policy grants `roles/run.invoker` to
the frontend's service account (so `pdf-web/src/middleware.ts` can call `/api/*`)
and to Cloud Scheduler. Verified at the Cloud Run platform layer, unauthenticated
callers receive a 403 before container execution.

---

#### 2. Give Cloud Scheduler its own identity & IAM permissions

**Via CLI:**
```powershell
# 1. Create the service account
gcloud iam service-accounts create jsmf-reconciliation-scheduler `
  --display-name="Cloud Scheduler: payment reconciliation trigger"

# 2. Grant Cloud Run Invoker role on the backend
gcloud run services add-iam-policy-binding jsmf-backend --region=$REGION `
  --member="serviceAccount:jsmf-reconciliation-scheduler@$PROJECT_ID.iam.gserviceaccount.com" `
  --role="roles/run.invoker"
```

**Via GCP Console (UI):**
1. **Create Service Account**:
   * Navigate to **IAM & Admin** > **Service Accounts** > click **+ Create Service Account**.
   * **Service account name**: `jsmf-reconciliation-scheduler`
   * **Description**: `Triggers payment reconciliation sweep via Cloud Scheduler`
   * Click **Create and Continue**.
   * Skip Step 2 (*Grant access to project*) and Step 3 (*Principals with access*) by clicking **Done** (least-privilege principle: permissions are bound directly to the service).
2. **Grant Cloud Run Invoker Role**:
   * Navigate to **Cloud Run** > Services list.
   * Check the checkbox next to **`jsmf-backend`** (do not click the name; tick the box to open the info panel).
   * In the right-hand **Permissions / Info Panel**, click **Add Principal**.
   * **New principals**: `jsmf-reconciliation-scheduler@$PROJECT_ID.iam.gserviceaccount.com`
   * **Role**: **Cloud Run** > **Cloud Run Invoker** (`roles/run.invoker`)
   * Click **Save**.

---

#### 3. Create the Cloud Scheduler Job

**Via CLI:**
```powershell
gcloud scheduler jobs create http payment-reconciliation `
  --location=$REGION `
  --schedule="*/5 * * * *" `
  --uri="https://jsmf-backend-569375141363.asia-south1.run.app/api/internal/reconcile-payments" `
  --http-method=POST `
  --oidc-service-account-email="jsmf-reconciliation-scheduler@$PROJECT_ID.iam.gserviceaccount.com" `
  --oidc-token-audience="https://jsmf-backend-569375141363.asia-south1.run.app" `
  --attempt-deadline=120s
```

**Via GCP Console (UI):**
1. Navigate to **Cloud Scheduler** > click **+ Create Job**.
2. **Define the schedule**:
   * **Name**: `payment-reconciliation` (or `payment-reconciliation-sweep`)
   * **Region**: `asia-south1` (must match your Cloud Run backend region)
   * **Frequency**: `*/5 * * * *` *(every 5 minutes)*
   * **Timezone**: Select your timezone (e.g. `India Standard Time (IST)` or `UTC`)
   * Click **Continue**.
3. **Configure the execution**:
   * **Target type**: `HTTP`
   * **URL**: `https://jsmf-backend-569375141363.asia-south1.run.app/api/internal/reconcile-payments`
   * **HTTP method**: `POST`
   * **Auth header**: Select **Add OIDC token**
   * **Service account**: Select `jsmf-reconciliation-scheduler@$PROJECT_ID.iam.gserviceaccount.com`
   * **Audience**: `https://jsmf-backend-569375141363.asia-south1.run.app` (or leave default pre-fill)
   * Click **Continue**.
4. **Configure optional settings**:
   * Leave retry config and attempt deadline as default (or set Attempt deadline to `120s`).
   * Click **Create**.

`--oidc-service-account-email` / **Add OIDC token** is what makes this an IAM-verified call rather
than a bare POST: Cloud Scheduler mints an identity token for that service
account on every run and Cloud Run checks it against the invoker binding above
— the same mechanism as the frontend's own calls.

Note the `.run.app` URL, not the custom domain: the scheduler talks to the
backend directly and has no reason to route through Firebase Hosting.

---

#### Verify

**Via CLI:**
```powershell
gcloud scheduler jobs run payment-reconciliation --location=$REGION
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="jsmf-backend" AND textPayload:"Reconciliation"' --limit=20 --freshness=1h
```

**Via GCP Console (UI):**
1. In **Cloud Scheduler**, find the `payment-reconciliation` job in the list.
2. Click the three dots `⋮` on the right side of the row and select **Force Run**.
3. Go to **Cloud Run** > **`jsmf-backend`** > **Logs** tab to view the execution log.

Expect a `Reconciliation: N checked, N settled, N errored` line roughly every
five minutes. The endpoint answers `{"ran":true}`; `{"ran":false,"reason":...}`
means the sweep was skipped (`disabled`, `already-running`) or threw
(`failed`, with the detail in the logs).

It answers **200 even then**, deliberately — Cloud Scheduler retries anything
else, and a retry cannot help a sweep skipped because the previous one is still
running. Judge health from the log line, not the status code.

#### If you stay on `cron` instead

Keep `PAYMENT_RECONCILIATION_TRIGGER=cron` and set both of these on the
**backend only** — the frontend is not involved either way, since the sweep
calls outward to Razorpay and the database:

```powershell
gcloud run services update jsmf-backend --region=$REGION `
  --min-instances=1 --no-cpu-throttling
```

This costs the scale-to-zero saving the V1 cost model is built around, which is
why `http` is the recommended mode.

---

## Phase 10: Custom Domain via Firebase Hosting (Optional)

Because native Cloud Run custom domains are not available in all regions (like `asia-south1`), Google officially recommends using **Firebase Hosting** as a free, global CDN to reverse-proxy traffic to your Cloud Run frontend.

### Step 10.1: Connect Firebase to GCP
1. Go to [console.firebase.google.com](https://console.firebase.google.com).
2. Click **Add Project** and select your existing GCP project (e.g., `jsmf-production`).
3. Click Continue (you can disable Google Analytics).

### Step 10.2: Add Domain to Firebase
1. In the Firebase Console, go to **Hosting**.
2. Click **Get Started** and skip through the setup wizard.
3. On the dashboard, click **Add Custom Domain** and enter your domain (e.g., `app.jsmf.com`).
4. Firebase will provide DNS records (TXT and/or A records). Add these to your DNS provider (e.g., GoDaddy). 

### Step 10.3: Deploy the Proxy Rule
Open a terminal in your project root and run the following:

```powershell
# 1. Install CLI
npm install -g firebase-tools

# 2. Login
npx firebase-tools login

# 3. Initialize Hosting
npx firebase-tools init hosting
# - Select your existing project
# - Public directory: public
# - Single-page app: No
# - Automatic builds: No
```

Open the newly created `firebase.json` and replace it with:
```json
{
  "hosting": {
    "public": "public",
    "rewrites": [
      {
        "source": "**",
        "run": {
          "serviceId": "jsmf-pdf-web",
          "region": "asia-south1"
        }
      }
    ]
  }
}
```

Deploy the rule:
```powershell
npx firebase-tools deploy --only hosting
```

> ⚠️ **CRITICAL CLEANUP:** Now that your URL has changed from `.run.app` to your custom domain, you MUST go back and update:
> 1. **Google OAuth:** Change Authorized Origins & Redirect URIs to your custom domain.
> 2. **Razorpay:** Change the Webhook URL to your custom domain.
