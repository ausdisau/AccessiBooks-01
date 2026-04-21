import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Mic,
  MicOff,
  Eye as EyeIcon,
  EyeOff,
  MousePointer2,
  Keyboard as KeyboardIcon,
  Mail,
  Zap,
  UserPlus,
  ArrowDown,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type AuthProviders = {
  google?: boolean;
  facebook?: boolean;
  microsoft?: boolean;
  auth0?: boolean;
  magicLink?: boolean;
};

type TileId =
  | "google"
  | "microsoft"
  | "facebook"
  | "magiclink"
  | "email"
  | "create";

const DWELL_MS_DEFAULT = 1600;

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getSpeechRecognition(): any {
  if (typeof window === "undefined") return null;
  return (
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition ||
    null
  );
}

export default function HandsFreeSignIn() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const reducedMotion = useMemo(prefersReducedMotion, []);
  const SR = useMemo(getSpeechRecognition, []);
  const voiceSupported = !!SR;

  const { data: providers } = useQuery<AuthProviders>({
    queryKey: ["/api/auth/providers"],
    retry: false,
  });

  // Modality state ----------------------------------------------------------
  const [voiceOn, setVoiceOn] = useState(false);
  const [keyboardActive, setKeyboardActive] = useState(false);
  const [dwellOn, setDwellOn] = useState(!reducedMotion);
  const [dwellMs] = useState(DWELL_MS_DEFAULT);

  useEffect(() => {
    const onKey = () => setKeyboardActive(true);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Tile / dwell state ------------------------------------------------------
  const [activeTile, setActiveTile] = useState<TileId | null>("google");
  const [expandedTile, setExpandedTile] = useState<TileId | null>(null);
  const [dwellProgress, setDwellProgress] = useState(0);
  const dwellStartRef = useRef<number | null>(null);
  const dwellRafRef = useRef<number | null>(null);

  // Form state --------------------------------------------------------------
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [magicEmail, setMagicEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [magicDevLink, setMagicDevLink] = useState<string | null>(null);

  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const magicInputRef = useRef<HTMLInputElement>(null);

  // Voice transcript --------------------------------------------------------
  const [transcript, setTranscript] = useState<string>("");
  const recognitionRef = useRef<any>(null);

  // Sign-in actions ---------------------------------------------------------
  const goExternal = useCallback((url: string) => {
    window.location.href = url;
  }, []);

  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const r = await apiRequest("POST", "/api/auth/login", data);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      window.location.href = "/";
    },
    onError: (err: Error) =>
      toast({
        title: "Sign-in failed",
        description: err.message || "Invalid email or password",
        variant: "destructive",
      }),
  });

  const registerMutation = useMutation({
    mutationFn: async (data: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
    }) => {
      const r = await apiRequest("POST", "/api/auth/register", data);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      window.location.href = "/";
    },
    onError: (err: Error) =>
      toast({
        title: "Could not create account",
        description: err.message || "Please try again",
        variant: "destructive",
      }),
  });

  const magicMutation = useMutation({
    mutationFn: async (em: string) => {
      const r = await apiRequest("POST", "/api/auth/magic-link/request", {
        email: em,
      });
      return r.json() as Promise<{
        message: string;
        emailSent?: boolean;
        devLink?: string;
      }>;
    },
    onSuccess: (data) => {
      setMagicSent(true);
      setMagicDevLink(data.devLink ?? null);
    },
    onError: (err: Error) =>
      toast({
        title: "Could not send sign-in link",
        description: err.message || "Please try again",
        variant: "destructive",
      }),
  });

  const submitExpanded = useCallback(() => {
    if (expandedTile === "email") {
      if (!email || !password) {
        toast({
          title: "Missing details",
          description: "Enter your email and password to continue.",
        });
        return;
      }
      loginMutation.mutate({ email, password });
    } else if (expandedTile === "magiclink") {
      if (!magicEmail) {
        toast({
          title: "Missing email",
          description: "Enter the email address for your sign-in link.",
        });
        return;
      }
      magicMutation.mutate(magicEmail);
    } else if (expandedTile === "create") {
      if (!email || !password) {
        toast({
          title: "Missing details",
          description: "Enter your email and a password to create an account.",
        });
        return;
      }
      registerMutation.mutate({
        email,
        password,
        firstName: firstName || "",
        lastName: lastName || "",
      });
    }
  }, [
    expandedTile,
    email,
    password,
    firstName,
    lastName,
    magicEmail,
    loginMutation,
    registerMutation,
    magicMutation,
    toast,
  ]);

  // Dwell-to-select ---------------------------------------------------------
  // When a non-expandable tile is "active" (hover/focus/voice) for `dwellMs`,
  // trigger its action automatically. Expandable tiles open their panel
  // instead. Skipped entirely if dwell is disabled.
  const triggerTile = useCallback(
    (id: TileId) => {
      switch (id) {
        case "google":
          if (providers?.google) goExternal("/api/auth/google");
          else
            toast({
              title: "Google sign-in unavailable",
              description: "This provider isn't configured on the server.",
            });
          break;
        case "microsoft":
          if (providers?.microsoft) goExternal("/api/auth/microsoft");
          else
            toast({
              title: "Microsoft sign-in unavailable",
              description: "This provider isn't configured on the server.",
            });
          break;
        case "facebook":
          if (providers?.facebook) goExternal("/api/auth/facebook");
          else
            toast({
              title: "Facebook sign-in unavailable",
              description: "This provider isn't configured on the server.",
            });
          break;
        case "magiclink":
        case "email":
        case "create":
          setExpandedTile((cur) => (cur === id ? cur : id));
          break;
      }
    },
    [providers, goExternal, toast],
  );

  useEffect(() => {
    // cancel any in-flight dwell
    if (dwellRafRef.current) cancelAnimationFrame(dwellRafRef.current);
    dwellStartRef.current = null;
    setDwellProgress(0);

    if (!dwellOn || !activeTile) return;
    // Don't auto-trigger expandable tiles that are already open
    if (
      (activeTile === "email" ||
        activeTile === "magiclink" ||
        activeTile === "create") &&
      expandedTile === activeTile
    ) {
      return;
    }

    const start = performance.now();
    dwellStartRef.current = start;

    const tick = (now: number) => {
      if (dwellStartRef.current !== start) return; // superseded
      const pct = Math.min(100, ((now - start) / dwellMs) * 100);
      setDwellProgress(pct);
      if (pct >= 100) {
        dwellStartRef.current = null;
        setDwellProgress(0);
        triggerTile(activeTile);
      } else {
        dwellRafRef.current = requestAnimationFrame(tick);
      }
    };
    dwellRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (dwellRafRef.current) cancelAnimationFrame(dwellRafRef.current);
    };
  }, [activeTile, expandedTile, dwellOn, dwellMs, triggerTile]);

  // Voice control -----------------------------------------------------------
  // Map a normalised transcript fragment to an action.
  const handlePhrase = useCallback(
    (raw: string) => {
      const text = raw.toLowerCase().trim();
      if (!text) return;

      // Tile selection / activation
      if (text.includes("google")) {
        setActiveTile("google");
        triggerTile("google");
        return;
      }
      if (text.includes("microsoft")) {
        setActiveTile("microsoft");
        triggerTile("microsoft");
        return;
      }
      if (text.includes("facebook")) {
        setActiveTile("facebook");
        triggerTile("facebook");
        return;
      }
      if (text.includes("magic")) {
        setActiveTile("magiclink");
        setExpandedTile("magiclink");
        setTimeout(() => magicInputRef.current?.focus(), 50);
        return;
      }
      if (
        text.includes("create account") ||
        text.includes("sign up") ||
        text.includes("register")
      ) {
        setActiveTile("create");
        setExpandedTile("create");
        return;
      }
      if (text.includes("email")) {
        if (text.includes("focus")) {
          setExpandedTile("email");
          setTimeout(() => emailInputRef.current?.focus(), 50);
          return;
        }
        setActiveTile("email");
        setExpandedTile("email");
        return;
      }
      if (text.includes("focus password")) {
        setExpandedTile((c) => c ?? "email");
        setTimeout(() => passwordInputRef.current?.focus(), 50);
        return;
      }
      if (text.includes("show")) {
        setShowPassword(true);
        return;
      }
      if (text.includes("hide")) {
        setShowPassword(false);
        return;
      }
      if (text.includes("send")) {
        if (expandedTile === "magiclink" && magicEmail) {
          magicMutation.mutate(magicEmail);
        }
        return;
      }
      if (text.includes("submit") || text.includes("sign in")) {
        submitExpanded();
        return;
      }
      if (text.includes("stop listening") || text.includes("mute")) {
        setVoiceOn(false);
        return;
      }
      if (text.includes("back") || text.includes("collapse")) {
        setExpandedTile(null);
        return;
      }
    },
    [triggerTile, expandedTile, magicEmail, magicMutation, submitExpanded],
  );

  useEffect(() => {
    if (!voiceOn || !SR) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          /* noop */
        }
        recognitionRef.current = null;
      }
      setTranscript("");
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang =
      (typeof navigator !== "undefined" && navigator.language) || "en-US";

    rec.onresult = (event: any) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      const display = (finalText || interim).trim();
      if (display) setTranscript(display);
      if (finalText) handlePhrase(finalText);
    };
    rec.onerror = (e: any) => {
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
        setVoiceOn(false);
        toast({
          title: "Microphone blocked",
          description:
            "Allow microphone access in your browser to use voice sign-in.",
          variant: "destructive",
        });
      }
    };
    rec.onend = () => {
      // Auto-restart while the user still wants voice on
      if (recognitionRef.current === rec && voiceOn) {
        try {
          rec.start();
        } catch {
          /* noop */
        }
      }
    };

    try {
      rec.start();
      recognitionRef.current = rec;
    } catch {
      /* already started */
    }

    return () => {
      recognitionRef.current = null;
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    };
  }, [voiceOn, SR, handlePhrase, toast]);

  // ------------------------------------------------------------------------
  const modes = [
    {
      id: "eye" as const,
      name: "Eye Gaze (Dwell)",
      icon: EyeIcon,
      active: dwellOn,
      onToggle: () => setDwellOn((v) => !v),
      hint: dwellOn ? "On" : "Off",
    },
    {
      id: "voice" as const,
      name: "Voice",
      icon: voiceOn ? Mic : MicOff,
      active: voiceOn,
      onToggle: () => {
        if (!voiceSupported) {
          toast({
            title: "Voice not supported",
            description:
              "Your browser doesn't expose the Speech Recognition API. Try Chrome or Edge.",
          });
          return;
        }
        setVoiceOn((v) => !v);
      },
      hint: voiceSupported ? (voiceOn ? "On" : "Off") : "Unavailable",
    },
    {
      id: "touch" as const,
      name: "Touch / Mouse",
      icon: MousePointer2,
      active: true,
      onToggle: undefined,
      hint: "Always on",
    },
    {
      id: "keyboard" as const,
      name: "Keyboard",
      icon: KeyboardIcon,
      active: keyboardActive,
      onToggle: undefined,
      hint: keyboardActive ? "Detected" : "Press a key",
    },
  ];

  const tiles: Array<{
    id: TileId;
    label: string;
    phrase: string;
    icon: React.ReactNode;
    enabled: boolean;
    isExpandable?: boolean;
    fullWidth?: boolean;
  }> = [
    {
      id: "google",
      label: "Continue with Google",
      phrase: 'Say "Google"',
      enabled: !!providers?.google,
      icon: (
        <svg className="h-8 w-8" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
      ),
    },
    {
      id: "microsoft",
      label: "Continue with Microsoft",
      phrase: 'Say "Microsoft"',
      enabled: !!providers?.microsoft,
      icon: (
        <svg className="h-8 w-8" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#F25022" d="M1 1h10v10H1z" />
          <path fill="#00A4EF" d="M1 13h10v10H1z" />
          <path fill="#7FBA00" d="M13 1h10v10H13z" />
          <path fill="#FFB900" d="M13 13h10v10H13z" />
        </svg>
      ),
    },
    {
      id: "facebook",
      label: "Continue with Facebook",
      phrase: 'Say "Facebook"',
      enabled: !!providers?.facebook,
      icon: (
        <svg
          className="h-8 w-8"
          viewBox="0 0 24 24"
          fill="#1877F2"
          aria-hidden="true"
        >
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      ),
    },
    {
      id: "magiclink",
      label: "Send me a sign-in link",
      phrase: 'Say "Magic Link"',
      enabled: providers?.magicLink !== false,
      isExpandable: true,
      icon: <Zap className="w-8 h-8 text-amber-500" aria-hidden="true" />,
    },
    {
      id: "email",
      label: "Sign in with email",
      phrase: 'Say "Email"',
      enabled: true,
      isExpandable: true,
      fullWidth: true,
      icon: <Mail className="w-8 h-8 text-blue-600" aria-hidden="true" />,
    },
    {
      id: "create",
      label: "Create a new account",
      phrase: 'Say "Create Account"',
      enabled: true,
      isExpandable: true,
      fullWidth: true,
      icon: (
        <UserPlus className="w-8 h-8 text-emerald-600" aria-hidden="true" />
      ),
    },
  ];

  return (
    <div
      className="min-h-screen bg-slate-50 p-4 sm:p-6 md:p-8 font-sans text-slate-900"
      data-testid="hands-free-sign-in"
    >
      <a
        href="#email-login"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-blue-600 text-white px-4 py-2 rounded-md z-50"
      >
        Jump to email sign-in
      </a>

      <div className="mx-auto w-full max-w-4xl flex flex-col gap-6">
        {/* Top bar — modality switcher + live transcript */}
        <div
          className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-200"
          aria-label="Active input methods"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="mr-1 -ml-2 text-slate-600 hover:text-slate-900"
              onClick={() => navigate("/")}
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <span className="text-sm font-medium text-slate-500 mr-2 uppercase tracking-wider">
              Active Inputs
            </span>
            {modes.map((mode) => {
              const Icon = mode.icon;
              const isInteractive = !!mode.onToggle;
              const Cmp: any = isInteractive ? "button" : "div";
              return (
                <Cmp
                  key={mode.id}
                  type={isInteractive ? "button" : undefined}
                  onClick={mode.onToggle}
                  aria-pressed={isInteractive ? mode.active : undefined}
                  title={mode.hint}
                  data-testid={`mode-${mode.id}`}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    mode.active
                      ? "bg-blue-100 text-blue-700 border border-blue-200"
                      : "bg-slate-100 text-slate-500 border border-slate-200"
                  } ${isInteractive ? "hover:bg-blue-200/60 cursor-pointer" : ""}`}
                >
                  <Icon className="w-4 h-4" />
                  {mode.name}
                </Cmp>
              );
            })}
          </div>

          <div
            className="flex items-center gap-3 bg-slate-900 text-slate-50 px-4 py-2.5 rounded-xl max-w-sm w-full md:w-auto shadow-inner"
            role="status"
            aria-live="polite"
            data-testid="voice-status"
          >
            <div className="relative flex h-3 w-3">
              {voiceOn && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              )}
              <span
                className={`relative inline-flex rounded-full h-3 w-3 ${
                  voiceOn ? "bg-green-500" : "bg-slate-500"
                }`}
              ></span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-400 font-medium">
                {voiceOn ? "Listening…" : voiceSupported ? "Voice off" : "Voice unavailable"}
              </p>
              <p className="text-sm font-medium truncate">
                {voiceOn
                  ? transcript || "Try saying \"Google\""
                  : voiceSupported
                    ? 'Tap "Voice" to enable'
                    : "Use Chrome/Edge for voice"}
              </p>
            </div>
            {voiceOn ? (
              <Mic className="w-4 h-4 text-green-400" />
            ) : (
              <MicOff className="w-4 h-4 text-slate-400" />
            )}
          </div>
        </div>

        {/* Dwell preference */}
        <div className="flex items-center justify-between bg-white px-4 py-3 rounded-xl border border-slate-200">
          <div>
            <p className="text-sm font-medium text-slate-900">
              Dwell-to-select
            </p>
            <p className="text-xs text-slate-500">
              Hover or focus an option for {Math.round(dwellMs / 100) / 10}s to
              select it automatically.
            </p>
          </div>
          <Switch
            checked={dwellOn}
            onCheckedChange={setDwellOn}
            data-testid="switch-dwell"
            aria-label="Toggle dwell-to-select"
          />
        </div>

        {/* Main card */}
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200">
          <div className="p-6 md:p-10">
            <div className="mb-8">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 mb-3">
                Welcome back to AccessiBooks
              </h1>
              <p className="text-base md:text-lg text-slate-600">
                Choose how you'd like to sign in. Rest your gaze on an option to
                select it, or just say the phrase.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              {tiles.map((tile) => (
                <Tile
                  key={tile.id}
                  id={tile.id}
                  label={tile.label}
                  phrase={tile.phrase}
                  icon={tile.icon}
                  enabled={tile.enabled}
                  active={activeTile === tile.id}
                  isExpandable={tile.isExpandable}
                  isExpanded={expandedTile === tile.id}
                  fullWidth={tile.fullWidth}
                  dwellProgress={
                    activeTile === tile.id && dwellOn ? dwellProgress : 0
                  }
                  onActivate={() => setActiveTile(tile.id)}
                  onSelect={() => {
                    setActiveTile(tile.id);
                    if (tile.isExpandable) {
                      setExpandedTile((c) =>
                        c === tile.id ? null : tile.id,
                      );
                    } else {
                      triggerTile(tile.id);
                    }
                  }}
                >
                  {tile.id === "magiclink" && (
                    <MagicLinkPanel
                      email={magicEmail}
                      setEmail={setMagicEmail}
                      onSubmit={() =>
                        magicEmail && magicMutation.mutate(magicEmail)
                      }
                      pending={magicMutation.isPending}
                      sent={magicSent}
                      devLink={magicDevLink}
                      inputRef={magicInputRef}
                    />
                  )}
                  {tile.id === "email" && (
                    <EmailPanel
                      email={email}
                      setEmail={setEmail}
                      password={password}
                      setPassword={setPassword}
                      showPassword={showPassword}
                      setShowPassword={setShowPassword}
                      pending={loginMutation.isPending}
                      onSubmit={() =>
                        loginMutation.mutate({ email, password })
                      }
                      emailRef={emailInputRef}
                      passwordRef={passwordInputRef}
                    />
                  )}
                  {tile.id === "create" && (
                    <CreatePanel
                      email={email}
                      setEmail={setEmail}
                      password={password}
                      setPassword={setPassword}
                      firstName={firstName}
                      setFirstName={setFirstName}
                      lastName={lastName}
                      setLastName={setLastName}
                      pending={registerMutation.isPending}
                      onSubmit={() =>
                        registerMutation.mutate({
                          email,
                          password,
                          firstName,
                          lastName,
                        })
                      }
                    />
                  )}
                </Tile>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ----- Tile --------------------------------------------------------------
interface TileProps {
  id: TileId;
  label: string;
  phrase: string;
  icon: React.ReactNode;
  enabled: boolean;
  active: boolean;
  isExpandable?: boolean;
  isExpanded?: boolean;
  fullWidth?: boolean;
  dwellProgress: number;
  onActivate: () => void;
  onSelect: () => void;
  children?: React.ReactNode;
}

function Tile({
  id,
  label,
  phrase,
  icon,
  enabled,
  active,
  isExpandable,
  isExpanded,
  fullWidth,
  dwellProgress,
  onActivate,
  onSelect,
  children,
}: TileProps) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (dwellProgress / 100) * circumference;

  return (
    <div
      data-testid={`tile-${id}`}
      onMouseEnter={onActivate}
      onFocus={onActivate}
      onClick={enabled ? onSelect : undefined}
      onKeyDown={(e) => {
        if (!enabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={enabled ? 0 : -1}
      aria-disabled={!enabled}
      aria-expanded={isExpandable ? isExpanded : undefined}
      aria-label={label}
      className={`
        relative rounded-3xl border-2 transition-all duration-300 overflow-hidden
        ${enabled ? "cursor-pointer" : "cursor-not-allowed opacity-60"}
        ${
          active
            ? "ring-blue-500 border-blue-500 bg-blue-50/30 ring-4 ring-offset-2"
            : "border-slate-200 bg-white hover:border-slate-300"
        }
        ${fullWidth ? "md:col-span-2" : ""}
        focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-200
      `}
    >
      <div
        className={`p-5 md:p-6 flex flex-col h-full ${isExpanded ? "pb-0 md:pb-0" : ""}`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-5">
            <div className="relative flex items-center justify-center w-20 h-20 shrink-0">
              <svg
                className="absolute inset-0 w-full h-full -rotate-90"
                viewBox="0 0 100 100"
                aria-hidden="true"
              >
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="currentColor"
                  strokeWidth="6"
                  fill="transparent"
                  className="text-slate-100"
                />
                {active && dwellProgress > 0 && (
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke="currentColor"
                    strokeWidth="6"
                    fill="transparent"
                    className="text-blue-500"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                  />
                )}
              </svg>
              <div className="relative z-10 p-3 bg-white rounded-full shadow-sm">
                {icon}
              </div>
            </div>

            <div className="flex flex-col">
              <h2 className="text-lg md:text-xl font-semibold text-slate-900">
                {label}
              </h2>
              {!enabled && (
                <span className="text-xs text-slate-500 mt-1">
                  Not configured on this server
                </span>
              )}
              {isExpandable && enabled && (
                <span className="text-slate-500 text-sm flex items-center gap-1 mt-1">
                  {isExpanded ? "Collapse" : "Expand"}
                  <ArrowDown
                    className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  />
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-auto">
          <div className="inline-flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg text-slate-700 font-medium">
            <Mic className="w-4 h-4 text-slate-500" />
            <span className="text-sm">{phrase}</span>
          </div>
        </div>

        {isExpanded && children && (
          <div
            className="mt-4 pb-6"
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={(e) => e.stopPropagation()}
          >
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

// ----- Expandable panels -------------------------------------------------

function MagicLinkPanel({
  email,
  setEmail,
  onSubmit,
  pending,
  sent,
  devLink,
  inputRef,
}: {
  email: string;
  setEmail: (v: string) => void;
  onSubmit: () => void;
  pending: boolean;
  sent: boolean;
  devLink: string | null;
  inputRef: React.Ref<HTMLInputElement>;
}) {
  return (
    <div className="pt-4 border-t border-slate-200">
      {sent ? (
        <div className="space-y-3">
          <p className="text-base text-slate-700">
            {devLink
              ? "No email service is configured — use this link:"
              : `We sent a sign-in link to ${email}.`}
          </p>
          {devLink && (
            <a
              href={devLink}
              className="block text-sm text-blue-600 underline break-all"
              data-testid="magic-dev-link"
            >
              {devLink}
            </a>
          )}
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <Label htmlFor={`magic-email`} className="text-base font-medium">
            Your email address
          </Label>
          <Input
            ref={inputRef}
            id="magic-email"
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 text-base px-4 rounded-xl border-2 border-slate-300"
            data-testid="input-magic-email"
            autoComplete="email"
          />
          <Button
            type="submit"
            disabled={pending || !email}
            className="w-full h-12 text-base rounded-xl bg-slate-900 text-white hover:bg-slate-800"
            data-testid="button-send-magic-link"
          >
            {pending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Send link
                <span className="ml-3 px-2 py-0.5 bg-slate-800 rounded-md text-xs text-slate-300 font-mono">
                  Say "Send"
                </span>
              </>
            )}
          </Button>
        </form>
      )}
    </div>
  );
}

function EmailPanel({
  email,
  setEmail,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  pending,
  onSubmit,
  emailRef,
  passwordRef,
}: {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  pending: boolean;
  onSubmit: () => void;
  emailRef: React.Ref<HTMLInputElement>;
  passwordRef: React.Ref<HTMLInputElement>;
}) {
  return (
    <div className="pt-4 border-t border-slate-200" id="email-login">
      <form
        className="space-y-5 max-w-xl mx-auto"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="space-y-2">
          <Label
            htmlFor="email-input"
            className="text-base font-medium flex items-center justify-between"
          >
            Email address
            <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
              Say "Focus Email"
            </span>
          </Label>
          <Input
            ref={emailRef}
            id="email-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 text-base px-4 rounded-xl border-2 border-slate-300"
            data-testid="input-email"
            autoComplete="email"
          />
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="password-input"
            className="text-base font-medium flex items-center justify-between"
          >
            Password
            <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
              Say "Focus Password"
            </span>
          </Label>
          <div className="flex gap-3">
            <Input
              ref={passwordRef}
              id="password-input"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 text-base px-4 rounded-xl border-2 border-slate-300 flex-1"
              data-testid="input-password"
              autoComplete="current-password"
            />
            <Button
              type="button"
              variant="outline"
              className="h-12 px-4 rounded-xl border-2 border-slate-300"
              onClick={() => setShowPassword(!showPassword)}
              data-testid="button-toggle-password"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="w-5 h-5" />
              ) : (
                <EyeIcon className="w-5 h-5" />
              )}
            </Button>
          </div>
        </div>

        <Button
          type="submit"
          disabled={pending}
          className="w-full h-12 text-base rounded-xl bg-slate-900 text-white hover:bg-slate-800 mt-6"
          data-testid="button-sign-in"
        >
          {pending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              Sign in
              <span className="ml-3 px-2 py-0.5 bg-slate-800 rounded-md text-xs text-slate-300 font-mono">
                Say "Submit"
              </span>
            </>
          )}
        </Button>
      </form>
    </div>
  );
}

function CreatePanel({
  email,
  setEmail,
  password,
  setPassword,
  firstName,
  setFirstName,
  lastName,
  setLastName,
  pending,
  onSubmit,
}: {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  firstName: string;
  setFirstName: (v: string) => void;
  lastName: string;
  setLastName: (v: string) => void;
  pending: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="pt-4 border-t border-slate-200">
      <form
        className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl mx-auto"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="first-name">First name</Label>
          <Input
            id="first-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="h-12 text-base px-4 rounded-xl border-2 border-slate-300"
            autoComplete="given-name"
            data-testid="input-first-name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="last-name">Last name</Label>
          <Input
            id="last-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="h-12 text-base px-4 rounded-xl border-2 border-slate-300"
            autoComplete="family-name"
            data-testid="input-last-name"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="create-email">Email address</Label>
          <Input
            id="create-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 text-base px-4 rounded-xl border-2 border-slate-300"
            autoComplete="email"
            data-testid="input-create-email"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="create-password">Password</Label>
          <Input
            id="create-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 text-base px-4 rounded-xl border-2 border-slate-300"
            autoComplete="new-password"
            data-testid="input-create-password"
          />
        </div>
        <Button
          type="submit"
          disabled={pending || !email || !password}
          className="md:col-span-2 w-full h-12 text-base rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
          data-testid="button-create-account"
        >
          {pending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            "Create account"
          )}
        </Button>
      </form>
    </div>
  );
}
