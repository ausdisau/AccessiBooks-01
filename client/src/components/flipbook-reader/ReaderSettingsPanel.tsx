import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { ReaderSettingsPanelProps } from "./flipbook-types";

export function ReaderSettingsPanel({ open, onClose }: ReaderSettingsPanelProps) {
  if (!open) return null;
  return (
    <aside
      id="flipbook-settings-panel"
      role="region"
      aria-label="Reader settings"
      className="border-l border-border bg-card w-72 flex flex-col"
      data-testid="flipbook-settings-panel"
    >
      <header className="flex items-center justify-between p-3 border-b border-border">
        <h2 className="text-sm font-semibold">Reader settings</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close settings"
          data-testid="flipbook-settings-close"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </header>
      <div className="p-4 text-sm text-muted-foreground">
        <p>Typography, themes, and presets land in Stage 2.</p>
      </div>
    </aside>
  );
}
