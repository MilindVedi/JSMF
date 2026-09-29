# Identity — Architecture

JSMF is becoming more than one product — the PYQ question bank, the [PDF platform](../pdf-platform/README.md), a future Flutter app, and whatever follows. A person is one JSMF account across all of them, not a separate login per product. That is a decision to make once, early, because retrofitting a shared identity onto products that each grew their own user table means a migration with real users and real passwords in it.

**Identity is a dedicated module inside the single backend, not a per-product concern and not (yet) a separate service.** This follows the same "designed for later separation, not immediate separation" principle stated in the [platform-wide architecture](../03-architecture.md#architectural-style-principles): `identity` owns the `users`, `roles`, `user_roles` and `refresh_tokens` tables and exposes a service interface; no other module reaches into those tables. When the PYQ application gets its real backend, it becomes additional modules in this same monolith and consumes the same identity module — it does not get a second user table.

## The choices that make it genuinely centralized

- **Asymmetric token signing (RS256), not a shared secret.** Access tokens are signed with a private key held only by the identity module; every other module — and every future separate service — verifies them with the corresponding public key. This is the decision that makes later extraction into a standalone auth service a deployment change rather than a rewrite: nothing else ever needed the signing key to begin with. A symmetric secret (HS256) would have to be distributed to every verifier, and each copy is another place it can leak.
- **Bearer tokens in the `Authorization` header, not cookies.** Cookies are scoped to a domain and become awkward the moment there is more than one JSMF web surface plus a mobile client. Bearer tokens behave identically everywhere and remove the CSRF class of bugs entirely.
- **Short-lived access tokens with rotating refresh tokens.** Access tokens expire in minutes, so a leaked one has a small window. Refresh tokens are single-use: presenting one issues a successor and retires the original.
- **Refresh-token families with reuse detection.** Every token descended from one login shares a family id. If an already-rotated token is presented again, either the real client or an attacker is replaying it and there is no way to tell which — so the whole family is revoked and the user re-authenticates. Without this, a stolen refresh token can be used indefinitely alongside the legitimate session and nothing ever notices. See the `refresh_tokens` table in [02 — Data Model](./02-data-model.md) for the schema this requires.
- **Argon2id password hashing**, chosen over bcrypt because it is the current recommended default and because changing a password hash after real accounts exist means rehashing on next login for everyone.
- **Roles as a table rather than a column**, so one person can hold several (admin *and* educator), and so per-product permissions can be added later without a migration.
- **Rate limiting counted per account, not per IP address**, so a shared campus or hostel network does not pool every student into one allowance. See *Rate limiting* below.

## Status: built

The identity module is implemented in `backend/src/modules/identity/` and verified end to end. Endpoints:

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/auth/register` | public | Create an account without verification (assigned `STUDENT`) and start a session |
| `POST /api/auth/signup/start` | public | Send a signup code. Creates nothing. 503 + `alternatives` if undeliverable |
| `POST /api/auth/signup/verify` | public | Exchange the code for the account and a session |
| `POST /api/auth/password/forgot` | public | Send a reset code. Identical response for an unknown address |
| `POST /api/auth/password/reset` | public | Set a new password, revoke every session, sign in |
| `POST /api/auth/login` | public | Exchange credentials for an access + refresh pair |
| `POST /api/auth/refresh` | public | Rotate a refresh token — single-use, replay revokes the family |
| `POST /api/auth/logout` | public | Revoke the session the presented refresh token belongs to |
| `GET /api/auth/me` | bearer | The authenticated user |
| `GET /api/auth/jwks` | public | Public keys, so any other JSMF app can verify tokens |

Notes on how it behaves, which are easy to get wrong later:

- **Guards are global and fail closed.** `JwtAuthGuard` is registered application-wide and routes opt *out* with `@Public()`. Forgetting the decorator makes a public route return 401 — loud and immediately obvious — whereas a per-route opt-in model would silently leave a private route exposed.
- **The guard re-reads the user on every request** rather than trusting token claims alone, so suspending an account takes effect immediately instead of whenever the current access token happens to expire. Roles for authorisation come from that fresh read, not from the token.
- **On a route marked `@Public()`, the guard still attaches the user when a valid token happens to be present, without enforcing one.** Some public routes serve both anonymous visitors and signed-in ones differently — a free PDF download attributed to the buyer who took it, for instance. A failure to verify on such a route means "treat as anonymous", not 401.
- **Logins for unknown emails still verify a password hash** against a dummy generated at boot, so response timing cannot be used to discover which addresses have accounts.
- **Passwords rehash opportunistically at login** when Argon2 parameters are raised, since a hash cannot be recomputed without the plaintext and login is the only moment it is available.
- **Concurrent refreshes fail closed.** Rotation is a conditional update, so if two requests present the same token exactly one wins and the other is treated as replay. A client that double-submits loses its session rather than receiving a duplicate — deliberate, because that case is indistinguishable from a stolen token being replayed. This is not a theoretical concern: it actually happened in [`pdf-web`](../pdf-platform/02-architecture.md), where React Strict Mode double-invoked a session-restore effect and briefly logged every user out on page load until the frontend was fixed to funnel every refresh through a single in-flight promise, exactly as the backend already assumes callers do.

Verified end to end: **14 assertions**, including duplicate registration, wrong password, `/auth/me` with a missing/garbage/valid token, rotation issuing a different token, replaying an already-rotated token, **the family's still-valid current token also dying once reuse is detected**, logout revoking the session, the seeded admin logging in with an Argon2id hash, and a refresh token being rejected when presented as an access token. The reuse-detection forensic trail was additionally confirmed directly in the database: the attacked family showed 2 `ROTATED` + 1 `REUSE_DETECTED` rows with zero still live, while three unrelated sessions stayed untouched.

## Admin accounts are created by invitation

There is deliberately **no public way to request admin access**. An existing admin opens `/admin/team`, enters a name and email, and the API emails a single-use link *to that person*. They click it and either set a password or sign in with Google. `POST /admin/team/invitations` is `ADMIN`-only — notably not `EDUCATOR`, because the ability to create administrators is the privilege that confers every other privilege.

An earlier design was tried and rejected during implementation: a public "request admin access" endpoint that emailed a six-digit approval code to the owner's inbox, which the owner would then relay to the applicant. It was built and working before the problems became clear enough to act on:

- **An unauthenticated endpoint that sends mail to a fixed address is a way to flood that address.** Rate limiting caps the rate, not the total, and the inbox being flooded is the same one that gates admin access.
- **The code has to be hand-relayed** over WhatsApp or similar, which means transmitting an admin credential over a side channel — clunkier *and* weaker than it appears.
- **Email delivery becomes load-bearing for admin access**, with no authenticated path around it.

Invitations avoid all three: the endpoint is authenticated, the link goes straight to the intended person, and there is a complete audit trail (`admin.invited`, `admin.invitation_revoked`) of who granted what.

**The bootstrap problem** is handled by `prisma/seed.ts`, which creates a default admin **only when no admin exists at all**. It disables itself as soon as a real admin is registered, so the default credentials cannot linger as a permanent shared password — which is exactly what this flow replaced.

Invitations expire in 48 hours, are single-use, and can be revoked from `/admin/team` before they are accepted.

## One-time codes and how they are delivered

Two concerns, deliberately separated. `VerificationCodeService` owns what a code *is* — single use, attempt limited, superseded on reissue, compared against a hash. `VerificationChannel` owns how it *reaches someone*, which is the part that fails.

Separating them is what lets a failed send be answered with "try another way" rather than "signup is broken": the code is already issued and still valid, so another channel could carry the same one.

**Three channels: email (Resend), WhatsApp (Meta Cloud API), SMS (MSG91).** Each declares the kind of address it delivers to — `email` or `phone` — and `VerificationDeliveryService` holds them in preference order (WhatsApp before SMS within `phone`). Each was added as one class and one line in the registry; no flow changed.

A failed send reports two different kinds of "instead": **`alternatives`** (another channel to the *same* destination — "send by SMS instead") and **`otherRoutes`** (an address kind the person could switch to — "continue with your mobile number"). Both are derived from which channels are switched on, so buyers are offered a route only where one could actually send.

A phone channel counts as available only when both its transport and `PHONE_SIGNIN_ENABLED` are on, since the mobile flow is the only way to use one. Details: [03 — SMS and MSG91](./03-sms-and-msg91.md) (including why Firebase Auth was rejected) and [04 — WhatsApp and mobile sign-in](./04-whatsapp-and-mobile-sign-in.md).

Three rules worth keeping:

- **Never silently fall back to another channel.** The person nominated an email address; a code arriving by SMS would be a surprise, and the number usually is not known at that point. Report the options, let them choose.
- **`quota` and `error` stay distinct all the way to the UI.** An exhausted allowance does not resolve by retrying in a minute, so offering "try again" for it is a lie. `reason` is what lets the screen offer a retry for one and not the other.
- **Never leak the provider.** "Resend daily limit exceeded" describes JSMF's billing arrangement, not the user's problem. The classification travels; the vendor's wording stays in the log and the `email_deliveries` row.

A completed password reset revokes **every** live refresh token (`PASSWORD_CHANGED`). A reset is frequently a response to someone else holding the account, and leaving their sessions alive would make it cosmetic.

## Google sign-in

Available to every JSMF application, not just the PDF platform. Buyers use it to sign up and sign in; an invited admin can use it instead of setting a password, in which case the Google account's email must match the address the invitation was sent to.

Implemented directly against Google's documented endpoints rather than through Passport or `google-auth-library`, matching how Razorpay is integrated — the surface actually used is small, and a Passport strategy would pull in a session model this API does not otherwise have.

Four things are load-bearing and easy to get wrong:

- **The `id_token` signature is verified** against Google's published JWKS, with `RS256` pinned. Reading the claims without verifying would accept anything posted to the callback.
- **The `aud` claim is checked** against our own client id. Without it, a token minted for a *different* application would be accepted — the cross-client confusion attack.
- **An existing account is matched by email only when Google says the email is verified.** Otherwise someone could create a Google account asserting a JSMF user's address and be handed that account.
- **The redirect target is an allowlist** (`OAUTH_ALLOWED_REDIRECTS`), matched exactly rather than by prefix. Identity is shared, so the destination cannot be one hardcoded URL — but an attacker who could choose where a completed session is delivered has bypassed authentication entirely, so it cannot be a free parameter either. `https://trusted.com.evil.io` is why the match is exact and not `startsWith`. The failure path re-verifies the signed `state` before redirecting, because the error case is the one people forget to protect.

**Sessions come back through a single-use handoff code, not tokens in the URL.** The callback redirects to the front-end with a two-minute code, which that page exchanges over `POST` for the real tokens. URLs end up in browser history, `Referer` headers and server logs; a refresh token leaking into any of those is a durable account compromise.

**The button follows Google's Sign-In Branding Guidelines rather than this product's design language** — `pdf-web/src/components/ui/google-button.tsx`. That inversion is deliberate: users are being asked to hand over a Google account, and the button they trust is the one identical to every other Google button they have used. A restyled approximation reads as a phishing attempt. Fixed by the guidelines and not to be "improved": the official four-colour mark at 18px, Roboto Medium 14px, a 40px minimum height, the neutral border, and wording that matches what the button does (`Sign in` / `Sign up` / `Continue`). Verified in a browser: 19 assertions across all four entry points, including computed colours, mark rendering and the dark-mode surface.

Google is off (`GOOGLE_OAUTH_ENABLED=false`) until credentials exist, so the platform runs without a Google Cloud project — the same pattern as every other external dependency here.

## One-time codes are one mechanism

`verification_codes` backs admin invitations, the OAuth handoff, and the password-reset and email-verification flows that will follow. They are the same primitive — a hashed, expiring, single-use, attempt-limited secret bound to a subject — differing only in `purpose`. Four separate implementations would be four chances to get expiry, single-use or attempt-limiting subtly wrong, and the one that is wrong is the one that gets exploited.

Codes are hashed through the same `PasswordHasher` port as passwords, never stored in plaintext. For a six-digit code the keyspace is small, so `maxAttempts` and `expiresAt` — not hash strength — are what make guessing impractical. Tokens carry their own subject (`base64url(email).secret`) so verification is one indexed lookup plus one hash check; trusting the email half only selects which row to verify against, and the secret half still has to match it.

## Email

`backend/src/shared/mail/` — a `MailProvider` port with three adapters: `log` (prints to the application log), `smtp` (any provider that speaks SMTP), and `resend` (Resend's REST API), selected by `MAIL_DRIVER`. Production uses `resend`: Cloud Run blocks outbound SMTP ports, and an API that reports bounces per message beats an SMTP relay that answers `250 OK` and goes quiet. `smtp` is kept because it is the one protocol Gmail, Brevo, SES, Mailgun and Postmark all speak, so falling back to any of them is a credentials change. Neither adapter uses a vendor SDK — Resend is a single `POST`, called with `fetch`, for the reason the Razorpay adapter gives.

Callers go through `MailService`, not the port directly. It records every
attempt to `email_deliveries` and offers two methods, and which one a flow uses
is a real decision: `send` throws when delivery fails, for mail that *is* the
feature (an invitation nobody receives is a broken invitation); `sendBestEffort`
never throws, for mail that merely accompanies something that already happened
and cannot be undone (an account created, a payment captured). Provider
failures are logged in full but never returned — a caller is told only "could
not send right now", because "Resend daily limit exceeded" describes our
billing arrangement, not the user's problem.

## Rate limiting

Counted **per signed-in account**, falling back to IP only for anonymous
traffic, with a second per-IP ceiling underneath.

An IP address was only ever standing in for an identity, and on a shared
network it stands in badly. A school or hostel puts hundreds of devices behind
one public address, so under plain IP limiting they share a single allowance:
with a 20/minute sign-in limit, the twenty-first student is refused for
something the other twenty did. Raising the numbers does not fix that. It moves
the point at which the wrong people are blocked, and buys it by weakening the
limit against the abuse it exists to stop.

So `IdentityThrottlerGuard` keys on the access token's `sub` when there is a
valid one, and on the address otherwise.

| Layer | Default | Setting | Keyed on |
| :--- | :--- | :--- | :--- |
| `default` | 120/min | `RATE_LIMIT_PER_MINUTE` | account when signed in, address when not |
| `ip-ceiling` | 3,000/min | `RATE_LIMIT_IP_CEILING_PER_MINUTE` | address, always |

Both are configuration rather than constants, because the defaults are derived
from estimated usage and only real traffic settles them — tuning a limit should
not cost a rebuild and a redeploy. The window is fixed at one minute: every
limit here, in the route decorators and in this document is expressed per
minute, and making the window variable too would turn "120" into a number that
means nothing on its own.

Boot fails if the ceiling is set below the per-caller limit. Inverted, it stops
being a backstop and becomes the real limit — reinstating the shared-network
problem that counting per account exists to remove, and silently, because both
limits still appear to work.

**Why 120.** A page view costs two or three API calls, so a student clicking a
new page every few seconds generates 40–50 a minute. 120 is well clear of that
and far below anything automated.

**Why 3,000, and why a ceiling at all.** Per-account counting widens one gap:
someone holding several accounts would get an allowance per account. The
ceiling closes it by counting every request against its source address as well.
It is sized from the other end — roughly 100 students browsing hard on one NAT
is ~2,000/min, while a trivial script manages ten times 3,000 from a single
source. Nothing legitimate should ever reach it; if it trips, something is
wrong. It is a backstop, not a budget.

**The token is verified, never merely decoded.** A JWT's payload is readable and
writable by anyone holding it, so trusting an unverified `sub` would let a
caller invent an identity per request and mint unlimited buckets — strictly
worse than counting by address, which at least cannot be chosen freely. Only
the signature is checked; there is no lookup to confirm the account still
exists, because rate limiting needs a stable name to count against and a
suspended user is refused a moment later by the guard that does care.

**Why the throttler verifies the token itself** rather than reading
`request.user`: guard order runs throttling before authentication, so that a
flood is rejected without paying for signature checks. Reordering so
`request.user` were populated first would undo exactly that.

Anonymous limits remain per-address, because there is genuinely nothing else to
key on. `/auth/google/start` is therefore set higher than its siblings (60/min):
it only mints a state token and redirects, so flooding it achieves nothing,
while `exchange` and the payment routes stay tight because they do real work.

### What this does not cover

Requests reach the API through the Next.js service, which proxies `/api/*`. A
flood is therefore absorbed by the **frontend** instances before the backend
ever rejects it — they still accept the connection, run middleware and forward
it, and Cloud Run still bills for that. Limiting in the backend protects the
database and the expensive work behind it; it does not protect the frontend's
compute from volume.

That is deliberate for V1 rather than overlooked. The backend is where the
limit can be meaningful — it is the side that knows who the caller is, and the
side where a request actually costs something. The Next.js middleware would
have to verify tokens itself to key by account, and its counters would live in
per-instance memory on a service that scales to zero, so they would be
approximate at best and reset constantly.

The right home for volumetric protection is the edge, in front of both
services — Cloud Armor or a CDN's own rate limiting, which reject traffic
before it reaches any instance. That is a paid component and is deferred; see
`docs/gcp/05-scaling-roadmap-todos.md`.

It lives in `shared/` rather than inside identity because it is cross-cutting: invitations need it today, and password reset, receipts and refund notices need it next. `MAIL_DRIVER=log` is refused in production by env validation — an invitation link written to a log file is both a broken flow and a credential in plaintext logs.

## What is deliberately not being built yet

Full OIDC/OAuth2 with an authorization server, third-party sign-in, email verification delivery, password reset, and multi-factor authentication are all compatible with the above and none are in V1. The commitments that would be expensive to add later — asymmetric signing, token families, a single account table — are made; the rest are additive.
