import { useState, lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmableDialog } from "@/components/ConfirmableDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { Calendar as CalendarIcon, Camera, Plus, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
const BarcodeScanner = lazy(() => import("@/components/BarcodeScanner").then(m => ({ default: m.BarcodeScanner })));
import { LabelSelect } from "@/components/LabelSelect";
import { ColorSelect } from "@/components/ColorSelect";

interface BulkIncomingStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface BulkEntry {
  brand: string;
  model: string;
  imei: string;
  color: string;
  label: string;
}

export function BulkIncomingStockDialog({ open, onOpenChange }: BulkIncomingStockDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [entries, setEntries] = useState<BulkEntry[]>([{ brand: "", model: "", imei: "", color: "", label: "" }]);
  const [scanningIndex, setScanningIndex] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: locations } = useQuery({
    queryKey: ['stock-locations-names'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stock_locations').select('id, name').order('name');
      if (error) throw error;
      return data;
    }
  });

  const { data: brands } = useQuery({
    queryKey: ['brands'],
    queryFn: async () => {
      const { data, error } = await supabase.from('phone_models').select('brand').order('brand');
      if (error) throw error;
      return [...new Set(data.map(item => item.brand))];
    }
  });

  // Fetch all phone models at once
  const { data: allModels } = useQuery({
    queryKey: ['all-phone-models'],
    queryFn: async () => {
      const { data, error } = await supabase.from('phone_models').select('*').order('model');
      if (error) throw error;
      return data;
    }
  });

  const getModelsForBrand = (brand: string) => {
    if (!allModels || !brand) return [];
    return allModels.filter(m => m.brand === brand);
  };

  const updateEntry = (index: number, field: keyof BulkEntry, value: string) => {
    const newEntries = [...entries];
    newEntries[index] = { ...newEntries[index], [field]: value };
    // Reset model when brand changes
    if (field === 'brand') {
      newEntries[index].model = "";
    }
    setEntries(newEntries);
  };

  const addEntry = () => {
    // Pre-fill brand/model from last entry for convenience
    const last = entries[entries.length - 1];
    setEntries([...entries, { brand: last.brand, model: last.model, imei: "", color: "", label: last.label }]);
  };

  const removeEntry = (index: number) => {
    const newEntries = entries.filter((_, i) => i !== index);
    setEntries(newEntries.length === 0 ? [{ brand: "", model: "", imei: "", color: "", label: "" }] : newEntries);
  };

  const bulkMutation = useMutation({
    mutationFn: async () => {
      if (!selectedLocation) throw new Error('Lokasi wajib dipilih');

      const validEntries = entries.filter(e => e.imei.trim() !== "");
      if (validEntries.length === 0) throw new Error('Harap masukkan minimal 1 unit');

      // Validate each entry
      for (let i = 0; i < validEntries.length; i++) {
        const e = validEntries[i];
        if (!e.brand) throw new Error(`Unit #${i + 1}: Merk wajib dipilih`);
        if (!e.model) throw new Error(`Unit #${i + 1}: Model wajib dipilih`);
        if (!e.imei.trim()) throw new Error(`Unit #${i + 1}: IMEI wajib diisi`);
        if (e.imei.length !== 15) throw new Error(`Unit #${i + 1}: IMEI harus 15 digit`);
        if (!e.color.trim()) throw new Error(`Unit #${i + 1}: Warna wajib diisi`);
      }

      // Check duplicate IMEIs in list
      const imeis = validEntries.map(e => e.imei);
      const dupes = imeis.filter((v, i) => imeis.indexOf(v) !== i);
      if (dupes.length > 0) throw new Error(`IMEI duplikat: ${dupes.join(", ")}`);

      // Check duplicate in DB
      const { data: existing } = await supabase.from('stock_events').select('imei').in('imei', imeis);
      if (existing && existing.length > 0) {
        throw new Error(`IMEI sudah terdaftar: ${existing.map(s => s.imei).join(", ")}`);
      }

      const date = format(selectedDate, "yyyy-MM-dd");

      const eventsToInsert = validEntries.map(e => ({
        date,
        imei: e.imei.trim(),
        location_id: selectedLocation,
        phone_model_id: e.model, // model field stores the phone_model_id
        event_type: 'masuk',
        qty: 1,
        notes: null,
        metadata: { color: e.color.trim() },
        label: e.label.trim() || null,
      }));

      const { error } = await supabase.from('stock_events').insert(eventsToInsert);
      if (error) throw new Error(`Gagal menyimpan: ${error.message}`);
    },
    onSuccess: () => {
      const count = entries.filter(e => e.imei.trim()).length;
      toast({ title: "Berhasil", description: `${count} unit berhasil dicatat` });
      queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      onOpenChange(false);
      setSelectedDate(new Date());
      setSelectedLocation("");
      setEntries([{ brand: "", model: "", imei: "", color: "", label: "" }]);
    },
    onError: (error: any) => {
      toast({ title: "Gagal", description: error.message, variant: "destructive" });
    }
  });

  const isDirty = !!(
    selectedLocation ||
    entries.some(e => e.brand || e.model || e.imei.trim() || e.color.trim() || e.label.trim())
  );

  return (
    <ConfirmableDialog open={open} onOpenChange={onOpenChange} isDirty={isDirty}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="sticky top-0 bg-background z-10 pb-4">
          <DialogTitle>HP Datang Massal</DialogTitle>
          <DialogDescription>
            Tambah banyak HP sekaligus, bisa beda merk & tipe
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pb-4">
          {/* Date */}
          <div className="space-y-2">
            <Label>Tanggal</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal", !selectedDate && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "PPP", { locale: id }) : "Pilih tanggal"}
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

          {/* Location */}
          <div className="space-y-2">
            <Label>Lokasi</Label>
            <Select value={selectedLocation} onValueChange={setSelectedLocation}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih lokasi" />
              </SelectTrigger>
              <SelectContent>
                {locations?.map(loc => (
                  <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Entries */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Daftar HP ({entries.length} unit)</Label>
              <Button type="button" variant="outline" size="sm" onClick={addEntry}>
                <Plus className="h-4 w-4 mr-1" /> Tambah Unit
              </Button>
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {entries.map((entry, idx) => (
                <div key={idx} className="p-3 border rounded-lg bg-muted/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Unit #{idx + 1}</span>
                    {entries.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeEntry(idx)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {/* Brand & Model row */}
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={entry.brand} onValueChange={(v) => updateEntry(idx, 'brand', v)}>
                      <SelectTrigger className="text-xs h-9">
                        <SelectValue placeholder="Merk" />
                      </SelectTrigger>
                      <SelectContent>
                        {brands?.map(b => (
                          <SelectItem key={b} value={b}>{b}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={entry.model}
                      onValueChange={(v) => updateEntry(idx, 'model', v)}
                      disabled={!entry.brand}
                    >
                      <SelectTrigger className="text-xs h-9">
                        <SelectValue placeholder="Model" />
                      </SelectTrigger>
                      <SelectContent>
                        {getModelsForBrand(entry.brand).map(m => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.model} {m.storage_capacity && `- ${m.storage_capacity}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* IMEI + scan */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="IMEI (15 digit)"
                      value={entry.imei}
                      onChange={(e) => updateEntry(idx, 'imei', e.target.value)}
                      maxLength={15}
                      inputMode="numeric"
                      className="flex-1 h-9 text-xs"
                    />
                    <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => setScanningIndex(idx)}>
                      <Camera className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <ColorSelect
                      value={entry.color}
                      onValueChange={(v) => updateEntry(idx, 'color', v)}
                      className="h-9 text-xs"
                    />
                    <LabelSelect
                      value={entry.label}
                      onValueChange={(v) => updateEntry(idx, 'label', v)}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Batal
            </Button>
            <Button
              onClick={() => bulkMutation.mutate()}
              disabled={bulkMutation.isPending}
              className="flex-1"
            >
              {bulkMutation.isPending ? "Memproses..." : `Rekap ${entries.filter(e => e.imei.trim()).length} Unit`}
            </Button>
          </div>
        </div>
      </DialogContent>

      <Suspense fallback={null}><BarcodeScanner
        open={scanningIndex !== null}
        onOpenChange={(o) => !o && setScanningIndex(null)}
        onScanSuccess={(scannedImei) => {
          if (scanningIndex !== null) {
            updateEntry(scanningIndex, 'imei', scannedImei);
            setScanningIndex(null);
          }
        }}
      />
    </ConfirmableDialog>
  );
}
