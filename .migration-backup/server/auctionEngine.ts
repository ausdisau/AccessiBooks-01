import { db } from "./db";
import { eq, and, sql, gte } from "drizzle-orm";
import {
  adSlots,
  adCampaigns,
  displayAds,
  adAuctions,
  slotImpressions,
  advertiserWallets,
  publisherEarnings,
  bids,
  type DisplayAd,
  type AdAuction,
  type SlotImpression,
  type AdCampaign,
} from "@shared/schema";

export interface AuctionWinner {
  ad: DisplayAd;
  cpmCents: number;
  auction: AdAuction;
  impression: SlotImpression;
}

export interface AuctionResult {
  noFill: boolean;
  winner?: AuctionWinner;
}

/**
 * Run a Vickrey (second-price) auction for the given slot.
 *
 * Eligibility rules:
 *  1. Display ad must be status = "approved"
 *  2. Its campaign must be status = "active"
 *  3. Ad's maxCpmCents must meet or exceed slot's minCpmCents floor
 *  4. Campaign total budget must not be exhausted (spentCents < budgetCents, when set)
 *  5. Campaign daily budget must not be exhausted (dailySpendCents < dailyBudgetCents, when set)
 *  6. Campaign must be within its scheduled date range (when set)
 *  7. Advertiser wallet balance must cover at least the slot's floor CPM cost per impression
 *
 * Winner pays the second-highest bid price (or the slot floor, whichever is higher).
 * This is strict Vickrey semantics — no +1 cent inflation.
 */
export async function runAuction(slotId: string): Promise<AuctionResult> {
  const [slot] = await db
    .select()
    .from(adSlots)
    .where(and(eq(adSlots.id, slotId), eq(adSlots.isActive, true)));

  if (!slot) return { noFill: true };

  const now = new Date();
  // Minimum cost per impression at this slot's floor (ceil(floorCpm/1000))
  const minCostCents = Math.ceil(slot.minCpmCents / 1000);

  // Fetch all approved, active ads with their campaigns in one join
  const candidates = await db
    .select({
      ad: displayAds,
      campaign: adCampaigns,
    })
    .from(displayAds)
    .innerJoin(adCampaigns, eq(displayAds.campaignId, adCampaigns.id))
    .where(
      and(
        eq(displayAds.status, "approved"),
        eq(adCampaigns.status, "active"),
        // Ad bid must meet slot CPM floor
        sql`${displayAds.maxCpmCents} >= ${slot.minCpmCents}`
      )
    );

  if (candidates.length === 0) {
    await db.insert(adAuctions).values({ slotId, noFill: true, bidsConsidered: 0 });
    return { noFill: true };
  }

  // Batch-fetch wallets for all unique advertisers
  const advertiserIds = Array.from(new Set(candidates.map((c) => c.campaign.advertiserId)));
  const walletRows = await db
    .select({ advertiserId: advertiserWallets.advertiserId, balanceCents: advertiserWallets.balanceCents })
    .from(advertiserWallets)
    .where(sql`${advertiserWallets.advertiserId} = ANY(ARRAY[${sql.join(advertiserIds.map((id) => sql`${id}`), sql`, `)}])`);

  const walletMap = new Map<string, number>(walletRows.map((w) => [w.advertiserId, w.balanceCents]));

  // Filter eligibility in JS (budget, date range, wallet balance — all fully typed)
  const eligible = candidates.filter(({ campaign }: { campaign: AdCampaign }) => {
    // Date range
    if (campaign.startDate && new Date(campaign.startDate) > now) return false;
    if (campaign.endDate && new Date(campaign.endDate) < now) return false;

    // Total budget exhausted
    if (campaign.budgetCents > 0 && campaign.spentCents >= campaign.budgetCents) return false;

    // Daily budget exhausted
    const dailyBudget = campaign.dailyBudgetCents ?? 0;
    if (dailyBudget > 0 && campaign.dailySpendCents >= dailyBudget) return false;

    // Wallet must exist and have sufficient balance to cover at least the slot floor
    const balance = walletMap.get(campaign.advertiserId) ?? 0;
    if (balance < minCostCents) return false;

    return true;
  });

  if (eligible.length === 0) {
    await db.insert(adAuctions).values({ slotId, noFill: true, bidsConsidered: 0 });
    return { noFill: true };
  }

  // Sort by CPM descending (highest bidder wins)
  const sorted = [...eligible].sort(
    (a, b) => (b.ad.maxCpmCents ?? 0) - (a.ad.maxCpmCents ?? 0)
  );

  const winnerEntry = sorted[0];
  const secondEntry = sorted[1];

  const winningCpmCents = winnerEntry.ad.maxCpmCents ?? 0;
  // Strict Vickrey: winner pays second-highest bid price.
  // If only one bidder, they pay the slot floor.
  const secondPriceCpmCents = secondEntry?.ad.maxCpmCents ?? slot.minCpmCents;
  // Charged price never goes below slot floor.
  const chargedCpmCents = Math.max(secondPriceCpmCents, slot.minCpmCents);
  // Cost per impression (CPM / 1000, rounded up)
  const costCents = Math.ceil(chargedCpmCents / 1000);
  const publisherCutCents = Math.floor(costCents * 0.7);

  // --- Persistence phase ---
  // (1) Auction record
  const [auction] = await db
    .insert(adAuctions)
    .values({
      slotId,
      winningAdId: winnerEntry.ad.id,
      winningCpmCents,
      secondPriceCpmCents,
      bidsConsidered: eligible.length,
      noFill: false,
    })
    .returning();

  // (2) All bids
  const bidRows = eligible.map(({ ad, campaign }: { ad: DisplayAd; campaign: AdCampaign }) => ({
    auctionId: auction.id,
    adId: ad.id,
    advertiserId: campaign.advertiserId,
    cpmCents: ad.maxCpmCents ?? 0,
    isWinner: ad.id === winnerEntry.ad.id,
  }));
  await db.insert(bids).values(bidRows);

  // (3) Impression record
  const [impression] = await db
    .insert(slotImpressions)
    .values({
      auctionId: auction.id,
      adId: winnerEntry.ad.id,
      slotId,
      advertiserId: winnerEntry.campaign.advertiserId,
      publisherId: slot.publisherId,
      cpmCents: chargedCpmCents,
    })
    .returning();

  // (4) Financial + counter updates — upsert wallet first so debit cannot be a no-op,
  //     then apply all counters in parallel.
  await db
    .insert(advertiserWallets)
    .values({ advertiserId: winnerEntry.campaign.advertiserId, balanceCents: 0 })
    .onConflictDoNothing();

  await Promise.all([
    // Wallet debit (wallet row guaranteed to exist from upsert above)
    db
      .update(advertiserWallets)
      .set({
        balanceCents: sql`${advertiserWallets.balanceCents} - ${costCents}`,
        totalSpendCents: sql`${advertiserWallets.totalSpendCents} + ${costCents}`,
        updatedAt: new Date(),
      })
      .where(eq(advertiserWallets.advertiserId, winnerEntry.campaign.advertiserId)),

    // Publisher earnings (70% revenue share) — upsert then update
    db
      .insert(publisherEarnings)
      .values({ publisherId: slot.publisherId })
      .onConflictDoNothing(),
    db
      .update(publisherEarnings)
      .set({
        totalEarnedCents: sql`${publisherEarnings.totalEarnedCents} + ${publisherCutCents}`,
        pendingCents: sql`${publisherEarnings.pendingCents} + ${publisherCutCents}`,
        updatedAt: new Date(),
      })
      .where(eq(publisherEarnings.publisherId, slot.publisherId)),

    // Campaign spend counters (pacing)
    db
      .update(adCampaigns)
      .set({
        spentCents: sql`${adCampaigns.spentCents} + ${costCents}`,
        dailySpendCents: sql`${adCampaigns.dailySpendCents} + ${costCents}`,
        impressions: sql`${adCampaigns.impressions} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(adCampaigns.id, winnerEntry.campaign.id)),

    // Ad impression count
    db
      .update(displayAds)
      .set({ impressionCount: sql`${displayAds.impressionCount} + 1`, updatedAt: new Date() })
      .where(eq(displayAds.id, winnerEntry.ad.id)),

    // Slot impression count + earnings
    db
      .update(adSlots)
      .set({
        totalImpressions: sql`${adSlots.totalImpressions} + 1`,
        totalEarningsCents: sql`${adSlots.totalEarningsCents} + ${publisherCutCents}`,
      })
      .where(eq(adSlots.id, slotId)),
  ]);

  // Auto-pause: pause all active campaigns for this advertiser if wallet is now empty
  const newBalance = (walletMap.get(winnerEntry.campaign.advertiserId) ?? 0) - costCents;
  if (newBalance <= 0) {
    try {
      await db
        .update(adCampaigns)
        .set({ status: "paused", updatedAt: new Date() })
        .where(
          and(
            eq(adCampaigns.advertiserId, winnerEntry.campaign.advertiserId),
            eq(adCampaigns.status, "active")
          )
        );
      console.log(`[AdPlatform] Wallet empty for advertiser ${winnerEntry.campaign.advertiserId} — campaigns auto-paused`);
    } catch (pauseErr: any) {
      console.error("[AdPlatform] Failed to auto-pause campaigns:", pauseErr.message);
    }
  }

  return {
    noFill: false,
    winner: {
      ad: winnerEntry.ad,
      cpmCents: chargedCpmCents,
      auction,
      impression,
    },
  };
}

/**
 * Nightly cron: reset daily spend counters for all campaigns.
 * Called at midnight UTC by the scheduler started in server/index.ts.
 */
export async function resetDailySpend(): Promise<void> {
  try {
    await db
      .update(adCampaigns)
      .set({ dailySpendCents: 0, updatedAt: new Date() })
      .where(sql`${adCampaigns.dailySpendCents} > 0`);
    console.log("[AdPlatform] Daily spend counters reset");
  } catch (err: any) {
    console.error("[AdPlatform] Failed to reset daily spend:", err.message);
  }
}

/**
 * Start the midnight UTC cron job that resets daily spend counters.
 */
export function startDailySpendResetCron(): void {
  function scheduleNextReset() {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setUTCDate(nextMidnight.getUTCDate() + 1);
    nextMidnight.setUTCHours(0, 0, 0, 0);
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();

    setTimeout(async () => {
      await resetDailySpend();
      scheduleNextReset();
    }, msUntilMidnight);

    console.log(
      `[AdPlatform] Daily spend reset scheduled in ${Math.round(msUntilMidnight / 60000)} min`
    );
  }

  scheduleNextReset();
}
