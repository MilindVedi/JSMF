# Storage — architecture, environments, and migration

Where JSMF keeps the files it sells, and how a file gets from an admin's upload
to a paying buyer's download without ever becoming publicly guessable.

This exists as its own document because storage is the one subsystem that spans
three concerns that are usually written up separately and are useless apart:
the **port design** (how the application avoids knowing who stores its bytes),
the **bucket and credential topology** (what actually exists in GCP, and who
can reach it), and the **migration procedure** (how bytes move between
providers without a flag day). A reader answering "can I safely change this?"
needs all three.

---

## 1. The port, and why nothing above it names a provider

```
Application code
      │  depends only on ↓
StorageProvider (abstract class)          src/modules/storage/domain/
      │
      ├── LocalStorageAdapter             disk, development only
      ├── CloudinaryStorageAdapter        the original V1 provider
      └── GcsStorageAdapter               current
```

`StorageProvider` exposes four operations — `upload`, `getSignedDownloadUrl`,
`delete`, `exists` — and **no provider concept leaks through any of them**.
There is no `resource_type`, no bucket ACL, no SDK options bag in a signature.
That is what made adding GCS an adapter plus a registration rather than a
change to anything that stores or serves a file.

### Objects are addressed, never URL'd

Every column pointing at a file stores three values:

```
provider  +  bucket  +  objectKey
```

and never a URL. This is the decision the whole migration story rests on. Had
rows stored URLs, each one would embed a hostname belonging to whichever
provider was active on the day it was written, and there would be no way to
distinguish a still-valid URL from a dead one without fetching it.

### Writes follow config; reads follow the row

`StorageService` is the façade every other module injects, and its one real job
is this asymmetry:

| Operation | Goes to |
| :--- | :--- |
| `upload` | the **currently configured** driver (`STORAGE_DRIVER`) |
| `getSignedDownloadUrl`, `delete`, `exists` | the provider **the row itself records** |

So flipping `STORAGE_DRIVER` sends *new* uploads somewhere else while every
existing file keeps being served from wherever its bytes actually are. Had
reads used the configured driver instead, that same flip would have turned
every previously-uploaded asset into a 404.

The boot log states the split so it can be checked at a glance:

```
StorageService  writes → GCS; can read from [LOCAL, CLOUDINARY, GCS]
```

An adapter is constructed whenever its configuration is present — not only when
it is the active driver — precisely so that older rows keep resolving. A row
naming a provider with no adapter registered raises a 503 that names the
provider, rather than a generic 500.

---

## 2. Bucket topology

Four buckets: one pair per environment, each pair split by visibility.

| | Private (purchased files) | Public (cover images) |
| :--- | :--- | :--- |
| **Cloud Run** | `jsmf-private-509708` | `jsmf-public-509708` |
| **Local / dev** | `jsmf-dev-private-509708` | `jsmf-dev-public-509708` |

All four: `asia-south1`, uniform bucket-level access.
Both private buckets: **public access prevention enforced**.
Both public buckets: `allUsers:objectViewer`.

### Why two buckets instead of one with prefixes

Under uniform bucket-level access, visibility is a property of the *bucket*.
The private bucket therefore has no public access to grant — so a bug in the
adapter cannot publish a purchased PDF. The worst such a bug can do is write a
cover image somewhere private, which fails visibly rather than silently
exposing a product.

Sharing one bucket would make "is this file paid for?" a per-object question
answered by per-object ACLs, where a single wrong write publishes a product and
nothing complains. Env validation enforces the separation: the app refuses to
boot if `GCS_PRIVATE_BUCKET` equals `GCS_PUBLIC_BUCKET`.

### Why separate dev buckets

Local development writing into the buckets customers are served from is the
kind of mistake that is obvious afterwards and invisible beforehand: a dev
upload becomes a live product's file, and a dev delete is a real deletion.
Nothing in the code can distinguish the two, so the separation is configuration.

### How each visibility is served

- **Private** — a V4 signed URL, expiry from `STORAGE_SIGNED_URL_TTL_SECONDS`.
  There is deliberately no unsigned variant for a private object to fall into.
- **Public** — the plain `https://storage.googleapis.com/<bucket>/<key>` URL,
  unsigned. Signing a cover image would expire it for no reason and defeat
  browser and CDN caching on the busiest images in the storefront.

### Object keys

`<keyPrefix>/<uuid><ext>` — e.g. `products/<productId>/<uuid>.pdf`.

The original filename is **never** part of the key; it contributes at most a
validated extension. A name containing `../`, or one that simply collides with
an existing object, must not be able to steer where bytes land or overwrite
someone else's file. There are unit tests for exactly this, including a
`../../../etc/passwd` case.

---

## 3. Credentials

**No key files anywhere.** The org policy
`constraints/iam.disableServiceAccountKeyCreation` is enforced on this project,
and that is the correct setting: impersonated and attached credentials are
short-lived and expire on their own, whereas a downloaded key stays valid until
somebody notices it has leaked.

### Cloud Run

Application Default Credentials — the attached service account. Two grants:

```
roles/storage.objectAdmin              on each production bucket
roles/iam.serviceAccountTokenCreator   on the service account ITSELF
```

The second is the one that gets missed, and its failure mode is nasty: uploads,
deletes and cover images all work without it. The only thing that breaks is a
paid download — at the moment a customer tries to open something they have
already bought. It is required because a V4 signed URL must be *signed*, and
Cloud Run has no private key; the SDK signs through the IAM `signBlob` API
instead, which means the service account must be able to impersonate itself.

### Local development

A dedicated, deliberately powerless identity:

```
jsmf-local-dev@production-509708.iam.gserviceaccount.com
```

`roles/storage.objectAdmin` on the two **dev** buckets, and **no project-level
role of any kind**. Reached by impersonation, not a key:

```bash
gcloud auth application-default login \
  --impersonate-service-account=jsmf-local-dev@production-509708.iam.gserviceaccount.com
```

`docker-compose.dev.yml` mounts the resulting credentials into the API
container read-only (set `GCLOUD_CONFIG_DIR` in the repo-root `.env`).

**The `--impersonate-service-account` flag is what makes that mount safe.**
Without it the same mount hands the container your personal credentials, which
on this project are Owner — full control of production, granted so an app can
write two test buckets. Verified by attempting, as the scoped identity:

| Attempt | Result |
| :--- | :--- |
| Write to dev private bucket | succeeds |
| Write to production bucket | 403 |
| Read production bucket | denied |
| List Secret Manager | denied |
| List Cloud Run services | denied |

### Why the GCS adapter uses the SDK

It is the one adapter that does, where Razorpay and Resend speak raw HTTP. The
reason is signing: a V4 signed URL is an HMAC over a canonical request, and the
`signBlob` fallback above is a second protocol on top of that.
`@google-cloud/storage` also handles token refresh and retries. Reimplementing
it would mean owning a lot of security-critical code for no benefit — which is
the same test the other adapters were judged by, reaching the opposite answer.

---

## 3b. Direct uploads (built 2026-10-20, generalised 2026-10-21)

**Every upload goes straight from the browser to storage.** That covers product
PDFs, attachments, covers and session screenshots, and later user files. No
byte passes through Next.js or the API, so neither Cloud Run's 32 MiB request
cap nor instance memory bounds a file. Downloads already worked this way. The
old multipart routes (`POST /api/admin/products/:id/assets`,
`POST /api/admin/sessions/:id/testimonials`) remain as the fallback for
`STORAGE_DRIVER=cloudinary`, which cannot take direct uploads, and for an
older admin site during a rollout.

### Purposes: one flow, any kind of file

What a file is for is its **purpose** (`uploads.purpose`). The module that
owns the thing being uploaded to registers it with `UploadPurposeRegistry` at
startup (`uploads/application/upload-purpose.ts`). The `uploads` module runs
the same flow for all of them and never imports any of them.

| Purpose | Registered by | Who | Types | Limit | Becomes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `product.primary_file` | catalog | ADMIN, EDUCATOR | PDF | `MAX_DIRECT_UPLOAD_SIZE_MB` (500) | next `product_assets` version |
| `product.sample_preview` | catalog | ADMIN, EDUCATOR | PDF | same | same |
| `product.attachment` | catalog | ADMIN, EDUCATOR | PDF, ZIP, PNG, JPEG, WebP | same | same |
| `product.cover_image` | catalog | ADMIN, EDUCATOR | PNG, JPEG, WebP | `MAX_IMAGE_UPLOAD_SIZE_MB` (8) | next cover version (public) |
| `session.testimonial` | events | ADMIN, EDUCATOR | PNG, JPEG, WebP | same | a `session_testimonials` row (public) |

A purpose says: the roles allowed (empty = any signed-in person, with
`prepare` deciding); its bucket visibility; its types and limit; how to
validate its own options (`context`, e.g. `{ sectionId }`); `prepare`, which
checks that the target exists and the person may upload to it and returns the
key prefix; an optional `inspect` (the product purposes refuse an identical
re-upload); `record`, which writes the result in the completing transaction;
and `present`, which builds the response.

### The three steps (`uploads/application/upload.service.ts`)

1. **Start**, `POST /api/uploads` `{ purpose, targetId, context?, filename, contentType, sizeBytes }`.
   The API checks the role, type and size, then the purpose's `prepare`. It
   chooses the object key, opens a **GCS resumable upload session** and
   records an `uploads` row as `PENDING`. It returns the session URL, which is
   the credential for that one object. It goes to the browser and is never
   stored or logged.
2. **Send.** The browser (`pdf-web/src/lib/direct-upload.ts`, which uses
   `resumable-upload.ts`) `PUT`s the file in `DIRECT_UPLOAD_CHUNK_MB` pieces
   (default 8) with `Content-Range`, reading each with `File.slice`, so even a
   huge file costs one piece of memory. Storage answers `308` + `Range` per
   piece and `200` at the end. After a dropped connection or a 5xx the browser
   waits (exponential backoff, up to 8 tries), asks storage how much arrived
   (`Content-Range: bytes */<size>`) and carries on from there. If the last
   piece's reply is lost, the browser asks and learns the file is complete.
3. **Complete**, `POST /api/uploads/:id/complete`. The API reads the object's
   **metadata** (size, type, MD5) and its first 1 KB. It never downloads the
   whole file. It refuses the upload, and deletes the object at once, if:
   - the size differs from what was declared;
   - the type differs;
   - the first bytes are not the declared format (a PNG renamed `.pdf` fails
     here: `uploads/domain/file-signature.ts`);
   - the purpose's `inspect` refuses it.

   It runs `prepare` again, since the target may have been deleted meanwhile.
   Then the purpose records it. Calling complete again after success returns
   the same result. The browser retries this call on a network error, but not
   on a refusal.

### Public files are checked privately first

A file bound for the **public** bucket (covers, screenshots) is uploaded to the
**private** bucket under `staging/<purpose>/` (`uploads.staged = true`). Only
once it passes every check is it copied to its public key, inside GCS, with no
bytes through the app (`StorageProvider.copy`). The staged original is then
deleted. An unchecked file is therefore never publicly readable, which matters
once anyone can upload. It also means the public bucket needs no CORS rule.

### What the GCS session guarantees on its own (checked against the dev bucket)

- **Exact size.** The declared size is sent as `X-Upload-Content-Length`, and
  GCS refuses a final size that is off by one byte either way.
- **Never an overwrite.** `ifGenerationMatch: 0` on the session and on the
  copy: finalising onto an existing object fails with 412.
- **One origin.** The session answers CORS only for the origin it was opened
  for: the request's `Origin` if it is in `CORS_ORIGINS`, else `STOREFRONT_URL`
  (`https://resources.jsmf.me` in production).

### Cleanup and limits

- The `uploads` sweep (5-minute clock) marks `PENDING` rows past `expires_at`
  (`DIRECT_UPLOAD_EXPIRY_HOURS`, default 24) as `EXPIRED` and deletes their
  objects.
- A GCS session lives a week, so a browser that kept sending after the app gave
  up could still finish an object. For 8 days the sweep therefore keeps
  deleting the objects of `ABORTED`/`EXPIRED` rows and the staged originals of
  completed public uploads. It never deletes what a completed, unstaged upload
  became.
- One person may have at most 20 unfinished uploads open.

**Checksums.** A direct upload's bytes never reach the app, so it has no
SHA-256. `product_assets.checksum_md5` (hex) holds the MD5 that GCS computed,
and the multipart path records MD5 too. The "identical to the current version"
check compares SHA-256 when both rows have it, else MD5.

### Bucket CORS rule (required once, private bucket only)

The session handles CORS for itself, but without a bucket rule GCS does not
**expose `Range`** to the browser. The browser then cannot tell how much
arrived, so it cannot resume. It stops with "storage did not say how much it
received" rather than hanging. Set it once:

```bash
# Production (the admin panel is served from resources.jsmf.me)
gcloud storage buckets update gs://jsmf-private-509708 \
  --cors-file=docs/gcp/gcs-private-bucket-cors.json

# Dev bucket, for http://localhost:3001 (already applied 2026-10-20)
gcloud storage buckets update gs://jsmf-dev-private-509708 --cors-file=<a copy with origin http://localhost:3001>

# Check
gcloud storage buckets describe gs://jsmf-private-509708 --format="json(cors_config)"
```

Uploading from another web origin (a second domain, the raw `run.app` URL)
needs it added to that file, to `CORS_ORIGINS`, and re-applying. The public
bucket needs no rule.

### Local driver

`STORAGE_DRIVER=local` speaks the same protocol. The session URL is
`<APP_PUBLIC_URL>/storage/local/uploads/<signed token>`, served by
`LocalStorageController`. It appends pieces to a `.part` file and renames it
into place only when complete. The browser client and the whole flow run
unchanged without a bucket, and `uploads/application/upload.integration.spec.ts`
uses it.

### Adding a kind of upload (a user's avatar, a user's file)

Write one class that registers an `UploadPurpose`, as
`catalog/application/product-upload-purposes.ts` and
`events/application/session-testimonial-uploads.ts` do. Nothing else changes:
not the table, the endpoints, nor the browser client
(`directUpload({ purpose, targetId, file })`). For uploads from **ordinary
users**, these are still to add, and each fits a step that already exists:

- **Image processing** (resize, re-encode, strip EXIF such as phone GPS) for
  avatars and covers. Do it between the checks and `record`: read the staged
  original, which is small and bounded by the purpose's limit, and write the
  processed variant as what gets published. Re-encoding also defeats files
  that are both a valid image and something else.
- **Per-user quotas and rate limits** per purpose. Today there is a global cap
  of 20 open uploads per person and the general request throttle.
- **Malware scanning** for user documents, done before `record`, on the staged
  copy.
- **Serving user files**: never as `image/svg+xml` or HTML from our own domain.
  Keep types to the signature-checked list, and serve private files with
  `Content-Disposition: attachment`.

### Scaling notes

- **Bigger files:** raise `MAX_DIRECT_UPLOAD_SIZE_MB` (GCS allows 5 TB per
  object). Nothing else changes.
- **Faster uploads:** raise `DIRECT_UPLOAD_CHUNK_MB`. Fewer requests, more to
  resend after a drop.
- **Resuming across a page reload** is not built: the session URL lives only in
  the tab. It would need the URL kept in the browser (IndexedDB) with the file
  handle. The backend already allows completing later, until `expires_at`.
- **Signing locally:** with personal `gcloud` credentials the API cannot sign
  *download* URLs ("Cannot sign data without `client_email`"). That already
  applied to every private file. Uploads do not sign anything, so they work
  locally. Cloud Run signs through its service account.

---

## 4. Migrating between providers

A migration is **copy, verify, then repoint** — three phases, in that order,
with the row rewrite last so that a failure at any point leaves the system
serving the old location.

1. **Copy.** Read each object from the old provider and write it to the new
   one. Private objects need a signed URL from the old provider to read.
2. **Verify.** Compare size *and* checksum against the source before touching
   any row. A truncated copy that nobody checked is worse than no copy.
3. **Repoint.** One transaction rewriting `storage_provider`, `bucket` and
   `object_key`. Guard each `UPDATE` with the old provider in the `WHERE`
   clause so re-running it is a no-op rather than a corruption.

The old objects are **not deleted** as part of this. Leaving them costs a
little storage and buys a revert that consists of restoring row values.

### Status

| Environment | State |
| :--- | :--- |
| **Local / dev** | **Done.** 5 Cloudinary objects (2 PDFs, 3 covers) copied to the dev buckets and rows repointed. Byte-for-byte verified — sizes matched `size_bytes`, MD5s matched after upload. Cloudinary originals untouched. |
| **Production** | **Not started.** Production rows still name `CLOUDINARY`, and are still served from it. |

Four `LOCAL` rows also remain in the dev database, served by the local adapter,
and were out of scope for the move.

### Running the production migration

It has not been run, and it should not be run casually — it rewrites rows
pointing at files customers have paid for. When it is:

- Keep the Cloudinary credentials configured throughout and afterwards. Until
  every row is repointed, removing them turns each remaining one into a 503.
- Take the row backup (`id, storage_provider, bucket, object_key`) first. That
  backup *is* the rollback.
- Verify checksums before the rewrite, not after.
- Expect to repeat it: rows written between the copy and the rewrite will still
  name Cloudinary, so the migration is run until it finds nothing left.

The one-off script used for the dev migration was deliberately **not** kept in
the repository. A re-runnable script that rewrites asset rows is exactly the
thing that eventually gets pointed at the wrong database.

---

## 5. Configuration reference

| Variable | Cloud Run | Local |
| :--- | :--- | :--- |
| `STORAGE_DRIVER` | `gcs` | `gcs` |
| `GCS_PRIVATE_BUCKET` | `jsmf-private-509708` | `jsmf-dev-private-509708` |
| `GCS_PUBLIC_BUCKET` | `jsmf-public-509708` | `jsmf-dev-public-509708` |
| `GCS_PROJECT_ID` | `production-509708` | `production-509708` |
| `CLOUDINARY_*` | **keep set** — still read from | not needed once dev rows are migrated |
| `STORAGE_PRIVATE_BUCKET` / `STORAGE_PUBLIC_BUCKET` | unchanged | unchanged |
| `MAX_DIRECT_UPLOAD_SIZE_MB` | `500` (default) | `500` (default) |
| `DIRECT_UPLOAD_CHUNK_MB` | `8` (default) | `8` (default) |
| `DIRECT_UPLOAD_EXPIRY_HOURS` | `24` (default) | `24` (default) |
| `MAX_IMAGE_UPLOAD_SIZE_MB` | `8` (default) | `8` (default) |
| `MAX_UPLOAD_SIZE_MB` | `5` once the new admin site is live (multipart fallback only) | any |

`STORAGE_*_BUCKET` are **Cloudinary folder prefixes**, deliberately left alone
and not reused for GCS. Existing Cloudinary rows record those values in their
`bucket` column, and the Cloudinary adapter decides whether an object is
private by comparing that column against the current setting — so repointing
them at GCS bucket names would make every already-sold PDF look public to the
adapter still serving it.

See [`docs/gcp/03-secrets-and-env.md`](../gcp/03-secrets-and-env.md) for the
full variable inventory and [`docs/gcp/02-deployment-guide.md`](../gcp/02-deployment-guide.md)
Phase 3.5 for the bucket and IAM setup commands.
