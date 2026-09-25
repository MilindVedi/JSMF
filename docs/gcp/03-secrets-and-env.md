# GCP Environment Variables & Secret Manager Mapping

This document provides a reference for all environment variables, flags, and secret configurations needed for deploying the JSMF V1 stack on GCP.

---

## 1. Backend (`NestJS`) Environment & Secret Configuration

| Variable Name | Type | In V1 (Free / Low Cost) | Source / Secret Manager Key | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | String | `production` | Cloud Run Env Var | Controls logging, helmet, swagger disable. |
| `PORT` | Number | `4000` | Cloud Run Env Var | Cloud Run container listening port. |
| `CORS_ORIGINS` | CSV String | `https://your-frontend-app.run.app` | Cloud Run Env Var | Allowed origins for browser credentials. |
| `APP_PUBLIC_URL` | URL | `https://your-backend-app.run.app/api` | Cloud Run Env Var | API base URL for signed callbacks / public asset generation. |
| `DATABASE_URL` | Connection URL | `postgresql://...` | GCP Secret: `DATABASE_URL` | Cloud SQL socket or external connection string. |
| `JWT_PRIVATE_KEY_BASE64` | Base64 RSA Private Key | `LS0t...` | GCP Secret: `JWT_PRIVATE_KEY_BASE64` | Base64 string of RSA PEM private key. |
| `JWT_PUBLIC_KEY_BASE64` | Base64 RSA Public Key | `LS0t...` | GCP Secret: `JWT_PUBLIC_KEY_BASE64` | Base64 string of RSA PEM public key. |
| `JWT_KEY_ID` | String | `jsmf-identity-1` | Cloud Run Env Var | Key ID for rotation support. |
| `JWT_ISSUER` | String | `jsmf-identity` | Cloud Run Env Var | JWT Issuer field. |
| `JWT_AUDIENCE` | String | `jsmf` | Cloud Run Env Var | JWT Audience field. |
| `STORAGE_DRIVER` | Enum | `cloudinary` | Cloud Run Env Var | `cloudinary` driver enabled for production. |
| `STORAGE_SIGNING_SECRET`| String (min 16 chars) | `<Random_Secret>` | GCP Secret: `STORAGE_SIGNING_SECRET` | Used for generating signed internal URLs. |
| `STORAGE_PRIVATE_BUCKET`| String | `jsmf/private` | Cloud Run Env Var | Cloudinary folder prefix for raw/private PDFs. |
| `STORAGE_PUBLIC_BUCKET` | String | `jsmf/public` | Cloud Run Env Var | Cloudinary folder prefix for covers/images. |
| `CLOUDINARY_CLOUD_NAME` | String | `<your-cloud-name>` | GCP Secret: `CLOUDINARY_CLOUD_NAME` | Cloudinary account identifier. |
| `CLOUDINARY_API_KEY` | String | `<your-api-key>` | GCP Secret: `CLOUDINARY_API_KEY` | Cloudinary API Key. |
| `CLOUDINARY_API_SECRET` | String | `<your-api-secret>` | GCP Secret: `CLOUDINARY_API_SECRET` | Cloudinary API Secret. |
| `PAYMENT_DRIVER` | Enum | `razorpay` | Cloud Run Env Var | Production payment gateway driver. |
| `RAZORPAY_KEY_ID` | String | `<your-key-id>` | GCP Secret: `RAZORPAY_KEY_ID` | Razorpay public key. |
| `RAZORPAY_KEY_SECRET` | String | `<your-key-secret>` | GCP Secret: `RAZORPAY_KEY_SECRET` | Razorpay private secret. |
| `REDIS_ENABLED` | Boolean | `false` | Cloud Run Env Var | Keep `false` in V1 for lowest cost ($0). |
| `MAIL_DRIVER` | Enum | `resend` | Cloud Run Env Var | HTTPS API, not an SMTP socket — Cloud Run blocks outbound SMTP ports. `log` is **refused in production** by env validation. |
| `RESEND_API_KEY` | String | `re_...` | GCP Secret: `RESEND_API_KEY` | Required when `MAIL_DRIVER=resend`. Create at https://resend.com/api-keys. |
| `MAIL_FROM` | String | `JSMF <no-reply@yourdomain>` | Cloud Run Env Var | Domain must be verified in Resend (https://resend.com/domains) or every send is rejected. |

---

## 2. Frontend (`pdf-web` Next.js) Configuration

| Environment Variable | Description | Example Production Value |
| :--- | :--- | :--- |
| `BACKEND_API_URL` | URL of the NestJS backend API. Resolved at **runtime** by `middleware.ts` to dynamically reverse proxy requests. | `https://jsmf-backend-67890.a.run.app` |
| `NEXT_PUBLIC_MAX_UPLOAD_MB`| Max client file size in MB | `10` |
| `PORT` | Listening Port | `3001` |
| `NODE_ENV` | Production Environment | `production` |

> 💡 **Note on Runtime Proxying:** In V1, the Next.js app does NOT bake backend URLs into static client assets during build time. Instead, the browser makes API calls to relative paths (e.g. `/api/users`), and Next.js `middleware.ts` dynamically intercepts and forwards them to `BACKEND_API_URL` at runtime.

---

## 3. RSA Key Generation Utility

To quickly generate valid RSA keys for `JWT_PRIVATE_KEY_BASE64` and `JWT_PUBLIC_KEY_BASE64`:

```bash
# Generate private key
openssl genrsa -out private.pem 2048

# Extract public key
openssl rsa -in private.pem -outform PEM -pubout -out public.pem

# Encode to Base64 (Linux/macOS)
JWT_PRIVATE_KEY_BASE64=$(base64 -w 0 private.pem)
JWT_PUBLIC_KEY_BASE64=$(base64 -w 0 public.pem)

# Windows PowerShell:
# [Convert]::ToBase64String([IO.File]::ReadAllBytes("private.pem"))
# [Convert]::ToBase64String([IO.File]::ReadAllBytes("public.pem"))
```
