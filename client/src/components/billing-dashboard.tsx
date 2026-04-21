import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, Download, ExternalLink, Crown, DollarSign, Receipt, Clock, ArrowUpRight, ChevronLeft, ChevronRight, FileText, Gift } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { GiftCards } from "./gift-cards";
import { PremiumBadge } from "./premium-badge";

function formatCents(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusBadge(status: string) {
  const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    completed: { variant: "default", label: "Completed" },
    pending: { variant: "secondary", label: "Pending" },
    failed: { variant: "destructive", label: "Failed" },
    refunded: { variant: "outline", label: "Refunded" },
  };
  const cfg = map[status] || { variant: "outline" as const, label: status };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function typeBadge(type: string) {
  const map: Record<string, string> = {
    subscription: "Subscription",
    subscription_renewal: "Renewal",
    subscription_cancelled: "Cancellation",
    donation: "Donation",
    ad_spend: "Ad Spend",
  };
  return <span className="text-xs text-muted-foreground">{map[type] || type}</span>;
}

export function BillingDashboard() {
  const [txPage, setTxPage] = useState(0);
  const pageSize = 10;

  const { data: summary, isLoading: summaryLoading } = useQuery<any>({
    queryKey: ["/api/billing/summary"],
  });

  const { data: txData, isLoading: txLoading } = useQuery<any>({
    queryKey: ["/api/billing/transactions", txPage],
    queryFn: () =>
      fetch(`/api/billing/transactions?limit=${pageSize}&offset=${txPage * pageSize}`, {
        credentials: "include",
      }).then((r) => r.json()),
  });

  const { data: invoiceData, isLoading: invoicesLoading } = useQuery<any>({
    queryKey: ["/api/billing/invoices"],
  });

  const portalMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/billing/create-portal-session"),
    onSuccess: async (res) => {
      const data = await res.json();
      if (data.url) window.open(data.url, "_blank");
    },
  });

  const transactions = txData?.transactions || [];
  const totalTx = txData?.total || 0;
  const totalPages = Math.ceil(totalTx / pageSize);
  const invoices = invoiceData?.invoices || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6" />
            Billing & Payments
            <PremiumBadge size="md" />
          </h2>
          <p className="text-muted-foreground mt-1">
            View your payment history, invoices, and manage billing settings
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => portalMutation.mutate()}
          disabled={portalMutation.isPending || !summary?.subscription?.stripeSubscriptionId}
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          Manage Billing
        </Button>
      </div>

      {summaryLoading ? (
        <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardContent className="pt-4 sm:pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-primary/10 p-2">
                    <Crown className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Plan</p>
                    <p className="text-xl font-semibold capitalize">
                      {summary?.subscription?.tier || "Free"}
                    </p>
                  </div>
                </div>
                {summary?.subscription?.endDate && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {summary?.subscription?.isPremium ? "Renews" : "Expires"}{" "}
                    {formatDate(summary.subscription.endDate)}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 sm:pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-green-500/10 p-2">
                    <DollarSign className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Spent</p>
                    <p className="text-xl font-semibold">
                      {formatCents(summary?.spending?.totalCents || 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 sm:pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-blue-500/10 p-2">
                    <CreditCard className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Subscriptions</p>
                    <p className="text-xl font-semibold">
                      {formatCents(summary?.spending?.subscriptionCents || 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 sm:pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-purple-500/10 p-2">
                    <ArrowUpRight className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Donations</p>
                    <p className="text-xl font-semibold">
                      {formatCents(summary?.spending?.donationCents || 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {summary?.upcomingInvoice && (
            <Card className="border-dashed border-yellow-500/50 bg-yellow-50/30 dark:bg-yellow-950/10">
              <CardContent className="pt-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-yellow-600" />
                  <div>
                    <p className="font-medium">Upcoming Payment</p>
                    <p className="text-sm text-muted-foreground">
                      {formatCents(summary.upcomingInvoice.amountCents, summary.upcomingInvoice.currency)} due{" "}
                      {formatDate(summary.upcomingInvoice.dueDate)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {summary?.paymentMethods?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Payment Methods</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {summary.paymentMethods.map((pm: any) => (
                    <div
                      key={pm.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                        <span className="capitalize font-medium">{pm.brand}</span>
                        <span className="text-muted-foreground">•••• {pm.last4}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        Exp {pm.expMonth}/{pm.expYear}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Transaction History
          </CardTitle>
          <CardDescription>
            All payments across Stripe, PayPal, and cryptocurrency
          </CardDescription>
        </CardHeader>
        <CardContent>
          {txLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Receipt className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No transactions yet</p>
              <p className="text-sm">Your payment history will appear here</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {transactions.map((tx: any) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="shrink-0">
                        {tx.provider === "stripe" && <CreditCard className="h-4 w-4 text-indigo-500" />}
                        {tx.provider === "paypal" && <DollarSign className="h-4 w-4 text-blue-500" />}
                        {tx.provider === "coinbase" && <DollarSign className="h-4 w-4 text-orange-500" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{tx.description || tx.type}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {typeBadge(tx.type)}
                          <span className="text-xs text-muted-foreground">
                            {formatDate(tx.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`font-semibold text-sm ${tx.status === "failed" ? "text-destructive" : ""}`}>
                        {tx.amountCents > 0 ? formatCents(tx.amountCents, tx.currency) : "—"}
                      </span>
                      {statusBadge(tx.status)}
                      {tx.receiptUrl && (
                        <a
                          href={tx.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="View receipt"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Page {txPage + 1} of {totalPages} ({totalTx} total)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={txPage === 0}
                      onClick={() => setTxPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={txPage >= totalPages - 1}
                      onClick={() => setTxPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Invoices
          </CardTitle>
          <CardDescription>Download PDF invoices from Stripe</CardDescription>
        </CardHeader>
        <CardContent>
          {invoicesLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No invoices available</p>
            </div>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv: any) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{inv.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {inv.number || inv.id}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(inv.date)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-semibold text-sm">
                      {formatCents(inv.amountCents, inv.currency)}
                    </span>
                    {statusBadge(inv.status || "completed")}
                    <div className="flex gap-1">
                      {inv.pdfUrl && (
                        <a
                          href={inv.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Download PDF"
                        >
                          <Button variant="ghost" size="sm">
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                      )}
                      {inv.hostedUrl && (
                        <a
                          href={inv.hostedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="View invoice online"
                        >
                          <Button variant="ghost" size="sm">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      <GiftCards />
    </div>
  );
}
