import './_group.css';
import { useState, useEffect } from 'react';
import { Mic, Eye, Hand, Keyboard, Loader2, Zap, Volume2, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

export function VoiceFirst() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [activeModalities, setActiveModalities] = useState(['voice', 'gaze', 'touch']);
  
  // Simulated voice listening state
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(true);

  // Simulate a transcript updating
  useEffect(() => {
    const timer = setTimeout(() => {
      setTranscript('sign in with...');
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-200/50 p-4 font-sans text-slate-900">
      
      {/* Screen reader skip link */}
      <a href="#email-signin" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-primary text-primary-foreground px-4 py-2 rounded-md z-50">
        Jump to email sign-in
      </a>

      <div className="w-full max-w-[560px] bg-card rounded-2xl shadow-xl border border-border overflow-hidden relative">
        
        {/* Modality Switcher - Unmissable */}
        <div className="bg-slate-100 border-b border-border p-3 flex items-center justify-between">
          <div className="text-sm font-medium text-muted-foreground ml-1">Active Inputs:</div>
          <div className="flex gap-2">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${activeModalities.includes('voice') ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-transparent text-muted-foreground'}`}>
              <Volume2 className="w-4 h-4" /> Voice
            </div>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${activeModalities.includes('gaze') ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-transparent text-muted-foreground'}`}>
              <Eye className="w-4 h-4" /> Gaze
            </div>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${activeModalities.includes('touch') ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-transparent text-muted-foreground'}`}>
              <Hand className="w-4 h-4" /> Touch
            </div>
          </div>
        </div>

        <div className="p-8 sm:p-10">
          <div className="mb-10 text-center space-y-3">
            <h2 className="text-3xl font-bold font-display tracking-tight text-foreground">Welcome Back</h2>
            <p className="text-lg text-muted-foreground">Sign in to continue your listening journey.</p>
          </div>

          <div className="space-y-4 mb-8">
            <Button
              variant="outline"
              className="w-full min-h-[72px] h-auto p-4 flex items-center justify-between border-2 hover:bg-slate-50 transition-colors group relative overflow-hidden"
            >
              <div className="flex items-center gap-4">
                <svg className="h-6 w-6 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span className="text-lg font-semibold text-slate-700 group-hover:text-slate-900">Google</span>
              </div>
              <div className="flex items-center gap-2 bg-slate-100 text-slate-600 px-4 py-2 rounded-lg font-medium shadow-sm border border-slate-200">
                <Mic className="w-4 h-4 text-primary" />
                <span>Say "Google"</span>
              </div>
            </Button>

            <Button
              variant="outline"
              className="w-full min-h-[72px] h-auto p-4 flex items-center justify-between border-2 hover:bg-slate-50 transition-colors group"
            >
              <div className="flex items-center gap-4">
                <svg className="h-6 w-6 shrink-0" viewBox="0 0 24 24" fill="#1877F2">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                <span className="text-lg font-semibold text-slate-700 group-hover:text-slate-900">Facebook</span>
              </div>
              <div className="flex items-center gap-2 bg-slate-100 text-slate-600 px-4 py-2 rounded-lg font-medium shadow-sm border border-slate-200">
                <Mic className="w-4 h-4 text-primary" />
                <span>Say "Facebook"</span>
              </div>
            </Button>

            <Button
              variant="outline"
              className="w-full min-h-[72px] h-auto p-4 flex items-center justify-between border-2 hover:bg-slate-50 transition-colors group"
            >
              <div className="flex items-center gap-4">
                <svg className="h-6 w-6 shrink-0" viewBox="0 0 24 24">
                  <path fill="#F25022" d="M1 1h10v10H1z"/>
                  <path fill="#00A4EF" d="M1 13h10v10H1z"/>
                  <path fill="#7FBA00" d="M13 1h10v10H13z"/>
                  <path fill="#FFB900" d="M13 13h10v10H13z"/>
                </svg>
                <span className="text-lg font-semibold text-slate-700 group-hover:text-slate-900">Microsoft</span>
              </div>
              <div className="flex items-center gap-2 bg-slate-100 text-slate-600 px-4 py-2 rounded-lg font-medium shadow-sm border border-slate-200">
                <Mic className="w-4 h-4 text-primary" />
                <span>Say "Microsoft"</span>
              </div>
            </Button>
          </div>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full border-t-2" />
            </div>
            <div className="relative flex justify-center text-sm font-medium">
              <span className="bg-card px-4 text-muted-foreground">Or</span>
            </div>
          </div>

          <form id="email-signin" className="space-y-6" onSubmit={(e) => e.preventDefault()}>
            <div className="space-y-3">
              <Label htmlFor="email" className="text-lg text-slate-700 font-semibold">Email Address</Label>
              <Input
                id="email" type="email" placeholder="you@example.com" 
                className="h-16 text-lg px-4 border-2 focus-visible:ring-4 focus-visible:ring-primary/20 focus-visible:border-primary"
                value={email} onChange={(e) => setEmail(e.target.value)}
              />
              <div className="flex justify-end">
                <div className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500">
                  <Mic className="w-3.5 h-3.5" /> Say "Focus Email" to type
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-lg text-slate-700 font-semibold">Password</Label>
              </div>
              <div className="relative flex gap-3">
                <Input
                  id="password" type={showPassword ? 'text' : 'password'} placeholder="••••••••"
                  className="h-16 text-lg px-4 border-2 focus-visible:ring-4 focus-visible:ring-primary/20 focus-visible:border-primary flex-1"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                />
                <Button
                  type="button" variant="outline"
                  className="h-16 px-6 border-2 flex flex-col items-center justify-center gap-1 shrink-0 bg-slate-50 hover:bg-slate-100"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <span className="text-sm font-bold text-slate-600">{showPassword ? 'Hide' : 'Show'}</span>
                  <div className="flex items-center gap-1 text-xs text-primary font-medium">
                    <Mic className="w-3 h-3" /> Say "{showPassword ? 'Hide' : 'Show'}"
                  </div>
                </Button>
              </div>
            </div>

            <Button type="submit" className="w-full h-[80px] text-xl font-bold bg-primary text-primary-foreground hover:bg-primary/90 mt-4 shadow-md group relative overflow-hidden">
              <span className="relative z-10 flex items-center gap-3">
                Sign In with Email
                <div className="flex items-center gap-1.5 bg-black/20 text-white px-3 py-1.5 rounded-md text-sm ml-2">
                  <Mic className="w-4 h-4" /> Say "Sign In"
                </div>
              </span>
            </Button>
          </form>

          <div className="mt-8 flex flex-col gap-4">
            <Button variant="outline" className="w-full min-h-[72px] h-auto p-4 flex items-center justify-between border-2 hover:bg-slate-50 transition-colors group">
              <div className="flex items-center gap-3">
                <Zap className="h-6 w-6 text-amber-500" />
                <span className="text-lg font-semibold text-slate-700 group-hover:text-slate-900">Send me a magic link instead</span>
              </div>
              <div className="flex items-center gap-2 bg-slate-100 text-slate-600 px-4 py-2 rounded-lg font-medium shadow-sm border border-slate-200">
                <Mic className="w-4 h-4 text-primary" />
                <span>Say "Magic Link"</span>
              </div>
            </Button>

            <Button variant="outline" className="w-full min-h-[72px] h-auto p-4 flex items-center justify-between border-2 hover:bg-slate-50 transition-colors group">
              <span className="text-lg font-semibold text-slate-700 group-hover:text-slate-900">Need an account? Create one</span>
              <div className="flex items-center gap-2 bg-slate-100 text-slate-600 px-4 py-2 rounded-lg font-medium shadow-sm border border-slate-200">
                <Mic className="w-4 h-4 text-primary" />
                <span>Say "Create Account"</span>
              </div>
            </Button>
          </div>
        </div>

        {/* Persistent Listening State Bar */}
        <div className="bg-slate-900 text-slate-100 p-4 flex items-center gap-4">
          <div className="relative flex items-center justify-center w-12 h-12 rounded-full bg-primary/20 shrink-0">
            <div className="absolute inset-0 bg-primary/30 rounded-full animate-ping"></div>
            <Mic className="w-6 h-6 text-primary-foreground relative z-10" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-slate-400 font-medium mb-0.5">Listening for commands...</div>
            <div className="text-lg font-medium text-white truncate">
              {transcript ? <span className="text-primary-foreground">You said: "{transcript}"</span> : <span className="opacity-50 italic">Say an option to select it</span>}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
