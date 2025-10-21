import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Plus, Truck, TrendingUp, AlertTriangle, Package, BarChart3, LogOut, Calendar as CalendarIcon, PackageOpen, ArrowLeftRight, Settings as SettingsIcon, Sun, Tag, Moon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { StockTable } from "./StockTable";
import { StockAnalytics } from "./StockAnalytics";
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
  breakdown: {
    [location: string]: LocationData;
  };
  transferBreakdown: {
    toSoko: number;
    toMbutoh: number;
  };
}

export function StockDashboard() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'table' | 'analytics' | 'settings'>('dashboard');
  const [date, setDate] = useState<Date>(new Date());
  const { toast } = useToast();

  // Fetch dashboard statistics with automatic rollover check
  const { data: stats, isLoading: statsLoading, refetch } = useQuery({
    queryKey: ['dashboard-stats', date],
    queryFn: async (): Promise<DashboardStats> => {
      const selectedDate = format(date, "yyyy-MM-dd");
      
      // Check and perform automatic rollover if needed (only for current date)
      if (selectedDate === format(new Date(), "yyyy-MM-dd")) {
        try {
          await supabase.rpc('check_and_rollover_if_needed' as any);
        } catch (error) {
          console.log('Rollover check error (non-critical):', error);
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
      let toSoko = 0;
      let toMbutoh = 0;

      for (const entry of data) {
        const loc = entry.stock_locations?.name || 'Unknown';
        if (!breakdown[loc]) {
          breakdown[loc] = { morning_stock: 0, night_stock: 0, sold: 0 };
        }
        breakdown[loc].morning_stock += entry.morning_stock;
        breakdown[loc].night_stock += entry.night_stock;
        breakdown[loc].sold += entry.sold;

        if (entry.notes?.includes('Transfer In from SOKO')) {
          toMbutoh += entry.adjustment;
        }
        if (entry.notes?.includes('Transfer In from MBUTOH')) {
          toSoko += entry.adjustment;
        }
      }

      const totalTransfers = toSoko + toMbutoh;

      return {
        totalMorningStock,
        totalNightStock,
        totalSold,
        totalIncoming,
        totalTransfers,
        totalFinalStock: totalFinalStock,
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
            <div className="space-y-6">
              {/* Modern KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Stok Pagi */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base font-medium">Stok Pagi</CardTitle>
                    <Sun className="w-5 h-5 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{stats?.totalMorningStock ?? 0}</div>
                    <p className="text-xs text-muted-foreground">
                      Mbutoh: {stats?.breakdown['MBUTOH']?.morning_stock ?? 0} | Soko: {stats?.breakdown['SOKO']?.morning_stock ?? 0}
                    </p>
                  </CardContent>
                </Card>

                {/* HP Datang */}
                <Card className="bg-green-500/10 border-green-500/20">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base font-medium">HP Datang</CardTitle>
                    <Plus className="w-5 h-5 text-green-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{stats?.totalIncoming ?? 0}</div>
                    <p className="text-xs text-muted-foreground">Unit Baru Masuk</p>
                  </CardContent>
                </Card>

                {/* Total Laku */}
                <Card className="bg-red-500/10 border-red-500/20">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base font-medium">Total Laku</CardTitle>
                    <Tag className="w-5 h-5 text-red-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{stats?.totalSold ?? 0}</div>
                    <p className="text-xs text-muted-foreground">
                      Mbutoh: {stats?.breakdown['MBUTOH']?.sold ?? 0} | Soko: {stats?.breakdown['SOKO']?.sold ?? 0}
                    </p>
                  </CardContent>
                </Card>

                {/* Transfer */}
                <Card className="bg-blue-500/10 border-blue-500/20">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base font-medium">Transfer</CardTitle>
                    <ArrowLeftRight className="w-5 h-5 text-blue-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{stats?.totalTransfers ?? 0}</div>
                    <p className="text-xs text-muted-foreground">
                      Ke Soko: {stats?.transferBreakdown.toSoko ?? 0} | Ke Mbutoh: {stats?.transferBreakdown.toMbutoh ?? 0}
                    </p>
                  </CardContent>
                </Card>

                {/* Stok Malam */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base font-medium">Stok Malam</CardTitle>
                    <Moon className="w-5 h-5 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{stats?.totalNightStock ?? 0}</div>
                    <p className="text-xs text-muted-foreground">
                      Mbutoh: {stats?.breakdown['MBUTOH']?.night_stock ?? 0} | Soko: {stats?.breakdown['SOKO']?.night_stock ?? 0}
                    </p>
                  </CardContent>
                </Card>

                {/* Total Stok Akhir */}
                <Card className="bg-primary text-primary-foreground">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base font-medium">Total Stok Akhir</CardTitle>
                    <Package className="w-5 h-5" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{stats?.totalFinalStock ?? 0}</div>
                  </CardContent>
                </Card>
              </div>

            </div>
          )}

          {/* Stock Table View */}
          {activeTab === 'table' && (
            <StockTable selectedDate={date} />
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