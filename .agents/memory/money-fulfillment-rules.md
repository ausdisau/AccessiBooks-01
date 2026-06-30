---
name: Money fulfillment rules
description: Non-negotiable correctness rules for Stripe webhook fulfillment and the credits/ownership economy.
---

Rules learned while building the commercial credits + bundles economy (Audible-style: buy credit packs, redeem titles with credits, buy cash bundles).

**Rule 1 — Webhook fulfillment must NOT swallow errors.** A `checkout.session.completed` handler that catches a fulfillment failure, logs it, and still returns `{received:true}` leaves a *paid* customer with no credits/ownership, and Stripe will never retry. On any non-duplicate fulfillment failure, let the error propagate so the endpoint returns 500 and Stripe retries.

**Why:** Re-delivery is the only recovery path for a transient DB error during fulfillment.

**Rule 2 — Retries must be idempotent.** Before fulfilling, check a dedupe row keyed by the Stripe event/session id (here: `paymentTransactions.providerTransactionId`). Grants also carry their own idempotency key (e.g. `stripe:checkout_session:<id>`), and ownership inserts use `ON CONFLICT (user_id, book_id) DO NOTHING`. Together these make a 500-driven retry safe.

**Rule 3 — Claim ownership BEFORE spending.** When redeeming a title with credits, INSERT the ownership/purchase row first (relying on the unique `(user_id, book_id)` index), treat `rowCount === 0` as "already owned" and refuse to charge, and only THEN debit credits. Doing the ownership check and the debit as separate steps leaves a race where a concurrent cash purchase grants the title between the check and the debit, so the user is charged a credit for something they already own. The debit and insert run inside one per-user-locked transaction, so a failed debit rolls back the reservation.

**How to apply:** Any new paid-grant path (new pack type, new bundle kind, gift, promo) must follow all three rules. Per-user serialization is via a transaction that locks the `credit_accounts` row `FOR UPDATE`; FIFO debit orders grants by `expires_at ASC NULLS LAST, created_at ASC`.
