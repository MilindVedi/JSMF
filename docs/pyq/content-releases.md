# Content releases — moving questions from local to production

Questions are written and reviewed in the **editorial copy** (the local
database). They reach production as a **release**: one file of reviewed
questions with their images, exported locally and pushed in production's
admin. This is the only way content moves between environments.

> Code reaches production by deploying. Content reaches it as a release.
> Nothing copies a database, and nothing writes to production's database
> except production's own API.

Design and rules in code: [`question-release.ts`](../../backend/src/modules/questions/application/question-release.ts)
(format, hashes, verdicts), [`question-release.service.ts`](../../backend/src/modules/questions/application/question-release.service.ts)
(the push), [`question-release-export.ts`](../../backend/src/modules/questions/application/question-release-export.ts)
(the export), [`pyq-release-push.tsx`](../../pdf-web/src/components/admin/pyq-release-push.tsx) (the admin page).

## The routine, per batch (one exam paper is a good batch)

1. **Add** the questions locally (they arrive as drafts), upload their images.
2. **Review** them locally — admin editor and the local website. **Publish
   locally = approved.** Only published questions go into a release.
3. **Export** (in `backend/`):

   ```powershell
   npm run pyq:release:export -- --name fmge-2026-jan --prefix fmge-2026-jan--
   # several papers in one release: repeat --prefix
   npm run pyq:release:export -- --name fmge-2026 --prefix fmge-2026-jan-- --prefix fmge-2026-jun--
   ```

   It prints how many questions and images it took, which matching drafts it
   left out, and writes `content-releases/<name>-<date-time>.release.json` at
   the repo root (git ignores the folder — releases are paid content). It also
   archives a copy in the configured private bucket under `pyq/releases/`
   (`--no-archive` to skip), so every release exists somewhere other than the
   laptop. **Export after every review session**, not only before a push: the
   local database is a Docker volume, and exports are its backup.
4. **Push** in production's admin: **Question bank → Import → Push a release →
   Choose release file.** It checks the file (every image's bytes against the
   SHA-256 the file records) and shows a preview — nothing is written yet:

   | Verdict | Meaning | What the push does |
   | :--- | :--- | :--- |
   | New | Not in production | Creates it **as a draft** |
   | Changed | In production, untouched since its last push; the release is newer | Updates it in place; it **keeps its status** (a published question changes for students at once — the confirm dialog says how many) |
   | Unchanged | Exactly as its last push left it | Nothing |
   | Edited here | Changed in production since its last push, or put there by something other than a release | **Left alone**, unless you tick it to overwrite with the release |
   | Deleted here | Deleted in production | Left alone |

   It also lists the exams, subjects and topics it will create (missing ones
   only — **existing ones are never renamed**). **Push N questions** asks for
   confirmation, uploads the images that production doesn't have yet, then
   saves the questions in parts.
5. **Publish** in production: check a few of the new drafts, then bulk-publish
   them from **Questions**.

## Rules

- **Local is the master copy of question content.** To fix a question, fix it
  locally, export, push again — a release of one question is fine. In
  production an admin only **publishes or unpublishes**.
- If something was edited in production anyway (a quick fix after a student's
  report), the next push shows it as **Edited here** and won't overwrite it
  unless ticked. Carry the fix into the local copy, then push and tick it.
- **Status never travels.** New questions always arrive as drafts; publishing
  in production is a decision made there.
- **Removals don't travel.** A question deleted locally stays in production;
  unpublish or delete it there.
- **Exams and subjects are a fixed list.** A release describes the ones it
  uses and production creates any it lacks; names are managed in each
  environment's admin (Exams & subjects) and a release never changes them.

## Safe to repeat

Everything is idempotent. Pushing the same file twice changes nothing. A push
that was interrupted (closed tab, network) is finished by **pushing the same
file again**: what was saved shows as Unchanged, the rest is pushed. Images
already uploaded are found again by content and not sent twice.

Each question is all-or-nothing: its images are copied inside storage first,
then one database transaction — holding the row lock, re-checking the verdict
— writes the content, options, images and release hashes. If anything fails,
nothing of that question changes and its copied images are deleted. The
images it replaced are deleted only after the new ones are saved.

## How it works

- **Matching:** by `externalKey` (e.g. `fmge-2026-jan--ORTHO-0001`), which is
  the same in every environment; database ids differ and are never sent.
- **Two hashes per question in production** (`pyq.questions.released_*`,
  migration `20261116130000_question_release_hashes`):
  `released_content_hash` — the release content it last applied (images by
  their bytes' SHA-256), so the same release reads as Unchanged;
  `released_state_hash` — the question as that push left it (images by stored
  object), so any later edit in production, text or image, reads as a
  conflict. Status is in neither: publishing is not an edit.
- **The file is checked twice:** the browser re-hashes every image before
  uploading; the server re-derives every question's hash and refuses a release
  that was damaged or edited by hand after export.
- **Images** go straight from the browser to the private bucket's staging
  area `pyq/release-images/` through the normal upload flow (purpose
  `pyq.release_image`: admin only, type-sniffed, size-capped at
  `MAX_IMAGE_UPLOAD_SIZE_MB`, and refused unless its MD5 is the one the
  release recorded) — never through the API server. The push copies each one,
  inside storage, to `pyq/questions/<id>/`. Staged images are deleted by the
  5-minute sweep after `PYQ_RELEASE_IMAGE_RETENTION_HOURS` (7 days).
- **Request size:** the API takes at most 100 KB per request, so the page
  sends a release in parts of up to ~80 KB (50 questions at most); each part
  carries only the exams, subjects and topics its own questions use. One
  question alone over ~80 KB is refused with its key — shorten it.
- **Audit:** every part of a push is an `audit_logs` row
  (`action = pyq.release_applied`, `entity_type = pyq_release`,
  `entity_id = <release name>`) with who pushed it and which questions were
  written; the server log has `pyq.release_applied` with the counts.
- **Security:** admin only end to end (export needs local database access;
  preview, apply and the image uploads need an admin session in production).
  Local content work needs no production access at all; only the admin who
  pushes signs in to production. Releases contain paid content: they
  live outside git and in the private bucket only.

## Before the first push to an environment

1. Deploy the current server first — it runs the migrations, including the
   release columns — then the admin site, website and app
   ([../gcp/02-deployment-guide.md](../gcp/02-deployment-guide.md)).
2. Set up each exam's mock-test pattern in that environment's admin
   (**Exam setup**) — environment configuration, not content, so releases
   don't carry it.

## When something goes wrong

| What you see | Do this |
| :--- | :--- |
| "This is not a release file" / "format version …" | Choose the `.release.json` from `content-releases/`; deploy the matching admin version |
| "An image in this release is damaged" / "release is damaged or was edited after export" | Export again; don't edit release files by hand |
| A question **failed**: "image is not uploaded" | Push the same file again |
| A question **failed**: "changed here while the push was running" | Push again; it re-previews |
| "Topic … is under subject … here" | The topic's slug is used under another subject in that environment — rename the topic slug locally, or fix it there |
| "… is too long to send in one request" | That question's text is over ~80 KB; shorten its explanation or option notes |
| Too many requests (429) | The page waits and retries by itself |
