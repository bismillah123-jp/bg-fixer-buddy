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
    <div className="flex flex-col min-h-screen bg-background">
      {/* Decorative Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-sm">
          {/* Logo & Branding */}
          <div className="text-center mb-8">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/25">
              <Smartphone className="h-8 w-8 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Indah Cell
            </h1>
            <p className="mt-2 text-muted-foreground">
              Pusat Gadget Termurah
            </p>
          </div>

          {/* Login Form */}
          <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6 shadow-lg">
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 bg-background/50 border-border/50 focus:border-primary transition-colors"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
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
                    className="h-12 pr-12 bg-background/50 border-border/50 focus:border-primary transition-colors"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
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
                className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all duration-200 hover:shadow-xl hover:shadow-primary/30"
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
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Butuh bantuan?{" "}
            <a 
              href="https://wa.me/6283146993017" 
              target="_blank" 
              rel="noopener noreferrer"
              className="font-medium text-primary hover:underline transition-colors"
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
