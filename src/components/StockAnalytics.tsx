import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, TrendingUp, Package, Clock, X, DollarSign } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend as RechartsLegend, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, AreaChart, Area, Sector } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const COLORS = [
  'hsl(142, 76%, 36%)',   // Green
  'hsl(200, 100%, 50%)',  // Blue  
  'hsl(346, 77%, 50%)',   // Pink
  'hsl(48, 96%, 50%)',    // Yellow
  'hsl(260, 100%, 65%)',  // Purple
  'hsl(0, 84%, 60%)',     // Red
  'hsl(24, 100%, 50%)',   // Orange
  'hsl(120, 100%, 25%)'   // Dark Green
];

// Render active shape for pie chart
const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, value } = props;

  return (
    <g>
      <text x={cx} y={cy - 10} dy={8} textAnchor="middle" fill="hsl(var(--foreground))" className="font-bold text-lg">
        {payload.name}
      </text>
      <text x={cx} y={cy + 10} dy={8} textAnchor="middle" fill="hsl(var(--muted-foreground))">
        {value} unit
      </text>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 10}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    </g>
  );
};

interface StockAnalyticsProps {
  selectedDate?: Date;
}

// Main Analytics Component
export function StockAnalytics({ selectedDate = new Date() }: StockAnalyticsProps) {
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);
  
  // --- DATA QUERIES ---

  // 1. Query for KPI cards
  const { data: kpiStats, isLoading: kpiLoading } = useQuery({
    queryKey: ['kpi-stats', selectedDate],
    queryFn: async () => {
      const thirtyDaysAgo = new Date(selectedDate);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const today = selectedDate.toISOString().split('T')[0];

      // Fetch all relevant data in parallel
      const [
        { data: monthlySalesData, error: salesError },
        { data: availableStockData, error: stockError },
        { data: oldestStockData, error: oldestError },
        { data: todaySalesData, error: todayError }
      ] = await Promise.all([
        supabase.from('stock_entries').select('sold, phone_models(brand)').gte('date', thirtyDaysAgo.toISOString()),
        supabase.from('stock_entries').select('night_stock').eq('date', today).gt('night_stock', 0),
        supabase.from('stock_entries').select('date, phone_models(model)').eq('date', today).gt('night_stock', 0).order('date', { ascending: true }).limit(1),
        supabase.from('stock_entries').select('selling_price, profit_loss, sold').eq('date', today).gt('sold', 0)
      ]);

      if (salesError || stockError || oldestError || todayError) {
        throw new Error(salesError?.message || stockError?.message || oldestError?.message || todayError?.message);
      }

      // Process sales data
      const totalSoldMonthly = monthlySalesData?.filter(e => e.sold > 0).length || 0;
      const brandSales = monthlySalesData?.filter(e => e.sold > 0).reduce((acc, entry) => {
        const brand = entry.phone_models?.brand || 'Unknown';
        acc[brand] = (acc[brand] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      const bestSellingBrand = brandSales && Object.keys(brandSales).length > 0
        ? Object.entries(brandSales).sort((a, b) => b[1] - a[1])[0]
        : null;

      // Process available stock - sum night_stock values for today
      const availableStock = availableStockData?.reduce((sum, entry) => sum + (entry.night_stock || 0), 0) || 0;

      // Process oldest stock
      let oldestStock = null;
      if (oldestStockData && oldestStockData.length > 0 && oldestStockData[0].date) {
        try {
          const oldestDate = new Date(oldestStockData[0].date);
          if (!isNaN(oldestDate.getTime())) { // Check if the date is valid
            oldestStock = {
              model: oldestStockData[0].phone_models?.model || 'N/A',
              days: differenceInDays(new Date(), oldestDate),
            };
          }
        } catch (e) {
          // Date parsing failed, leave oldestStock as null
          console.error("Error parsing oldest stock date:", e);
        }
      }

      // Calculate today's profit/loss and revenue
      const soldItems = todaySalesData?.filter(e => e.sold > 0) || [];
      const todayProfitLoss = soldItems.reduce((sum, item) => sum + (item.profit_loss || 0), 0);
      const todayRevenue = soldItems.reduce((sum, item) => sum + (item.selling_price || 0), 0);

      return {
        totalSoldMonthly,
        availableStock,
        bestSellingBrand: bestSellingBrand ? `${bestSellingBrand[0]} (${bestSellingBrand[1]})` : null,
        oldestStock: oldestStock ? `${oldestStock.model} (${oldestStock.days} hari)` : null,
        todayProfitLoss,
        todayRevenue,
      };
    }
  });

  // 2. Query for Daily Sales Chart
  const { data: dailySalesData, isLoading: dailySalesLoading } = useQuery({
    queryKey: ['daily-sales-chart', selectedDate],
    queryFn: async () => {
      const thirtyDaysAgo = new Date(selectedDate);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data, error } = await supabase.from('stock_entries').select('date, sold').gte('date', thirtyDaysAgo.toISOString()).order('date');
      if (error) throw error;

      const grouped = data.filter(e => e.sold > 0).reduce((acc, entry) => {
        const date = new Date(entry.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return Object.entries(grouped).map(([date, sales]) => ({ date, Penjualan: sales }));
    }
  });

  // 3. Query for Stock Composition Pie Chart
  const { data: stockCompositionData, isLoading: compositionLoading } = useQuery({
    queryKey: ['stock-composition', selectedDate],
    queryFn: async () => {
        const today = selectedDate.toISOString().split('T')[0];
        const { data, error } = await supabase.from('stock_entries').select('night_stock, phone_models(brand)').eq('date', today).gt('night_stock', 0);
        if (error) throw error;

        const grouped = data.reduce((acc, entry) => {
            const brand = entry.phone_models?.brand || 'Unknown';
            acc[brand] = (acc[brand] || 0) + (entry.night_stock || 0);
            return acc;
        }, {} as Record<string, number>);

        return Object.entries(grouped).map(([name, value]) => ({ name, value }));
    }
  });

  // 3b. Query for Selected Brand Details
  const { data: brandDetails, isLoading: brandDetailsLoading } = useQuery({
    queryKey: ['brand-details', selectedBrand, selectedDate],
    enabled: !!selectedBrand,
    queryFn: async () => {
      if (!selectedBrand) return [];
      
      const today = selectedDate.toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('stock_entries')
        .select('night_stock, phone_models(brand, model, color, storage_capacity), stock_locations(name)')
        .eq('date', today)
        .gt('night_stock', 0);
      
      if (error) throw error;
      
      // Filter by brand after fetching (Supabase doesn't support filtering nested relations directly)
      const filtered = data.filter(entry => entry.phone_models?.brand === selectedBrand);
      
      return filtered.map(entry => ({
        model: entry.phone_models?.model || '-',
        color: entry.phone_models?.color || '-',
        storage: entry.phone_models?.storage_capacity || '-',
        location: entry.stock_locations?.name || '-',
        stock: entry.night_stock
      }));
    }
  });

  // 4. Query for Best Selling Models Table
  const { data: bestSellingModels, isLoading: modelsLoading } = useQuery({
    queryKey: ['best-selling-models', selectedDate],
    queryFn: async () => {
        const thirtyDaysAgo = new Date(selectedDate);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const { data, error } = await supabase.from('stock_entries').select('sold, phone_models(brand, model, color)').gte('date', thirtyDaysAgo.toISOString());
        if (error) throw error;

        const grouped = data.filter(e => e.sold > 0).reduce((acc, entry) => {
            const modelName = `${entry.phone_models?.brand} ${entry.phone_models?.model} ${entry.phone_models?.color || ''}`.trim();
            acc[modelName] = (acc[modelName] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return Object.entries(grouped).map(([name, sales]) => ({ name, sales })).sort((a, b) => b.sales - a.sales);
    }
  });

  // --- RENDER ---

  const AnalyticsLoader = () => (
    <div className="h-24 flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );

  // Add custom CSS animations
  const chartStyles = `
    @keyframes chartFadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    @keyframes chartScaleIn {
      from { opacity: 0; transform: scale(0.8); }
      to { opacity: 1; transform: scale(1); }
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    
    .chart-container {
      animation: chartFadeIn 0.6s ease-out;
    }
    
    .chart-area {
      animation: chartScaleIn 0.8s ease-out;
    }
    
    .chart-pie {
      animation: chartScaleIn 1s ease-out;
    }
    
    .hover-glow:hover {
      filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.5));
      transition: all 0.3s ease;
    }
  `;

  return (
    <>
      <style>{chartStyles}</style>
      <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="animate-fade-in hover-scale transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Terjual (Bulan Ini)</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {kpiLoading ? <AnalyticsLoader /> : <div className="text-2xl font-bold animate-scale-in">{kpiStats?.totalSoldMonthly ?? 0}</div>}
          </CardContent>
        </Card>
        <Card className="animate-fade-in hover-scale transition-all duration-300" style={{ animationDelay: '0.1s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stok Tersedia</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {kpiLoading ? <AnalyticsLoader /> : <div className="text-2xl font-bold animate-scale-in">{kpiStats?.availableStock ?? 0}</div>}
          </CardContent>
        </Card>
        <Card className="animate-fade-in hover-scale transition-all duration-300" style={{ animationDelay: '0.2s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Brand Terlaris</CardTitle>
            <BarChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {kpiLoading ? <AnalyticsLoader /> : (
              <div className="text-2xl font-bold animate-scale-in">
                {kpiStats?.bestSellingBrand ?? <span className="text-sm text-muted-foreground">Belum ada penjualan</span>}
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Revenue Card */}
        <Card className="animate-fade-in hover-scale transition-all duration-300" style={{ animationDelay: '0.3s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendapatan Hari Ini</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {kpiLoading ? <AnalyticsLoader /> : (
              <div className="text-2xl font-bold animate-scale-in text-green-600">
                Rp {(kpiStats?.todayRevenue || 0).toLocaleString('id-ID')}
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Oldest Stock Card */}
        <Card className="animate-fade-in hover-scale transition-all duration-300" style={{ animationDelay: '0.4s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stok Paling Lama</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {kpiLoading ? <AnalyticsLoader /> : (
              <div className="text-2xl font-bold animate-scale-in">
                {kpiStats?.oldestStock ?? <span className="text-sm text-muted-foreground">Tidak ada stok</span>}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="animate-fade-in hover-scale transition-all duration-300" style={{ animationDelay: '0.4s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Laba/Rugi Hari Ini</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {kpiLoading ? <AnalyticsLoader /> : (
              <div className={cn(
                "text-2xl font-bold animate-scale-in",
                (kpiStats?.todayProfitLoss ?? 0) >= 0 ? 'text-success' : 'text-destructive'
              )}>
                Rp {(kpiStats?.todayProfitLoss ?? 0).toLocaleString('id-ID')}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts and Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="animate-fade-in overflow-hidden bg-gradient-to-br from-card to-card/50 border-0 shadow-xl">
            <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 border-b">
              <CardTitle className="flex items-center gap-2 text-xl">
                <TrendingUp className="h-5 w-5 text-primary" />
                Grafik Penjualan Harian
                <span className="text-sm font-normal text-muted-foreground">(30 hari terakhir)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[350px] p-6">
              {dailySalesLoading ? <AnalyticsLoader /> : (
                dailySalesData && dailySalesData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%" className="chart-container">
                    <AreaChart data={dailySalesData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }} className="chart-area">
                      <defs>
                        <linearGradient id="colorPenjualan" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.8}/>
                          <stop offset="50%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.1}/>
                        </linearGradient>
                        <linearGradient id="colorPenjualanStroke" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="hsl(142, 76%, 36%)"/>
                          <stop offset="100%" stopColor="hsl(200, 100%, 50%)"/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid 
                        strokeDasharray="3 3" 
                        opacity={0.2} 
                        stroke="hsl(var(--muted-foreground))"
                        vertical={false}
                      />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={{ stroke: 'hsl(var(--border))' }}
                        tickLine={{ stroke: 'hsl(var(--border))' }}
                        interval="preserveStartEnd"
                      />
                      <YAxis 
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={{ stroke: 'hsl(var(--border))' }}
                        tickLine={{ stroke: 'hsl(var(--border))' }}
                      />
                      <RechartsTooltip 
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-xl p-3">
                                <p className="text-sm font-medium text-foreground mb-1">{label}</p>
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full bg-gradient-to-r from-green-500 to-blue-500"></div>
                                  <p className="text-sm text-muted-foreground">
                                    Penjualan: <span className="font-semibold text-foreground">{payload[0].value} unit</span>
                                  </p>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                        cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1, strokeDasharray: '5 5' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="Penjualan" 
                        stroke="url(#colorPenjualanStroke)" 
                        strokeWidth={3}
                        fill="url(#colorPenjualan)"
                        animationDuration={1500}
                        animationBegin={0}
                        dot={{ fill: 'hsl(142, 76%, 36%)', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6, stroke: 'hsl(142, 76%, 36%)', strokeWidth: 2, fill: 'white' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                      <TrendingUp className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground text-lg">Belum ada data penjualan</p>
                    <p className="text-sm text-muted-foreground mt-1">Mulai jual HP untuk melihat grafik</p>
                  </div>
                )
              )}
            </CardContent>
          </Card>
        </div>
        <div>
          <Card className="animate-fade-in overflow-hidden bg-gradient-to-br from-card to-card/50 border-0 shadow-xl" style={{ animationDelay: '0.1s' }}>
            <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 border-b">
              <div className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Package className="h-5 w-5 text-primary" />
                  Komposisi Stok
                </CardTitle>
                {selectedBrand && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => {
                      setSelectedBrand(null);
                      setActiveIndex(undefined);
                    }}
                    className="h-8 hover:bg-primary/10 transition-colors"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Reset
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="h-[400px] p-6">
              {compositionLoading ? <AnalyticsLoader /> : (
                stockCompositionData && stockCompositionData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%" className="chart-container">
                    <PieChart className="chart-pie">
                      <defs>
                        <filter id="glow">
                          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                          <feMerge> 
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                          </feMerge>
                        </filter>
                      </defs>
                      <Pie 
                        data={stockCompositionData} 
                        dataKey="value" 
                        nameKey="name" 
                        cx="50%" 
                        cy="50%" 
                        innerRadius={60}
                        outerRadius={100} 
                        label={({ name, value, percent }) => 
                          value > 0 ? `${name}: ${value}` : ''
                        }
                        labelLine={false}
                        animationBegin={0}
                        animationDuration={1200}
                        activeIndex={activeIndex}
                        activeShape={renderActiveShape}
                        onClick={(data, index) => {
                          setSelectedBrand(data.name);
                          setActiveIndex(index);
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        {stockCompositionData?.map((_entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={COLORS[index % COLORS.length]}
                            className="transition-all duration-300 hover:opacity-80 hover-glow"
                            filter={activeIndex === index ? "url(#glow)" : "none"}
                          />
                        ))}
                      </Pie>
                      <RechartsTooltip 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0];
                            return (
                              <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-xl p-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <div 
                                    className="w-3 h-3 rounded-full" 
                                    style={{ backgroundColor: data.payload.fill }}
                                  ></div>
                                  <p className="text-sm font-medium text-foreground">{data.name}</p>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  Stok: <span className="font-semibold text-foreground">{data.value} unit</span>
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Persentase: <span className="font-semibold text-foreground">
                                    {((data.payload.percent || 0) * 100).toFixed(1)}%
                                  </span>
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <RechartsLegend 
                        wrapperStyle={{ 
                          fontSize: '11px', 
                          paddingTop: '20px',
                          display: 'flex',
                          flexWrap: 'wrap',
                          justifyContent: 'center',
                          gap: '12px',
                          maxHeight: '80px',
                          overflow: 'hidden'
                        }}
                        iconType="circle"
                        formatter={(value, entry) => (
                          <span style={{ 
                            color: entry.color, 
                            fontWeight: '500',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '80px',
                            display: 'inline-block'
                          }}>
                            {value}
                          </span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                      <Package className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground text-lg">Tidak ada stok tersedia</p>
                    <p className="text-sm text-muted-foreground mt-1">Tambah stok untuk melihat komposisi</p>
                  </div>
                )
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {selectedBrand && (
        <div>
          <Card className="animate-fade-in overflow-hidden">
            <CardHeader>
              <CardTitle>Detail Stok - {selectedBrand}</CardTitle>
            </CardHeader>
            <CardContent>
              {brandDetailsLoading ? <AnalyticsLoader /> : (
                brandDetails && brandDetails.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Model</TableHead>
                        <TableHead>Warna</TableHead>
                        <TableHead>Kapasitas</TableHead>
                        <TableHead>Lokasi</TableHead>
                        <TableHead className="text-right">Stok</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {brandDetails.map((item, index) => (
                        <TableRow 
                          key={index}
                          className="transition-all duration-200 hover:bg-accent/50 animate-fade-in"
                          style={{ animationDelay: `${index * 0.05}s` }}
                        >
                          <TableCell className="font-medium">{item.model}</TableCell>
                          <TableCell>{item.color}</TableCell>
                          <TableCell>{item.storage}</TableCell>
                          <TableCell>{item.location}</TableCell>
                          <TableCell className="text-right font-bold text-primary">{item.stock}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex items-center justify-center h-24">
                    <p className="text-muted-foreground">Tidak ada detail stok</p>
                  </div>
                )
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div>
        <Card className="animate-fade-in overflow-hidden" style={{ animationDelay: '0.2s' }}>
          <CardHeader>
            <CardTitle>Tipe HP Terlaris (Bulan Ini)</CardTitle>
          </CardHeader>
          <CardContent>
             {modelsLoading ? <AnalyticsLoader /> : (
               bestSellingModels && bestSellingModels.length > 0 ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>No.</TableHead>
                            <TableHead>Tipe HP</TableHead>
                            <TableHead className="text-right">Unit Terjual</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {bestSellingModels?.map((model, index) => (
                            <TableRow 
                              key={model.name}
                              className="transition-all duration-200 hover:bg-accent/50 animate-fade-in"
                              style={{ animationDelay: `${index * 0.05}s` }}
                            >
                                <TableCell className="font-medium">{index + 1}</TableCell>
                                <TableCell>{model.name}</TableCell>
                                <TableCell className="text-right font-bold text-primary">{model.sales}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
               ) : (
                <div className="flex items-center justify-center h-24">
                  <p className="text-muted-foreground">Belum ada HP terjual bulan ini</p>
                </div>
               )
             )}
          </CardContent>
        </Card>
      </div>
      </div>
    </>
  );
}