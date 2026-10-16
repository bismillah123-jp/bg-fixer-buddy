import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Home, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-primary/15 blur-3xl animate-float-slow" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-primary/10 blur-3xl animate-float-slow" style={{ animationDelay: "2.5s" }} />
      </div>
      <div className="relative z-10 text-center max-w-sm animate-fade-up">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[1.6rem] glass shadow-[var(--shadow-card)]">
          <SearchX className="h-10 w-10 text-primary" strokeWidth={1.8} />
        </div>
        <h1 className="text-6xl font-extrabold tracking-tight text-gradient">404</h1>
        <p className="mt-3 text-lg font-bold">Halaman tidak ditemukan</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Alamat <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{location.pathname}</span> tidak ada di sistem.
        </p>
        <Button asChild className="mt-6 h-11 px-6 rounded-xl font-bold bg-gradient-to-r from-primary to-[#c22436] shadow-[var(--shadow-button)] pressable">
          <Link to="/">
            <Home className="mr-2 h-4 w-4" />
            Kembali ke Dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
