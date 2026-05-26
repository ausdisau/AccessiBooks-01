import { createRoot } from "react-dom/client";
import App from "./App";
// Inter, Fraunces, and Atkinson Hyperlegible (the always-on core families)
// are declared inline in `index.css`. The other 25 theme-picker families live
// in their own per-family CSS files under `src/assets/fonts/<slug>/` and are
// loaded on demand via `src/lib/themeFont.ts` when a theme that needs them
// becomes active.
import "./index.css";
// Import for its side effect of keeping the per-family CSS chunks reachable
// from the module graph so Vite/Rollup emits them as dynamic chunks ready to
// be fetched on demand by `loadThemeFont()`.
import "./lib/themeFont";
import { consumeTokenFromUrlHash } from "./lib/authToken";

// Persist the JWT from `#token=...` (set by OAuth + magic-link redirects)
// BEFORE React mounts. Doing this inside App's useEffect created a race
// where the first /api/auth/user query fired without the bearer token and
// cached a null user, making a successful login appear failed.
consumeTokenFromUrlHash();

createRoot(document.getElementById("root")!).render(<App />);
