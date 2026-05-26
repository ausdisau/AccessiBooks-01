import { Link, useLocation } from "@/lib/wouter-compat";
import { useAuth } from "@/hooks/useAuth";
import { AccessiBooksLogo } from "@/components/accessibooks-logo";
import { PlanBadge } from "@/components/plan-badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { sidebarNavGroups, type SidebarMode } from "@/components/sidebar-nav-config";


export function AppSidebar({ mode, onCloseDrawer }: {
  mode: SidebarMode;
  onCloseDrawer: () => void;
}) {
  const [location] = useLocation();
  const { user } = useAuth();
  const tier = ((user as any)?.subscriptionTier ?? "free") as "free" | "plus" | "premium";

  const isActive = (path: string) => {
    if (path === "/") return location === "/" || location === "";
    return location === path || location.startsWith(path + "/");
  };

  const makeFullNav = (onLinkClick?: () => void) => (
    <nav className="flex flex-col h-full overflow-y-auto py-4 px-3" aria-label="Main navigation">
      <div className="px-3 mb-6">
        <Link 
          href="/" 
          className="flex items-center gap-2 group"
          onClick={onLinkClick}
        >
          <AccessiBooksLogo className="h-8 w-8 group-hover:text-primary transition-colors" showText={false} />
          <span className="text-lg font-bold tracking-tight">AccessiBooks</span>
        </Link>
      </div>
      {sidebarNavGroups.map((group) => (
        <div key={group.label} className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 px-3 mb-2">
            {group.label}
          </p>
          {group.items.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              onClick={onLinkClick}
              className={`flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm font-medium transition-all relative group ${
                isActive(item.path)
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`menu-${item.path.replace("/", "") || "library"}`}
            >
              {isActive(item.path) && (
                <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-primary rounded-r-full" />
              )}
              <span className={`transition-colors ${isActive(item.path) ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}>
                {item.icon}
              </span>
              <span className="flex-1 truncate">{item.label}</span>
              {item.path === "/settings" && <PlanBadge tier={tier} className="text-[10px] px-1.5 py-0" />}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );

  const railNav = (
    <nav className="flex flex-col h-full overflow-y-auto py-4 items-center" aria-label="Main navigation">
      <Link href="/" className="mb-6 group">
        <AccessiBooksLogo className="h-8 w-8 group-hover:text-primary transition-colors" showText={false} />
      </Link>
      {sidebarNavGroups.map((group) => (
        <div key={group.label} className="mb-2 w-full flex flex-col items-center">
          {group.items.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={`flex flex-col items-center justify-center w-14 py-2 rounded-md transition-all relative group mb-1 ${
                isActive(item.path)
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-label={item.label}
              aria-current={isActive(item.path) ? "page" : undefined}
              data-testid={`menu-${item.path.replace("/", "") || "library"}`}
            >
              {isActive(item.path) && (
                <div className="absolute left-0 top-2 bottom-2 w-1 bg-primary rounded-r-full" />
              )}
              <span className={`transition-colors ${isActive(item.path) ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}>
                {item.icon}
              </span>
              <span className="text-[9px] font-medium leading-none tracking-tight truncate max-w-[48px] text-center mt-1">
                {item.label}
              </span>
            </Link>
          ))}
          <div className="w-8 h-px bg-sidebar-border my-2" />
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Persistent sidebar — visible on md+ only, hidden on mobile */}
      {mode !== "hidden" && (
        <aside
          className={`hidden md:flex flex-col shrink-0 bg-sidebar-background border-r border-sidebar-border h-[calc(100vh-3.5rem)] sticky top-14 transition-all duration-200 ${
            mode === "full" ? "w-60" : "w-16"
          }`}
          data-testid="sidebar"
          role="navigation"
        >
          {mode === "full" ? makeFullNav() : railNav}
        </aside>
      )}

      {/* Slide-in drawer — used on all screen sizes when hidden */}
      {mode === "hidden" && (
        <>
          <div
            className="fixed inset-0 top-14 bg-black/40 z-40"
            onClick={onCloseDrawer}
            aria-hidden="true"
          />
          <aside className="fixed left-0 top-14 bottom-0 w-64 bg-sidebar-background border-r border-sidebar-border z-50 shadow-xl animate-in slide-in-from-left duration-200">
            {makeFullNav(onCloseDrawer)}
          </aside>
        </>
      )}
    </>
  );
}

// Auth providers available (Passport.js)
interface AuthProviders {
  local: boolean;
  google: boolean;
  facebook: boolean;
  microsoft: boolean;
  auth0: boolean;
}
