import { usePreferencesKernel, DEFAULT_PROFILE } from "@/hooks/use-preferences-kernel";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Eye,
  Type,
  MousePointer,
  Monitor,
  Volume2,
  Palette,
  Check,
  RotateCcw,
  Loader2,
} from "lucide-react";

export function PreferencesKernel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { profile, presets, activePreset, updateProfile, applyPreset, isLoading } =
    usePreferencesKernel();
  const { user } = useAuth();

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-semibold dark:text-white">
              Accessibility Preferences
            </DialogTitle>
            <Badge variant={user ? "default" : "secondary"}>
              {user ? "Synced" : "Local only"}
            </Badge>
          </div>
        </DialogHeader>

        {presets.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground dark:text-gray-400">
              Quick Presets
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {presets.slice(0, 4).map((preset) => (
                <Card
                  key={preset.name}
                  className={`cursor-pointer transition-colors hover:bg-accent dark:hover:bg-gray-800 ${
                    activePreset === preset.name
                      ? "border-primary ring-1 ring-primary"
                      : "border-border dark:border-gray-700"
                  }`}
                  onClick={() => applyPreset(preset.name)}
                >
                  <CardContent className="p-3 flex items-start justify-between">
                    <div>
                      <p className="font-medium text-sm dark:text-white">{preset.name}</p>
                      <p className="text-xs text-muted-foreground dark:text-gray-400 mt-1">
                        {preset.description}
                      </p>
                    </div>
                    {activePreset === preset.name && (
                      <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-6 mt-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium dark:text-white">Visual</h3>
            </div>

            <div className="space-y-4 pl-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="dark:text-gray-300">Font Size</Label>
                  <span className="text-sm text-muted-foreground">{profile.fontSize}px</span>
                </div>
                <Slider
                  value={[profile.fontSize]}
                  min={12}
                  max={32}
                  step={1}
                  onValueChange={([v]) => updateProfile({ fontSize: v })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="dark:text-gray-300">Font Family</Label>
                <Select
                  value={profile.fontFamily}
                  onValueChange={(v) => updateProfile({ fontFamily: v })}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">System</SelectItem>
                    <SelectItem value="serif">Serif</SelectItem>
                    <SelectItem value="sans-serif">Sans-serif</SelectItem>
                    <SelectItem value="monospace">Monospace</SelectItem>
                    <SelectItem value="OpenDyslexic">OpenDyslexic</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <Label className="dark:text-gray-300">High Contrast</Label>
                <Switch
                  checked={profile.highContrast}
                  onCheckedChange={(v) => updateProfile({ highContrast: v })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="dark:text-gray-300">Dark Mode</Label>
                <Switch
                  checked={profile.darkMode}
                  onCheckedChange={(v) => updateProfile({ darkMode: v })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="dark:text-gray-300">Dyslexia Font</Label>
                <Switch
                  checked={profile.dyslexiaFont}
                  onCheckedChange={(v) => updateProfile({ dyslexiaFont: v })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="dark:text-gray-300">Color Scheme</Label>
                <Select
                  value={profile.colorScheme}
                  onValueChange={(v) => updateProfile({ colorScheme: v })}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default</SelectItem>
                    <SelectItem value="sepia">Sepia</SelectItem>
                    <SelectItem value="high-contrast">High Contrast</SelectItem>
                    <SelectItem value="blue-light">Blue Light</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Type className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium dark:text-white">Reading</h3>
            </div>

            <div className="space-y-4 pl-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="dark:text-gray-300">Line Spacing</Label>
                  <span className="text-sm text-muted-foreground">
                    {profile.lineSpacing.toFixed(1)}
                  </span>
                </div>
                <Slider
                  value={[profile.lineSpacing]}
                  min={1.0}
                  max={3.0}
                  step={0.1}
                  onValueChange={([v]) => updateProfile({ lineSpacing: v })}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="dark:text-gray-300">Letter Spacing</Label>
                  <span className="text-sm text-muted-foreground">
                    {profile.letterSpacing.toFixed(1)}px
                  </span>
                </div>
                <Slider
                  value={[profile.letterSpacing]}
                  min={0}
                  max={5}
                  step={0.5}
                  onValueChange={([v]) => updateProfile({ letterSpacing: v })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="dark:text-gray-300">Focus Highlight</Label>
                <Switch
                  checked={profile.focusHighlight}
                  onCheckedChange={(v) => updateProfile({ focusHighlight: v })}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium dark:text-white">Motion & Audio</h3>
            </div>

            <div className="space-y-4 pl-6">
              <div className="flex items-center justify-between">
                <Label className="dark:text-gray-300">Reduced Motion</Label>
                <Switch
                  checked={profile.reducedMotion}
                  onCheckedChange={(v) => updateProfile({ reducedMotion: v })}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="dark:text-gray-300">Playback Speed</Label>
                  <span className="text-sm text-muted-foreground">
                    {profile.playbackSpeed.toFixed(2)}x
                  </span>
                </div>
                <Slider
                  value={[profile.playbackSpeed]}
                  min={0.5}
                  max={3.0}
                  step={0.25}
                  onValueChange={([v]) => updateProfile({ playbackSpeed: v })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="dark:text-gray-300">Captions</Label>
                <Switch
                  checked={profile.captionsOn}
                  onCheckedChange={(v) => updateProfile({ captionsOn: v })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="dark:text-gray-300">Screen Reader Hints</Label>
                <Switch
                  checked={profile.screenReaderHints}
                  onCheckedChange={(v) => updateProfile({ screenReaderHints: v })}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-6 pt-4 border-t dark:border-gray-700">
          <Button
            variant="outline"
            onClick={() => updateProfile(DEFAULT_PROFILE)}
            className="dark:text-gray-300 dark:border-gray-600"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
