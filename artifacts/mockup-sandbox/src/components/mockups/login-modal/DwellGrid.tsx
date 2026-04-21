import './_group.css';
import { useState, useEffect } from 'react';
import { 
  Mic, 
  Eye as EyeIcon, 
  MousePointer2, 
  Keyboard, 
  Mail, 
  Zap, 
  UserPlus, 
  Headphones, 
  ArrowDown, 
  Loader2, 
  Lock, 
  EyeOff, 
  Play
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function DwellGrid() {
  const [activeTile, setActiveTile] = useState<string | null>('google');
  const [expandedTile, setExpandedTile] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Modality states
  const modes = [
    { id: 'eye', name: 'Eye Gaze', icon: EyeIcon, active: true },
    { id: 'voice', name: 'Voice', icon: Mic, active: true },
    { id: 'touch', name: 'Touch/Mouse', icon: MousePointer2, active: true },
    { id: 'keyboard', name: 'Keyboard', icon: Keyboard, active: false }
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans text-slate-900">
      {/* Skip to content for screen readers */}
      <a href="#email-login" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-primary text-primary-foreground px-4 py-2 rounded-md z-50">
        Jump to email sign-in
      </a>

      <div className="w-full max-w-4xl flex flex-col gap-6">
        
        {/* Top Bar: Modality Switcher & Transcript */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-500 mr-2 uppercase tracking-wider">Active Inputs</span>
            {modes.map(mode => (
              <div 
                key={mode.id} 
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  mode.active 
                    ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                    : 'bg-slate-100 text-slate-400 border border-slate-200'
                }`}
              >
                <mode.icon className="w-4 h-4" />
                {mode.name}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 bg-slate-900 text-slate-50 px-4 py-2.5 rounded-xl max-w-sm w-full md:w-auto shadow-inner">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-400 font-medium">Listening...</p>
              <p className="text-sm font-medium truncate">"Sign in with Google"</p>
            </div>
            <Mic className="w-4 h-4 text-green-400" />
          </div>
        </div>

        {/* Main Modal Card */}
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200 flex flex-col">
          <div className="p-8 md:p-10">
            <div className="mb-8">
              <h1 className="text-3xl md:text-4xl font-bold font-display tracking-tight text-slate-900 mb-3">
                Welcome back to AccessiBooks
              </h1>
              <p className="text-lg text-slate-600">
                Choose how you'd like to sign in. Rest your gaze on an option to select it, or just say the phrase.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              
              {/* Google Tile */}
              <Tile 
                id="google"
                active={activeTile === 'google'}
                onHover={() => setActiveTile('google')}
                onClick={() => setExpandedTile(null)}
                label="Continue with Google"
                phrase='Say "Google"'
                icon={
                  <svg className="h-8 w-8" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                }
                dwellProgress={65}
              />

              {/* Microsoft Tile */}
              <Tile 
                id="microsoft"
                active={activeTile === 'microsoft'}
                onHover={() => setActiveTile('microsoft')}
                onClick={() => setExpandedTile(null)}
                label="Continue with Microsoft"
                phrase='Say "Microsoft"'
                icon={
                  <svg className="h-8 w-8" viewBox="0 0 24 24">
                    <path fill="#F25022" d="M1 1h10v10H1z"/>
                    <path fill="#00A4EF" d="M1 13h10v10H1z"/>
                    <path fill="#7FBA00" d="M13 1h10v10H13z"/>
                    <path fill="#FFB900" d="M13 13h10v10H13z"/>
                  </svg>
                }
              />

              {/* Facebook Tile */}
              <Tile 
                id="facebook"
                active={activeTile === 'facebook'}
                onHover={() => setActiveTile('facebook')}
                onClick={() => setExpandedTile(null)}
                label="Continue with Facebook"
                phrase='Say "Facebook"'
                icon={
                  <svg className="h-8 w-8" viewBox="0 0 24 24" fill="#1877F2">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                }
              />

              {/* Magic Link Tile */}
              <Tile 
                id="magiclink"
                active={activeTile === 'magiclink'}
                onHover={() => setActiveTile('magiclink')}
                onClick={() => setExpandedTile(expandedTile === 'magiclink' ? null : 'magiclink')}
                label="Send me a Magic Link"
                phrase='Say "Magic Link"'
                icon={<Zap className="w-8 h-8 text-amber-500" />}
                isExpandable
                isExpanded={expandedTile === 'magiclink'}
              >
                <div className="mt-6 pt-6 border-t border-slate-200">
                  <div className="space-y-4">
                    <Label htmlFor="magic-email" className="text-lg font-medium">Your email address</Label>
                    <Input id="magic-email" type="email" placeholder="name@example.com" className="h-16 text-lg px-4 rounded-xl border-2 border-slate-300 focus-visible:border-blue-500 focus-visible:ring-4 focus-visible:ring-blue-100" />
                    <Button className="w-full h-16 text-lg rounded-xl bg-slate-900 text-white hover:bg-slate-800">
                      Send Link
                      <span className="ml-3 px-2 py-1 bg-slate-800 rounded-md text-sm text-slate-300 font-mono">Say "Send"</span>
                    </Button>
                  </div>
                </div>
              </Tile>

              {/* Email / Password Tile */}
              <Tile 
                id="email"
                active={activeTile === 'email'}
                onHover={() => setActiveTile('email')}
                onClick={() => setExpandedTile(expandedTile === 'email' ? null : 'email')}
                label="Sign in with Email"
                phrase='Say "Email"'
                icon={<Mail className="w-8 h-8 text-blue-600" />}
                isExpandable
                isExpanded={expandedTile === 'email'}
                className="md:col-span-2"
              >
                <div className="mt-6 pt-6 border-t border-slate-200" id="email-login">
                  <form className="space-y-6 max-w-xl mx-auto" onSubmit={(e) => e.preventDefault()}>
                    <div className="space-y-3">
                      <Label htmlFor="email-input" className="text-lg font-medium flex items-center justify-between">
                        Email Address
                        <span className="text-sm font-normal text-slate-500 bg-slate-100 px-2 py-1 rounded-md">Say "Focus Email"</span>
                      </Label>
                      <Input 
                        id="email-input" 
                        type="email" 
                        placeholder="you@example.com" 
                        className="h-16 text-lg px-4 rounded-xl border-2 border-slate-300 focus-visible:border-blue-500 focus-visible:ring-4 focus-visible:ring-blue-100"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    
                    <div className="space-y-3">
                      <Label htmlFor="password-input" className="text-lg font-medium flex items-center justify-between">
                        Password
                        <span className="text-sm font-normal text-slate-500 bg-slate-100 px-2 py-1 rounded-md">Say "Focus Password"</span>
                      </Label>
                      <div className="flex gap-4">
                        <Input 
                          id="password-input" 
                          type={showPassword ? "text" : "password"} 
                          placeholder="••••••••" 
                          className="h-16 text-lg px-4 rounded-xl border-2 border-slate-300 focus-visible:border-blue-500 focus-visible:ring-4 focus-visible:ring-blue-100 flex-1"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                        <Button 
                          type="button" 
                          variant="outline" 
                          className="h-16 px-6 rounded-xl border-2 border-slate-300 text-lg hover:bg-slate-50 flex flex-col gap-1 items-center justify-center min-w-[120px]"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="w-6 h-6" /> : <EyeIcon className="w-6 h-6" />}
                          <span className="text-xs text-slate-500 font-normal">Say "{showPassword ? 'Hide' : 'Show'}"</span>
                        </Button>
                      </div>
                    </div>

                    <Button type="submit" className="w-full h-16 text-lg rounded-xl bg-slate-900 text-white hover:bg-slate-800 mt-8">
                      Sign In
                      <span className="ml-3 px-2 py-1 bg-slate-800 rounded-md text-sm text-slate-300 font-mono">Say "Submit"</span>
                    </Button>
                  </form>
                </div>
              </Tile>

              {/* Create Account Tile */}
              <Tile 
                id="create"
                active={activeTile === 'create'}
                onHover={() => setActiveTile('create')}
                onClick={() => setExpandedTile(null)}
                label="Create a new account"
                phrase='Say "Create Account"'
                icon={<UserPlus className="w-8 h-8 text-emerald-600" />}
                className="md:col-span-2 bg-emerald-50/50 hover:bg-emerald-50 border-emerald-100"
                activeClassName="ring-emerald-500 border-emerald-500 bg-emerald-50"
              />

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface TileProps {
  id: string;
  active: boolean;
  onHover: () => void;
  onClick: () => void;
  label: string;
  phrase: string;
  icon: React.ReactNode;
  dwellProgress?: number;
  isExpandable?: boolean;
  isExpanded?: boolean;
  children?: React.ReactNode;
  className?: string;
  activeClassName?: string;
}

function Tile({ 
  id, 
  active, 
  onHover, 
  onClick, 
  label, 
  phrase, 
  icon, 
  dwellProgress = 0,
  isExpandable,
  isExpanded,
  children,
  className = "",
  activeClassName = "ring-blue-500 border-blue-500 bg-blue-50/30"
}: TileProps) {
  
  // Calculate SVG stroke dasharray for the dwell ring
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (dwellProgress / 100) * circumference;

  return (
    <div 
      className={`
        relative rounded-3xl border-2 transition-all duration-300 overflow-hidden cursor-pointer
        ${active ? activeClassName + ' ring-4 ring-offset-2' : 'border-slate-200 bg-white hover:border-slate-300'}
        ${className}
      `}
      onMouseEnter={onHover}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
    >
      <div className={`p-6 md:p-8 flex flex-col h-full ${isExpanded ? 'pb-0 md:pb-0' : ''}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-6">
            
            {/* Icon + Dwell Ring */}
            <div className="relative flex items-center justify-center w-20 h-20 shrink-0">
              {/* Background track for ring */}
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle 
                  cx="50" cy="50" r="40" 
                  stroke="currentColor" 
                  strokeWidth="6" 
                  fill="transparent" 
                  className="text-slate-100" 
                />
                {/* Active progress ring */}
                {active && (
                  <circle 
                    cx="50" cy="50" r="40" 
                    stroke="currentColor" 
                    strokeWidth="6" 
                    fill="transparent" 
                    className="text-blue-500 transition-all duration-100 ease-linear"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                  />
                )}
              </svg>
              
              <div className="relative z-10 p-4 bg-white rounded-full shadow-sm">
                {icon}
              </div>
            </div>

            <div className="flex flex-col">
              <h3 className="text-xl md:text-2xl font-semibold text-slate-900">{label}</h3>
              {isExpandable && (
                <span className="text-slate-500 font-medium flex items-center gap-1 mt-1">
                  {isExpanded ? 'Collapse' : 'Expand'} options <ArrowDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Voice Command Badge */}
        <div className="mt-auto">
          <div className="inline-flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-xl text-slate-700 font-medium">
            <Mic className="w-5 h-5 text-slate-500" />
            <span className="text-lg">{phrase}</span>
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && children && (
          <div className="mt-4 pb-8" onClick={e => e.stopPropagation()}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
