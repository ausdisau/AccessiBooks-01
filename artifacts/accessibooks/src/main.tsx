import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { consumeTokenFromUrlHash } from "./lib/authToken";

// Persist the JWT from `#token=...` (set by OAuth + magic-link redirects)
// BEFORE React mounts. Doing this inside App's useEffect created a race
// where the first /api/auth/user query fired without the bearer token and
// cached a null user, making a successful login appear failed.
consumeTokenFromUrlHash();

createRoot(document.getElementById("root")!).render(<App />);
