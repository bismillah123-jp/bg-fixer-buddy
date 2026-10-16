import { Heart } from "lucide-react";

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-border/50 bg-background/60 backdrop-blur-xl py-6 mt-10">
      <div className="container mx-auto px-4">
        <p className="text-center text-xs text-muted-foreground font-medium">
          Dibuat dengan <Heart className="inline h-3.5 w-3.5 text-primary fill-primary" /> oleh{" "}
          <a 
            href="https://wa.me/6283146993017" 
            target="_blank" 
            rel="noopener noreferrer"
            className="font-bold text-foreground hover:text-primary transition-colors"
          >
            Sir Ihsan
          </a>
          {" "}• Indah Cell
        </p>
      </div>
    </footer>
  );
}
