// @ts-nocheck
import React, { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import Papa from "papaparse";
import { 
  Upload, 
  Pencil, 
  LogOut, 
  Trash2, 
  Download, 
  FileUp,
  AlertTriangle,
  User,
  Smartphone,
  Database
} from "lucide-react";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/components/ui/alert-dialog";
import { EditPhoneModelDialog } from "@/components/EditPhoneModelDialog";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CsvRow {
  [key: string]: string;
}

const Settings = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isExporting, setIsExporting] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [editingModel, setEditingModel] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deletingModel, setDeletingModel] = useState<any>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Gagal Logout",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Logout Berhasil",
        description: "Anda telah keluar dari aplikasi",
      });
      navigate('/login');
    }
  };

  const { data: phoneModels } = useQuery({
    queryKey: ['phone-models'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('phone_models')
        .select('*')
        .order('brand')
        .order('model');
      if (error) throw error;
      return data;
    },
  });

  const downloadCSV = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportAllStock = async () => {
    setIsExporting(true);
    toast({ title: "Mengekspor data...", description: "Memuat semua data stok untuk di-export." });

    try {
      const { data, error } = await supabase
        .from('stock_entries')
        .select(`
          date, imei, notes, morning_stock, incoming, add_stock, returns, sold, adjustment, night_stock,
          stock_locations ( name ),
          phone_models ( brand, model, storage_capacity )
        `)
        .order('date', { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) {
        toast({ title: "Tidak ada data", description: "Tidak ada data stok untuk diekspor.", variant: "destructive" });
        return;
      }

      const flattenedData = data.map(entry => ({
        'Tanggal': entry.date,
        'Lokasi': entry.stock_locations?.name || 'N/A',
        'Merk': entry.phone_models?.brand || 'N/A',
        'Model': entry.phone_models?.model || 'N/A',
        'Penyimpanan': entry.phone_models?.storage_capacity || 'N/A',
        'IMEI': entry.imei,
        'Catatan': entry.notes || '',
        'Stok Pagi': entry.morning_stock,
        'Masuk': entry.incoming,
        'Tambah Stok': entry.add_stock,
        'Return': entry.returns,
        'Terjual': entry.sold,
        'Penyesuaian': entry.adjustment,
        'Stok Malam': entry.night_stock,
      }));

      const csv = (Papa as any).unparse(flattenedData, {
        delimiter: ',',
        header: true,
        newline: '\n',
        quotes: true,
        quoteChar: '"',
        escapeChar: '"',
        skipEmptyLines: false
      });
      const filename = `stock_export_${new Date().toISOString().split('T')[0]}.csv`;
      downloadCSV(csv, filename);
      toast({ title: "Ekspor Berhasil", description: `${data.length} baris data stok telah diekspor.` });
    } catch (error: any) {
      toast({ title: "Ekspor Gagal", description: error.message, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const importMutation = useMutation({
    mutationFn: async (entries: any[]) => {
      const { error } = await supabase.rpc('bulk_insert_stock' as any, { entries });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Import Berhasil", description: "Data stok telah berhasil diimpor." });
      queryClient.invalidateQueries();
    },
    onError: (error: any) => {
      toast({ title: "Import Gagal", description: `Terjadi kesalahan saat menyimpan data: ${error.message}`, variant: "destructive" });
    },
    onSettled: () => {
      setIsImporting(false);
      setSelectedFile(null);
    },
  });

  const validateAndTransformData = async (parsedData: CsvRow[]) => {
    setImportErrors([]);
    const [locationsRes, modelsRes] = await Promise.all([
      supabase.from('stock_locations').select('id, name'),
      supabase.from('phone_models').select('id, brand, model, storage_capacity'),
    ]);

    if (locationsRes.error || modelsRes.error) throw new Error(locationsRes.error?.message || modelsRes.error?.message);

    const locationMap = new Map(locationsRes.data.map(loc => [loc.name.toUpperCase(), loc.id]));
    const modelMap = new Map(modelsRes.data.map(m => [`${m.brand.toUpperCase()}-${m.model.toUpperCase()}-${(m.storage_capacity || '').toUpperCase()}`, m.id]));

    const validEntries: any[] = [];
    const errors: string[] = [];

    for (const [index, row] of parsedData.entries()) {
      const getColumnValue = (possibleNames: string[]) => {
        for (const name of possibleNames) {
          const value = row[name] || row[name.toLowerCase()] || row[name.toUpperCase()];
          if (value !== undefined && value !== null && value !== '') {
            return value;
          }
        }
        return null;
      };

      const Tanggal = getColumnValue(['Tanggal', 'tanggal', 'TANGGAL', 'Date', 'date']);
      const Lokasi = getColumnValue(['Lokasi', 'lokasi', 'LOKASI', 'Location', 'location']);
      const Merk = getColumnValue(['Merk', 'merk', 'MERK', 'Brand', 'brand']);
      const Model = getColumnValue(['Model', 'model', 'MODEL']);
      const Penyimpanan = getColumnValue(['Penyimpanan', 'penyimpanan', 'PENYIMPANAN', 'Storage', 'storage', 'Kapasitas', 'kapasitas']);
      
      let normalizedStorage = Penyimpanan;
      if (Penyimpanan && Penyimpanan.includes('/')) {
        normalizedStorage = Penyimpanan.split('/')[1];
      }
      const IMEI = getColumnValue(['IMEI', 'imei', 'Imei']);
      const Catatan = getColumnValue(['Catatan', 'catatan', 'CATATAN', 'Notes', 'notes']);
      const StokPagi = getColumnValue(['Stok Pagi', 'stok pagi', 'STOK PAGI', 'Morning Stock', 'morning_stock']);
      const Masuk = getColumnValue(['Masuk', 'masuk', 'MASUK', 'Incoming', 'incoming']);
      const TambahStok = getColumnValue(['Tambah Stok', 'tambah stok', 'TAMBAH STOK', 'Add Stock', 'add_stock']);
      const Return = getColumnValue(['Return', 'return', 'RETURN', 'Returns', 'returns']);
      const Terjual = getColumnValue(['Terjual', 'terjual', 'TERJUAL', 'Sold', 'sold']);
      const Penyesuaian = getColumnValue(['Penyesuaian', 'penyesuaian', 'PENYESUAIAN', 'Adjustment', 'adjustment']);
      const StokMalam = getColumnValue(['Stok Malam', 'stok malam', 'STOK MALAM', 'Night Stock', 'night_stock']);
      const StokF = getColumnValue(['Stok F', 'stok f', 'STOK F', 'Stok', 'stok', 'STOK']);
      
      let morningStock = parseInt(StokPagi, 10) || 0;
      let incoming = parseInt(Masuk, 10) || 0;
      let addStock = parseInt(TambahStok, 10) || 0;
      let returns = parseInt(Return, 10) || 0;
      let sold = parseInt(Terjual, 10) || 0;
      let adjustment = parseInt(Penyesuaian, 10) || 0;
      let nightStock = parseInt(StokMalam, 10) || 0;
      
      if (StokF && !StokPagi && !Masuk && !TambahStok && !Return && !Terjual && !Penyesuaian && !StokMalam) {
        morningStock = parseInt(StokF, 10) || 1;
        nightStock = morningStock;
      }

      if (!Tanggal || !Lokasi || !Merk || !Model || !IMEI) {
        errors.push(`Baris ${index + 2}: Kolom wajib (Tanggal, Lokasi, Merk, Model, IMEI) tidak lengkap.`);
        continue;
      }

      const locationId = locationMap.get(Lokasi.toUpperCase());
      if (!locationId) {
        errors.push(`Baris ${index + 2}: Lokasi "${Lokasi}" tidak ditemukan.`);
        continue;
      }

      let modelId = modelMap.get(`${Merk.toUpperCase()}-${Model.toUpperCase()}-${(normalizedStorage || '').toUpperCase()}`);
      if (!modelId && normalizedStorage) {
        modelId = modelMap.get(`${Merk.toUpperCase()}-${Model.toUpperCase()}-`);
      }
      if (!modelId) {
        errors.push(`Baris ${index + 2}: Model HP "${Merk} ${Model} ${normalizedStorage || ''}" tidak ditemukan.`);
        continue;
      }

      validEntries.push({
        date: Tanggal, location_id: locationId, phone_model_id: modelId, imei: IMEI,
        morning_stock: morningStock,
        incoming: incoming, 
        add_stock: addStock,
        returns: returns, 
        sold: sold,
        adjustment: adjustment, 
        night_stock: nightStock,
        notes: Catatan || '',
      });
    }

    setImportErrors(errors);
    return { validEntries, errors };
  };

  const handleImport = () => {
    if (!selectedFile) return;
    setIsImporting(true);
    setImportErrors([]);
    toast({ title: "Memulai proses import...", description: "Membaca dan memvalidasi file CSV." });

    (Papa as any).parse(selectedFile, {
      header: true, skipEmptyLines: true,
      complete: async (results) => {
        try {
          if (results.data && results.data.length > 0) {
            const availableColumns = Object.keys(results.data[0] as CsvRow);
            toast({ 
              title: "Debug Info", 
              description: `Kolom tersedia: ${availableColumns.join(', ')}`, 
              duration: 5000 
            });
          }

          const { validEntries, errors } = await validateAndTransformData(results.data as CsvRow[]);
          if (errors.length > 0) {
            toast({ title: "Ditemukan Error Validasi", description: `Terdapat ${errors.length} error.`, variant: "destructive" });
          }
          if (validEntries.length > 0) {
            importMutation.mutate(validEntries);
          } else {
             setIsImporting(false);
             if (errors.length === 0) {
                toast({ title: "Tidak ada data", description: "File CSV tidak berisi data yang valid untuk diimport." });
             }
          }
        } catch (error: any) {
          toast({ title: "Error Validasi", description: error.message, variant: "destructive" });
          setIsImporting(false);
        }
      },
      error: (error) => {
        toast({ title: "Gagal Membaca File", description: error.message, variant: "destructive" });
        setIsImporting(false);
      },
    });
  };

  const resetMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('reset_all_data' as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Reset Berhasil", description: "Semua data telah berhasil dihapus." });
      queryClient.invalidateQueries();
      setResetConfirmation("");
      setIsResetDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Reset Gagal", description: error.message, variant: "destructive" });
    },
  });

  const handleReset = () => {
    if (resetConfirmation === "RESET DATA") resetMutation.mutate();
    else toast({ title: "Konfirmasi Salah", description: "Silakan ketik 'RESET DATA' untuk mengkonfirmasi.", variant: "destructive" });
  };

  const deleteModelMutation = useMutation({
    mutationFn: async (modelId: string) => {
      const { error } = await supabase
        .from('phone_models')
        .delete()
        .eq('id', modelId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ 
        title: "Model Dihapus", 
        description: "Model HP telah berhasil dihapus." 
      });
      queryClient.invalidateQueries({ queryKey: ['phone-models'] });
      setIsDeleteDialogOpen(false);
      setDeletingModel(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Gagal Menghapus", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const handleDeleteModel = () => {
    if (deletingModel) {
      deleteModelMutation.mutate(deletingModel.id);
    }
  };

  const handleFileChange = (event: any) => {
    if (event.target.files) setSelectedFile(event.target.files[0]);
    setImportErrors([]);
  };

  // Group phone models by brand
  const groupedModels = phoneModels?.reduce((acc, model) => {
    const brand = model.brand;
    if (!acc[brand]) acc[brand] = [];
    acc[brand].push(model);
    return acc;
  }, {} as Record<string, typeof phoneModels>) || {};

  return (
    <div className="space-y-4 pb-24">
      {/* Account Section */}
      <Card className="bg-card/50 border-0 shadow-sm overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <CardTitle className="text-base">Akun</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Button 
            variant="outline" 
            onClick={handleLogout}
            className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" />
            Keluar dari Akun
          </Button>
        </CardContent>
      </Card>

      {/* Phone Models Section */}
      <Card className="bg-card/50 border-0 shadow-sm overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-info/10 flex items-center justify-center">
              <Smartphone className="h-5 w-5 text-info" />
            </div>
            <div>
              <CardTitle className="text-base">Model HP & SRP</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {phoneModels?.length || 0} model terdaftar
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
            {Object.entries(groupedModels).map(([brand, models]) => (
              <div key={brand} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs font-semibold">
                    {brand}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {(models as any[]).length} model
                  </span>
                </div>
                <div className="grid gap-2">
                  {(models as any[]).map((model: any) => (
                    <div 
                      key={model.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {model.model}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            {model.storage_capacity || '-'}
                          </span>
                          {model.color && (
                            <>
                              <span className="text-muted-foreground">•</span>
                              <span className="text-xs text-muted-foreground">
                                {model.color}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-sm font-semibold",
                          model.srp > 0 ? "text-success" : "text-muted-foreground"
                        )}>
                          {model.srp > 0 
                            ? `Rp ${model.srp.toLocaleString('id-ID')}`
                            : '-'
                          }
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditingModel(model);
                            setIsEditDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => {
                            setDeletingModel(model);
                            setIsDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {(!phoneModels || phoneModels.length === 0) && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Belum ada model HP terdaftar
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Data Management Section */}
      <Card className="bg-card/50 border-0 shadow-sm overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
              <Database className="h-5 w-5 text-success" />
            </div>
            <CardTitle className="text-base">Kelola Data</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {/* Export */}
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Download className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Export Data</p>
                  <p className="text-xs text-muted-foreground">Download semua data stok (CSV)</p>
                </div>
              </div>
              <Button 
                size="sm" 
                variant="secondary"
                onClick={handleExportAllStock} 
                disabled={isExporting}
              >
                {isExporting ? "..." : "Export"}
              </Button>
            </div>
          </div>

          {/* Import */}
          <div className="p-3 rounded-lg bg-muted/30 space-y-3">
            <div className="flex items-center gap-3">
              <FileUp className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Import Data</p>
                <p className="text-xs text-muted-foreground">Upload file CSV untuk import stok</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Input 
                id="csv-import" 
                type="file" 
                accept=".csv" 
                onChange={handleFileChange}
                className="text-xs"
              />
              <Button 
                size="sm"
                onClick={handleImport} 
                disabled={!selectedFile || isImporting}
              >
                <Upload className="h-3.5 w-3.5 mr-1" />
                {isImporting ? "..." : "Import"}
              </Button>
            </div>
            {importErrors.length > 0 && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 space-y-1">
                <p className="text-xs font-medium text-destructive">Error Import:</p>
                <ul className="text-xs text-destructive space-y-0.5">
                  {importErrors.slice(0, 3).map((error, index) => (
                    <li key={index}>• {error}</li>
                  ))}
                  {importErrors.length > 3 && (
                    <li className="text-muted-foreground">
                      +{importErrors.length - 3} error lainnya
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="bg-destructive/5 border-destructive/20 shadow-sm overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <CardTitle className="text-base text-destructive">Zona Bahaya</CardTitle>
              <p className="text-xs text-destructive/70 mt-0.5">
                Tindakan tidak dapat dibatalkan
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Button 
            variant="destructive" 
            className="w-full"
            onClick={() => setIsResetDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Reset Semua Data
          </Button>
        </CardContent>
      </Card>

      {/* Edit Phone Model Dialog */}
      <EditPhoneModelDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        phoneModel={editingModel}
      />

      {/* Delete Model Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Model HP?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus model HP <strong>{deletingModel?.brand} {deletingModel?.model} {deletingModel?.storage_capacity}</strong>?
              {' '}Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteModel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Data Dialog */}
      <AlertDialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Reset Semua Data?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Tindakan ini akan menghapus <strong>semua data stok dan model HP</strong>. 
                Data yang dihapus tidak dapat dikembalikan.
              </p>
              <div className="space-y-2">
                <Label htmlFor="reset-confirmation" className="text-foreground">
                  Ketik <strong>RESET DATA</strong> untuk konfirmasi:
                </Label>
                <Input 
                  id="reset-confirmation" 
                  value={resetConfirmation} 
                  onChange={(e) => setResetConfirmation(e.target.value)} 
                  placeholder="RESET DATA"
                  className="font-mono"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setResetConfirmation("")}>
              Batal
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleReset}
              disabled={resetConfirmation !== "RESET DATA" || resetMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {resetMutation.isPending ? "Mereset..." : "Reset Data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Settings;
