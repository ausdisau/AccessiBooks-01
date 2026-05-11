import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";
import type { KeyboardShortcutHelpProps } from "./flipbook-types";

interface ShortcutGroup {
  label: string;
  shortcuts: { key: string; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: "Navigation",
    shortcuts: [
      { key: "→", description: "Next page" },
      { key: "←", description: "Previous page" },
      { key: "Page Down", description: "Next page" },
      { key: "Page Up", description: "Previous page" },
      { key: "Home", description: "First page" },
      { key: "End", description: "Last page" },
    ],
  },
  {
    label: "Search & read aloud",
    shortcuts: [
      { key: "Tab", description: "Move focus to the search field" },
      { key: "Enter", description: "Jump to the focused search result" },
      { key: "Esc", description: "Close search results, settings, or dialog" },
    ],
  },
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
        <div className="mt-2 space-y-4">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.label} aria-labelledby={`fb-sc-${group.label}`}>
              <h3
                id={`fb-sc-${group.label}`}
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2"
              >
                {group.label}
              </h3>
              <ul role="list" className="space-y-2">
                {group.shortcuts.map(({ key, description }) => (
                  <li key={key + description} className="flex items-center justify-between gap-4">
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
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
