# Cascade Deletes — Reference

Every `ON DELETE CASCADE` relation in the schema, what it actually deletes, and why it was judged safe. Kept as a standalone reference because this is exactly the kind of thing that's easy to lose track of as the schema grows — a future column added to the wrong side of a relation is a silent, hard-to-notice mistake, and this file is what a review should be checked against.

**Current count: 11 `CASCADE` relations, touching 8 tables.** (For comparison: 11 `RESTRICT`, 15 `SET NULL` — see [Data Model](./03-data-model.md) for those.)

If you add, remove, or change any `onDelete` behavior in `schema.prisma`, update this file in the same change.

## The rule every entry here follows

A relation is `CASCADE` only when the child row has **zero meaning on its own** once the parent is gone — almost always a join-table row recording "this thing is associated with that thing," never a row with independent business, financial, or content value. Anything with real value — sold products, paid orders, active access grants, uploaded files, taxonomy in active use — is `RESTRICT` instead, specifically so the database refuses the delete outright rather than quietly taking dependent data with it. See [Data Model](./03-data-model.md) for the full reasoning on several of these.

## Every cascade, one at a time

### Deleting a `User` cascades across **five** tables

This is the biggest blast radius of any single delete in the schema, so it's worth seeing all five at once rather than scattered across a table:

| Child table | What's deleted | Why this is fine |
|---|---|---|
| `user_roles` | Every role assignment for this user | The row just records "this user has this role" — meaningless once the user doesn't exist. |
| `refresh_tokens` | Every login session for this user | A session for a deleted user must not remain usable. |
| `entitlements` | Every access grant this user holds | **In practice unreachable for a user who has ever placed an order** — `orders.user_id` is `RESTRICT`, so a user with purchase history can never be hard-deleted at all. This only fires for a user who was never entitled via a paid order (e.g. a free-claim-only account, or one with no activity). |
| `coupon_redemptions` | Every coupon redemption by this user | Not built in V1 — no live code path exercises this. |
| `publisher_profiles` | Their publisher profile (1:1) | Owned data with no meaning detached from the account. |

**Note the compounding effect:** since `entitlements.user_id` is `CASCADE`, not `RESTRICT`, a User delete really can remove real access-grant rows — just only for users the `orders` guard doesn't already protect. If you ever want *no* user to be hard-deletable once they have any entitlement at all (even a free one), that would mean changing `entitlements.user_id` to `RESTRICT` too — a real option, not done here because a never-purchased, free-only account was judged low-stakes enough to allow cleanup.

### Deleting a `Role`

| Child table | What's deleted |
|---|---|
| `user_roles` | Every assignment of this role to any user |

`Role` rows are the three fixed reference values (`ADMIN`, `EDUCATOR`, `STUDENT`) — this is realistically never exercised, but if a role definition were ever removed, its assignments have no meaning without it.

### Deleting an `Order`

| Child table | What's deleted |
|---|---|
| `order_items` | Every line item on this order |
| `coupon_redemptions` | The redemption tied to this order (not built in V1) |

**In practice unreachable for any order that was ever paid** — `payments.order_id` and `refunds.order_id` are both `RESTRICT`, so an order with any payment activity can never be hard-deleted. This only fires for an order that was created and then abandoned before payment (status `CREATED`, never `PAID`) — nothing of value to lose there.

### Deleting a `Coupon`

| Child table | What's deleted |
|---|---|
| `coupon_redemptions` | Every redemption of this coupon |

Not built in V1 — no live code path writes to either table yet.

### Deleting a Product that is a bundle's parent (`ProductBundleItem.bundle`)

| Child table | What's deleted |
|---|---|
| `product_bundle_items` | The "what's inside this bundle" rows for this bundle |

Only the bundle-parent side — the child-product side (`ProductBundleItem.child`) is `RESTRICT`, so a product that is *inside* a bundle can't be deleted out from under it. Not built in V1.

### Deleting a Product (its own tag assignments only — `ProductTaxonomyTerm.product`)

| Child table | What's deleted |
|---|---|
| `product_taxonomy_terms` | This product's own subject/topic/exam tags |

Only removes the product's *own* tag rows, which have no meaning without it. This is deliberately the one side of that join table still on `CASCADE` — the other side (`ProductTaxonomyTerm.term`) is `RESTRICT`, because deleting a *term* (e.g. "Pathology") must never be allowed to silently untag every other product that uses it. See [Data Model](./03-data-model.md#product_taxonomy_terms) for that distinction.

## What's deliberately **not** in this list

Everything with real stakes is `RESTRICT`, not `CASCADE` — meaning the database refuses the delete rather than cascading through it. Worth naming these explicitly, since "what does NOT cascade" is as important as what does:

- A **sold** `Product` (`order_items.product_id`, `entitlements.product_id`) — can never be hard-deleted.
- A **paid** `Order` (`payments.order_id`, `refunds.order_id`) — can never be hard-deleted.
- A `User` who has **ever ordered anything** (`orders.user_id`) — can never be hard-deleted.
- A `Product`'s **files or links** (`product_assets.product_id`, `product_links.product_id`) — a product can't be deleted while it has any.
- A `TaxonomyTerm` **in active use** (`product_taxonomy_terms.term_id`) — can't be deleted while any product carries it.
- A `Taxonomy` **kind that still has terms** (`taxonomy_terms.taxonomy_id`) — must be emptied first, deliberately.

And separately, `content_access_events.product_id`/`.asset_id` are `SET NULL`, not `CASCADE` or `RESTRICT` — the download-audit log is designed to outlive the thing it logged, so it survives with a nulled-out pointer rather than either blocking the delete or disappearing. See [Data Model](./03-data-model.md#content_access_events).

## The bigger picture: this table almost never matters

The application is being built to **never issue a real `DELETE`** on anything with a lifecycle — a product is archived, an order simply stays in its terminal status, and so on. So in normal operation, none of the `RESTRICT`s above are ever actually tested, and most of the `CASCADE`s above only ever fire for genuinely inert data (an abandoned draft, a never-purchased account). Both lists exist as a database-level backstop against a bug or a stray admin action doing a real delete anyway — not as something the application is expected to rely on day to day.
