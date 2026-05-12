import { useEffect } from "react";
import { Check, Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface WelcomeBonusModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const bonusItems = [
  { label: "250 XP Bonus", emoji: "⚡" },
  { label: "Welcome Badge", emoji: "🏅" },
  { label: "7-Day Premium Trial", emoji: "👑" },
];

export function WelcomeBonusModal({ open, onOpenChange }: WelcomeBonusModalProps) {
  const welcomeBonusMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/user/welcome-bonus");
      return res.json();
    },
  });

  useEffect(() => {
    if (open && !welcomeBonusMutation.data && !welcomeBonusMutation.isPending) {
      welcomeBonusMutation.mutate();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center sm:text-center">
          <div className="mb-2 text-center text-4xl">🎉🎊🥳🎉</div>
          <DialogTitle className="text-xl">Welcome to AccessiBooks!</DialogTitle>
          <DialogDescription className="text-base">
            Here's what you've received as a welcome gift
          </DialogDescription>
        </DialogHeader>

        {welcomeBonusMutation.isPending ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : welcomeBonusMutation.isError ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            Your welcome bonus has already been applied!
          </div>
        ) : (
          <div className="space-y-3 py-4">
            {bonusItems.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <span className="text-2xl">{item.emoji}</span>
                <span className="flex-1 font-medium">{item.label}</span>
                <Check className="h-5 w-5 text-green-500" />
              </div>
            ))}
          </div>
        )}

        <Button
          size="lg"
          className="w-full"
          onClick={() => onOpenChange(false)}
        >
          Start Exploring
        </Button>
      </DialogContent>
    </Dialog>
  );
}
