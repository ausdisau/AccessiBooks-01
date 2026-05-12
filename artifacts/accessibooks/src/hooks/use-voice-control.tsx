import { useEffect, useRef, useState, useCallback } from "react";

declare global {
  interface Window {
    SpeechRecognition: new () => ISpeechRecognition;
    webkitSpeechRecognition: new () => ISpeechRecognition;
  }
}

interface ISpeechRecognitionResultItem {
  readonly transcript: string;
  readonly confidence: number;
}

interface ISpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): ISpeechRecognitionResultItem;
  [index: number]: ISpeechRecognitionResultItem;
}

interface ISpeechRecognitionResultList {
  readonly length: number;
  item(index: number): ISpeechRecognitionResult;
  [index: number]: ISpeechRecognitionResult;
}

interface ISpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: ISpeechRecognitionResultList;
}

interface ISpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: ((event: Event) => void) | null;
  onresult: ((event: ISpeechRecognitionEvent) => void) | null;
  onerror: ((event: ISpeechRecognitionErrorEvent) => void) | null;
  onend: ((event: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export function isSpeechRecognitionSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
}

export type VoiceCommandHandler = (arg?: string) => void;

export interface VoiceCommand {
  patterns: (string | RegExp)[];
  handler: VoiceCommandHandler;
  description: string;
}

export interface UseVoiceControlOptions {
  commands: VoiceCommand[];
  onNoMatch?: (transcript: string) => void;
  lang?: string;
}

export interface UseVoiceControlReturn {
  isSupported: boolean;
  isListening: boolean;
  isProcessing: boolean;
  interimTranscript: string;
  lastTranscript: string;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
}

function getSpeechRecognitionCtor(): (new () => ISpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function matchCommand(
  transcript: string,
  commands: VoiceCommand[]
): { handler: VoiceCommandHandler; arg?: string } | null {
  const text = transcript.trim().toLowerCase();

  for (const cmd of commands) {
    for (const pattern of cmd.patterns) {
      if (typeof pattern === "string") {
        const keyword = pattern.toLowerCase();
        if (text === keyword) {
          return { handler: cmd.handler };
        }
        if (text.startsWith(keyword + " ")) {
          const arg = text.slice(keyword.length + 1).trim();
          return { handler: cmd.handler, arg: arg || undefined };
        }
      } else {
        const match = text.match(pattern);
        if (match) {
          return { handler: cmd.handler, arg: match[1]?.trim() || undefined };
        }
      }
    }
  }
  return null;
}

export function useVoiceControl({
  commands,
  onNoMatch,
  lang = "en-US",
}: UseVoiceControlOptions): UseVoiceControlReturn {
  const SpeechRecognitionCtor = getSpeechRecognitionCtor();
  const isSupported = SpeechRecognitionCtor !== null;

  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [lastTranscript, setLastTranscript] = useState("");

  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const commandsRef = useRef(commands);
  const onNoMatchRef = useRef(onNoMatch);

  useEffect(() => { commandsRef.current = commands; }, [commands]);
  useEffect(() => { onNoMatchRef.current = onNoMatch; }, [onNoMatch]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const startListening = useCallback(() => {
    if (!SpeechRecognitionCtor) return;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = lang;
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      setIsListening(true);
      setIsProcessing(false);
      setInterimTranscript("");
    };

    recognition.onresult = (event: ISpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      if (interim) setInterimTranscript(interim);
      if (final) {
        setIsProcessing(true);
        setInterimTranscript("");
        setLastTranscript(final);
        const matched = matchCommand(final, commandsRef.current);
        requestAnimationFrame(() => {
          if (matched) {
            matched.handler(matched.arg);
          } else {
            onNoMatchRef.current?.(final.trim());
          }
          setIsProcessing(false);
        });
      }
    };

    recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
      if (event.error !== "aborted" && event.error !== "no-speech") {
        console.warn("[VoiceControl] SpeechRecognition error:", event.error);
      }
      setIsListening(false);
      setIsProcessing(false);
      setInterimTranscript("");
    };

    recognition.onend = () => {
      setIsListening(false);
      setIsProcessing(false);
      setInterimTranscript("");
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [SpeechRecognitionCtor, lang]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  return {
    isSupported,
    isListening,
    isProcessing,
    interimTranscript,
    lastTranscript,
    startListening,
    stopListening,
    toggleListening,
  };
}
