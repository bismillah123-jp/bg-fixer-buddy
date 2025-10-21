// @ts-nocheck
import React, { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import Papa from "papaparse";
import { Upload, Pencil, LogOut } from "lucide-react";
import { EditPhoneModelDialog } from "@/components/EditPhoneModelDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useNavigate } from "react-router-dom";

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
      // Get column values with case-insensitive matching
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
      
      // Normalize storage format (handle RAM/Storage format like "6/128")
      let normalizedStorage = Penyimpanan;
      if (Penyimpanan && Penyimpanan.includes('/')) {
        // Extract storage part from "6/128" format
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
      
      // Handle simplified format with only "Stok F" column
      const StokF = getColumnValue(['Stok F', 'stok f', 'STOK F', 'Stok', 'stok', 'STOK']);
      
      // If using simplified format, set default values
      let morningStock = parseInt(StokPagi, 10) || 0;
      let incoming = parseInt(Masuk, 10) || 0;
      let addStock = parseInt(TambahStok, 10) || 0;
      let returns = parseInt(Return, 10) || 0;
      let sold = parseInt(Terjual, 10) || 0;
      let adjustment = parseInt(Penyesuaian, 10) || 0;
      let nightStock = parseInt(StokMalam, 10) || 0;
      
      // If simplified format is used, treat Stok F as initial stock
      if (StokF && !StokPagi && !Masuk && !TambahStok && !Return && !Terjual && !Penyesuaian && !StokMalam) {
        morningStock = parseInt(StokF, 10) || 1;
        nightStock = morningStock; // Assume no movement for simplified data
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

      // Try to find model with normalized storage capacity
      let modelId = modelMap.get(`${Merk.toUpperCase()}-${Model.toUpperCase()}-${(normalizedStorage || '').toUpperCase()}`);
      if (!modelId && normalizedStorage) {
        // Try without storage capacity
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
          // Debug: Show available columns
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
    },
    onError: (error: any) => {
      toast({ title: "Reset Gagal", description: error.message, variant: "destructive" });
    },
  });

  const handleReset = () => {
    if (resetConfirmation === "RESET DATA") resetMutation.mutate();
    else toast({ title: "Konfirmasi Salah", description: "Silakan ketik 'RESET DATA' untuk mengkonfirmasi.", variant: "destructive" });
  };

  const handleFileChange = (event: any) => {
    if (event.target.files) setSelectedFile(event.target.files[0]);
    setImportErrors([]);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Akun</CardTitle>
          <CardDescription>Kelola akun Anda</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kelola SRP</CardTitle>
          <CardDescription>Edit harga SRP untuk setiap model HP</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Merk</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Kapasitas</TableHead>
                  <TableHead>SRP</TableHead>
                  <TableHead className="w-[100px]">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {phoneModels?.map((model: any) => (
                  <TableRow key={model.id}>
                    <TableCell>{model.brand}</TableCell>
                    <TableCell>{model.model}</TableCell>
                    <TableCell>{model.storage_capacity || '-'}</TableCell>
                    <TableCell>
                      {model.srp > 0 
                        ? `Rp ${model.srp.toLocaleString('id-ID')}`
                        : '-'
                      }
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingModel(model);
                          setIsEditDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export Data</CardTitle>
          <CardDescription>Download all of your stock data in a single, human-readable CSV file.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleExportAllStock} disabled={isExporting}>
            {isExporting ? "Mengekspor..." : "Export All Stock Data"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import Data</CardTitle>
          <CardDescription>Import stock data from a CSV file. Please use the same format as the exported file.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <Label htmlFor="csv-import">Upload CSV File</Label>
            <Input id="csv-import" type="file" accept=".csv" onChange={handleFileChange} />
            <Button onClick={handleImport} disabled={!selectedFile || isImporting}>
                <Upload className="mr-2 h-4 w-4" />
                {isImporting ? "Mengimpor..." : "Upload and Import"}
            </Button>
            {importErrors.length > 0 && (
                <div className="space-y-2 pt-4">
                    <h4 className="font-medium text-destructive">Error Impor:</h4>
                    <ul className="list-disc list-inside bg-destructive/10 p-4 rounded-md text-sm text-destructive">
                        {importErrors.slice(0, 5).map((error, index) => (
                            <li key={index}>{error}</li>
                        ))}
                        {importErrors.length > 5 && <li>Dan {importErrors.length - 5} error lainnya...</li>}
                    </ul>
                </div>
            )}
        </CardContent>
      </Card>

      <Card className="border-destructive">
        <CardHeader>
          <CardTitle>Reset Data</CardTitle>
          <CardDescription>Permanently delete all stock and model data. This action cannot be undone.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Label htmlFor="reset-confirmation">To confirm, type "RESET DATA" in the box below.</Label>
          <Input id="reset-confirmation" value={resetConfirmation} onChange={(e) => setResetConfirmation(e.target.value)} placeholder="RESET DATA" />
          <Button variant="destructive" onClick={handleReset} disabled={resetConfirmation !== "RESET DATA" || resetMutation.isPending}>
            {resetMutation.isPending ? "Mereset..." : "Reset Semua Data"}
          </Button>
        </CardContent>
      </Card>

      <EditPhoneModelDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        phoneModel={editingModel}
      />
    </div>
  );
};

export default Settings;
