# Identity — Data Model

These tables are owned by the `identity` module (`backend/src/modules/identity/`) and used by every JSMF application, not just the PDF platform. They follow the same conventions as the rest of the schema — `uuid` v7 primary keys, `timestamptz` throughout — documented in full in the [PDF platform data model](../pdf-platform/03-data-model.md#conventions-applied-everywhere).

## `users`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `email` | citext | **UNIQUE NOT NULL.** `citext` so `Milind@x.com` and `milind@x.com` cannot become two accounts. |
| `email_verified_at` | timestamptz NULL | |
| `phone` | varchar(20) NULL | UNIQUE where not null. India-first: useful for Razorpay prefill and WhatsApp delivery later. |
| `name` | varchar(120) NOT NULL | |
| `avatar_storage_provider`, `avatar_object_key` | enum / text, both NULL | An avatar is a file we host, addressed the same way as every other stored file — never a raw URL column. Both null together when no avatar is set. Two plain columns rather than a `product_assets`-style row: an avatar is single, unversioned, and owned 1:1 by a user, so that table's extra machinery (kind, version, is_current) would be unused weight here. |
| `password_hash` | text NULL | Nullable — an OAuth-only account has no password. Argon2id. |
| `status` | enum | `ACTIVE`, `SUSPENDED`, `DELETED` |
| `last_login_at` | timestamptz NULL | |
| `created_at`, `updated_at` | timestamptz | |

## `roles` and `user_roles`

Roles are a **table, not a column on `users`**, because one person is realistically both an admin and an educator, and a single `role` column cannot express that without a migration the first time it happens.

**`roles`** — `id` uuid PK, `key` varchar(40) UNIQUE (`ADMIN`, `EDUCATOR`, `STUDENT`), `name`, `description`, `created_at`.

**`user_roles`** — `user_id` FK→users, `role_id` FK→roles, `granted_at`, `granted_by` FK→users NULL. **PK (`user_id`, `role_id`)**.

## `refresh_tokens`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK→users | |
| `token_family_id` | uuid NOT NULL | Every token descended from one login shares this id. |
| `token_hash` | text UNIQUE NOT NULL | The raw token is never stored — only its SHA-256 hash. |
| `expires_at` | timestamptz | |
| `revoked_at` | timestamptz NULL | |
| `revoked_reason` | enum NULL | `ROTATED`, `REUSE_DETECTED`, `LOGOUT`, `ADMIN_REVOKED` |
| `user_agent`, `ip` | text / inet | |
| `created_at` | timestamptz | |

**Indexes** — `(user_id, expires_at)`, `(token_family_id)`.

**Constraint** — `CHECK` that `revoked_at` and `revoked_reason` are either both set or both null.

**Why the family id exists.** Refresh tokens rotate: each one is single-use, and exchanging it issues a successor in the same family. If a token that has *already* been rotated is presented again, either the legitimate client or an attacker is replaying it — and there is no way to tell which. So the entire family is revoked at once and the user re-authenticates.

Without the family id, a stolen refresh token could be refreshed indefinitely alongside the real session and nothing would ever detect it. `revoked_reason` is what makes that check possible at all: it is how the refresh endpoint distinguishes "this token was legitimately rotated" (→ replay, kill the family) from "this token is simply dead" (→ reject), which is precisely the distinction an attacker benefits from being unable to make.

## How other tables reference these

Every JSMF application's tables reference `users` rather than keeping their own account table. In the PDF platform, for example, `products.author_user_id`, `orders.user_id`, and `entitlements.user_id` all point here — see the [cascade-delete reference](../pdf-platform/04-cascade-deletes.md) for exactly what happens across every product's tables when a user account is deleted.


## `oauth_accounts` — third-party identities

A separate table rather than a `google_id` column on `users`, for two reasons. An account may eventually link several providers (Google today, Apple when the iOS app ships), and the **provider's own subject id is the stable key, not the email** — Google documents explicitly that an address can change hands, so matching on it would eventually hand someone another person's account.

| Column | Notes |
|---|---|
| `provider` | `OAuthProvider` enum. `GOOGLE` today. |
| `provider_user_id` | Google's `sub`. Immutable. |
| `email` | What the provider asserted at link time — kept for support and audit only. **Authorisation never reads it.** |
| `last_login_at` | Distinct from `users.last_login_at`, so "when did they last use Google specifically" stays answerable. |

Two unique constraints: `(provider, provider_user_id)` stops one Google account being attached to two JSMF accounts, and `(user_id, provider)` stops one JSMF account collecting two Google links.

`users.password_hash` is nullable precisely so an account created through Google has no password at all, rather than a placeholder that could be guessed or reset into.

## `verification_codes` — one-time secrets

One table for every "prove you received this" flow: admin invitations, the OAuth handoff, and the password-reset and email-verification flows to come. They differ only in meaning, so they differ only by `purpose`.

| Column | Notes |
|---|---|
| `purpose` | `ADMIN_INVITATION` · `OAUTH_HANDOFF` · `EMAIL_VERIFICATION` · `PASSWORD_RESET`. The last two are unused today and exist so adding those flows needs no migration. |
| `subject` | What the code is about — an email for an invitation, a user id for a handoff. **Not a foreign key**: an invited address has no account yet, which is the entire point. |
| `code_hash` | Hashed through the same `PasswordHasher` port as passwords. The plaintext exists only in the moment it is issued. |
| `sent_to_email` | Where it was delivered, or null when it is not emailed at all (`OAUTH_HANDOFF`). |
| `metadata` | Flow-specific payload — the invitee's name, who invited them. |
| `attempts` / `max_attempts` | A six-digit code is one-in-a-million per guess, which is nothing if guesses are unlimited. |
| `consumed_at` | Single use. Consumption is a conditional update, so two requests racing with the same code produce exactly one success. |

Issuing a code supersedes any live code for the same `(purpose, subject)` — otherwise someone who requested a second code because the first did not arrive would leave two valid codes outstanding, doubling the guessing surface.
