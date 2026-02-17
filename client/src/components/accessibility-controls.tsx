import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAccessibility } from "@/hooks/use-accessibility";
import { Accessibility, Contrast, Type, Moon, Check } from "lucide-react";

export function AccessibilityControls() {
  const { settings, toggleHighContrast, toggleDyslexiaFont, toggleDarkMode } = useAccessibility();

  const activeCount = [settings.highContrast, settings.dyslexiaFont, settings.darkMode].filter(Boolean).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          aria-label="Accessibility options"
          data-testid="accessibility-menu"
          className="relative"
        >
          <Accessibility className="h-4 w-4 mr-2" aria-hidden="true" />
          Accessibility
          {activeCount > 0 && (
            <span className="ml-2 inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs font-medium">
              {activeCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          onClick={toggleHighContrast}
          data-testid="button-high-contrast"
          className="flex items-center justify-between cursor-pointer"
        >
          <span className="flex items-center">
            <Contrast className="h-4 w-4 mr-2" aria-hidden="true" />
            High Contrast
          </span>
          {settings.highContrast && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={toggleDyslexiaFont}
          data-testid="button-dyslexia-font"
          className="flex items-center justify-between cursor-pointer"
        >
          <span className="flex items-center">
            <Type className="h-4 w-4 mr-2" aria-hidden="true" />
            Dyslexia Font
          </span>
          {settings.dyslexiaFont && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={toggleDarkMode}
          data-testid="button-dark-mode"
          className="flex items-center justify-between cursor-pointer"
        >
          <span className="flex items-center">
            <Moon className="h-4 w-4 mr-2" aria-hidden="true" />
            Dark Mode
          </span>
          {settings.darkMode && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
