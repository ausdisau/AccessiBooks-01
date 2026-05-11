import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";
import type { KeyboardShortcutHelpProps } from "./flipbook-types";

interface ShortcutGroup {
  label: string;
  shortcuts: { keys: string[]; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: "Reading",
    shortcuts: [
      { keys: ["←"], description: "Previous page" },
      { keys: ["→"], description: "Next page" },
      { keys: ["Page Up"], description: "Previous page" },
      { keys: ["Page Down"], description: "Next page" },
      { keys: ["Home"], description: "First page" },
      { keys: ["End"], description: "Last page" },
    ],
  },
  {
    label: "Read aloud",
    shortcuts: [
      { keys: ["R"], description: "Read aloud the current page or selection" },
      { keys: ["S"], description: "Stop reading aloud" },
    ],
  },
  {
    label: "Panels & search",
    shortcuts: [
      { keys: ["G"], description: "Open or close reader settings" },
      { keys: ["A"], description: "Open or close annotations" },
      { keys: ["/"], description: "Focus the search field" },
      { keys: ["F"], description: "Toggle Focus Mode" },
      { keys: ["?"], description: "Open this keyboard shortcuts help" },
      { keys: ["Esc"], description: "Close the open panel or dialog" },
    ],
  },
];

export function KeyboardShortcutHelp({ open, onOpenChange }: KeyboardShortcutHelpProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg focus:outline-none"
        aria-describedby="flipbook-shortcuts-desc"
        data-testid="flipbook-shortcuts-dialog"
      >
        <DialogTitle className="flex items-center gap-2 text-base font-semibold">
          <Keyboard className="h-5 w-5 text-primary" aria-hidden="true" />
          Flipbook keyboard shortcuts
        </DialogTitle>
        <p id="flipbook-shortcuts-desc" className="sr-only">
          Every keyboard shortcut available in the flipbook reader, grouped by category.
        </p>
        <div className="mt-2 space-y-5 max-h-[60vh] overflow-y-auto pr-1">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.label} aria-labelledby={`fb-sc-${group.label}`}>
              <h3
                id={`fb-sc-${group.label}`}
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2"
              >
                {group.label}
              </h3>
              <ul role="list" className="space-y-2">
                {group.shortcuts.map(({ keys, description }) => (
                  <li
                    key={keys.join("+") + description}
                    className="flex items-center justify-between gap-4"
                  >
                    <span className="text-sm text-foreground">{description}</span>
                    <span className="shrink-0 inline-flex items-center gap-1">
                      {keys.map((k, i) => (
                        <kbd
                          key={i}
                          className="inline-flex items-center justify-center min-w-[2rem] h-7 px-2 rounded border border-border bg-muted text-xs font-mono font-medium text-muted-foreground shadow-sm"
                          aria-label={k}
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground text-center">
          Shortcuts are paused while you are typing in a text field or adjusting a slider.
        </p>
      </DialogContent>
    </Dialog>
  );
}
