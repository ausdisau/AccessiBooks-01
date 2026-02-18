import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Search, ExternalLink, Headphones, Star, Music, PlayCircle, Clock, DollarSign, BookOpen, Download } from "lucide-react";
import { SiSpotify, SiSoundcloud, SiGoogleplay } from "react-icons/si";

interface SpotifyAudiobook {
  id: string;
  title: string;
  author: string;
  coverImage: string;
  audioUrl: string;
  genre: string;
  source: string;
}

interface AmazonAudiobook {
  asin: string;
  title: string;
  authors: string[];
  coverUrl: string;
  price?: string;
  rating?: number;
  reviewCount?: number;
  detailPageUrl: string;
  narrator?: string;
  duration?: string;
}

interface SoundCloudTrack {
  id: number;
  title: string;
  description: string;
  artist: string;
  artistId: number;
  artworkUrl: string;
  duration: number;
  genre: string;
  tags: string;
  permalinkUrl: string;
  streamUrl: string;
  waveformUrl: string;
  playbackCount: number;
  likesCount: number;
  commentCount: number;
  createdAt: string;
  source: "soundcloud";
}

interface GooglePlayAudiobook {
  productId: string;
  title: string;
  authors: string[];
  coverUrl: string;
  rating?: number;
  reviewCount?: number;
  price?: string;
  originalPrice?: string;
  extractedPrice?: number;
  duration?: string;
  narrator?: string;
  released?: string;
  link: string;
  source: "google_play";
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function SpotifySection() {
  const [query, setQuery] = useState("bestseller");
  const [searchInput, setSearchInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: statusData } = useQuery<{ connected: boolean }>({
    queryKey: ["/api/spotify/status"],
    staleTime: 60000,
  });

  const { data: results = [], isLoading, isError } = useQuery<SpotifyAudiobook[]>({
    queryKey: ["/api/spotify/search", query],
    queryFn: async () => {
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error("Spotify search failed");
      return res.json();
    },
    enabled: !!statusData?.connected && !!query,
    staleTime: 300000,
    retry: 1,
  });

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -300 : 300,
      behavior: "smooth",
    });
  };

  const handleSearch = () => {
    if (searchInput.trim()) {
      setQuery(searchInput.trim());
    }
  };

  if (!statusData?.connected || isError) return null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <SiSpotify className="h-5 w-5 text-green-500" />
          Spotify Audiobooks
        </h3>
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-[180px]">
              <Skeleton className="h-[220px] w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (results.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <SiSpotify className="h-5 w-5 text-green-500" />
          Spotify Audiobooks
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Input
              placeholder="Search audiobooks..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="h-8 w-48 text-sm"
            />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSearch}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => scroll("left")}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => scroll("right")}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {results.map((item) => (
          <a
            key={item.id}
            href={item.audioUrl || `https://open.spotify.com/search/${encodeURIComponent(item.title)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 w-[180px] block"
          >
            <Card className="hover:shadow-lg transition-shadow cursor-pointer group h-full">
              <CardContent className="p-3">
                <div className="relative">
                  {item.coverImage ? (
                    <img
                      src={item.coverImage}
                      alt={item.title}
                      className="w-full h-[160px] object-cover rounded-md mb-2"
                    />
                  ) : (
                    <div className="w-full h-[160px] bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900 dark:to-green-800 rounded-md mb-2 flex items-center justify-center">
                      <Headphones className="h-12 w-12 text-green-500/50" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-center justify-center">
                    <ExternalLink className="h-8 w-8 text-white" />
                  </div>
                  <Badge className="absolute top-2 left-2 text-xs bg-green-500 text-white">
                    <SiSpotify className="h-3 w-3 mr-1" />
                    Spotify
                  </Badge>
                </div>
                <h4 className="text-sm font-medium line-clamp-2">{item.title}</h4>
                <p className="text-xs text-muted-foreground line-clamp-1">{item.author}</p>
                <div className="mt-2 flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:underline">
                  <Music className="h-3 w-3" />
                  Listen on Spotify
                </div>
              </CardContent>
            </Card>
          </a>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {["bestseller", "fiction", "thriller", "self-help", "sci-fi", "history", "biography"].map((cat) => (
          <Button
            key={cat}
            variant={query === cat ? "default" : "outline"}
            size="sm"
            className="text-xs h-7"
            onClick={() => setQuery(cat)}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </Button>
        ))}
      </div>
    </div>
  );
}

function AmazonSection() {
  const [query, setQuery] = useState("bestseller audiobook");
  const [searchInput, setSearchInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: statusData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/amazon/status"],
    staleTime: 60000,
  });

  const { data: searchData, isLoading, isError } = useQuery<{ results: AmazonAudiobook[] }>({
    queryKey: ["/api/amazon/search", query],
    queryFn: async () => {
      const res = await fetch(`/api/amazon/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error("Amazon search failed");
      return res.json();
    },
    enabled: !!statusData?.enabled && !!query,
    staleTime: 300000,
    retry: 1,
  });

  const results = searchData?.results || [];

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -300 : 300,
      behavior: "smooth",
    });
  };

  const handleSearch = () => {
    if (searchInput.trim()) {
      setQuery(searchInput.trim());
    }
  };

  if (!statusData?.enabled || isError) return null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Headphones className="h-5 w-5 text-orange-500" />
          Audible Audiobooks
        </h3>
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-[180px]">
              <Skeleton className="h-[280px] w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (results.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Headphones className="h-5 w-5 text-orange-500" />
          Audible Audiobooks
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Input
              placeholder="Search Audible..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="h-8 w-48 text-sm"
            />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSearch}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => scroll("left")}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => scroll("right")}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {results.map((item) => (
          <a
            key={item.asin}
            href={item.detailPageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 w-[180px] block"
          >
            <Card className="hover:shadow-lg transition-shadow cursor-pointer group h-full">
              <CardContent className="p-3">
                <div className="relative">
                  {item.coverUrl ? (
                    <img
                      src={item.coverUrl}
                      alt={item.title}
                      className="w-full h-[160px] object-cover rounded-md mb-2"
                    />
                  ) : (
                    <div className="w-full h-[160px] bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-900 dark:to-orange-800 rounded-md mb-2 flex items-center justify-center">
                      <Headphones className="h-12 w-12 text-orange-500/50" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-center justify-center">
                    <ExternalLink className="h-8 w-8 text-white" />
                  </div>
                  <Badge className="absolute top-2 left-2 text-xs bg-orange-500 text-white">
                    Audible
                  </Badge>
                </div>
                <h4 className="text-sm font-medium line-clamp-2">{item.title || "Untitled"}</h4>
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {(item.authors || []).join(", ") || "Unknown Author"}
                </p>
                {item.narrator && (
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    Narrated by {item.narrator}
                  </p>
                )}
                <div className="flex items-center justify-between mt-2">
                  {item.rating != null && item.rating > 0 && (
                    <div className="flex items-center gap-1">
                      <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                      <span className="text-xs">{item.rating.toFixed(1)}</span>
                    </div>
                  )}
                  {item.price && (
                    <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">
                      {item.price}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 hover:underline">
                  <ExternalLink className="h-3 w-3" />
                  Get on Audible
                </div>
              </CardContent>
            </Card>
          </a>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {["bestseller", "fiction", "thriller", "mystery", "romance", "fantasy", "business"].map((cat) => (
          <Button
            key={cat}
            variant={query === cat + " audiobook" ? "default" : "outline"}
            size="sm"
            className="text-xs h-7"
            onClick={() => setQuery(cat + " audiobook")}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </Button>
        ))}
      </div>
    </div>
  );
}

function SoundCloudSection() {
  const [query, setQuery] = useState("audiobook");
  const [searchInput, setSearchInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: statusData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/soundcloud/status"],
    staleTime: 60000,
  });

  const { data: searchData, isLoading, isError } = useQuery<{ results: SoundCloudTrack[] }>({
    queryKey: ["/api/soundcloud/search", query],
    queryFn: async () => {
      const res = await fetch(`/api/soundcloud/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error("SoundCloud search failed");
      return res.json();
    },
    enabled: !!statusData?.enabled && !!query,
    staleTime: 300000,
    retry: 1,
  });

  const results = searchData?.results || [];

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -300 : 300,
      behavior: "smooth",
    });
  };

  const handleSearch = () => {
    if (searchInput.trim()) {
      setQuery(searchInput.trim());
    }
  };

  if (!statusData?.enabled || isError) return null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <SiSoundcloud className="h-5 w-5 text-orange-600" />
          SoundCloud Audio
        </h3>
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-[180px]">
              <Skeleton className="h-[280px] w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (results.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <SiSoundcloud className="h-5 w-5 text-orange-600" />
          SoundCloud Audio
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Input
              placeholder="Search SoundCloud..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="h-8 w-48 text-sm"
            />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSearch}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => scroll("left")}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => scroll("right")}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {results.map((item) => (
          <a
            key={item.id}
            href={item.permalinkUrl || `https://soundcloud.com/search?q=${encodeURIComponent(item.title)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 w-[180px] block"
          >
            <Card className="hover:shadow-lg transition-shadow cursor-pointer group h-full">
              <CardContent className="p-3">
                <div className="relative">
                  {item.artworkUrl ? (
                    <img
                      src={item.artworkUrl}
                      alt={item.title}
                      className="w-full h-[160px] object-cover rounded-md mb-2"
                    />
                  ) : (
                    <div className="w-full h-[160px] bg-gradient-to-br from-orange-100 to-red-200 dark:from-orange-900 dark:to-red-800 rounded-md mb-2 flex items-center justify-center">
                      <Headphones className="h-12 w-12 text-orange-500/50" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-center justify-center">
                    <ExternalLink className="h-8 w-8 text-white" />
                  </div>
                  <Badge className="absolute top-2 left-2 text-xs bg-orange-600 text-white">
                    <SiSoundcloud className="h-3 w-3 mr-1" />
                    SoundCloud
                  </Badge>
                </div>
                <h4 className="text-sm font-medium line-clamp-2">{item.title}</h4>
                <p className="text-xs text-muted-foreground line-clamp-1">{item.artist}</p>
                {item.genre && (
                  <p className="text-xs text-muted-foreground line-clamp-1">{item.genre}</p>
                )}
                <div className="flex items-center justify-between mt-1">
                  {item.duration > 0 && (
                    <span className="text-xs text-muted-foreground">{formatDuration(item.duration)}</span>
                  )}
                  {item.playbackCount > 0 && (
                    <span className="text-xs text-muted-foreground">{formatCount(item.playbackCount)} plays</span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 hover:underline">
                  <Music className="h-3 w-3" />
                  Listen on SoundCloud
                </div>
              </CardContent>
            </Card>
          </a>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {["audiobook", "podcast", "spoken word", "storytelling", "comedy", "education", "ambient", "classical"].map((cat) => (
          <Button
            key={cat}
            variant={query === cat ? "default" : "outline"}
            size="sm"
            className="text-xs h-7"
            onClick={() => setQuery(cat)}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </Button>
        ))}
      </div>
    </div>
  );
}

function GooglePlaySection() {
  const [query, setQuery] = useState("bestseller audiobook");
  const [searchInput, setSearchInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: statusData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/google-play/status"],
    staleTime: 60000,
  });

  const { data: searchData, isLoading, isError } = useQuery<{ results: GooglePlayAudiobook[] }>({
    queryKey: ["/api/google-play/search", query],
    queryFn: async () => {
      const res = await fetch(`/api/google-play/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error("Google Play search failed");
      return res.json();
    },
    enabled: !!statusData?.enabled && !!query,
    staleTime: 300000,
    retry: 1,
  });

  const results = searchData?.results || [];

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -300 : 300,
      behavior: "smooth",
    });
  };

  const handleSearch = () => {
    if (searchInput.trim()) {
      setQuery(searchInput.trim());
    }
  };

  if (!statusData?.enabled || isError) return null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <SiGoogleplay className="h-5 w-5 text-blue-500" />
          Google Play Audiobooks
        </h3>
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-[180px]">
              <Skeleton className="h-[280px] w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (results.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <SiGoogleplay className="h-5 w-5 text-blue-500" />
          Google Play Audiobooks
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Input
              placeholder="Search Google Play..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="h-8 w-48 text-sm"
            />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSearch}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => scroll("left")}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => scroll("right")}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {results.map((item) => (
          <a
            key={item.productId}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 w-[180px] block"
          >
            <Card className="hover:shadow-lg transition-shadow cursor-pointer group h-full">
              <CardContent className="p-3">
                <div className="relative">
                  {item.coverUrl ? (
                    <img
                      src={item.coverUrl}
                      alt={item.title}
                      className="w-full h-[160px] object-cover rounded-md mb-2"
                    />
                  ) : (
                    <div className="w-full h-[160px] bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800 rounded-md mb-2 flex items-center justify-center">
                      <Headphones className="h-12 w-12 text-blue-500/50" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-center justify-center">
                    <ExternalLink className="h-8 w-8 text-white" />
                  </div>
                  <Badge className="absolute top-2 left-2 text-xs bg-blue-500 text-white">
                    <SiGoogleplay className="h-3 w-3 mr-1" />
                    Google Play
                  </Badge>
                </div>
                <h4 className="text-sm font-medium line-clamp-2">{item.title}</h4>
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {item.authors.join(", ") || "Unknown Author"}
                </p>
                {item.narrator && (
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    Narrated by {item.narrator}
                  </p>
                )}
                {item.duration && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <Clock className="h-3 w-3" />
                    {item.duration}
                  </p>
                )}
                <div className="flex items-center justify-between mt-1">
                  {item.rating != null && item.rating > 0 && (
                    <div className="flex items-center gap-1">
                      <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                      <span className="text-xs">{item.rating.toFixed(1)}</span>
                      {item.reviewCount != null && item.reviewCount > 0 && (
                        <span className="text-xs text-muted-foreground">({formatCount(item.reviewCount)})</span>
                      )}
                    </div>
                  )}
                  {item.price && (
                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                      {item.price}
                    </span>
                  )}
                </div>
                {item.originalPrice && item.price && item.originalPrice !== item.price && (
                  <span className="text-xs text-muted-foreground line-through">
                    {item.originalPrice}
                  </span>
                )}
                <div className="mt-2 flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                  <PlayCircle className="h-3 w-3" />
                  Get on Google Play
                </div>
              </CardContent>
            </Card>
          </a>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {["bestseller", "fiction", "thriller", "mystery", "romance", "sci-fi", "biography", "self-help"].map((cat) => (
          <Button
            key={cat}
            variant={query === cat + " audiobook" ? "default" : "outline"}
            size="sm"
            className="text-xs h-7"
            onClick={() => setQuery(cat + " audiobook")}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </Button>
        ))}
      </div>
    </div>
  );
}

interface NordicApiEbook {
  id: string;
  title: string;
  description: string;
  coverUrl: string;
  category: string;
  formats: { label: string; url: string }[];
}

const nordicApisEbooks: NordicApiEbook[] = [
  {
    id: "developer-experience",
    title: "Developer Experience",
    description: "Top advice on improving API developer experience. Explore tips to streamline discovery and onboarding, make your API more self-service, and best practices around documentation, sandboxes, and sample code.",
    coverUrl: "https://nordicapis.com/wp-content/uploads/developer-experience-ebook-683x1024.png",
    category: "developer",
    formats: [
      { label: "LeanPub", url: "https://leanpub.com/developer-experience" },
      { label: "Kindle", url: "https://www.amazon.com/dp/B0BC35FRJ2" },
      { label: "PDF", url: "https://nordicapis.com/wp-content/uploads/Developer-Experience-v2.1.pdf" },
      { label: "EPUB", url: "https://nordicapis.com/wp-content/uploads/Developer-Experience-v2.1.epub" },
    ],
  },
  {
    id: "api-as-a-product",
    title: "API-as-a-Product",
    description: "Tips to help you create a working business model around a specialized public API. Discover common monetization models, developer marketing tips, and more helpful business advice for API-centric SaaS.",
    coverUrl: "https://nordicapis.com/wp-content/uploads/API-as-a-Product-eBook-Cover-683x1024.png",
    category: "business",
    formats: [
      { label: "LeanPub", url: "https://leanpub.com/apiasaproduct/" },
      { label: "Kindle", url: "https://www.amazon.com/API-Product-Running-API-centric-Business-ebook/dp/B096WHVSMQ/" },
      { label: "PDF", url: "https://nordicapis.com/wp-content/uploads/API-as-a-Product-v2.1.pdf" },
      { label: "MOBI", url: "https://nordicapis.com/wp-content/uploads/API-as-a-Product.mobi" },
      { label: "EPUB", url: "https://nordicapis.com/wp-content/uploads/API-as-a-Product-v2.1.epub" },
    ],
  },
  {
    id: "identity-and-apis",
    title: "Identity and APIs",
    description: "Discover techniques to secure platform access and delegate access throughout a mature API ecosystem, incorporating concepts like OAuth, OpenID Connect, and the API Security Maturity Model.",
    coverUrl: "https://nordicapis.com/wp-content/uploads/Identity-and-APIs-Cover-683x1024.jpg",
    category: "security",
    formats: [
      { label: "LeanPub", url: "https://leanpub.com/identityandapis/" },
      { label: "PDF", url: "https://nordicapis.com/wp-content/uploads/Identity-And-APIs-v2.1.pdf" },
      { label: "MOBI", url: "https://nordicapis.com/wp-content/uploads/Identity-and-APIs-Nordic-APIs-ebook-v1.3.mobi" },
      { label: "EPUB", url: "https://nordicapis.com/wp-content/uploads/Identity-And-APIs-v2.1.epub" },
    ],
  },
  {
    id: "api-strategy-open-banking",
    title: "API Strategy for Open Banking",
    description: "A holistic API perspective on open banking covering PSD2, developer experience tips, frameworks for high-grade security and access management, plus best practices and case studies from the world's largest open banking initiatives.",
    coverUrl: "https://nordicapis.com/wp-content/uploads/API-Strategy-for-Open-Banking-cover-683x1024.jpg",
    category: "business",
    formats: [
      { label: "LeanPub", url: "https://leanpub.com/API-Strategy-for-Open-Banking/" },
      { label: "Kindle", url: "https://www.amazon.com/dp/B08BBL88SK" },
      { label: "PDF", url: "https://nordicapis.com/wp-content/uploads/API-Strategy-for-Open-Banking-v2.2.pdf" },
      { label: "MOBI", url: "https://nordicapis.com/wp-content/uploads/API-Strategy-for-Open-Banking-v2.mobi" },
      { label: "EPUB", url: "https://nordicapis.com/wp-content/uploads/API-Strategy-for-Open-Banking-v2.2.epub" },
    ],
  },
  {
    id: "strategies-microservices",
    title: "Strategies For Microservices Architecture",
    description: "Microservices are a vital component to modern web API discussion. This compilation addresses the top insights and best practices surrounding microservices design.",
    coverUrl: "https://nordicapis.com/wp-content/uploads/Strategies-For-Microservices-Architecture-704x1024.png",
    category: "architecture",
    formats: [
      { label: "LeanPub", url: "https://leanpub.com/microservices-architecture/" },
    ],
  },
  {
    id: "graphql-or-bust",
    title: "GraphQL or Bust",
    description: "Determine the position of GraphQL within the API ecosystem. Explore benefits, differences between GraphQL and REST, nuanced security concerns, extending GraphQL with additional tooling, and more.",
    coverUrl: "https://nordicapis.com/wp-content/uploads/Graphql-or-bust-cover-1-704x1024.png",
    category: "architecture",
    formats: [
      { label: "LeanPub", url: "https://leanpub.com/graphql/" },
      { label: "PDF", url: "https://nordicapis.com/wp-content/uploads/GraphQL-or-Bust-v2.2.pdf" },
      { label: "MOBI", url: "https://nordicapis.com/wp-content/uploads/GraphQL-or-Bust-2018.mobi" },
      { label: "EPUB", url: "https://nordicapis.com/wp-content/uploads/GraphQL-or-Bust-v2.2.epub" },
    ],
  },
  {
    id: "api-design-decades",
    title: "API Design on the Scale of Decades",
    description: "Expert insights from the 2016 Nordic APIs Platform Summit, dedicated to the theme of architecting and designing APIs on the scale of decades.",
    coverUrl: "https://nordicapis.com/wp-content/uploads/ages_ebook.png",
    category: "architecture",
    formats: [
      { label: "LeanPub", url: "https://leanpub.com/API-Design/" },
      { label: "Kindle", url: "https://www.amazon.com/dp/B06XZS8KHK" },
      { label: "PDF", url: "https://nordicapis.com/wp-content/uploads/API-Design-on-the-Scale-of-Decades-v2.2.pdf" },
      { label: "MOBI", url: "https://nordicapis.com/wp-content/uploads/API-Design-on-the-scale-of-Decades.mobi" },
      { label: "EPUB", url: "https://nordicapis.com/wp-content/uploads/API-Design-on-the-Scale-of-Decades-v2.2.epub" },
    ],
  },
  {
    id: "how-to-market-api",
    title: "How to Successfully Market an API",
    description: "The bible for project managers, technical evangelists, or marketing aficionados promoting an API program. Learn how to plan an API-first business, make it discoverable, promote it to press and developer networks.",
    coverUrl: "https://nordicapis.com/wp-content/uploads/how-to-market-an-api-704x1024.png",
    category: "business",
    formats: [
      { label: "LeanPub", url: "https://leanpub.com/how-to-market-an-API/" },
      { label: "Kindle", url: "https://www.amazon.com/How-Successfully-Market-API-Fine-tuning-ebook/dp/B01LZDE3GK/" },
      { label: "PDF", url: "https://nordicapis.com/wp-content/uploads/How-to-Successfully-Market-an-API-v2.2.pdf" },
      { label: "MOBI", url: "https://nordicapis.com/wp-content/uploads/how-to-market-an-API.mobi" },
      { label: "EPUB", url: "https://nordicapis.com/wp-content/uploads/How-to-Successfully-Market-an-API-v2.2.epub" },
    ],
  },
  {
    id: "api-driven-devops",
    title: "API-Driven DevOps",
    description: "Learn about Continuous Integration tooling, Configuration Management, Docker Containers, and an API-driven approach to uniting development and delivery in the age of cloud computing.",
    coverUrl: "https://nordicapis.com/wp-content/uploads/title_page-1-704x1024.png",
    category: "developer",
    formats: [
      { label: "LeanPub", url: "https://leanpub.com/api-driven-devops/" },
      { label: "Kindle", url: "https://www.amazon.com/API-Driven-DevOps-Strategies-Continuous-Deployment-ebook/dp/B01GP0Y5XQ/" },
      { label: "PDF", url: "https://nordicapis.com/wp-content/uploads/API-Driven-DevOps-v2.2.pdf" },
      { label: "MOBI", url: "https://nordicapis.com/wp-content/uploads/api-driven-devops.mobi" },
      { label: "EPUB", url: "https://nordicapis.com/wp-content/uploads/API-Driven-DevOps-v2.2.epub" },
    ],
  },
  {
    id: "the-api-economy",
    title: "The API Economy",
    description: "Explore how agile businesses are using APIs to disrupt industries and outperform competitors. Track the historical progression of the space, forecast future trends, and examine the key players.",
    coverUrl: "https://nordicapis.com/wp-content/uploads/title_page-medium-500px.png",
    category: "business",
    formats: [
      { label: "LeanPub", url: "https://leanpub.com/the-API-economy/" },
      { label: "Kindle", url: "https://www.amazon.com/API-Economy-Disruption-Business-APIs-ebook/dp/B01F2PIP3Q/" },
      { label: "PDF", url: "https://nordicapis.com/wp-content/uploads/The-API-Economy-v2.2.pdf" },
      { label: "MOBI", url: "https://nordicapis.com/wp-content/uploads/theapieconomy.mobi" },
      { label: "EPUB", url: "https://nordicapis.com/wp-content/uploads/The-API-Economy-v2.2.epub" },
    ],
  },
  {
    id: "spark-web-framework",
    title: "Programming APIs with the Spark Web Framework",
    description: "Master Spark Java, a free open-source microframework for developing powerful APIs alongside JVM-based programming languages. Includes extensive code samples demonstrating Scala and Java usage.",
    coverUrl: "https://nordicapis.com/wp-content/uploads/spark_ebook_final_large-704x1024.png",
    category: "developer",
    formats: [
      { label: "LeanPub", url: "https://leanpub.com/using-spark-java-to-program-apis" },
      { label: "Kindle", url: "https://www.amazon.com/Programming-APIs-With-Spark-Framework-ebook/dp/B017OLT37I" },
      { label: "PDF", url: "https://nordicapis.com/wp-content/uploads/using-spark-java-to-program-apis.pdf" },
      { label: "MOBI", url: "https://nordicapis.com/wp-content/uploads/using-spark-java-to-program-apis.mobi" },
      { label: "EPUB", url: "https://nordicapis.com/wp-content/uploads/using-spark-java-to-program-apis.epub" },
    ],
  },
  {
    id: "securing-api-stronghold",
    title: "Securing the API Stronghold",
    description: "Vital advice on digital security for APIs and microservices. Outlines security stacks and workflows using modern technologies to ensure your digital assets are securely distributed.",
    coverUrl: "https://nordicapis.com/wp-content/uploads/security_ebook_final-01-704x1024.png",
    category: "security",
    formats: [
      { label: "LeanPub", url: "https://leanpub.com/securing-the-api-stronghold" },
      { label: "PDF", url: "https://nordicapis.com/wp-content/uploads/securing-the-api-stronghold.pdf" },
      { label: "MOBI", url: "https://nordicapis.com/wp-content/uploads/securing-the-api-stronghold.mobi" },
      { label: "EPUB", url: "https://nordicapis.com/wp-content/uploads/securing-the-api-stronghold.epub" },
    ],
  },
  {
    id: "the-api-lifecycle",
    title: "The API Lifecycle",
    description: "The common API lifecycle boiled down into four main phases, helping API practitioners stabilize their API against internal and external factors through small revisions and iterative feedback.",
    coverUrl: "https://nordicapis.com/wp-content/uploads/lifecycle_ebook_medium-704x1024.png",
    category: "architecture",
    formats: [
      { label: "LeanPub", url: "https://leanpub.com/api-lifecycle" },
      { label: "Kindle", url: "https://www.amazon.com/The-API-Lifecycle-Process-Managing-ebook/dp/B011ACJ368" },
      { label: "PDF", url: "https://nordicapis.com/wp-content/uploads/theapilifecycle.pdf" },
      { label: "MOBI", url: "https://nordicapis.com/wp-content/uploads/theapilifecycle.mobi" },
      { label: "EPUB", url: "https://nordicapis.com/wp-content/uploads/theapilifecycle.epub" },
    ],
  },
  {
    id: "developing-api-mindset",
    title: "Developing The API Mindset",
    description: "A taxonomy for API types with insightful business strategies for Private, Partner, and Public APIs. Reorient your business culture towards a platform model and composable enterprise identity.",
    coverUrl: "https://nordicapis.com/wp-content/uploads/mindset_ebook_final.png",
    category: "business",
    formats: [
      { label: "LeanPub", url: "https://leanpub.com/developingtheapimindset" },
      { label: "PDF", url: "https://nordicapis.com/wp-content/uploads/Developing-the-API-Mindset-v2.2.pdf" },
      { label: "MOBI", url: "https://nordicapis.com/wp-content/uploads/developingtheapimindset.mobi" },
      { label: "EPUB", url: "https://nordicapis.com/wp-content/uploads/Developing-the-API-Mindset-v2.2.epub" },
    ],
  },
];

const nordicCategories = [
  { key: "all", label: "All" },
  { key: "business", label: "Business" },
  { key: "architecture", label: "Architecture" },
  { key: "security", label: "Security" },
  { key: "developer", label: "Developer" },
];

function NordicApisSection() {
  const [category, setCategory] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = nordicApisEbooks.filter((book) => {
    const matchesCategory = category === "all" || book.category === category;
    const matchesSearch = !searchInput.trim() || book.title.toLowerCase().includes(searchInput.toLowerCase()) || book.description.toLowerCase().includes(searchInput.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -300 : 300,
      behavior: "smooth",
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-purple-500" />
          Nordic APIs eBooks
          <Badge variant="secondary" className="text-xs">Free</Badge>
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Input
              placeholder="Search eBooks..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-8 w-48 text-sm"
            />
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => scroll("left")}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => scroll("right")}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {filtered.map((book) => (
          <div key={book.id} className="flex-shrink-0 w-[200px]">
            <Card className="hover:shadow-lg transition-shadow h-full">
              <CardContent className="p-3">
                <div className="relative">
                  <img
                    src={book.coverUrl}
                    alt={book.title}
                    className="w-full h-[200px] object-contain rounded-md mb-2 bg-gray-50 dark:bg-gray-900"
                  />
                  <Badge className="absolute top-2 left-2 text-xs bg-purple-600 text-white">
                    <BookOpen className="h-3 w-3 mr-1" />
                    Free
                  </Badge>
                </div>
                <h4 className="text-sm font-medium line-clamp-2">{book.title}</h4>
                <p className="text-xs text-muted-foreground mt-1">Nordic APIs</p>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{book.description}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {book.formats.map((fmt) => (
                    <a
                      key={fmt.label}
                      href={fmt.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Badge
                        variant="outline"
                        className="text-xs cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900 transition-colors"
                      >
                        {fmt.label === "PDF" || fmt.label === "EPUB" || fmt.label === "MOBI" ? (
                          <Download className="h-2.5 w-2.5 mr-1" />
                        ) : (
                          <ExternalLink className="h-2.5 w-2.5 mr-1" />
                        )}
                        {fmt.label}
                      </Badge>
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="flex items-center justify-center w-full py-8 text-muted-foreground">
            <p className="text-sm">No eBooks found matching your search.</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {nordicCategories.map((cat) => (
          <Button
            key={cat.key}
            variant={category === cat.key ? "default" : "outline"}
            size="sm"
            className="text-xs h-7"
            onClick={() => setCategory(cat.key)}
          >
            {cat.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function CommercialAudiobooks() {
  return (
    <div className="space-y-8">
      <NordicApisSection />
      <GooglePlaySection />
      <SpotifySection />
      <AmazonSection />
      <SoundCloudSection />
    </div>
  );
}
