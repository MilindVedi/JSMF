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
     - `CORS_ORIGINS` = `http://localhost:3000` *(will update once frontend is deployed)*
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
  --min-instances=0 `
  --max-instances=3 `
  --memory=512Mi `
  --cpu=1 `
  --set-env-vars="NODE_ENV=production,STORAGE_DRIVER=cloudinary,PAYMENT_DRIVER=razorpay,REDIS_ENABLED=false,MAX_UPLOAD_SIZE_MB=10,STORAGE_PRIVATE_BUCKET=jsmf/private,STORAGE_PUBLIC_BUCKET=jsmf/public,CORS_ORIGINS=http://localhost:3000" `
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
  --cpu=1 `
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

### Step 7.2: Update CORS on Backend
Update the backend to accept requests originating from the frontend URL:

```powershell
$FRONTEND_URL = "https://jsmf-pdf-web-12345.a.run.app"
$BACKEND_URL = "https://jsmf-backend-67890.a.run.app/api"

gcloud run services update jsmf-backend `
  --region=$REGION `
  --update-env-vars="CORS_ORIGINS=${FRONTEND_URL},APP_PUBLIC_URL=${BACKEND_URL}"
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
> 3. **CORS:** Update `CORS_ORIGINS` in your Backend Cloud Run service to include your custom domain.
