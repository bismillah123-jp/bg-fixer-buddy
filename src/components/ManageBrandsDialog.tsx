import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, Trash2 } from 'lucide-react';

interface ManageBrandsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageBrandsDialog({ open, onOpenChange }: ManageBrandsDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState('');
  const [newBrandName, setNewBrandName] = useState('');

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingBrand, setDeletingBrand] = useState('');

  const { data: brands, isLoading: brandsLoading } = useQuery({
    queryKey: ['brands'],
    queryFn: async () => {
      const { data, error } = await supabase.from('phone_models').select('brand').order('brand');
      if (error) throw error;
      return [...new Set(data.map((item) => item.brand))];
    },
  });

  const editBrandMutation = useMutation({
    mutationFn: async ({ oldName, newName }: { oldName: string, newName: string }) => {
        const { error } = await supabase.rpc('update_brand_name', { old_brand_name: oldName, new_brand_name: newName });
        if (error) throw error;
    },
    onSuccess: () => {
        toast({ title: 'Merk berhasil diperbarui' });
        queryClient.invalidateQueries({ queryKey: ['brands'] });
        queryClient.invalidateQueries({ queryKey: ['phone-models'] });
        setIsEditDialogOpen(false);
    },
    onError: (error: any) => {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleEditBrand = () => {
    if (!newBrandName.trim()) {
        toast({ title: 'Error', description: 'Nama merk tidak boleh kosong.', variant: 'destructive' });
        return;
    }
    if (newBrandName.trim().toUpperCase() === editingBrand.toUpperCase()) {
        setIsEditDialogOpen(false);
        return;
    }
    editBrandMutation.mutate({ oldName: editingBrand, newName: newBrandName.trim().toUpperCase() });
  }

  const deleteBrandMutation = useMutation({
    mutationFn: async (brandName: string) => {
        const { error } = await supabase.rpc('delete_brand', { brand_name: brandName });
        if (error) throw error;
    },
    onSuccess: (_, brandName) => {
        toast({ title: `Merk "${brandName}" berhasil dihapus` });
        queryClient.invalidateQueries({ queryKey: ['brands'] });
        queryClient.invalidateQueries({ queryKey: ['phone-models'] });
        setIsDeleteDialogOpen(false);
    },
    onError: (error: any) => {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleDeleteBrand = () => {
    deleteBrandMutation.mutate(deletingBrand);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader className="sticky top-0 bg-background z-10 pb-4">
            <DialogTitle>Kelola Merk</DialogTitle>
            <DialogDescription>Edit atau hapus merk HP yang ada</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 pb-4">
            {brandsLoading ? (
                <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </div>
            ) : (
                <ul className="space-y-2">
                    {brands?.map((brand) => (
                        <li key={brand} className="flex justify-between items-center p-2 border rounded-md">
                            <span className="font-medium">{brand}</span>
                            <div className="space-x-2">
                                <Button variant="ghost" size="icon" onClick={() => {
                                    setEditingBrand(brand);
                                    setNewBrandName(brand);
                                    setIsEditDialogOpen(true);
                                }}>
                                    <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => {
                                    setDeletingBrand(brand);
                                    setIsDeleteDialogOpen(true);
                                }}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Brand Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader className="sticky top-0 bg-background z-10 pb-4">
                <DialogTitle>Edit Merk</DialogTitle>
                <DialogDescription>
                    Mengubah nama merk akan diperbarui untuk semua model terkait.
                </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-2 pb-4">
                <Label htmlFor="edit-brand-name">Nama Merk</Label>
                <Input
                    id="edit-brand-name"
                    value={newBrandName}
                    onChange={(e) => setNewBrandName(e.target.value)}
                    autoFocus
                />
            </div>
            <DialogFooter>
                <DialogClose asChild><Button variant="ghost">Batal</Button></DialogClose>
                <Button onClick={handleEditBrand} disabled={editBrandMutation.isPending}>
                    {editBrandMutation.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Brand Alert Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Anda yakin ingin menghapus merk ini?</AlertDialogTitle>
                <AlertDialogDescription>
                    Tindakan ini tidak dapat diurungkan. Ini akan menghapus merk secara permanen
                    dan semua model HP terkait dari database.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Batal</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteBrand} disabled={deleteBrandMutation.isPending}>
                    {deleteBrandMutation.isPending ? 'Menghapus...' : 'Ya, Hapus'}
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
