import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";

const PRESET_HEX = [
  "#1F2937", "#F9FAFB", "#3B82F6", "#22C55E", "#EF4444",
  "#8B5CF6", "#EC4899", "#EAB308", "#F97316", "#14B8A6",
  "#6B7280", "#C0C0C0", "#D4A017", "#92400E", "#E8B4B8",
];

interface ManageColorsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageColorsDialog({ open, onOpenChange }: ManageColorsDialogProps) {
  const [newName, setNewName] = useState("");
  const [newHex, setNewHex] = useState(PRESET_HEX[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editHex, setEditHex] = useState("");
  const [deletingColor, setDeletingColor] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: colors } = useQuery({
    queryKey: ['phone-colors'],
    queryFn: async () => {
      const { data, error } = await supabase.from('phone_colors' as any).select('*').order('name');
      if (error) throw error;
      return data as any[];
    }
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!newName.trim()) throw new Error("Nama warna wajib diisi");
      const { error } = await supabase.from('phone_colors' as any).insert({ name: newName.trim(), hex_color: newHex } as any);
      if (error) {
        if (error.code === '23505') throw new Error("Warna ini sudah ada");
        throw error;
      }
    },
    onSuccess: () => {
      toast({ title: "Berhasil", description: "Warna berhasil ditambahkan" });
      queryClient.invalidateQueries({ queryKey: ['phone-colors'] });
      setNewName("");
      setNewHex(PRESET_HEX[0]);
    },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name, hex_color }: { id: string; name: string; hex_color: string }) => {
      if (!name.trim()) throw new Error("Nama warna wajib diisi");
      const { error } = await supabase.from('phone_colors' as any).update({ name: name.trim(), hex_color } as any).eq('id', id);
      if (error) {
        if (error.code === '23505') throw new Error("Warna ini sudah ada");
        throw error;
      }
    },
    onSuccess: () => {
      toast({ title: "Berhasil", description: "Warna berhasil diperbarui" });
      queryClient.invalidateQueries({ queryKey: ['phone-colors'] });
      setEditingId(null);
    },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('phone_colors' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Berhasil", description: "Warna berhasil dihapus" });
      queryClient.invalidateQueries({ queryKey: ['phone-colors'] });
      setDeletingColor(null);
    },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Kelola Warna HP</DialogTitle>
            <DialogDescription>Tambah, edit, atau hapus pilihan warna HP.</DialogDescription>
          </DialogHeader>

          {/* Add new color */}
          <div className="space-y-2 p-3 rounded-lg bg-muted/30 border">
            <Label>Tambah Warna Baru</Label>
            <Input placeholder="Nama warna (contoh: Midnight Blue)" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Warna:</span>
              <div className="flex gap-1.5 flex-wrap">
                {PRESET_HEX.map((c) => (
                  <button
                    key={c}
                    className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
                    style={{ backgroundColor: c, borderColor: newHex === c ? 'hsl(var(--foreground))' : 'transparent' }}
                    onClick={() => setNewHex(c)}
                  />
                ))}
              </div>
              <Input type="color" value={newHex} onChange={(e) => setNewHex(e.target.value)} className="h-6 w-8 p-0 border-0 cursor-pointer" />
            </div>
            <Button size="sm" onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>
              <Plus className="h-4 w-4 mr-1" /> Tambah
            </Button>
          </div>

          {/* Color list */}
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {colors?.map((color: any) => (
              <div key={color.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                {editingId === color.id ? (
                  <>
                    <div className="h-5 w-5 rounded-full shrink-0 border border-border" style={{ backgroundColor: editHex }} />
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 text-sm flex-1" />
                    <Input type="color" value={editHex} onChange={(e) => setEditHex(e.target.value)} className="h-6 w-8 p-0 border-0 cursor-pointer" />
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateMutation.mutate({ id: color.id, name: editName, hex_color: editHex })}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="h-5 w-5 rounded-full shrink-0 border border-border" style={{ backgroundColor: color.hex_color }} />
                    <span className="text-sm font-medium flex-1">{color.name}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingId(color.id); setEditName(color.name); setEditHex(color.hex_color); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeletingColor(color)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
            {(!colors || colors.length === 0) && (
              <p className="text-center text-sm text-muted-foreground py-4">Belum ada warna</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingColor} onOpenChange={(o) => !o && setDeletingColor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Warna?</AlertDialogTitle>
            <AlertDialogDescription>
              Hapus warna <strong>{deletingColor?.name}</strong>? Warna pada stok yang sudah ada tidak akan terpengaruh.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deletingColor && deleteMutation.mutate(deletingColor.id)}>
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
