import { Gift, Bookmark, Trophy, Target, Crown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface SignUpPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action?: string;
  onSignUp: () => void;
  onSignIn: () => void;
}

const benefits = [
  { icon: Bookmark, label: "Save bookmarks & progress" },
  { icon: Target, label: "Get personalized recommendations" },
  { icon: Trophy, label: "Earn XP & achievements" },
  { icon: Crown, label: "Join reading challenges" },
  { icon: Gift, label: "7-day free premium trial" },
];

export function SignUpPrompt({ open, onOpenChange, action, onSignUp, onSignIn }: SignUpPromptProps) {
  const subtitle = action
    ? `Sign up to ${action}`
    : "Sign up to unlock all features";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center sm:text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Gift className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-xl">Create Your Free Account</DialogTitle>
          <DialogDescription className="text-base">{subtitle}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {benefits.map((benefit) => (
            <div key={benefit.label} className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <span className="text-sm">{benefit.label}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Button
            size="lg"
            className="w-full"
            onClick={() => {
              onOpenChange(false);
              onSignUp();
            }}
          >
            Create Free Account
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              onOpenChange(false);
              onSignIn();
            }}
          >
            Already have an account? Sign In
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
