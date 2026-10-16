import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ConfirmableDialog } from "@/components/ConfirmableDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { StockEntry } from "./StockTable";

interface TransferStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stockEntry: StockEntry | null;
}

export function TransferStockDialog({ open, onOpenChange, stockEntry }: TransferStockDialogProps) {
  const [destinationLocationId, setDestinationLocationId] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stock_locations').select('*').order('name');
      if (error) throw error;
      return data;
    }
  });

  const transferStockMutation = useMutation({
    mutationFn: async (destinationId: string) => {
      if (!stockEntry) throw new Error("No stock entry selected for transfer.");
      if (!destinationId) throw new Error("Please select a destination location.");

      const destLocation = locations?.find(l => l.id === destinationId);
      if (!destLocation) throw new Error("Lokasi tujuan tidak ditemukan.");

      // FIX (bug bounty #3): satu RPC atomic — transfer_out + transfer_in dalam
      // satu transaksi Postgres. Gagal di salah satu = rollback semua (tidak ada
      // lagi kasus unit hilang). Guard ketersediaan unit ada di dalam RPC.
      const { data, error } = await supabase.rpc('transfer_stock_unit', {
        p_imei: stockEntry.imei,
        p_source_location_id: stockEntry.stock_locations.id,
        p_dest_location_id: destinationId,
        p_phone_model_id: stockEntry.phone_models.id,
        p_date: stockEntry.date,
        p_notes: null,
        p_label: stockEntry.label || null,
        p_metadata: stockEntry.metadata || {},
      });

      if (error) throw new Error(`Transfer gagal: ${error.message}`);
      return data;

      // 3. Cascade recalculation happens automatically via database trigger
      // Both source and destination stock_entries will be updated automatically
    },
    onSuccess: () => {
      toast({ title: "Sukses", description: "Stok berhasil ditransfer." });
      queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] }); // Invalidate dashboard too
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Gagal", description: `Transfer gagal: ${error.message}`, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    transferStockMutation.mutate(destinationLocationId);
  };

  const availableLocations = locations?.filter(loc => loc.id !== stockEntry?.stock_locations.id);

  return (
    <ConfirmableDialog open={open} onOpenChange={onOpenChange} isDirty={!!destinationLocationId}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader className="sticky top-0 bg-background z-10 pb-4">
          <DialogTitle>Transfer Stok</DialogTitle>
          <DialogDescription>
            Transfer item ke lokasi lain.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pb-4">
          <div>
            <p className="font-medium">{stockEntry?.phone_models.brand} {stockEntry?.phone_models.model}</p>
            <p className="text-sm text-muted-foreground">IMEI: {stockEntry?.imei}</p>
            <p className="text-sm text-muted-foreground">Dari: {stockEntry?.stock_locations.name}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="destination">Transfer Ke</Label>
            <Select value={destinationLocationId} onValueChange={setDestinationLocationId}>
              <SelectTrigger id="destination">
                <SelectValue placeholder="Pilih lokasi tujuan..." />
              </SelectTrigger>
              <SelectContent>
                {availableLocations?.map(loc => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Batal</Button>
            <Button onClick={handleSubmit} disabled={transferStockMutation.isPending || !destinationLocationId} className="flex-1">
              {transferStockMutation.isPending ? "Memproses..." : "Transfer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </ConfirmableDialog>
  );
}
