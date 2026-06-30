import { getUncachableRevenueCatClient } from "./revenueCatClient";

import {
  listProjects,
  createProject,
  listApps,
  createApp,
  listAppPublicApiKeys,
  listProducts,
  createProduct,
  listEntitlements,
  createEntitlement,
  attachProductsToEntitlement,
  listOfferings,
  createOffering,
  updateOffering,
  listPackages,
  createPackages,
  attachProductsToPackage,
  type App,
  type Product,
  type Project,
  type CreateProductData,
} from "@replit/revenuecat-sdk";

const PROJECT_NAME = "AccessiBooks";

// NOTE: align these store identifiers with the real App Store Connect / Google
// Play listings before going to production. Store identifiers cannot be reused
// in App Store Connect once created, even if deleted.
const APP_STORE_APP_NAME = "AccessiBooks";
const APP_STORE_BUNDLE_ID = "ltd.australiandisability.accessibooks";
const PLAY_STORE_APP_NAME = "AccessiBooks";
const PLAY_STORE_PACKAGE_NAME = "ltd.australiandisability.accessibooks";

const OFFERING_IDENTIFIER = "default";
const OFFERING_DISPLAY_NAME = "AccessiBooks Plans";

type Duration = "P1W" | "P1M" | "P2M" | "P3M" | "P6M" | "P1Y";

interface EntitlementSeed {
  lookup_key: string;
  display_name: string;
}

interface PlanSeed {
  productId: string; // store identifier for the test store + App Store
  playStoreId: string; // Google Play format: {subscriptionId}:{basePlanId}
  displayName: string; // internal display name (unique per logical product)
  title: string; // user-facing title
  duration: Duration;
  entitlement: string; // entitlement lookup_key this product unlocks
  packageId: string; // package lookup_key within the offering
  packageName: string;
  prices: { amount_micros: number; currency: string }[];
}

const ENTITLEMENTS: EntitlementSeed[] = [
  { lookup_key: "plus", display_name: "AccessiBooks Plus" },
  { lookup_key: "premium", display_name: "AccessiBooks Premium" },
];

// Test-store prices ($ * 1,000,000). Production prices come from the stores.
const PLANS: PlanSeed[] = [
  {
    productId: "plus_monthly",
    playStoreId: "plus_monthly:monthly",
    displayName: "AccessiBooks Plus (Monthly)",
    title: "Plus Monthly",
    duration: "P1M",
    entitlement: "plus",
    packageId: "plus_monthly",
    packageName: "Plus Monthly",
    prices: [{ amount_micros: 4990000, currency: "USD" }],
  },
  {
    productId: "plus_annual",
    playStoreId: "plus_annual:annual",
    displayName: "AccessiBooks Plus (Annual)",
    title: "Plus Annual",
    duration: "P1Y",
    entitlement: "plus",
    packageId: "plus_annual",
    packageName: "Plus Annual",
    prices: [{ amount_micros: 49990000, currency: "USD" }],
  },
  {
    productId: "premium_monthly",
    playStoreId: "premium_monthly:monthly",
    displayName: "AccessiBooks Premium (Monthly)",
    title: "Premium Monthly",
    duration: "P1M",
    entitlement: "premium",
    packageId: "premium_monthly",
    packageName: "Premium Monthly",
    prices: [{ amount_micros: 9990000, currency: "USD" }],
  },
  {
    productId: "premium_annual",
    playStoreId: "premium_annual:annual",
    displayName: "AccessiBooks Premium (Annual)",
    title: "Premium Annual",
    duration: "P1Y",
    entitlement: "premium",
    packageId: "premium_annual",
    packageName: "Premium Annual",
    prices: [{ amount_micros: 99990000, currency: "USD" }],
  },
];

type TestStorePricesResponse = {
  object: string;
  prices: { amount_micros: number; currency: string }[];
};

async function seedRevenueCat() {
  const client = await getUncachableRevenueCatClient();

  // 1. Project
  let project: Project;
  const { data: existingProjects, error: listProjectsError } = await listProjects({
    client,
    query: { limit: 20 },
  });
  if (listProjectsError) throw new Error("Failed to list projects");
  const existingProject = existingProjects.items?.find((p) => p.name === PROJECT_NAME);
  if (existingProject) {
    console.log("Project already exists:", existingProject.id);
    project = existingProject;
  } else {
    const { data: newProject, error } = await createProject({
      client,
      body: { name: PROJECT_NAME },
    });
    if (error) throw new Error("Failed to create project");
    console.log("Created project:", newProject.id);
    project = newProject;
  }

  // 2. Apps — the test store comes with the project; create app/play if missing.
  const { data: apps, error: listAppsError } = await listApps({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listAppsError || !apps || apps.items.length === 0) {
    throw new Error("No apps found");
  }

  const testApp: App | undefined = apps.items.find((a) => a.type === "test_store");
  let appStoreApp: App | undefined = apps.items.find((a) => a.type === "app_store");
  let playStoreApp: App | undefined = apps.items.find((a) => a.type === "play_store");

  if (!testApp) throw new Error("No app with test store found");
  console.log("Test Store app:", testApp.id);

  if (!appStoreApp) {
    const { data: newApp, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: {
        name: APP_STORE_APP_NAME,
        type: "app_store",
        app_store: { bundle_id: APP_STORE_BUNDLE_ID },
      },
    });
    if (error) throw new Error("Failed to create App Store app");
    appStoreApp = newApp;
    console.log("Created App Store app:", appStoreApp.id);
  } else {
    console.log("App Store app:", appStoreApp.id);
  }

  if (!playStoreApp) {
    const { data: newApp, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: {
        name: PLAY_STORE_APP_NAME,
        type: "play_store",
        play_store: { package_name: PLAY_STORE_PACKAGE_NAME },
      },
    });
    if (error) throw new Error("Failed to create Play Store app");
    playStoreApp = newApp;
    console.log("Created Play Store app:", playStoreApp.id);
  } else {
    console.log("Play Store app:", playStoreApp.id);
  }

  // 3. Products — each plan in all three stores.
  const { data: existingProducts, error: listProductsError } = await listProducts({
    client,
    path: { project_id: project.id },
    query: { limit: 100 },
  });
  if (listProductsError) throw new Error("Failed to list products");

  const ensureProduct = async (
    targetApp: App,
    label: string,
    plan: PlanSeed,
    storeIdentifier: string,
    isTestStore: boolean,
  ): Promise<Product> => {
    const existing = existingProducts.items?.find(
      (p) => p.store_identifier === storeIdentifier && p.app_id === targetApp.id,
    );
    if (existing) {
      console.log(`${label} product already exists (${plan.productId}):`, existing.id);
      return existing;
    }
    const body: CreateProductData["body"] = {
      store_identifier: storeIdentifier,
      app_id: targetApp.id,
      type: "subscription",
      display_name: plan.displayName,
    };
    if (isTestStore) {
      body.subscription = { duration: plan.duration };
      body.title = plan.title;
    }
    const { data: created, error } = await createProduct({
      client,
      path: { project_id: project.id },
      body,
    });
    if (error) throw new Error(`Failed to create ${label} product for ${plan.productId}`);
    console.log(`Created ${label} product (${plan.productId}):`, created.id);
    return created;
  };

  interface PlanProducts {
    plan: PlanSeed;
    test: Product;
    appStore: Product;
    playStore: Product;
  }
  const planProducts: PlanProducts[] = [];

  for (const plan of PLANS) {
    const test = await ensureProduct(testApp, "Test Store", plan, plan.productId, true);
    const appStore = await ensureProduct(appStoreApp, "App Store", plan, plan.productId, false);
    const playStore = await ensureProduct(playStoreApp, "Play Store", plan, plan.playStoreId, false);
    planProducts.push({ plan, test, appStore, playStore });

    // Test store prices (undocumented endpoint).
    const { error: priceError } = await client.post<TestStorePricesResponse>({
      url: "/projects/{project_id}/products/{product_id}/test_store_prices",
      path: { project_id: project.id, product_id: test.id },
      body: { prices: plan.prices },
    });
    if (priceError) {
      if (
        priceError &&
        typeof priceError === "object" &&
        "type" in priceError &&
        (priceError as { type?: string })["type"] === "resource_already_exists"
      ) {
        console.log(`Test store prices already exist for ${plan.productId}`);
      } else {
        throw new Error(`Failed to add test store prices for ${plan.productId}`);
      }
    } else {
      console.log(`Added test store prices for ${plan.productId}`);
    }
  }

  // 4. Entitlements + attach products.
  const { data: existingEntitlements, error: listEntitlementsError } = await listEntitlements({
    client,
    path: { project_id: project.id },
    query: { limit: 50 },
  });
  if (listEntitlementsError) throw new Error("Failed to list entitlements");

  for (const ent of ENTITLEMENTS) {
    let entitlementId: string;
    const existingEnt = existingEntitlements.items?.find((e) => e.lookup_key === ent.lookup_key);
    if (existingEnt) {
      console.log(`Entitlement already exists (${ent.lookup_key}):`, existingEnt.id);
      entitlementId = existingEnt.id;
    } else {
      const { data: newEnt, error } = await createEntitlement({
        client,
        path: { project_id: project.id },
        body: { lookup_key: ent.lookup_key, display_name: ent.display_name },
      });
      if (error) throw new Error(`Failed to create entitlement ${ent.lookup_key}`);
      console.log(`Created entitlement (${ent.lookup_key}):`, newEnt.id);
      entitlementId = newEnt.id;
    }

    const productIds = planProducts
      .filter((pp) => pp.plan.entitlement === ent.lookup_key)
      .flatMap((pp) => [pp.test.id, pp.appStore.id, pp.playStore.id]);

    const { error: attachErr } = await attachProductsToEntitlement({
      client,
      path: { project_id: project.id, entitlement_id: entitlementId },
      body: { product_ids: productIds },
    });
    if (attachErr) {
      if (attachErr.type === "unprocessable_entity_error") {
        console.log(`Products already attached to entitlement ${ent.lookup_key}`);
      } else {
        throw new Error(`Failed to attach products to entitlement ${ent.lookup_key}`);
      }
    } else {
      console.log(`Attached products to entitlement ${ent.lookup_key}`);
    }
  }

  // 5. Offering (set current).
  let offeringId: string;
  let offeringIsCurrent = false;
  const { data: existingOfferings, error: listOfferingsError } = await listOfferings({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listOfferingsError) throw new Error("Failed to list offerings");
  const existingOffering = existingOfferings.items?.find((o) => o.lookup_key === OFFERING_IDENTIFIER);
  if (existingOffering) {
    console.log("Offering already exists:", existingOffering.id);
    offeringId = existingOffering.id;
    offeringIsCurrent = existingOffering.is_current ?? false;
  } else {
    const { data: newOffering, error } = await createOffering({
      client,
      path: { project_id: project.id },
      body: { lookup_key: OFFERING_IDENTIFIER, display_name: OFFERING_DISPLAY_NAME },
    });
    if (error) throw new Error("Failed to create offering");
    console.log("Created offering:", newOffering.id);
    offeringId = newOffering.id;
  }
  if (!offeringIsCurrent) {
    const { error } = await updateOffering({
      client,
      path: { project_id: project.id, offering_id: offeringId },
      body: { is_current: true },
    });
    if (error) throw new Error("Failed to set offering as current");
    console.log("Set offering as current");
  }

  // 6. Packages (one per plan) + attach products.
  const { data: existingPackages, error: listPackagesError } = await listPackages({
    client,
    path: { project_id: project.id, offering_id: offeringId },
    query: { limit: 50 },
  });
  if (listPackagesError) throw new Error("Failed to list packages");

  for (const pp of planProducts) {
    let packageId: string;
    const existingPackage = existingPackages.items?.find((p) => p.lookup_key === pp.plan.packageId);
    if (existingPackage) {
      console.log(`Package already exists (${pp.plan.packageId}):`, existingPackage.id);
      packageId = existingPackage.id;
    } else {
      const { data: newPackage, error } = await createPackages({
        client,
        path: { project_id: project.id, offering_id: offeringId },
        body: { lookup_key: pp.plan.packageId, display_name: pp.plan.packageName },
      });
      if (error) throw new Error(`Failed to create package ${pp.plan.packageId}`);
      console.log(`Created package (${pp.plan.packageId}):`, newPackage.id);
      packageId = newPackage.id;
    }

    const { error: attachPkgErr } = await attachProductsToPackage({
      client,
      path: { project_id: project.id, package_id: packageId },
      body: {
        products: [
          { product_id: pp.test.id, eligibility_criteria: "all" },
          { product_id: pp.appStore.id, eligibility_criteria: "all" },
          { product_id: pp.playStore.id, eligibility_criteria: "all" },
        ],
      },
    });
    if (attachPkgErr) {
      if (attachPkgErr.type === "unprocessable_entity_error") {
        console.log(`Products already attached to package ${pp.plan.packageId}`);
      } else {
        throw new Error(`Failed to attach products to package ${pp.plan.packageId}`);
      }
    } else {
      console.log(`Attached products to package ${pp.plan.packageId}`);
    }
  }

  // 7. Public API keys.
  const { data: testKeys, error: testKeysErr } = await listAppPublicApiKeys({
    client,
    path: { project_id: project.id, app_id: testApp.id },
  });
  if (testKeysErr) throw new Error("Failed to list Test Store API keys");
  const { data: appKeys, error: appKeysErr } = await listAppPublicApiKeys({
    client,
    path: { project_id: project.id, app_id: appStoreApp.id },
  });
  if (appKeysErr) throw new Error("Failed to list App Store API keys");
  const { data: playKeys, error: playKeysErr } = await listAppPublicApiKeys({
    client,
    path: { project_id: project.id, app_id: playStoreApp.id },
  });
  if (playKeysErr) throw new Error("Failed to list Play Store API keys");

  console.log("\n====================");
  console.log("RevenueCat setup complete!");
  console.log("");
  console.log("Server env vars:");
  console.log("  REVENUECAT_PROJECT_ID =", project.id);
  console.log("  REVENUECAT_TEST_STORE_APP_ID =", testApp.id);
  console.log("  REVENUECAT_APPLE_APP_STORE_APP_ID =", appStoreApp.id);
  console.log("  REVENUECAT_GOOGLE_PLAY_STORE_APP_ID =", playStoreApp.id);
  console.log("");
  console.log("Mobile env vars (public API keys):");
  console.log("  EXPO_PUBLIC_REVENUECAT_TEST_API_KEY =", testKeys?.items.map((i) => i.key).join(", ") ?? "N/A");
  console.log("  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY =", appKeys?.items.map((i) => i.key).join(", ") ?? "N/A");
  console.log("  EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY =", playKeys?.items.map((i) => i.key).join(", ") ?? "N/A");
  console.log("====================\n");
}

seedRevenueCat().catch(console.error);
