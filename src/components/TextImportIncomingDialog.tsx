import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  label?: string;
  color?: string;
  imei?: string;
  error?: string;
}

const EXAMPLE = `12-07-2026,Realme,C71,KPS,Hitam,358712345678901
11-07-2026,Itel,A90,,Putih,359876543210987
10-07-2026,Xiaomi,Redmi 15,SBY,Biru,865432098765432`;

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

export function TextImportIncomingDialog({ open, onOpenChange }: Props) {
  const [locationId, setLocationId] = useState("");
  const [text, setText] = useState("");
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
      if (cols.length < 6) {
        rows.push({ raw: line, lineNo, error: "Format kurang kolom (butuh 6: Tanggal,Brand,Tipe,Label,Warna,IMEI). Kosongkan label dengan koma ganda ,, jika tidak ada." });
        continue;
      }
      const [dateStr, brandStr, modelStr, labelStr, colorStr, imeiStr] = cols;
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
      if (!colorStr) {
        rows.push({ raw: line, lineNo, date, error: "Warna kosong" });
        continue;
      }
      if (!/^\d{15}$/.test(imeiStr)) {
        rows.push({ raw: line, lineNo, date, error: `IMEI harus 15 digit angka: ${imeiStr}` });
        continue;
      }
      rows.push({
        raw: line,
        lineNo,
        date,
        brand: brandStr.toUpperCase(),
        model: modelStr,
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

      const imeis = validRows.map((r) => r.imei!);
      const dupes = imeis.filter((v, i) => imeis.indexOf(v) !== i);
      if (dupes.length > 0) throw new Error(`IMEI duplikat di daftar: ${[...new Set(dupes)].join(", ")}`);

      const { data: existing } = await supabase.from("stock_events").select("imei").in("imei", imeis);
      if (existing && existing.length > 0) {
        throw new Error(`IMEI sudah terdaftar: ${existing.map((s: any) => s.imei).join(", ")}`);
      }

      // Ensure a phone_model per brand+model exists
      const modelMap = new Map<string, string>();
      for (const r of validRows) {
        const key = `${r.brand}|${r.model}`;
        if (modelMap.has(key)) continue;
        const { data: found } = await supabase
          .from("phone_models")
          .select("id")
          .ilike("brand", r.brand!)
          .ilike("model", r.model!)
          .maybeSingle();
        if (found?.id) {
          modelMap.set(key, found.id);
        } else {
          const { data: created, error: cErr } = await supabase
            .from("phone_models")
            .insert({ brand: r.brand!, model: r.model! })
            .select("id")
            .single();
          if (cErr) throw new Error(`Gagal buat ${r.brand} ${r.model}: ${cErr.message}`);
          modelMap.set(key, created.id);
        }
      }

      const events = validRows.map((r) => ({
        date: r.date!,
        imei: r.imei!,
        location_id: locationId,
        phone_model_id: modelMap.get(`${r.brand}|${r.model}`)!,
        event_type: "masuk",
        qty: 1,
        notes: null,
        metadata: { color: r.color! },
        label: r.label ?? null,
      }));

      const { error } = await supabase.from("stock_events").insert(events);
      if (error) throw new Error(`Gagal menyimpan: ${error.message}`);
    },
    onSuccess: () => {
      toast({ title: "Berhasil", description: `${validRows.length} unit berhasil diimpor` });
      queryClient.invalidateQueries({ queryKey: ["stock-entries"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["all-phone-models"] });
      setText("");
      setLocationId("");
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
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
            Format tiap baris: <code className="text-xs">Tanggal,Brand,Tipe,Label,Warna,IMEI</code>. Label opsional — kosongkan dengan koma ganda (,,).
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
              placeholder={`12-07-2026,Realme,C71,KPS,Hitam,358712345678901\n11-07-2026,Itel,A90,,Putih,359876543210987`}
              rows={8}
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Tanggal: <code>DD-MM-YYYY</code> atau <code>YYYY-MM-DD</code>. IMEI: 15 digit. Brand & tipe baru otomatis dibuat.
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
