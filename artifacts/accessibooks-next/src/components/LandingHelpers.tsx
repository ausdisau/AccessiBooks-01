import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Music2, BookOpen as BookOpenIcon, Trophy, Crown } from "lucide-react";
import { useCuratedPlaylists } from "@/hooks/use-playlists";
import { BrandLandingPage } from "@/pages/landing";
import { LoginModal } from "@/components/LoginModal";

const CATEGORY_ICONS: Record<string, string> = {};


export function CuratedCollectionsPreview() {
  const { data: playlists, isLoading } = useCuratedPlaylists();
  
  if (isLoading || !playlists || playlists.length === 0) {
    return null;
  }

  return (
    <section className="w-full px-4 md:px-8 lg:px-16 py-12" aria-labelledby="curated-collections-heading">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Music2 className="h-6 w-6 text-primary" aria-hidden="true" />
          <h2 id="curated-collections-heading" className="text-2xl font-bold">Curated Collections</h2>
        </div>
        <p className="text-muted-foreground">Hand-picked audiobook collections for every mood and interest</p>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 max-w-6xl mx-auto">
        {playlists.slice(0, 6).map((playlist) => {
          const emoji = playlist.category ? CATEGORY_ICONS[playlist.category] || "📖" : "📖";
          return (
            <Card 
              key={playlist.id}
              className="hover:shadow-lg transition-shadow cursor-pointer group"
              role="article"
              aria-label={`${playlist.name} - ${playlist.description || 'Curated collection'}`}
            >
              <CardContent className="p-4 text-center">
                <div className="w-full h-20 bg-gradient-to-br from-primary/20 via-primary/30 to-primary/50 rounded-lg mb-3 flex items-center justify-center">
                  <span className="text-3xl" role="img" aria-hidden="true">{emoji}</span>
                </div>
                <h3 className="font-semibold text-sm line-clamp-1">{playlist.name}</h3>
                <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                  <BookOpenIcon className="h-3 w-3" aria-hidden="true" />
                  {playlist.itemCount} {playlist.itemCount === 1 ? 'book' : 'books'}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

export function PublicCommunitySection({ onJoin }: { onJoin: () => void }) {
  const { data: challenges = [], isLoading: challengesLoading } = useQuery<any[]>({
    queryKey: ["/api/gamification/challenges"],
  });

  const { data: leaderboard = [], isLoading: leaderboardLoading } = useQuery<any[]>({
    queryKey: ["/api/gamification/leaderboard?period=alltime"],
  });

  const isLoading = challengesLoading || leaderboardLoading;
  if (isLoading) return null;
  if (challenges.length === 0 && leaderboard.length === 0) return null;

  return (
    <section className="w-full px-4 md:px-8 lg:px-16 py-12">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold mb-2 text-center">Join Our Community</h2>
        <p className="text-muted-foreground text-center mb-8">Compete with readers worldwide and earn achievements</p>
        
        <div className="grid md:grid-cols-2 gap-8">
          {challenges.length > 0 && (
            <div>
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                Active Challenges
              </h3>
              <div className="space-y-3">
                {challenges.slice(0, 3).map((challenge: any) => (
                  <Card key={challenge.id} className="hover:border-primary/50 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{challenge.badgeIcon}</span>
                        <div>
                          <p className="font-medium text-sm">{challenge.title}</p>
                          <p className="text-xs text-muted-foreground">{challenge.description}</p>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={onJoin}>Join</Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {leaderboard.length > 0 && (
            <div>
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Crown className="h-5 w-5 text-yellow-500" />
                Top Readers
              </h3>
              <Card>
                <CardContent className="p-0">
                  {leaderboard.slice(0, 5).map((entry: any, idx: number) => (
                    <div key={entry.userId} className={`flex items-center justify-between p-3 ${idx < leaderboard.length - 1 ? "border-b" : ""}`}>
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          idx === 0 ? "bg-yellow-500 text-white" :
                          idx === 1 ? "bg-gray-300 text-gray-700" :
                          idx === 2 ? "bg-amber-600 text-white" :
                          "bg-muted text-muted-foreground"
                        }`}>{idx + 1}</span>
                        <div>
                          <p className="font-medium text-sm">{entry.firstName || "Reader"} {entry.lastName ? entry.lastName[0] + "." : ""}</p>
                          <p className="text-xs text-muted-foreground">Level {entry.level} - {entry.totalXp} XP</p>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">{entry.booksCompleted} books</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Button variant="link" className="mt-2 w-full" onClick={onJoin}>
                Sign up to join the leaderboard
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// Landing page for logged-out users — branded shell that hosts the LoginModal
export function LandingPage({ onBrowseAsGuest }: { onBrowseAsGuest?: () => void }) {
  const [loginOpen, setLoginOpen] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  const openLogin = () => {
    setIsRegistering(false);
    setLoginOpen(true);
  };
  const openRegister = () => {
    setIsRegistering(true);
    setLoginOpen(true);
  };

  return (
    <>
      <BrandLandingPage
        onOpenLogin={openLogin}
        onOpenRegister={openRegister}
        onBrowseAsGuest={onBrowseAsGuest}
      />
      <LoginModal
        open={loginOpen}
        onOpenChange={setLoginOpen}
        isRegistering={isRegistering}
        setIsRegistering={setIsRegistering}
      />
    </>
  );
}
