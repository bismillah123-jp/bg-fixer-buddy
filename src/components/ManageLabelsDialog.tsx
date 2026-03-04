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

const PRESET_COLORS = [
  "#EF4444", "#F59E0B", "#22C55E", "#3B82F6", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F97316", "#6B7280", "#DC2626",
];

interface ManageLabelsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageLabelsDialog({ open, onOpenChange }: ManageLabelsDialogProps) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [deletingLabel, setDeletingLabel] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: labels } = useQuery({
    queryKey: ['labels'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('labels')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    }
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!newName.trim()) throw new Error("Nama label wajib diisi");
      const { error } = await supabase.from('labels').insert({ name: newName.trim(), color: newColor });
      if (error) {
        if (error.code === '23505') throw new Error("Label ini sudah ada");
        throw error;
      }
    },
    onSuccess: () => {
      toast({ title: "Berhasil", description: "Label berhasil ditambahkan" });
      queryClient.invalidateQueries({ queryKey: ['labels'] });
      setNewName("");
      setNewColor(PRESET_COLORS[0]);
    },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name: string; color: string }) => {
      if (!name.trim()) throw new Error("Nama label wajib diisi");
      const { error } = await supabase.from('labels').update({ name: name.trim(), color }).eq('id', id);
      if (error) {
        if (error.code === '23505') throw new Error("Label ini sudah ada");
        throw error;
      }
    },
    onSuccess: () => {
      toast({ title: "Berhasil", description: "Label berhasil diperbarui" });
      queryClient.invalidateQueries({ queryKey: ['labels'] });
      setEditingId(null);
    },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('labels').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Berhasil", description: "Label berhasil dihapus" });
      queryClient.invalidateQueries({ queryKey: ['labels'] });
      setDeletingLabel(null);
    },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Kelola Label</DialogTitle>
            <DialogDescription>Tambah, edit, atau hapus label stok.</DialogDescription>
          </DialogHeader>

          {/* Add new label */}
          <div className="space-y-2 p-3 rounded-lg bg-muted/30 border">
            <Label>Tambah Label Baru</Label>
            <Input
              placeholder="Nama label"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Warna:</span>
              <div className="flex gap-1.5 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                      backgroundColor: c,
                      borderColor: newColor === c ? 'hsl(var(--foreground))' : 'transparent',
                    }}
                    onClick={() => setNewColor(c)}
                  />
                ))}
              </div>
            </div>
            <Button size="sm" onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>
              <Plus className="h-4 w-4 mr-1" />
              Tambah
            </Button>
          </div>

          {/* Label list */}
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {labels?.map((label) => (
              <div key={label.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                {editingId === label.id ? (
                  <>
                    <div
                      className="h-5 w-5 rounded-full shrink-0"
                      style={{ backgroundColor: editColor }}
                    />
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-8 text-sm flex-1"
                    />
                    <div className="flex gap-1">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          className="h-4 w-4 rounded-full border"
                          style={{
                            backgroundColor: c,
                            borderColor: editColor === c ? 'hsl(var(--foreground))' : 'transparent',
                          }}
                          onClick={() => setEditColor(c)}
                        />
                      ))}
                    </div>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => updateMutation.mutate({ id: label.id, name: editName, color: editColor })}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <div
                      className="h-5 w-5 rounded-full shrink-0"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="text-sm font-medium flex-1">{label.name}</span>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => {
                        setEditingId(label.id);
                        setEditName(label.name);
                        setEditColor(label.color);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setDeletingLabel(label)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
            {(!labels || labels.length === 0) && (
              <p className="text-center text-sm text-muted-foreground py-4">Belum ada label</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingLabel} onOpenChange={(o) => !o && setDeletingLabel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Label?</AlertDialogTitle>
            <AlertDialogDescription>
              Hapus label <strong>{deletingLabel?.name}</strong>? Label pada stok yang sudah ada tidak akan terpengaruh.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingLabel && deleteMutation.mutate(deletingLabel.id)}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
