import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { ConfirmableDialog } from '@/components/ConfirmableDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AddPhoneModelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: (model: { id: string; brand: string; model: string; storage_capacity: string | null }) => void;
}

export function AddPhoneModelDialog({ open, onOpenChange, onAdded }: AddPhoneModelDialogProps) {
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [storage, setStorage] = useState('');
  const [srpFormatted, setSrpFormatted] = useState('');

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: brands } = useQuery({
    queryKey: ['brands'],
    queryFn: async () => {
      const { data, error } = await supabase.from('phone_models').select('brand').order('brand');
      if (error) throw error;
      return [...new Set(data.map((item) => item.brand))];
    },
  });

  const addModelMutation = useMutation({
    mutationFn: async (dataToInsert: { brand: string; model: string; storage_capacity: string | null; srp: number; }) => {
      const { data: existingModel, error: checkError } = await supabase
        .from('phone_models')
        .select('id')
        .eq('brand', dataToInsert.brand)
        .eq('model', dataToInsert.model)
        .eq('storage_capacity', dataToInsert.storage_capacity)
        .maybeSingle();

      if (checkError) throw new Error(`Gagal memeriksa model: ${checkError.message}`);
      if (existingModel) {
        throw new Error(`Model ${dataToInsert.brand} ${dataToInsert.model} sudah ada di sistem`);
      }

      const { data: created, error } = await supabase
        .from('phone_models')
        .insert(dataToInsert)
        .select('id, brand, model, storage_capacity')
        .single();
      if (error) {
        if (error.code === '23505') {
          throw new Error(`Model ${dataToInsert.brand} ${dataToInsert.model} sudah ada di sistem`);
        }
        throw error;
      }
      return created;
    },
    onSuccess: (created) => {
      toast({ title: 'Model HP berhasil ditambahkan' });
      queryClient.invalidateQueries({ queryKey: ['phone-models'] });
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      onAdded?.(created);
      onOpenChange(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const formatPrice = (value: string) => {
    const numOnly = value.replace(/\D/g, '');
    return numOnly ? parseInt(numOnly).toLocaleString('id-ID') : '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalBrand = brand.trim().toUpperCase();
    if (finalBrand.length < 2) {
      toast({ title: 'Error', description: 'Nama merk minimal 2 karakter.', variant: 'destructive' });
      return;
    }
    if (model.trim().length < 2) {
      toast({ title: 'Error', description: 'Model HP minimal 2 karakter.', variant: 'destructive' });
      return;
    }
    const srpValue = parseInt(srpFormatted.replace(/\./g, '')) || 0;
    if (srpValue <= 0) {
      toast({ title: 'Error', description: 'SRP harus lebih dari 0.', variant: 'destructive' });
      return;
    }
    addModelMutation.mutate({
      brand: finalBrand,
      model: model.trim(),
      storage_capacity: storage.trim() || null,
      srp: srpValue,
    });
  };

  const resetForm = () => {
    setBrand('');
    setModel('');
    setStorage('');
    setSrpFormatted('');
  };

  const isDirty = !!(brand || model || storage || srpFormatted);

  return (
    <ConfirmableDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) resetForm();
        onOpenChange(isOpen);
      }}
      isDirty={isDirty}
    >
      <DialogContent className="sm:max-w-md max-h-[85dvh] overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle>Tambah Model HP Baru</DialogTitle>
          <DialogDescription>Ketik merk baru atau pilih dari daftar yang sudah ada.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="brand">Merk</Label>
            <Input
              id="brand"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="cth: VIVO"
              list="brand-suggestions"
              autoComplete="off"
              required
              className="h-11 rounded-xl uppercase"
            />
            <datalist id="brand-suggestions">
              {brands?.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Input
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="cth: Y36 5G"
              autoComplete="off"
              required
              className="h-11 rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="storage_capacity">Kapasitas (RAM/ROM)</Label>
            <Input
              id="storage_capacity"
              value={storage}
              onChange={(e) => setStorage(e.target.value)}
              placeholder="cth: 8/256"
              autoComplete="off"
              className="h-11 rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="srp">SRP (Harga Jual Resmi)</Label>
            <Input
              id="srp"
              type="text"
              inputMode="numeric"
              value={srpFormatted}
              onChange={(e) => setSrpFormatted(formatPrice(e.target.value))}
              placeholder="cth: 5.000.000"
              autoComplete="off"
              required
              className="h-11 rounded-xl tabular"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="submit"
              disabled={addModelMutation.isPending}
              className="w-full h-11 rounded-xl font-bold bg-gradient-to-r from-primary to-[#c22436] shadow-[var(--shadow-button)] pressable"
            >
              {addModelMutation.isPending ? 'Menyimpan...' : 'Simpan Model'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </ConfirmableDialog>
  );
}
