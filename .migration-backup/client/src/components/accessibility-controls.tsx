import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAccessibility } from "@/hooks/use-accessibility";
import { isSpeechRecognitionSupported } from "@/hooks/use-voice-control";
import { Accessibility, Contrast, Type, Moon, Check, Settings, Mic, MicOff } from "lucide-react";
import { PreferencesKernel } from "./preferences-kernel";

export function AccessibilityControls() {
  const { settings, toggleHighContrast, toggleDyslexiaFont, toggleDarkMode, toggleVoiceControl } = useAccessibility();
  const [showKernel, setShowKernel] = useState(false);
  const speechSupported = useMemo(() => isSpeechRecognitionSupported(), []);

  const activeCount = [settings.highContrast, settings.dyslexiaFont, settings.darkMode, settings.voiceControlEnabled].filter(Boolean).length;

  return (
    <>
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
        <DropdownMenuContent align="end" className="w-56">
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
          {speechSupported ? (
            <DropdownMenuItem
              onClick={toggleVoiceControl}
              data-testid="button-voice-control"
              className="flex items-center justify-between cursor-pointer"
            >
              <span className="flex items-center">
                {settings.voiceControlEnabled ? (
                  <Mic className="h-4 w-4 mr-2" aria-hidden="true" />
                ) : (
                  <MicOff className="h-4 w-4 mr-2" aria-hidden="true" />
                )}
                Voice Control
              </span>
              {settings.voiceControlEnabled && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              disabled
              data-testid="button-voice-control"
              className="flex items-center opacity-50 cursor-not-allowed"
              title="Voice control requires Chrome or Edge"
            >
              <MicOff className="h-4 w-4 mr-2" aria-hidden="true" />
              <span className="flex flex-col">
                <span>Voice Control</span>
                <span className="text-[10px] text-muted-foreground font-normal">Not supported in this browser</span>
              </span>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setShowKernel(true)}
            data-testid="button-full-settings"
            className="flex items-center cursor-pointer"
          >
            <Settings className="h-4 w-4 mr-2" aria-hidden="true" />
            Full Settings
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PreferencesKernel open={showKernel} onOpenChange={setShowKernel} />
    </>
  );
}
