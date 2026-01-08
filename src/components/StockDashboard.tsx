import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Plus, Truck, TrendingUp, AlertTriangle, Package, BarChart3, LogOut, Calendar as CalendarIcon, PackageOpen, ArrowLeftRight, Settings as SettingsIcon, Sun, Tag, Moon, ListTree } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { StockTable } from "./StockTable";
import { StockAnalytics } from "./StockAnalytics";
import { StockDetailView } from "./StockDetailView";
import Settings from "@/pages/Settings";
import { ThemeToggle } from "./ThemeToggle";
import { MobileNavigation } from "./MobileNavigation";
import { FabMenu } from "./FabMenu";

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

export function StockDashboard() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'table' | 'stock-detail' | 'analytics' | 'settings'>('dashboard');
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
              let currentDate = new Date(lastDate);
              currentDate.setDate(currentDate.getDate() + 1);
              
              while (currentDate <= today) {
                const dateStr = format(currentDate, 'yyyy-MM-dd');
                console.log(`Performing rollover to: ${dateStr}`);
                
                const { error: rolloverError } = await supabase.rpc('rollover_to_new_day' as any, { 
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
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto px-4 lg:px-6">
          <div className="flex h-16 items-center justify-between">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold truncate">Indah Cell</h1>
              <p className="text-sm text-muted-foreground truncate">
                Pusat Gadget Termurah
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className="w-[150px] sm:w-[240px] justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(date, "PPP", { locale: id })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
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
      <div className="hidden md:block border-b border-border">
        <div className="container mx-auto px-4 lg:px-6">
          <nav className="flex gap-1 -mb-px">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
              { id: 'table', label: 'Data Stok', icon: Package },
              { id: 'stock-detail', label: 'Detail Stok', icon: ListTree },
              { id: 'analytics', label: 'Statistik', icon: TrendingUp },
              { id: 'settings', label: 'Pengaturan', icon: SettingsIcon },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <Button
                  key={tab.id}
                  variant="ghost"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`h-12 rounded-none border-b-2 ${
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {tab.label}
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
            <div className="space-y-4 pb-20">
              {/* Quick Summary Row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Stok Pagi */}
                <Card className="bg-card/50 border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center">
                        <Sun className="h-5 w-5 text-warning" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Stok Pagi</p>
                        <p className="text-xl font-bold">{stats?.totalMorningStock ?? 0}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* HP Datang */}
                <Card 
                  className="bg-success/5 border-success/20 shadow-sm cursor-pointer hover:bg-success/10 transition-colors"
                  onClick={() => handleCardClick('incoming')}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                        <Plus className="h-5 w-5 text-success" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">HP Datang</p>
                        <p className="text-xl font-bold text-success">{stats?.totalIncoming ?? 0}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Laku Hari Ini */}
                <Card 
                  className="bg-destructive/5 border-destructive/20 shadow-sm cursor-pointer hover:bg-destructive/10 transition-colors"
                  onClick={() => handleCardClick('sold')}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                        <Tag className="h-5 w-5 text-destructive" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Laku Hari Ini</p>
                        <p className="text-xl font-bold text-destructive">{stats?.totalSold ?? 0}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Stok Malam */}
                <Card className="bg-card/50 border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center">
                        <Moon className="h-5 w-5 text-info" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Stok Malam</p>
                        <p className="text-xl font-bold">{stats?.totalNightStock ?? 0}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Location Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {Object.entries(stats?.breakdown || {}).map(([location, data]) => (
                  <Card key={location} className="bg-card/50 border-0 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-primary" />
                          <h3 className="font-semibold text-sm">{location}</h3>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="p-2 rounded-lg bg-muted/30">
                          <p className="text-lg font-bold">{data.morning_stock}</p>
                          <p className="text-[10px] text-muted-foreground">Pagi</p>
                        </div>
                        <div className="p-2 rounded-lg bg-destructive/10">
                          <p className="text-lg font-bold text-destructive">{data.sold}</p>
                          <p className="text-[10px] text-muted-foreground">Laku</p>
                        </div>
                        <div className="p-2 rounded-lg bg-muted/30">
                          <p className="text-lg font-bold">{data.night_stock}</p>
                          <p className="text-[10px] text-muted-foreground">Malam</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Secondary Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {/* Transfer */}
                <Card 
                  className="bg-info/5 border-info/20 shadow-sm cursor-pointer hover:bg-info/10 transition-colors"
                  onClick={() => handleCardClick('transfer')}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Transfer</p>
                        <p className="text-2xl font-bold text-info">{stats?.totalTransfers ?? 0}</p>
                        <div className="flex gap-2 mt-2 text-[10px] text-muted-foreground">
                          <span>→ Soko: {stats?.transferBreakdown.toSoko ?? 0}</span>
                          <span>→ Mbutoh: {stats?.transferBreakdown.toMbutoh ?? 0}</span>
                        </div>
                      </div>
                      <ArrowLeftRight className="h-4 w-4 text-info" />
                    </div>
                  </CardContent>
                </Card>

                {/* Terjual Bulan Ini */}
                <Card className="bg-warning/5 border-warning/20 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Bulan Ini</p>
                        <p className="text-2xl font-bold text-warning">{stats?.totalSoldThisMonth ?? 0}</p>
                        <p className="text-[10px] text-muted-foreground mt-2">
                          {format(date, 'MMMM yyyy', { locale: id })}
                        </p>
                      </div>
                      <TrendingUp className="h-4 w-4 text-warning" />
                    </div>
                  </CardContent>
                </Card>

                {/* Total Stok Akhir */}
                <Card className="bg-primary text-primary-foreground shadow-sm col-span-2 lg:col-span-1">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs opacity-80 mb-1">Total Stok Akhir</p>
                        <p className="text-2xl font-bold">{stats?.totalFinalStock ?? 0}</p>
                        <p className="text-[10px] opacity-70 mt-2">
                          Semua lokasi
                        </p>
                      </div>
                      <Package className="h-4 w-4 opacity-80" />
                    </div>
                  </CardContent>
                </Card>
              </div>

            </div>
          )}

          {/* Stock Table View */}
          {activeTab === 'table' && (
            <StockTable selectedDate={date} quickFilter={quickFilter} onFilterChange={() => setQuickFilter(null)} />
          )}

          {/* Stock Detail View */}
          {activeTab === 'stock-detail' && (
            <StockDetailView selectedDate={date} />
          )}

          {/* Analytics View */}
          {activeTab === 'analytics' && (
            <StockAnalytics selectedDate={date} />
          )}

          {/* Settings View */}
          {activeTab === 'settings' && (
            <Settings />
          )}
        </div>
      </main>

      {/* Mobile Navigation */}
      <MobileNavigation activeTab={activeTab} onTabChange={setActiveTab} />

      {/* FAB Menu */}
      <FabMenu />
    </div>
  );
}