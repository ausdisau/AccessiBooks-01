import { Router, Request, Response } from "express";
import { db } from "./db";
import { paymentTransactions, users } from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";
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
        return_url: `${req.headers.origin || "http://localhost:5000"}`,
      });
      res.json({ url: session.url });
    } catch (err) {
      console.error("[Billing] Portal session error:", err);
      res.status(500).json({ error: "Failed to create billing portal" });
    }
  });

  app.use("/api/billing", router);
}
