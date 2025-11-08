import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, MapPin } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

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
      
      // Fetch all stock entries with positive stock
      const { data, error } = await supabase
        .from('stock_entries')
        .select(`
          imei,
          night_stock,
          phone_models (brand, model, color, storage_capacity),
          stock_locations (name)
        `)
        .eq('date', dateStr)
        .gt('night_stock', 0);
      
      if (error) throw error;

      // Group by model, color, storage, and location
      const grouped = new Map<string, StockDetailEntry>();
      
      for (const entry of data || []) {
        const brand = entry.phone_models?.brand || 'Unknown';
        const model = entry.phone_models?.model || 'Unknown';
        const color = entry.phone_models?.color || '-';
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
        // Sort by brand, then model, then location
        if (a.brand !== b.brand) return a.brand.localeCompare(b.brand);
        if (a.model !== b.model) return a.model.localeCompare(b.model);
        return a.location.localeCompare(b.location);
      });
    }
  });

  const totalStock = stockDetails?.reduce((sum, item) => sum + item.count, 0) || 0;
  const uniqueModels = new Set(stockDetails?.map(item => `${item.brand} ${item.model}`)).size;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Unit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalStock}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Jumlah Model</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{uniqueModels}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tanggal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold">{format(selectedDate, 'dd MMM yyyy')}</div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Stock Table */}
      <Card>
        <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            <CardTitle>Detail Stok per Tipe</CardTitle>
          </div>
          <CardDescription>
            Rincian stok tersedia berdasarkan model, warna, kapasitas, dan lokasi
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {stockDetails && stockDetails.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Brand</TableHead>
                    <TableHead className="font-semibold">Model</TableHead>
                    <TableHead className="font-semibold">Warna</TableHead>
                    <TableHead className="font-semibold">Kapasitas</TableHead>
                    <TableHead className="font-semibold">Lokasi</TableHead>
                    <TableHead className="font-semibold text-right">Jumlah</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockDetails.map((item, index) => (
                    <TableRow key={index} className="hover:bg-muted/50 transition-colors">
                      <TableCell>
                        <Badge variant="outline" className="font-semibold">
                          {item.brand}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{item.model}</TableCell>
                      <TableCell>
                        <Badge 
                          className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-foreground border-purple-500/30"
                        >
                          {item.color}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{item.storage_capacity}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <MapPin className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{item.location}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge 
                          variant="default" 
                          className="text-base font-bold px-3 py-1"
                        >
                          {item.count}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="w-16 h-16 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Tidak Ada Stok</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Tidak ada stok tersedia untuk tanggal yang dipilih.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
