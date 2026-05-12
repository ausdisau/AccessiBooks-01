import { db } from "./db";
import { plans } from "@workspace/db";
import { TIER_FEATURES, TIER_PRICING } from "@workspace/db";
import { eq } from "drizzle-orm";

const PLAN_DEFINITIONS = [
  {
    tier: "free",
    name: "Free",
    priceMonthlycents: 0,
    priceYearlyCents: 0,
    trialDays: 0,
    features: TIER_FEATURES.free,
    isActive: true,
  },
  {
    tier: "plus",
    name: "Plus",
    priceMonthlycents: TIER_PRICING.plus.monthly,
    priceYearlyCents: TIER_PRICING.plus.yearly,
    trialDays: 7,
    features: TIER_FEATURES.plus,
    isActive: true,
  },
  {
    tier: "premium",
    name: "Premium",
    priceMonthlycents: TIER_PRICING.premium.monthly,
    priceYearlyCents: TIER_PRICING.premium.yearly,
    trialDays: 14,
    features: TIER_FEATURES.premium,
    isActive: true,
  },
  {
    tier: "institutional",
    name: "Institutional",
    priceMonthlycents: TIER_PRICING.institutional.monthly,
    priceYearlyCents: TIER_PRICING.institutional.yearly,
    trialDays: 30,
    features: TIER_FEATURES.institutional,
    isActive: true,
  },
] as const;

export async function seedPlans(): Promise<void> {
  try {
    for (const plan of PLAN_DEFINITIONS) {
      await db
        .insert(plans)
        .values(plan)
        .onConflictDoUpdate({
          target: plans.tier,
          set: {
            name: plan.name,
            priceMonthlycents: plan.priceMonthlycents,
            priceYearlyCents: plan.priceYearlyCents,
            trialDays: plan.trialDays,
            features: plan.features,
            isActive: plan.isActive,
          },
        });
    }
    console.log("[Seed] Plans upserted successfully");
  } catch (err: any) {
    console.warn("[Seed] seedPlans failed:", err.message);
  }
}
