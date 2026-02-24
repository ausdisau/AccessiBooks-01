import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Search, BookOpen, ExternalLink, FileText, Lock, Crown } from "lucide-react";
import { useSubscription } from "@/hooks/use-subscription";
import { apiRequest } from "@/lib/queryClient";

interface Magazine {
  id: string;
  title: string;
  publisher: string;
  coverColor: string;
  category: string;
  description: string;
  issueInfo: string;
  readUrl: string;
  format: string;
  free: boolean;
}

const MAGAZINE_CATALOG: Magazine[] = [
  {
    id: "smashing-1",
    title: "Smashing Magazine",
    publisher: "Smashing Media",
    coverColor: "from-red-500 to-red-700",
    category: "Web Design",
    description: "A leading online magazine for web designers and developers. Covers UX, CSS, JavaScript, and front-end architecture.",
    issueInfo: "Monthly • Online",
    readUrl: "https://www.smashingmagazine.com/",
    format: "Web",
    free: true,
  },
  {
    id: "alist-1",
    title: "A List Apart",
    publisher: "A List Apart",
    coverColor: "from-blue-600 to-blue-800",
    category: "Web Design",
    description: "Explores the design, development, and meaning of web content. A thoughtful approach to web standards.",
    issueInfo: "Weekly • Online",
    readUrl: "https://alistapart.com/",
    format: "Web",
    free: true,
  },
  {
    id: "wired-1",
    title: "WIRED",
    publisher: "Condé Nast",
    coverColor: "from-black to-gray-800",
    category: "Technology",
    description: "Covers how emerging technologies affect culture, the economy, and politics. In-depth reporting on science and innovation.",
    issueInfo: "Monthly",
    readUrl: "https://www.wired.com/",
    format: "Web",
    free: true,
  },
  {
    id: "hackernoon-1",
    title: "HackerNoon",
    publisher: "HackerNoon",
    coverColor: "from-green-500 to-green-700",
    category: "Technology",
    description: "A technology media company covering programming, startups, AI, and the future of software. By technologists, for technologists.",
    issueInfo: "Daily • Online",
    readUrl: "https://hackernoon.com/",
    format: "Web",
    free: true,
  },
  {
    id: "css-tricks-1",
    title: "CSS-Tricks",
    publisher: "DigitalOcean",
    coverColor: "from-orange-500 to-yellow-600",
    category: "Web Design",
    description: "Tips, tricks, and techniques on using Cascading Style Sheets. Tutorials, guides, and almanac references.",
    issueInfo: "Ongoing • Online",
    readUrl: "https://css-tricks.com/",
    format: "Web",
    free: true,
  },
  {
    id: "arxiv-1",
    title: "arXiv Digest",
    publisher: "Cornell University",
    coverColor: "from-purple-600 to-indigo-700",
    category: "Science",
    description: "Open-access repository of scientific papers in physics, mathematics, computer science, and more. Cutting-edge research.",
    issueInfo: "Daily • Open Access",
    readUrl: "https://arxiv.org/",
    format: "PDF",
    free: false,
  },
  {
    id: "mit-tr-1",
    title: "MIT Technology Review",
    publisher: "MIT",
    coverColor: "from-red-600 to-pink-700",
    category: "Science",
    description: "The mission of MIT Technology Review is to make technology a greater force for good by bringing about better-informed, more conscious technology decisions.",
    issueInfo: "Bi-monthly",
    readUrl: "https://www.technologyreview.com/",
    format: "Web",
    free: false,
  },
  {
    id: "freecodecamp-1",
    title: "freeCodeCamp News",
    publisher: "freeCodeCamp",
    coverColor: "from-emerald-600 to-teal-700",
    category: "Programming",
    description: "Thousands of programming tutorials and articles. Learn to code for free with one of the most popular coding resources.",
    issueInfo: "Daily • Online",
    readUrl: "https://www.freecodecamp.org/news/",
    format: "Web",
    free: false,
  },
  {
    id: "spectrum-1",
    title: "IEEE Spectrum",
    publisher: "IEEE",
    coverColor: "from-blue-800 to-cyan-600",
    category: "Engineering",
    description: "The world's leading engineering magazine covers technology, science, and engineering with authoritative reporting.",
    issueInfo: "Monthly",
    readUrl: "https://spectrum.ieee.org/",
    format: "Web",
    free: false,
  },
  {
    id: "nature-1",
    title: "Nature Briefing",
    publisher: "Springer Nature",
    coverColor: "from-blue-500 to-blue-700",
    category: "Science",
    description: "Daily digest of the most important science news, analysis, and opinion, curated by Nature's editors.",
    issueInfo: "Daily Newsletter",
    readUrl: "https://www.nature.com/nature/articles",
    format: "Web",
    free: false,
  },
  {
    id: "quanta-1",
    title: "Quanta Magazine",
    publisher: "Simons Foundation",
    coverColor: "from-amber-500 to-orange-600",
    category: "Science",
    description: "Illuminating science research in mathematics, theoretical physics, theoretical computer science, and the basic life sciences.",
    issueInfo: "Weekly • Online",
    readUrl: "https://www.quantamagazine.org/",
    format: "Web",
    free: false,
  },
  {
    id: "infoq-1",
    title: "InfoQ Magazine",
    publisher: "C4Media",
    coverColor: "from-violet-600 to-purple-800",
    category: "Programming",
    description: "Software development news, best practices, and tutorials in topics like Java, .NET, Ruby, SOA, Agile, and Architecture.",
    issueInfo: "eMag Quarterly",
    readUrl: "https://www.infoq.com/minibooks/",
    format: "PDF/ePub",
    free: false,
  },
  {
    id: "oreilly-radar",
    title: "O'Reilly Radar",
    publisher: "O'Reilly Media",
    coverColor: "from-teal-600 to-emerald-800",
    category: "Technology",
    description: "Emerging tech trends and insights from industry leaders. Deep analysis of AI, cloud computing, data science, and software engineering.",
    issueInfo: "Weekly • Online",
    readUrl: "https://www.oreilly.com/radar/",
    format: "Web",
    free: false,
  },
  {
    id: "acm-queue",
    title: "ACM Queue",
    publisher: "ACM",
    coverColor: "from-indigo-600 to-blue-900",
    category: "Programming",
    description: "Practitioner-driven articles on the problems, solutions, and technologies of large-scale distributed systems.",
    issueInfo: "Bi-monthly",
    readUrl: "https://queue.acm.org/",
    format: "Web",
    free: false,
  },
  {
    id: "new-scientist",
    title: "New Scientist",
    publisher: "New Scientist Ltd",
    coverColor: "from-rose-600 to-red-900",
    category: "Science",
    description: "Breaking science and technology news. Expert analysis of the latest discoveries, innovations, and breakthroughs shaping our world.",
    issueInfo: "Weekly",
    readUrl: "https://www.newscientist.com/",
    format: "Web",
    free: false,
  },
  {
    id: "ieee-software",
    title: "IEEE Software",
    publisher: "IEEE Computer Society",
    coverColor: "from-cyan-600 to-blue-800",
    category: "Engineering",
    description: "Covers the full spectrum of software engineering topics, from design and architecture to testing and maintenance.",
    issueInfo: "Bi-monthly",
    readUrl: "https://www.computer.org/csdl/magazine/so",
    format: "PDF",
    free: false,
  },
  {
    id: "distill-pub",
    title: "Distill",
    publisher: "Distill Pub",
    coverColor: "from-yellow-500 to-amber-700",
    category: "Science",
    description: "Machine learning research presented with clear, dynamic interactive visualizations. Making AI research accessible and understandable.",
    issueInfo: "Ongoing • Online",
    readUrl: "https://distill.pub/",
    format: "Web",
    free: false,
  },
  {
    id: "pragpub",
    title: "PragPub Magazine",
    publisher: "Pragmatic Programmers",
    coverColor: "from-sky-500 to-indigo-700",
    category: "Programming",
    description: "Articles on software development best practices, new languages, tools, and techniques for the working programmer.",
    issueInfo: "Monthly",
    readUrl: "https://pragprog.com/",
    format: "PDF/ePub",
    free: false,
  },
];

const FREE_MAGAZINE_LIMIT = 5;

const CATEGORIES = ["All", "Technology", "Web Design", "Programming", "Science", "Engineering"];

function MagazineCard({
  magazine,
  isLocked,
  onLockedClick,
  onRead,
}: {
  magazine: Magazine;
  isLocked: boolean;
  onLockedClick: () => void;
  onRead: (magazineId: string) => void;
}) {
  const handleReadClick = () => {
    if (isLocked) {
      onLockedClick();
    } else {
      onRead(magazine.id);
      window.open(magazine.readUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <Card className={`group hover:shadow-lg transition-all duration-200 overflow-hidden ${isLocked ? "border-gray-300/50 opacity-90" : "border-rose-200/30 hover:border-rose-400/50"}`}>
      <div className={`h-40 bg-gradient-to-br ${magazine.coverColor} p-4 flex flex-col justify-between relative`}>
        {isLocked && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <Lock className="h-8 w-8 text-white/80" />
          </div>
        )}
        <div>
          <h3 className="font-bold text-white text-lg leading-tight line-clamp-2">{magazine.title}</h3>
          <p className="text-white/80 text-xs mt-1">{magazine.publisher}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-white/20 text-white border-0 text-[10px]">{magazine.category}</Badge>
          {magazine.free ? (
            <Badge className="bg-green-400/30 text-green-100 border-0 text-[10px]">Free</Badge>
          ) : (
            <Badge className="bg-amber-400/30 text-amber-100 border-0 text-[10px] flex items-center gap-1">
              <Crown className="h-2.5 w-2.5" />
              Premium
            </Badge>
          )}
        </div>
      </div>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{magazine.description}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="h-3 w-3" />
            <span>{magazine.issueInfo}</span>
          </div>
          {isLocked ? (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleReadClick}>
              <Lock className="h-3 w-3 mr-1" /> Unlock
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleReadClick}>
              Read <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function MagazineSection() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const { isPaid, upgradeToTier, isUpgrading } = useSubscription();

  const visibleMagazines = isPaid
    ? MAGAZINE_CATALOG
    : MAGAZINE_CATALOG.slice(0, FREE_MAGAZINE_LIMIT);

  const lockedMagazines = isPaid
    ? []
    : MAGAZINE_CATALOG.slice(FREE_MAGAZINE_LIMIT);

  const allDisplayed = [...visibleMagazines, ...lockedMagazines];

  const filteredMagazines = allDisplayed.filter((mag) => {
    const matchesSearch =
      mag.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mag.publisher.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mag.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "All" || mag.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const trackMagazineRead = async (magazineId: string) => {
    try {
      await apiRequest("POST", "/api/magazines/track-read", { magazineId });
    } catch {}
  };

  return (
    <section className="w-full" aria-labelledby="magazine-section-heading">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
          <BookOpen className="h-5 w-5 text-rose-600 dark:text-rose-400" />
        </div>
        <div>
          <h2 id="magazine-section-heading" className="text-xl sm:text-2xl font-bold">Digital Magazines</h2>
          <p className="text-sm text-muted-foreground">
            Curated tech, science, and design publications
            {!isPaid && (
              <span className="ml-2 text-amber-600 dark:text-amber-400 font-medium">
                • {MAGAZINE_CATALOG.length - FREE_MAGAZINE_LIMIT} more with Plus/Premium
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search magazines..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            aria-label="Search magazines"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map((cat) => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? "default" : "outline"}
              size="sm"
              className={`h-8 text-xs ${
                selectedCategory === cat
                  ? "bg-rose-600 hover:bg-rose-700 text-white"
                  : "hover:border-rose-400/50"
              }`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </Button>
          ))}
        </div>
      </div>

      {filteredMagazines.length === 0 ? (
        <div className="text-center py-8">
          <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No magazines found matching your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredMagazines.map((mag) => {
            const isLocked = !isPaid && lockedMagazines.some((l) => l.id === mag.id);
            return (
              <MagazineCard
                key={mag.id}
                magazine={mag}
                isLocked={isLocked}
                onLockedClick={() => setShowUpgradeDialog(true)}
                onRead={trackMagazineRead}
              />
            );
          })}
        </div>
      )}

      <Dialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              Unlock All Magazines
            </DialogTitle>
            <DialogDescription>
              Upgrade to Plus or Premium to access all {MAGAZINE_CATALOG.length} curated magazines, including exclusive publications in science, engineering, and programming.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <p className="font-medium">Plus</p>
                <p className="text-sm text-muted-foreground">All magazines + ad-free</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  upgradeToTier("plus", "monthly");
                  setShowUpgradeDialog(false);
                }}
                disabled={isUpgrading}
              >
                $4.99/mo
              </Button>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20">
              <div>
                <p className="font-medium flex items-center gap-1">
                  <Crown className="h-4 w-4 text-amber-500" /> Premium
                </p>
                <p className="text-sm text-muted-foreground">All magazines + offline + TTS</p>
              </div>
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700"
                onClick={() => {
                  upgradeToTier("premium", "monthly");
                  setShowUpgradeDialog(false);
                }}
                disabled={isUpgrading}
              >
                $9.99/mo
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowUpgradeDialog(false)}>
              Maybe Later
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
