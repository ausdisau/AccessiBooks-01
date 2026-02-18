import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Search, ExternalLink, Headphones, Star, Music } from "lucide-react";
import { SiSpotify, SiSoundcloud } from "react-icons/si";

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

export function CommercialAudiobooks() {
  return (
    <div className="space-y-8">
      <SpotifySection />
      <AmazonSection />
      <SoundCloudSection />
    </div>
  );
}
