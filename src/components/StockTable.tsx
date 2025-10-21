import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Search, Filter, Edit, Eye, ArrowRightLeft, Trash2, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { EditStockDialog } from "./EditStockDialog";
import { EditStockInline } from "./EditStockInline";
import { TransferStockDialog } from "./TransferStockDialog";
import { SaleConfirmationDialog } from "./SaleConfirmationDialog";
import { cn } from "@/lib/utils";

interface StockTableProps {
  selectedDate: Date;
}

export interface StockEntry {
  id: string;
  date: string;
  imei: string | null;
  morning_stock: number;
  night_stock: number;
  incoming: number;
  add_stock: number;
  returns: number;
  sold: number;
  adjustment: number;
  notes: string | null;
  selling_price: number;
  sale_date: string | null;
  profit_loss: number;
  cost_price: number;
  stock_locations: {
    id: string;
    name: string;
  };
  phone_models: {
    id: string;
    brand: string;
    model: string;
    storage_capacity: string | null;
    color: string | null;
    srp: number;
  };
}

export function StockTable({ selectedDate }: StockTableProps) {
  // Load filters from localStorage
  const [searchTerm, setSearchTerm] = useState(() => {
    return localStorage.getItem('stockTableSearchTerm') || "";
  });
  const [brandFilter, setBrandFilter] = useState(() => {
    return localStorage.getItem('stockTableBrandFilter') || "all";
  });
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSaleConfirmDialogOpen, setIsSaleConfirmDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<StockEntry | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Save search term to localStorage when it changes
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    localStorage.setItem('stockTableSearchTerm', value);
  };

  // Save brand filter to localStorage when it changes
  const handleBrandFilterChange = (value: string) => {
    setBrandFilter(value);
    localStorage.setItem('stockTableBrandFilter', value);
  };

  const { data: stockEntries, isLoading } = useQuery({
    queryKey: ['stock-entries', searchTerm, brandFilter, selectedDate],
    queryFn: async (): Promise<StockEntry[]> => {
      const date = format(selectedDate, "yyyy-MM-dd");

      const { data, error } = await supabase
        .from('stock_entries')
        .select(`
          *,
          stock_locations(id, name),
          phone_models(id, brand, model, storage_capacity, color, srp)
        `)
        .eq('date', date)
        .order('created_at', { ascending: false });
      
      if (error) throw error;

      let filtered = data || [];

      // Filter out aggregated entries (imei = null) to avoid showing duplicate stock counts
      // Only show individual entries with specific IMEI or entries with actual stock movements
      filtered = filtered.filter(entry => {
        // Show entries with IMEI (individual items)
        if (entry.imei) return true;
        
        // Show aggregated entries only if they have actual stock movements (incoming, sold, etc.)
        if (entry.incoming > 0 || entry.sold > 0 || entry.returns > 0 || entry.adjustment !== 0) {
          return true;
        }
        
        // Hide empty aggregated entries
        return false;
      });

      // Apply search filter
      if (searchTerm) {
        filtered = filtered.filter(entry => 
          entry.phone_models?.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          entry.phone_models?.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          entry.imei?.includes(searchTerm) ||
          entry.phone_models?.color?.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }

      // Apply brand filter
      if (brandFilter !== 'all') {
        filtered = filtered.filter(entry => 
          entry.phone_models?.brand === brandFilter
        );
      }

      return filtered;
    }
  });

  const { data: brands } = useQuery({
    queryKey: ['phone-brands'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('phone_models')
        .select('brand')
        .order('brand');
      
      if (error) throw error;
      
      const uniqueBrands = [...new Set(data?.map(item => item.brand) || [])];
      return uniqueBrands;
    }
  });

  const getStockStatus = (entry: StockEntry) => {
    if (entry.sold > 0) return { label: "Terjual", variant: "destructive" as const };
    return { label: "Tersedia", variant: "success" as const };
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Get the stock entry details first
      const { data: stockEntry, error: fetchError } = await supabase
        .from('stock_entries')
        .select('imei, date, location_id, phone_model_id')
        .eq('id', id)
        .single();

      if (fetchError) throw new Error(`Gagal mengambil data stok: ${fetchError.message}`);
      if (!stockEntry) throw new Error('Data stok tidak ditemukan');

      // Delete from stock_events first (event-sourcing source of truth)
      const { error: eventError } = await supabase
        .from('stock_events')
        .delete()
        .eq('imei', stockEntry.imei)
        .eq('date', stockEntry.date)
        .eq('location_id', stockEntry.location_id)
        .eq('phone_model_id', stockEntry.phone_model_id);

      if (eventError) throw new Error(`Gagal menghapus event: ${eventError.message}`);

      // Delete from stock_entries
      const { error: entryError } = await supabase
        .from('stock_entries')
        .delete()
        .eq('id', id);

      if (entryError) throw new Error(`Gagal menghapus entri stok: ${entryError.message}`);
    },
    onSuccess: () => {
      toast({ title: "Sukses", description: "Entri stok telah berhasil dihapus." });
      queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
    },
    onError: (error) => {
      toast({ title: "Error", description: `Gagal menghapus entri: ${error.message}`, variant: "destructive" });
    },
    onSettled: () => {
      setIsDeleteDialogOpen(false);
      setSelectedEntry(null);
    }
  });

  const markAsSoldMutation = useMutation({
    mutationFn: async ({ entry, saleData }: { 
      entry: StockEntry; 
      saleData: { price: number; date: Date; srp: number; costPrice: number } 
    }) => {
      // Use cost_price if available, otherwise use SRP for profit/loss calculation
      const costBasis = saleData.costPrice > 0 ? saleData.costPrice : saleData.srp;
      const profitLoss = saleData.price - costBasis;
      
      // 1. Write to stock_events (event-sourcing primary source)
      const { error: eventError } = await supabase
        .from('stock_events')
        .insert({
          date: format(saleData.date, 'yyyy-MM-dd'),
          imei: entry.imei || '',
          location_id: entry.stock_locations.id,
          phone_model_id: entry.phone_models.id,
          event_type: 'laku',
          qty: 1,
          notes: `Terjual - Harga: Rp ${saleData.price.toLocaleString('id-ID')}`,
          metadata: {
            selling_price: saleData.price,
            srp: saleData.srp,
            cost_price: costBasis,
            profit_loss: profitLoss
          }
        });
      
      if (eventError) throw new Error(`Gagal menyimpan event: ${eventError.message}`);

      // 2. Update stock_entries with selling price and profit/loss data
      const { error: updateError } = await supabase
        .from('stock_entries')
        .update({
          selling_price: saleData.price,
          sale_date: format(saleData.date, 'yyyy-MM-dd'),
          profit_loss: profitLoss,
          cost_price: costBasis
        })
        .eq('id', entry.id);

      if (updateError) throw new Error(`Gagal update data penjualan: ${updateError.message}`);

      // 3. Cascade recalculation happens automatically via database trigger
      // stock_entries will be updated automatically
    },
    onSuccess: (_, { saleData }) => {
      const costBasis = saleData.costPrice > 0 ? saleData.costPrice : saleData.srp;
      const profitLoss = saleData.price - costBasis;
      const message = profitLoss >= 0 
        ? `Stok terjual! Laba: Rp ${profitLoss.toLocaleString('id-ID')}` 
        : `Stok terjual. Rugi: Rp ${Math.abs(profitLoss).toLocaleString('id-ID')}`;
      
      toast({ 
        title: "Sukses", 
        description: message,
        variant: profitLoss >= 0 ? "default" : "destructive"
      });
      queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
      queryClient.invalidateQueries({ queryKey: ['stock-events'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (error) => {
      toast({ title: "Error", description: `Gagal menandai sebagai terjual: ${error.message}`, variant: "destructive" });
    },
    onSettled: () => {
      setIsSaleConfirmDialogOpen(false);
      setSelectedEntry(null);
    }
  });

  const handleDeleteClick = (entry: StockEntry) => {
    setSelectedEntry(entry);
    setIsDeleteDialogOpen(true);
  };

  const handleMarkAsSoldClick = (entry: StockEntry) => {
    setSelectedEntry(entry);
    setIsSaleConfirmDialogOpen(true);
  };

  const handleSaleConfirm = (saleData: { price: number; date: Date; srp: number; costPrice: number }) => {
    if (selectedEntry) {
      markAsSoldMutation.mutate({ entry: selectedEntry, saleData });
    }
  };

  const handleEditClick = (entry: StockEntry) => {
    setSelectedEntry(entry);
    setIsEditDialogOpen(true);
  };

  const handleTransferClick = (entry: StockEntry) => {
    setSelectedEntry(entry);
    setIsTransferDialogOpen(true);
  };

  return (
    <>
      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Inventori Stok
          </CardTitle>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari berdasarkan merk, model, IMEI, atau warna..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              value={brandFilter}
              onChange={(e) => handleBrandFilterChange(e.target.value)}
              className="bg-background border border-border rounded-lg px-3 py-2 text-sm min-w-32"
            >
              <option value="all">Semua Merk</option>
              {brands?.map(brand => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-12 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-border/50 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                     <TableHead className="min-w-[100px]">Tanggal</TableHead>
                     <TableHead className="min-w-[80px]">Lokasi</TableHead>
                     <TableHead className="min-w-[150px]">Tipe</TableHead>
                     <TableHead className="min-w-[120px]">IMEI</TableHead>
                     <TableHead className="min-w-[60px]">Awal</TableHead>
                     <TableHead className="min-w-[60px]">Akhir</TableHead>
                     <TableHead className="min-w-[100px]">Harga Jual</TableHead>
                     <TableHead className="min-w-[80px]">Status</TableHead>
                     <TableHead className="min-w-[140px]">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockEntries?.map((entry) => {
                    const status = getStockStatus(entry);
                    const isEditing = editingEntryId === entry.id;
                    
                    if (isEditing) {
                      return (
                        <TableRow key={entry.id} className="hover:bg-muted/20 transition-colors">
                          <TableCell colSpan={9} className="p-0">
                            <EditStockInline
                              stockEntry={entry}
                              onCancel={() => setEditingEntryId(null)}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    }
                    
                    return (
                      <TableRow key={entry.id} className="hover:bg-muted/20 transition-colors">
                        <TableCell className="font-medium">
                          {new Date(entry.date).toLocaleDateString('id-ID')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {entry.stock_locations?.name}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium text-sm">
                              {entry.phone_models?.brand} {entry.phone_models?.model}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {entry.phone_models?.storage_capacity} • {entry.phone_models?.color}
                            </div>
                          </div>
                        </TableCell>
                         <TableCell className="font-mono text-xs">
                           {entry.imei || "—"}
                         </TableCell>
                         <TableCell className="text-center">
                           <Badge variant="secondary" className="text-xs">
                             {entry.morning_stock}
                           </Badge>
                         </TableCell>
                         <TableCell className="text-center">
                           <Badge variant="outline" className="text-xs">
                             {entry.night_stock}
                           </Badge>
                         </TableCell>
                          <TableCell>
                            {entry.selling_price > 0 ? (
                              <div className="space-y-1">
                                <div className={cn(
                                  "text-sm font-medium",
                                  entry.profit_loss >= 0 ? "text-success" : "text-destructive"
                                )}>
                                  Rp {entry.selling_price.toLocaleString('id-ID')}
                                </div>
                                <div className={cn(
                                  "text-xs font-semibold",
                                  entry.profit_loss >= 0 ? "text-success" : "text-destructive"
                                )}>
                                  {entry.profit_loss >= 0 ? 'Untung' : 'Rugi'}: Rp {Math.abs(entry.profit_loss).toLocaleString('id-ID')}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                         </TableCell>
                         <TableCell>
                           <Badge variant={status.variant} className="text-xs">
                             {status.label}
                           </Badge>
                         </TableCell>
                        <TableCell className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleMarkAsSoldClick(entry)} disabled={entry.night_stock === 0}>
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleTransferClick(entry)} disabled={entry.night_stock === 0}>
                            <ArrowRightLeft className="h-4 w-4 text-blue-500" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingEntryId(entry.id)}>
                            <Edit className="h-4 w-4 text-yellow-500" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteClick(entry)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {stockEntries?.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  Tidak ada data stok ditemukan.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anda yakin?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak bisa dibatalkan. Ini akan menghapus entri stok secara permanen dari server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => selectedEntry && deleteMutation.mutate(selectedEntry.id)}>
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SaleConfirmationDialog
        open={isSaleConfirmDialogOpen}
        onOpenChange={setIsSaleConfirmDialogOpen}
        onConfirm={handleSaleConfirm}
        suggestedPrice={selectedEntry?.phone_models?.srp || 0}
        itemName={selectedEntry ? `${selectedEntry.phone_models?.brand} ${selectedEntry.phone_models?.model}` : ''}
        srp={selectedEntry?.phone_models?.srp || 0}
        costPrice={selectedEntry?.cost_price || 0}
      />

      <EditStockDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        stockEntry={selectedEntry}
      />

      <TransferStockDialog
        open={isTransferDialogOpen}
        onOpenChange={setIsTransferDialogOpen}
        stockEntry={selectedEntry}
      />
    </>
  );
}