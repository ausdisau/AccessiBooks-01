import { Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type UseVoiceControlReturn } from "@/hooks/use-voice-control";

interface VoiceControlButtonProps {
  voiceControl: UseVoiceControlReturn;
}

export function VoiceControlButton({ voiceControl }: VoiceControlButtonProps) {
  const { isListening, isProcessing, interimTranscript, toggleListening } = voiceControl;

  const state: "idle" | "listening" | "processing" = isProcessing
    ? "processing"
    : isListening
    ? "listening"
    : "idle";

  return (
    <div className="fixed bottom-24 right-5 z-50 flex flex-col items-end gap-2">
      {state === "listening" && (
        <div
          className="max-w-xs bg-card border border-border rounded-xl px-3 py-2 shadow-lg text-sm text-foreground animate-in fade-in slide-in-from-bottom-2 duration-150"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="text-primary text-xs font-medium flex items-center gap-1 mb-0.5">
            <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
            Listening…
          </span>
          {interimTranscript ? (
            <span className="italic text-foreground">&ldquo;{interimTranscript}&rdquo;</span>
          ) : (
            <span className="text-muted-foreground">Say a command or &ldquo;stop&rdquo;</span>
          )}
        </div>
      )}

      {state === "processing" && (
        <div
          className="max-w-xs bg-card border border-border rounded-xl px-3 py-2 shadow-lg text-sm text-foreground animate-in fade-in duration-100"
          role="status"
          aria-live="assertive"
          aria-atomic="true"
        >
          <span className="text-muted-foreground text-xs flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            Processing…
          </span>
        </div>
      )}

      <Button
        size="icon"
        onClick={toggleListening}
        disabled={state === "processing"}
        aria-label={
          state === "processing"
            ? "Processing voice command"
            : state === "listening"
            ? "Stop listening — voice control active"
            : "Start voice control — press to speak a command"
        }
        aria-pressed={state === "listening"}
        data-testid="voice-control-button"
        title={
          state === "processing"
            ? "Processing…"
            : state === "listening"
            ? "Stop listening"
            : "Voice control — click to speak"
        }
        className={`h-12 w-12 rounded-full shadow-lg transition-all duration-200 ${
          state === "listening"
            ? "bg-primary text-primary-foreground ring-4 ring-primary/30"
            : state === "processing"
            ? "bg-primary/60 text-primary-foreground cursor-wait"
            : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary"
        }`}
      >
        {state === "processing" ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : state === "listening" ? (
          <Mic className="h-5 w-5 animate-pulse" />
        ) : (
          <MicOff className="h-5 w-5" />
        )}
        <span className="sr-only">
          {state === "listening" ? "Stop voice control" : "Start voice control"}
        </span>
      </Button>
    </div>
  );
}
