"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { consumeTokenFromUrlHash } from "@/lib/authToken";

const App = dynamic(() => import("@/App"), {
  ssr: false,
  loading: () => null,
});

export default function AppClient() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    consumeTokenFromUrlHash();
    setReady(true);
  }, []);
  if (!ready) return null;
  return <App />;
}
