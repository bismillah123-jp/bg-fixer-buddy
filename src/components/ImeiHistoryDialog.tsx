import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Search, ScanBarcode, Loader2, Truck, ShoppingBag, ArrowRightLeft, RotateCcw, Wrench, History, MapPin } from 'lucide-react';
import { BarcodeScanner } from './BarcodeScanner';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialImei?: string;
}

interface HistoryEvent {
  id: number;
  date: string;
  created_at: string;
  event_type: string;
  qty: number;
  notes: string | null;
  label: string | null;
  metadata: Record<string, unknown> | null;
  location_id: string;
  phone_model_id: string;
  locationName?: string;
}

const EVENT_META: Record<string, { label: string; icon: typeof Truck; classes: string }> = {
  masuk: { label: 'Barang Masuk', icon: Truck, classes: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  laku: { label: 'Terjual', icon: ShoppingBag, classes: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
  transfer_in: { label: 'Transfer Masuk', icon: ArrowRightLeft, classes: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' },
  transfer_out: { label: 'Transfer Keluar', icon: ArrowRightLeft, classes: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  retur: { label: 'Retur', icon: RotateCcw, classes: 'bg-rose-500/15 text-rose-600 dark:text-rose-400' },
  koreksi: { label: 'Koreksi', icon: Wrench, classes: 'bg-muted text-muted-foreground' },
};

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtTime = (ts: string) =>
  new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

export function ImeiHistoryDialog({ open, onOpenChange, initialImei }: Props) {
  const [imei, setImei] = useState(initialImei ?? '');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [searched, setSearched] = useState(false);
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [modelInfo, setModelInfo] = useState<string>('');

  const search = async (value?: string) => {
    const q = (value ?? imei).trim();
    if (!q) return;
    setLoading(true);
    setSearched(true);
    try {
      const { data, error } = await supabase
        .from('stock_events')
        .select('id, date, created_at, event_type, qty, notes, label, metadata, location_id, phone_model_id, phone_models(brand, model, storage_capacity, color), stock_locations(name)')
        .eq('imei', q)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as unknown as (HistoryEvent & {
        phone_models: { brand: string; model: string; storage_capacity: string | null; color: string | null } | null;
        stock_locations: { name: string } | null;
      })[];
      setEvents(rows.map(r => ({ ...r, locationName: r.stock_locations?.name })));
      const m = rows[0]?.phone_models;
      setModelInfo(m ? `${m.brand} ${m.model}${m.storage_capacity ? ` ${m.storage_capacity}` : ''}${m.color ? ` — ${m.color}` : ''}` : '');
    } catch {
      setEvents([]);
      setModelInfo('');
    } finally {
      setLoading(false);
    }
  };

  const lastEvent = events[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Riwayat Hidup IMEI
          </DialogTitle>
          <DialogDescription>Lacak perjalanan satu unit: masuk, pindah cabang, sampai terjual.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={imei}
            onChange={e => setImei(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="Ketik atau scan IMEI..."
            className="font-mono"
            autoFocus
          />
          <Button variant="outline" size="icon" onClick={() => setScanning(true)} aria-label="Scan IMEI">
            <ScanBarcode className="h-4 w-4" />
          </Button>
          <Button onClick={() => search()} disabled={loading || !imei.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {searched && !loading && events.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              IMEI <span className="font-mono font-semibold">{imei}</span> tidak ditemukan di riwayat manapun.
            </div>
          )}

          {events.length > 0 && (
            <div className="space-y-4 pt-2">
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                <div className="text-sm font-semibold">{modelInfo || 'Model tidak diketahui'}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">{imei.trim()}</span>
                  {lastEvent && (
                    <Badge variant="secondary" className="text-[11px]">
                      Status terakhir: {EVENT_META[lastEvent.event_type]?.label ?? lastEvent.event_type}
                      {lastEvent.locationName ? ` di ${lastEvent.locationName}` : ''}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="relative space-y-0 pl-6">
                <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
                {events.map((ev) => {
                  const meta = EVENT_META[ev.event_type] ?? EVENT_META.koreksi;
                  const Icon = meta.icon;
                  const color = (ev.metadata as Record<string, unknown> | null)?.color as string | undefined;
                  return (
                    <div key={ev.id} className="relative pb-4 last:pb-0">
                      <span className={cn('absolute -left-6 top-0.5 flex h-6 w-6 items-center justify-center rounded-full', meta.classes)}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="rounded-lg border border-border/50 bg-card p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold">{meta.label}</span>
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                            {fmtDate(ev.date)} · {fmtTime(ev.created_at)}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {ev.locationName && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {ev.locationName}
                            </span>
                          )}
                          {ev.label && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{ev.label}</Badge>}
                          {color && <span>Warna: {color}</span>}
                        </div>
                        {ev.notes && <p className="mt-1 text-xs text-muted-foreground italic">{ev.notes}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {scanning && (
          <BarcodeScanner
            onScan={(code) => {
              setScanning(false);
              setImei(code);
              search(code);
            }}
            onClose={() => setScanning(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
