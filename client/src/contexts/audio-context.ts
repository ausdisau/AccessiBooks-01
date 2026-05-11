import { createContext, useContext } from "react";
import type { Book, Chapter } from "@shared/schema";
import type { AdResponse } from "@/services/audio-ad-service";
import type {
  StreamQualityInfo as SharedStreamQualityInfo,
  StreamQualityTier as SharedStreamQualityTier,
} from "@/contexts/stream-quality";

export interface AudioAdState {
  isAdPlaying: boolean;
  currentAd: AdResponse | null;
  adType: "pre-roll" | "mid-roll" | null;
}

export type StreamQualityTier = SharedStreamQualityTier;
export type StreamQualityInfo = SharedStreamQualityInfo;

export interface AudioContextType {
  currentBook: Book | null;
  audioRef: React.RefObject<HTMLAudioElement>;
  isPlaying: boolean;
  isMuted: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  isLoading: boolean;
  isBuffering: boolean;
  isOffline: boolean;
  sleepTimer: number | null;
  sleepTimerRemaining: number | null;
  chapters: Chapter[];
  currentChapter: Chapter | null;
  currentChapterIndex: number;
  adState: AudioAdState;
  skipAfterMs: number;
  streamQuality: StreamQualityInfo;
  bufferedAhead: number;
  setCurrentBook: (book: Book | null) => void;
  togglePlayPause: () => Promise<void>;
  toggleMute: () => void;
  skip: (seconds: number) => void;
  seekTo: (time: number) => void;
  changeSpeed: (delta: number) => void;
  setSpeed: (speed: number) => void;
  formatTime: (seconds: number) => string;
  playBook: (book: Book) => void;
  setSleepTimer: (minutes: number | null) => void;
  cancelSleepTimer: () => void;
  onTrackEndCallback: React.MutableRefObject<(() => void) | null>;
  onChapterEndCallback: React.MutableRefObject<(() => void) | null>;
  nextChapter: () => void;
  prevChapter: () => void;
  seekToChapter: (chapterIndex: number) => void;
  onAdComplete: (skipped: boolean) => void;
  onAdUpgrade: () => void;
  /** True while an ad request is in-flight (pre-roll or mid-roll). Use to guard skip/chapter controls. */
  adLoading: boolean;
}

export const AudioContext = createContext<AudioContextType | null>(null);

export function useAudioContext() {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error("useAudioContext must be used within AudioProvider");
  }
  return context;
}
