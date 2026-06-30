// Institutional / B2B licensing (Task #216)
//
// A paid, server-authoritative activation layer over the existing institutional
// org/member dashboard. An org admin buys a licence (seat-based or site-wide);
// once Stripe confirms payment the org activates and every member inherits the
// institutional entitlement automatically, up to the seat cap.
//
// Money-correctness rules (do not weaken without re-review):
//  - The server is the sole source of price and seat count. The client only
//    sends a planKey + billingCycle; cents and seats are looked up from
//    LICENSE_PLANS (in @workspace/db) here.
//  - Fulfilment is webhook-gated and idempotent: a conditional UPDATE that only
//    advances a `pending` org row is the source-of-truth gate (any paid checkout
//    for that org activates it exactly once). Entitlement grants run on the SAME
//    transaction so activation + inheritance either both commit or both roll back.
//  - Seat caps are enforced transactionally with an atomic conditional
//    increment, so concurrent invites can never exceed the cap. Site licences
//    bypass the cap (they are unlimited within the org) — never a fake huge max.
//  - Member entitlements expire at the licence period end, so access is revoked
//    automatically when a term lapses; removing a member revokes immediately.

import type { PoolClient } from "pg";
import { eq } from "drizzle-orm";
import { pool, db } from "./db";
import { stripe } from "./stripe";
import {
  institutionalAccounts,
  institutionalMembers,
  getLicensePlan,
  getLicensePriceCents,
} from "@workspace/db";

export class InstitutionalLicenseError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "InstitutionalLicenseError";
  }
}

// Every org-granted entitlement row is tagged with this reason so it can be
// found and revoked precisely without touching other entitlements a user holds.
const ORG_ENTITLEMENT_PREFIX = "institutional:";
export function orgEntitlementReason(orgId: string): string {
  return `${ORG_ENTITLEMENT_PREFIX}${orgId}`;
}

// ---------------------------------------------------------------------------
// Entitlement helpers (operate on a transaction client)
// ---------------------------------------------------------------------------

/**
 * Grant (or refresh) the institutional entitlement for a member, idempotently.
 * Clears any prior org-tagged row for this user first, then inserts a fresh one
 * carrying the licence period end as its expiry.
 */
async function grantOrgEntitlementTx(
  client: PoolClient,
  userId: string,
  orgId: string,
  periodEnd: Date | null,
): Promise<void> {
  const reason = orgEntitlementReason(orgId);
  await client.query(`DELETE FROM entitlements WHERE user_id = $1 AND reason = $2`, [userId, reason]);
  await client.query(
    `INSERT INTO entitlements (user_id, tier, expires_at, reason) VALUES ($1, 'institutional', $2, $3)`,
    [userId, periodEnd, reason],
  );
}

/**
 * Revoke a single member's org entitlement (used on seat reclaim). Returns the
 * number of entitlement rows removed so callers can tell whether the member was
 * actually seated (had an entitlement) versus an unseated over-cap member.
 */
async function revokeOrgEntitlementTx(
  client: PoolClient,
  userId: string,
  orgId: string,
): Promise<number> {
  const res = await client.query(`DELETE FROM entitlements WHERE user_id = $1 AND reason = $2`, [
    userId,
    orgEntitlementReason(orgId),
  ]);
  return res.rowCount ?? 0;
}

// ---------------------------------------------------------------------------
// Purchase: create a server-priced Stripe checkout session
// ---------------------------------------------------------------------------

/**
 * Create a Stripe checkout session for an institutional licence. Server-priced
 * from LICENSE_PLANS; the org's status is left/forced to `pending` and the
 * session id is stored as the idempotency anchor for webhook fulfilment.
 *
 * Renewal/upgrade of an already-active, in-term licence is intentionally
 * blocked here (out of scope: self-serve quoting); expired/pending/canceled
 * orgs may purchase to (re)activate.
 */
export async function createLicenseCheckout(args: {
  userId: string;
  orgId: string;
  planKey: string;
  billingCycle: string;
  origin: string;
}): Promise<{ checkoutUrl: string }> {
  if (!stripe) throw new InstitutionalLicenseError(503, "Payment system is not configured.");

  const plan = getLicensePlan(args.planKey);
  const amountCents = getLicensePriceCents(args.planKey, args.billingCycle);
  if (!plan || amountCents === undefined) {
    throw new InstitutionalLicenseError(400, "Invalid plan or billing cycle.");
  }

  const [org] = await db
    .select()
    .from(institutionalAccounts)
    .where(eq(institutionalAccounts.id, args.orgId));
  if (!org) throw new InstitutionalLicenseError(404, "Organization not found.");

  const inTerm = org.periodEnd ? org.periodEnd.getTime() > Date.now() : false;
  if (org.status === "active" && inTerm) {
    throw new InstitutionalLicenseError(409, "Licence is already active.");
  }

  // Best-effort UX guard: warn an admin buying a seat plan that is smaller than the
  // org's current membership before taking payment. This is intentionally NOT the
  // authoritative cap — fulfilment seats at most plan.seats members and
  // allocateMember enforces the cap atomically on every later invite — so a
  // membership change that races this read can never cause an over-grant; it just
  // means the friendly up-front message is occasionally skipped. Keeping it
  // mutation-free avoids the concurrent-checkout/revert hazards of pre-claiming the
  // org's status here.
  if (plan.licenseType === "seat" && plan.seats !== null) {
    const memberRows = await db
      .select({ id: institutionalMembers.id })
      .from(institutionalMembers)
      .where(eq(institutionalMembers.institutionalId, args.orgId));
    if (memberRows.length > plan.seats) {
      throw new InstitutionalLicenseError(
        400,
        `Your organisation has ${memberRows.length} members, which exceeds this plan's ${plan.seats} seats. Choose a larger plan or remove members first.`,
      );
    }
  }

  const cycleLabel = args.billingCycle === "yearly" ? "Annual" : "Monthly";
  const label = `AccessiBooks ${plan.name} licence (${cycleLabel})`;

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: label, description: plan.description },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: "institutional_license",
        institutionalId: args.orgId,
        planKey: args.planKey,
        billingCycle: args.billingCycle,
        userId: args.userId,
      },
      success_url: `${args.origin}/institutional?checkout=success`,
      cancel_url: `${args.origin}/institutional?checkout=cancelled`,
    });
  } catch (e) {
    throw new InstitutionalLicenseError(502, "Could not start checkout. Please try again.");
  }

  if (!session.url) throw new InstitutionalLicenseError(502, "Could not start checkout. Please try again.");

  // Stamp the pending purchase. Fulfilment activates on the FIRST paid session for a
  // pending org (the WHERE status='pending' gate), so this stays idempotent under
  // webhook retries and concurrent checkouts (the loser no-ops). Setting status to
  // pending also blocks new invites until the licence is (re)activated.
  await db
    .update(institutionalAccounts)
    .set({
      status: "pending",
      stripeSessionId: session.id,
      planKey: args.planKey,
      billingCycle: args.billingCycle,
    })
    .where(eq(institutionalAccounts.id, args.orgId));

  return { checkoutUrl: session.url };
}

// ---------------------------------------------------------------------------
// Webhook fulfilment: activate the licence + grant member entitlements
// ---------------------------------------------------------------------------

/**
 * Idempotently activate a paid licence and grant the institutional entitlement
 * to current members (capped at the plan's seats). The conditional UPDATE
 * (pending -> active) is the source-of-truth idempotency gate; a re-delivery or a
 * payment against an already-active org is a no-op that returns { activated: false }.
 */
export async function fulfillLicensePaid(args: {
  orgId: string;
  sessionId: string;
  planKey: string;
  billingCycle: string;
  amountCents: number;
}): Promise<{ activated: boolean }> {
  const plan = getLicensePlan(args.planKey);
  if (!plan) throw new InstitutionalLicenseError(400, "Unknown plan during fulfilment.");

  // Money-path invariant (defense in depth): price is set server-side at
  // checkout, so the amount Stripe charged must be at least the listed price for
  // this plan + cycle. If it is short, refuse activation rather than grant an
  // underpaid licence. This is an intentional, non-transient rejection (we return
  // rather than throw) so Stripe does not retry it forever.
  const expectedCents = getLicensePriceCents(args.planKey, args.billingCycle);
  if (expectedCents !== undefined && args.amountCents < expectedCents) {
    console.error(
      `[Institutional] Underpaid licence for org ${args.orgId}: paid ${args.amountCents}c < expected ${expectedCents}c (${args.planKey}/${args.billingCycle}). Refusing activation.`,
    );
    return { activated: false };
  }

  const periodEnd = new Date();
  if (args.billingCycle === "yearly") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Source-of-truth idempotency: ANY paid checkout for a `pending` org flips it
    // to active exactly once (the WHERE status = 'pending' gate). We deliberately
    // do NOT require the stored session id to match — an org can open several
    // checkout sessions, and gating on the session id would silently drop a real
    // payment made against a superseded session (money taken, no licence). The
    // webhook's paymentTransactions de-dupe keys on the actual paid session id, so
    // re-delivery is still safe, and concurrent sessions race on the row lock so
    // only the first activates. Seat plans set max_seats from the plan; site
    // licences keep max_seats (the cap is bypassed for them). The session that
    // actually paid is recorded for traceability.
    const upd = await client.query(
      `UPDATE institutional_accounts
         SET status = 'active',
             is_active = true,
             license_type = $2,
             plan_key = $3,
             billing_cycle = $4,
             amount_cents = $5,
             period_end = $6,
             stripe_session_id = $8,
             max_seats = CASE WHEN $7::int IS NULL THEN max_seats ELSE $7::int END
       WHERE id = $1 AND status = 'pending'
       RETURNING id`,
      [
        args.orgId,
        plan.licenseType,
        args.planKey,
        args.billingCycle,
        args.amountCents,
        periodEnd,
        plan.seats,
        args.sessionId,
      ],
    );

    if (upd.rowCount === 0) {
      await client.query("ROLLBACK");
      return { activated: false };
    }

    // Authoritative seat cap: grant the institutional entitlement to current
    // members, but never more than the seats actually paid for. A legacy org can
    // already hold more members than a newly purchased seat plan covers, and an
    // invite can race in before the org flips to pending — so this fulfilment step,
    // which serialises on the `WHERE status='pending'` gate above, is the single
    // source of truth for the cap. Seat the first N (admins first, then oldest
    // joiners) and leave any excess as UNSEATED members rather than ever granting
    // more entitlements than were paid. Site licences seat everyone. current_seats
    // is reconciled to the number actually seated; reclaimMember only frees a seat
    // for a member that holds an entitlement, so the invariant
    // current_seats == seated members == granted entitlements holds even while
    // unseated members exist.
    const seatCap = plan.licenseType === "site" ? null : plan.seats;

    // Reconcile the org's entitlements from scratch so effective access can never
    // exceed the seats just paid for. Clearing every org-tagged row first means any
    // member left unseated below also loses stale institutional access granted by a
    // prior term/activation (otherwise an over-cap legacy org would keep more active
    // entitlements than seats). We then re-grant only the seated subset. The member
    // SELECT takes FOR UPDATE row locks so a concurrent reclaim cannot delete a
    // member out from under this grant; fulfilment and reclaim both take the account
    // row lock first and member rows second, so the ordering cannot deadlock.
    await client.query(`DELETE FROM entitlements WHERE reason = $1`, [
      orgEntitlementReason(args.orgId),
    ]);
    const membersRes = await client.query(
      `SELECT user_id FROM institutional_members
         WHERE institutional_id = $1
         ORDER BY (role = 'admin') DESC, added_at ASC NULLS LAST
         FOR UPDATE`,
      [args.orgId],
    );
    let toGrant = membersRes.rows as Array<{ user_id: string }>;
    if (seatCap !== null && toGrant.length > seatCap) {
      console.error(
        `[Institutional] Org ${args.orgId} has ${toGrant.length} members but the ${args.planKey} plan covers ${seatCap} seats; seating the first ${seatCap} and leaving the rest unseated.`,
      );
      toGrant = toGrant.slice(0, seatCap);
    }
    for (const row of toGrant) {
      await grantOrgEntitlementTx(client, row.user_id, args.orgId, periodEnd);
    }
    await client.query(
      `UPDATE institutional_accounts SET current_seats = $2 WHERE id = $1`,
      [args.orgId, toGrant.length],
    );

    await client.query("COMMIT");
    return { activated: true };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Seat management: allocate (invite) and reclaim (remove), transactional
// ---------------------------------------------------------------------------

/**
 * Allocate a seat to a user and grant the institutional entitlement, atomically.
 * The conditional increment enforces the seat cap under concurrency: it only
 * succeeds when the licence is active, in term, and (for seat plans) below the
 * cap. Site licences bypass the cap. Throws on no capacity / inactive licence.
 *
 * Caller (route) is responsible for admin role check + resolving the email to a
 * user and rejecting users already in an org.
 */
export async function allocateMember(args: {
  orgId: string;
  userId: string;
  role?: string;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Defensive: never consume a seat for someone already in this org.
    const dup = await client.query(
      `SELECT id FROM institutional_members WHERE institutional_id = $1 AND user_id = $2`,
      [args.orgId, args.userId],
    );
    if ((dup.rowCount ?? 0) > 0) {
      await client.query("ROLLBACK");
      throw new InstitutionalLicenseError(400, "User is already a member of this organization.");
    }

    const upd = await client.query(
      `UPDATE institutional_accounts
         SET current_seats = current_seats + 1
       WHERE id = $1
         AND is_active = true
         AND status = 'active'
         AND (period_end IS NULL OR period_end > now())
         AND (license_type = 'site' OR current_seats < max_seats)
       RETURNING period_end`,
      [args.orgId],
    );
    if (upd.rowCount === 0) {
      await client.query("ROLLBACK");
      throw new InstitutionalLicenseError(
        409,
        "No seats available. Your licence is inactive or has reached its seat limit.",
      );
    }

    const periodEnd: Date | null = upd.rows[0].period_end ?? null;

    await client.query(
      `INSERT INTO institutional_members (institutional_id, user_id, role) VALUES ($1, $2, $3)`,
      [args.orgId, args.userId, args.role || "member"],
    );
    await grantOrgEntitlementTx(client, args.userId, args.orgId, periodEnd);

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    // A unique violation means the user was concurrently added to this or another
    // org (enforced by the unique index on institutional_members.user_id), which
    // the route's pre-check can race past. Surface a clean 400; the rolled-back
    // seat increment undoes itself.
    if (e && typeof e === "object" && (e as { code?: string }).code === "23505") {
      throw new InstitutionalLicenseError(400, "User is already a member of an organization.");
    }
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Reclaim a seat: remove the membership, free the seat, and revoke that member's
 * institutional entitlement — atomically. Returns the freed member's userId so
 * the caller can reassign. Caller (route) enforces admin role and any
 * last-admin / self-removal protections.
 */
export async function reclaimMember(args: {
  orgId: string;
  memberId: string;
}): Promise<{ userId: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Take the account row lock FIRST (matching fulfilment's lock order: account row
    // then member rows) so a reclaim that races licence activation serialises behind
    // fulfilment and cannot delete a member while fulfilment is re-granting seats.
    await client.query(`SELECT id FROM institutional_accounts WHERE id = $1 FOR UPDATE`, [
      args.orgId,
    ]);

    const tgt = await client.query(
      `SELECT user_id FROM institutional_members WHERE id = $1 AND institutional_id = $2 FOR UPDATE`,
      [args.memberId, args.orgId],
    );
    if (tgt.rowCount === 0) {
      await client.query("ROLLBACK");
      throw new InstitutionalLicenseError(404, "Member not found.");
    }
    const userId = tgt.rows[0].user_id as string;

    await client.query(`DELETE FROM institutional_members WHERE id = $1`, [args.memberId]);
    const revoked = await revokeOrgEntitlementTx(client, userId, args.orgId);
    // Only free a seat if this member actually held one. Over-cap members (left
    // unseated when a legacy org's membership exceeds the purchased seat count at
    // fulfilment) carry no institutional entitlement, so removing them must NOT free
    // a seat — otherwise current_seats would drift below the granted-entitlement
    // count and a later invite could grant a seat above the paid cap.
    if (revoked > 0) {
      await client.query(
        `UPDATE institutional_accounts SET current_seats = GREATEST(current_seats - 1, 0) WHERE id = $1`,
        [args.orgId],
      );
    }

    await client.query("COMMIT");
    return { userId };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
