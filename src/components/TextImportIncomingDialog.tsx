import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmableDialog } from "@/components/ConfirmableDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle2, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedRow {
  raw: string;
  lineNo: number;
  date?: string;
  brand?: string;
  model?: string;
  storage?: string;
  label?: string;
  color?: string;
  imei?: string;
  error?: string;
}

const EXAMPLE = `23/08/2026,VIVO,Y05,4/64,REPACK,123456789101112,BLUE
12-07-2026,Realme,C71,4/128,KPS,358712345678901,Hitam
11-07-2026,Itel,A90,4/64,,359876543210987,Putih
10-07-2026,Xiaomi,Redmi 15,8/128,SBY,865432098765432,Biru`;

function parseDate(s: string): string | undefined {
  const t = s.trim();
  let m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return undefined;
}

// Normalize storage to RAM/ROM (e.g. "4/64", "6/128"). Accept "128GB" -> "" (drop).
function normalizeStorage(s: string): string {
  const t = s.trim();
  if (!t) return "";
  const m = t.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m) return `${m[1]}/${m[2]}`;
  return t;
}

export function TextImportIncomingDialog({ open, onOpenChange }: Props) {
  const [locationId, setLocationId] = useState("");
  const [text, setText] = useState("");
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: locations } = useQuery({
    queryKey: ["stock-locations-names"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_locations").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const parsed: ParsedRow[] = useMemo(() => {
    if (!text.trim()) return [];
    const lines = text.split(/\r?\n/);
    const rows: ParsedRow[] = [];
    let lineNo = 0;
    for (const raw of lines) {
      lineNo++;
      const line = raw.trim();
      if (!line) continue;
      if (/tanggal.*imei/i.test(line)) continue;
      const cols = line.split(",").map((c) => c.trim());
      if (cols.length < 7) {
        rows.push({ raw: line, lineNo, error: "Format kurang kolom (butuh 7: Tanggal,Brand,Tipe,RAM/ROM,Label,IMEI,Warna). Kosongkan label dengan koma ganda ,, jika tidak ada." });
        continue;
      }
      const [dateStr, brandStr, modelStr, storageStr, labelStr, imeiStr, colorStr] = cols;
      const date = parseDate(dateStr);
      if (!date) {
        rows.push({ raw: line, lineNo, error: `Tanggal tidak valid: ${dateStr}` });
        continue;
      }
      if (!brandStr) {
        rows.push({ raw: line, lineNo, date, error: "Brand kosong" });
        continue;
      }
      if (!modelStr) {
        rows.push({ raw: line, lineNo, date, error: "Tipe kosong" });
        continue;
      }
      if (!storageStr) {
        rows.push({ raw: line, lineNo, date, error: "RAM/ROM kosong" });
        continue;
      }
      if (!imeiStr || !/^\d{15}$/.test(imeiStr)) {
        rows.push({ raw: line, lineNo, date, error: `IMEI harus 15 digit angka: ${imeiStr ?? ""}` });
        continue;
      }
      if (!colorStr) {
        rows.push({ raw: line, lineNo, date, error: "Warna kosong" });
        continue;
      }
      rows.push({
        raw: line,
        lineNo,
        date,
        brand: brandStr.toUpperCase(),
        model: modelStr,
        storage: normalizeStorage(storageStr),
        label: labelStr || undefined,
        color: colorStr,
        imei: imeiStr,
      });
    }
    return rows;
  }, [text]);

  const validRows = parsed.filter((r) => !r.error);
  const errorRows = parsed.filter((r) => r.error);

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!locationId) throw new Error("Lokasi wajib dipilih");
      if (validRows.length === 0) throw new Error("Tidak ada baris valid untuk diimpor");

      const nonRepackRows = validRows.filter((r) => (r.label ?? "").toLowerCase() !== "repack");
      const nonRepackImeis = nonRepackRows.map((r) => r.imei!);

      const dupes = nonRepackImeis.filter((v, i) => nonRepackImeis.indexOf(v) !== i);
      if (dupes.length > 0) throw new Error(`IMEI duplikat di daftar: ${[...new Set(dupes)].join(", ")}`);

      const { data: existing } = await supabase.from("stock_events").select("imei").in("imei", nonRepackImeis);
      if (existing && existing.length > 0) {
        throw new Error(`IMEI sudah terdaftar: ${existing.map((s: any) => s.imei).join(", ")}`);
      }

      // Ensure a phone_model per brand+model+storage exists
      const modelMap = new Map<string, string>();
      for (const r of validRows) {
        const key = `${r.brand}|${r.model}|${r.storage}`;
        if (modelMap.has(key)) continue;
        const { data: found } = await supabase
          .from("phone_models")
          .select("id")
          .ilike("brand", r.brand!)
          .ilike("model", r.model!)
          .eq("storage_capacity", r.storage ?? "")
          .maybeSingle();
        if (found?.id) {
          modelMap.set(key, found.id);
        } else {
          const { data: created, error: cErr } = await supabase
            .from("phone_models")
            .insert({ brand: r.brand!, model: r.model!, storage_capacity: r.storage ?? "" })
            .select("id")
            .single();
          if (cErr) throw new Error(`Gagal buat ${r.brand} ${r.model} ${r.storage}: ${cErr.message}`);
          modelMap.set(key, created.id);
        }
      }

      const events = validRows.map((r) => ({
        date: r.date!,
        imei: r.imei!,
        location_id: locationId,
        phone_model_id: modelMap.get(`${r.brand}|${r.model}|${r.storage}`)!,
        event_type: "masuk",
        qty: 1,
        notes: null,
        metadata: { color: r.color! },
        label: r.label ?? null,
      }));

      const BATCH_SIZE = 25;
      const totalBatches = Math.ceil(events.length / BATCH_SIZE);
      setProgress({ current: 0, total: totalBatches });
      for (let i = 0; i < events.length; i += BATCH_SIZE) {
        const chunk = events.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from("stock_events").insert(chunk);
        if (error) throw new Error(`Gagal menyimpan batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
        setProgress({ current: Math.min(i / BATCH_SIZE + 1, totalBatches), total: totalBatches });
      }
    },
    onSuccess: () => {
      toast({ title: "Berhasil", description: `${validRows.length} unit berhasil diimpor` });
      queryClient.invalidateQueries({ queryKey: ["stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["all-phone-models"] });
      setText("");
      setLocationId("");
      setProgress(null);
      onOpenChange(false);
    },
    onError: (e: any) => {
      setProgress(null);
      toast({ title: "Gagal", description: e.message, variant: "destructive" });
    },
  });

  const isDirty = !!(locationId || text.trim());

  return (
    <ConfirmableDialog open={open} onOpenChange={onOpenChange} isDirty={isDirty}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="sticky top-0 bg-background z-10 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Impor HP Datang (Teks)
          </DialogTitle>
          <DialogDescription>
            Format tiap baris: <code className="text-xs">Tanggal,Brand,Tipe,RAM/ROM,Label,IMEI,Warna</code>. Label opsional — kosongkan dengan koma ganda (,,). Contoh: <code className="text-xs">23/08/2026,VIVO,Y05,4/64,REPACK,123456789101112,BLUE</code>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pb-4">
          <div className="space-y-2">
            <Label>Lokasi</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih lokasi" />
              </SelectTrigger>
              <SelectContent>
                {locations?.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Data (satu unit per baris)</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setText(EXAMPLE)}
                className="text-xs h-7"
              >
                Isi contoh
              </Button>
            </div>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`23/08/2026,VIVO,Y05,4/64,REPACK,123456789101112,BLUE\n12-07-2026,Realme,C71,4/128,KPS,358712345678901,Hitam`}
              rows={8}
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Tanggal: <code>DD-MM-YYYY</code> atau <code>DD/MM/YYYY</code>. IMEI: 15 digit. RAM/ROM: <code>4/64</code>, <code>6/128</code>. Label <code>REPACK</code> boleh IMEI duplikat.
            </p>
          </div>

          {parsed.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Valid: {validRows.length}
                </Badge>
                {errorRows.length > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" /> Error: {errorRows.length}
                  </Badge>
                )}
              </div>

              <div className="border rounded-lg max-h-64 overflow-y-auto text-xs">
                <table className="w-full">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2">#</th>
                      <th className="text-left p-2">Tanggal</th>
                      <th className="text-left p-2">Brand</th>
                      <th className="text-left p-2">Tipe</th>
                      <th className="text-left p-2">Label</th>
                      <th className="text-left p-2">Warna</th>
                      <th className="text-left p-2">IMEI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((r) => (
                      <tr
                        key={r.lineNo}
                        className={r.error ? "bg-destructive/10" : "border-t"}
                      >
                        {r.error ? (
                          <>
                            <td className="p-2">{r.lineNo}</td>
                            <td className="p-2 text-destructive" colSpan={6}>
                              {r.error} — <span className="opacity-70">{r.raw}</span>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-2">{r.lineNo}</td>
                            <td className="p-2">{r.date}</td>
                            <td className="p-2 font-medium">{r.brand}</td>
                            <td className="p-2">{r.model}</td>
                            <td className="p-2">{r.label || <span className="opacity-40">—</span>}</td>
                            <td className="p-2">{r.color}</td>
                            <td className="p-2 font-mono">{r.imei}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {importMutation.isPending && progress && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Memproses batch...</span>
                <span>{Math.round(progress.current)} / {progress.total} ({Math.round((progress.current / progress.total) * 100)}%)</span>
              </div>
              <Progress value={(progress.current / progress.total) * 100} />
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Batal
            </Button>
            <Button
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending || validRows.length === 0 || !locationId}
              className="flex-1"
            >
              {importMutation.isPending ? "Mengimpor..." : `Impor ${validRows.length} Unit`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </ConfirmableDialog>
  );
}
