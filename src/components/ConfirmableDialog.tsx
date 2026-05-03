import { useState, ReactNode } from 'react';
import { Dialog } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ConfirmableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When true, closing requires confirmation */
  isDirty: boolean;
  children: ReactNode;
  confirmTitle?: string;
  confirmDescription?: string;
}

/**
 * Drop-in replacement for <Dialog> that intercepts close attempts
 * (overlay click, ESC, X button, programmatic) when the form is dirty
 * and asks the user to confirm before discarding their work.
 */
export function ConfirmableDialog({
  open,
  onOpenChange,
  isDirty,
  children,
  confirmTitle = 'Yakin ingin keluar?',
  confirmDescription = 'Data yang sudah Anda isi akan hilang dan tidak bisa dikembalikan.',
}: ConfirmableDialogProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (!next && open && isDirty) {
      setShowConfirm(true);
      return;
    }
    onOpenChange(next);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        {children}
      </Dialog>
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Tetap di sini</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setShowConfirm(false);
                onOpenChange(false);
              }}
            >
              Ya, keluar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
