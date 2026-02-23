import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, BookOpen, ExternalLink, ChevronLeft, ChevronRight, FileText } from "lucide-react";

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
    free: true,
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
    free: true,
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
    free: true,
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
    free: true,
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
    free: true,
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
    free: true,
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
    free: true,
  },
];

const CATEGORIES = ["All", "Technology", "Web Design", "Programming", "Science", "Engineering"];

function MagazineCard({ magazine }: { magazine: Magazine }) {
  return (
    <Card className="group hover:shadow-lg transition-all duration-200 border-rose-200/30 hover:border-rose-400/50 overflow-hidden">
      <div className={`h-40 bg-gradient-to-br ${magazine.coverColor} p-4 flex flex-col justify-between`}>
        <div>
          <h3 className="font-bold text-white text-lg leading-tight line-clamp-2">{magazine.title}</h3>
          <p className="text-white/80 text-xs mt-1">{magazine.publisher}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-white/20 text-white border-0 text-[10px]">{magazine.category}</Badge>
          {magazine.free && (
            <Badge className="bg-green-400/30 text-green-100 border-0 text-[10px]">Free</Badge>
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
          <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
            <a href={magazine.readUrl} target="_blank" rel="noopener noreferrer">
              Read <ExternalLink className="h-3 w-3 ml-1" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function MagazineSection() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const filteredMagazines = MAGAZINE_CATALOG.filter((mag) => {
    const matchesSearch =
      mag.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mag.publisher.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mag.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "All" || mag.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <section className="w-full" aria-labelledby="magazine-section-heading">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
          <BookOpen className="h-5 w-5 text-rose-600 dark:text-rose-400" />
        </div>
        <div>
          <h2 id="magazine-section-heading" className="text-2xl font-bold">Digital Magazines</h2>
          <p className="text-sm text-muted-foreground">Curated tech, science, and design publications</p>
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
          {filteredMagazines.map((mag) => (
            <MagazineCard key={mag.id} magazine={mag} />
          ))}
        </div>
      )}
    </section>
  );
}
