import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run the seed");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// Mirrors TIER_PRICING (cents) from lib/db/src/schema/schema.ts.
const TIER_PRICING = {
  plus: { monthly: 499, yearly: 4999 },
  premium: { monthly: 999, yearly: 9999 },
  institutional: { monthly: 4900, yearly: 49000 },
} as const;

// Mirrors TIER_FEATURES from lib/db/src/schema/schema.ts. `Infinity` is JSON-incompatible,
// so we encode unlimited values as `-1` in the JSONB blob.
const UNLIMITED = -1;
const TIER_FEATURES = {
  free:          { skipLimit: 6,         audioQuality: 128, maxDevices: 2,  adsEnabled: true,  offlineEnabled: false, ttsDaily: 0,         bookmarkLimit: 10 },
  plus:          { skipLimit: UNLIMITED, audioQuality: 192, maxDevices: 3,  adsEnabled: false, offlineEnabled: false, ttsDaily: 10,        bookmarkLimit: UNLIMITED },
  premium:       { skipLimit: UNLIMITED, audioQuality: 320, maxDevices: 5,  adsEnabled: false, offlineEnabled: true,  ttsDaily: UNLIMITED, bookmarkLimit: UNLIMITED },
  institutional: { skipLimit: UNLIMITED, audioQuality: 320, maxDevices: 10, adsEnabled: false, offlineEnabled: true,  ttsDaily: UNLIMITED, bookmarkLimit: UNLIMITED },
} as const;

const PLAN_DEFINITIONS: Array<{
  tier: keyof typeof TIER_FEATURES;
  name: string;
  priceMonthlycents: number;
  priceYearlyCents: number;
  trialDays: number;
  features: Prisma.InputJsonValue;
  isActive: boolean;
}> = [
  { tier: "free",          name: "Free",          priceMonthlycents: 0,                              priceYearlyCents: 0,                              trialDays: 0,  features: TIER_FEATURES.free,          isActive: true },
  { tier: "plus",          name: "Plus",          priceMonthlycents: TIER_PRICING.plus.monthly,          priceYearlyCents: TIER_PRICING.plus.yearly,          trialDays: 7,  features: TIER_FEATURES.plus,          isActive: true },
  { tier: "premium",       name: "Premium",       priceMonthlycents: TIER_PRICING.premium.monthly,       priceYearlyCents: TIER_PRICING.premium.yearly,       trialDays: 14, features: TIER_FEATURES.premium,       isActive: true },
  { tier: "institutional", name: "Institutional", priceMonthlycents: TIER_PRICING.institutional.monthly, priceYearlyCents: TIER_PRICING.institutional.yearly, trialDays: 30, features: TIER_FEATURES.institutional, isActive: true },
];

async function main() {
  for (const plan of PLAN_DEFINITIONS) {
    await prisma.plan.upsert({
      where: { tier: plan.tier },
      update: {
        name: plan.name,
        priceMonthlycents: plan.priceMonthlycents,
        priceYearlyCents: plan.priceYearlyCents,
        trialDays: plan.trialDays,
        features: plan.features,
        isActive: plan.isActive,
      },
      create: plan,
    });
  }
  console.log(`[seed] Upserted ${PLAN_DEFINITIONS.length} plans`);
}

main()
  .catch((err) => {
    console.error("[seed] Failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
