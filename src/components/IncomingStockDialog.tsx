import { useState, useEffect, lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmableDialog } from "@/components/ConfirmableDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { Calendar as CalendarIcon, Camera, Plus, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
const BarcodeScanner = lazy(() => import("@/components/BarcodeScanner").then(m => ({ default: m.BarcodeScanner })));
import { LabelSelect } from "@/components/LabelSelect";
import { ColorSelect } from "@/components/ColorSelect";

interface IncomingStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ImeiEntry {
  imei: string;
  color: string;
  label: string;
}

export function IncomingStockDialog({ open, onOpenChange }: IncomingStockDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [selectedBrand, setSelectedBrand] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [imeiList, setImeiList] = useState<ImeiEntry[]>([{ imei: "", color: "", label: "" }]);
  const [scanningIndex, setScanningIndex] = useState<number | null>(null);
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

  // Reset form when brand changes
  useEffect(() => {
    setSelectedModel("");
  }, [selectedBrand]);

  const incomingStockMutation = useMutation({
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

      // Filter out empty entries
      const validEntries = imeiList.filter(entry => entry.imei.trim() !== "" || entry.color.trim() !== "");
      
      if (validEntries.length === 0) {
        throw new Error('Harap masukkan minimal 1 unit dengan IMEI dan warna');
      }

      // Validate each entry has both IMEI and color
      for (const entry of validEntries) {
        if (!entry.imei.trim()) {
          throw new Error('Semua unit harus memiliki IMEI');
        }
        if (!entry.color.trim()) {
          throw new Error('Semua unit harus memiliki warna');
        }
        if (entry.imei.length !== 15) {
          throw new Error(`IMEI ${entry.imei} harus 15 digit`);
        }
      }

      // Check for duplicates in the list
      const imeis = validEntries.map(e => e.imei);
      const duplicates = imeis.filter((imei, index) => imeis.indexOf(imei) !== index);
      if (duplicates.length > 0) {
        throw new Error(`IMEI duplikat: ${duplicates.join(", ")}`);
      }

      const date = format(selectedDate, "yyyy-MM-dd");

      // Check for duplicate IMEI in database
      const { data: existingStock, error: checkError } = await supabase
        .from('stock_events')
        .select('imei')
        .in('imei', imeis);

      if (checkError) throw new Error(`Gagal memeriksa IMEI: ${checkError.message}`);

      if (existingStock && existingStock.length > 0) {
        const existingImeis = existingStock.map(s => s.imei).join(", ");
        throw new Error(`IMEI sudah terdaftar: ${existingImeis}`);
      }

      // Get base model info - use the same model for all colors
      const { data: baseModel } = await supabase
        .from('phone_models')
        .select('*')
        .eq('id', selectedModel)
        .single();

      if (!baseModel) throw new Error('Model HP tidak ditemukan');

      // Create events using the same phone_model_id for all colors
      // Color info is stored in metadata only
      const eventsToInsert = validEntries.map(entry => ({
        date: date,
        imei: entry.imei.trim(),
        location_id: selectedLocation,
        phone_model_id: baseModel.id, // Same model for all colors
        event_type: 'masuk',
        qty: 1,
        notes: null,
        metadata: { color: entry.color.trim() },
        label: entry.label.trim() || null
      }));

      const { error: eventError } = await supabase
        .from('stock_events')
        .insert(eventsToInsert);

      if (eventError) {
        throw new Error(`Gagal menyimpan event: ${eventError.message}`);
      }
    },
    onSuccess: () => {
      toast({
        title: "Berhasil",
        description: `${imeiList.filter(e => e.imei.trim()).length} unit berhasil dicatat`,
      });
      queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      onOpenChange(false);
      // Reset form
      setSelectedDate(new Date());
      setSelectedLocation("");
      setSelectedBrand("");
      setSelectedModel("");
      setImeiList([{ imei: "", color: "", label: "" }]);
    },
    onError: (error: any) => {
      toast({
        title: "Gagal",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const isDirty = !!(
    selectedLocation || selectedBrand || selectedModel ||
    imeiList.some(e => e.imei.trim() || e.color.trim() || e.label.trim())
  );

  return (
    <ConfirmableDialog open={open} onOpenChange={onOpenChange} isDirty={isDirty}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader className="sticky top-0 bg-background z-10 pb-4">
          <DialogTitle>HP Datang</DialogTitle>
          <DialogDescription>
            Rekap HP datang
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
                    {model.model} {model.storage_capacity && `- ${model.storage_capacity}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>IMEI & Warna * (15 digit per unit)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setImeiList([...imeiList, { imei: "", color: "", label: "" }])}
              >
                <Plus className="h-4 w-4 mr-1" />
                Tambah Unit
              </Button>
            </div>
            
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
              {imeiList.map((entry, index) => (
                <div key={index} className="p-3 border rounded-lg bg-muted/30 space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Unit #{index + 1}</span>
                    {imeiList.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const newList = imeiList.filter((_, i) => i !== index);
                          setImeiList(newList.length === 0 ? [{ imei: "", color: "", label: "" }] : newList);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="IMEI (15 digit)"
                      value={entry.imei}
                      onChange={(e) => {
                        const newList = [...imeiList];
                        newList[index].imei = e.target.value;
                        setImeiList(newList);
                      }}
                      maxLength={15}
                      inputMode="numeric"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setScanningIndex(index)}
                    >
                      <Camera className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Warna</span>
                    <ColorSelect
                      value={entry.color}
                      onValueChange={(val) => {
                        const newList = [...imeiList];
                        newList[index].color = val;
                        setImeiList(newList);
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Label</span>
                    <LabelSelect
                      value={entry.label}
                      onValueChange={(val) => {
                        const newList = [...imeiList];
                        newList[index].label = val;
                        setImeiList(newList);
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">Scan atau input manual untuk setiap unit</p>
          </div>


          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Batal
            </Button>
            <Button 
              onClick={() => incomingStockMutation.mutate()} 
              disabled={incomingStockMutation.isPending}
              className="flex-1"
            >
              {incomingStockMutation.isPending ? "Memproses..." : "Rekap HP Datang"}
            </Button>
          </div>
        </div>
      </DialogContent>

      <Suspense fallback={null}><BarcodeScanner
        open={scanningIndex !== null}
        onOpenChange={(open) => !open && setScanningIndex(null)}
        onScanSuccess={(scannedImei) => {
          if (scanningIndex !== null) {
            const newList = [...imeiList];
            newList[scanningIndex].imei = scannedImei;
            setImeiList(newList);
            setScanningIndex(null);
          }
        }}
      />
    </ConfirmableDialog>
  );
}
