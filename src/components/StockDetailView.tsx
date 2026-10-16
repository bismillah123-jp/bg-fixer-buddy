import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, MapPin, Smartphone, Calendar, Store, ListTree } from "lucide-react";
import { cn } from "@/lib/utils";

interface StockDetailViewProps {
  selectedDate: Date;
}

interface StockDetailEntry {
  brand: string;
  model: string;
  color: string;
  storage_capacity: string;
  location: string;
  count: number;
  imeis: string[];
}

export function StockDetailView({ selectedDate }: StockDetailViewProps) {
  const { data: stockDetails, isLoading } = useQuery({
    queryKey: ['stock-details', selectedDate],
    queryFn: async (): Promise<StockDetailEntry[]> => {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      
      const { data, error } = await supabase
        .from('stock_entries')
        .select(`
          imei,
          night_stock,
          metadata,
          phone_models (brand, model, color, storage_capacity),
          stock_locations (name)
        `)
        .eq('date', dateStr)
        .gt('night_stock', 0);
      
      if (error) throw error;

      const grouped = new Map<string, StockDetailEntry>();
      
      for (const entry of data || []) {
        const brand = entry.phone_models?.brand || 'Unknown';
        const model = entry.phone_models?.model || 'Unknown';
        const color = (entry.metadata as Record<string, unknown> | undefined)?.color as string | undefined || entry.phone_models?.color || '-';
        const storage = entry.phone_models?.storage_capacity || '-';
        const location = entry.stock_locations?.name || 'Unknown';
        
        const key = `${brand}|${model}|${color}|${storage}|${location}`;
        
        if (!grouped.has(key)) {
          grouped.set(key, {
            brand,
            model,
            color,
            storage_capacity: storage,
            location,
            count: 0,
            imeis: []
          });
        }
        
        const group = grouped.get(key)!;
        group.count += entry.night_stock;
        if (entry.imei) {
          group.imeis.push(entry.imei);
        }
      }
      
      return Array.from(grouped.values()).sort((a, b) => {
        if (a.brand !== b.brand) return a.brand.localeCompare(b.brand);
        if (a.model !== b.model) return a.model.localeCompare(b.model);
        return a.location.localeCompare(b.location);
      });
    }
  });

  const totalStock = stockDetails?.reduce((sum, item) => sum + item.count, 0) || 0;
  const uniqueModels = new Set(stockDetails?.map(item => `${item.brand} ${item.model}`)).size;
  const uniqueLocations = new Set(stockDetails?.map(item => item.location)).size;

  // Group by brand
  const groupedByBrand = stockDetails?.reduce((acc, item) => {
    if (!acc[item.brand]) acc[item.brand] = [];
    acc[item.brand].push(item);
    return acc;
  }, {} as Record<string, StockDetailEntry[]>) || {};

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24 animate-fade-up">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-[1.4rem] border border-primary/20 bg-gradient-to-br from-primary/[0.14] via-card to-card p-5 sm:p-6">
        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[#a31226] shadow-md shadow-primary/25">
            <ListTree className="h-6 w-6 text-primary-foreground" strokeWidth={2.2} />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              Detail <span className="text-gradient">Stok</span>
            </h2>
            <p className="text-sm text-muted-foreground font-medium">
              {format(selectedDate, 'EEEE, d MMMM yyyy', { locale: id })}
            </p>
          </div>
        </div>
      </div>

      {/* Header Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="glass rounded-[1.2rem] shadow-[var(--shadow-card)] card-lift animate-fade-up stagger-1">
          <CardContent className="p-3.5 text-center">
            <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15">
              <Package className="h-5 w-5 text-primary" strokeWidth={2.2} />
            </div>
            <p className="text-2xl font-extrabold tabular">{totalStock}</p>
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Total Unit</p>
          </CardContent>
        </Card>
        
        <Card className="glass rounded-[1.2rem] shadow-[var(--shadow-card)] card-lift animate-fade-up stagger-2">
          <CardContent className="p-3.5 text-center">
            <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--info))]/15">
              <Smartphone className="h-5 w-5 text-[hsl(var(--info))]" strokeWidth={2.2} />
            </div>
            <p className="text-2xl font-extrabold tabular">{uniqueModels}</p>
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Model</p>
          </CardContent>
        </Card>
        
        <Card className="glass rounded-[1.2rem] shadow-[var(--shadow-card)] card-lift animate-fade-up stagger-3">
          <CardContent className="p-3.5 text-center">
            <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--success))]/15">
              <Store className="h-5 w-5 text-[hsl(var(--success))]" strokeWidth={2.2} />
            </div>
            <p className="text-2xl font-extrabold tabular">{uniqueLocations}</p>
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Lokasi</p>
          </CardContent>
        </Card>
      </div>

      {/* Stock List by Brand */}
      {stockDetails && stockDetails.length > 0 ? (
        <div className="space-y-4">
          {Object.entries(groupedByBrand).map(([brand, items], bIdx) => (
            <Card key={brand} className="glass rounded-[1.2rem] shadow-[var(--shadow-card)] overflow-hidden animate-fade-up" style={{ animationDelay: `${Math.min(bIdx, 6) * 0.06}s` }}>
              <CardHeader className="pb-2 pt-3.5 px-4">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-xs font-bold px-3 py-1">
                    {brand}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-semibold tabular">
                    {items.reduce((sum, i) => sum + i.count, 0)} unit
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-2 pt-0">
                <div className="space-y-1.5">
                  {items.map((item, index) => (
                    <div 
                      key={index}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 hover:bg-muted/50 border border-transparent hover:border-border/60 transition-all"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {item.model}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            {item.storage_capacity}
                          </span>
                          {item.color !== '-' && (
                            <>
                              <span className="text-muted-foreground text-xs">•</span>
                              <span className="text-xs text-muted-foreground">
                                {item.color}
                              </span>
                            </>
                          )}
                          <span className="text-muted-foreground text-xs">•</span>
                          <div className="flex items-center gap-0.5">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {item.location}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Badge 
                        variant="default" 
                        className={cn(
                          "text-sm font-extrabold min-w-[38px] justify-center tabular pressable",
                          item.count >= 5 ? "bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]" : 
                          item.count >= 2 ? "bg-[hsl(var(--warning))] hover:bg-[hsl(var(--warning))] text-white" : 
                          "bg-destructive hover:bg-destructive"
                        )}
                      >
                        {item.count}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="glass rounded-[1.4rem] shadow-[var(--shadow-card)]">
          <CardContent className="flex flex-col items-center justify-center py-14 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/60">
              <Package className="h-8 w-8 text-muted-foreground/50" strokeWidth={1.8} />
            </div>
            <h3 className="text-base font-bold mb-1">Tidak Ada Stok</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Tidak ada stok tersedia untuk tanggal yang dipilih.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
