import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, Sparkles } from "lucide-react";

interface AchievementPopupProps {
  achievement: { name: string; description: string; icon: string; xpReward: number } | null;
  onDismiss: () => void;
}

export function AchievementPopup({ achievement, onDismiss }: AchievementPopupProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (achievement) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(onDismiss, 300);
      }, 6000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [achievement, onDismiss]);

  if (!achievement) return null;

  return (
    <div className={`fixed top-4 right-4 z-[100] transition-all duration-300 ${visible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-full"}`}>
      <Card className="w-80 border-2 border-primary/50 bg-card brand-glow">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="text-4xl">{achievement.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 mb-1">
                <Sparkles className="h-4 w-4 text-yellow-500" />
                <span className="text-xs font-semibold text-yellow-600 dark:text-yellow-400 uppercase tracking-wider">Achievement Unlocked!</span>
              </div>
              <h3 className="font-bold text-sm">{achievement.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{achievement.description}</p>
              <p className="text-xs font-semibold text-primary mt-1">+{achievement.xpReward} XP</p>
            </div>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setVisible(false); setTimeout(onDismiss, 300); }}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
