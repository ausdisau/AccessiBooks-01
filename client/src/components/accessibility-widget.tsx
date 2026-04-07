import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { localStorageService, AccessibilitySettings, ColorVisionMode } from "@/lib/storage";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import {
  Accessibility,
  X,
  RotateCcw,
  Eye,
  Type,
  MousePointer,
  Zap,
  Brain,
  Glasses,
  Sun,
  Moon,
  Contrast,
  Link,
  Focus,
  BookOpen,
  Pause,
  Layers,
  Palette,
  Cloud,
  CloudOff,
  Loader2,
} from "lucide-react";

const CVD_SVG_ID = "a11y-cvd-filters";

const CVD_FILTER_DEFS = `
<defs>
  <filter id="a11y-cvd-protanopia" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feColorMatrix type="matrix" values="0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0"/>
  </filter>
  <filter id="a11y-cvd-deuteranopia" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feColorMatrix type="matrix" values="0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0"/>
  </filter>
  <filter id="a11y-cvd-tritanopia" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feColorMatrix type="matrix" values="0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0"/>
  </filter>
  <filter id="a11y-cvd-achromatopsia" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feColorMatrix type="matrix" values="0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0"/>
  </filter>
</defs>
`;

const COLOR_VISION_OPTIONS: { value: ColorVisionMode; label: string; description: string }[] = [
  { value: "none", label: "None", description: "Normal color vision" },
  { value: "protanopia", label: "Protanopia", description: "Red-blind (most common)" },
  { value: "deuteranopia", label: "Deuteranopia", description: "Green-blind" },
  { value: "tritanopia", label: "Tritanopia", description: "Blue-blind" },
  { value: "achromatopsia", label: "Achromatopsia", description: "Full grayscale" },
];

interface AccessibilityProfile {
  id: string;
  name: string;
  icon: typeof Accessibility;
  description: string;
  settings: Partial<AccessibilitySettings>;
}

const accessibilityProfiles: AccessibilityProfile[] = [
  {
    id: "vision-impaired",
    name: "Vision Impaired",
    icon: Glasses,
    description: "Larger text, high contrast, enhanced focus",
    settings: {
      highContrast: true,
      fontSize: 130,
      lineHeight: 150,
      highlightFocus: true,
      largerCursor: true,
      colorVisionMode: "protanopia" as ColorVisionMode,
    },
  },
  {
    id: "cognitive-friendly",
    name: "ADHD Friendly",
    icon: Brain,
    description: "Reduced distractions, clear focus",
    settings: {
      pauseAnimations: true,
      highlightFocus: true,
      readingGuide: true,
      lineHeight: 130,
      letterSpacing: 2,
    },
  },
  {
    id: "dyslexia-friendly",
    name: "Dyslexia Friendly",
    icon: Type,
    description: "Optimized reading experience",
    settings: {
      dyslexiaFont: true,
      fontSize: 115,
      letterSpacing: 3,
      lineHeight: 160,
      highlightLinks: true,
    },
  },
  {
    id: "seizure-safe",
    name: "Seizure Safe",
    icon: Zap,
    description: "No animations, reduced motion",
    settings: {
      pauseAnimations: true,
      saturation: 80,
    },
  },
  {
    id: "motor-impaired",
    name: "Motor Impaired",
    icon: MousePointer,
    description: "Enhanced navigation aids",
    settings: {
      largerCursor: true,
      highlightFocus: true,
      highlightLinks: true,
    },
  },
];

export function AccessibilityWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState<AccessibilitySettings>(() =>
    localStorageService.getSettings()
  );
  const [readingGuideY, setReadingGuideY] = useState(0);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "saved" | "error">("idle");

  const { user } = useAuth();
  const isLoggedIn = !!user;
  const { toast } = useToast();

  const { data: serverPrefs } = useQuery<{ profile: Partial<AccessibilitySettings> | null }>({
    queryKey: ["/api/a11y/preferences"],
    enabled: isLoggedIn,
    staleTime: Infinity,
  });

  const saveMutation = useMutation({
    mutationFn: async (s: AccessibilitySettings) => {
      await apiRequest("PUT", "/api/a11y/preferences", { profile: s });
    },
    onMutate: () => setSyncStatus("syncing"),
    onSuccess: () => {
      setSyncStatus("saved");
      setTimeout(() => setSyncStatus("idle"), 2500);
    },
    onError: () => setSyncStatus("error"),
  });

  // On first login, restore server settings or offer to migrate local ones
  useEffect(() => {
    if (!isLoggedIn || serverPrefs === undefined) return;

    const defaults = getDefaultSettings();
    const serverProfile = serverPrefs?.profile ?? null;
    const isServerDefault =
      !serverProfile ||
      Object.keys(defaults).every(
        (k) =>
          !(k in serverProfile) ||
          (serverProfile as Record<string, unknown>)[k] === (defaults as Record<string, unknown>)[k]
      );

    if (!isServerDefault && serverProfile) {
      // Restore server settings to this device
      const merged: AccessibilitySettings = { ...defaults, ...serverProfile };
      setSettings(merged);
      localStorageService.saveSettings(merged);
      setSyncStatus("saved");
      return;
    }

    // Server is default — check if local has custom settings
    const localSettings = localStorageService.getSettings();
    const isLocalDefault = Object.keys(defaults).every(
      (k) =>
        (localSettings as Record<string, unknown>)[k] ===
        (defaults as Record<string, unknown>)[k]
    );
    const migrationKey = "a11y-migration-prompted";
    if (!isLocalDefault && !localStorage.getItem(migrationKey)) {
      localStorage.setItem(migrationKey, "true");
      toast({
        title: "Sync accessibility settings?",
        description:
          "You have custom accessibility settings on this device. Save them to your account for cross-device access.",
        action: (
          <ToastAction
            altText="Sync settings to account"
            onClick={() => saveMutation.mutate(localSettings)}
          >
            Sync
          </ToastAction>
        ),
      });
    }
  }, [isLoggedIn, serverPrefs]);

  useEffect(() => {
    if (!document.getElementById(CVD_SVG_ID)) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("id", CVD_SVG_ID);
      svg.setAttribute("aria-hidden", "true");
      svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
      svg.innerHTML = CVD_FILTER_DEFS;
      document.body.appendChild(svg);
    }
    return () => {
      document.getElementById(CVD_SVG_ID)?.remove();
    };
  }, []);

  useEffect(() => {
    applySettings(settings);
  }, [settings]);

  useEffect(() => {
    if (settings.readingGuide) {
      const handleMouseMove = (e: MouseEvent) => {
        setReadingGuideY(e.clientY);
      };
      window.addEventListener("mousemove", handleMouseMove);
      return () => window.removeEventListener("mousemove", handleMouseMove);
    }
  }, [settings.readingGuide]);

  const applySettings = (s: AccessibilitySettings) => {
    const root = document.documentElement;
    root.classList.toggle("high-contrast", s.highContrast);
    root.classList.toggle("dyslexia-font", s.dyslexiaFont);
    root.classList.toggle("dark", s.darkMode);
    // Keep .invert-colors class for child rules (img/video/svg counter-invert)
    root.classList.toggle("invert-colors", s.invertColors);
    root.classList.toggle("highlight-links", s.highlightLinks);
    root.classList.toggle("highlight-focus", s.highlightFocus);
    root.classList.toggle("pause-animations", s.pauseAnimations);
    root.classList.toggle("larger-cursor", s.largerCursor);
    const clampedSize = Math.min(150, Math.max(80, s.fontSize));
    root.style.setProperty("--a11y-font-size", `${clampedSize}%`);
    root.style.setProperty("--a11y-letter-spacing", `${s.letterSpacing * 0.05}em`);
    root.style.setProperty("--a11y-line-height", `${s.lineHeight}%`);
    root.style.setProperty("--a11y-word-spacing", `${(s.wordSpacing || 0) * 0.05}em`);
    // Compose all root-level filters into a single inline style so they never conflict:
    // invert (if on) → saturation → CVD simulation (if active)
    const filters: string[] = [];
    if (s.invertColors) filters.push("invert(1) hue-rotate(180deg)");
    filters.push(`saturate(${s.saturation}%)`);
    const cvdMode = s.colorVisionMode && s.colorVisionMode !== "none" ? s.colorVisionMode : null;
    if (cvdMode) filters.push(`url(#a11y-cvd-${cvdMode})`);
    root.style.filter = filters.join(" ");
  };

  const updateSettings = (partial: Partial<AccessibilitySettings>) => {
    const newSettings = { ...settings, ...partial, activeProfile: null };
    setSettings(newSettings);
    localStorageService.saveSettings(newSettings);
    if (isLoggedIn) saveMutation.mutate(newSettings);
  };

  const applyProfile = (profile: AccessibilityProfile) => {
    const newSettings = {
      ...getDefaultSettings(),
      ...profile.settings,
      activeProfile: profile.id,
    };
    setSettings(newSettings);
    localStorageService.saveSettings(newSettings);
    if (isLoggedIn) saveMutation.mutate(newSettings);
  };

  const getDefaultSettings = (): AccessibilitySettings => ({
    highContrast: false,
    dyslexiaFont: false,
    darkMode: false,
    fontSize: 100,
    letterSpacing: 0,
    lineHeight: 100,
    saturation: 100,
    invertColors: false,
    highlightLinks: false,
    highlightFocus: false,
    readingGuide: false,
    pauseAnimations: false,
    largerCursor: false,
    readingMask: false,
    activeProfile: null,
    wordSpacing: 0,
    colorVisionMode: "none",
  });

  const resetSettings = () => {
    const defaultSettings = getDefaultSettings();
    setSettings(defaultSettings);
    localStorageService.saveSettings(defaultSettings);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{ position: 'fixed', bottom: '16px', left: '16px', zIndex: 50, height: '40px', width: '40px', borderRadius: '50%', fontSize: '16px' }}
        className="shadow-md opacity-70 hover:opacity-100 transition-opacity bg-primary text-primary-foreground flex items-center justify-center border-0 cursor-pointer"
        aria-label="Open accessibility menu"
        aria-expanded={isOpen}
        data-testid="accessibility-widget-toggle"
      >
        <Accessibility style={{ height: '20px', width: '20px' }} />
      </button>

      {isOpen && (
        <Card 
          style={{ position: 'fixed', bottom: '64px', left: '16px', zIndex: 50, width: '360px', maxHeight: '80vh', fontSize: '14px' }}
          className="shadow-2xl border-2"
          role="region"
          aria-labelledby="a11y-panel-title"
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle>
                <h2 id="a11y-panel-title" className="flex items-center gap-2 text-lg font-semibold">
                  <Accessibility className="h-5 w-5" aria-hidden="true" />
                  Accessibility Options
                </h2>
              </CardTitle>
              <div className="flex items-center gap-1.5">
                {isLoggedIn && syncStatus !== "idle" && (
                  <span
                    className="flex items-center gap-1 text-xs text-muted-foreground"
                    aria-live="polite"
                    aria-label={
                      syncStatus === "syncing"
                        ? "Syncing settings"
                        : syncStatus === "saved"
                        ? "Settings saved to account"
                        : "Sync failed"
                    }
                  >
                    {syncStatus === "syncing" && (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    )}
                    {syncStatus === "saved" && (
                      <Cloud className="h-3 w-3 text-green-500" aria-hidden="true" />
                    )}
                    {syncStatus === "error" && (
                      <CloudOff className="h-3 w-3 text-destructive" aria-hidden="true" />
                    )}
                    {syncStatus === "syncing"
                      ? "Syncing"
                      : syncStatus === "saved"
                      ? "Saved"
                      : "Error"}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={resetSettings}
                  aria-label="Reset all settings"
                  title="Reset all settings"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close accessibility menu"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <ScrollArea className="max-h-[calc(80vh-80px)]">
            <CardContent className="space-y-4 pt-2">
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Zap className="h-4 w-4" /> Quick Profiles
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {accessibilityProfiles.map((profile) => (
                    <Button
                      key={profile.id}
                      variant={settings.activeProfile === profile.id ? "default" : "outline"}
                      size="sm"
                      className="h-auto py-2 px-3 flex flex-col items-start text-left"
                      onClick={() => applyProfile(profile)}
                    >
                      <div className="flex items-center gap-1">
                        <profile.icon className="h-3 w-3" />
                        <span className="text-xs font-medium">{profile.name}</span>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Eye className="h-4 w-4" /> Vision
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="dark-mode" className="flex items-center gap-2 text-sm">
                      <Moon className="h-3 w-3" /> Dark Mode
                    </Label>
                    <Switch
                      id="dark-mode"
                      checked={settings.darkMode}
                      onCheckedChange={(checked) => updateSettings({ darkMode: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="high-contrast" className="flex items-center gap-2 text-sm">
                      <Contrast className="h-3 w-3" /> High Contrast
                    </Label>
                    <Switch
                      id="high-contrast"
                      checked={settings.highContrast}
                      onCheckedChange={(checked) => updateSettings({ highContrast: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="invert-colors" className="flex items-center gap-2 text-sm">
                      <Sun className="h-3 w-3" /> Invert Colors
                    </Label>
                    <Switch
                      id="invert-colors"
                      checked={settings.invertColors}
                      onCheckedChange={(checked) => updateSettings({ invertColors: checked })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Saturation: {settings.saturation}%</Label>
                    <Slider
                      value={[settings.saturation]}
                      min={0}
                      max={200}
                      step={10}
                      onValueChange={([value]) => updateSettings({ saturation: value })}
                      aria-label="Adjust color saturation"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="larger-cursor" className="flex items-center gap-2 text-sm">
                      <MousePointer className="h-3 w-3" /> Larger Cursor
                    </Label>
                    <Switch
                      id="larger-cursor"
                      checked={settings.largerCursor}
                      onCheckedChange={(checked) => updateSettings({ largerCursor: checked })}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Palette className="h-4 w-4" /> Color Vision
                </h3>
                <div className="space-y-2">
                  <Label htmlFor="color-vision-mode" className="text-sm text-muted-foreground">
                    Simulate or compensate for color vision deficiency
                  </Label>
                  <Select
                    value={settings.colorVisionMode ?? "none"}
                    onValueChange={(value) =>
                      updateSettings({ colorVisionMode: value as ColorVisionMode })
                    }
                  >
                    <SelectTrigger id="color-vision-mode" className="w-full" aria-label="Select color vision mode">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      {COLOR_VISION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <span className="font-medium">{opt.label}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{opt.description}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Type className="h-4 w-4" /> Reading
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="dyslexia-font" className="flex items-center gap-2 text-sm">
                      <Type className="h-3 w-3" /> Dyslexia Font
                    </Label>
                    <Switch
                      id="dyslexia-font"
                      checked={settings.dyslexiaFont}
                      onCheckedChange={(checked) => updateSettings({ dyslexiaFont: checked })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Font Size: {settings.fontSize}%</Label>
                    <Slider
                      value={[settings.fontSize]}
                      min={80}
                      max={200}
                      step={5}
                      onValueChange={([value]) => updateSettings({ fontSize: value })}
                      aria-label="Adjust font size"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Letter Spacing: {settings.letterSpacing}</Label>
                    <Slider
                      value={[settings.letterSpacing]}
                      min={0}
                      max={10}
                      step={1}
                      onValueChange={([value]) => updateSettings({ letterSpacing: value })}
                      aria-label="Adjust letter spacing"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Line Height: {settings.lineHeight}%</Label>
                    <Slider
                      value={[settings.lineHeight]}
                      min={100}
                      max={200}
                      step={10}
                      onValueChange={([value]) => updateSettings({ lineHeight: value })}
                      aria-label="Adjust line height"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Word Spacing: {settings.wordSpacing || 0}</Label>
                    <Slider
                      value={[settings.wordSpacing || 0]}
                      min={0}
                      max={10}
                      step={1}
                      onValueChange={([value]) => updateSettings({ wordSpacing: value })}
                      aria-label="Adjust word spacing"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Focus className="h-4 w-4" /> Navigation
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="highlight-links" className="flex items-center gap-2 text-sm">
                      <Link className="h-3 w-3" /> Highlight Links
                    </Label>
                    <Switch
                      id="highlight-links"
                      checked={settings.highlightLinks}
                      onCheckedChange={(checked) => updateSettings({ highlightLinks: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="highlight-focus" className="flex items-center gap-2 text-sm">
                      <Focus className="h-3 w-3" /> Enhanced Focus
                    </Label>
                    <Switch
                      id="highlight-focus"
                      checked={settings.highlightFocus}
                      onCheckedChange={(checked) => updateSettings({ highlightFocus: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="reading-guide" className="flex items-center gap-2 text-sm">
                      <BookOpen className="h-3 w-3" /> Reading Guide
                    </Label>
                    <Switch
                      id="reading-guide"
                      checked={settings.readingGuide}
                      onCheckedChange={(checked) => updateSettings({ readingGuide: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="reading-mask" className="flex items-center gap-2 text-sm">
                      <Layers className="h-3 w-3" /> Reading Mask
                    </Label>
                    <Switch
                      id="reading-mask"
                      checked={settings.readingMask}
                      onCheckedChange={(checked) => updateSettings({ readingMask: checked })}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Pause className="h-4 w-4" /> Content
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="pause-animations" className="flex items-center gap-2 text-sm">
                      <Pause className="h-3 w-3" /> Pause Animations
                    </Label>
                    <Switch
                      id="pause-animations"
                      checked={settings.pauseAnimations}
                      onCheckedChange={(checked) => updateSettings({ pauseAnimations: checked })}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </ScrollArea>
        </Card>
      )}

      {settings.readingGuide && (
        <div
          className="fixed left-0 right-0 h-1 bg-primary/50 pointer-events-none z-40"
          style={{ top: readingGuideY }}
          aria-hidden="true"
        />
      )}

      {settings.readingMask && (
        <>
          <div
            className="fixed inset-x-0 top-0 bg-black/70 pointer-events-none z-40"
            style={{ height: Math.max(0, readingGuideY - 60) }}
            aria-hidden="true"
          />
          <div
            className="fixed inset-x-0 bottom-0 bg-black/70 pointer-events-none z-40"
            style={{ top: readingGuideY + 60 }}
            aria-hidden="true"
          />
        </>
      )}
    </>
  );
}
