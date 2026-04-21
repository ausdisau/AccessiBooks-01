/**
 * Stripe Product & Price Setup Script
 *
 * Creates the four subscription products/prices in your Stripe account and
 * prints the resulting Price IDs so you can add them to your .env file.
 *
 * Usage:
 *   npx tsx server/scripts/stripe-setup.ts
 *
 * IMPORTANT: This script will create real products/prices in your Stripe account.
 * It prompts for confirmation before proceeding and guards against accidental
 * production runs by checking the Stripe key prefix.
 */

import Stripe from "stripe";
import * as readline from "readline";

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error("ERROR: STRIPE_SECRET_KEY environment variable is not set.");
    process.exit(1);
  }

  const isLive = secretKey.startsWith("sk_live_");
  const isTest = secretKey.startsWith("sk_test_");

  if (!isLive && !isTest) {
    console.error("ERROR: STRIPE_SECRET_KEY does not look like a valid Stripe secret key.");
    process.exit(1);
  }

  console.log(`\nStripe Product Setup`);
  console.log(`====================`);
  console.log(`Environment : ${isLive ? "LIVE (PRODUCTION)" : "test"}`);
  console.log(`Key prefix  : ${secretKey.slice(0, 14)}...`);
  console.log(``);

  if (isLive) {
    console.log("WARNING: You are about to create products/prices in your LIVE Stripe account.");
    const confirm = await prompt("Type 'yes' to continue with LIVE mode, or anything else to abort: ");
    if (confirm.toLowerCase() !== "yes") {
      console.log("Aborted.");
      process.exit(0);
    }
  } else {
    const confirm = await prompt("Create test products/prices? (y/n): ");
    if (confirm.toLowerCase() !== "y" && confirm.toLowerCase() !== "yes") {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  const stripe = new Stripe(secretKey, { apiVersion: "2025-12-15.clover" as any });

  const plans = [
    { name: "AccessiBooks Plus", tier: "plus",    interval: "month" as const, amount: 499,  envVar: "STRIPE_PLUS_MONTHLY_PRICE_ID" },
    { name: "AccessiBooks Plus", tier: "plus",    interval: "year"  as const, amount: 4999, envVar: "STRIPE_PLUS_YEARLY_PRICE_ID" },
    { name: "AccessiBooks Premium", tier: "premium", interval: "month" as const, amount: 999,  envVar: "STRIPE_PREMIUM_MONTHLY_PRICE_ID" },
    { name: "AccessiBooks Premium", tier: "premium", interval: "year"  as const, amount: 9999, envVar: "STRIPE_PREMIUM_YEARLY_PRICE_ID" },
  ];

  // Create or reuse products for Plus and Premium
  const productCache: Record<string, string> = {};

  const results: { envVar: string; priceId: string }[] = [];

  for (const plan of plans) {
    try {
      // Reuse product if we already created it this run
      let productId = productCache[plan.name];
      if (!productId) {
        console.log(`\nCreating product: ${plan.name}...`);
        const product = await stripe.products.create({
          name: plan.name,
          metadata: { tier: plan.tier },
        });
        productId = product.id;
        productCache[plan.name] = productId;
        console.log(`  Product ID: ${productId}`);
      }

      console.log(`Creating price: ${plan.name} ${plan.interval}ly ($${plan.amount / 100})...`);
      const price = await stripe.prices.create({
        product: productId,
        unit_amount: plan.amount,
        currency: "usd",
        recurring: { interval: plan.interval },
        metadata: { tier: plan.tier, interval: plan.interval },
      });
      console.log(`  Price ID: ${price.id}`);
      results.push({ envVar: plan.envVar, priceId: price.id });
    } catch (err: any) {
      console.error(`  ERROR creating ${plan.name} ${plan.interval}: ${err.message}`);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Add the following to your .env file:\n`);
  for (const r of results) {
    console.log(`${r.envVar}=${r.priceId}`);
  }
  console.log(`${"=".repeat(60)}\n`);
}

main().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
