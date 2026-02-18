import { createContext, useContext, useState, useRef, useEffect, ReactNode, useCallback } from "react";
import { Book, Progress, Chapter } from "@shared/schema";
import { localStorageService } from "@/lib/storage";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { audioAdService, type AdResponse } from "@/services/audio-ad-service";

interface AudioAdState {
  isAdPlaying: boolean;
  currentAd: AdResponse | null;
  adType: "pre-roll" | "mid-roll" | null;
}

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
  chapters: Chapter[];
  currentChapter: Chapter | null;
  currentChapterIndex: number;
  adState: AudioAdState;
  skipAfterMs: number;
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
  onChapterEndCallback: React.MutableRefObject<(() => void) | null>;
  nextChapter: () => void;
  prevChapter: () => void;
  seekToChapter: (chapterIndex: number) => void;
  onAdComplete: (skipped: boolean) => void;
  onAdUpgrade: () => void;
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
  const onChapterEndCallback = useRef<(() => void) | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(-1);
  const lastChapterIndex = useRef(-1);

  const [adState, setAdState] = useState<AudioAdState>({
    isAdPlaying: false,
    currentAd: null,
    adType: null,
  });
  const pendingBookRef = useRef<Book | null>(null);
  const isPremiumRef = useRef(false);
  const externalChapterEndRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const checkPremium = () => {
      if (user) {
        fetch("/api/subscription/status", { credentials: "include" })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            isPremiumRef.current = data?.isPremium || false;
          })
          .catch(() => {});
      } else {
        isPremiumRef.current = false;
      }
    };
    checkPremium();
    const interval = setInterval(checkPremium, 60000);
    return () => clearInterval(interval);
  }, [user]);

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

  const listeningAccumulator = useRef(0);

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
        
        if (user) {
          apiRequest("POST", "/api/history/progress", {
            bookId: currentBook.id,
            currentTime,
            bookTitle: currentBook.title,
            bookAuthor: currentBook.author,
            bookCover: currentBook.coverImage,
            totalDuration: duration || currentBook.duration,
          }).catch(() => {});

          listeningAccumulator.current += 10 / 60;
          if (listeningAccumulator.current >= 1) {
            const minutes = Math.floor(listeningAccumulator.current);
            listeningAccumulator.current -= minutes;
            apiRequest("POST", "/api/gamification/activity", {
              minutesListened: minutes,
              bookCompleted: false,
            }).catch(() => {});
          }
        }
      }
    }, 10000);

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

  // Fetch chapters when book changes
  useEffect(() => {
    if (currentBook) {
      fetch(`/api/books/${currentBook.id}/chapters`)
        .then(res => res.json())
        .then((fetchedChapters: Chapter[]) => {
          setChapters(fetchedChapters);
          setCurrentChapterIndex(fetchedChapters.length > 0 ? 0 : -1);
          lastChapterIndex.current = -1;
        })
        .catch(err => {
          console.error("Failed to fetch chapters:", err);
          setChapters([]);
          setCurrentChapterIndex(-1);
          lastChapterIndex.current = -1;
        });
    } else {
      setChapters([]);
      setCurrentChapterIndex(-1);
      lastChapterIndex.current = -1;
    }
  }, [currentBook?.id]);

  // Track current chapter based on playback time (only for audio chapters with time data)
  useEffect(() => {
    if (chapters.length === 0 || duration <= 0) return;
    
    // Only track chapters that have time-based data (audiobooks)
    const hasTimeBasedChapters = chapters.some(ch => ch.startTime !== null);
    if (!hasTimeBasedChapters) return;
    
    const newIndex = chapters.findIndex((ch, i) => {
      const start = ch.startTime ?? 0;
      const end = ch.endTime ?? (chapters[i + 1]?.startTime ?? duration);
      return currentTime >= start && currentTime < end;
    });
    
    if (newIndex !== -1 && newIndex !== currentChapterIndex) {
      if (lastChapterIndex.current !== -1 && newIndex === lastChapterIndex.current + 1) {
        if (onChapterEndCallback.current) {
          onChapterEndCallback.current();
        }
        triggerMidRollAd();
      }
      setCurrentChapterIndex(newIndex);
      lastChapterIndex.current = newIndex;
    }
  }, [currentTime, chapters, duration, currentChapterIndex]);

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

  const seekToChapter = useCallback((chapterIndex: number) => {
    if (chapterIndex < 0 || chapterIndex >= chapters.length) return;
    
    const chapter = chapters[chapterIndex];
    const startTime = chapter.startTime ?? 0;
    
    if (audioRef.current) {
      audioRef.current.currentTime = startTime;
      setCurrentTime(startTime);
      setCurrentChapterIndex(chapterIndex);
      lastChapterIndex.current = chapterIndex;
    }
  }, [chapters]);

  const nextChapter = useCallback(() => {
    if (currentChapterIndex < chapters.length - 1) {
      seekToChapter(currentChapterIndex + 1);
    }
  }, [currentChapterIndex, chapters.length, seekToChapter]);

  const prevChapter = useCallback(() => {
    if (currentChapterIndex > 0) {
      seekToChapter(currentChapterIndex - 1);
    } else if (currentChapterIndex === 0 && chapters.length > 0) {
      // If at first chapter, seek to beginning
      seekToChapter(0);
    }
  }, [currentChapterIndex, chapters.length, seekToChapter]);

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

  const startPlaybackForBook = useCallback((book: Book) => {
    setCurrentBook(book);

    fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: book.id, eventType: "play" }),
    }).catch(() => {});

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
  }, []);

  const onAdComplete = useCallback((skipped: boolean) => {
    const ad = adState.currentAd;
    const adType = adState.adType;
    setAdState({ isAdPlaying: false, currentAd: null, adType: null });

    if (ad && adType) {
      audioAdService.recordImpression(ad.id, adType, !skipped, skipped, ad.isProgrammatic ? ad.provider : "house");
    }

    if (adType === "pre-roll" && pendingBookRef.current) {
      startPlaybackForBook(pendingBookRef.current);
      pendingBookRef.current = null;
    } else if (adType === "mid-roll") {
      const audio = audioRef.current;
      if (audio) {
        audio.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }
  }, [adState, startPlaybackForBook]);

  const onAdUpgrade = useCallback(() => {
    const ad = adState.currentAd;
    const adType = adState.adType;
    setAdState({ isAdPlaying: false, currentAd: null, adType: null });

    if (ad && adType) {
      audioAdService.recordImpression(ad.id, adType, false, true, ad.isProgrammatic ? ad.provider : "house");
    }

    pendingBookRef.current = null;
    window.location.href = "/api/subscription/create-checkout";
  }, [adState]);

  const triggerMidRollAd = useCallback(async () => {
    if (isPremiumRef.current) return;
    if (!audioAdService.shouldShowMidRoll(isPremiumRef.current)) return;

    const audio = audioRef.current;
    if (audio && !audio.paused) {
      audio.pause();
      setIsPlaying(false);
    }

    audioAdService.playAdChime();
    const ad = await audioAdService.requestAd("mid-roll");
    setAdState({ isAdPlaying: true, currentAd: ad, adType: "mid-roll" });
  }, []);


  const playBook = async (book: Book) => {
    audioAdService.incrementPlayCount();

    if (audioAdService.shouldShowPreRoll(isPremiumRef.current)) {
      pendingBookRef.current = book;
      audioAdService.playAdChime();
      const ad = await audioAdService.requestAd("pre-roll");
      setAdState({ isAdPlaying: true, currentAd: ad, adType: "pre-roll" });
      return;
    }

    startPlaybackForBook(book);
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
        chapters,
        currentChapter: chapters[currentChapterIndex] ?? null,
        currentChapterIndex,
        adState,
        skipAfterMs: audioAdService.skipAfterMs,
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
        onChapterEndCallback,
        nextChapter,
        prevChapter,
        seekToChapter,
        onAdComplete,
        onAdUpgrade,
      }}
    >
      <audio ref={audioRef} preload="metadata" />
      {children}
    </AudioContext.Provider>
  );
}
