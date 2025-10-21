import { Heart } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t bg-background py-6 mt-8">
      <div className="container mx-auto px-4">
        <p className="text-center text-sm text-muted-foreground">
          Made with <Heart className="inline h-4 w-4 text-red-500 fill-red-500" /> by{" "}
          <a 
            href="https://wa.me/6283146993017" 
            target="_blank" 
            rel="noopener noreferrer"
            className="font-medium text-foreground hover:underline transition-colors"
          >
            Sir Ihsan
          </a>
        </p>
      </div>
    </footer>
  );
}
