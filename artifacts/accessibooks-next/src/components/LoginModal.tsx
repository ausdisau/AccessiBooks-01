import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { SiFacebook } from "react-icons/si";
import { Mail, Lock, Eye, EyeOff, Loader2, Accessibility, Headphones, Zap } from "lucide-react";

interface AuthProviders {
  local: boolean;
  google: boolean;
  facebook: boolean;
  microsoft: boolean;
  auth0: boolean;
}

// Login Modal Component
export function LoginModal({ 
  open, 
  onOpenChange, 
  isRegistering, 
  setIsRegistering 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  isRegistering: boolean;
  setIsRegistering: (val: boolean) => void;
}) {
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
  });
  const [magicLinkMode, setMagicLinkMode] = useState(false);
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicDevLink, setMagicDevLink] = useState<string | null>(null);

  const magicLinkMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest("POST", "/api/auth/magic-link/request", { email });
      return response.json() as Promise<{ message: string; emailSent?: boolean; devLink?: string }>;
    },
    onSuccess: (data) => {
      if (data.emailSent === false && data.devLink) {
        setMagicDevLink(data.devLink);
      }
      setMagicLinkSent(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Could not send magic link",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });
  
  const { data: providers } = useQuery<AuthProviders>({
    queryKey: ["/api/auth/providers"],
    retry: false,
  });
  
  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const response = await apiRequest("POST", "/api/auth/login", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      window.location.reload();
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message || "Invalid email or password",
        variant: "destructive",
      });
    },
  });
  
  const registerMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; firstName: string; lastName: string }) => {
      const response = await apiRequest("POST", "/api/auth/register", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      window.location.reload();
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message || "Could not create account",
        variant: "destructive",
      });
    },
  });
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isRegistering) {
      registerMutation.mutate(formData);
    } else {
      loginMutation.mutate({ email: formData.email, password: formData.password });
    }
  };

  const [showEmailForm, setShowEmailForm] = useState(false);
  const hasSocialProviders =
    providers?.google || providers?.facebook || providers?.microsoft || providers?.auth0;

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) { setShowEmailForm(false); setMagicLinkMode(false); setMagicLinkSent(false); setMagicLinkEmail(""); setMagicDevLink(null); } onOpenChange(val); }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <DialogTitle className="sr-only">
          {isRegistering ? "Create Account" : "Sign In"}
        </DialogTitle>
        <div className="p-6">
          <div className="text-center mb-6">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <Headphones className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-2xl font-bold">
              {magicLinkMode
                ? (magicLinkSent
                    ? (magicDevLink ? "Sign In Link Ready" : "Check Your Inbox")
                    : "Magic Link Sign In")
                : (isRegistering ? "Create Account" : "Welcome Back")}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {magicLinkMode
                ? (magicLinkSent
                    ? (magicDevLink
                        ? "No email service is configured. Use the link below to sign in."
                        : `We sent a sign-in link to ${magicLinkEmail}`)
                    : "Enter your email and we'll send you a sign-in link")
                : (isRegistering ? "Join thousands of audiobook lovers" : "Sign in to continue listening")
              }
            </p>
          </div>
          
          {!magicLinkMode && hasSocialProviders && (
            <div className="space-y-3 mb-4">
              {providers?.google && (
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full h-12 text-base font-medium border-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => window.location.href = "/api/auth/google"}
                  data-testid="button-google-auth"
                >
                  <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </Button>
              )}
              
              {providers?.facebook && (
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full h-12 text-base font-medium border-2 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
                  onClick={() => window.location.href = "/api/auth/facebook"}
                  data-testid="button-facebook-auth"
                >
                  <SiFacebook className="mr-3 h-5 w-5 text-[#1877F2]" />
                  Continue with Facebook
                </Button>
              )}
              
              {providers?.microsoft && (
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full h-12 text-base font-medium border-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => window.location.href = "/api/auth/microsoft"}
                  data-testid="button-microsoft-auth"
                >
                  <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24">
                    <path fill="#F25022" d="M1 1h10v10H1z"/>
                    <path fill="#00A4EF" d="M1 13h10v10H1z"/>
                    <path fill="#7FBA00" d="M13 1h10v10H13z"/>
                    <path fill="#FFB900" d="M13 13h10v10H13z"/>
                  </svg>
                  Continue with Microsoft
                </Button>
              )}

              {providers?.auth0 && (
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full h-12 text-base font-medium border-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => (window.location.href = "/api/auth/auth0")}
                  data-testid="button-auth0-auth"
                >
                  <Lock className="mr-3 h-5 w-5 text-[#EB5424]" />
                  Continue with Auth0
                </Button>
              )}

            </div>
          )}
          
          {/* Magic link mode */}
          {magicLinkMode ? (
            magicLinkSent ? (
              <div className="text-center space-y-4">
                <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${magicDevLink ? "bg-amber-100 dark:bg-amber-900/30" : "bg-green-100 dark:bg-green-900/30"}`}>
                  <Mail className={`h-8 w-8 ${magicDevLink ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"}`} />
                </div>
                {magicDevLink ? (
                  <>
                    <a
                      href={magicDevLink}
                      className="block w-full"
                    >
                      <Button className="w-full" size="lg">
                        <Zap className="mr-2 h-4 w-4" />
                        Click here to sign in
                      </Button>
                    </a>
                    <p className="text-xs text-muted-foreground border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 rounded-md p-2">
                      To send real emails, add a <strong>RESEND_API_KEY</strong> in your secrets. This link is only shown when no email service is configured.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    The link expires in 15 minutes. Check your spam folder if you don't see it.
                  </p>
                )}
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => { setMagicLinkSent(false); setMagicLinkEmail(""); setMagicDevLink(null); }}
                >
                  {magicDevLink ? "Try a different email" : "Send to a different email"}
                </Button>
                <Button
                  variant="link"
                  className="w-full text-muted-foreground"
                  onClick={() => { setMagicLinkMode(false); setMagicLinkSent(false); setMagicLinkEmail(""); setMagicDevLink(null); }}
                >
                  Back to sign in
                </Button>
              </div>
            ) : (
              <>
                <form
                  onSubmit={(e) => { e.preventDefault(); if (magicLinkEmail) magicLinkMutation.mutate(magicLinkEmail); }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="magic-email">Email address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="magic-email"
                        type="email"
                        placeholder="you@example.com"
                        className="pl-10"
                        value={magicLinkEmail}
                        onChange={(e) => setMagicLinkEmail(e.target.value)}
                        required
                        autoFocus
                        data-testid="input-magic-link-email"
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={magicLinkMutation.isPending || !magicLinkEmail}
                    data-testid="button-send-magic-link"
                  >
                    {magicLinkMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="mr-2 h-4 w-4" />
                    )}
                    Send Magic Link
                  </Button>
                </form>
                <div className="text-center mt-3">
                  <Button
                    variant="link"
                    className="text-muted-foreground text-sm"
                    onClick={() => setMagicLinkMode(false)}
                  >
                    Back to sign in
                  </Button>
                </div>
              </>
            )
          ) : (
            <>
              {hasSocialProviders && (
                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <Separator className="w-full" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Or use email
                    </span>
                  </div>
                </div>
              )}

              {!hasSocialProviders || showEmailForm ? (
                <>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {isRegistering && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="firstName">First Name</Label>
                          <Input
                            id="firstName"
                            placeholder="John"
                            value={formData.firstName}
                            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                            data-testid="input-first-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="lastName">Last Name</Label>
                          <Input
                            id="lastName"
                            placeholder="Doe"
                            value={formData.lastName}
                            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                            data-testid="input-last-name"
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="email"
                          type="email"
                          placeholder="you@example.com"
                          className="pl-10"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          required
                          data-testid="input-email"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          className="pl-10 pr-10"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          required
                          data-testid="input-password"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      size="lg"
                      disabled={loginMutation.isPending || registerMutation.isPending}
                      data-testid="button-submit-auth"
                    >
                      {(loginMutation.isPending || registerMutation.isPending) && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {isRegistering ? "Create Account" : "Sign In"}
                    </Button>
                  </form>

                  {!isRegistering && (
                    <Button
                      variant="ghost"
                      className="w-full mt-2 text-muted-foreground hover:text-foreground"
                      onClick={() => { setMagicLinkMode(true); setMagicLinkEmail(formData.email); }}
                      data-testid="button-magic-link"
                    >
                      <Zap className="mr-2 h-4 w-4" />
                      Sign in with a magic link instead
                    </Button>
                  )}

                  <div className="text-center mt-2">
                    <Button
                      variant="link"
                      onClick={() => setIsRegistering(!isRegistering)}
                      data-testid="button-toggle-auth-mode"
                    >
                      {isRegistering
                        ? "Already have an account? Sign in"
                        : "Don't have an account? Create one"
                      }
                    </Button>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    className="w-full text-muted-foreground hover:text-foreground"
                    onClick={() => setShowEmailForm(true)}
                    data-testid="button-show-email-form"
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Sign in with email & password
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full text-muted-foreground hover:text-foreground"
                    onClick={() => setMagicLinkMode(true)}
                    data-testid="button-magic-link"
                  >
                    <Zap className="mr-2 h-4 w-4" />
                    Send me a magic link
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full text-muted-foreground hover:text-foreground"
                    onClick={() => { onOpenChange(false); window.location.href = "/sign-in"; }}
                    data-testid="button-hands-free-signin"
                  >
                    <Accessibility className="mr-2 h-4 w-4" />
                    Use hands-free sign-in (voice & dwell)
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const CATEGORY_ICONS: Record<string, string> = {
  classics: "📚",
  mystery: "🔍",
  sleep: "🌙",
  motivation: "💪",
  adventure: "🗺️",
  romance: "💕",
  scifi: "🚀",
  history: "📜",
};
