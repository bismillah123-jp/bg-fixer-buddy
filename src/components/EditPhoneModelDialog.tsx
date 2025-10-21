import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface PhoneModel {
  id: string;
  brand: string;
  model: string;
  storage_capacity: string | null;
  srp: number;
}

interface EditPhoneModelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phoneModel: PhoneModel | null;
}

export function EditPhoneModelDialog({ open, onOpenChange, phoneModel }: EditPhoneModelDialogProps) {
  const [srpFormatted, setSrpFormatted] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (phoneModel) {
      setSrpFormatted(phoneModel.srp ? formatPrice(phoneModel.srp.toString()) : '');
    }
  }, [phoneModel]);

  const formatPrice = (value: string) => {
    const numOnly = value.replace(/\D/g, '');
    return numOnly ? parseInt(numOnly).toLocaleString('id-ID') : '';
  };

  const parsePriceToNumber = (formattedPrice: string) => {
    return parseInt(formattedPrice.replace(/\./g, '')) || 0;
  };

  const updateMutation = useMutation({
    mutationFn: async (srp: number) => {
      if (!phoneModel) return;
      const { error } = await supabase
        .from('phone_models')
        .update({ srp })
        .eq('id', phoneModel.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'SRP berhasil diupdate' });
      queryClient.invalidateQueries({ queryKey: ['phone-models'] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const srpValue = parsePriceToNumber(srpFormatted);
    updateMutation.mutate(srpValue);
  };

  if (!phoneModel) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader className="sticky top-0 bg-background z-10 pb-4">
          <DialogTitle>Edit SRP</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pb-4">
          <div className="space-y-2">
            <Label>Merk</Label>
            <Input value={phoneModel.brand} disabled />
          </div>
          <div className="space-y-2">
            <Label>Model</Label>
            <Input value={phoneModel.model} disabled />
          </div>
          <div className="space-y-2">
            <Label>Kapasitas</Label>
            <Input value={phoneModel.storage_capacity || '-'} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="srp">SRP (Harga Eceran yang Disarankan)</Label>
            <Input 
              id="srp" 
              type="text" 
              inputMode="numeric"
              value={srpFormatted} 
              onChange={(e) => setSrpFormatted(formatPrice(e.target.value))}
              placeholder="cth: 5.000.000"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={updateMutation.isPending}>
              Update SRP
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
