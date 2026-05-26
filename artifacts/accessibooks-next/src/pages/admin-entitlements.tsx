import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Save, RotateCcw, Loader2 } from "lucide-react";

type Feature = { key: string; label: string; description: string };
type GridResponse = {
  features: Feature[];
  tiers: string[];
  matrix: Record<string, boolean>; // key = `${featureKey}::${tier}`
  defaults: Record<string, Record<string, boolean>>;
};

function k(featureKey: string, tier: string) {
  return `${featureKey}::${tier}`;
}

export default function AdminEntitlementsPage() {
  const { toast } = useToast();
  const { data, isLoading, isError } = useQuery<GridResponse>({
    queryKey: ["/api/admin/entitlements"],
  });

  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) {
      // Initialise draft from server matrix; pre-fill missing pairs with the
      // documented default so the grid is never visually empty.
      const next: Record<string, boolean> = {};
      for (const f of data.features) {
        for (const t of data.tiers) {
          const key = k(f.key, t);
          if (key in data.matrix) next[key] = data.matrix[key];
          else next[key] = data.defaults?.[f.key]?.[t] ?? false;
        }
      }
      setDraft(next);
      setDirty(false);
    }
  }, [data]);

  const dirtyCount = useMemo(() => {
    if (!data) return 0;
    let n = 0;
    for (const f of data.features) {
      for (const t of data.tiers) {
        const key = k(f.key, t);
        const orig = data.matrix[key] ?? data.defaults?.[f.key]?.[t] ?? false;
        if (draft[key] !== orig) n++;
      }
    }
    return n;
  }, [draft, data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!data) return;
      const rows: Array<{ featureKey: string; tier: string; enabled: boolean }> = [];
      for (const f of data.features) {
        for (const t of data.tiers) {
          rows.push({ featureKey: f.key, tier: t, enabled: !!draft[k(f.key, t)] });
        }
      }
      return apiRequest("PUT", "/api/admin/entitlements", { rows });
    },
    onSuccess: () => {
      toast({ title: "Entitlements saved", description: "Changes apply to new requests immediately." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/entitlements"] });
      setDirty(false);
    },
    onError: () => {
      toast({ title: "Failed to save", variant: "destructive" });
    },
  });

  const handleToggle = (featureKey: string, tier: string, value: boolean) => {
    setDraft(prev => ({ ...prev, [k(featureKey, tier)]: value }));
    setDirty(true);
  };

  const handleDiscard = () => {
    if (!data) return;
    const next: Record<string, boolean> = {};
    for (const f of data.features) {
      for (const t of data.tiers) {
        const key = k(f.key, t);
        next[key] = data.matrix[key] ?? data.defaults?.[f.key]?.[t] ?? false;
      }
    }
    setDraft(next);
    setDirty(false);
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-6 space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="max-w-4xl mx-auto py-6">
        <p className="text-sm text-destructive">
          Could not load entitlement config. You may not have admin access.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tier Entitlements</h1>
          <p className="text-sm text-muted-foreground">
            Toggle which gated features are enabled for each subscription tier. Changes take
            effect immediately for new requests — no restart needed. Unchecked rows fall back to
            the hard-coded default in the entitlement service.
          </p>
        </div>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm" data-testid="entitlements-grid">
          <thead className="bg-muted/40">
            <tr>
              <th scope="col" className="text-left p-3 font-medium w-2/5">Feature</th>
              {data.tiers.map(t => (
                <th key={t} scope="col" className="text-center p-3 font-medium capitalize">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.features.map((f) => (
              <tr key={f.key} className="border-t">
                <th scope="row" className="text-left p-3 align-top">
                  <div className="font-medium">{f.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{f.description}</div>
                  <code className="text-[10px] text-muted-foreground/70 mt-1 inline-block">
                    {f.key}
                  </code>
                </th>
                {data.tiers.map(t => {
                  const key = k(f.key, t);
                  const id = `cell-${f.key}-${t}`;
                  const checked = !!draft[key];
                  const orig = data.matrix[key] ?? data.defaults?.[f.key]?.[t] ?? false;
                  const changed = checked !== orig;
                  return (
                    <td key={t} className="text-center p-3">
                      <label htmlFor={id} className="sr-only">
                        Enable {f.label} for {t}
                      </label>
                      <Checkbox
                        id={id}
                        data-testid={`entitlement-${f.key}-${t}`}
                        checked={checked}
                        onCheckedChange={(v) => handleToggle(f.key, t, !!v)}
                      />
                      {changed && (
                        <Badge variant="outline" className="ml-2 text-[10px] py-0">
                          changed
                        </Badge>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 sticky bottom-0 bg-background/90 backdrop-blur py-3 border-t">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {dirtyCount > 0 ? `${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}` : "All changes saved"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleDiscard}
            disabled={!dirty || saveMutation.isPending}
            data-testid="button-discard-entitlements"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Discard
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!dirty || saveMutation.isPending}
            data-testid="button-save-entitlements"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}
