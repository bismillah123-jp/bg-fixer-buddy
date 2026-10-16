import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Smartphone, Loader2 } from "lucide-react";
import { Footer } from "@/components/Footer";

const Login = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN") {
        toast({
          title: "Login Berhasil",
          description: "Bismillah Semangat-Semangat",
        });
        navigate("/");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate, toast]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast({
          title: "Gagal masuk",
          description: error.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Terjadi kesalahan",
        description: "Silakan coba lagi nanti. Kalo masalah teruss berlanjut silahkan hubungi Sir Ihsan!",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background relative overflow-hidden">
      {/* Decorative Background — animated orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute -top-32 -right-32 w-[28rem] h-[28rem] rounded-full bg-primary/15 blur-3xl animate-float-slow" />
        <div className="absolute -bottom-40 -left-32 w-[24rem] h-[24rem] rounded-full bg-primary/8 blur-3xl animate-float-slow" style={{ animationDelay: "2.5s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[36rem] h-[36rem] rounded-full bg-primary/[0.04] blur-3xl" />
        {/* subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.13]"
          style={{
            backgroundImage: "linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, black, transparent)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, black, transparent)",
          }}
        />
      </div>

      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-sm">
          {/* Logo & Branding */}
          <div className="text-center mb-8 animate-fade-up">
            <div className="mx-auto mb-6 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[1.4rem] bg-gradient-to-br from-primary via-primary to-[#a31226] shadow-lg shadow-primary/30 glow-primary rotate-3 hover:rotate-0 transition-transform duration-500">
              <Smartphone className="h-9 w-9 text-primary-foreground" strokeWidth={2.2} />
            </div>
            <h1 className="text-[2rem] font-extrabold tracking-tight text-foreground">
              Indah <span className="text-gradient">Cell</span>
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground font-medium">
              Pusat Gadget Termurah • Manajemen Stok
            </p>
          </div>

          {/* Login Form */}
          <div className="glass rounded-[1.4rem] p-6 sm:p-7 shadow-[var(--shadow-elevated)] animate-fade-up stagger-1">
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="h-12 rounded-xl bg-background/60 border-border/70 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/50"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-semibold">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Masukkan password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="h-12 pr-12 rounded-xl bg-background/60 border-border/70 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/50"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10 p-0 hover:bg-transparent text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </Button>
                </div>
              </div>
              
              <Button 
                type="submit" 
                className="w-full h-12 text-base font-bold rounded-xl bg-gradient-to-r from-primary to-[#c22436] hover:brightness-110 shadow-[var(--shadow-button)] transition-all duration-200 pressable"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Memverifikasi...
                  </>
                ) : (
                  "Masuk"
                )}
              </Button>
            </form>
          </div>

          {/* Helper Text */}
          <p className="mt-6 text-center text-sm text-muted-foreground animate-fade-up stagger-2">
            Butuh bantuan?{" "}
            <a 
              href="https://wa.me/6283146993017" 
              target="_blank" 
              rel="noopener noreferrer"
              className="font-semibold text-primary hover:underline transition-colors"
            >
              Hubungi Sir Ihsan
            </a>
          </p>
        </div>
      </div>
      
      <Footer />
    </div>
  );
};

export default Login;
