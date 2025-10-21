import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { StockEntry } from "./StockTable"; // Assuming StockEntry is exported from StockTable

interface EditStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stockEntry: StockEntry | null;
}

export function EditStockDialog({ open, onOpenChange, stockEntry }: EditStockDialogProps) {
  const [notes, setNotes] = useState("");
  const [imei, setImei] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (stockEntry) {
      setNotes(stockEntry.notes || "");
      setImei(stockEntry.imei || "");
    }
  }, [stockEntry]);

  const editStockMutation = useMutation({
    mutationFn: async ({ notes, imei }: { notes: string; imei: string }) => {
      if (!stockEntry) throw new Error("Tidak ada entri stok yang dipilih");
      
      // Validate IMEI if changed
      if (imei.trim() && imei.trim() !== stockEntry.imei) {
        if (imei.trim().length < 10) {
          throw new Error('IMEI tidak valid (minimal 10 karakter)');
        }
        
        // Check if new IMEI already exists
        const { data: existingImei, error: checkError } = await supabase
          .from('stock_entries')
          .select('id')
          .eq('imei', imei.trim())
          .neq('id', stockEntry.id)
          .maybeSingle();

        if (checkError) throw new Error(`Gagal memeriksa IMEI: ${checkError.message}`);
        
        if (existingImei) {
          throw new Error('IMEI ini sudah terdaftar untuk stok lain');
        }
      }

      const { error } = await supabase
        .from('stock_entries')
        .update({ 
          notes: notes.trim() || null, 
          imei: imei.trim() || null 
        })
        .eq('id', stockEntry.id);

      if (error) throw new Error(`Gagal memperbarui stok: ${error.message}`);
    },
    onSuccess: () => {
      toast({
        title: "Berhasil",
        description: "Stok berhasil diperbarui",
      });
      queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    editStockMutation.mutate({ notes, imei });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader className="sticky top-0 bg-background z-10 pb-4">
          <DialogTitle>Edit Stok</DialogTitle>
          <DialogDescription>
            Perbarui detail untuk entri stok yang dipilih.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pb-4">
          <div className="space-y-2">
            <Label>Model HP</Label>
            <Input
              disabled
              value={stockEntry ? `${stockEntry.phone_models.brand} ${stockEntry.phone_models.model}` : ""}
            />
          </div>
          <div className="space-y-2">
            <Label>IMEI</Label>
            <Input
              placeholder="Masukkan IMEI"
              value={imei}
              onChange={(e) => setImei(e.target.value)}
              inputMode="numeric"
            />
          </div>
          <div className="space-y-2">
            <Label>Catatan</Label>
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
              onClick={handleSubmit}
              disabled={editStockMutation.isPending}
              className="flex-1"
            >
              {editStockMutation.isPending ? "Menyimpan..." : "Simpan Perubahan"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
