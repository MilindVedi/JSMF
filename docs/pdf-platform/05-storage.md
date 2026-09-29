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

`STORAGE_*_BUCKET` are **Cloudinary folder prefixes**, deliberately left alone
and not reused for GCS. Existing Cloudinary rows record those values in their
`bucket` column, and the Cloudinary adapter decides whether an object is
private by comparing that column against the current setting — so repointing
them at GCS bucket names would make every already-sold PDF look public to the
adapter still serving it.

See [`docs/gcp/03-secrets-and-env.md`](../gcp/03-secrets-and-env.md) for the
full variable inventory and [`docs/gcp/02-deployment-guide.md`](../gcp/02-deployment-guide.md)
Phase 3.5 for the bucket and IAM setup commands.
