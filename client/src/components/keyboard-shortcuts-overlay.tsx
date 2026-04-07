import { useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";

interface ShortcutEntry {
  key: string;
  description: string;
}

interface ShortcutGroup {
  label: string;
  shortcuts: ShortcutEntry[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: "Playback",
    shortcuts: [
      { key: "Space", description: "Play / Pause" },
      { key: "M", description: "Mute / Unmute" },
      { key: "[", description: "Decrease playback speed" },
      { key: "]", description: "Increase playback speed" },
    ],
  },
  {
    label: "Navigation",
    shortcuts: [
      { key: "←", description: "Rewind 30 seconds" },
      { key: "→", description: "Fast-forward 30 seconds" },
      { key: "P", description: "Previous chapter" },
      { key: "N", description: "Next chapter" },
    ],
  },
  {
    label: "Accessibility",
    shortcuts: [
      { key: "G", description: "Toggle high contrast" },
      { key: "A", description: "Open accessibility panel" },
      { key: "C", description: "Toggle captions on / off" },
    ],
  },
  {
    label: "Reader",
    shortcuts: [
      { key: "T", description: "Open / close transcript" },
      { key: "B", description: "Add bookmark" },
      { key: "?", description: "Show this shortcuts overlay" },
    ],
  },
];

interface KeyboardShortcutsOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcutsOverlay({ open, onOpenChange }: KeyboardShortcutsOverlayProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg focus:outline-none"
        aria-describedby="shortcuts-description"
      >
        <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
          <Keyboard className="h-5 w-5 text-primary" aria-hidden="true" />
          Keyboard Shortcuts
        </DialogTitle>
        <p id="shortcuts-description" className="sr-only">
          List of all available keyboard shortcuts grouped by category.
        </p>

        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.label} aria-labelledby={`shortcut-group-${group.label}`}>
              <h3
                id={`shortcut-group-${group.label}`}
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3"
              >
                {group.label}
              </h3>
              <ul className="space-y-2" role="list">
                {group.shortcuts.map(({ key, description }) => (
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
            </section>
          ))}
        </div>

        <p className="mt-4 text-xs text-muted-foreground text-center">
          Shortcuts are disabled when typing in a text field.
        </p>
      </DialogContent>
    </Dialog>
  );
}
