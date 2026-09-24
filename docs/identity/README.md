# JSMF Centralized Identity

This folder documents JSMF's **centralized identity system** — the single login, account, and role model shared by every JSMF application (the PYQ question bank, the [PDF platform](../pdf-platform/README.md), a future Flutter app, and whatever follows).

## Why this is documented separately

Identity is platform-wide, not a feature of any one product. It happens to have been built first as part of the PDF platform's backend — the first product to need a real backend at all — but it is not a PDF-platform concern, and folding its documentation into that folder would misstate what it is. A person is one JSMF account across every product; that decision, and the mechanics behind it, belong in their own place, the same way the PDF platform's own scope and data model get their own folder rather than living inside the PYQ docs.

## Contents

| Document | Description |
|---|---|
| [01 — Architecture](./01-architecture.md) | Why identity is centralized, the specific choices that make it genuinely so (RS256, bearer tokens, refresh-token families with reuse detection, Argon2id), and what is built and verified today. |
| [02 — Data Model](./02-data-model.md) | The `users`, `roles`, `user_roles`, `refresh_tokens`, `oauth_accounts` and `verification_codes` tables, and the reasoning behind the ones that are not obvious. |

## Status

Built and verified end to end — see [01 — Architecture](./01-architecture.md#status-built) for the endpoint list, the behavioral guarantees, and the test results (14 assertions, including the reuse-detection forensic trail confirmed directly in the database).

Since then, three further pieces are built and verified:

- **[Admin accounts by invitation](./01-architecture.md#admin-accounts-are-created-by-invitation)** — an existing admin invites by email; there is no public way to request access. Verified in a real browser: 10 assertions covering an invalid link, a valid link, accepting it, the new admin reaching the admin panel, and a consumed link being refused on reuse.
- **[Google sign-in](./01-architecture.md#google-sign-in)** — platform-wide, for buyers and invited admins alike, with an allowlisted redirect so every JSMF application can use the same flow. Off until Google credentials are configured.
- **[Email](./01-architecture.md#email)** — a `MailProvider` port in `shared/mail/` with `log` and `smtp` adapters, reusable by any module.

## How other JSMF applications use it

Any application — this backend's own other modules, a future PYQ backend, a future Flutter app — authenticates against this module's endpoints and then verifies tokens locally using the public key published at `GET /api/auth/jwks`. No other module or application ever holds the private signing key, which is what makes this decision hold even if identity is later extracted into its own service: nothing that depends on it would need to change, because nothing that depends on it was ever trusted with more than a public key.
