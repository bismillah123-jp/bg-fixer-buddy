import { useState, useEffect, lazy, Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Plus, Truck, TrendingUp, AlertTriangle, Package, BarChart3, LogOut, Calendar as CalendarIcon, PackageOpen, ArrowLeftRight, Settings as SettingsIcon, Sun, Tag, Moon, ListTree, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
const StockTable = lazy(() => import("./StockTable").then(m => ({ default: m.StockTable })));
const StockAnalytics = lazy(() => import("./StockAnalytics").then(m => ({ default: m.StockAnalytics })));
const StockDetailView = lazy(() => import("./StockDetailView").then(m => ({ default: m.StockDetailView })));
const Settings = lazy(() => import("@/pages/Settings"));
import { ThemeToggle } from "./ThemeToggle";
import { MobileNavigation } from "./MobileNavigation";
import { FabMenu } from "./FabMenu";
const AIChatPage = lazy(() => import("./AIChatPage").then(m => ({ default: m.AIChatPage })));

interface LocationData {
  morning_stock: number;
  night_stock: number;
  sold: number;
}

interface DashboardStats {
  totalMorningStock: number;
  totalNightStock: number;
  totalSold: number;
  totalIncoming: number;
  totalTransfers: number;
  totalFinalStock: number;
  totalSoldThisMonth: number;
  breakdown: {
    [location: string]: LocationData;
  };
  transferBreakdown: {
    toSoko: number;
    toMbutoh: number;
  };
}

function ViewFallback() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

export function StockDashboard() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'table' | 'stock-detail' | 'analytics' | 'ai-chat' | 'settings'>('dashboard');
  const [date, setDate] = useState<Date>(new Date());
  const [quickFilter, setQuickFilter] = useState<'incoming' | 'sold' | 'transfer' | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleCardClick = (filterType: 'incoming' | 'sold' | 'transfer') => {
    setQuickFilter(filterType);
    setActiveTab('table');
  };

  // Invalidate all queries when date changes to force refetch
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
    queryClient.invalidateQueries({ queryKey: ['kpi-stats'] });
    queryClient.invalidateQueries({ queryKey: ['daily-sales-chart'] });
    queryClient.invalidateQueries({ queryKey: ['stock-composition'] });
    queryClient.invalidateQueries({ queryKey: ['best-selling-models'] });
  }, [date, queryClient]);

  // Fetch dashboard statistics with automatic rollover check
  const { data: stats, isLoading: statsLoading, refetch } = useQuery({
    queryKey: ['dashboard-stats', date],
    queryFn: async (): Promise<DashboardStats> => {
      const selectedDate = format(date, "yyyy-MM-dd");
      
      // Perform automatic rollover for all missing dates up to today (only when viewing current date)
      if (selectedDate === format(new Date(), "yyyy-MM-dd")) {
        try {
          console.log('Checking for rollover needs...');
          
          // Get the last date with data
          const { data: lastEntry, error: lastEntryError } = await supabase
            .from('stock_entries')
            .select('date')
            .order('date', { ascending: false })
            .limit(1)
            .single();
          
          if (lastEntryError) {
            console.error('Error fetching last entry:', lastEntryError);
          } else if (lastEntry) {
            const lastDate = new Date(lastEntry.date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            lastDate.setHours(0, 0, 0, 0);
            
            const daysDiff = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
            console.log(`Last data: ${lastEntry.date}, Today: ${format(today, 'yyyy-MM-dd')}, Gap: ${daysDiff} days`);
            
            // If there are missing dates, rollover for each missing date
            if (daysDiff > 0) {
              console.log(`Starting rollover for ${daysDiff} missing day(s)...`);
              const currentDate = new Date(lastDate);
              currentDate.setDate(currentDate.getDate() + 1);
              
              while (currentDate <= today) {
                const dateStr = format(currentDate, 'yyyy-MM-dd');
                console.log(`Performing rollover to: ${dateStr}`);
                
                const { error: rolloverError } = await supabase.rpc('rollover_to_new_day', { 
                  target_date: dateStr 
                });
                
                if (rolloverError) {
                  console.error(`Rollover error for ${dateStr}:`, rolloverError);
                  toast({
                    title: "Error Rollover",
                    description: `Gagal rollover ke ${dateStr}: ${rolloverError.message}`,
                    variant: "destructive",
                  });
                } else {
                  console.log(`✓ Rollover successful for ${dateStr}`);
                }
                
                currentDate.setDate(currentDate.getDate() + 1);
              }
              
              console.log('All rollovers completed');
              toast({
                title: "Rollover Berhasil",
                description: `Data berhasil di-rollover untuk ${daysDiff} hari`,
              });
            } else {
              console.log('No rollover needed - data is up to date');
            }
          }
        } catch (error) {
          console.error('Rollover check error:', error);
          toast({
            title: "Error Rollover",
            description: `Terjadi kesalahan saat rollover: ${error}`,
            variant: "destructive",
          });
        }
      }
      
      const { data, error } = await supabase
        .from('stock_entries')
        .select(`*, stock_locations(name)`)
        .eq('date', selectedDate);
      
      if (error) throw error;

      // Calculate totals from all entries (both aggregated and individual IMEI entries)
      // First try to use aggregated entries (imei = null), otherwise sum all entries
      const aggregatedEntries = data.filter(entry => entry.imei === null);
      const useAggregated = aggregatedEntries.length > 0;
      const entriesToSum = useAggregated ? aggregatedEntries : data;
      
      const totalMorningStock = entriesToSum.reduce((sum, entry) => sum + entry.morning_stock, 0);
      const totalNightStock = entriesToSum.reduce((sum, entry) => sum + entry.night_stock, 0);
      const totalSold = entriesToSum.reduce((sum, entry) => sum + entry.sold, 0);
      const totalIncoming = entriesToSum.reduce((sum, entry) => sum + entry.incoming, 0);
      const totalFinalStock = totalNightStock;

      const breakdown: { [location: string]: LocationData } = {};
      
      for (const entry of data) {
        const loc = entry.stock_locations?.name || 'Unknown';
        if (!breakdown[loc]) {
          breakdown[loc] = { morning_stock: 0, night_stock: 0, sold: 0 };
        }
        breakdown[loc].morning_stock += entry.morning_stock;
        breakdown[loc].night_stock += entry.night_stock;
        breakdown[loc].sold += entry.sold;
      }

      // Get transfer data from stock_events
      const { data: transferEvents } = await supabase
        .from('stock_events')
        .select('event_type, qty, location_id, stock_locations(name)')
        .eq('date', selectedDate)
        .in('event_type', ['transfer_in', 'transfer_out']);

      let toSoko = 0;
      let toMbutoh = 0;

      if (transferEvents) {
        for (const event of transferEvents) {
          if (event.event_type === 'transfer_in') {
            const locationName = event.stock_locations?.name;
            if (locationName === 'SOKO') {
              toSoko += event.qty;
            } else if (locationName === 'MBUTOH') {
              toMbutoh += event.qty;
            }
          }
        }
      }

      const totalTransfers = toSoko + toMbutoh;

      // Calculate total sold this month
      const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      
      const { data: monthlyData } = await supabase
        .from('stock_entries')
        .select('sold')
        .gte('date', format(startOfMonth, 'yyyy-MM-dd'))
        .lte('date', format(endOfMonth, 'yyyy-MM-dd'));
      
      const totalSoldThisMonth = monthlyData?.reduce((sum, entry) => sum + entry.sold, 0) || 0;

      return {
        totalMorningStock,
        totalNightStock,
        totalSold,
        totalIncoming,
        totalTransfers,
        totalFinalStock: totalFinalStock,
        totalSoldThisMonth,
        breakdown: breakdown,
        transferBreakdown: { toSoko, toMbutoh }
      };
    }
  });

  // Fetch locations for filter
  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_locations')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    }
  });

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20 md:pb-0">
      {/* Header — glass sticky */}
      <header className="sticky top-0 z-20 border-b border-border/60 glass">
        <div className="container mx-auto px-4 lg:px-6">
          <div className="flex h-16 items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[#a31226] shadow-md shadow-primary/25">
                <Package className="h-5 w-5 text-primary-foreground" strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-extrabold tracking-tight truncate leading-tight">
                  Indah <span className="text-gradient">Cell</span>
                </h1>
                <p className="text-xs text-muted-foreground truncate font-medium">
                  {format(date, "EEEE, d MMM yyyy", { locale: id })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className="h-10 rounded-xl border-border/70 bg-background/60 hover:border-primary/50 hover:bg-background font-medium text-sm px-3"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                    <span className="hidden sm:inline">{format(date, "PPP", { locale: id })}</span>
                    <span className="sm:hidden">{format(date, "d MMM", { locale: id })}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-2xl" align="end">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => d && setDate(d)}
                    disabled={(d) => d > new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <ThemeToggle />
              <Button variant="outline" size="icon" className="hidden sm:flex" onClick={() => supabase.auth.signOut()}>
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Desktop Navigation Tabs - Hidden on mobile */}
      <div className="hidden md:block border-b border-border/60">
        <div className="container mx-auto px-4 lg:px-6">
          <nav className="flex gap-1.5 -mb-px pt-2">
            {([
              { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
              { id: 'table', label: 'Data Stok', icon: Package },
              { id: 'stock-detail', label: 'Detail Stok', icon: ListTree },
              { id: 'analytics', label: 'Statistik', icon: TrendingUp },
              { id: 'ai-chat', label: 'Asisten AI', icon: Sparkles },
              { id: 'settings', label: 'Pengaturan', icon: SettingsIcon },
            ] as const).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <Button
                  key={tab.id}
                  variant="ghost"
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative h-11 rounded-t-xl px-4 font-semibold text-sm pressable ${
                    isActive
                      ? 'text-primary bg-primary/[0.08]'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  <Icon className="w-4 h-4 mr-2" strokeWidth={isActive ? 2.4 : 2} />
                  {tab.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-3 right-3 h-[2.5px] rounded-full bg-gradient-to-r from-primary to-[#c22436]" />
                  )}
                </Button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1">
        <div className="container mx-auto px-4 lg:px-6 py-6">
          {/* Dashboard View */}
          {activeTab === 'dashboard' && (
            <div className="space-y-5 pb-20">
              {/* Hero banner */}
              <div className="relative overflow-hidden rounded-[1.4rem] border border-primary/20 bg-gradient-to-br from-primary/[0.16] via-card to-card p-5 sm:p-6 animate-fade-up">
                <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
                <div className="absolute -bottom-24 -left-16 w-56 h-56 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
                <div className="relative">
                  <p className="text-sm font-medium text-muted-foreground">
                    {(() => {
                      const h = new Date().getHours();
                      if (h >= 5 && h < 11) return "Selamat pagi";
                      if (h >= 11 && h < 15) return "Selamat siang";
                      if (h >= 15 && h < 18) return "Selamat sore";
                      return "Selamat malam";
                    })()}
                  </p>
                  <h2 className="mt-1 text-xl sm:text-2xl font-extrabold tracking-tight">
                    Ringkasan <span className="text-gradient">Hari Ini</span>
                  </h2>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-2xl bg-background/50 border border-border/50 p-3 sm:p-4 backdrop-blur-sm">
                      <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Stok Akhir</p>
                      <p className="mt-1 text-xl sm:text-3xl font-extrabold tabular">{statsLoading ? "–" : (stats?.totalNightStock ?? 0)}</p>
                    </div>
                    <div className="rounded-2xl bg-background/50 border border-border/50 p-3 sm:p-4 backdrop-blur-sm">
                      <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Laku</p>
                      <p className="mt-1 text-xl sm:text-3xl font-extrabold tabular text-destructive">{statsLoading ? "–" : (stats?.totalSold ?? 0)}</p>
                    </div>
                    <div className="rounded-2xl bg-background/50 border border-border/50 p-3 sm:p-4 backdrop-blur-sm">
                      <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Datang</p>
                      <p className="mt-1 text-xl sm:text-3xl font-extrabold tabular text-[hsl(var(--success))]">{statsLoading ? "–" : (stats?.totalIncoming ?? 0)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Location Cards - MBUTOH first (Main Branch) */}
              {(() => {
                const sortedLocations = Object.entries(stats?.breakdown || {}).sort(([a], [b]) => {
                  if (a.toUpperCase() === 'MBUTOH') return -1;
                  if (b.toUpperCase() === 'MBUTOH') return 1;
                  return a.localeCompare(b);
                });
                
                return sortedLocations.map(([location, data], idx) => {
                  const isMbutoh = location.toUpperCase() === 'MBUTOH';
                  
                  return (
                    <Card 
                      key={location} 
                      className={`overflow-hidden card-lift animate-fade-up ${idx === 0 ? 'stagger-1' : 'stagger-2'} ${
                        isMbutoh 
                          ? 'bg-gradient-to-br from-primary/[0.12] via-card to-card border-primary/25' 
                          : 'bg-card border-border/70'
                      }`}
                    >
                      {/* Location Header */}
                      <div className={`px-4 py-3 border-b ${
                        isMbutoh ? 'bg-primary/[0.08] border-primary/15' : 'bg-muted/40 border-border/60'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`h-10 w-10 rounded-xl flex items-center justify-center shadow-sm ${
                              isMbutoh ? 'bg-gradient-to-br from-primary to-[#a31226] text-primary-foreground shadow-primary/25' : 'bg-muted text-muted-foreground'
                            }`}>
                              <Package className="h-5 w-5" strokeWidth={2.2} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h2 className="text-base font-extrabold tracking-tight">
                                  {location}
                                </h2>
                                {isMbutoh && (
                                  <span className="px-2 py-0.5 text-[10px] font-bold tracking-wide bg-gradient-to-r from-primary to-[#c22436] text-primary-foreground rounded-full shadow-sm">
                                    UTAMA
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground font-medium">
                                {isMbutoh ? 'Cabang Utama' : 'Cabang'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Stock Stats Grid */}
                      <CardContent className="p-3 sm:p-4">
                        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                          {/* Stok Pagi - Clickable */}
                          <div 
                            className="relative p-3 sm:p-4 rounded-2xl bg-background/60 border border-border/60 cursor-pointer card-lift pressable"
                            onClick={() => {
                              const locId = locations?.find(l => l.name === location)?.id;
                              if (locId) {
                                setQuickFilter(null);
                                setActiveTab('table');
                                // Add location filter state if needed
                              }
                            }}
                          >
                            <div className="absolute top-2.5 right-2.5">
                              <Sun className="h-4 w-4 text-[hsl(var(--warning))]/80" />
                            </div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 font-semibold">Pagi</p>
                            <p className="text-2xl font-extrabold tabular">{data.morning_stock}</p>
                          </div>
                          
                          {/* Laku - Clickable */}
                          <div 
                            className="relative p-3 sm:p-4 rounded-2xl bg-destructive/[0.07] border border-destructive/20 cursor-pointer card-lift pressable"
                            onClick={() => {
                              setQuickFilter('sold');
                              setActiveTab('table');
                            }}
                          >
                            <div className="absolute top-2.5 right-2.5">
                              <Tag className="h-4 w-4 text-destructive/70" />
                            </div>
                            <p className="text-[10px] text-destructive/80 uppercase tracking-wider mb-1 font-semibold">Laku</p>
                            <p className="text-2xl font-extrabold tabular text-destructive">{data.sold}</p>
                          </div>
                          
                          {/* Stok Malam - Clickable */}
                          <div 
                            className="relative p-3 sm:p-4 rounded-2xl bg-background/60 border border-border/60 cursor-pointer card-lift pressable"
                            onClick={() => {
                              setQuickFilter(null);
                              setActiveTab('table');
                            }}
                          >
                            <div className="absolute top-2.5 right-2.5">
                              <Moon className="h-4 w-4 text-[hsl(var(--info))]/80" />
                            </div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 font-semibold">Malam</p>
                            <p className="text-2xl font-extrabold tabular">{data.night_stock}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                });
              })()}
              
              {/* Summary Row - Quick Stats */}
              <div className="grid grid-cols-2 gap-3 animate-fade-up stagger-3">
                {/* HP Datang */}
                <Card 
                  className="card-lift pressable cursor-pointer border-[hsl(var(--success))]/25 bg-[hsl(var(--success))]/[0.07]"
                  onClick={() => handleCardClick('incoming')}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3.5">
                      <div className="h-12 w-12 rounded-2xl bg-[hsl(var(--success))]/15 flex items-center justify-center shrink-0">
                        <Plus className="h-6 w-6 text-[hsl(var(--success))]" strokeWidth={2.4} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-[hsl(var(--success))]/90 uppercase tracking-wider">HP Datang</p>
                        <p className="text-2xl font-extrabold tabular text-[hsl(var(--success))]">{stats?.totalIncoming ?? 0}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Total Laku Hari Ini */}
                <Card 
                  className="card-lift pressable cursor-pointer border-destructive/25 bg-destructive/[0.07]"
                  onClick={() => handleCardClick('sold')}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3.5">
                      <div className="h-12 w-12 rounded-2xl bg-destructive/15 flex items-center justify-center shrink-0">
                        <Tag className="h-6 w-6 text-destructive" strokeWidth={2.4} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-destructive/90 uppercase tracking-wider">Laku Hari Ini</p>
                        <p className="text-2xl font-extrabold tabular text-destructive">{stats?.totalSold ?? 0}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Transfer & Monthly Stats */}
              <div className="grid grid-cols-3 gap-3 animate-fade-up stagger-4">
                {/* Transfer */}
                <Card 
                  className="card-lift pressable cursor-pointer border-[hsl(var(--info))]/25 bg-[hsl(var(--info))]/[0.07]"
                  onClick={() => handleCardClick('transfer')}
                >
                  <CardContent className="p-3.5">
                    <div className="flex flex-col items-center text-center">
                      <div className="h-10 w-10 rounded-xl bg-[hsl(var(--info))]/15 flex items-center justify-center mb-2">
                        <ArrowLeftRight className="h-5 w-5 text-[hsl(var(--info))]" strokeWidth={2.2} />
                      </div>
                      <p className="text-xl font-extrabold tabular text-[hsl(var(--info))]">{stats?.totalTransfers ?? 0}</p>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Transfer</p>
                    </div>
                  </CardContent>
                </Card>

                {/* Terjual Bulan Ini */}
                <Card className="card-lift border-border/70 bg-card">
                  <CardContent className="p-3.5">
                    <div className="flex flex-col items-center text-center">
                      <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center mb-2">
                        <BarChart3 className="h-5 w-5 text-muted-foreground" strokeWidth={2.2} />
                      </div>
                      <p className="text-xl font-extrabold tabular">{stats?.totalSoldThisMonth ?? 0}</p>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        {format(date, 'MMM', { locale: id })}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Total Stok Malam */}
                <Card className="card-lift border-border/70 bg-card">
                  <CardContent className="p-3.5">
                    <div className="flex flex-col items-center text-center">
                      <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center mb-2">
                        <PackageOpen className="h-5 w-5 text-muted-foreground" strokeWidth={2.2} />
                      </div>
                      <p className="text-xl font-extrabold tabular">{stats?.totalNightStock ?? 0}</p>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          <Suspense fallback={<ViewFallback />}>
            {activeTab === 'table' && (
              <StockTable selectedDate={date} quickFilter={quickFilter} onFilterChange={() => setQuickFilter(null)} />
            )}
            {activeTab === 'stock-detail' && <StockDetailView selectedDate={date} />}
            {activeTab === 'analytics' && <StockAnalytics selectedDate={date} />}
            {activeTab === 'ai-chat' && <AIChatPage />}
            {activeTab === 'settings' && <Settings />}
          </Suspense>
        </div>
      </main>

      {/* Mobile Navigation */}
      <MobileNavigation activeTab={activeTab} onTabChange={setActiveTab} />

      {/* FAB Menu */}
      <FabMenu />
    </div>
  );
}