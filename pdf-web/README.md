# JSMF PDF Platform — Web

The storefront and admin panel for the [JSMF PDF & digital content platform](../docs/pdf-platform/README.md).

A **separate Next.js project** from [`web/`](../web), which is the PYQ question-bank
application. They share a brand and an identity provider, but they are different
products with different release timelines — this one ships first — so they build
and deploy independently.

## Getting started

Requires the [backend](../backend) running on :4000.

```bash
cd pdf-web
npm install
cp .env.example .env.local
npm run dev            # http://localhost:3001
```

Port 3001 is deliberate: `web/` uses 3000, and both are often run at once
against the same API. The backend's `CORS_ORIGINS` lists both.

## Routes

| Route | Who | Purpose |
|---|---|---|
| `/pdfs` | public | Browse, with filters rendered from the taxonomy tables |
| `/p/{slug}` | public | The product page. **This is the link that goes in a YouTube description**, which is why a published slug never changes |
| `/library` | buyer | Everything the signed-in user has access to |
| `/account/login`, `/account/signup` | public | Buyer accounts |
| `/admin/*` | ADMIN / EDUCATOR | Products, files, categories, orders |

## How it talks to the backend

Everything goes through `src/lib/api/client.ts`. Nothing else knows the API's
base URL or touches a token.

- **The access token is held in memory only.** In `localStorage` it would be a
  live credential readable by any script for its whole lifetime; in memory it
  dies with the tab.
- **The refresh token is in `localStorage`**, because something has to survive a
  reload and the API is deliberately cookie-free (the same endpoints will serve
  the Flutter app). It is single-use and rotates, so a stolen one is *detectable*
  rather than merely secret.
- **Exactly one code path may exchange a refresh token** — `ensureRefreshed()`.
  This is load-bearing. Refresh tokens are single-use; presenting one twice is
  indistinguishable from a replay, so the server revokes the whole family. React
  Strict Mode double-invokes effects, so a second refresh path meant being
  logged out on every page load. That bug was real, and this is the fix.

Client-side role gating in `(admin)` is a UX convenience, never the security
boundary: every endpoint re-checks the role server-side against a freshly read
user record.

## Layout

```
src/
  app/
    (store)/      public storefront — browse, product page, library, buyer auth
    (admin)/      admin panel, role-gated
  components/
    ui/           shared primitives (copied from web/, not imported across projects)
    admin/        admin-only components
  lib/
    api/          the only place that knows about the backend
    use-checkout   Razorpay checkout + free claim
    money          paise-as-string helpers — never parse money into a float
  store/
    session-store  the real session (web/'s auth-store is the PYQ mock's fake one)
```

`components/ui/` is duplicated from `web/` rather than shared through a package.
That is a deliberate trade for now: two independent projects with no build-time
coupling, at the cost of a divergence risk that is cheap while the primitives
are stable. Extract a shared package when that stops being true.

## Uploads

`NEXT_PUBLIC_MAX_UPLOAD_MB` must stay at or below the backend's
`MAX_UPLOAD_SIZE_MB`, which matches Cloudinary's real ceiling for raw uploads
(10 MB on the free plan, confirmed empirically). The browser check exists so an
oversized file fails in a second instead of after a long upload — the server
rejects it independently either way.
