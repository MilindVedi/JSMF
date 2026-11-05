# PYQ subscriptions & pricing management

How plans, prices, the shared benefits list and the free trial work, how an admin changes them, and what keeps that safe.

## 1. The switch

`SUBSCRIPTION_MANAGEMENT_ENABLED` (API env var, default `false`) decides whether anything on the admin page may be **changed**. It works like `REFUNDS_ENABLED`:

| | Off (default) | On |
|---|---|---|
| Admin page **PYQ → Plans & trial** | Readable; every control disabled, with a notice saying why | Fully editable |
| Every write endpoint | `409 SUBSCRIPTION_MANAGEMENT_DISABLED` | Allowed (ADMIN only) |
| Plans on sale, running trials, the trial offer | **Keep working exactly as configured** | Same |

The flag only gates *changes*. Turning it off never takes a plan off sale or ends a trial. It is read from the environment and nothing else: no request, setting or role can turn it on. The check sits inside the services (`assertSubscriptionManagementEnabled`), not only the controller, so no future caller can skip it.

To turn it on: set `SUBSCRIPTION_MANAGEMENT_ENABLED=true` on the `jsmf-api` Cloud Run service (or `backend/.env` locally) and redeploy. Turn it back off when you're done editing if you want pricing locked.

## 2. Plans

**What a plan is.** An ordinary product (type `COURSE`, `accessType PAID`, currency INR) with `metadata` `{"pyqSubscription": true, "durationMonths": N, "popular": bool}`. Being a product is what lets checkout, Razorpay settlement, refunds, invoices and finance reports work for plans with no special code. The shape is read only in `backend/src/shared/pyq-plan.ts`. Plans made before this feature carry `durationDays` instead and keep working.

**What an admin can set:** length (1–36 calendar months), price (₹1–₹1,00,000, whole rupees), an optional struck-through "was" price (must be higher than the price), the name on the card (defaults to "3 months" and so on), one line under it, the "Best value" badge, and on sale / off sale.

**What every plan shares:** the benefits list (up to 12 lines, 120 characters each), stored once in `pyq.subscription_settings.features` and shown on every plan card. Plans differ only in length and price.

**Rules, enforced in `PyqPlanAdminService`:**

1. **Price and length never change in place.** Saving a new price or length creates a new product and takes the old one off sale, with `supersededBy` pointing at the new one. The reason: an order is priced when checkout starts, but its term is read when the payment settles. Editing in place would let someone mid-checkout who saw "12 months for ₹7,999" be given one month. Old versions stay valid for everyone on them, and the admin page shows only current versions. Name, tagline, "was" price and badge do change in place.
2. **A plan is never deleted or archived.** Access checks skip archived products, so archiving a plan would cut off everyone on it. Retiring a plan means taking it off sale.
3. **At most 6 plans on sale, never two with the same length.**
4. **Every write is serialised** with a Postgres advisory lock, so two admins saving at once cannot both "replace" a plan or both put a 3-month plan on sale.
5. **Every write is audited** in the same transaction as the change (`pyq.plan_created`, `pyq.plan_updated`, `pyq.plan_replaced`, `pyq.plan_put_on_sale`, `pyq.plan_taken_off_sale`).

**The generic Products page refuses plans.** It is open to EDUCATOR accounts and knows none of the rules above, so `ProductService` rejects any edit, publish, unpublish or archive of a plan with 409, and plans no longer appear in its list. Before this change an educator could reprice a plan, or archive one and cut off every subscriber.

**How a purchase sets the expiry** (`applyPlanTerm` in `payment.service.ts`, on the settlement that moves the order to PAID): one term from the latest of:

- now;
- the furthest expiry of **any** plan the student holds — the same plan renewed early, a different plan, or an older version of this one;
- the end of a running free trial.

So paying early never loses paid days, and paying during a trial never loses trial days. A month is a calendar month; a day that doesn't exist in the target month lands on that month's last day (31 Jan + 1 month = 28 or 29 Feb). A perpetual admin gift is never shortened. A redelivered webhook never adds days twice.

## 3. Free trial

**Settings** (`pyq.subscription_settings`): on/off (off by default) and length in days (1–90, also a database CHECK).

**What the student gets:** full plan access (unlimited questions) until `endsAt`.

**How it starts:** the student taps **Start free trial** on `/subscription` (web). It never starts on its own. The mobile app shows a running trial but never offers one, because the app sells nothing.

**Who may start one**, re-checked on the server at the moment of starting, never trusted from the page:

- trials are on (read straight from the database, not the cache, so turning trials off takes effect at once);
- the account has never had a trial;
- the account has never held any plan — bought, gifted, expired or refunded.

**Once per account** is the primary key on `pyq.trials.user_id`, not a check in code. Four simultaneous taps produce exactly one trial; the rest get 409. The endpoint is also rate-limited to 5 a minute per client.

**Changing settings later:** turning trials off, or changing the length, applies to trials started *afterwards*. A running trial keeps the length it started with.

**Known limit:** a person can sign up with a second email address and get a second trial. Closing that would need something tied to the person, such as a verified phone number. It isn't built.

## 4. API

| Method & path | Who | What |
|---|---|---|
| `GET /api/pyq/plans` | Public | Plans on sale, shortest first, each with the shared benefits. Cached 60 s and dropped on every admin change |
| `GET /api/pyq/trial` | Public | `{enabled, days}` — for pricing copy only |
| `GET /api/pyq/access` | Signed in | `subscribed`, limits, `plan`, `trial`, `trialOffer` |
| `POST /api/pyq/trial` | Signed in | Start the trial → the new access. 409 `PYQ_TRIAL_UNAVAILABLE` / `PYQ_TRIAL_NOT_ELIGIBLE` |
| `GET /api/admin/pyq/subscription` | ADMIN | Everything the admin page shows, plus `managementEnabled` (read-only) |
| `PATCH /api/admin/pyq/subscription/settings` | ADMIN + switch | Trial on/off, trial days, benefits |
| `POST /api/admin/pyq/subscription/plans` | ADMIN + switch | Create a plan |
| `PATCH /api/admin/pyq/subscription/plans/:id` | ADMIN + switch | Edit; a new price or length returns a **new** plan (new id) |
| `PUT /api/admin/pyq/subscription/plans/:id/on-sale` | ADMIN + switch | `{onSale}` |

Admin writes are rate-limited to 10 a minute. Inputs are validated strictly, and unknown fields are rejected (the global `forbidNonWhitelisted`). Money travels as a string of paise, never as a float.

## 5. Security summary

- **Who:** ADMIN role only (educators can't).
- **When:** only while the deployment sets the env switch, and no request can set it.
- **What a buyer pays:** always read from the product at checkout, never from the request. Terms never change under an order in flight.
- **What existing subscribers keep:** always their full term. Nothing on the admin page can shorten or revoke it; only a refund does, as before.
- **Trials:** one per account, guaranteed by the database. Eligibility is re-checked on the server.
- **Trail:** every admin change is in the audit log with before/after, actor and IP.
- **Defence in depth:** bounds are checked by the DTOs, again by the service, and for the trial length by a database CHECK.

## 6. Code map

- `backend/src/shared/pyq-plan.ts`: plan terms, calendar-month maths, `extendedExpiry`
- `backend/src/modules/questions/application/pyq-plan-admin.service.ts`: plan admin (versioning, locks, limits)
- `backend/src/modules/questions/application/pyq-subscription.service.ts`: settings and trials
- `backend/src/modules/questions/application/subscription-management.ts`: the env gate
- `backend/src/modules/questions/application/pyq-access.service.ts`: who has unlimited access
- `backend/src/modules/questions/http/admin-pyq-subscription.controller.ts`: admin endpoints
- `pdf-web/src/app/(admin)/admin/pyq/plans/page.tsx`: the admin page
- `web/src/components/subscription/api-subscription.tsx`: the student's `/subscription`
- Tests: `backend/src/modules/questions/application/pyq-subscription.integration.spec.ts`
