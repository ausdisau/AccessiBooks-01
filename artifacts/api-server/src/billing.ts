import { Router, Request, Response } from "express";
import { db } from "./db";
import { paymentTransactions, users } from "@workspace/db";
import { eq, desc, and, sql, gte } from "drizzle-orm";
import { isAuthenticated } from "./multiAuth";
import { storage } from "./storage";
import { stripe, PREMIUM_PRICE_MONTHLY, PREMIUM_PRICE_YEARLY } from "./stripe";

export async function recordTransaction(params: {
  userId: string;
  provider: string;
  providerTransactionId?: string;
  type: string;
  status: string;
  amountCents: number;
  currency?: string;
  description?: string;
  metadata?: Record<string, any>;
  receiptUrl?: string;
}) {
  try {
    const [tx] = await db.insert(paymentTransactions).values({
      userId: params.userId,
      provider: params.provider,
      providerTransactionId: params.providerTransactionId || null,
      type: params.type,
      status: params.status,
      amountCents: params.amountCents,
      currency: params.currency || "USD",
      description: params.description || null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      receiptUrl: params.receiptUrl || null,
    }).returning();
    return tx;
  } catch (err) {
    console.error("[Billing] Failed to record transaction:", err);
    return null;
  }
}

export async function updateTransactionStatus(
  providerTransactionId: string,
  status: string,
  receiptUrl?: string,
) {
  try {
    const updates: any = { status, updatedAt: new Date() };
    if (receiptUrl) updates.receiptUrl = receiptUrl;

    await db.update(paymentTransactions)
      .set(updates)
      .where(eq(paymentTransactions.providerTransactionId, providerTransactionId));
  } catch (err) {
    console.error("[Billing] Failed to update transaction:", err);
  }
}

export function registerBillingRoutes(app: any) {
  const router = Router();

  router.get("/transactions", isAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as any;
    const userId = user.claims?.sub || user.id;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const transactions = await db.select().from(paymentTransactions)
      .where(eq(paymentTransactions.userId, userId))
      .orderBy(desc(paymentTransactions.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(paymentTransactions)
      .where(eq(paymentTransactions.userId, userId));

    res.json({
      transactions,
      total: Number(countResult?.count) || 0,
      limit,
      offset,
    });
  });

  router.get("/transactions/:id", isAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as any;
    const userId = user.claims?.sub || user.id;

    const [tx] = await db.select().from(paymentTransactions)
      .where(and(
        eq(paymentTransactions.id, req.params.id),
        eq(paymentTransactions.userId, userId),
      )).limit(1);

    if (!tx) return res.status(404).json({ error: "Transaction not found" });
    res.json(tx);
  });

  router.get("/summary", isAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as any;
    const userId = user.claims?.sub || user.id;

    const dbUser = await storage.getUser(userId);
    if (!dbUser) return res.status(404).json({ error: "User not found" });

    const [stats] = await db.select({
      totalSpent: sql<number>`COALESCE(SUM(CASE WHEN ${paymentTransactions.status} = 'completed' THEN ${paymentTransactions.amountCents} ELSE 0 END), 0)`,
      totalTransactions: sql<number>`COUNT(*)`,
      subscriptionPayments: sql<number>`COALESCE(SUM(CASE WHEN ${paymentTransactions.type} = 'subscription' AND ${paymentTransactions.status} = 'completed' THEN ${paymentTransactions.amountCents} ELSE 0 END), 0)`,
      donationPayments: sql<number>`COALESCE(SUM(CASE WHEN ${paymentTransactions.type} = 'donation' AND ${paymentTransactions.status} = 'completed' THEN ${paymentTransactions.amountCents} ELSE 0 END), 0)`,
    }).from(paymentTransactions)
      .where(eq(paymentTransactions.userId, userId));

    let stripePaymentMethods: any[] = [];
    if (stripe && dbUser.stripeCustomerId) {
      try {
        const methods = await stripe.paymentMethods.list({
          customer: dbUser.stripeCustomerId,
          type: "card",
        });
        stripePaymentMethods = methods.data.map(m => ({
          id: m.id,
          brand: m.card?.brand || "unknown",
          last4: m.card?.last4 || "****",
          expMonth: m.card?.exp_month,
          expYear: m.card?.exp_year,
          isDefault: false,
        }));
      } catch (err) {
        console.error("[Billing] Failed to fetch payment methods:", err);
      }
    }

    let upcomingInvoice: any = null;
    if (stripe && dbUser.stripeSubscriptionId && dbUser.stripeCustomerId) {
      try {
        const invoiceList = await stripe.invoices.list({
          customer: dbUser.stripeCustomerId,
          status: "draft",
          limit: 1,
        });
        const draft = invoiceList.data[0];
        if (draft) {
          upcomingInvoice = {
            amountCents: draft.amount_due,
            currency: draft.currency,
            dueDate: draft.next_payment_attempt
              ? new Date(draft.next_payment_attempt * 1000).toISOString()
              : null,
          };
        }
      } catch (err) {
        // no upcoming invoice is normal for cancelled subs
      }
    }

    res.json({
      subscription: {
        tier: dbUser.subscriptionTier || "free",
        isPremium: dbUser.subscriptionTier === "premium",
        endDate: dbUser.subscriptionEndDate,
        stripeSubscriptionId: dbUser.stripeSubscriptionId,
        monthlyPrice: PREMIUM_PRICE_MONTHLY,
        yearlyPrice: PREMIUM_PRICE_YEARLY,
      },
      spending: {
        totalCents: Number(stats?.totalSpent) || 0,
        transactionCount: Number(stats?.totalTransactions) || 0,
        subscriptionCents: Number(stats?.subscriptionPayments) || 0,
        donationCents: Number(stats?.donationPayments) || 0,
      },
      paymentMethods: stripePaymentMethods,
      upcomingInvoice,
    });
  });

  router.get("/invoices", isAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as any;
    const userId = user.claims?.sub || user.id;
    const dbUser = await storage.getUser(userId);

    if (!dbUser?.stripeCustomerId || !stripe) {
      return res.json({ invoices: [] });
    }

    try {
      const invoices = await stripe.invoices.list({
        customer: dbUser.stripeCustomerId,
        limit: 24,
      });

      const mapped = invoices.data.map(inv => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        amountCents: inv.amount_paid || inv.amount_due,
        currency: inv.currency,
        date: inv.created ? new Date(inv.created * 1000).toISOString() : null,
        periodStart: inv.period_start ? new Date(inv.period_start * 1000).toISOString() : null,
        periodEnd: inv.period_end ? new Date(inv.period_end * 1000).toISOString() : null,
        pdfUrl: inv.invoice_pdf,
        hostedUrl: inv.hosted_invoice_url,
        description: inv.lines?.data?.[0]?.description || "AccessiBooks",
      }));

      res.json({ invoices: mapped });
    } catch (err) {
      console.error("[Billing] Failed to fetch invoices:", err);
      res.json({ invoices: [] });
    }
  });

  router.post("/create-portal-session", isAuthenticated, async (req: Request, res: Response) => {
    const user = req.user as any;
    const userId = user.claims?.sub || user.id;
    const dbUser = await storage.getUser(userId);

    if (!stripe || !dbUser?.stripeCustomerId) {
      return res.status(400).json({ error: "No billing account found" });
    }

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: dbUser.stripeCustomerId,
        return_url: `${req.headers.origin || "http://localhost:8080"}`,
      });
      res.json({ url: session.url });
    } catch (err) {
      console.error("[Billing] Portal session error:", err);
      res.status(500).json({ error: "Failed to create billing portal" });
    }
  });

  router.get("/admin/revenue", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const userId = user.claims?.sub || user.id;

      const [userRow] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
      if (userRow?.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [totals] = await db.select({
        totalRevenueCents: sql<number>`COALESCE(SUM(CASE WHEN ${paymentTransactions.status} = 'completed' THEN ${paymentTransactions.amountCents} ELSE 0 END), 0)`,
        subscriptionRevenueCents: sql<number>`COALESCE(SUM(CASE WHEN ${paymentTransactions.status} = 'completed' AND ${paymentTransactions.type} IN ('subscription', 'subscription_renewal') THEN ${paymentTransactions.amountCents} ELSE 0 END), 0)`,
        adSpendCents: sql<number>`COALESCE(SUM(CASE WHEN ${paymentTransactions.status} = 'completed' AND ${paymentTransactions.type} = 'ad_spend' THEN ${paymentTransactions.amountCents} ELSE 0 END), 0)`,
        totalTransactions: sql<number>`COUNT(*)`,
      }).from(paymentTransactions);

      const [mrrStats] = await db.select({
        mrrCents: sql<number>`COALESCE(SUM(CASE WHEN ${paymentTransactions.status} = 'completed' AND ${paymentTransactions.type} IN ('subscription', 'subscription_renewal') THEN ${paymentTransactions.amountCents} ELSE 0 END), 0)`,
      }).from(paymentTransactions)
        .where(gte(paymentTransactions.createdAt, thirtyDaysAgo));

      const [weeklyStats] = await db.select({
        revenueCents: sql<number>`COALESCE(SUM(CASE WHEN ${paymentTransactions.status} = 'completed' THEN ${paymentTransactions.amountCents} ELSE 0 END), 0)`,
        newTransactions: sql<number>`COUNT(*)`,
      }).from(paymentTransactions)
        .where(gte(paymentTransactions.createdAt, sevenDaysAgo));

      const tierCounts = await db.select({
        tier: users.subscriptionTier,
        count: sql<number>`COUNT(*)`,
      }).from(users)
        .groupBy(users.subscriptionTier);

      const tierBreakdown: Record<string, number> = { free: 0, plus: 0, premium: 0 };
      for (const row of tierCounts) {
        if (row.tier) tierBreakdown[row.tier] = Number(row.count);
      }
      const totalUsers = Object.values(tierBreakdown).reduce((a, b) => a + b, 0);
      const paidUsers = (tierBreakdown.plus || 0) + (tierBreakdown.premium || 0);

      const recentTransactions = await db.select({
        id: paymentTransactions.id,
        type: paymentTransactions.type,
        amountCents: paymentTransactions.amountCents,
        currency: paymentTransactions.currency,
        status: paymentTransactions.status,
        provider: paymentTransactions.provider,
        description: paymentTransactions.description,
        createdAt: paymentTransactions.createdAt,
      }).from(paymentTransactions)
        .orderBy(desc(paymentTransactions.createdAt))
        .limit(10);

      res.json({
        mrr: Number(mrrStats?.mrrCents) || 0,
        totalRevenue: Number(totals?.totalRevenueCents) || 0,
        subscriptionRevenue: Number(totals?.subscriptionRevenueCents) || 0,
        adSpend: Number(totals?.adSpendCents) || 0,
        totalTransactions: Number(totals?.totalTransactions) || 0,
        weeklyRevenue: Number(weeklyStats?.revenueCents) || 0,
        weeklyTransactions: Number(weeklyStats?.newTransactions) || 0,
        usersByTier: tierBreakdown,
        totalUsers,
        paidUsers,
        conversionRate: totalUsers > 0 ? ((paidUsers / totalUsers) * 100).toFixed(1) : "0",
        recentTransactions,
      });
    } catch (error) {
      console.error("[Billing] Admin revenue error:", error);
      res.status(500).json({ error: "Failed to fetch revenue data" });
    }
  });

  app.use("/api/billing", router);
}
