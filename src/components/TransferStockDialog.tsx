import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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

      const transferQty = 1;
      const sourceLocationName = stockEntry.stock_locations.name;
      const destLocation = locations?.find(l => l.id === destinationId);
      if (!destLocation) throw new Error("Lokasi tujuan tidak ditemukan.");
      const destLocationName = destLocation.name;

      // 1. Write transfer_out event to stock_events (source location)
      const { error: transferOutError } = await supabase
        .from('stock_events')
        .insert({
          date: stockEntry.date,
          imei: stockEntry.imei,
          location_id: stockEntry.location_id,
          phone_model_id: stockEntry.phone_models.id,
          event_type: 'transfer_out',
          qty: transferQty,
          notes: `Transfer ke ${destLocationName}`,
          metadata: { destination_location_id: destinationId, destination_location_name: destLocationName }
        });

      if (transferOutError) throw new Error(`Gagal mencatat transfer keluar: ${transferOutError.message}`);

      // 2. Write transfer_in event to stock_events (destination location)
      const { error: transferInError } = await supabase
        .from('stock_events')
          .insert({
            date: stockEntry.date,
          imei: stockEntry.imei,
            location_id: destinationId,
            phone_model_id: stockEntry.phone_models.id,
          event_type: 'transfer_in',
          qty: transferQty,
          notes: `Transfer dari ${sourceLocationName}`,
          metadata: { source_location_id: stockEntry.location_id, source_location_name: sourceLocationName }
        });
      
      if (transferInError) throw new Error(`Gagal mencatat transfer masuk: ${transferInError.message}`);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
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
    </Dialog>
  );
}
