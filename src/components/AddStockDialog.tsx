import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface AddStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddStockDialog({ open, onOpenChange }: AddStockDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [selectedBrand, setSelectedBrand] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [imei, setImei] = useState<string>("");
  const [costPrice, setCostPrice] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch locations
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

  // Fetch brands
  const { data: brands } = useQuery({
    queryKey: ['brands'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('phone_models')
        .select('brand')
        .order('brand');
      if (error) throw error;
      return [...new Set(data.map(item => item.brand))];
    }
  });

  // Fetch models based on selected brand
  const { data: phoneModels } = useQuery({
    queryKey: ['phone-models', selectedBrand],
    queryFn: async () => {
      if (!selectedBrand) return [];
      const { data, error } = await supabase
        .from('phone_models')
        .select('*')
        .eq('brand', selectedBrand)
        .order('model');
      if (error) throw error;
      return data;
    },
    enabled: !!selectedBrand
  });

  // Auto-fill cost price with SRP when model is selected
  useEffect(() => {
    if (selectedModel && phoneModels) {
      const model = phoneModels.find(m => m.id === selectedModel);
      if (model && model.srp && model.srp > 0) {
        setCostPrice(model.srp.toLocaleString('id-ID'));
      }
    }
  }, [selectedModel, phoneModels]);

  const addStockMutation = useMutation({
    mutationFn: async () => {
      // Validation
      if (!selectedLocation) {
        throw new Error('Lokasi wajib dipilih');
      }
      if (!selectedBrand) {
        throw new Error('Merk wajib dipilih');
      }
      if (!selectedModel) {
        throw new Error('Model HP wajib dipilih');
      }
      if (!imei.trim()) {
        throw new Error('IMEI wajib diisi');
      }
      if (imei.trim().length < 10) {
        throw new Error('IMEI tidak valid (minimal 10 karakter)');
      }

      const date = format(selectedDate, "yyyy-MM-dd");
      const quantityNum = 1; // Always 1 since 1 IMEI = 1 stock

      // Ensure base stock_entries row exists to avoid NULL morning_stock during cascade
      const { data: existingEntryList, error: findSeedError } = await supabase
        .from('stock_entries')
        .select('id')
        .eq('date', date)
        .eq('location_id', selectedLocation)
        .eq('phone_model_id', selectedModel)
        .eq('imei', null); // Only check aggregated entries (NULL imei)

      if (findSeedError) {
        throw new Error(`Gagal memeriksa entri stok: ${findSeedError.message}`);
      }

      const existingEntry = existingEntryList && existingEntryList.length > 0 ? existingEntryList[0] : null;

      if (!existingEntry) {
        const { error: insertSeedError } = await supabase
          .from('stock_entries')
          .insert({
            date,
            location_id: selectedLocation,
            phone_model_id: selectedModel,
            imei: null,  // Use NULL for aggregated entries
            morning_stock: 0,
            incoming: 0,
            sold: 0,
            returns: 0,
            adjustment: 0,
            night_stock: 0
          });

        if (insertSeedError) {
          throw new Error(`Gagal menyiapkan entri stok: ${insertSeedError.message}`);
        }
      }

      // Stock correction no longer requires prior "HP Datang" entry

      // Parse cost price - remove dots and convert to number
      const costPriceNum = costPrice ? parseInt(costPrice.replace(/\./g, '')) : 0;

      // Check if this IMEI already exists in stock_events (event-sourcing source of truth)
      const { data: existingImei, error: checkError } = await supabase
        .from('stock_events')
        .select('id, event_type, date')
        .eq('imei', imei.trim())
        .in('event_type', ['masuk', 'retur_in', 'koreksi']) // Only check incoming events
        .maybeSingle();

      if (checkError) throw new Error(`Gagal memeriksa IMEI: ${checkError.message}`);
      
      if (existingImei) {
        throw new Error(`Stok dengan IMEI ini sudah terdaftar di sistem (${existingImei.event_type} pada ${existingImei.date})`);
      }

      // Always use 'masuk' for new stock entries in this dialog
      const eventType = 'masuk';

      // 1. Write to stock_events (event-sourcing primary source)
      const { error: eventError } = await supabase
        .from('stock_events')
        .insert({
          date: date,
          imei: imei.trim(),
          location_id: selectedLocation,
          phone_model_id: selectedModel,
          event_type: eventType,
          qty: quantityNum,
          notes: notes || null,
          metadata: costPriceNum > 0 ? { cost_price: costPriceNum } : {}
        });

      if (eventError) {
        throw new Error(`Gagal menyimpan event: ${eventError.message}`);
      }

      // 2. Cascade recalculation happens automatically via database trigger
      // stock_entries will be updated automatically by cascade_recalc_stock()
      
      // Note: Old direct insert to stock_entries removed - now calculated from events
      // This ensures consistency and enables retroactive corrections
    },
    onSuccess: () => {
      toast({
        title: "Berhasil",
        description: "Stok berhasil ditambahkan",
      });
      queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      onOpenChange(false);
      // Reset form
      setSelectedLocation("");
      setSelectedDate(new Date());
      setSelectedBrand("");
      setSelectedModel("");
      setNotes("");
      setImei("");
      setCostPrice("");
    },
    onError: (error: any) => {
      toast({
        title: "Gagal",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader className="sticky top-0 bg-background z-10 pb-4">
          <DialogTitle>Tambah/Koreksi Stok</DialogTitle>
          <DialogDescription>
            Tambah stok baru atau koreksi stok yang sudah ada di sistem. Sistem akan otomatis menentukan jenis operasi berdasarkan IMEI.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 pb-4">
          <div className="space-y-2">
            <Label>Tanggal</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "PPP", { locale: id }) : <span>Pilih tanggal</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => d && setSelectedDate(d)}
                  disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-2">
            <Label>Lokasi</Label>
            <Select value={selectedLocation} onValueChange={setSelectedLocation}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih lokasi" />
              </SelectTrigger>
              <SelectContent>
                {locations?.map(location => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Merk</Label>
            <Select value={selectedBrand} onValueChange={setSelectedBrand}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih merk" />
              </SelectTrigger>
              <SelectContent>
                {brands?.map(brand => (
                  <SelectItem key={brand} value={brand}>
                    {brand}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Model HP</Label>
            <Select value={selectedModel} onValueChange={setSelectedModel} disabled={!selectedBrand}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih model HP" />
              </SelectTrigger>
              <SelectContent>
                {phoneModels?.map(model => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.model} {model.storage_capacity && `- ${model.storage_capacity}`} {model.color && `- ${model.color}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>IMEI *</Label>
            <Input
              placeholder="Masukkan IMEI (baru atau sudah ada)"
              value={imei}
              onChange={(e) => setImei(e.target.value)}
              inputMode="numeric"
              required
            />
            <p className="text-sm text-muted-foreground">📱 Bisa koreksi untuk IMEI baru maupun yang sudah ada</p>
          </div>

          <div className="space-y-2">
            <Label>Harga Modal</Label>
            <Input
              placeholder="Harga modal (auto-fill dari SRP)"
              value={costPrice}
              onChange={(e) => {
                const numOnly = e.target.value.replace(/\D/g, '');
                setCostPrice(numOnly ? parseInt(numOnly).toLocaleString('id-ID') : '');
              }}
              inputMode="numeric"
            />
            <p className="text-sm text-muted-foreground">
              💡 Auto-terisi dari SRP, bisa diedit kalau harga beli berbeda
            </p>
          </div>

          <div className="space-y-2">
            <Label>Catatan (Opsional)</Label>
            <Textarea
              placeholder="Tambahkan catatan..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Batal
            </Button>
            <Button 
              onClick={() => addStockMutation.mutate()} 
              disabled={addStockMutation.isPending}
              className="flex-1"
            >
              {addStockMutation.isPending ? "Memproses..." : "Tambah/Koreksi Stok"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}