import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { AnnotationPanelProps } from "./flipbook-types";

export function AnnotationPanel({ open, onClose }: AnnotationPanelProps) {
  if (!open) return null;
  return (
    <aside
      id="flipbook-annotations-panel"
      role="region"
      aria-label="Annotations"
      data-flipbook-panel="annotations"
      className="border-l w-72 flex flex-col"
      style={{
        background: "var(--fb-surface)",
        color: "var(--fb-fg)",
        borderColor: "var(--fb-border)",
      }}
      data-testid="flipbook-annotations-panel"
    >
      <header className="flex items-center justify-between p-3 border-b" style={{ borderColor: "var(--fb-border)" }}>
        <h2 className="text-sm font-semibold">Annotations</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close annotations"
          data-testid="flipbook-annotations-close"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </header>
      <div className="p-4 text-sm text-muted-foreground">
        <p>Written and voice annotations arrive in Stage 4.</p>
      </div>
    </aside>
  );
}
