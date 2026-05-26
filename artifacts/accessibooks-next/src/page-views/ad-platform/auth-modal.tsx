import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "@/lib/wouter-compat";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, X, Zap, Building2, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const registerSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1, "First name required"),
  lastName: z.string().min(1, "Last name required"),
  companyName: z.string().min(1, "Company name required"),
  website: z.string().url("Enter a valid URL (include https://)").optional().or(z.literal("")),
  role: z.enum(["advertiser", "publisher"]),
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

interface Props {
  mode: "login" | "register";
  defaultRole?: "advertiser" | "publisher";
  onClose: () => void;
  onSwitchMode: (m: "login" | "register") => void;
}

export default function AdAuthModal({ mode, defaultRole = "advertiser", onClose, onSwitchMode }: Props) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [selectedRole, setSelectedRole] = useState<"advertiser" | "publisher">(defaultRole);

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const registerForm = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", firstName: "", lastName: "", companyName: "", website: "", role: defaultRole },
  });

  const loginMutation = useMutation({
    mutationFn: (data: LoginForm) => apiRequest("POST", "/api/auth/login", data),
    onSuccess: async (res) => {
      const user = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      onClose();
      if (user.role === "advertiser") navigate("/advertiser");
      else if (user.role === "publisher") navigate("/publisher");
      else if (user.role === "admin") navigate("/admin");
      else navigate("/");
    },
    onError: async (err: unknown) => {
      let msg = "Login failed";
      try { const r = (err as { response?: { json: () => Promise<{ message?: string }> } }).response; if (r) { const j = await r.json(); msg = j?.message || msg; } } catch {}
      toast({ title: "Sign-in failed", description: msg, variant: "destructive" });
    },
  });

  const registerMutation = useMutation({
    mutationFn: (data: RegisterForm) => apiRequest("POST", "/api/auth/register", { ...data, role: selectedRole }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      onClose();
      if (selectedRole === "advertiser") navigate("/advertiser");
      else navigate("/publisher");
    },
    onError: async (err: unknown) => {
      let msg = "Registration failed";
      try { const r = (err as { response?: { json: () => Promise<{ message?: string }> } }).response; if (r) { const j = await r.json(); msg = j?.message || msg; } } catch {}
      toast({ title: "Registration failed", description: msg, variant: "destructive" });
    },
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md bg-[#0d1527] border-white/10 text-white p-0 overflow-hidden">
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
              <Zap className="h-3.5 w-3.5 text-white" />
            </div>
            <DialogTitle className="text-white font-bold">AdBid Platform</DialogTitle>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {mode === "login" ? (
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-1">Welcome back</h2>
            <p className="text-sm text-white/50 mb-6">Sign in to your AdBid account</p>
            <form onSubmit={loginForm.handleSubmit((d) => loginMutation.mutate(d))} className="space-y-4">
              <div>
                <Label className="text-white/70 text-sm">Email</Label>
                <Input
                  {...loginForm.register("email")}
                  type="email"
                  placeholder="you@company.com"
                  className="mt-1.5 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-blue-500"
                />
                {loginForm.formState.errors.email && (
                  <p className="text-red-400 text-xs mt-1">{loginForm.formState.errors.email.message}</p>
                )}
              </div>
              <div>
                <Label className="text-white/70 text-sm">Password</Label>
                <Input
                  {...loginForm.register("password")}
                  type="password"
                  placeholder="••••••••"
                  className="mt-1.5 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-blue-500"
                />
                {loginForm.formState.errors.password && (
                  <p className="text-red-400 text-xs mt-1">{loginForm.formState.errors.password.message}</p>
                )}
              </div>
              <Button type="submit" disabled={loginMutation.isPending} className="w-full bg-blue-600 hover:bg-blue-500 text-white h-10">
                {loginMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
              </Button>
            </form>
            <p className="text-center text-sm text-white/40 mt-5">
              New to AdBid?{" "}
              <button onClick={() => onSwitchMode("register")} className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                Create account
              </button>
            </p>
          </div>
        ) : (
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-1">Create your account</h2>
            <p className="text-sm text-white/50 mb-4">Choose your role to get started</p>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <button
                type="button"
                onClick={() => { setSelectedRole("advertiser"); registerForm.setValue("role", "advertiser"); }}
                className={`p-3 rounded-lg border text-left transition-all ${selectedRole === "advertiser" ? "border-blue-500 bg-blue-600/10" : "border-white/10 bg-white/5 hover:bg-white/8"}`}
              >
                <Building2 className={`h-4 w-4 mb-1.5 ${selectedRole === "advertiser" ? "text-blue-400" : "text-white/40"}`} />
                <div className={`text-sm font-medium ${selectedRole === "advertiser" ? "text-blue-300" : "text-white/70"}`}>Advertiser</div>
                <div className="text-xs text-white/30 mt-0.5">Run ad campaigns</div>
              </button>
              <button
                type="button"
                onClick={() => { setSelectedRole("publisher"); registerForm.setValue("role", "publisher"); }}
                className={`p-3 rounded-lg border text-left transition-all ${selectedRole === "publisher" ? "border-violet-500 bg-violet-600/10" : "border-white/10 bg-white/5 hover:bg-white/8"}`}
              >
                <Globe className={`h-4 w-4 mb-1.5 ${selectedRole === "publisher" ? "text-violet-400" : "text-white/40"}`} />
                <div className={`text-sm font-medium ${selectedRole === "publisher" ? "text-violet-300" : "text-white/70"}`}>Publisher</div>
                <div className="text-xs text-white/30 mt-0.5">Monetise your site</div>
              </button>
            </div>

            <form onSubmit={registerForm.handleSubmit((d) => registerMutation.mutate(d))} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-white/70 text-xs">First Name</Label>
                  <Input {...registerForm.register("firstName")} placeholder="Jane" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-blue-500 h-9 text-sm" />
                  {registerForm.formState.errors.firstName && <p className="text-red-400 text-xs mt-0.5">{registerForm.formState.errors.firstName.message}</p>}
                </div>
                <div>
                  <Label className="text-white/70 text-xs">Last Name</Label>
                  <Input {...registerForm.register("lastName")} placeholder="Doe" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-blue-500 h-9 text-sm" />
                  {registerForm.formState.errors.lastName && <p className="text-red-400 text-xs mt-0.5">{registerForm.formState.errors.lastName.message}</p>}
                </div>
              </div>
              <div>
                <Label className="text-white/70 text-xs">Company Name</Label>
                <Input {...registerForm.register("companyName")} placeholder="Acme Corp" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-blue-500 h-9 text-sm" />
                {registerForm.formState.errors.companyName && <p className="text-red-400 text-xs mt-0.5">{registerForm.formState.errors.companyName.message}</p>}
              </div>
              <div>
                <Label className="text-white/70 text-xs">Email</Label>
                <Input {...registerForm.register("email")} type="email" placeholder="you@company.com" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-blue-500 h-9 text-sm" />
                {registerForm.formState.errors.email && <p className="text-red-400 text-xs mt-0.5">{registerForm.formState.errors.email.message}</p>}
              </div>
              <div>
                <Label className="text-white/70 text-xs">Password</Label>
                <Input {...registerForm.register("password")} type="password" placeholder="8+ characters" className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-blue-500 h-9 text-sm" />
                {registerForm.formState.errors.password && <p className="text-red-400 text-xs mt-0.5">{registerForm.formState.errors.password.message}</p>}
              </div>
              <Button
                type="submit"
                disabled={registerMutation.isPending}
                className={`w-full h-10 text-white ${selectedRole === "advertiser" ? "bg-blue-600 hover:bg-blue-500" : "bg-violet-600 hover:bg-violet-500"}`}
              >
                {registerMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Create ${selectedRole === "advertiser" ? "Advertiser" : "Publisher"} Account`}
              </Button>
            </form>
            <p className="text-center text-sm text-white/40 mt-4">
              Already have an account?{" "}
              <button onClick={() => onSwitchMode("login")} className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                Sign in
              </button>
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
