import { useState } from "react";
import { Headphones, BookOpen, Accessibility, Heart, Mail, Shield, FileText, Phone, ChevronDown } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface FooterSection {
  title: string;
  content: React.ReactNode;
}

function AccordionSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden border-b border-border last:border-b-0">
      <button
        className="w-full flex items-center justify-between py-3 text-left"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="pb-3">
          {children}
        </div>
      )}
    </div>
  );
}

export function Footer() {
  const currentYear = new Date().getFullYear();

  const exploreLinks = (
    <ul className="space-y-2 text-sm">
      <li>
        <span className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5" />
          Audiobooks
        </span>
      </li>
      <li>
        <span className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          Ebooks
        </span>
      </li>
      <li>
        <span className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center gap-1.5">
          <Headphones className="h-3.5 w-3.5" />
          Podcasts
        </span>
      </li>
    </ul>
  );

  const browseLinks = (
    <ul className="space-y-2 text-sm">
      <li>
        <a href="/accessible" className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
          <Accessibility className="h-3.5 w-3.5" />
          Accessible Collections
        </a>
      </li>
      <li>
        <a href="/accessible/auslan" className="text-muted-foreground hover:text-foreground transition-colors">
          Auslan Titles
        </a>
      </li>
      <li>
        <a href="/accessible/with-transcripts" className="text-muted-foreground hover:text-foreground transition-colors">
          Titles with Transcripts
        </a>
      </li>
      <li>
        <a href="/accessible/dyslexia-friendly" className="text-muted-foreground hover:text-foreground transition-colors">
          Dyslexia-Friendly
        </a>
      </li>
      <li>
        <a href="/collections" className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5" />
          Browse by Genre
        </a>
      </li>
      <li>
        <a href="/collections/free-audiobooks" className="text-muted-foreground hover:text-foreground transition-colors">
          Free Audiobooks
        </a>
      </li>
    </ul>
  );

  const supportLinks = (
    <ul className="space-y-2 text-sm">
      <li>
        <a href="https://ausdis.au" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5" />
          Contact Us
        </a>
      </li>
      <li>
        <span className="text-muted-foreground flex items-center gap-1.5">
          <Accessibility className="h-3.5 w-3.5" />
          Accessibility
        </span>
      </li>
      <li>
        <a href="https://ausdis.au" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5" />
          Privacy Policy
        </a>
      </li>
      <li>
        <a href="https://ausdis.au" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          Terms of Service
        </a>
      </li>
    </ul>
  );

  return (
    <footer className="bg-card border-t border-border mt-12" role="contentinfo" aria-label="Site footer">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">

        {/* Desktop multi-column grid */}
        <div className="hidden md:grid md:grid-cols-5 gap-8">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <Headphones className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold">AccessiBooks</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              An inclusive audiobook and ebook platform designed for everyone. Listen, read, and discover — your way.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider text-muted-foreground">Explore</h3>
            {exploreLinks}
          </div>

          <div>
            <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider text-muted-foreground">Browse</h3>
            {browseLinks}
          </div>

          <div>
            <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider text-muted-foreground">Support</h3>
            {supportLinks}
          </div>

          <div className="flex flex-col items-end space-y-3">
            <a
              href="https://ausdis.au"
              target="_blank"
              rel="noopener noreferrer"
              className="block hover:opacity-80 transition-opacity"
              aria-label="Visit Australian Disability Ltd website"
            >
              <img
                src="/assets/ausdis-logo.jpg"
                alt="Australian Disability Ltd - We're for a Fair, Dignified and Equal Society for All People with Disabilities"
                className="h-16 w-auto"
              />
            </a>
            <p className="text-xs text-muted-foreground text-right">
              A project by{" "}
              <a
                href="https://ausdis.au"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium"
              >
                Australian Disability Ltd
              </a>
            </p>
          </div>
        </div>

        {/* Mobile single-column accordion */}
        <div className="md:hidden">
          <div className="flex items-center gap-2 mb-4">
            <Headphones className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">AccessiBooks</span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            An inclusive audiobook and ebook platform designed for everyone. Listen, read, and discover — your way.
          </p>

          <div className="border-t border-border">
            <AccordionSection title="Explore">
              {exploreLinks}
            </AccordionSection>
            <AccordionSection title="Browse">
              {browseLinks}
            </AccordionSection>
            <AccordionSection title="Support">
              {supportLinks}
            </AccordionSection>
          </div>

          <div className="flex flex-col items-center space-y-3 mt-4">
            <a
              href="https://ausdis.au"
              target="_blank"
              rel="noopener noreferrer"
              className="block hover:opacity-80 transition-opacity"
              aria-label="Visit Australian Disability Ltd website"
            >
              <img
                src="/assets/ausdis-logo.jpg"
                alt="Australian Disability Ltd - We're for a Fair, Dignified and Equal Society for All People with Disabilities"
                className="h-14 w-auto"
              />
            </a>
            <p className="text-xs text-muted-foreground text-center">
              A project by{" "}
              <a
                href="https://ausdis.au"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium"
              >
                Australian Disability Ltd
              </a>
            </p>
          </div>
        </div>

        <Separator className="my-6 md:my-8" />

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>&copy; {currentYear} Australian Disability Ltd. All rights reserved.</p>
          <p className="flex items-center gap-1">
            Made with <Heart className="h-3.5 w-3.5 text-red-500 fill-red-500" /> for accessible reading
          </p>
        </div>
      </div>
    </footer>
  );
}
