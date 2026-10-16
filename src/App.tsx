import { useState, useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import Login from "./pages/Login";
const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Callback = lazy(() => import("./pages/Callback"));
const Settings = lazy(() => import("./pages/Settings"));
import { supabase } from "./integrations/supabase/client";
import { useRealtimeSubscription } from "./hooks/useRealtimeSubscription";
import type { Session } from "@supabase/supabase-js";

const App = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  
  // Enable realtime subscriptions
  useRealtimeSubscription();

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setLoading(false);
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!loading && !session && location.pathname !== '/login' && location.pathname !== '/callback') {
      navigate('/login');
    }
  }, [session, loading, location.pathname, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/callback" element={<Callback />} />
        <Route path="/" element={session ? <Index /> : null} />
        <Route path="/settings" element={session ? <Settings /> : null} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
    </TooltipProvider>
  );
};

export default App;
