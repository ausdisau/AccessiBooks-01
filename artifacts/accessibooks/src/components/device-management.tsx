import { useDevices, useRemoveDevice } from "@/hooks/use-monetization";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Laptop, Smartphone, Tablet, Monitor, Trash2, Crown, Loader2 } from "lucide-react";

function getDeviceIcon(deviceName: string) {
  const name = deviceName.toLowerCase();
  if (name.includes("iphone") || name.includes("android")) {
    return <Smartphone className="h-5 w-5" />;
  }
  if (name.includes("ipad") || name.includes("tablet")) {
    return <Tablet className="h-5 w-5" />;
  }
  if (name.includes("mac") || name.includes("laptop")) {
    return <Laptop className="h-5 w-5" />;
  }
  return <Monitor className="h-5 w-5" />;
}

function formatLastSeen(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

export function DeviceManagement() {
  const { data, isLoading } = useDevices();
  const removeDevice = useRemoveDevice();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { devices, maxDevices, isPremium } = data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Laptop className="h-5 w-5" />
          Your Devices
        </CardTitle>
        <CardDescription>
          {devices.length} of {maxDevices} device{maxDevices !== 1 ? "s" : ""} registered
          {!isPremium && (
            <span className="text-amber-600 ml-2">
              (Upgrade for up to 5 devices)
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {devices.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No devices registered yet. Start playing an audiobook to register this device.
          </p>
        ) : (
          devices.map((device) => (
            <div
              key={device.deviceId}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                device.isActive 
                  ? "border-green-500 bg-green-50 dark:bg-green-950/20" 
                  : "border-border"
              }`}
            >
              <div className="flex items-center gap-3">
                {getDeviceIcon(device.deviceName)}
                <div>
                  <p className="font-medium">{device.deviceName}</p>
                  <p className="text-xs text-muted-foreground">
                    {device.isActive ? (
                      <span className="text-green-600 font-medium">Currently active</span>
                    ) : (
                      formatLastSeen(device.lastSeen)
                    )}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeDevice.mutate(device.deviceId)}
                disabled={removeDevice.isPending}
                aria-label={`Remove ${device.deviceName}`}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))
        )}

        {!isPremium && (
          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-amber-700 dark:text-amber-300">
                  Want more devices?
                </p>
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  Premium lets you stream on up to 5 devices
                </p>
              </div>
              <Button 
                size="sm"
                variant="outline"
                className="border-amber-500 text-amber-700"
                onClick={() => window.location.href = "/api/subscription/create-checkout"}
              >
                <Crown className="h-4 w-4 mr-1" />
                Upgrade
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
