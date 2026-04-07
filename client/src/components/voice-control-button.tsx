import { Mic, MicOff, MicOff as MicOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { type UseVoiceControlReturn } from "@/hooks/use-voice-control";

interface VoiceControlButtonProps {
  voiceControl: UseVoiceControlReturn;
}

export function VoiceControlButton({ voiceControl }: VoiceControlButtonProps) {
  const { isSupported, isListening, interimTranscript, toggleListening } = voiceControl;
  const { toast } = useToast();

  const handleClick = () => {
    if (!isSupported) {
      toast({
        title: "Voice control not supported",
        description: "Your browser does not support the Web Speech API. Try Chrome or Edge.",
        duration: 5000,
      });
      return;
    }
    toggleListening();
  };

  return (
    <div className="fixed bottom-24 right-5 z-50 flex flex-col items-end gap-2">
      {isListening && (
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
            <span className="text-muted-foreground">Say a command…</span>
          )}
        </div>
      )}

      <Button
        size="icon"
        onClick={handleClick}
        aria-label={
          !isSupported
            ? "Voice control — not supported in this browser"
            : isListening
            ? "Stop listening — voice control active"
            : "Start voice control — press to speak a command"
        }
        aria-pressed={isListening}
        data-testid="voice-control-button"
        title={
          !isSupported
            ? "Voice control requires Chrome or Edge"
            : isListening
            ? "Stop listening"
            : "Voice control — click to speak"
        }
        className={`h-12 w-12 rounded-full shadow-lg transition-all duration-200 ${
          !isSupported
            ? "bg-card border border-dashed border-muted-foreground text-muted-foreground opacity-60 cursor-not-allowed"
            : isListening
            ? "bg-primary text-primary-foreground ring-4 ring-primary/30"
            : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary"
        }`}
      >
        {isListening ? (
          <Mic className="h-5 w-5 animate-pulse" />
        ) : (
          <MicOff className="h-5 w-5" />
        )}
        <span className="sr-only">
          {isListening ? "Stop voice control" : "Start voice control"}
        </span>
      </Button>
    </div>
  );
}
