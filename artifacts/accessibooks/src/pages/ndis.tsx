import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import {
  HeartHandshake, FileText, Download, Send, Save, Info, Loader2, CheckCircle2, AlertTriangle,
} from "lucide-react";

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const labelCls = "block text-sm font-medium mb-1";

const MANAGEMENT_LABELS: Record<string, string> = {
  self_managed: "Self-managed",
  plan_managed: "Plan-managed",
  agency_managed: "NDIA-managed (Agency)",
};
const CLAIM_LABELS: Record<string, string> = {
  unclaimed: "Not yet claimed",
  submitted: "Submitted",
  paid: "Reimbursed",
  rejected: "Rejected",
};
const GST_TREATMENTS = ["GST-free", "GST-inclusive"] as const;

interface NdisProfile {
  id: string;
  userId: string;
  participantName: string;
  ndisNumber: string;
  dateOfBirth: string | null;
  managementType: string;
  planManagerName: string | null;
  planManagerEmail: string | null;
  planManagerCompany: string | null;
  planStartDate: string | null;
  planEndDate: string | null;
  contactEmail: string | null;
}
interface SupportCategory { value: string; label: string }
interface ProfileResponse {
  profile: NdisProfile | null;
  managementTypes: string[];
  supportCategories: SupportCategory[];
  notice: string;
}
interface NdisInvoice {
  id: string;
  invoiceNumber: string;
  participantName: string;
  ndisNumber: string;
  supportItemNumber: string | null;
  supportItemName: string;
  serviceDescription: string | null;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  gstCents: number;
  gstTreatment: string;
  totalCents: number;
  currency: string;
  serviceStartDate: string | null;
  serviceEndDate: string | null;
  status: string;
  claimStatus: string;
  sourceType: string;
  issuedAt: string;
}
interface BillableResponse {
  subscription: { tier: string; monthlyCents: number; yearlyCents: number; currency: string } | null;
  purchases: { id: string; bookTitle: string; amountCents: number; currency: string; purchasedAt: string | null; invoiced: boolean }[];
}

function money(cents: number, currency: string) {
  return `${currency} $${(cents / 100).toFixed(2)}`;
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? d : date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

type SourceType = "subscription" | "purchase" | "manual";

const emptyProfile = {
  participantName: "",
  ndisNumber: "",
  dateOfBirth: "",
  managementType: "self_managed",
  planManagerName: "",
  planManagerEmail: "",
  planManagerCompany: "",
  planStartDate: "",
  planEndDate: "",
  contactEmail: "",
};

export default function NdisPage() {
  const { isAuthenticated } = useAuth();

  const profileQuery = useQuery<ProfileResponse>({ queryKey: ["/api/ndis/profile"], enabled: isAuthenticated });
  const billableQuery = useQuery<BillableResponse>({ queryKey: ["/api/ndis/billable"], enabled: isAuthenticated });
  const invoicesQuery = useQuery<{ invoices: NdisInvoice[] }>({ queryKey: ["/api/ndis/invoices"], enabled: isAuthenticated });

  const [form, setForm] = useState({ ...emptyProfile });
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  useEffect(() => {
    const p = profileQuery.data?.profile;
    if (p) {
      setForm({
        participantName: p.participantName ?? "",
        ndisNumber: p.ndisNumber ?? "",
        dateOfBirth: p.dateOfBirth ?? "",
        managementType: p.managementType ?? "self_managed",
        planManagerName: p.planManagerName ?? "",
        planManagerEmail: p.planManagerEmail ?? "",
        planManagerCompany: p.planManagerCompany ?? "",
        planStartDate: p.planStartDate ?? "",
        planEndDate: p.planEndDate ?? "",
        contactEmail: p.contactEmail ?? "",
      });
    }
  }, [profileQuery.data?.profile]);

  const saveProfile = useMutation({
    mutationFn: async () => (await apiRequest("PUT", "/api/ndis/profile", form)).json(),
    onSuccess: () => {
      setProfileMsg("Profile saved.");
      queryClient.invalidateQueries({ queryKey: ["/api/ndis/profile"] });
      setTimeout(() => setProfileMsg(null), 4000);
    },
    onError: (e: any) => setProfileMsg(e?.message || "Could not save profile."),
  });

  const hasProfile = !!profileQuery.data?.profile;

  // ---- Create invoice form ----
  const [sourceType, setSourceType] = useState<SourceType>("manual");
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const [purchaseId, setPurchaseId] = useState("");
  const [supportItemNumber, setSupportItemNumber] = useState("");
  const [supportItemName, setSupportItemName] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [gstTreatment, setGstTreatment] = useState<(typeof GST_TREATMENTS)[number]>("GST-free");
  const [serviceStartDate, setServiceStartDate] = useState("");
  const [serviceEndDate, setServiceEndDate] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualQty, setManualQty] = useState(1);
  const [manualCurrency, setManualCurrency] = useState("AUD");
  const [notes, setNotes] = useState("");
  const [invoiceMsg, setInvoiceMsg] = useState<string | null>(null);

  const sub = billableQuery.data?.subscription || null;
  const purchases = billableQuery.data?.purchases || [];
  const selectedPurchase = purchases.find((p) => p.id === purchaseId) || null;

  const preview = useMemo(() => {
    let unit = 0;
    let qty = 1;
    let currency = "AUD";
    if (sourceType === "manual") {
      unit = Math.round((parseFloat(manualPrice) || 0) * 100);
      qty = manualQty;
      currency = manualCurrency.toUpperCase();
    } else if (sourceType === "subscription" && sub) {
      unit = period === "yearly" ? sub.yearlyCents : sub.monthlyCents;
      currency = sub.currency;
    } else if (sourceType === "purchase" && selectedPurchase) {
      unit = selectedPurchase.amountCents;
      currency = selectedPurchase.currency;
    }
    const gross = unit * qty;
    const gst = gstTreatment === "GST-inclusive" ? Math.round(gross / 11) : 0;
    return { subtotal: gross - gst, gst, total: gross, currency };
  }, [sourceType, manualPrice, manualQty, manualCurrency, period, sub, selectedPurchase, gstTreatment]);

  const createInvoice = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        sourceType,
        supportItemNumber: supportItemNumber || undefined,
        supportItemName: supportItemName || undefined,
        serviceDescription: serviceDescription || undefined,
        gstTreatment,
        serviceStartDate: serviceStartDate || undefined,
        serviceEndDate: serviceEndDate || undefined,
        notes: notes || undefined,
      };
      if (sourceType === "subscription") payload.period = period;
      if (sourceType === "purchase") payload.sourceTransactionId = purchaseId;
      if (sourceType === "manual") {
        payload.unitPriceCents = Math.round((parseFloat(manualPrice) || 0) * 100);
        payload.quantity = manualQty;
        payload.currency = manualCurrency.toUpperCase();
      }
      return (await apiRequest("POST", "/api/ndis/invoices", payload)).json();
    },
    onSuccess: () => {
      setInvoiceMsg("Invoice created.");
      setSupportItemNumber(""); setSupportItemName(""); setServiceDescription("");
      setManualPrice(""); setManualQty(1); setNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/ndis/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ndis/billable"] });
      setTimeout(() => setInvoiceMsg(null), 4000);
    },
    onError: (e: any) => setInvoiceMsg(e?.message || "Could not create invoice."),
  });

  async function downloadPdf(inv: NdisInvoice) {
    try {
      const res = await apiRequest("GET", `/api/ndis/invoices/${inv.id}/pdf`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${inv.invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      /* surfaced via the invoice list state below */
    }
  }

  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  async function sendToPlanManager(inv: NdisInvoice) {
    setSendingId(inv.id);
    setSendMsg(null);
    try {
      const res = await apiRequest("POST", `/api/ndis/invoices/${inv.id}/send`, {});
      const body = await res.json();
      setSendMsg(
        body.emailSent
          ? `Sent to ${body.recipient}.`
          : body.emailConfigured
            ? `Marked sent, but the email to ${body.recipient} did not go through.`
            : `Marked as sent. Email delivery isn't configured, so download the PDF and forward it to ${body.recipient}.`,
      );
      queryClient.invalidateQueries({ queryKey: ["/api/ndis/invoices"] });
    } catch (e: any) {
      setSendMsg(e?.message || "Could not send invoice.");
    } finally {
      setSendingId(null);
      setTimeout(() => setSendMsg(null), 8000);
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center p-8 space-y-3">
        <HeartHandshake className="h-10 w-10 text-primary" aria-hidden="true" />
        <h2 className="text-xl font-semibold">Sign in to manage NDIS claims</h2>
        <p className="text-muted-foreground max-w-md">
          Record your NDIS plan details and generate claimable invoices for your AccessiBooks costs.
        </p>
      </div>
    );
  }

  const notice = profileQuery.data?.notice;
  const categories = profileQuery.data?.supportCategories || [];

  return (
    <div className="space-y-6" role="region" aria-label="NDIS claims and invoicing" data-testid="panel-ndis">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <HeartHandshake className="h-6 w-6 text-primary" aria-hidden="true" />
          NDIS Claims &amp; Invoicing
        </h1>
        <p className="text-muted-foreground mt-1">
          Generate NDIS-compliant invoices for your AccessiBooks spend so a plan manager or the NDIA can reimburse you.
        </p>
      </div>

      {notice && (
        <div className="flex gap-3 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm">
          <Info className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <p>{notice}</p>
        </div>
      )}

      {/* Participant profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            Participant profile
            {hasProfile && <Badge variant="secondary">Saved</Badge>}
          </CardTitle>
          <CardDescription>
            Your details are snapshotted onto each invoice at the time it's created.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {profileQuery.isLoading ? (
            <Skeleton className="h-64 rounded-lg" />
          ) : (
            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={(e) => { e.preventDefault(); saveProfile.mutate(); }}
            >
              <div>
                <label className={labelCls} htmlFor="ndis-name">Participant full name</label>
                <input id="ndis-name" className={inputCls} value={form.participantName}
                  onChange={(e) => setForm({ ...form, participantName: e.target.value })} required />
              </div>
              <div>
                <label className={labelCls} htmlFor="ndis-number">NDIS number</label>
                <input id="ndis-number" className={inputCls} value={form.ndisNumber} inputMode="numeric"
                  placeholder="9 digits" onChange={(e) => setForm({ ...form, ndisNumber: e.target.value })} required />
              </div>
              <div>
                <label className={labelCls} htmlFor="ndis-dob">Date of birth</label>
                <input id="ndis-dob" type="date" className={inputCls} value={form.dateOfBirth}
                  onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
              </div>
              <div>
                <label className={labelCls} htmlFor="ndis-mgmt">Plan management</label>
                <select id="ndis-mgmt" className={inputCls} value={form.managementType}
                  onChange={(e) => setForm({ ...form, managementType: e.target.value })}>
                  {(profileQuery.data?.managementTypes || Object.keys(MANAGEMENT_LABELS)).map((t) => (
                    <option key={t} value={t}>{MANAGEMENT_LABELS[t] ?? t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="ndis-pm-name">Plan manager name</label>
                <input id="ndis-pm-name" className={inputCls} value={form.planManagerName}
                  onChange={(e) => setForm({ ...form, planManagerName: e.target.value })} />
              </div>
              <div>
                <label className={labelCls} htmlFor="ndis-pm-email">Plan manager email</label>
                <input id="ndis-pm-email" type="email" className={inputCls} value={form.planManagerEmail}
                  placeholder="invoices@planmanager.com.au"
                  onChange={(e) => setForm({ ...form, planManagerEmail: e.target.value })} />
              </div>
              <div>
                <label className={labelCls} htmlFor="ndis-pm-company">Plan manager company</label>
                <input id="ndis-pm-company" className={inputCls} value={form.planManagerCompany}
                  onChange={(e) => setForm({ ...form, planManagerCompany: e.target.value })} />
              </div>
              <div>
                <label className={labelCls} htmlFor="ndis-contact">Your contact email</label>
                <input id="ndis-contact" type="email" className={inputCls} value={form.contactEmail}
                  onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
              </div>
              <div>
                <label className={labelCls} htmlFor="ndis-plan-start">Plan start date</label>
                <input id="ndis-plan-start" type="date" className={inputCls} value={form.planStartDate}
                  onChange={(e) => setForm({ ...form, planStartDate: e.target.value })} />
              </div>
              <div>
                <label className={labelCls} htmlFor="ndis-plan-end">Plan end date</label>
                <input id="ndis-plan-end" type="date" className={inputCls} value={form.planEndDate}
                  onChange={(e) => setForm({ ...form, planEndDate: e.target.value })} />
              </div>
              <div className="md:col-span-2 flex items-center gap-3">
                <button type="submit" disabled={saveProfile.isPending}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                  {saveProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save profile
                </button>
                {profileMsg && <span className="text-sm text-muted-foreground">{profileMsg}</span>}
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Create invoice */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Create an invoice</CardTitle>
          <CardDescription>
            {hasProfile ? "Pick what you're claiming for. Prices for subscriptions and purchases come from your account records."
              : "Save your participant profile above first."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <fieldset disabled={!hasProfile} className="space-y-4">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What are you claiming?">
              {([
                ["subscription", "Subscription"],
                ["purchase", "A purchased title"],
                ["manual", "Other amount"],
              ] as [SourceType, string][]).map(([val, label]) => (
                <button key={val} type="button" role="radio" aria-checked={sourceType === val}
                  onClick={() => setSourceType(val)}
                  className={`rounded-full border px-4 py-1.5 text-sm ${sourceType === val ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-muted"}`}>
                  {label}
                </button>
              ))}
            </div>

            {sourceType === "subscription" && (
              <div className="rounded-lg border border-input p-4 text-sm">
                {sub ? (
                  <div className="flex flex-wrap items-center gap-4">
                    <span>Plan: <strong className="capitalize">{sub.tier}</strong></span>
                    <label className="flex items-center gap-2">
                      Billing period
                      <select className={inputCls + " w-auto"} value={period} onChange={(e) => setPeriod(e.target.value as any)}>
                        <option value="monthly">Monthly — {money(sub.monthlyCents, sub.currency)}</option>
                        <option value="yearly">Yearly — {money(sub.yearlyCents, sub.currency)}</option>
                      </select>
                    </label>
                  </div>
                ) : (
                  <p className="text-muted-foreground">You don't have a paid subscription to invoice. Use “Other amount” instead.</p>
                )}
              </div>
            )}

            {sourceType === "purchase" && (
              <div className="rounded-lg border border-input p-4 text-sm">
                {purchases.length ? (
                  <label className="block">
                    <span className={labelCls}>Purchased title</span>
                    <select className={inputCls} value={purchaseId} onChange={(e) => setPurchaseId(e.target.value)}>
                      <option value="">Select a purchase…</option>
                      {purchases.map((p) => (
                        <option key={p.id} value={p.id} disabled={p.invoiced}>
                          {p.bookTitle} — {money(p.amountCents, p.currency)}{p.invoiced ? " (already invoiced)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="text-muted-foreground">No recorded purchases yet.</p>
                )}
              </div>
            )}

            {sourceType === "manual" && (
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className={labelCls} htmlFor="ndis-amt">Amount paid (per unit)</label>
                  <input id="ndis-amt" className={inputCls} inputMode="decimal" placeholder="0.00"
                    value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="ndis-qty">Quantity</label>
                  <input id="ndis-qty" type="number" min={1} max={999} className={inputCls}
                    value={manualQty} onChange={(e) => setManualQty(Math.max(1, parseInt(e.target.value) || 1))} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="ndis-cur">Currency</label>
                  <select id="ndis-cur" className={inputCls} value={manualCurrency} onChange={(e) => setManualCurrency(e.target.value)}>
                    <option value="AUD">AUD</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="ndis-item-name">Description {sourceType === "manual" && <span className="text-muted-foreground">(required)</span>}</label>
                <input id="ndis-item-name" className={inputCls} value={supportItemName}
                  list="ndis-categories" placeholder="e.g. Accessible reading subscription"
                  onChange={(e) => setSupportItemName(e.target.value)} />
                <datalist id="ndis-categories">
                  {categories.map((c) => <option key={c.value} value={c.label} />)}
                </datalist>
              </div>
              <div>
                <label className={labelCls} htmlFor="ndis-item-no">Support item number <span className="text-muted-foreground">(optional)</span></label>
                <input id="ndis-item-no" className={inputCls} value={supportItemNumber}
                  placeholder="From your plan manager / NDIA"
                  onChange={(e) => setSupportItemNumber(e.target.value)} />
              </div>
              <div>
                <label className={labelCls} htmlFor="ndis-gst">GST treatment</label>
                <select id="ndis-gst" className={inputCls} value={gstTreatment} onChange={(e) => setGstTreatment(e.target.value as any)}>
                  {GST_TREATMENTS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} htmlFor="ndis-svc-start">Service from</label>
                  <input id="ndis-svc-start" type="date" className={inputCls} value={serviceStartDate}
                    onChange={(e) => setServiceStartDate(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="ndis-svc-end">Service to</label>
                  <input id="ndis-svc-end" type="date" className={inputCls} value={serviceEndDate}
                    onChange={(e) => setServiceEndDate(e.target.value)} />
                </div>
              </div>
              <div className="md:col-span-2">
                <label className={labelCls} htmlFor="ndis-notes">Notes <span className="text-muted-foreground">(optional)</span></label>
                <textarea id="ndis-notes" className={inputCls} rows={2} value={notes}
                  onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-muted/50 p-4">
              <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <div className="flex gap-2"><dt className="text-muted-foreground">Subtotal</dt><dd>{money(preview.subtotal, preview.currency)}</dd></div>
                <div className="flex gap-2"><dt className="text-muted-foreground">GST</dt><dd>{money(preview.gst, preview.currency)}</dd></div>
                <div className="flex gap-2"><dt className="font-medium">Total</dt><dd className="font-semibold">{money(preview.total, preview.currency)}</dd></div>
              </dl>
              <div className="flex items-center gap-3">
                {invoiceMsg && <span className="text-sm text-muted-foreground">{invoiceMsg}</span>}
                <button type="button" disabled={createInvoice.isPending || preview.total <= 0}
                  onClick={() => createInvoice.mutate()}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                  {createInvoice.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Create invoice
                </button>
              </div>
            </div>
          </fieldset>
        </CardContent>
      </Card>

      {/* Invoice history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your invoices</CardTitle>
          <CardDescription>Download the PDF or send it straight to your plan manager.</CardDescription>
        </CardHeader>
        <CardContent>
          {sendMsg && (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-input bg-muted/50 p-3 text-sm">
              <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
              {sendMsg}
            </div>
          )}
          {invoicesQuery.isLoading ? (
            <Skeleton className="h-40 rounded-lg" />
          ) : !invoicesQuery.data?.invoices.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No invoices yet.</p>
          ) : (
            <div className="space-y-3">
              {invoicesQuery.data.invoices.map((inv) => (
                <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-input p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{inv.invoiceNumber}</span>
                      <Badge variant={inv.claimStatus === "paid" ? "default" : inv.claimStatus === "rejected" ? "destructive" : "secondary"}>
                        {CLAIM_LABELS[inv.claimStatus] ?? inv.claimStatus}
                      </Badge>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{inv.supportItemName} · {fmtDate(inv.issuedAt)}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-semibold">{money(inv.totalCents, inv.currency)}</span>
                    <button type="button" onClick={() => downloadPdf(inv)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted">
                      <Download className="h-4 w-4" /> PDF
                    </button>
                    <button type="button" onClick={() => sendToPlanManager(inv)} disabled={sendingId === inv.id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60">
                      {sendingId === inv.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {invoicesQuery.isError && (
            <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" /> Could not load invoices.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
