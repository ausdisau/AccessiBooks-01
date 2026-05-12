import { useCallback, useEffect, useRef, useState } from "react";

export interface VoiceRecording {
  dataUrl: string;
  mimeType: string;
  durationMs: number;
}

export interface VoiceRecorderState {
  supported: boolean;
  recording: boolean;
  elapsedMs: number;
  error: string | null;
}

function isSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof window.MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Encapsulates the `MediaRecorder` lifecycle and exposes a small,
 * UI-friendly surface. When recording is unsupported, `start` resolves to
 * `false` and `supported === false` so the UI can render a clean fallback.
 */
export function useVoiceRecorder() {
  const [state, setState] = useState<VoiceRecorderState>(() => ({
    supported: isSupported(),
    recording: false,
    elapsedMs: 0,
    error: null,
  }));

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);

  const stopTick = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (!state.supported) {
      setState((s) => ({ ...s, error: "Voice recording is not supported in this browser." }));
      return false;
    }
    if (recorderRef.current) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorderRef.current = recorder;
      streamRef.current = stream;
      startedAtRef.current = Date.now();
      recorder.start();
      tickRef.current = window.setInterval(() => {
        setState((s) => ({ ...s, elapsedMs: Date.now() - startedAtRef.current }));
      }, 200);
      setState((s) => ({ ...s, recording: true, elapsedMs: 0, error: null }));
      return true;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Microphone access denied or unavailable.";
      setState((s) => ({ ...s, error: message, recording: false }));
      releaseStream();
      recorderRef.current = null;
      return false;
    }
  }, [state.supported, releaseStream]);

  const stop = useCallback((): Promise<VoiceRecording | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder) {
        resolve(null);
        return;
      }
      recorder.onstop = async () => {
        const durationMs = Date.now() - startedAtRef.current;
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        stopTick();
        releaseStream();
        recorderRef.current = null;
        setState((s) => ({ ...s, recording: false, elapsedMs: 0 }));
        try {
          const dataUrl = await blobToDataUrl(blob);
          resolve({ dataUrl, mimeType, durationMs });
        } catch {
          setState((s) => ({ ...s, error: "Could not encode recorded audio." }));
          resolve(null);
        }
      };
      try {
        recorder.stop();
      } catch {
        stopTick();
        releaseStream();
        recorderRef.current = null;
        setState((s) => ({ ...s, recording: false, elapsedMs: 0 }));
        resolve(null);
      }
    });
  }, [releaseStream, stopTick]);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    chunksRef.current = [];
    stopTick();
    releaseStream();
    recorderRef.current = null;
    setState((s) => ({ ...s, recording: false, elapsedMs: 0 }));
  }, [releaseStream, stopTick]);

  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);

  return { ...state, start, stop, cancel };
}
