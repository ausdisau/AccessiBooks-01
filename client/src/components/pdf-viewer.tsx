import { useState, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Book } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn,
  ZoomOut,
  Home,
  Bookmark,
  FileText
} from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  book: Book;
  onBack: () => void;
}

export function PdfViewer({ book, onBack }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const completionFiredRef = useRef(false);

  const pdfUrl = `/api/ebook/${book.id}/content`;

  useEffect(() => {
    completionFiredRef.current = false;
    loadBookmarks();
  }, [book.id]);

  // Fire completion event when user reaches the last page for the first time
  useEffect(() => {
    if (!completionFiredRef.current && numPages >= 1 && currentPage === numPages && !isLoading) {
      completionFiredRef.current = true;
      document.dispatchEvent(
        new CustomEvent("accessibooks:book-completed", {
          detail: {
            bookId: book.id,
            bookTitle: book.title,
            bookAuthor: book.author,
            bookCover: book.coverImage,
            contentType: "ebook",
          },
        }),
      );
    }
  }, [currentPage, numPages, isLoading, book]);

  const loadBookmarks = () => {
    const saved = localStorage.getItem(`pdf-bookmarks-${book.id}`);
    if (saved) {
      setBookmarks(JSON.parse(saved));
    }
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setIsLoading(false);
    
    const savedPage = localStorage.getItem(`pdf-progress-${book.id}`);
    if (savedPage) {
      setCurrentPage(parseInt(savedPage, 10));
    }
  };

  const onDocumentLoadError = (error: Error) => {
    console.error("PDF load error:", error);
    setError("Unable to load PDF. Please try again later.");
    setIsLoading(false);
  };

  const goToPage = (page: number) => {
    const newPage = Math.max(1, Math.min(numPages, page));
    setCurrentPage(newPage);
    localStorage.setItem(`pdf-progress-${book.id}`, newPage.toString());
  };

  const toggleBookmark = () => {
    const newBookmarks = bookmarks.includes(currentPage)
      ? bookmarks.filter(p => p !== currentPage)
      : [...bookmarks, currentPage].sort((a, b) => a - b);
    
    setBookmarks(newBookmarks);
    localStorage.setItem(`pdf-bookmarks-${book.id}`, JSON.stringify(newBookmarks));
  };

  const zoomIn = () => setScale(prev => Math.min(2.5, prev + 0.25));
  const zoomOut = () => setScale(prev => Math.max(0.5, prev - 0.25));

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={onBack}>
              <Home className="h-4 w-4 mr-2" />
              Back to Library
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <header className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button variant="ghost" onClick={onBack} aria-label="Back to library">
            <ChevronLeft className="h-5 w-5 mr-1" />
            Back
          </Button>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={zoomOut} aria-label="Zoom out">
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm min-w-[60px] text-center">{Math.round(scale * 100)}%</span>
              <Button variant="outline" size="icon" onClick={zoomIn} aria-label="Zoom in">
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
            
            <span className="text-sm text-gray-600 dark:text-gray-300">
              Page {currentPage} of {numPages || "..."}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={toggleBookmark}
              aria-label={bookmarks.includes(currentPage) ? "Remove bookmark" : "Add bookmark"}
            >
              <Bookmark 
                className={`h-5 w-5 ${bookmarks.includes(currentPage) ? "fill-primary text-primary" : ""}`} 
              />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto py-6 px-4">
        {isLoading && (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <FileText className="h-12 w-12 animate-pulse text-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Loading PDF...</p>
            </div>
          </div>
        )}

        <div className="flex justify-center">
          <Document
            file={pdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={null}
          >
            <Page 
              pageNumber={currentPage} 
              scale={scale}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              className="shadow-lg"
            />
          </Document>
        </div>

        <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 rounded-full shadow-lg px-4 py-2 flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={currentPage}
              onChange={(e) => goToPage(parseInt(e.target.value, 10) || 1)}
              className="w-16 text-center border rounded px-2 py-1 text-sm"
              min={1}
              max={numPages}
              aria-label="Current page"
            />
            <span className="text-sm text-gray-500">/ {numPages}</span>
          </div>
          
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= numPages}
            aria-label="Next page"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </nav>
      </main>
    </div>
  );
}
