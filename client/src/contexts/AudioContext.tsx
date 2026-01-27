import { createContext, useContext, useState, useRef, useEffect, ReactNode } from "react";
import { Book, Progress } from "@shared/schema";
import { localStorageService } from "@/lib/storage";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

interface AudioContextType {
  currentBook: Book | null;
  audioRef: React.RefObject<HTMLAudioElement>;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  isLoading: boolean;
  sleepTimer: number | null;
  sleepTimerRemaining: number | null;
  setCurrentBook: (book: Book | null) => void;
  togglePlayPause: () => Promise<void>;
  skip: (seconds: number) => void;
  seekTo: (time: number) => void;
  changeSpeed: (delta: number) => void;
  formatTime: (seconds: number) => string;
  playBook: (book: Book) => void;
  setSleepTimer: (minutes: number | null) => void;
  cancelSleepTimer: () => void;
  onTrackEndCallback: React.MutableRefObject<(() => void) | null>;
}

const AudioContext = createContext<AudioContextType | null>(null);

export function useAudioContext() {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error("useAudioContext must be used within AudioProvider");
  }
  return context;
}

export function AudioProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isLoading, setIsLoading] = useState(false);
  const [sleepTimer, setSleepTimerState] = useState<number | null>(null);
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState<number | null>(null);
  const sleepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const onTrackEndCallback = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (currentBook) {
      const progress = localStorageService.getProgress(currentBook.id);
      if (progress) {
        setCurrentTime(progress.currentTime);
        if (audioRef.current) {
          audioRef.current.currentTime = progress.currentTime;
        }
      }
    }
  }, [currentBook?.id]);

  useEffect(() => {
    if (!currentBook) return;

    const interval = setInterval(() => {
      if (isPlaying && currentTime > 0) {
        const progress: Progress = {
          bookId: currentBook.id,
          currentTime,
          lastPlayed: new Date().toISOString(),
        };
        localStorageService.saveProgress(progress);
        
        // Only sync to server for authenticated users
        if (user) {
          apiRequest("POST", "/api/history/progress", {
            bookId: currentBook.id,
            currentTime,
            bookTitle: currentBook.title,
            bookAuthor: currentBook.author,
            bookCover: currentBook.coverImage,
            totalDuration: duration || currentBook.duration,
          }).catch(() => {
            // Silently fail - local storage is the fallback
          });
        }
      }
    }, 10000); // Save every 10 seconds to reduce server load

    return () => clearInterval(interval);
  }, [currentBook?.id, isPlaying, currentTime, duration, user]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadStart = () => setIsLoading(true);
    const handleCanPlay = () => setIsLoading(false);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => {
      setIsPlaying(false);
      if (onTrackEndCallback.current) {
        onTrackEndCallback.current();
      }
    };
    const handleError = (e: Event) => {
      setIsLoading(false);
      const error = (e.target as HTMLAudioElement)?.error;
      
      // If stream fails due to auth, continue local playback without disruption
      if (error?.code === MediaError.MEDIA_ERR_NETWORK) {
        console.log("Network error during playback, will retry on next interaction");
      } else {
        console.error("Audio failed to load:", error?.message);
      }
    };

    audio.addEventListener("loadstart", handleLoadStart);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("loadstart", handleLoadStart);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current && currentBook) {
      audioRef.current.src = `/api/stream/${currentBook.id}`;
      audioRef.current.load();
    }
  }, [currentBook?.id]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const togglePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        await audio.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error("Failed to play audio:", error);
    }
  };

  const skip = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = Math.max(0, Math.min(duration, currentTime + seconds));
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const seekTo = (time: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    const clampedTime = Math.max(0, Math.min(duration, time));
    audio.currentTime = clampedTime;
    setCurrentTime(clampedTime);
  };

  const changeSpeed = (delta: number) => {
    const newRate = Math.max(0.6, Math.min(3.0, playbackRate + delta));
    setPlaybackRate(newRate);
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return "0:00:00";
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  const playBook = (book: Book) => {
    setCurrentBook(book);
    setTimeout(async () => {
      const audio = audioRef.current;
      if (audio) {
        try {
          await audio.play();
          setIsPlaying(true);
        } catch (error) {
          console.error("Failed to auto-play:", error);
        }
      }
    }, 100);
  };

  const setSleepTimer = (minutes: number | null) => {
    if (sleepTimerRef.current) {
      clearInterval(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }

    if (minutes === null) {
      setSleepTimerState(null);
      setSleepTimerRemaining(null);
      return;
    }

    const totalSeconds = minutes * 60;
    setSleepTimerState(minutes);
    setSleepTimerRemaining(totalSeconds);

    sleepTimerRef.current = setInterval(() => {
      setSleepTimerRemaining((prev) => {
        if (prev === null || prev <= 1) {
          if (sleepTimerRef.current) {
            clearInterval(sleepTimerRef.current);
            sleepTimerRef.current = null;
          }
          const audio = audioRef.current;
          if (audio && !audio.paused) {
            audio.pause();
            setIsPlaying(false);
          }
          setSleepTimerState(null);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelSleepTimer = () => {
    if (sleepTimerRef.current) {
      clearInterval(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }
    setSleepTimerState(null);
    setSleepTimerRemaining(null);
  };

  useEffect(() => {
    return () => {
      if (sleepTimerRef.current) {
        clearInterval(sleepTimerRef.current);
      }
    };
  }, []);

  return (
    <AudioContext.Provider
      value={{
        currentBook,
        audioRef,
        isPlaying,
        currentTime,
        duration,
        playbackRate,
        isLoading,
        sleepTimer,
        sleepTimerRemaining,
        setCurrentBook,
        togglePlayPause,
        skip,
        seekTo,
        changeSpeed,
        formatTime,
        playBook,
        setSleepTimer,
        cancelSleepTimer,
        onTrackEndCallback,
      }}
    >
      <audio ref={audioRef} preload="metadata" />
      {children}
    </AudioContext.Provider>
  );
}
