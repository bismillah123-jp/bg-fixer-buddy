import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
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
import { Search, RotateCcw, Edit2, ArrowRightLeft, Trash2, CheckCircle, Package, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { EditStockDialog } from "./EditStockDialog";
import { TransferStockDialog } from "./TransferStockDialog";
import { SaleConfirmationDialog } from "./SaleConfirmationDialog";
import { cn } from "@/lib/utils";
import { useLabels } from "@/hooks/useLabels";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface StockTableProps {
  selectedDate: Date;
  quickFilter?: 'incoming' | 'sold' | 'transfer' | null;
  onFilterChange?: () => void;
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
  metadata?: any;
  label?: string | null;
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

export function StockTable({ selectedDate, quickFilter, onFilterChange }: StockTableProps) {
  const { data: labelsData } = useLabels();
  const labelColorMap = new Map(labelsData?.map(l => [l.name, l.color]) || []);
  // Load filters from localStorage
  const [searchTerm, setSearchTerm] = useState(() => {
    return localStorage.getItem('stockTableSearchTerm') || "";
  });
  const [brandFilter, setBrandFilter] = useState(() => {
    return localStorage.getItem('stockTableBrandFilter') || "all";
  });
  const [locationFilter, setLocationFilter] = useState(() => {
    return localStorage.getItem('stockTableLocationFilter') || "all";
  });
  const [statusFilter, setStatusFilter] = useState(() => {
    return localStorage.getItem('stockTableStatusFilter') || "all";
  });

  // Apply quick filter from dashboard
  useEffect(() => {
    if (quickFilter) {
      if (quickFilter === 'incoming') {
        setStatusFilter('tersedia');
      } else if (quickFilter === 'sold') {
        setStatusFilter('terjual');
      } else if (quickFilter === 'transfer') {
        setStatusFilter('tersedia');
      }
    }
  }, [quickFilter]);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSaleConfirmDialogOpen, setIsSaleConfirmDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<StockEntry | null>(null);
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

  // Save location filter to localStorage when it changes
  const handleLocationFilterChange = (value: string) => {
    setLocationFilter(value);
    localStorage.setItem('stockTableLocationFilter', value);
  };

  // Save status filter to localStorage when it changes
  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    localStorage.setItem('stockTableStatusFilter', value);
  };

  // Reset filters on component unmount or page refresh
  useEffect(() => {
    return () => {
      // Clear all filters when leaving the component
      localStorage.removeItem('stockTableSearchTerm');
      localStorage.removeItem('stockTableBrandFilter');
      localStorage.removeItem('stockTableLocationFilter');
      localStorage.removeItem('stockTableStatusFilter');
    };
  }, []);

  const { data: stockEntries, isLoading } = useQuery({
    queryKey: ['stock-entries', searchTerm, brandFilter, locationFilter, statusFilter, selectedDate],
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

      // Only show entries with IMEI (individual items)
      // This ensures each row represents a unique phone
      filtered = filtered.filter(entry => entry.imei && entry.imei.trim() !== '');

      // Quick filter logic
      if (quickFilter === 'incoming') {
        filtered = filtered.filter(entry => entry.incoming > 0);
      } else if (quickFilter === 'sold') {
        filtered = filtered.filter(entry => entry.sold > 0);
      } else if (quickFilter === 'transfer') {
        filtered = filtered.filter(entry => entry.adjustment !== 0);
      }

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

      // Apply location filter
      if (locationFilter !== 'all') {
        filtered = filtered.filter(entry => 
          entry.stock_locations?.name === locationFilter
        );
      }

      // Apply status filter
      // IMPORTANT: Items with sale_date should NEVER appear as "tersedia"
      // This ensures sold phones from previous days don't show up in today's available stock
      if (statusFilter === 'tersedia') {
        filtered = filtered.filter(entry => entry.night_stock > 0 && !entry.sale_date);
      } else if (statusFilter === 'terjual') {
        filtered = filtered.filter(entry => entry.sold > 0 || entry.sale_date);
      } else if (statusFilter === 'all') {
        // For "all" status, still exclude items that have been sold (have sale_date) 
        // unless they were sold today (sold > 0)
        filtered = filtered.filter(entry => {
          // Keep if it has stock
          if (entry.night_stock > 0 && !entry.sale_date) return true;
          // Keep if it was sold today
          if (entry.sold > 0) return true;
          // Exclude everything else (ghost entries from rollover that were sold previously)
          return false;
        });
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

  const { data: locations } = useQuery({
    queryKey: ['stock-locations-names'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_locations')
        .select('name')
        .order('name');
      
      if (error) throw error;
      
      return data?.map(item => item.name) || [];
    }
  });

  const getStockStatus = (entry: StockEntry) => {
    // Check if item was sold (either sold on this date OR has a sale_date set)
    if (entry.sold > 0 || entry.sale_date) return { label: "Terjual", variant: "destructive" as const };
    // Check current stock level
    if (entry.night_stock > 0) return { label: "Tersedia", variant: "success" as const };
    // If no stock and not sold, might be transferred or other
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

      // Cascade recalculation to update morning_stock and night_stock for future dates
      const { error: recalcError } = await supabase.rpc('cascade_recalc_stock_with_imei', {
        p_from_date: stockEntry.date,
        p_to_date: format(new Date(), 'yyyy-MM-dd'),
        p_location_id: stockEntry.location_id,
        p_phone_model_id: stockEntry.phone_model_id,
        p_imei: stockEntry.imei
      });

      if (recalcError) {
        console.warn('Warning: Recalculation failed but delete succeeded:', recalcError);
      }
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

  const hasActiveFilters = searchTerm || brandFilter !== 'all' || locationFilter !== 'all' || statusFilter !== 'all';

  return (
    <>
      <div className="space-y-4">
        {/* Compact Filter Bar */}
        <Card className="border-0 shadow-sm bg-card/50 backdrop-blur">
          <CardContent className="p-4">
            <div className="flex flex-col gap-3">
              {/* Search + Quick Filter Badge */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari model, IMEI, warna..."
                    value={searchTerm}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-9 h-10 bg-background/80"
                  />
                </div>
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearchTerm("");
                      setBrandFilter("all");
                      setLocationFilter("all");
                      setStatusFilter("all");
                      localStorage.removeItem('stockTableSearchTerm');
                      localStorage.removeItem('stockTableBrandFilter');
                      localStorage.removeItem('stockTableLocationFilter');
                      localStorage.removeItem('stockTableStatusFilter');
                    }}
                    className="h-10 px-3 text-muted-foreground hover:text-foreground"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Filter Dropdowns */}
              <div className="flex flex-wrap gap-2">
                <Select value={brandFilter} onValueChange={handleBrandFilterChange}>
                  <SelectTrigger className="w-[140px] h-9 text-sm">
                    <SelectValue placeholder="Semua Merk" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Merk</SelectItem>
                    {brands?.map(brand => (
                      <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={locationFilter} onValueChange={handleLocationFilterChange}>
                  <SelectTrigger className="w-[140px] h-9 text-sm">
                    <SelectValue placeholder="Semua Lokasi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Lokasi</SelectItem>
                    {locations?.map(location => (
                      <SelectItem key={location} value={location}>{location}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
                  <SelectTrigger className="w-[130px] h-9 text-sm">
                    <SelectValue placeholder="Semua Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Status</SelectItem>
                    <SelectItem value="tersedia">Tersedia</SelectItem>
                    <SelectItem value="terjual">Terjual</SelectItem>
                  </SelectContent>
                </Select>

                {quickFilter && (
                  <Badge variant="secondary" className="h-9 px-3 flex items-center gap-2">
                    {quickFilter === 'incoming' ? 'HP Datang' : quickFilter === 'sold' ? 'Laku' : 'Transfer'}
                    <button onClick={onFilterChange} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stock Items */}
        {isLoading ? (
          <div className="grid gap-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-24 bg-muted/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : stockEntries?.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-16 text-center">
              <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground font-medium">Tidak ada data stok</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Coba ubah filter atau tanggal</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2">
            {stockEntries?.map((entry) => {
              const status = getStockStatus(entry);
              const isSold = entry.sold > 0 || entry.sale_date;
              
              return (
                <Card 
                  key={entry.id} 
                  className={cn(
                    "border-0 shadow-sm hover:shadow-md transition-all overflow-hidden",
                    isSold && "opacity-70"
                  )}
                >
                  <CardContent className="p-0">
                    <div className="flex items-stretch">
                      {/* Main Content */}
                      <div className="flex-1 p-4">
                        <div className="flex items-start justify-between gap-4">
                          {/* Left: Product Info */}
                          <div className="space-y-2 min-w-0 flex-1">
                            {/* Brand & Model */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="secondary" className="font-semibold text-xs">
                                {entry.phone_models?.brand}
                              </Badge>
                              <span className="font-medium text-sm truncate">
                                {entry.phone_models?.model}
                              </span>
                              {entry.phone_models?.storage_capacity && (
                                <Badge variant="outline" className="text-xs font-normal">
                                  {entry.phone_models?.storage_capacity}
                                </Badge>
                              )}
                            </div>

                            {/* Details Row */}
                            <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                              {/* Location */}
                              <span className="font-medium text-foreground">
                                📍 {entry.stock_locations?.name}
                              </span>
                              
                              {/* Color */}
                              {(entry.metadata?.color || entry.phone_models?.color) && (
                                <span>🎨 {entry.metadata?.color || entry.phone_models?.color}</span>
                              )}
                              
                              {/* Label */}
                              {entry.label && (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                                  style={{
                                    backgroundColor: `${labelColorMap.get(entry.label) || '#6B7280'}20`,
                                    color: labelColorMap.get(entry.label) || '#6B7280',
                                    border: `1px solid ${labelColorMap.get(entry.label) || '#6B7280'}40`,
                                  }}
                                >
                                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: labelColorMap.get(entry.label) || '#6B7280' }} />
                                  {entry.label}
                                </span>
                              )}
                            </div>

                            {/* IMEI */}
                            <div className="font-mono text-xs text-muted-foreground">
                              IMEI: {entry.imei || "—"}
                            </div>
                          </div>

                          {/* Right: Stock & Status */}
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <Badge 
                              variant={status.variant}
                              className="text-xs"
                            >
                              {status.label}
                            </Badge>
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-muted-foreground">{entry.morning_stock}</span>
                              <span className="text-muted-foreground">→</span>
                              <span className={cn(
                                "font-bold text-base",
                                entry.night_stock > 0 ? "text-primary" : "text-muted-foreground"
                              )}>
                                {entry.night_stock}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons - Side Strip */}
                      <div className="flex flex-col border-l bg-muted/30">
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-10 w-10 rounded-none",
                            entry.night_stock > 0 && "hover:bg-success/10 hover:text-success"
                          )}
                          onClick={() => handleMarkAsSoldClick(entry)}
                          disabled={entry.night_stock === 0}
                          title="Tandai Terjual"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-10 w-10 rounded-none",
                            entry.night_stock > 0 && "hover:bg-primary/10 hover:text-primary"
                          )}
                          onClick={() => handleTransferClick(entry)}
                          disabled={entry.night_stock === 0}
                          title="Transfer"
                        >
                          <ArrowRightLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 rounded-none hover:bg-warning/10 hover:text-warning"
                          onClick={() => handleEditClick(entry)}
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 rounded-none hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => handleDeleteClick(entry)}
                          title="Hapus"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Results Count */}
        {stockEntries && stockEntries.length > 0 && (
          <p className="text-center text-sm text-muted-foreground">
            Menampilkan {stockEntries.length} item
          </p>
        )}
      </div>

      {/* Dialogs */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Stok?</AlertDialogTitle>
            <AlertDialogDescription>
              Data stok ini akan dihapus permanen dan tidak bisa dikembalikan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => selectedEntry && deleteMutation.mutate(selectedEntry.id)}
              className="bg-destructive hover:bg-destructive/90"
            >
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