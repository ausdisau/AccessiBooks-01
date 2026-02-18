import { Headphones, BookOpen, Accessibility, Heart, Mail, Shield, FileText, Phone } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-card border-t border-border mt-12" role="contentinfo" aria-label="Site footer">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
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
          </div>

          <div>
            <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider text-muted-foreground">Support</h3>
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
          </div>

          <div className="flex flex-col items-center md:items-end space-y-3">
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
            <p className="text-xs text-muted-foreground text-center md:text-right">
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

        <Separator className="my-8" />

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
