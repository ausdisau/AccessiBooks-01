import type { Book } from "@shared/schema";
import type {
  FlipbookFontFamily,
  FlipbookPreset,
  FlipbookSettings,
  FlipbookTheme,
  FlipbookTypography,
} from "./flipbook-typography";
import type { PageMatch } from "./book-search";
import type { TtsPreferences, TtsState, TtsVoice } from "./tts-service";

export interface FlipbookPage {
  id: string;
  pageNumber: number;
  content: string;
}

export interface FlipbookReaderProps {
  book: Book;
  onBack: () => void;
}

export interface ReaderToolbarProps {
  currentPage: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onToggleSettings: () => void;
  onToggleAnnotations: () => void;
  onToggleShortcuts: () => void;
  settingsOpen: boolean;
  annotationsOpen: boolean;
  shortcutsOpen: boolean;
  settingsButtonRef?: React.Ref<HTMLButtonElement>;
  annotationsButtonRef?: React.Ref<HTMLButtonElement>;
  ttsSupported: boolean;
  ttsState: TtsState;
  onReadAloud: () => void;
  onPauseTts: () => void;
  onResumeTts: () => void;
  onStopTts: () => void;
}

export interface ReaderSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  settings: FlipbookSettings;
  onTypographyChange: (patch: Partial<FlipbookTypography>) => void;
  onFontFamilyChange: (font: FlipbookFontFamily) => void;
  onThemeChange: (theme: FlipbookTheme) => void;
  onPresetChange: (preset: FlipbookPreset) => void;
  onResetDefaults: () => void;
  ttsSupported: boolean;
  ttsVoices: TtsVoice[];
  ttsPrefs: TtsPreferences;
  onTtsPrefsChange: (patch: Partial<TtsPreferences>) => void;
}

export interface PageNavigatorProps {
  currentPage: number;
  totalPages: number;
  onJumpTo: (page: number) => void;
  onPrev: () => void;
  onNext: () => void;
}

export interface ReadingPageProps {
  page: FlipbookPage;
  flipDirection: "none" | "next" | "prev";
  reducedMotion: boolean;
  typography: FlipbookTypography;
  highlightMatches: PageMatch[];
  contentRef?: React.Ref<HTMLDivElement>;
}

export interface AnnotationPanelProps {
  open: boolean;
  onClose: () => void;
}

export interface KeyboardShortcutHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface LiveStatusRegionProps {
  message: string;
}
