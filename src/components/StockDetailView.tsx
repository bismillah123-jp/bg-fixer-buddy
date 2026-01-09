import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, MapPin, Smartphone, Calendar, Store } from "lucide-react";
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
        const color = (entry.metadata as any)?.color || entry.phone_models?.color || '-';
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
    <div className="space-y-4 pb-24">
      {/* Header Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-card/50 border-0 shadow-sm">
          <CardContent className="p-3 text-center">
            <Package className="h-5 w-5 text-primary mx-auto mb-1" />
            <p className="text-2xl font-bold">{totalStock}</p>
            <p className="text-xs text-muted-foreground">Total Unit</p>
          </CardContent>
        </Card>
        
        <Card className="bg-card/50 border-0 shadow-sm">
          <CardContent className="p-3 text-center">
            <Smartphone className="h-5 w-5 text-info mx-auto mb-1" />
            <p className="text-2xl font-bold">{uniqueModels}</p>
            <p className="text-xs text-muted-foreground">Model</p>
          </CardContent>
        </Card>
        
        <Card className="bg-card/50 border-0 shadow-sm">
          <CardContent className="p-3 text-center">
            <Store className="h-5 w-5 text-success mx-auto mb-1" />
            <p className="text-2xl font-bold">{uniqueLocations}</p>
            <p className="text-xs text-muted-foreground">Lokasi</p>
          </CardContent>
        </Card>
      </div>

      {/* Date Header */}
      <div className="flex items-center gap-2 px-1">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          {format(selectedDate, 'EEEE, d MMMM yyyy', { locale: id })}
        </span>
      </div>

      {/* Stock List by Brand */}
      {stockDetails && stockDetails.length > 0 ? (
        <div className="space-y-4">
          {Object.entries(groupedByBrand).map(([brand, items]) => (
            <Card key={brand} className="bg-card/50 border-0 shadow-sm overflow-hidden">
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-xs font-semibold">
                    {brand}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {items.reduce((sum, i) => sum + i.count, 0)} unit
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-2 pt-0">
                <div className="space-y-1.5">
                  {items.map((item, index) => (
                    <div 
                      key={index}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
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
                          "text-sm font-bold min-w-[36px] justify-center",
                          item.count >= 5 ? "bg-success hover:bg-success" : 
                          item.count >= 2 ? "bg-warning hover:bg-warning text-warning-foreground" : 
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
        <Card className="bg-card/50 border-0 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <h3 className="text-base font-semibold mb-1">Tidak Ada Stok</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Tidak ada stok tersedia untuk tanggal yang dipilih.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
