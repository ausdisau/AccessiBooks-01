import { db } from "./db";
import { eq, and, sql, gte, lte, or, isNull } from "drizzle-orm";
import {
  adSlots,
  adCampaigns,
  displayAds,
  adAuctions,
  slotImpressions,
  advertiserWallets,
  publisherEarnings,
  bids,
  type AdSlot,
  type DisplayAd,
  type AdAuction,
  type SlotImpression,
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
 *  3. Campaign total budget must not be exhausted (spentCents < budgetCents)
 *  4. Campaign daily budget must not be exhausted (dailySpendCents < dailyBudgetCents, if set)
 *  5. Campaign must be within its scheduled date range (if set)
 *  6. Ad's maxCpmCents must meet or exceed slot's minCpmCents floor
 *
 * Winner pays max(secondBid + 1 cent, slotFloor).
 */
export async function runAuction(slotId: string): Promise<AuctionResult> {
  const [slot] = await db
    .select()
    .from(adSlots)
    .where(and(eq(adSlots.id, slotId), eq(adSlots.isActive, true)));

  if (!slot) return { noFill: true };

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);

  // Fetch all approved ads with their campaigns in one join to keep hot-path lean
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
        // Ad bid must meet slot floor
        sql`${displayAds.maxCpmCents} >= ${slot.minCpmCents}`
      )
    );

  // Filter eligibility in JS (date range + budget checks)
  const eligible = candidates.filter(({ campaign }) => {
    // Date range
    if (campaign.startDate && new Date(campaign.startDate) > now) return false;
    if (campaign.endDate && new Date(campaign.endDate) < now) return false;

    // Total budget exhausted
    if (campaign.budgetCents > 0 && campaign.spentCents >= campaign.budgetCents) return false;

    // Daily budget exhausted
    const dailyBudget = campaign.dailyBudgetCents ?? 0;
    const dailySpend = (campaign as any).dailySpendCents ?? 0;
    if (dailyBudget > 0 && dailySpend >= dailyBudget) return false;

    return true;
  });

  // Record no-fill auction
  if (eligible.length === 0) {
    const [auction] = await db
      .insert(adAuctions)
      .values({ slotId, noFill: true, bidsConsidered: 0 })
      .returning();
    return { noFill: true };
  }

  // Sort by CPM descending (highest bidder wins)
  const sorted = [...eligible].sort(
    (a, b) => (b.ad.maxCpmCents ?? 0) - (a.ad.maxCpmCents ?? 0)
  );

  const winnerEntry = sorted[0];
  const secondEntry = sorted[1];

  const winningCpmCents = winnerEntry.ad.maxCpmCents ?? 0;
  const secondPriceCpmCents = secondEntry?.ad.maxCpmCents ?? slot.minCpmCents;
  // Advertiser pays second-price + 1 cent (or slot floor, whichever is higher)
  const chargedCpmCents = Math.max(secondPriceCpmCents + 1, slot.minCpmCents);

  // Insert auction record
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

  // Record all bids
  const bidRows = eligible.map(({ ad, campaign }) => ({
    auctionId: auction.id,
    adId: ad.id,
    advertiserId: campaign.advertiserId,
    cpmCents: ad.maxCpmCents ?? 0,
    isWinner: ad.id === winnerEntry.ad.id,
  }));
  await db.insert(bids).values(bidRows);

  // Record impression
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

  // Decrement advertiser wallet (CPM / 1000 = cost per impression)
  const costCents = Math.ceil(chargedCpmCents / 1000);
  await Promise.all([
    // Wallet debit
    db
      .update(advertiserWallets)
      .set({
        balanceCents: sql`${advertiserWallets.balanceCents} - ${costCents}`,
        totalSpendCents: sql`${advertiserWallets.totalSpendCents} + ${costCents}`,
        updatedAt: new Date(),
      })
      .where(eq(advertiserWallets.advertiserId, winnerEntry.campaign.advertiserId)),

    // Publisher earnings (70% revenue share)
    db
      .insert(publisherEarnings)
      .values({ publisherId: slot.publisherId })
      .onConflictDoNothing(),
    db
      .update(publisherEarnings)
      .set({
        totalEarnedCents: sql`${publisherEarnings.totalEarnedCents} + ${Math.floor(costCents * 0.7)}`,
        pendingCents: sql`${publisherEarnings.pendingCents} + ${Math.floor(costCents * 0.7)}`,
        updatedAt: new Date(),
      })
      .where(eq(publisherEarnings.publisherId, slot.publisherId)),

    // Update campaign spend counters
    db
      .update(adCampaigns)
      .set({
        spentCents: sql`${adCampaigns.spentCents} + ${costCents}`,
        dailySpendCents: sql`COALESCE(${adCampaigns.dailySpendCents}, 0) + ${costCents}`,
        impressions: sql`${adCampaigns.impressions} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(adCampaigns.id, winnerEntry.campaign.id)),

    // Update ad impression count
    db
      .update(displayAds)
      .set({ impressionCount: sql`${displayAds.impressionCount} + 1`, updatedAt: new Date() })
      .where(eq(displayAds.id, winnerEntry.ad.id)),

    // Update slot impression count + earnings
    db
      .update(adSlots)
      .set({
        totalImpressions: sql`${adSlots.totalImpressions} + 1`,
        totalEarningsCents: sql`${adSlots.totalEarningsCents} + ${Math.floor(costCents * 0.7)}`,
      })
      .where(eq(adSlots.id, slotId)),
  ]);

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
