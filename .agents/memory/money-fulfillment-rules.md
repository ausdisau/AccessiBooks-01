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

**Rule 4 — For capped/seat-based grants (institutional licensing), make FULFILLMENT the single authoritative cap point, not checkout.** A "claim org as pending at checkout + revert on failure" design loses every concurrency round (two checkouts, checkout-vs-invite, revert races). Instead: checkout does a mutation-free best-effort capacity check (UX only) and just stamps `status='pending'+sessionId`; the webhook fulfillment is the one place that enforces the cap. Fulfillment, in one tx: conditional `UPDATE ... WHERE status='pending' RETURNING` (the idempotency + activation serializer), then **reconcile entitlements from scratch** — `DELETE FROM entitlements WHERE reason='institutional:<orgId>'` for the whole org, then re-grant only the seated subset (admins first, slice to `plan.seats`; site = all), and set `current_seats = #seated`. Deleting all org-tagged rows first is what prevents over-grant: an over-cap/legacy org would otherwise keep stale entitlements for now-unseated members, so effective access exceeds paid seats.

**Why:** invariant `current_seats == #seated members == #granted org entitlements` must hold across fulfillment, invite, and reclaim, including legacy over-cap orgs and renewals.

**How to apply:** Keep lock ordering consistent to avoid deadlock and orphan-entitlement windows: every path takes the **account row first, then member rows**. Fulfillment locks the account via its conditional UPDATE, then `SELECT members ... FOR UPDATE`. Invite (allocateMember) takes the account via an atomic capped `UPDATE current_seats=current_seats+1 WHERE ... (license_type='site' OR current_seats<max_seats) RETURNING` then inserts the member. Reclaim must `SELECT id FROM institutional_accounts WHERE id=$1 FOR UPDATE` as its FIRST statement, then lock the member; it decrements `current_seats` ONLY if the entitlement delete returned `rowCount>0` (i.e. the member actually held a seat), so unseated over-cap members can be removed without corrupting the count.

**Rule 5 — A reward CATALOG seeded at startup must have a unique constraint + ON CONFLICT DO NOTHING, never count-then-insert.** When a feature seeds claimable rewards on boot/rollover (e.g. battle-pass milestones across free+premium tracks), a "if count==0 then insert all" guard is a race: two concurrent boots/rollovers both read 0 and both insert the full set, producing duplicate reward rows. Because claims are tracked by reward *id*, each duplicate is separately claimable → the same streak-freeze/trial/discount is granted twice.

**Why:** duplicate separately-claimable rewards are a silent money/economy leak that no per-user idempotency catches — the dupes are distinct legitimate ids.

**How to apply:** Put a unique index on the reward's natural key (battle-pass: `(battle_pass_id, tier, is_premium)`), and make every seed/backfill an `insert(...).onConflictDoNothing({ target: [...] })` over that key (self-heals partial seeds, preserves pre-existing rows). Create the parent + its rewards in one `db.transaction` so a crash mid-seed can't leave an active season with a partial set. Dedupe any legacy duplicates (`DELETE ... USING ... WHERE a.id > b.id`) before adding the unique index.
