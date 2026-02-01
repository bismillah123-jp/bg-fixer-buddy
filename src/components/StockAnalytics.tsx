import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Package, 
  ShoppingCart, 
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Store,
  Smartphone,
  Calendar
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  ResponsiveContainer, 
  Tooltip as RechartsTooltip,
  Cell
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays, format, subDays, startOfMonth, endOfMonth, eachDayOfInterval, getDaysInMonth } from "date-fns";
import { id } from "date-fns/locale";
import { cn } from "@/lib/utils";

// Brand colors
const BRAND_COLORS: Record<string, string> = {
  'infinix': 'hsl(var(--success))',
  'Infinix': 'hsl(var(--success))',
  'INFINIX': 'hsl(var(--success))',
  'Xiaomi': 'hsl(24, 100%, 50%)',
  'xiaomi': 'hsl(24, 100%, 50%)',
  'XIAOMI': 'hsl(24, 100%, 50%)',
  'realme': 'hsl(var(--warning))',
  'Realme': 'hsl(var(--warning))',
  'REALME': 'hsl(var(--warning))',
  'vivo': 'hsl(var(--info))',
  'Vivo': 'hsl(var(--info))',
  'VIVO': 'hsl(var(--info))',
  'Itel': 'hsl(var(--destructive))',
  'itel': 'hsl(var(--destructive))',
  'ITEL': 'hsl(var(--destructive))',
  'Samsung': 'hsl(210, 100%, 50%)',
  'samsung': 'hsl(210, 100%, 50%)',
  'SAMSUNG': 'hsl(210, 100%, 50%)',
  'oppo': 'hsl(120, 100%, 35%)',
  'Oppo': 'hsl(120, 100%, 35%)',
  'OPPO': 'hsl(120, 100%, 35%)',
  'tecno': 'hsl(var(--primary))',
  'Tecno': 'hsl(var(--primary))',
  'TECNO': 'hsl(var(--primary))',
};

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--success))',
  'hsl(var(--info))',
  'hsl(var(--warning))',
  'hsl(var(--destructive))',
  'hsl(260, 100%, 65%)',
];

const getBrandColor = (brandName: string, index: number): string => {
  return BRAND_COLORS[brandName] || CHART_COLORS[index % CHART_COLORS.length];
};

interface StockAnalyticsProps {
  selectedDate?: Date;
}

interface SlowMovingItem {
  brand: string;
  model: string;
  imei: string;
  daysInStock: number;
}

export function StockAnalytics({ selectedDate = new Date() }: StockAnalyticsProps) {
  const today = selectedDate.toISOString().split('T')[0];
  
  // Main stats query - FIX: Use stock_events for accurate brand sales
  const { data: stats, isLoading } = useQuery({
    queryKey: ['analytics-stats', today],
    queryFn: async () => {
      const monthStart = startOfMonth(selectedDate);
      const monthEnd = endOfMonth(selectedDate);
      const startOfMonthStr = format(monthStart, 'yyyy-MM-dd');
      const endOfMonthStr = format(monthEnd, 'yyyy-MM-dd');
      const yesterday = subDays(selectedDate, 1).toISOString().split('T')[0];

      const [
        { data: todayStock },
        { data: yesterdayStock },
        { data: locationStock },
        { data: salesEvents }
      ] = await Promise.all([
        // Current stock - items with night_stock > 0 and not sold
        supabase.from('stock_entries').select('night_stock, imei, phone_models(brand, model)').eq('date', today).gt('night_stock', 0).is('sale_date', null),
        // Yesterday stock for comparison
        supabase.from('stock_entries').select('night_stock').eq('date', yesterday).gt('night_stock', 0),
        // Stock by location
        supabase.from('stock_entries').select('night_stock, stock_locations(name)').eq('date', today).gt('night_stock', 0).is('sale_date', null),
        // FIXED: Get sales from stock_events (event_type = 'jual') for accuracy
        supabase.from('stock_events')
          .select('imei, date, phone_models(brand)')
          .eq('event_type', 'jual')
          .gte('date', startOfMonthStr)
          .lte('date', endOfMonthStr)
      ]);

      // Calculate stock
      const currentStock = todayStock?.reduce((sum, e) => sum + (e.night_stock || 0), 0) || 0;
      const prevStock = yesterdayStock?.reduce((sum, e) => sum + (e.night_stock || 0), 0) || 0;
      const stockChange = prevStock > 0 ? ((currentStock - prevStock) / prevStock * 100) : 0;

      // FIXED: Monthly sales from stock_events
      const monthlySold = salesEvents?.length || 0;
      const todaySalesEvents = salesEvents?.filter(e => e.date === today) || [];
      const todaySold = todaySalesEvents.length;

      // FIXED: Brand performance from stock_events
      const brandSales = (salesEvents || []).reduce((acc, e) => {
        const brand = e.phone_models?.brand || 'Lainnya';
        acc[brand] = (acc[brand] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Stock by location
      const stockByLocation = locationStock?.reduce((acc, e) => {
        const loc = e.stock_locations?.name || 'Unknown';
        acc[loc] = (acc[loc] || 0) + (e.night_stock || 0);
        return acc;
      }, {} as Record<string, number>) || {};

      // Find slow-moving stock (items in stock > 14 days) with details
      const slowMovingItems: SlowMovingItem[] = [];
      if (todayStock && todayStock.length > 0) {
        for (const item of todayStock) {
          if (item.imei) {
            const { data: firstEvent } = await supabase
              .from('stock_events')
              .select('date')
              .eq('imei', item.imei)
              .eq('event_type', 'masuk')
              .order('date', { ascending: true })
              .limit(1);
            
            if (firstEvent?.[0]) {
              const days = differenceInDays(selectedDate, new Date(firstEvent[0].date));
              if (days > 14) {
                slowMovingItems.push({
                  brand: item.phone_models?.brand || 'Unknown',
                  model: item.phone_models?.model || 'Unknown',
                  imei: item.imei,
                  daysInStock: days
                });
              }
            }
          }
        }
      }
      
      // Sort by days in stock descending
      slowMovingItems.sort((a, b) => b.daysInStock - a.daysInStock);

      return {
        currentStock,
        stockChange,
        monthlySold,
        todaySold,
        brandSales: Object.entries(brandSales)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 8),
        stockByLocation: Object.entries(stockByLocation)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value),
        slowMovingItems,
        slowMovingCount: slowMovingItems.length,
      };
    }
  });

  // Weekly trend
  const { data: weeklyTrend } = useQuery({
    queryKey: ['weekly-trend', today],
    queryFn: async () => {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const date = subDays(selectedDate, i);
        days.push(format(date, 'yyyy-MM-dd'));
      }

      // FIXED: Use stock_events for accurate sales count
      const { data } = await supabase
        .from('stock_events')
        .select('date')
        .in('date', days)
        .eq('event_type', 'jual');

      const grouped = days.map(date => {
        const dayData = data?.filter(e => e.date === date) || [];
        return {
          day: format(new Date(date), 'EEE', { locale: id }),
          penjualan: dayData.length
        };
      });

      return grouped;
    }
  });

  // Monthly sales recap query
  const { data: monthlySalesRecap } = useQuery({
    queryKey: ['monthly-sales-recap', today],
    queryFn: async () => {
      const monthStart = startOfMonth(selectedDate);
      const monthEnd = endOfMonth(selectedDate);
      const daysInCurrentMonth = getDaysInMonth(selectedDate);
      
      // Get all days in the month up to today or end of month
      const allDays = eachDayOfInterval({
        start: monthStart,
        end: selectedDate < monthEnd ? selectedDate : monthEnd
      });

      // Get all sales events for the month
      const { data: salesData } = await supabase
        .from('stock_events')
        .select('date')
        .eq('event_type', 'jual')
        .gte('date', format(monthStart, 'yyyy-MM-dd'))
        .lte('date', format(monthEnd, 'yyyy-MM-dd'));

      // Group by date
      const dailySales = allDays.map(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const count = salesData?.filter(e => e.date === dateStr).length || 0;
        return {
          date: dateStr,
          dayLabel: format(day, 'd'),
          dayName: format(day, 'EEE', { locale: id }),
          sales: count
        };
      });

      const totalSales = dailySales.reduce((sum, d) => sum + d.sales, 0);
      const avgPerDay = dailySales.length > 0 ? totalSales / dailySales.length : 0;
      const projection = Math.round(avgPerDay * daysInCurrentMonth);

      return {
        dailySales,
        totalSales,
        avgPerDay: avgPerDay.toFixed(1),
        daysElapsed: dailySales.length,
        daysInMonth: daysInCurrentMonth,
        projection
      };
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20">
      {/* Summary Stats - Simplified (no revenue/profit) */}
      <div className="grid grid-cols-2 gap-3">
        {/* Stok Saat Ini */}
        <Card className="bg-card/50 border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Stok Tersedia</p>
                <p className="text-2xl font-bold">{stats?.currentStock || 0}</p>
                <div className={cn(
                  "flex items-center gap-1 text-xs",
                  (stats?.stockChange || 0) >= 0 ? "text-success" : "text-destructive"
                )}>
                  {(stats?.stockChange || 0) >= 0 ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3" />
                  )}
                  <span>{Math.abs(stats?.stockChange || 0).toFixed(1)}%</span>
                </div>
              </div>
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Package className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Penjualan Bulan Ini */}
        <Card className="bg-card/50 border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">
                  Terjual ({format(selectedDate, 'MMMM', { locale: id })})
                </p>
                <p className="text-2xl font-bold">{stats?.monthlySold || 0}</p>
                <p className="text-xs text-muted-foreground">
                  Hari ini: {stats?.todaySold || 0} unit
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                <ShoppingCart className="h-5 w-5 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Sales Recap */}
      <Card className="bg-card/50 border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Rekap Penjualan Bulanan</h3>
            </div>
            <span className="text-xs text-muted-foreground">
              {format(selectedDate, 'MMMM yyyy', { locale: id })}
            </span>
          </div>
          
          {/* Monthly Stats Summary */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="text-center p-2 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-lg font-bold text-primary">{monthlySalesRecap?.totalSales || 0}</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground">Rata-rata/Hari</p>
              <p className="text-lg font-bold">{monthlySalesRecap?.avgPerDay || 0}</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground">Hari Berlalu</p>
              <p className="text-lg font-bold">{monthlySalesRecap?.daysElapsed || 0}/{monthlySalesRecap?.daysInMonth || 30}</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground">Proyeksi</p>
              <p className="text-lg font-bold text-success">{monthlySalesRecap?.projection || 0}</p>
            </div>
          </div>

          {/* Daily Sales Chart for the month */}
          <div className="h-[120px]">
            {monthlySalesRecap?.dailySales && monthlySalesRecap.dailySales.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlySalesRecap.dailySales} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis 
                    dataKey="dayLabel" 
                    axisLine={false} 
                    tickLine={false}
                    tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                    interval={2}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false}
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    allowDecimals={false}
                  />
                  <RechartsTooltip 
                    content={({ active, payload }) => {
                      if (active && payload?.[0]) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
                            <p className="text-xs text-muted-foreground">{data.dayName}, Tgl {data.dayLabel}</p>
                            <p className="text-sm font-semibold">{payload[0].value} unit terjual</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar 
                    dataKey="sales" 
                    fill="hsl(var(--success))" 
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Belum ada data penjualan
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Weekly Trend */}
        <Card className="bg-card/50 border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm">Penjualan 7 Hari Terakhir</h3>
            </div>
            <div className="h-[180px]">
              {weeklyTrend && weeklyTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyTrend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis 
                      dataKey="day" 
                      axisLine={false} 
                      tickLine={false}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      allowDecimals={false}
                    />
                    <RechartsTooltip 
                      content={({ active, payload, label }) => {
                        if (active && payload?.[0]) {
                          return (
                            <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
                              <p className="text-xs text-muted-foreground">{label}</p>
                              <p className="text-sm font-semibold">{payload[0].value} unit</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar 
                      dataKey="penjualan" 
                      fill="hsl(var(--primary))" 
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Belum ada data penjualan
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Brand Performance - FIXED */}
        <Card className="bg-card/50 border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm">Penjualan per Merek</h3>
              <span className="text-xs text-muted-foreground">
                {format(selectedDate, 'MMMM yyyy', { locale: id })}
              </span>
            </div>
            <div className="h-[180px]">
              {stats?.brandSales && stats.brandSales.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={stats.brandSales} 
                    layout="vertical"
                    margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      width={70}
                    />
                    <RechartsTooltip 
                      content={({ active, payload }) => {
                        if (active && payload?.[0]) {
                          return (
                            <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
                              <p className="text-sm font-semibold">{payload[0].payload.name}</p>
                              <p className="text-xs text-muted-foreground">{payload[0].value} unit terjual</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {stats.brandSales.map((entry, index) => (
                        <Cell key={index} fill={getBrandColor(entry.name, index)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Belum ada data penjualan
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stock by Location & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Stock Distribution */}
        <Card className="bg-card/50 border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Store className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Stok per Lokasi</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {stats?.stockByLocation && stats.stockByLocation.length > 0 ? (
                stats.stockByLocation.map((loc, index) => (
                  <div 
                    key={loc.name}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                  >
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <span className="text-sm font-medium truncate max-w-[80px]">{loc.name}</span>
                    </div>
                    <span className="text-sm font-bold">{loc.value}</span>
                  </div>
                ))
              ) : (
                <div className="col-span-full text-center py-4 text-muted-foreground text-sm">
                  Tidak ada data lokasi
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Slow Moving Stock Details */}
        <Card className="bg-card/50 border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <h3 className="font-semibold text-sm">Stok Lama (&gt;14 hari)</h3>
              <span className="ml-auto text-lg font-bold text-warning">
                {stats?.slowMovingCount || 0} unit
              </span>
            </div>
            
            {stats?.slowMovingItems && stats.slowMovingItems.length > 0 ? (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {stats.slowMovingItems.slice(0, 10).map((item, index) => (
                  <div 
                    key={`${item.imei}-${index}`}
                    className="flex items-center justify-between p-2 rounded-lg bg-warning/5 border border-warning/10"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{item.brand} {item.model}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{item.imei}</p>
                    </div>
                    <span className="text-xs font-bold text-warning ml-2 whitespace-nowrap">
                      {item.daysInStock} hari
                    </span>
                  </div>
                ))}
                {stats.slowMovingItems.length > 10 && (
                  <p className="text-xs text-center text-muted-foreground pt-1">
                    +{stats.slowMovingItems.length - 10} lainnya
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground text-sm">
                <Smartphone className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>Tidak ada stok lama</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
