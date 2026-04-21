import { useState, useEffect } from "react";
import { Headphones, BookOpen, Newspaper } from "lucide-react";

interface BookCoverProps {
  bookId: string;
  coverImage: string | null;
  title: string;
  contentType?: string;
  className?: string;
  iconSize?: string;
}

const contentTypeIcons = {
  audiobook: Headphones,
  ebook: BookOpen,
  magazine: Newspaper,
};

export function BookCover({ 
  bookId, 
  coverImage, 
  title, 
  contentType = "audiobook",
  className = "w-full h-48 object-cover rounded-md",
  iconSize = "h-12 w-12"
}: BookCoverProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(coverImage);
  const [imageError, setImageError] = useState(false);

  const TypeIcon = contentTypeIcons[contentType as keyof typeof contentTypeIcons] || Headphones;

  useEffect(() => {
    setImageSrc(coverImage);
    setImageError(false);
  }, [coverImage, bookId]);

  const handleImageError = () => {
    if (!imageError) {
      setImageError(true);
    }
  };

  if (imageSrc && !imageError) {
    return (
      <img
        src={imageSrc}
        alt={`${title} book cover`}
        className={className}
        onError={handleImageError}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <div className={`bg-muted rounded-md flex items-center justify-center ${className.replace(/object-cover|object-contain/g, '')}`}>
      <TypeIcon className={`${iconSize} text-muted-foreground`} />
    </div>
  );
}
