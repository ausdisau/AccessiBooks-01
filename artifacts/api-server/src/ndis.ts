// NDIS claimable plans & invoicing (Task #215)
//
// Lets NDIS participants record their plan details and generate
// NDIS-compliant invoices (with a downloadable PDF) for their AccessiBooks
// spend, so a plan manager or the NDIA can reimburse it. AccessiBooks is NOT a
// registered NDIS provider — these invoices support self-managed and
// plan-managed claims only, which is surfaced to users and printed on the PDF.

import { Router, type Request, type Response, type NextFunction } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import {
  ndisInvoices,
  ndisParticipants,
  purchases,
  users,
  NDIS_MANAGEMENT_TYPES,
  NDIS_GST_TREATMENTS,
  NDIS_CLAIM_STATUSES,
  NDIS_INVOICE_STATUSES,
  NDIS_SUPPORT_CATEGORY_SUGGESTIONS,
  TIER_PRICING,
  type NdisInvoice,
} from "@workspace/db";
import { isAuthenticated, isAdminUser } from "./multiAuth";
import { storage } from "./storage";
import { renderInvoicePdf, type InvoiceProvider } from "./ndisPdf";
import { sendViaResend, isResendConfigured } from "./resendMailer";
import { sendEmail, isEmailConfigured } from "./mailer";

function getUserId(req: Request): string | null {
  const u = req.user as any;
  return u?.claims?.sub || u?.id || null;
}

function provider(): InvoiceProvider {
  return {
    name: process.env.NDIS_PROVIDER_NAME || "Australian Disability Ltd",
    abn: process.env.NDIS_PROVIDER_ABN || "Not configured",
    email: process.env.NDIS_PROVIDER_EMAIL || "support@accessibooks.app",
    website: process.env.NDIS_PROVIDER_WEBSITE || "accessibooks.app",
  };
}

const PROVIDER_NOTICE =
  "AccessiBooks (Australian Disability Ltd) is not a registered NDIS provider. " +
  "These invoices support self-managed and plan-managed claims only — whether a cost is claimable " +
  "depends on your individual NDIS plan. Confirm the correct support item number with your plan manager or the NDIA.";

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .optional()
  .or(z.literal(""));

const optEmail = z.string().email().max(255).optional().or(z.literal(""));

const profileSchema = z.object({
  participantName: z.string().trim().min(1).max(200),
  ndisNumber: z.string().trim().regex(/^\d{8,12}$/, "NDIS number should be 8–12 digits"),
  dateOfBirth: dateStr,
  managementType: z.enum(NDIS_MANAGEMENT_TYPES),
  planManagerName: z.string().trim().max(200).optional().or(z.literal("")),
  planManagerEmail: optEmail,
  planManagerCompany: z.string().trim().max(200).optional().or(z.literal("")),
  planStartDate: dateStr,
  planEndDate: dateStr,
  contactEmail: optEmail,
});

// A manually-entered invoice is capped at this TOTAL (unit price × quantity) so a
// participant can't mint an arbitrarily large self-attested claim.
const MANUAL_INVOICE_MAX_CENTS = 2_000_00;

const createInvoiceSchema = z.object({
  sourceType: z.enum(["subscription", "purchase", "manual"]),
  // For subscription source.
  period: z.enum(["monthly", "yearly"]).optional(),
  // For purchase source.
  sourceTransactionId: z.string().trim().max(80).optional(),
  // Line-item detail (price is server-derived for subscription/purchase).
  supportItemNumber: z.string().trim().max(60).optional().or(z.literal("")),
  supportItemName: z.string().trim().max(200).optional().or(z.literal("")),
  serviceDescription: z.string().trim().max(1000).optional().or(z.literal("")),
  gstTreatment: z.enum(NDIS_GST_TREATMENTS).default("GST-free"),
  serviceStartDate: dateStr,
  serviceEndDate: dateStr,
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  // Manual-only fields.
  unitPriceCents: z.number().int().min(1).max(MANUAL_INVOICE_MAX_CENTS).optional(),
  quantity: z.number().int().min(1).max(999).default(1),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).optional(),
});

const adminPatchSchema = z
  .object({
    claimStatus: z.enum(NDIS_CLAIM_STATUSES).optional(),
    status: z.enum(NDIS_INVOICE_STATUSES).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.claimStatus || v.status || v.notes !== undefined, {
    message: "Nothing to update",
  });

function emptyToNull(v: string | undefined | null): string | null {
  const s = (v ?? "").trim();
  return s.length ? s : null;
}

async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Not authenticated" });
      return;
    }
    const u = await storage.getUser(userId);
    if (!u || (!isAdminUser(u) && u.subscriptionTier !== "admin")) {
      res.status(403).json({ message: "Admin access required" });
      return;
    }
    next();
  } catch (err) {
    req.log?.error?.({ err }, "[NDIS] admin authorization failed");
    res.status(500).json({ message: "Authorization failed" });
  }
}

/** Sequential per-year invoice number, e.g. ABL-NDIS-2026-00042. */
async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `ABL-NDIS-${year}-`;
  const [row] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(ndisInvoices)
    .where(sql`${ndisInvoices.invoiceNumber} LIKE ${prefix + "%"}`);
  const seq = (Number(row?.c) || 0) + 1;
  return prefix + String(seq).padStart(5, "0");
}

export function registerNdisRoutes(app: any): void {
  const router = Router();

  // ---- Participant profile ------------------------------------------------
  router.get("/profile", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const [profileRow] = await db
      .select()
      .from(ndisParticipants)
      .where(eq(ndisParticipants.userId, userId))
      .limit(1);
    res.json({
      profile: profileRow ?? null,
      managementTypes: NDIS_MANAGEMENT_TYPES,
      supportCategories: NDIS_SUPPORT_CATEGORY_SUGGESTIONS,
      notice: PROVIDER_NOTICE,
    });
  });

  router.put("/profile", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid profile", errors: parsed.error.flatten() });
    }
    const v = parsed.data;
    const values = {
      userId,
      participantName: v.participantName,
      ndisNumber: v.ndisNumber,
      dateOfBirth: emptyToNull(v.dateOfBirth),
      managementType: v.managementType,
      planManagerName: emptyToNull(v.planManagerName),
      planManagerEmail: emptyToNull(v.planManagerEmail),
      planManagerCompany: emptyToNull(v.planManagerCompany),
      planStartDate: emptyToNull(v.planStartDate),
      planEndDate: emptyToNull(v.planEndDate),
      contactEmail: emptyToNull(v.contactEmail),
      updatedAt: new Date(),
    };
    const { userId: _conflictKey, ...setValues } = values;
    const [saved] = await db
      .insert(ndisParticipants)
      .values(values)
      .onConflictDoUpdate({ target: ndisParticipants.userId, set: setValues })
      .returning();
    res.json({ profile: saved });
  });

  // ---- Billable items (prefill helper) ------------------------------------
  router.get("/billable", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const dbUser = await storage.getUser(userId);
    const tier = (dbUser?.subscriptionTier || "free") as keyof typeof TIER_PRICING;

    let subscription: {
      tier: string;
      monthlyCents: number;
      yearlyCents: number;
      currency: string;
    } | null = null;
    if (tier !== ("free" as any) && tier in TIER_PRICING && TIER_PRICING[tier].monthly > 0) {
      subscription = {
        tier,
        monthlyCents: TIER_PRICING[tier].monthly,
        yearlyCents: TIER_PRICING[tier].yearly,
        currency: "USD",
      };
    }

    const userPurchases = await storage.getUserPurchases(userId);
    const invoiced = await db
      .select({ sid: ndisInvoices.sourceTransactionId })
      .from(ndisInvoices)
      .where(and(eq(ndisInvoices.userId, userId), eq(ndisInvoices.sourceType, "purchase")));
    const invoicedIds = new Set(invoiced.map((r) => r.sid).filter(Boolean) as string[]);

    res.json({
      subscription,
      purchases: userPurchases.map((p) => ({
        id: p.id,
        bookTitle: p.bookTitle,
        amountCents: p.amountCents,
        currency: (p.currency || "usd").toUpperCase(),
        purchasedAt: p.purchasedAt,
        invoiced: invoicedIds.has(p.id),
      })),
    });
  });

  // ---- Invoices -----------------------------------------------------------
  router.get("/invoices", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const rows = await db
      .select()
      .from(ndisInvoices)
      .where(eq(ndisInvoices.userId, userId))
      .orderBy(desc(ndisInvoices.issuedAt));
    res.json({ invoices: rows });
  });

  router.post("/invoices", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const [profileRow] = await db
      .select()
      .from(ndisParticipants)
      .where(eq(ndisParticipants.userId, userId))
      .limit(1);
    if (!profileRow) {
      return res.status(400).json({ message: "Complete your NDIS participant profile first." });
    }

    const parsed = createInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid invoice", errors: parsed.error.flatten() });
    }
    const v = parsed.data;

    // Derive price + currency server-side for non-manual sources (anti-tamper).
    let unitPriceCents: number;
    let currency = "AUD";
    let quantity = 1;
    let defaultName = "AccessiBooks service";
    let sourceTransactionId: string | null = null;

    if (v.sourceType === "subscription") {
      const dbUser = await storage.getUser(userId);
      const tier = (dbUser?.subscriptionTier || "free") as keyof typeof TIER_PRICING;
      const period = v.period || "monthly";
      if (!(tier in TIER_PRICING) || TIER_PRICING[tier].monthly <= 0) {
        return res.status(400).json({ message: "No paid subscription to invoice." });
      }
      unitPriceCents = period === "yearly" ? TIER_PRICING[tier].yearly : TIER_PRICING[tier].monthly;
      currency = "USD";
      defaultName = `AccessiBooks ${tier} subscription (${period})`;
    } else if (v.sourceType === "purchase") {
      if (!v.sourceTransactionId) {
        return res.status(400).json({ message: "sourceTransactionId is required for a purchase invoice." });
      }
      const [purchase] = await db
        .select()
        .from(purchases)
        .where(and(eq(purchases.id, v.sourceTransactionId), eq(purchases.userId, userId)))
        .limit(1);
      if (!purchase) return res.status(404).json({ message: "Purchase not found." });
      // A purchase can only be claimed once — reject a duplicate invoice.
      const [dupe] = await db
        .select({ id: ndisInvoices.id })
        .from(ndisInvoices)
        .where(and(
          eq(ndisInvoices.userId, userId),
          eq(ndisInvoices.sourceType, "purchase"),
          eq(ndisInvoices.sourceTransactionId, purchase.id),
        ))
        .limit(1);
      if (dupe) return res.status(409).json({ message: "This purchase has already been invoiced." });
      unitPriceCents = purchase.amountCents;
      currency = (purchase.currency || "usd").toUpperCase();
      defaultName = `AccessiBooks title: ${purchase.bookTitle}`;
      sourceTransactionId = purchase.id;
    } else {
      if (!v.unitPriceCents) {
        return res.status(400).json({ message: "unitPriceCents is required for a manual invoice." });
      }
      if (!v.supportItemName) {
        return res.status(400).json({ message: "supportItemName is required for a manual invoice." });
      }
      unitPriceCents = v.unitPriceCents;
      quantity = v.quantity;
      currency = (v.currency || "AUD").toUpperCase();
      defaultName = v.supportItemName;
    }

    const supportItemName = (v.supportItemName && v.supportItemName.trim()) || defaultName;
    const gross = unitPriceCents * quantity;
    // Cap the TOTAL of a manually-entered invoice (not just the unit price) so a
    // large quantity can't be used to mint an inflated claimable amount.
    if (v.sourceType === "manual" && gross > MANUAL_INVOICE_MAX_CENTS) {
      return res.status(400).json({
        message: `Manual invoices are capped at $${(MANUAL_INVOICE_MAX_CENTS / 100).toFixed(0)}. Reduce the amount or quantity.`,
      });
    }
    let amountCents = gross;
    let gstCents = 0;
    if (v.gstTreatment === "GST-inclusive") {
      gstCents = Math.round(gross / 11);
      amountCents = gross - gstCents;
    }
    const totalCents = amountCents + gstCents;

    const baseValues = {
      userId,
      participantName: profileRow.participantName,
      ndisNumber: profileRow.ndisNumber,
      managementType: profileRow.managementType,
      planManagerName: profileRow.planManagerName,
      planManagerEmail: profileRow.planManagerEmail,
      supportItemNumber: emptyToNull(v.supportItemNumber),
      supportItemName,
      serviceDescription: emptyToNull(v.serviceDescription),
      quantity,
      unitPriceCents,
      amountCents,
      gstCents,
      gstTreatment: v.gstTreatment,
      totalCents,
      currency,
      serviceStartDate: emptyToNull(v.serviceStartDate),
      serviceEndDate: emptyToNull(v.serviceEndDate),
      sourceType: v.sourceType,
      sourceTransactionId,
      notes: emptyToNull(v.notes),
    };

    // Insert with retry on the unique invoice-number constraint (concurrent issue).
    let created: NdisInvoice | undefined;
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      const invoiceNumber = await nextInvoiceNumber();
      try {
        [created] = await db
          .insert(ndisInvoices)
          .values({ ...baseValues, invoiceNumber })
          .returning();
      } catch (err: any) {
        if (err?.code === "23505") continue; // duplicate invoice_number — retry
        req.log?.error?.({ err }, "[NDIS] invoice insert failed");
        return res.status(500).json({ message: "Failed to create invoice." });
      }
    }
    if (!created) return res.status(500).json({ message: "Could not allocate an invoice number." });
    res.status(201).json({ invoice: created });
  });

  router.get("/invoices/:id", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const [inv] = await db
      .select()
      .from(ndisInvoices)
      .where(and(eq(ndisInvoices.id, req.params.id), eq(ndisInvoices.userId, userId)))
      .limit(1);
    if (!inv) return res.status(404).json({ message: "Invoice not found" });
    res.json({ invoice: inv });
  });

  router.get("/invoices/:id/pdf", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const [inv] = await db
      .select()
      .from(ndisInvoices)
      .where(and(eq(ndisInvoices.id, req.params.id), eq(ndisInvoices.userId, userId)))
      .limit(1);
    if (!inv) return res.status(404).json({ message: "Invoice not found" });
    const pdf = renderInvoicePdf(inv, provider());
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${inv.invoiceNumber}.pdf"`);
    res.setHeader("Content-Length", String(pdf.length));
    res.end(pdf);
  });

  router.post("/invoices/:id/send", isAuthenticated, async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const [inv] = await db
      .select()
      .from(ndisInvoices)
      .where(and(eq(ndisInvoices.id, req.params.id), eq(ndisInvoices.userId, userId)))
      .limit(1);
    if (!inv) return res.status(404).json({ message: "Invoice not found" });

    const overrideEmail = z.string().email().max(255).optional().safeParse(req.body?.email);
    const recipient = (overrideEmail.success && overrideEmail.data) || inv.planManagerEmail;
    if (!recipient) {
      return res.status(400).json({ message: "No plan manager email on file. Add one to your profile or pass an email." });
    }

    const emailConfigured = isResendConfigured() || isEmailConfigured();
    let emailSent = false;
    if (emailConfigured) {
      const amount = `${inv.currency} $${(inv.totalCents / 100).toFixed(2)}`;
      const text =
        `Hello${inv.planManagerName ? " " + inv.planManagerName : ""},\n\n` +
        `Please find an NDIS invoice for participant ${inv.participantName} (NDIS no. ${inv.ndisNumber}).\n\n` +
        `Invoice: ${inv.invoiceNumber}\nItem: ${inv.supportItemName}\nAmount: ${amount} (${inv.gstTreatment})\n\n` +
        `The participant can supply the PDF copy of this invoice on request.\n\n` +
        `${PROVIDER_NOTICE}\n`;
      const msg = { to: recipient, subject: `NDIS invoice ${inv.invoiceNumber} — ${inv.participantName}`, text };
      try {
        emailSent = (await sendViaResend(msg)) || (await sendEmail(msg));
      } catch (err) {
        req.log?.warn?.({ err }, "[NDIS] plan-manager email failed");
      }
    }

    const [updated] = await db
      .update(ndisInvoices)
      .set({ status: "sent", updatedAt: new Date() })
      .where(eq(ndisInvoices.id, inv.id))
      .returning();
    res.json({ invoice: updated, recipient, emailConfigured, emailSent });
  });

  // ---- Admin --------------------------------------------------------------
  router.get("/admin/invoices", isAuthenticated, requireAdmin, async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(String(req.query.limit)) || 100, 500);
    const offset = parseInt(String(req.query.offset)) || 0;
    const claimFilter = NDIS_CLAIM_STATUSES.includes(req.query.claimStatus as any)
      ? (req.query.claimStatus as string)
      : null;

    const where = claimFilter ? eq(ndisInvoices.claimStatus, claimFilter) : undefined;
    const rows = await db
      .select({
        invoice: ndisInvoices,
        userEmail: users.email,
      })
      .from(ndisInvoices)
      .leftJoin(users, eq(users.id, ndisInvoices.userId))
      .where(where as any)
      .orderBy(desc(ndisInvoices.issuedAt))
      .limit(limit)
      .offset(offset);

    const counts = await db
      .select({ claimStatus: ndisInvoices.claimStatus, c: sql<number>`COUNT(*)` })
      .from(ndisInvoices)
      .groupBy(ndisInvoices.claimStatus);

    res.json({
      invoices: rows.map((r) => ({ ...r.invoice, userEmail: r.userEmail })),
      counts: counts.reduce((acc, r) => ({ ...acc, [r.claimStatus]: Number(r.c) }), {} as Record<string, number>),
      limit,
      offset,
    });
  });

  router.patch("/admin/invoices/:id", isAuthenticated, requireAdmin, async (req: Request, res: Response) => {
    const parsed = adminPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid update", errors: parsed.error.flatten() });
    }
    const set: Record<string, any> = { updatedAt: new Date() };
    if (parsed.data.claimStatus) set.claimStatus = parsed.data.claimStatus;
    if (parsed.data.status) set.status = parsed.data.status;
    if (parsed.data.notes !== undefined) set.notes = parsed.data.notes || null;

    const [updated] = await db
      .update(ndisInvoices)
      .set(set)
      .where(eq(ndisInvoices.id, req.params.id))
      .returning();
    if (!updated) return res.status(404).json({ message: "Invoice not found" });
    res.json({ invoice: updated });
  });

  app.use("/api/ndis", router);
}
