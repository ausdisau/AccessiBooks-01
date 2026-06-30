import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { HeartHandshake, Shield, RefreshCw } from "lucide-react";

const CLAIM_STATUSES = ["unclaimed", "submitted", "paid", "rejected"] as const;
type ClaimStatus = (typeof CLAIM_STATUSES)[number];
const CLAIM_LABELS: Record<ClaimStatus, string> = {
  unclaimed: "Not yet claimed",
  submitted: "Submitted",
  paid: "Reimbursed",
  rejected: "Rejected",
};
const MANAGEMENT_LABELS: Record<string, string> = {
  self_managed: "Self-managed",
  plan_managed: "Plan-managed",
  agency_managed: "NDIA-managed",
};

interface AdminInvoice {
  id: string;
  invoiceNumber: string;
  participantName: string;
  ndisNumber: string;
  managementType: string;
  supportItemName: string;
  totalCents: number;
  currency: string;
  status: string;
  claimStatus: string;
  issuedAt: string;
  userEmail: string | null;
}
interface AdminResponse {
  invoices: AdminInvoice[];
  counts: Record<string, number>;
}

function money(cents: number, currency: string) {
  return `${currency} $${(cents / 100).toFixed(2)}`;
}
function fmtDate(d: string) {
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? d : date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminNdisPage() {
  const { user } = useAuth();
  const u = user as { role?: string; subscriptionTier?: string } | undefined;
  const isAdmin = u?.role === "admin" || u?.subscriptionTier === "admin";

  const [filter, setFilter] = useState<ClaimStatus | "">("");

  const { data, isLoading, isError, refetch, isFetching } = useQuery<AdminResponse>({
    queryKey: ["/api/ndis/admin/invoices", filter],
    queryFn: () =>
      fetch(`/api/ndis/admin/invoices${filter ? `?claimStatus=${filter}` : ""}`, { credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error("Access denied");
        return r.json();
      }),
    enabled: isAdmin,
    retry: false,
  });

  const updateClaim = useMutation({
    mutationFn: async (vars: { id: string; claimStatus: ClaimStatus }) =>
      (await apiRequest("PATCH", `/api/ndis/admin/invoices/${vars.id}`, { claimStatus: vars.claimStatus })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ndis/admin/invoices"] });
    },
  });

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8 space-y-4">
        <div className="bg-destructive/10 rounded-full p-4">
          <Shield className="h-10 w-10 text-destructive" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-semibold">Admin Access Required</h2>
        <p className="text-muted-foreground max-w-md">This page is restricted to admin accounts.</p>
      </div>
    );
  }

  const counts = data?.counts || {};

  return (
    <div className="space-y-6" role="region" aria-label="NDIS invoice administration">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HeartHandshake className="h-6 w-6 text-primary" aria-hidden="true" />
            NDIS Invoices
          </h1>
          <p className="text-muted-foreground mt-1">Track claim status across all participants — admin only.</p>
        </div>
        <button onClick={() => refetch()} disabled={isFetching}
          className="p-2 rounded-lg hover:bg-muted transition-colors" aria-label="Refresh">
          <RefreshCw className={`h-4 w-4 text-muted-foreground ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by claim status">
        <button type="button" onClick={() => setFilter("")}
          className={`rounded-full border px-4 py-1.5 text-sm ${filter === "" ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-muted"}`}>
          All
        </button>
        {CLAIM_STATUSES.map((s) => (
          <button key={s} type="button" onClick={() => setFilter(s)}
            className={`rounded-full border px-4 py-1.5 text-sm ${filter === s ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-muted"}`}>
            {CLAIM_LABELS[s]}{counts[s] != null ? ` (${counts[s]})` : ""}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Invoices</CardTitle>
          <CardDescription>Update a claim's status as it moves through reimbursement.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-60 rounded-lg" />
          ) : isError ? (
            <p className="text-sm text-destructive py-6 text-center">Could not load invoices.</p>
          ) : !data?.invoices.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No invoices found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Invoice</th>
                    <th className="py-2 pr-4 font-medium">Participant</th>
                    <th className="py-2 pr-4 font-medium">Account</th>
                    <th className="py-2 pr-4 font-medium">Total</th>
                    <th className="py-2 pr-4 font-medium">Issued</th>
                    <th className="py-2 pr-4 font-medium">Claim status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.invoices.map((inv) => (
                    <tr key={inv.id} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        <div className="font-medium">{inv.invoiceNumber}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">{inv.supportItemName}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <div>{inv.participantName}</div>
                        <div className="text-xs text-muted-foreground">
                          {inv.ndisNumber} · {MANAGEMENT_LABELS[inv.managementType] ?? inv.managementType}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">{inv.userEmail ?? "—"}</td>
                      <td className="py-3 pr-4 font-medium whitespace-nowrap">{money(inv.totalCents, inv.currency)}</td>
                      <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">{fmtDate(inv.issuedAt)}</td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <Badge variant={inv.claimStatus === "paid" ? "default" : inv.claimStatus === "rejected" ? "destructive" : "secondary"}>
                            {CLAIM_LABELS[inv.claimStatus as ClaimStatus] ?? inv.claimStatus}
                          </Badge>
                          <select
                            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                            value={inv.claimStatus}
                            disabled={updateClaim.isPending}
                            onChange={(e) => updateClaim.mutate({ id: inv.id, claimStatus: e.target.value as ClaimStatus })}
                            aria-label={`Update claim status for ${inv.invoiceNumber}`}
                          >
                            {CLAIM_STATUSES.map((s) => (
                              <option key={s} value={s}>{CLAIM_LABELS[s]}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
