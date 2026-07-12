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
  date?: string; // yyyy-mm-dd
  brand?: string;
  model?: string;
  color?: string;
  imei?: string;
  error?: string;
}

const EXAMPLE = `12-07-2026,Samsung Galaxy S24 Ultra,Titanium Black,358712345678901
11-07-2026,iPhone 15 Pro Max,Natural Titanium,359876543210987
10-07-2026,Xiaomi 14 Pro,White,865432098765432`;

function parseDate(s: string): string | undefined {
  const t = s.trim();
  // DD-MM-YYYY or DD/MM/YYYY
  let m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // YYYY-MM-DD
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return undefined;
}

function splitBrandModel(text: string, brands: string[]): { brand: string; model: string } {
  const t = text.trim();
  const lower = t.toLowerCase();
  // Try longest brand match first
  const sorted = [...brands].sort((a, b) => b.length - a.length);
  for (const b of sorted) {
    if (lower.startsWith(b.toLowerCase() + " ") || lower === b.toLowerCase()) {
      return { brand: b, model: t.slice(b.length).trim() || t };
    }
  }
  // iPhone special-case → Apple/iPhone
  if (lower.startsWith("iphone")) {
    return { brand: "APPLE", model: t };
  }
  // Fallback: first word as brand
  const parts = t.split(/\s+/);
  const brand = (parts.shift() || "").toUpperCase();
  const model = parts.join(" ") || brand;
  return { brand, model };
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

  const { data: allModels } = useQuery({
    queryKey: ["all-phone-models"],
    queryFn: async () => {
      const { data, error } = await supabase.from("phone_models").select("*");
      if (error) throw error;
      return data;
    },
  });

  const brands = useMemo(() => {
    if (!allModels) return [];
    return [...new Set(allModels.map((m: any) => m.brand))];
  }, [allModels]);

  const parsed: ParsedRow[] = useMemo(() => {
    if (!text.trim()) return [];
    const lines = text.split(/\r?\n/);
    const rows: ParsedRow[] = [];
    let lineNo = 0;
    for (const raw of lines) {
      lineNo++;
      const line = raw.trim();
      if (!line) continue;
      // skip header
      if (/tanggal.*imei/i.test(line)) continue;
      const cols = line.split(",").map((c) => c.trim());
      if (cols.length < 4) {
        rows.push({ raw: line, lineNo, error: "Format kurang kolom (butuh 4: Tanggal,Merk/Model,Warna,IMEI)" });
        continue;
      }
      const [dateStr, brandModel, color, imei] = cols;
      const date = parseDate(dateStr);
      if (!date) {
        rows.push({ raw: line, lineNo, error: `Tanggal tidak valid: ${dateStr}` });
        continue;
      }
      if (!/^\d{15}$/.test(imei)) {
        rows.push({ raw: line, lineNo, date, error: `IMEI harus 15 digit angka: ${imei}` });
        continue;
      }
      if (!color) {
        rows.push({ raw: line, lineNo, date, error: "Warna kosong" });
        continue;
      }
      const { brand, model } = splitBrandModel(brandModel, brands);
      if (!brand || !model) {
        rows.push({ raw: line, lineNo, error: "Merk/Model tidak dapat dipisah" });
        continue;
      }
      rows.push({ raw: line, lineNo, date, brand, model, color, imei });
    }
    return rows;
  }, [text, brands]);

  const validRows = parsed.filter((r) => !r.error);
  const errorRows = parsed.filter((r) => r.error);

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!locationId) throw new Error("Lokasi wajib dipilih");
      if (validRows.length === 0) throw new Error("Tidak ada baris valid untuk diimpor");

      // Duplicate IMEIs in list
      const imeis = validRows.map((r) => r.imei!);
      const dupes = imeis.filter((v, i) => imeis.indexOf(v) !== i);
      if (dupes.length > 0) throw new Error(`IMEI duplikat di daftar: ${[...new Set(dupes)].join(", ")}`);

      // Existing IMEIs
      const { data: existing } = await supabase.from("stock_events").select("imei").in("imei", imeis);
      if (existing && existing.length > 0) {
        throw new Error(`IMEI sudah terdaftar: ${existing.map((s: any) => s.imei).join(", ")}`);
      }

      // Ensure phone_model exists for each brand/model
      const modelMap = new Map<string, string>(); // key: brand|model -> id
      for (const r of validRows) {
        const key = `${r.brand}|${r.model}`;
        if (modelMap.has(key)) continue;

        // Try find (case-insensitive)
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
          if (cErr) throw new Error(`Gagal buat model ${r.brand} ${r.model}: ${cErr.message}`);
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
        label: null,
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
            Tempel daftar HP. Format tiap baris: <code className="text-xs">Tanggal,Merk/Model,Warna,IMEI</code>
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
              placeholder={`12-07-2026,Samsung Galaxy S24 Ultra,Titanium Black,358712345678901\n11-07-2026,iPhone 15 Pro Max,Natural Titanium,359876543210987`}
              rows={8}
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Tanggal: <code>DD-MM-YYYY</code> atau <code>YYYY-MM-DD</code>. IMEI: 15 digit. Model baru akan otomatis dibuat.
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
                      <th className="text-left p-2">Merk</th>
                      <th className="text-left p-2">Model</th>
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
                            <td className="p-2 text-destructive" colSpan={5}>
                              {r.error} — <span className="opacity-70">{r.raw}</span>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-2">{r.lineNo}</td>
                            <td className="p-2">{r.date}</td>
                            <td className="p-2 font-medium">{r.brand}</td>
                            <td className="p-2">{r.model}</td>
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
