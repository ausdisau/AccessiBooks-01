import type { Book } from "@shared/schema";

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
}

export interface ReaderSettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export interface PageNavigatorProps {
  currentPage: number;
  totalPages: number;
  onJumpTo: (page: number) => void;
}

export interface ReadingPageProps {
  page: FlipbookPage;
  flipDirection: "none" | "next" | "prev";
  reducedMotion: boolean;
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
