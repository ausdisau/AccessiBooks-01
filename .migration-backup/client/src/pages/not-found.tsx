import { AccessiBooksLogo } from "@/components/accessibooks-logo";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Home, BookOpen } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 flex items-center justify-center">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="mb-8">
            <AccessiBooksLogo />
          </div>
          
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="text-8xl font-bold text-primary">404</h1>
              <h2 className="text-2xl font-semibold text-foreground">Page Not Found</h2>
            </div>
            
            <p className="text-lg text-muted-foreground max-w-md mx-auto">
              The page you're looking for doesn't exist or has been moved. Let's get you back to your audiobook library.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6">
              <Button asChild className="min-w-[160px]" data-testid="button-go-home">
                <Link href="/">
                  <Home className="h-4 w-4 mr-2" />
                  Go Home
                </Link>
              </Button>
              
              <Button variant="outline" asChild className="min-w-[160px]" data-testid="button-browse-library">
                <Link href="/">
                  <BookOpen className="h-4 w-4 mr-2" />
                  Browse Library
                </Link>
              </Button>
            </div>
          </div>
          
          <div className="mt-12 space-y-3 text-sm text-muted-foreground">
            <p>Having trouble? Here are some things you can try:</p>
            <ul className="space-y-1">
              <li>• Check the URL for typos</li>
              <li>• Use your browser's back button</li>
              <li>• Return to the library to find your content</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
