import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Truck, Smartphone, MapPin, Tags } from 'lucide-react';
import { useState } from 'react';
import { AddStockDialog } from './AddStockDialog';
import { IncomingStockDialog } from './IncomingStockDialog';
import { AddPhoneModelDialog } from './AddPhoneModelDialog';
import { ManageBrandsDialog } from './ManageBrandsDialog';
import { AddLocationDialog } from './AddLocationDialog';

export function FabMenu() {
  const [dialog, setDialog] = useState<string | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const handleActionClick = (dialogName: string) => {
    setDialog(dialogName);
    setPopoverOpen(false);
  };

  const actions = [
    {
      label: 'HP Datang',
      icon: Truck,
      dialog: 'incomingStock',
    },
    {
      label: 'Koreksi Stok Pagi',
      icon: Plus,
      dialog: 'addStock',
    },
    {
      label: 'Tambah Model HP',
      icon: Smartphone,
      dialog: 'addPhoneModel',
    },
    {
      label: 'Kelola Merk',
      icon: Tags,
      dialog: 'manageBrands',
    },
    {
      label: 'Tambah Lokasi',
      icon: MapPin,
      dialog: 'addLocation',
    },
  ];

  return (
    <>
      <div className="fixed bottom-24 right-6 z-50 md:bottom-6">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button className="w-16 h-16 rounded-full shadow-xl bg-primary hover:bg-primary/90">
              <Plus className="h-8 w-8" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" side="top" align="end">
            <div className="flex flex-col gap-2">
              {actions.map((action) => (
                <Button
                  key={action.dialog}
                  variant="ghost"
                  className="flex justify-start items-center gap-4 px-4 py-2"
                  onClick={() => handleActionClick(action.dialog)}
                >
                  <action.icon className="h-5 w-5" />
                  <span>{action.label}</span>
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {dialog === 'addStock' && <AddStockDialog open={true} onOpenChange={() => setDialog(null)} />}
      {dialog === 'incomingStock' && <IncomingStockDialog open={true} onOpenChange={() => setDialog(null)} />}
      {dialog === 'addPhoneModel' && <AddPhoneModelDialog open={true} onOpenChange={() => setDialog(null)} />}
      {dialog === 'manageBrands' && <ManageBrandsDialog open={true} onOpenChange={() => setDialog(null)} />}
      {dialog === 'addLocation' && <AddLocationDialog open={true} onOpenChange={() => setDialog(null)} />}
    </>
  );
}
