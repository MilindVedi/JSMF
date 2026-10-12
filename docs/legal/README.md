# Legal documents — Terms, Privacy, Refund

One versioned set of documents for every JSMF app: jsmf.me (`MAIN`), PYQs (`PYQ`) and the store (`STORE`).
The text lives in the database and is managed from the admin panel (store admin → **Legal**). No deployment is needed
to change it.

## The model

- **One document per type**: `TERMS`, `PRIVACY`, `REFUND`. A version is an ordered list of sections. A section with
  no `apps` is shared; otherwise only the listed apps show it. One version number covers every app.
- **Section text is plain text**, never HTML: blank lines for paragraphs, `- ` bullets, `[text](url)` links
  (`/…`, `https://…`, `mailto:` only). Each app renders it as React text.
- **Versions** (`legal_document_versions`): one `DRAFT` per type at most; publishing turns it into the next number —
  `MINOR` 1.0 → 1.1, `MAJOR` 1.x → 2.0 (the first is always 1.0). Publishing stamps who, when, the effective time
  (now or scheduled) and a sha256 `content_hash` of the text. A draft identical to the latest version is refused.
- **Current** = the newest published version whose `effective_at` has passed — always worked out by the backend,
  never sent by a client.
- **Acceptances** (`legal_acceptances`): one row per explicit user action — user, exact version, `ACCEPTED` (Terms) or
  `ACKNOWLEDGED` (Privacy, Refund), context (`SIGNUP` / `RE_ACCEPT` / `CHECKOUT` + order), app, server UTC time, IP,
  user agent. Accepting a newer version adds a row; nothing is overwritten.

## Rules the database enforces (migration `20261011140000_legal_documents`)

| Rule | How |
|---|---|
| A published version can't be edited or deleted | `BEFORE UPDATE OR DELETE` trigger |
| Acceptances are insert-only | `BEFORE UPDATE OR DELETE` trigger |
| An acceptance points at a published version | `BEFORE INSERT` trigger |
| At most one draft per type | partial unique index |
| A published row has version, hash, kind, times | `CHECK` constraint |

These hold for a bug, a script or a manual `UPDATE` too — not just for the app.

## Rolling back

There is no "revert". **Restore as new draft** copies an old version's text into the draft (`based_on_version_id`
records where it came from); publishing it creates the next number. The history keeps every version.

## Mandatory acceptance — `LEGAL_ACCEPTANCE_REQUIRED` (backend env, default `false`)

- `false` (today): acceptances are recorded when a user accepts and reported in the admin panel; nobody is blocked
  and no app shows the accept screen. Existing users with no record are fine.
- `true`: a signed-in user who has not accepted the latest **major** Terms / Privacy version gets
  `403 { code: "LEGAL_ACCEPTANCE_REQUIRED" }` from every endpoint except sign-in/account (`@SkipLegalCheck`) and the
  legal endpoints (`LegalAcceptanceGuard`, after `RolesGuard`). Every app shows a blocking accept screen with
  unticked checkboxes. A **minor** version never blocks; apps show a dismissible notice.
- Refund is acknowledged per order at checkout (`context: CHECKOUT`, `orderId`) — API ready, not yet wired into any
  checkout.

## API

| Method | Path | Who |
|---|---|---|
| GET | `legal/documents/:type?app=` | public — current version, sections for that app |
| GET | `legal/documents/:type/versions` | public — published versions list |
| GET | `legal/documents/:type/versions/:version?app=` | public — one published version |
| GET | `legal/me` | signed in — per document: current, accepted, upToDate, hasUpdate, required |
| POST | `legal/accept` | signed in — `{documents, app, context, orderId?}` |
| GET | `admin/legal` | ADMIN — overview + coverage |
| GET | `admin/legal/:type/versions`, `admin/legal/versions/:id` | ADMIN — history, one version |
| PUT / DELETE | `admin/legal/:type/draft` | ADMIN — save / discard the draft |
| POST | `admin/legal/:type/draft/publish` | ADMIN — `{changeKind, changeSummary, effectiveAt?}` |
| GET | `admin/legal/acceptances` | ADMIN — the trail, filter by type / version / user |

Publishing, saving and discarding drafts are also written to `audit_logs`.

## First deployment

On boot, `LegalSeedService` publishes v1.0 of any type that has no version yet, from
`backend/src/modules/legal/domain/initial-documents.ts` (merged from the pages each app hardcoded before). After
that the file is never read again — edit through the admin panel.

## Code

- Backend: `backend/src/modules/legal/`, `common/guards/legal-acceptance.guard.ts`,
  `common/decorators/skip-legal-check.decorator.ts`. Tests: `legal.integration.spec.ts`.
- Apps: each has `/terms`, `/privacy`, `/refund-policy` reading the backend (revalidated every 60 s), archive routes
  `/legal/:type/versions` and `/legal/:type/v/:version`, and a `LegalGate` component. Store admin: `/admin/legal`.
