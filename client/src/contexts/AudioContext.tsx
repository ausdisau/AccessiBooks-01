import { createContext, useContext, useState, useRef, useEffect, ReactNode, useCallback, useMemo } from "react";
import { Book, Progress, Chapter } from "@shared/schema";
import { localStorageService } from "@/lib/storage";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { audioAdService, type AdResponse } from "@/services/audio-ad-service";
import { useQuery } from "@tanstack/react-query";
import { usePlaybackAdHooks } from "@/hooks/use-playback-ad-hooks";

interface AudioAdState {
  isAdPlaying: boolean;
  currentAd: AdResponse | null;
  adType: "pre-roll" | "mid-roll" | null;
}

export type StreamQualityTier = "uhq" | "hd" | "sd";

export interface StreamQualityInfo {
  quality: "low" | "mid" | "high" | "ultra";
  bitrate: number;
  label: string;
  tier: StreamQualityTier;
}

interface AudioContextType {
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
  const [isMuted, setIsMuted] = useState(false);
  // Stores the playback time threshold and the original chapter boundary indices
  // for a deferred mid-roll so re-evaluation uses real values (not synthetic -1/+0 offsets).
  const deferredAdRef = useRef<{ time: number; prevIdx: number; nextIdx: number } | null>(null);
  // Flat transcript segments for the current book — loaded so the sentence guard can check them
  const [transcriptSegments, setTranscriptSegments] = useState<{ start: number; end: number }[] | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  // Initialize synchronously from the auth user object so the first
  // ad-eligibility check (which fires before the /api/subscription/status
  // fetch resolves) already has the correct tier — prevents free-tier ads
  // being served to premium users on the very first playBook call.
  const [subscriptionTier, setSubscriptionTier] = useState<"free" | "plus" | "premium" | "institutional">(() => {
    const t = user?.subscriptionTier; // User.subscriptionTier is string | null per schema
    if (t === "premium" || t === "plus" || t === "institutional") return t;
    return "free";
  });
  const [bufferedAhead, setBufferedAhead] = useState(0);
  const pendingBookRef = useRef<Book | null>(null);
  // Initialize synchronously from the user's tier so ad-skip / quality decisions
  // made before the first /api/subscription/status fetch don't leak premium
  // behaviour to free users (or block paying users on first paint).
  const initialTier = (user as any)?.subscriptionTier;
  const isPremiumRef = useRef(
    initialTier === "premium" || initialTier === "plus" || initialTier === "institutional"
  );
  const sleepTimerDefaultRef = useRef<number | null>(null);

  // Subscribe to user accessibility prefs to apply listening defaults
  const { data: a11yPrefsData } = useQuery<{ profile: Record<string, unknown> }>({
    queryKey: ["/api/a11y/preferences"],
  });
  useEffect(() => {
    const sleepDefault = a11yPrefsData?.profile?.sleepTimerDefault;
    sleepTimerDefaultRef.current =
      typeof sleepDefault === "number" && sleepDefault > 0 ? sleepDefault : null;
  }, [a11yPrefsData?.profile?.sleepTimerDefault]);
  useEffect(() => {
    const speed = a11yPrefsData?.profile?.playbackSpeed;
    if (typeof speed === "number" && speed > 0 && speed !== playbackRate) {
      setPlaybackRate(speed);
    }
    // Only apply on initial profile load (when currentBook is null) to avoid stomping user changes during playback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a11yPrefsData?.profile?.playbackSpeed]);
  const externalChapterEndRef = useRef<(() => void) | null>(null);
  const stallRecoveryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const networkRetryCountRef = useRef(0);
  const networkRetryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const wasPlayingBeforeOfflineRef = useRef(false);

  useEffect(() => {
    const checkSubscription = () => {
      if (user) {
        fetch("/api/subscription/status", { credentials: "include" })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            isPremiumRef.current = data?.isPremium || false;
            const tier: "free" | "plus" | "premium" = data?.subscriptionTier || "free";
            setSubscriptionTier(tier);
            const audio = audioRef.current;
            if (audio) {
              audio.preload = tier !== "free" ? "auto" : "metadata";
            }
          })
          .catch(() => {});
      } else {
        isPremiumRef.current = false;
        setSubscriptionTier("free");
      }
    };
    checkSubscription();
    const interval = setInterval(checkSubscription, 60000);
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
    const handleCanPlay = () => {
      setIsLoading(false);
      setIsBuffering(false);
      if (stallRecoveryTimerRef.current) {
        clearTimeout(stallRecoveryTimerRef.current);
        stallRecoveryTimerRef.current = null;
      }
      networkRetryCountRef.current = 0;
    };
    const handlePlaying = () => {
      setIsBuffering(false);
      if (stallRecoveryTimerRef.current) {
        clearTimeout(stallRecoveryTimerRef.current);
        stallRecoveryTimerRef.current = null;
      }
      networkRetryCountRef.current = 0;
    };
    const handleWaiting = () => setIsBuffering(true);
    const handleStalled = () => {
      setIsBuffering(true);
      if (stallRecoveryTimerRef.current) clearTimeout(stallRecoveryTimerRef.current);
      stallRecoveryTimerRef.current = setTimeout(() => {
        const a = audioRef.current;
        if (!a) return;
        const wasPlaying = !a.paused;
        const pos = a.currentTime;
        const src = a.src;
        if (src) {
          a.src = src;
          a.load();
          a.currentTime = pos;
          if (wasPlaying) a.play().catch(() => {});
        }
        stallRecoveryTimerRef.current = null;
      }, 5000);
    };
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => {
      setIsPlaying(false);
      setIsBuffering(false);
      if (onTrackEndCallback.current) {
        onTrackEndCallback.current();
      }
    };
    const handleError = (e: Event) => {
      setIsLoading(false);
      const error = (e.target as HTMLAudioElement)?.error;
      if (error?.code === MediaError.MEDIA_ERR_NETWORK) {
        const retries = networkRetryCountRef.current;
        if (retries < 3) {
          networkRetryCountRef.current += 1;
          const delay = Math.pow(2, retries) * 2000;
          setIsBuffering(true);
          if (networkRetryTimerRef.current) clearTimeout(networkRetryTimerRef.current);
          networkRetryTimerRef.current = setTimeout(() => {
            const a = audioRef.current;
            if (!a) return;
            const pos = a.currentTime;
            const src = a.src;
            if (src) {
              a.src = src;
              a.load();
              a.currentTime = pos;
              a.play().catch(() => {});
            }
          }, delay);
        } else {
          setIsBuffering(false);
          networkRetryCountRef.current = 0;
          console.error("Audio network error: max retries reached");
        }
      } else {
        setIsBuffering(false);
        console.error("Audio failed to load:", error?.message);
      }
    };

    audio.addEventListener("loadstart", handleLoadStart);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("stalled", handleStalled);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("loadstart", handleLoadStart);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("stalled", handleStalled);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      if (stallRecoveryTimerRef.current) clearTimeout(stallRecoveryTimerRef.current);
      if (networkRetryTimerRef.current) clearTimeout(networkRetryTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current && currentBook) {
      audioRef.current.src = `/api/stream/${currentBook.id}`;
      audioRef.current.load();
    }
  }, [currentBook?.id]);

  const lastPredictivePrefetchRef = useRef<number>(0);

  // Poll audio.buffered every second: track bufferedAhead + predictive prefetch
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const PREFETCH_THRESHOLD_S = 15;
    const PREFETCH_COOLDOWN_MS = 30_000;

    const poll = () => {
      try {
        if (audio.buffered.length > 0) {
          const end = audio.buffered.end(audio.buffered.length - 1);
          const ahead = Math.max(0, end - audio.currentTime);
          setBufferedAhead(ahead);

          // Predictive prefetch: reload src when buffer runs low while playing
          const now = Date.now();
          if (
            ahead < PREFETCH_THRESHOLD_S &&
            !audio.paused &&
            audio.currentTime > 0 &&
            audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA &&
            now - lastPredictivePrefetchRef.current > PREFETCH_COOLDOWN_MS
          ) {
            lastPredictivePrefetchRef.current = now;
            const pos = audio.currentTime;
            const src = audio.src;
            if (src) {
              audio.src = src;
              audio.load();
              audio.currentTime = pos;
              audio.play().catch(() => {});
            }
          }
        } else {
          setBufferedAhead(0);
        }
      } catch {
        setBufferedAhead(0);
      }
    };
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, []);

  // Compute stream quality info from subscription tier
  const streamQuality = useMemo<StreamQualityInfo>(() => {
    if (subscriptionTier === "premium") {
      return { quality: "ultra", bitrate: 320, label: "UHQ · 320 kbps", tier: "uhq" };
    }
    if (subscriptionTier === "plus") {
      return { quality: "mid", bitrate: 192, label: "HD · 192 kbps", tier: "hd" };
    }
    return { quality: "low", bitrate: 128, label: "SD · 128 kbps", tier: "sd" };
  }, [subscriptionTier]);

  // Fetch flat transcript segments when book changes — used by the sentence boundary guard in the ad hook
  useEffect(() => {
    if (!currentBook) {
      setTranscriptSegments(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/books/${currentBook.id}/transcript`)
      .then(res => res.ok ? res.json() : null)
      .then((records: Array<{ segments: Array<{ start: number; end: number }> }> | null) => {
        if (cancelled || !records) return;
        const flat = records.flatMap(r => r.segments.map(s => ({ start: s.start, end: s.end })));
        setTranscriptSegments(flat.length > 0 ? flat : null);
      })
      .catch(() => { if (!cancelled) setTranscriptSegments(null); });
    return () => { cancelled = true; };
  }, [currentBook?.id]);

  // Instantiate the ad-aware playback hook — owns all ad decision logic for this session.
  // Note: onPlayBookCalled / onChapterBoundary return the ad payload inline as
  // { type: "show-ad"; ad } rather than the string union in the original spec.
  // This eliminates the React async-state-read race that caused currentAd to be null.
  // adFlagsEnabled is read from the audioAdService runtime config (Task #47 will provide
  // a server-side source; until then, the service config acts as the kill-switch layer).
  const adHooks = usePlaybackAdHooks({
    tier: subscriptionTier,
    currentTime,
    transcriptSegments,
    adFlagsEnabled: audioAdService.featureFlags,
  });

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

    // Resolve a pending deferred mid-roll when playback crosses the deferred timestamp
    if (deferredAdRef.current !== null && currentTime >= deferredAdRef.current.time) {
      // Capture and clear before async work so a concurrent timeupdate doesn't re-fire
      const { prevIdx, nextIdx } = deferredAdRef.current;
      deferredAdRef.current = null;
      // Re-evaluate using the original boundary indices that triggered the defer
      adHooks.onChapterBoundary(prevIdx, nextIdx).then((result) => {
        if (typeof result === "object" && result.type === "show-ad") {
          const audio = audioRef.current;
          if (audio && !audio.paused) { audio.pause(); setIsPlaying(false); }
          audioAdService.playAdChime();
          setAdState({ isAdPlaying: true, currentAd: result.ad, adType: "mid-roll" });
        } else if (typeof result === "string" && result.startsWith("defer-to:")) {
          // Sentence still in progress (e.g. overlapping segment) — reschedule
          const deferTime = parseFloat(result.split(":")[1]);
          if (!isNaN(deferTime)) {
            deferredAdRef.current = { time: deferTime, prevIdx, nextIdx };
          }
        }
        // "continue" → do nothing
      });
    }

    if (newIndex !== -1 && newIndex !== currentChapterIndex) {
      if (lastChapterIndex.current !== -1 && newIndex === lastChapterIndex.current + 1) {
        if (onChapterEndCallback.current) {
          onChapterEndCallback.current();
        }

        const prevIdx = lastChapterIndex.current;
        const nextIdx = newIndex;

        // Delay mid-roll check by 500 ms so listeners don't get an ad
        // exactly at the chapter boundary (improves perceived fairness).
        // HOOK: chapter-boundary — mid-roll eligibility checked here, sentence guard applied
        setTimeout(() => {
          adHooks.onChapterBoundary(prevIdx, nextIdx).then((result) => {
            if (typeof result === "object" && result.type === "show-ad") {
              const audio = audioRef.current;
              if (audio && !audio.paused) { audio.pause(); setIsPlaying(false); }
              audioAdService.playAdChime();
              setAdState({ isAdPlaying: true, currentAd: result.ad, adType: "mid-roll" });
            } else if (typeof result === "string" && result.startsWith("defer-to:")) {
              const deferTime = parseFloat(result.split(":")[1]);
              if (!isNaN(deferTime)) {
                // Store original boundary indices so the re-evaluation can use them correctly
                deferredAdRef.current = { time: deferTime, prevIdx, nextIdx };
              }
            }
            // "continue" → do nothing
          });
        }, 500);
      }
      setCurrentChapterIndex(newIndex);
      lastChapterIndex.current = newIndex;
    }
  }, [currentTime, chapters, duration, currentChapterIndex, adHooks]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = !isMuted;
    audio.muted = next;
    setIsMuted(next);
  };

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

  const setSpeed = (speed: number) => {
    const clampedSpeed = Math.max(0.5, Math.min(3.0, speed));
    setPlaybackRate(clampedSpeed);
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

    // Auto-apply default sleep timer when starting a new book (if configured and not already running)
    if (sleepTimerDefaultRef.current !== null && sleepTimerRef.current === null) {
      const minutes = sleepTimerDefaultRef.current;
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
    }

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
    // Signal safety-valve timeout to cancel itself
    document.dispatchEvent(new CustomEvent("accessibooks:ad-resolved"));

    const ad = adState.currentAd;
    const adType = adState.adType;
    setAdState({ isAdPlaying: false, currentAd: null, adType: null });

    if (ad && adType) {
      audioAdService.recordImpression(ad.id, adType, !skipped, skipped, ad.isProgrammatic ? ad.provider : "house");
    }

    // HOOK: ad-resolved — impression recorded, deferred playback resumed
    adHooks.onAdResolved(skipped ? "skipped" : "completed");

    if (adType === "pre-roll" && pendingBookRef.current) {
      startPlaybackForBook(pendingBookRef.current);
      pendingBookRef.current = null;
    } else if (adType === "mid-roll") {
      const audio = audioRef.current;
      if (audio) {
        audio.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }
  }, [adState, startPlaybackForBook, adHooks]);

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

  // Always-current ref so the safety-valve setTimeout can call the latest onAdComplete
  // without being affected by stale closures in playBook.
  const onAdCompleteRef = useRef<(skipped: boolean) => void>(() => {});
  onAdCompleteRef.current = onAdComplete;

  const playBook = async (book: Book) => {
    audioAdService.incrementPlayCount();

    // HOOK: pre-roll eligibility — ad-aware playback hook consulted here
    const decision = await adHooks.onPlayBookCalled();

    if (typeof decision === "object" && decision.type === "show-ad") {
      // HOOK: pre-roll served — ad overlay shown, book playback deferred
      // The ad payload is returned inline to avoid React state-update race.
      pendingBookRef.current = book;
      audioAdService.playAdChime();
      setAdState({ isAdPlaying: true, currentAd: decision.ad, adType: "pre-roll" });

      // Safety valve: if isAdPlaying is set but currentAd stays null after 3 s, resume.
      // Normal ads always have currentAd set synchronously from decision.ad above, so
      // this timer fires only if something truly goes wrong.  The event listener and the
      // timeout both remove the other to prevent listener accumulation on either path.
      let safetyTimerId: ReturnType<typeof setTimeout>;
      const clearSafetyValve = () => {
        clearTimeout(safetyTimerId);
        document.removeEventListener("accessibooks:ad-resolved", clearSafetyValve);
      };
      document.addEventListener("accessibooks:ad-resolved", clearSafetyValve, { once: true });
      safetyTimerId = setTimeout(() => {
        document.removeEventListener("accessibooks:ad-resolved", clearSafetyValve);
        setAdState((prev) => {
          if (prev.isAdPlaying && prev.currentAd === null) {
            console.warn("[AudioContext] Ad state hung (isAdPlaying=true, currentAd=null) after 3 s — resuming");
            onAdCompleteRef.current(false);
          }
          return prev;
        });
      }, 3000);

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

  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true);
      const audio = audioRef.current;
      if (audio && !audio.paused) {
        wasPlayingBeforeOfflineRef.current = true;
        audio.pause();
        setIsPlaying(false);
      } else {
        wasPlayingBeforeOfflineRef.current = false;
      }
    };
    const handleOnline = () => {
      setIsOffline(false);
      if (wasPlayingBeforeOfflineRef.current) {
        wasPlayingBeforeOfflineRef.current = false;
        const audio = audioRef.current;
        if (audio && audio.src) {
          audio.play().then(() => setIsPlaying(true)).catch(() => {});
        }
      }
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  return (
    <AudioContext.Provider
      value={{
        currentBook,
        audioRef,
        isPlaying,
        isMuted,
        currentTime,
        duration,
        playbackRate,
        isLoading,
        isBuffering,
        isOffline,
        sleepTimer,
        sleepTimerRemaining,
        chapters,
        currentChapter: chapters[currentChapterIndex] ?? null,
        currentChapterIndex,
        adState,
        skipAfterMs: audioAdService.skipAfterMs,
        streamQuality,
        bufferedAhead,
        setCurrentBook,
        togglePlayPause,
        toggleMute,
        skip,
        seekTo,
        changeSpeed,
        setSpeed,
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
        adLoading: adHooks.adDecision.pending,
      }}
    >
      <audio ref={audioRef} preload="metadata" crossOrigin="anonymous" />
      {children}
    </AudioContext.Provider>
  );
}
