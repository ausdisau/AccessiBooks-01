import { BookOpen, Calendar, ExternalLink, User, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAuthor, useAuthorWorks } from "@/hooks/use-reviews";

interface AuthorPageProps {
  authorName: string;
  onBack?: () => void;
}

function AuthorBio({ authorName }: { authorName: string }) {
  const { data: author, isLoading, error } = useAuthor(authorName);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-6">
            <Skeleton className="h-32 w-32 rounded-full" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-20 w-full" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !author) {
    return (
      <Card>
        <CardContent className="pt-6 text-center py-12">
          <User className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-xl font-semibold mb-2">{authorName}</h2>
          <p className="text-muted-foreground">Author information not available</p>
        </CardContent>
      </Card>
    );
  }

  const initials = author.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col md:flex-row gap-6">
          <Avatar className="h-32 w-32 mx-auto md:mx-0">
            <AvatarImage src={author.photoUrl || undefined} alt={author.name} />
            <AvatarFallback className="text-3xl">{initials}</AvatarFallback>
          </Avatar>
          
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-2xl font-bold mb-2">{author.name}</h1>
            
            {(author.birthDate || author.deathDate) && (
              <div className="flex items-center justify-center md:justify-start gap-2 text-muted-foreground mb-3">
                <Calendar className="h-4 w-4" />
                <span>
                  {author.birthDate || "Unknown"} – {author.deathDate || "Present"}
                </span>
              </div>
            )}
            
            {author.bio && (
              <p className="text-muted-foreground leading-relaxed">{author.bio}</p>
            )}
            
            {author.wikipedia && (
              <a
                href={author.wikipedia}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-3 text-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                Wikipedia
              </a>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AuthorWorks({ authorName }: { authorName: string }) {
  const { data, isLoading } = useAuthorWorks(authorName);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Works by {authorName}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-[2/3] w-full rounded-lg" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const works = data?.works || [];

  if (works.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Works by {authorName}</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <BookOpen className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">No works found in the catalog</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Works by {authorName}
          <span className="text-sm font-normal text-muted-foreground">({works.length} found)</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {works.map((work) => (
            <div key={work.key} className="group">
              <div className="aspect-[2/3] bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden mb-2">
                {work.coverUrl ? (
                  <img
                    src={work.coverUrl}
                    alt={work.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <BookOpen className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
              </div>
              <h3 className="font-medium text-sm line-clamp-2 group-hover:text-primary transition-colors">
                {work.title}
              </h3>
              {work.firstPublishYear && (
                <p className="text-xs text-muted-foreground">{work.firstPublishYear}</p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function AuthorPage({ authorName, onBack }: AuthorPageProps) {
  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-6">
      {onBack && (
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      )}
      <AuthorBio authorName={authorName} />
      <AuthorWorks authorName={authorName} />
    </div>
  );
}

export { AuthorBio, AuthorWorks };
