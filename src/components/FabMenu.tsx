import { Button } from '@/components/ui/button';
import { Plus, Truck, Smartphone, MapPin, Tags, PackagePlus, Layers, X, FileText } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { AddStockDialog } from './AddStockDialog';
import { IncomingStockDialog } from './IncomingStockDialog';
import { BulkIncomingStockDialog } from './BulkIncomingStockDialog';
import { TextImportIncomingDialog } from './TextImportIncomingDialog';
import { AddPhoneModelDialog } from './AddPhoneModelDialog';
import { BulkAddPhoneModelDialog } from './BulkAddPhoneModelDialog';
import { ManageBrandsDialog } from './ManageBrandsDialog';
import { AddLocationDialog } from './AddLocationDialog';

type DialogKey =
  | 'addStock'
  | 'incomingStock'
  | 'bulkIncoming'
  | 'textImportIncoming'
  | 'addPhoneModel'
  | 'bulkAddPhoneModel'
  | 'manageBrands'
  | 'addLocation';

interface ActionItem {
  label: string;
  description: string;
  icon: typeof Plus;
  dialog: DialogKey;
  tone: 'primary' | 'success' | 'info' | 'warning' | 'accent';
}

const actions: ActionItem[] = [
  {
    label: 'HP Datang',
    description: 'Catat 1 unit masuk dengan IMEI',
    icon: Truck,
    dialog: 'incomingStock',
    tone: 'success',
  },
  {
    label: 'HP Datang Massal',
    description: 'Input banyak unit sekaligus',
    icon: PackagePlus,
    dialog: 'bulkIncoming',
    tone: 'success',
  },
  {
    label: 'Impor Teks',
    description: 'Tempel daftar HP: Tanggal,Model,Warna,IMEI',
    icon: FileText,
    dialog: 'textImportIncoming',
    tone: 'accent',
  },
  {
    label: 'Tambah Model HP',
    description: 'Daftarkan model baru',
    icon: Smartphone,
    dialog: 'addPhoneModel',
    tone: 'primary',
  },
  {
    label: 'Tambah Model Massal',
    description: 'Banyak model via form / CSV',
    icon: Layers,
    dialog: 'bulkAddPhoneModel',
    tone: 'primary',
  },
  {
    label: 'Kelola Merk',
    description: 'Edit / hapus merk HP',
    icon: Tags,
    dialog: 'manageBrands',
    tone: 'warning',
  },
  {
    label: 'Tambah Lokasi',
    description: 'Buat cabang / gudang baru',
    icon: MapPin,
    dialog: 'addLocation',
    tone: 'info',
  },
];

const toneClasses: Record<ActionItem['tone'], string> = {
  primary: 'bg-primary/15 text-primary',
  success: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  info: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  warning: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  accent: 'bg-accent text-accent-foreground',
};

export function FabMenu() {
  const [dialog, setDialog] = useState<DialogKey | null>(null);
  const [open, setOpen] = useState(false);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const handleActionClick = (key: DialogKey) => {
    setDialog(key);
    setOpen(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-background/60 backdrop-blur-sm transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Action sheet (mobile) / floating panel (desktop) */}
      <div
        className={cn(
          'fixed z-50 transition-all duration-300 ease-out',
          // Mobile: bottom sheet
          'inset-x-0 bottom-0 sm:inset-x-auto',
          // Desktop: anchored above the FAB
          'sm:bottom-28 sm:right-6 sm:w-[380px]',
          open
            ? 'translate-y-0 opacity-100 pointer-events-auto'
            : 'translate-y-6 opacity-0 pointer-events-none'
        )}
      >
        <div className="mx-auto sm:mx-0 max-w-md rounded-t-3xl sm:rounded-2xl border border-border/60 bg-card shadow-2xl shadow-primary/10 overflow-hidden">
          {/* Drag handle (mobile) */}
          <div className="sm:hidden flex justify-center pt-3 pb-1">
            <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
          </div>

          <div className="flex items-center justify-between px-5 pt-3 pb-2">
            <div>
              <h3 className="text-base font-semibold">Aksi Cepat</h3>
              <p className="text-xs text-muted-foreground">Pilih operasi yang ingin dilakukan</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => setOpen(false)}
              aria-label="Tutup"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {actions.map((action, idx) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.dialog}
                  onClick={() => handleActionClick(action.dialog)}
                  className={cn(
                    'group relative flex flex-col items-start gap-2 rounded-xl border border-border/40 bg-background/40 p-3 text-left transition-all',
                    'hover:border-primary/40 hover:bg-accent/40 hover:-translate-y-0.5 hover:shadow-md',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    open && 'animate-in fade-in slide-in-from-bottom-2'
                  )}
                  style={{ animationDelay: `${idx * 35}ms`, animationFillMode: 'backwards' }}
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-lg transition-transform group-hover:scale-110',
                      toneClasses[action.tone]
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold leading-tight">{action.label}</div>
                    <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                      {action.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Floating Action Button */}
      <div className="fixed bottom-24 right-5 z-50 md:bottom-8 md:right-8">
        <Button
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'relative h-16 w-16 rounded-full p-0 shadow-2xl shadow-primary/40',
            'bg-gradient-to-br from-primary via-primary to-primary/80',
            'hover:shadow-primary/60 hover:scale-105 active:scale-95',
            'transition-all duration-300'
          )}
          aria-label={open ? 'Tutup menu' : 'Buka menu aksi'}
          aria-expanded={open}
        >
          {/* Pulsing ring */}
          {!open && (
            <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping opacity-60" />
          )}
          <Plus
            className={cn(
              '!h-7 !w-7 transition-transform duration-300',
              open && 'rotate-45'
            )}
          />
        </Button>
      </div>

      {dialog === 'addStock' && <AddStockDialog open={true} onOpenChange={() => setDialog(null)} />}
      {dialog === 'incomingStock' && <IncomingStockDialog open={true} onOpenChange={() => setDialog(null)} />}
      {dialog === 'bulkIncoming' && <BulkIncomingStockDialog open={true} onOpenChange={() => setDialog(null)} />}
      {dialog === 'addPhoneModel' && <AddPhoneModelDialog open={true} onOpenChange={() => setDialog(null)} />}
      {dialog === 'bulkAddPhoneModel' && <BulkAddPhoneModelDialog open={true} onOpenChange={() => setDialog(null)} />}
      {dialog === 'manageBrands' && <ManageBrandsDialog open={true} onOpenChange={() => setDialog(null)} />}
      {dialog === 'addLocation' && <AddLocationDialog open={true} onOpenChange={() => setDialog(null)} />}
    </>
  );
}
