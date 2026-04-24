import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Upload, Download, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface BulkAddPhoneModelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ModelEntry {
  brand: string;
  model: string;
  storage_capacity: string;
  srpFormatted: string;
}

const emptyEntry: ModelEntry = { brand: '', model: '', storage_capacity: '', srpFormatted: '' };

export function BulkAddPhoneModelDialog({ open, onOpenChange }: BulkAddPhoneModelDialogProps) {
  const [entries, setEntries] = useState<ModelEntry[]>([{ ...emptyEntry }]);
  const [csvText, setCsvText] = useState('');
  const [results, setResults] = useState<{ success: number; failed: { row: number; reason: string }[] } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: brands } = useQuery({
    queryKey: ['brands'],
    queryFn: async () => {
      const { data, error } = await supabase.from('phone_models').select('brand').order('brand');
      if (error) throw error;
      return [...new Set(data.map((item) => item.brand))];
    },
  });

  const formatPrice = (value: string) => {
    const numOnly = value.replace(/\D/g, '');
    return numOnly ? parseInt(numOnly).toLocaleString('id-ID') : '';
  };

  const parsePriceToNumber = (formattedPrice: string) => {
    return parseInt(formattedPrice.replace(/\./g, '')) || 0;
  };

  const updateEntry = (index: number, field: keyof ModelEntry, value: string) => {
    const next = [...entries];
    if (field === 'srpFormatted') {
      next[index][field] = formatPrice(value);
    } else if (field === 'brand') {
      next[index][field] = value.toUpperCase();
    } else {
      next[index][field] = value;
    }
    setEntries(next);
  };

  const addRow = () => setEntries([...entries, { ...emptyEntry }]);
  const removeRow = (index: number) => {
    if (entries.length === 1) return;
    setEntries(entries.filter((_, i) => i !== index));
  };

  const bulkInsertMutation = useMutation({
    mutationFn: async (rows: { brand: string; model: string; storage_capacity: string | null; srp: number }[]) => {
      const failed: { row: number; reason: string }[] = [];
      let success = 0;

      // Fetch existing combos once
      const { data: existing, error: fetchErr } = await supabase
        .from('phone_models')
        .select('brand, model, storage_capacity');
      if (fetchErr) throw fetchErr;

      const existingSet = new Set(
        (existing || []).map(
          (e) => `${e.brand.toLowerCase()}|${e.model.toLowerCase()}|${(e.storage_capacity || '').toLowerCase()}`
        )
      );

      // Dedupe within batch
      const seenInBatch = new Set<string>();
      const toInsert: typeof rows = [];

      rows.forEach((row, idx) => {
        const key = `${row.brand.toLowerCase()}|${row.model.toLowerCase()}|${(row.storage_capacity || '').toLowerCase()}`;
        if (existingSet.has(key)) {
          failed.push({ row: idx + 1, reason: 'Sudah ada di sistem' });
          return;
        }
        if (seenInBatch.has(key)) {
          failed.push({ row: idx + 1, reason: 'Duplikat dalam batch' });
          return;
        }
        seenInBatch.add(key);
        toInsert.push(row);
      });

      if (toInsert.length > 0) {
        const { error } = await supabase.from('phone_models').insert(toInsert);
        if (error) throw error;
        success = toInsert.length;
      }

      return { success, failed };
    },
    onSuccess: (result) => {
      setResults(result);
      queryClient.invalidateQueries({ queryKey: ['phone-models'] });
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      queryClient.invalidateQueries({ queryKey: ['all-phone-models'] });
      if (result.success > 0) {
        toast({ title: `${result.success} model berhasil ditambahkan` });
      }
      if (result.failed.length > 0) {
        toast({
          title: `${result.failed.length} model gagal`,
          description: 'Lihat detail di bawah',
          variant: 'destructive',
        });
      }
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const validateAndSubmit = (rows: ModelEntry[]) => {
    setResults(null);
    const validated: { brand: string; model: string; storage_capacity: string | null; srp: number }[] = [];
    const validationErrors: { row: number; reason: string }[] = [];

    rows.forEach((entry, idx) => {
      const brand = entry.brand.trim().toUpperCase();
      const model = entry.model.trim();
      const storage = entry.storage_capacity.trim();
      const srp = parsePriceToNumber(entry.srpFormatted);

      if (!brand || brand.length < 2) {
        validationErrors.push({ row: idx + 1, reason: 'Merk minimal 2 karakter' });
        return;
      }
      if (!model || model.length < 2) {
        validationErrors.push({ row: idx + 1, reason: 'Model minimal 2 karakter' });
        return;
      }
      if (srp <= 0) {
        validationErrors.push({ row: idx + 1, reason: 'SRP harus lebih dari 0' });
        return;
      }
      validated.push({ brand, model, storage_capacity: storage || null, srp });
    });

    if (validationErrors.length > 0 && validated.length === 0) {
      setResults({ success: 0, failed: validationErrors });
      return;
    }

    bulkInsertMutation.mutate(validated, {
      onSuccess: (result) => {
        setResults({
          success: result.success,
          failed: [...validationErrors, ...result.failed],
        });
      },
    });
  };

  const handleManualSubmit = () => {
    validateAndSubmit(entries);
  };

  const handleCsvSubmit = () => {
    const lines = csvText.trim().split('\n').filter((l) => l.trim());
    if (lines.length === 0) {
      toast({ title: 'Error', description: 'CSV kosong', variant: 'destructive' });
      return;
    }

    // Skip header if detected
    const startIdx = lines[0].toLowerCase().includes('brand') || lines[0].toLowerCase().includes('merk') ? 1 : 0;

    const parsed: ModelEntry[] = lines.slice(startIdx).map((line) => {
      const parts = line.split(',').map((p) => p.trim());
      return {
        brand: parts[0] || '',
        model: parts[1] || '',
        storage_capacity: parts[2] || '',
        srpFormatted: formatPrice(parts[3] || '0'),
      };
    });

    validateAndSubmit(parsed);
  };

  const downloadTemplate = () => {
    const csv = 'brand,model,storage_capacity,srp\nSAMSUNG,Galaxy A15,4/128,2500000\nXIAOMI,Redmi 13,6/128,2800000\nVIVO,Y29,4/128,2300000';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template-model-hp.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setEntries([{ ...emptyEntry }]);
      setCsvText('');
      setResults(null);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="sticky top-0 bg-background z-10 pb-4">
          <DialogTitle>Tambah Model HP Massal</DialogTitle>
          <DialogDescription>
            Tambahkan beberapa model HP sekaligus dengan input manual atau import dari CSV.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="manual" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual">Input Manual</TabsTrigger>
            <TabsTrigger value="csv">Import CSV</TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="space-y-4 mt-4">
            <div className="space-y-3">
              {entries.map((entry, index) => (
                <div key={index} className="border rounded-lg p-3 space-y-2 bg-card">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Model #{index + 1}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRow(index)}
                      disabled={entries.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Merk</Label>
                      <Select
                        value={
                          entry.brand && brands?.includes(entry.brand)
                            ? entry.brand
                            : entry.brand
                            ? '__new__'
                            : ''
                        }
                        onValueChange={(val) => {
                          if (val === '__new__') {
                            updateEntry(index, 'brand', ' '); // trigger custom mode
                          } else {
                            updateEntry(index, 'brand', val);
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih merk..." />
                        </SelectTrigger>
                        <SelectContent>
                          {brands?.map((b) => (
                            <SelectItem key={b} value={b}>
                              {b}
                            </SelectItem>
                          ))}
                          <SelectItem value="__new__" className="font-semibold text-primary">
                            + Tambah Merk Baru
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {entry.brand && !brands?.includes(entry.brand) && (
                        <Input
                          value={entry.brand.trim()}
                          onChange={(e) => updateEntry(index, 'brand', e.target.value)}
                          placeholder="Ketik nama merk baru"
                          autoFocus
                          className="mt-1"
                        />
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Model</Label>
                      <Input
                        value={entry.model}
                        onChange={(e) => updateEntry(index, 'model', e.target.value)}
                        placeholder="cth: Galaxy A15"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Kapasitas (RAM/ROM)</Label>
                      <Input
                        value={entry.storage_capacity}
                        onChange={(e) => updateEntry(index, 'storage_capacity', e.target.value)}
                        placeholder="cth: 4/128"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">SRP</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={entry.srpFormatted}
                        onChange={(e) => updateEntry(index, 'srpFormatted', e.target.value)}
                        placeholder="cth: 2.500.000"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Button type="button" variant="outline" onClick={addRow} className="w-full">
              <Plus className="h-4 w-4 mr-2" /> Tambah Baris
            </Button>

            <Button
              type="button"
              onClick={handleManualSubmit}
              disabled={bulkInsertMutation.isPending}
              className="w-full"
            >
              {bulkInsertMutation.isPending ? 'Memproses...' : `Simpan ${entries.length} Model`}
            </Button>
          </TabsContent>

          <TabsContent value="csv" className="space-y-4 mt-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Format: <code className="text-xs">brand,model,storage_capacity,srp</code> (satu model per baris).
                Header opsional.
              </AlertDescription>
            </Alert>

            <Button type="button" variant="outline" onClick={downloadTemplate} className="w-full">
              <Download className="h-4 w-4 mr-2" /> Download Template CSV
            </Button>

            <div className="space-y-2">
              <Label>Tempel data CSV</Label>
              <Textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="SAMSUNG,Galaxy A15,128GB,2500000&#10;XIAOMI,Redmi 13,256GB,2800000"
                rows={8}
                className="font-mono text-sm"
              />
            </div>

            <Button
              type="button"
              onClick={handleCsvSubmit}
              disabled={bulkInsertMutation.isPending || !csvText.trim()}
              className="w-full"
            >
              <Upload className="h-4 w-4 mr-2" />
              {bulkInsertMutation.isPending ? 'Memproses...' : 'Import CSV'}
            </Button>
          </TabsContent>
        </Tabs>

        {results && (
          <div className="space-y-2 border-t pt-4 mt-4">
            {results.success > 0 && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  <strong>{results.success}</strong> model berhasil ditambahkan.
                </AlertDescription>
              </Alert>
            )}
            {results.failed.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>{results.failed.length}</strong> gagal:
                  <ul className="list-disc list-inside mt-1 text-xs space-y-0.5 max-h-32 overflow-y-auto">
                    {results.failed.map((f, i) => (
                      <li key={i}>
                        Baris {f.row}: {f.reason}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
