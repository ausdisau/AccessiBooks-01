"use client";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
const WordBankPage = lazy(() => import("@/page-views/word-bank").then((m) => ({ default: m.WordBankPage })));
export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <div id="word-bank-panel" role="region" aria-label="Word Bank" data-testid="panel-word-bank">
        <WordBankPage />
      </div>
    </Suspense>
  );
}
