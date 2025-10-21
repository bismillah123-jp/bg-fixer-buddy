import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Check, X, Edit3 } from 'lucide-react';
import { StockEntry } from './StockTable';

interface EditStockInlineProps {
  stockEntry: StockEntry;
  onCancel: () => void;
}

export function EditStockInline({ stockEntry, onCancel }: EditStockInlineProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    imei: stockEntry.imei || '',
    notes: stockEntry.notes || '',
    cost_price: stockEntry.cost_price || 0,
    selling_price: stockEntry.selling_price || 0,
    phone_model_id: stockEntry.phone_models.id,
    location_id: stockEntry.stock_locations.id
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch phone models for selection
  const { data: phoneModels } = useQuery({
    queryKey: ['phone-models'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('phone_models')
        .select('*')
        .order('brand, model');
      if (error) throw error;
      return data;
    }
  });

  // Fetch locations for selection
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

  const updateStockMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      // Validate IMEI if changed
      if (data.imei.trim() && data.imei.trim() !== stockEntry.imei) {
        if (data.imei.trim().length < 10) {
          throw new Error('IMEI tidak valid (minimal 10 karakter)');
        }
        
        // Check if new IMEI already exists
        const { data: existingImei, error: checkError } = await supabase
          .from('stock_entries')
          .select('id')
          .eq('imei', data.imei.trim())
          .neq('id', stockEntry.id)
          .maybeSingle();

        if (checkError) throw new Error(`Gagal memeriksa IMEI: ${checkError.message}`);
        
        if (existingImei) {
          throw new Error('IMEI ini sudah terdaftar untuk stok lain');
        }
      }

      // Update stock_entries
      const { error: updateError } = await supabase
        .from('stock_entries')
        .update({
          imei: data.imei.trim() || null,
          notes: data.notes.trim() || null,
          cost_price: data.cost_price || 0,
          selling_price: data.selling_price || 0,
          phone_model_id: data.phone_model_id,
          location_id: data.location_id
        })
        .eq('id', stockEntry.id);

      if (updateError) throw new Error(`Gagal update stok: ${updateError.message}`);

      // If phone model or location changed, we need to update stock_events too
      if (data.phone_model_id !== stockEntry.phone_models.id || 
          data.location_id !== stockEntry.stock_locations.id) {
        
        // Find the corresponding stock_events
        const { data: events, error: eventsError } = await supabase
          .from('stock_events')
          .select('id')
          .eq('imei', stockEntry.imei)
          .eq('date', stockEntry.date);

        if (eventsError) throw new Error(`Gagal update events: ${eventsError.message}`);

        // Update all related events
        for (const event of events) {
          const { error: eventUpdateError } = await supabase
            .from('stock_events')
            .update({
              phone_model_id: data.phone_model_id,
              location_id: data.location_id
            })
            .eq('id', event.id);

          if (eventUpdateError) throw new Error(`Gagal update event: ${eventUpdateError.message}`);
        }
      }
    },
    onSuccess: () => {
      toast({
        title: "Berhasil",
        description: "Stok berhasil diperbarui",
      });
      queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleSave = () => {
    updateStockMutation.mutate(formData);
  };

  const handleCancel = () => {
    setFormData({
      imei: stockEntry.imei || '',
      notes: stockEntry.notes || '',
      cost_price: stockEntry.cost_price || 0,
      selling_price: stockEntry.selling_price || 0,
      phone_model_id: stockEntry.phone_models.id,
      location_id: stockEntry.stock_locations.id
    });
    setIsEditing(false);
    onCancel();
  };

  if (!isEditing) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsEditing(true)}
        className="h-8 w-8 p-0"
      >
        <Edit3 className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <div className="space-y-2 p-4 border rounded-lg bg-card">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">IMEI</label>
          <Input
            value={formData.imei}
            onChange={(e) => setFormData(prev => ({ ...prev, imei: e.target.value }))}
            placeholder="Masukkan IMEI"
            className="mt-1"
          />
        </div>
        
        <div>
          <label className="text-sm font-medium">Harga Modal</label>
          <Input
            type="number"
            value={formData.cost_price}
            onChange={(e) => setFormData(prev => ({ ...prev, cost_price: Number(e.target.value) }))}
            placeholder="Harga modal"
            className="mt-1"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Harga Jual</label>
          <Input
            type="number"
            value={formData.selling_price}
            onChange={(e) => setFormData(prev => ({ ...prev, selling_price: Number(e.target.value) }))}
            placeholder="Harga jual"
            className="mt-1"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Model HP</label>
          <Select
            value={formData.phone_model_id}
            onValueChange={(value) => setFormData(prev => ({ ...prev, phone_model_id: value }))}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {phoneModels?.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.brand} {model.model} {model.storage_capacity}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium">Lokasi</label>
          <Select
            value={formData.location_id}
            onValueChange={(value) => setFormData(prev => ({ ...prev, location_id: value }))}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {locations?.map((location) => (
                <SelectItem key={location.id} value={location.id}>
                  {location.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="md:col-span-2">
          <label className="text-sm font-medium">Catatan</label>
          <Textarea
            value={formData.notes}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            placeholder="Tambahkan catatan..."
            className="mt-1"
            rows={2}
          />
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          onClick={handleSave}
          disabled={updateStockMutation.isPending}
          size="sm"
          className="flex-1"
        >
          <Check className="h-4 w-4 mr-1" />
          {updateStockMutation.isPending ? "Menyimpan..." : "Simpan"}
        </Button>
        <Button
          onClick={handleCancel}
          variant="outline"
          size="sm"
          className="flex-1"
        >
          <X className="h-4 w-4 mr-1" />
          Batal
        </Button>
      </div>
    </div>
  );
}

