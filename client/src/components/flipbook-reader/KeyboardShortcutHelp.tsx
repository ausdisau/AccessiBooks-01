import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";
import type { KeyboardShortcutHelpProps } from "./flipbook-types";

const SHORTCUTS: { key: string; description: string }[] = [
  { key: "→", description: "Next page" },
  { key: "←", description: "Previous page" },
  { key: "Page Down", description: "Next page" },
  { key: "Page Up", description: "Previous page" },
  { key: "Home", description: "First page" },
  { key: "End", description: "Last page" },
  { key: "Esc", description: "Close panel or dialog" },
];

export function KeyboardShortcutHelp({ open, onOpenChange }: KeyboardShortcutHelpProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md focus:outline-none"
        aria-describedby="flipbook-shortcuts-desc"
        data-testid="flipbook-shortcuts-dialog"
      >
        <DialogTitle className="flex items-center gap-2 text-base font-semibold">
          <Keyboard className="h-5 w-5 text-primary" aria-hidden="true" />
          Flipbook keyboard shortcuts
        </DialogTitle>
        <p id="flipbook-shortcuts-desc" className="sr-only">
          Keyboard shortcuts available in the flipbook reader.
        </p>
        <ul role="list" className="mt-2 space-y-2">
          {SHORTCUTS.map(({ key, description }) => (
            <li key={key} className="flex items-center justify-between gap-4">
              <span className="text-sm text-foreground">{description}</span>
              <kbd
                className="shrink-0 inline-flex items-center justify-center min-w-[2rem] h-7 px-2 rounded border border-border bg-muted text-xs font-mono font-medium text-muted-foreground shadow-sm"
                aria-label={key}
              >
                {key}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
