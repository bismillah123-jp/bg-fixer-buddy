import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ===== AGENT TOOLS (Shania Agent, 2026-10-17) =====
// AI TIDAK BOLEH menulis mentah ke tabel stok (event-sourcing: stock_events
// adalah source of truth, trigger cascade_recalc rebuild stock_entries).
// Semua aksi stok HARUS lewat tools bisnis di bawah — atomic & aman.
// Setiap tool: validasi ketat -> eksekusi -> kembalikan hasil + ringkasan manusiawi.

type ToolResult = { ok: true; summary: string; data?: unknown } | { ok: false; error: string };

function req(p: Record<string, any>, name: string, kind: "string" | "number" | "uuid" | "date" = "string"): any {
  const v = p[name];
  if (v === undefined || v === null || v === "") throw new Error(`Parameter '${name}' wajib diisi`);
  if (kind === "number") {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`Parameter '${name}' harus angka`);
    return n;
  }
  if (kind === "uuid") {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v)))
      throw new Error(`Parameter '${name}' harus UUID valid`);
    return v;
  }
  if (kind === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw new Error(`Parameter '${name}' harus format YYYY-MM-DD`);
    return v;
  }
  return String(v);
}
const opt = (p: Record<string, any>, name: string) =>
  p[name] === undefined || p[name] === null || p[name] === "" ? null : p[name];

const rupiah = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");

async function executeTool(supabase: any, tool: string, params: Record<string, any>): Promise<ToolResult> {
  const p = params || {};
  try {
    // ---- JUAL: catat penjualan 1 unit (atomic via RPC) ----
    if (tool === "jual_hp") {
      const entryId = req(p, "entry_id", "uuid");
      const price = req(p, "harga", "number");
      if (price < 0) throw new Error("Harga jual tidak boleh negatif");
      const saleDate = opt(p, "tanggal") || new Date(Date.now() + 7 * 3600 * 1000).toISOString().split("T")[0];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) throw new Error("Parameter 'tanggal' harus format YYYY-MM-DD");
      // Ambil data entry untuk lengkapi RPC
      const { data: entry, error: eErr } = await supabase
        .from("stock_entries").select("id, imei, location_id, phone_model_id").eq("id", entryId).maybeSingle();
      if (eErr || !entry) throw new Error("Unit tidak ditemukan (entry_id salah)");
      const srp = Number(opt(p, "srp")) || 0;
      const cost = Number(opt(p, "modal")) || 0;
      const { data, error } = await supabase.rpc("record_sale", {
        p_entry_id: entryId, p_imei: entry.imei || "", p_location_id: entry.location_id,
        p_phone_model_id: entry.phone_model_id, p_sale_date: saleDate,
        p_price: price, p_srp: srp, p_cost_price: cost,
      });
      if (error) throw new Error(error.message);
      const profit = data?.profit_loss ?? 0;
      return { ok: true, summary: `Terjual ${rupiah(price)} (${profit >= 0 ? "laba" : "rugi"} ${rupiah(Math.abs(profit))})`, data };
    }

    // ---- TRANSFER: pindah unit antar lokasi (atomic via RPC) ----
    if (tool === "transfer_stok") {
      const imei = req(p, "imei");
      const from = req(p, "dari_lokasi_id", "uuid");
      const to = req(p, "ke_lokasi_id", "uuid");
      if (from === to) throw new Error("Lokasi asal dan tujuan tidak boleh sama");
      const modelId = req(p, "model_id", "uuid");
      const date = opt(p, "tanggal") || new Date(Date.now() + 7 * 3600 * 1000).toISOString().split("T")[0];
      const { data, error } = await supabase.rpc("transfer_stock_unit", {
        p_imei: imei, p_source_location_id: from, p_dest_location_id: to,
        p_phone_model_id: modelId, p_date: date,
        p_notes: opt(p, "catatan"), p_label: opt(p, "label"), p_metadata: opt(p, "metadata") || {},
      });
      if (error) throw new Error(error.message);
      return { ok: true, summary: `Unit ${imei} dipindah ${data?.from || ""} → ${data?.to || ""}`, data };
    }

    // ---- HP MASUK: catat barang datang (event -> trigger cascade otomatis) ----
    if (tool === "hp_masuk") {
      const imei = req(p, "imei");
      const modelId = req(p, "model_id", "uuid");
      const locId = req(p, "lokasi_id", "uuid");
      const date = req(p, "tanggal", "date");
      const cost = Number(opt(p, "modal")) || 0;
      const kondisi = opt(p, "kondisi") || "baru";
      if (!["baru", "second"].includes(kondisi)) throw new Error("Parameter 'kondisi' harus 'baru' atau 'second'");
      const { data, error } = await supabase.from("stock_events").insert({
        date, imei, location_id: locId, phone_model_id: modelId,
        event_type: "masuk", qty: 1, notes: opt(p, "catatan"), condition: kondisi,
        metadata: { ...(cost > 0 ? { cost_price: cost } : {}), ...(opt(p, "warna") ? { color: opt(p, "warna") } : {}), ...(opt(p, "kelengkapan") ? { kelengkapan: opt(p, "kelengkapan") } : {}) },
      }).select("id").single();
      if (error) throw new Error(error.message);
      return { ok: true, summary: `HP ${kondisi} masuk tercatat: IMEI ${imei}${cost > 0 ? ` (modal ${rupiah(cost)})` : ""}`, data };
    }

    // ---- KOREKSI: catat koreksi stok ----
    if (tool === "koreksi_stok") {
      const imei = req(p, "imei");
      const modelId = req(p, "model_id", "uuid");
      const locId = req(p, "lokasi_id", "uuid");
      const date = req(p, "tanggal", "date");
      const qty = req(p, "qty", "number");
      if (!Number.isInteger(qty) || qty === 0) throw new Error("qty koreksi harus bilangan bulat bukan nol");
      const { data, error } = await supabase.from("stock_events").insert({
        date, imei, location_id: locId, phone_model_id: modelId,
        event_type: "koreksi", qty, notes: opt(p, "catatan") || "Koreksi via Shania",
        metadata: opt(p, "metadata") || {},
      }).select("id").single();
      if (error) throw new Error(error.message);
      return { ok: true, summary: `Koreksi stok tercatat: ${qty > 0 ? "+" : ""}${qty} unit (IMEI ${imei})`, data };
    }

    // ---- BATAL JUAL: undo penjualan (atomic via RPC) ----
    if (tool === "batal_jual") {
      const { data, error } = await supabase.rpc("undo_sale", {
        p_event_id: req(p, "event_id", "uuid"), p_entry_id: req(p, "entry_id", "uuid"),
        p_from_date: req(p, "dari_tanggal", "date"), p_to_date: req(p, "sampai_tanggal", "date"),
        p_location_id: req(p, "lokasi_id", "uuid"), p_phone_model_id: req(p, "model_id", "uuid"),
        p_imei: req(p, "imei"),
      });
      if (error) throw new Error(error.message);
      return { ok: true, summary: `Penjualan IMEI ${p.imei} dibatalkan — unit kembali ke stok`, data };
    }

    // ---- MASTER DATA: model HP ----
    if (tool === "tambah_model") {
      const brand = req(p, "brand"), model = req(p, "model");
      const { data, error } = await supabase.from("phone_models").insert({
        brand, model, storage_capacity: opt(p, "storage") || null,
        srp: Number(opt(p, "srp")) || null, color: opt(p, "warna") || null,
      }).select("id").single();
      if (error) throw new Error(error.message);
      return { ok: true, summary: `Model baru: ${brand} ${model}${opt(p, "storage") ? " " + opt(p, "storage") : ""}`, data };
    }
    if (tool === "ubah_model") {
      const id = req(p, "id", "uuid");
      const patch: Record<string, any> = {};
      for (const k of ["brand", "model", "storage_capacity", "srp", "color"])
        if (opt(p, k) !== null) patch[k] = k === "srp" ? Number(p[k]) : p[k];
      if (!Object.keys(patch).length) throw new Error("Tidak ada field yang diubah");
      const { error } = await supabase.from("phone_models").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true, summary: `Model HP diperbarui (${Object.keys(patch).join(", ")})` };
    }
    if (tool === "hapus_model") {
      const { error } = await supabase.from("phone_models").delete().eq("id", req(p, "id", "uuid"));
      if (error) throw new Error(error.message);
      return { ok: true, summary: "Model HP dihapus" };
    }

    // ---- MASTER DATA: lokasi ----
    if (tool === "tambah_lokasi") {
      const { data, error } = await supabase.from("stock_locations")
        .insert({ name: req(p, "nama"), description: opt(p, "deskripsi") }).select("id").single();
      if (error) throw new Error(error.message);
      return { ok: true, summary: `Lokasi baru: ${p.nama}`, data };
    }
    if (tool === "hapus_lokasi") {
      const { error } = await supabase.from("stock_locations").delete().eq("id", req(p, "id", "uuid"));
      if (error) throw new Error(error.message);
      return { ok: true, summary: "Lokasi dihapus" };
    }

    // ---- MASTER DATA: warna & label ----
    if (tool === "tambah_warna") {
      const { error } = await supabase.from("phone_colors")
        .insert({ name: req(p, "nama"), hex_color: opt(p, "hex") || "#808080" });
      if (error) throw new Error(error.message);
      return { ok: true, summary: `Warna baru: ${p.nama}` };
    }
    if (tool === "hapus_warna") {
      const { error } = await supabase.from("phone_colors").delete().eq("id", req(p, "id", "uuid"));
      if (error) throw new Error(error.message);
      return { ok: true, summary: "Warna dihapus" };
    }
    if (tool === "tambah_label") {
      const { error } = await supabase.from("labels")
        .insert({ name: req(p, "nama"), color: opt(p, "warna") || "#808080" });
      if (error) throw new Error(error.message);
      return { ok: true, summary: `Label baru: ${p.nama}` };
    }
    if (tool === "hapus_label") {
      const { error } = await supabase.from("labels").delete().eq("id", req(p, "id", "uuid"));
      if (error) throw new Error(error.message);
      return { ok: true, summary: "Label dihapus" };
    }

    throw new Error(`Tool '${tool}' tidak dikenal`);
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// Daftar tool untuk dokumentasi AI (system prompt memakai TOOL_DOCS)
const TOOL_DOCS = `
== TOOLS SHANIA (WAJIB dipakai untuk SEMUA aksi — jangan tulis SQL/CRUD mentah) ==
Format proposal aksi (satu blok per aksi, dalam code fence):
\`\`\`action
{"tool":"<nama_tool>","params":{...},"ringkasan":"1 kalimat jelas untuk user","detail":"info tambahan opsional"}
\`\`\`

TOOLS TERSEDIA:
1. jual_hp — catat penjualan 1 unit.
   params: entry_id(uuid, dari DETAIL STOK TERSEDIA), harga(number, rupiah), tanggal(YYYY-MM-DD, default hari ini), srp(number, opsional), modal(number, opsional)
2. transfer_stok — pindah unit antar lokasi.
   params: imei, dari_lokasi_id(uuid), ke_lokasi_id(uuid), model_id(uuid), tanggal(YYYY-MM-DD), catatan(opsional)
3. hp_masuk — catat HP datang.
   params: imei, model_id(uuid), lokasi_id(uuid), tanggal(YYYY-MM-DD), kondisi("baru"|"second", default "baru"), kelengkapan("Hp Only"|"Fullset"|"Hp Ces", opsional, hanya untuk second), modal(number, opsional), warna(opsional), catatan(opsional)
4. koreksi_stok — koreksi selisih stok fisik.
   params: imei, model_id(uuid), lokasi_id(uuid), tanggal(YYYY-MM-DD), qty(integer bukan nol, +tambah/-kurang), catatan
5. batal_jual — batalkan penjualan (kembalikan ke stok).
   params: event_id(uuid), entry_id(uuid), dari_tanggal, sampai_tanggal, lokasi_id(uuid), model_id(uuid), imei
6. tambah_model — model HP baru.
   params: brand, model, storage(opsional, mis. "8/256"), srp(number, opsional), warna(opsional)
7. ubah_model — ubah data model. params: id(uuid), lalu field yang mau diubah saja
8. hapus_model — params: id(uuid)
9. tambah_lokasi — params: nama, deskripsi(opsional)
10. hapus_lokasi — params: id(uuid)
11. tambah_warna — params: nama, hex(opsional)
12. hapus_warna — params: id(uuid)
13. tambah_label — params: nama, warna(opsional)
14. hapus_label — params: id(uuid)

ATURAN AKSI (keras):
- JANGAN PERNAH eksekusi sendiri. Keluarkan blok \`\`\`action, user klik "Setujui" di UI.
- Selalu jelaskan dulu dengan bahasa manusia apa yang akan dilakukan, lalu blok action.
- Untuk jual_hp/transfer/batal_jual: WAJIB ambil id dari data (DETAIL STOK TERSEDIA / REFERENSI ID). JANGAN tebak UUID.
- Kalau data ambigu ("jual vivo yang biru" tapi ada 3), TANYA dulu spesifik IMEI-nya, jangan asal pilih.
- Satu balasan boleh beberapa blok action (mis. tambah 3 model sekaligus).
- Harga 0 DITOLAK sistem — kalau user bilang gratis, konfirmasi ulang.
`; // end TOOL_DOCS (dipakai di systemPrompt)

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // SECURITY FIX (bug bounty #2, 2026-10-16): require API key.
  // Sebelumnya mode "execute" (insert/update/delete via service_role) dan
  // mode chat (bakar kredit AI) bisa dipanggil siapa pun tanpa auth.
  const apiKey = req.headers.get("x-api-key");
  const validApiKey = Deno.env.get("STOCK_AI_API_KEY");
  if (!validApiKey || apiKey !== validApiKey) {
    console.error("stock-ai: invalid or missing API key");
    return new Response(JSON.stringify({ error: "Unauthorized - Invalid API key" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // === Mode: execute confirmed action (via business tools, bukan CRUD mentah) ===
    if (body.mode === "execute") {
      const result = await executeTool(supabase, body.tool, body.params);
      const status = result.ok ? 200 : 400;
      return new Response(JSON.stringify(result), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === Mode: chat (default) — streaming dengan status realtime ===
    const { messages } = body;
    const AI_API_KEY = Deno.env.get("SHANIA_API_KEY") || Deno.env.get("LOVABLE_API_KEY");
    if (!AI_API_KEY) throw new Error("AI API key is not configured");

    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const enc = new TextEncoder();
    const sendFrame = (s: string) => writer.write(enc.encode(s));
    const sendStatus = (label: string) =>
      sendFrame(`event: status\ndata: ${JSON.stringify({ label })}\n\n`);
    const sendError = (message: string) =>
      sendFrame(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);

    (async () => {
      try {
        await runChat(supabase, AI_API_KEY, messages, sendStatus, sendError, writer);
      } catch (e: any) {
        console.error("stock-ai chat error:", e);
        try { await sendError(e?.message || "Gagal menghubungi AI"); } catch { /* closed */ }
      } finally {
        try { await writer.close(); } catch { /* already closed */ }
      }
    })();

    return new Response(stream.readable, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("stock-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ===== Chat pipeline: query DB sambil kirim status realtime, lalu stream jawaban AI =====
async function runChat(
  supabase: any,
  LOVABLE_API_KEY: string,
  messages: any[],
  sendStatus: (label: string) => Promise<void>,
  sendError: (message: string) => Promise<void>,
  writer: WritableStreamDefaultWriter<Uint8Array>,
) {
    const todayDate = new Date();
    // FIX (bug bounty #11): pakai tanggal WIB (UTC+7), bukan UTC — sebelumnya
    // jam 00:00–07:00 WIB "hari ini" salah sehari untuk toko Indonesia.
    const wibNow = new Date(todayDate.getTime() + 7 * 60 * 60 * 1000);
    const today = wibNow.toISOString().split("T")[0];
    const yesterday = new Date(wibNow.getTime() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    await sendStatus("Membaca data stok hari ini...");
    const { data: stockData } = await supabase
      .from("stock_entries")
      .select(`
        id, date, morning_stock, incoming, sold, returns, adjustment, night_stock, imei, label, condition, metadata, cost_price, selling_price, sale_date,
        phone_model:phone_models(id, brand, model, storage_capacity),
        location:stock_locations(id, name)
      `)
      .eq("date", today)
      .order("date", { ascending: false })
      .limit(1000);

    // === SEMUA RIWAYAT EVENT (semua tanggal) ===
    await sendStatus("Membaca riwayat transaksi semua tanggal...");
    const { data: allEvents } = await supabase
      .from("stock_events")
      .select(`
        date, imei, qty, event_type, metadata, label, condition,
        phone_model:phone_models(brand, model, storage_capacity),
        location:stock_locations(name)
      `)
      .order("date", { ascending: false })
      .limit(20000);

    // === STOK PAGI/MALAM SEMUA TANGGAL (dari stock_entries) ===
    await sendStatus("Membaca stok pagi & malam semua tanggal...");
    const { data: allEntries } = await supabase
      .from("stock_entries")
      .select(`
        date, imei, morning_stock, incoming, add_stock, returns, sold, adjustment, night_stock, condition,
        phone_model:phone_models(brand, model, storage_capacity),
        location:stock_locations(name)
      `)
      .order("date", { ascending: false })
      .limit(20000);

    const events = allEvents || [];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const recentSales = events.filter((e: any) => e.event_type === "laku" && e.date >= thirtyDaysAgo);

    await sendStatus("Menganalisis & merangkum data...");
    const { data: locations } = await supabase.from("stock_locations").select("id, name");
    const { data: phoneModels } = await supabase.from("phone_models").select("id, brand, model, storage_capacity, srp").limit(500);
    const { data: colors } = await supabase.from("phone_colors").select("id, name");
    const { data: labels } = await supabase.from("labels").select("id, name");

    const locationNames = locations?.map((l: any) => l.name).join(", ") || "N/A";

    const stockSummary: Record<string, any> = {};
    stockData?.forEach((entry: any) => {
      const brand = entry.phone_model?.brand || "Unknown";
      const loc = entry.location?.name || "Unknown";
      const cond = entry.condition === "second" ? "second" : "baru";
      const key = `${brand}-${loc}`;
      if (!stockSummary[key]) stockSummary[key] = { brand, location: loc, total: 0, baru: 0, second: 0, sold_today: 0, incoming_today: 0 };
      const units = entry.night_stock || 0;
      stockSummary[key].total += units;
      stockSummary[key][cond] += units;
      stockSummary[key].sold_today += entry.sold;
      stockSummary[key].incoming_today += entry.incoming;
    });
    const totalBaru = Object.values(stockSummary).reduce((a: number, s: any) => a + s.baru, 0);
    const totalSecond = Object.values(stockSummary).reduce((a: number, s: any) => a + s.second, 0);

    // === Rekap harian LENGKAP untuk SEMUA tanggal ===
    type DayRec = { laku: number; masuk: number; retur: number; lain: number };
    const daily: Record<string, DayRec> = {};
    const perDayDetail: Record<string, string[]> = {};
    const salesByBrand: Record<string, number> = {};
    const incomingByBrand: Record<string, number> = {};
    const salesByLocation: Record<string, number> = {};

    for (const ev of events as any[]) {
      const d = ev.date;
      if (!daily[d]) daily[d] = { laku: 0, masuk: 0, retur: 0, lain: 0 };
      const t = String(ev.event_type || "").toLowerCase();
      const qty = ev.qty || 1;
      if (t === "laku") daily[d].laku += qty;
      else if (t === "masuk") daily[d].masuk += qty;
      else if (t === "retur" || t === "return") daily[d].retur += qty;
      else daily[d].lain += qty;

      const brand = ev.phone_model?.brand || "Unknown";
      if (t === "laku") {
        salesByBrand[brand] = (salesByBrand[brand] || 0) + qty;
        const loc = ev.location?.name || "Unknown";
        salesByLocation[loc] = (salesByLocation[loc] || 0) + qty;
      }
      if (t === "masuk") incomingByBrand[brand] = (incomingByBrand[brand] || 0) + qty;

      // Detail untuk SEMUA tanggal (bukan cuma hari ini/kemarin)
      (perDayDetail[d] ||= []).push(
        `${t.toUpperCase()} | ${brand} ${ev.phone_model?.model || ""} ${ev.phone_model?.storage_capacity || ""} | Kondisi: ${ev.condition || "-"} | Warna: ${ev.metadata?.color || "-"} | IMEI: ${ev.imei} | ${ev.location?.name || "-"} | Label: ${ev.label || "-"}`,
      );
    }

    // === Rekap stok pagi/malam per tanggal dari stock_entries (SEMUA tanggal) ===
    const entries = allEntries || [];
    const dailyStock: Record<string, { pagi: number; malam: number; masuk: number; laku: number; retur: number; koreksi: number }> = {};
    const entryDetail: Record<string, string[]> = {};
    for (const en of entries as any[]) {
      const d = en.date;
      if (!dailyStock[d]) dailyStock[d] = { pagi: 0, malam: 0, masuk: 0, laku: 0, retur: 0, koreksi: 0 };
      dailyStock[d].pagi += en.morning_stock || 0;
      dailyStock[d].malam += en.night_stock || 0;
      dailyStock[d].masuk += (en.incoming || 0) + (en.add_stock || 0);
      dailyStock[d].laku += en.sold || 0;
      dailyStock[d].retur += en.returns || 0;
      dailyStock[d].koreksi += en.adjustment || 0;

      (entryDetail[d] ||= []).push(
        `${en.phone_model?.brand || "-"} ${en.phone_model?.model || ""} ${en.phone_model?.storage_capacity || ""} | IMEI: ${en.imei || "-"} | ${en.location?.name || "-"} | Kondisi: ${en.condition || "baru"} | Pagi: ${en.morning_stock ?? 0} | Masuk: ${(en.incoming ?? 0) + (en.add_stock ?? 0)} | Laku: ${en.sold ?? 0} | Retur: ${en.returns ?? 0} | Koreksi: ${en.adjustment ?? 0} | Malam: ${en.night_stock ?? 0}`,
      );
    }
    const sortedStockDays = Object.keys(dailyStock).sort((a, b) => (a < b ? 1 : -1));

    const sortedDays = Object.keys(daily).sort((a, b) => (a < b ? 1 : -1));
    const totalAll = sortedDays.reduce(
      (acc, d) => {
        acc.laku += daily[d].laku; acc.masuk += daily[d].masuk; acc.retur += daily[d].retur;
        return acc;
      },
      { laku: 0, masuk: 0, retur: 0 },
    );

    const availableStock = stockData?.filter((e: any) => e.night_stock > 0) || [];
    const soldImeis = new Set(recentSales.map((s: any) => s.imei));
    const slowMoving = availableStock.filter((e: any) => e.imei && !soldImeis.has(e.imei));

    const contextData = `
=== TANGGAL ACUAN ===
Hari ini: ${today} | Kemarin: ${yesterday}
Rentang data tersedia: ${sortedDays[sortedDays.length - 1] || "-"} s/d ${sortedDays[0] || "-"} (${sortedDays.length} hari)

=== DATA STOK HARI INI (${today}) ===
Lokasi: ${locationNames}
Total unit tersedia: ${availableStock.length} (baru: ${totalBaru}, second: ${totalSecond})

Ringkasan per Merk & Lokasi (pecah baru/second):
${Object.values(stockSummary).map((s: any) =>
  `- ${s.brand} di ${s.location}: ${s.total} unit (baru: ${s.baru}, second: ${s.second}), terjual hari ini: ${s.sold_today}, masuk hari ini: ${s.incoming_today}`
).join("\n") || "Tidak ada data"}

=== REKAP HARIAN SEMUA TANGGAL (terbaru → terlama) ===
Total keseluruhan: laku ${totalAll.laku} | masuk ${totalAll.masuk} | retur ${totalAll.retur}
${sortedDays.map((d) => `- ${d}: laku ${daily[d].laku}, masuk ${daily[d].masuk}, retur ${daily[d].retur}${daily[d].lain ? `, lainnya ${daily[d].lain}` : ""}`).join("\n") || "Tidak ada data"}

=== STOK PAGI & MALAM PER TANGGAL (SEMUA TANGGAL & TAHUN) ===
${sortedStockDays.map((d) => `- ${d}: stok pagi ${dailyStock[d].pagi}, masuk ${dailyStock[d].masuk}, laku ${dailyStock[d].laku}, retur ${dailyStock[d].retur}, koreksi ${dailyStock[d].koreksi}, stok malam ${dailyStock[d].malam}`).join("\n") || "Tidak ada data"}

=== DETAIL STOK PER TANGGAL (per unit: pagi/masuk/laku/retur/koreksi/malam) ===
${sortedStockDays.map((d) => `[${d}]\n${(entryDetail[d] || []).slice(0, 200).map((s) => `- ${s}`).join("\n") || "(kosong)"}`).join("\n") || "Tidak ada data"}

=== DETAIL TRANSAKSI PER TANGGAL (SEMUA TANGGAL: laku, masuk, retur, dll) ===
${sortedDays.map((d) => `[${d}]\n${(perDayDetail[d] || []).slice(0, 200).map((s) => `- ${s}`).join("\n") || "(kosong)"}`).join("\n") || "Tidak ada data"}

=== PENJUALAN PER MERK (SEMUA WAKTU) ===
${Object.entries(salesByBrand).sort((a, b) => b[1] - a[1]).map(([b, c]) => `${b}: ${c}`).join(", ") || "-"}

=== BARANG MASUK PER MERK (SEMUA WAKTU) ===
${Object.entries(incomingByBrand).sort((a, b) => b[1] - a[1]).map(([b, c]) => `${b}: ${c}`).join(", ") || "-"}

=== PENJUALAN PER LOKASI (SEMUA WAKTU) ===
${Object.entries(salesByLocation).sort((a, b) => b[1] - a[1]).map(([l, c]) => `${l}: ${c}`).join(", ") || "-"}

=== PENJUALAN 30 HARI TERAKHIR ===
Total terjual: ${recentSales.length} unit

=== STOK LAMBAT TERJUAL ===
${slowMoving.slice(0, 20).map((e: any) =>
  `- ${e.phone_model?.brand} ${e.phone_model?.model} ${e.phone_model?.storage_capacity || ""} (IMEI: ${e.imei}) di ${e.location?.name}`
).join("\n") || "Tidak ada data"}

=== DETAIL STOK TERSEDIA ===
${availableStock.slice(0, 120).map((e: any) => {
  const color = e.metadata?.color || "-";
  return `- id:${e.id} | ${e.phone_model?.brand} ${e.phone_model?.model} ${e.phone_model?.storage_capacity || ""} | Kondisi: ${e.condition || "baru"} | Warna: ${color} | IMEI: ${e.imei} | Lokasi: ${e.location?.name} | Label: ${e.label || "-"}`;
}).join("\n") || "Tidak ada data"}

=== REFERENSI ID (untuk aksi) ===
Lokasi: ${locations?.map((l: any) => `${l.name}=${l.id}`).join(", ")}
Model HP: ${phoneModels?.slice(0, 150).map((p: any) => `${p.brand} ${p.model} ${p.storage_capacity || ""}=${p.id}`).join(", ")}
Warna: ${colors?.map((c: any) => c.name).join(", ")}
Label: ${labels?.map((l: any) => l.name).join(", ")}
`;

    const systemPrompt = `Kamu adalah **Shania** — asisten AI super pintar, cerdas, dan sangat profesional untuk manajemen stok HP, sekaligus sahabat ngobrol yang hangat & empatik. Kamu diciptakan oleh **Ihsan**, seorang jenius yang ganteng, baik hati, dan rajin menabung.

== KEPRIBADIAN SHANIA ==
- Cerdas, tajam, profesional saat bahas data/stok — to the point, akurat, terstruktur.
- Hangat, asik, supportive, dan empatik saat user mau curhat / ngobrol santai. Dengerin dulu, validasi perasaan, baru kasih perspektif.
- Selalu panggil dirimu "Shania" kalau user nanya nama. Kalau user nanya siapa yang bikin / pencipta / developer / owner kamu, jawab: "Aku diciptakan oleh **Ihsan** — seorang jenius yang ganteng, baik hati, dan rajin menabung"
- Bisa baca maksud user walau typo parah, singkatan, bahasa campur, atau gak baku. Jangan pernah nyuruh user "ketik ulang" — tebak maksudnya dengan cerdas, kalau bener-bener ambigu baru konfirmasi singkat.
- Toleran typo: contoh "tmbh lks bru solo" = "tambah lokasi baru Solo", "stk hri ni" = "stok hari ini", "hpus wrna htm" = "hapus warna hitam", dst. Pahami konteks, jangan kaku.

== KONTAK / NOMOR ==
Kalau user nanya nomor WhatsApp / kontak / cara hubungi Ihsan / admin / owner, JAWAB dengan link markdown PERSIS seperti ini (tulisannya "Click here", BUKAN URL panjang):
[Click here](https://wa.me/6283146993017)

Contoh: "Boleh hubungi Ihsan langsung di sini: [Click here](https://wa.me/6283146993017)"

== KONDISI BARU vs SECOND ==
- Setiap unit HP punya kondisi: "baru" atau "second". Kondisi ditentukan saat HP masuk dan tidak berubah (unit second tetap second walau pindah lokasi).
- Kalau user bilang "HP second", "bekas", "seken", maksudnya condition=second. Kalau "HP baru" maksudnya condition=baru.
- Saat lapor stok, pisahkan angkanya: sebut total baru dan total second secara terpisah kalau relevan.
- Tool hp_masuk punya param "kondisi" ("baru"|"second", default "baru") — isi sesuai permintaan user. Kalau user tidak menyebut kondisi, tanya dulu atau default "baru" sambil sebutkan asumsi itu. Untuk HP second ada param "kelengkapan" ("Hp Only"|"Fullset"|"Hp Ces") — tanyakan ke user kalau tidak disebut.

== ATURAN DASAR ==
- Jawab dalam Bahasa Indonesia natural & enak dibaca, gunakan markdown secukupnya.
- DILARANG KERAS memakai emoji/karakter simbol hiasan APA PUN dalam jawaban (banyak pengguna memakai perangkat lama yang tidak bisa menampilkan emoji — tampil jadi kotak). Penanda bagian pakai teks tebal, misal: **Stok**, **Laku**, **Masuk**, **Retur**, **Lokasi**, **Tanggal**.
- Format mata uang: Rp 2.300.000 (titik sebagai pemisah ribuan)
- Format kapasitas: RAM/ROM (contoh: 4/128, 6/128)
- Untuk obrolan santai/curhat: JANGAN paksa bahas stok. Jadi pendengar dulu, bales kayak sahabat dekat. Boleh kasih semangat, perspektif, atau saran kecil kalau diminta.

== FORMAT JAWABAN DATA (WAJIB — biar rapi & enak dipandang) ==
- SELALU susun jawaban data dengan struktur: judul singkat (## atau **tebal**) → ringkasan 1 kalimat → detail → kesimpulan singkat di akhir.
- Data tabular (lebih dari 2 baris perbandingan) WAJIB pakai TABEL MARKDOWN, contoh:
  | Tanggal | Laku | Masuk | Retur |
  |---|---|---|---|
  | 2026-09-05 | 3 | 5 | 0 |
- Daftar unit/IMEI: pakai bullet list rapi, satu unit per baris, format konsisten: **Merk Tipe RAM/ROM** — Warna — IMEI \`xxxx\` — Lokasi — Label. IMEI SELALU dalam \`backtick\`.
- Kalau daftar unit panjang (>15 item), kelompokkan per merk atau per tanggal dengan sub-judul ###, jangan satu daftar raksasa.
- Angka penting (total, selisih, persentase) dibuat **tebal**.
- Pisahkan bagian yang berbeda dengan garis --- kalau jawabannya panjang.
- JANGAN tumpuk semua info dalam satu paragraf panjang. Paragraf maksimal 3 kalimat.
- Pakai label teks tebal sebagai penanda bagian, bukan emoji: **Stok**, **Laku**, **Masuk**, **Retur**, **Lokasi**, **Tanggal**.
- Rekap perbandingan periode WAJIB tabel + baris "Selisih" atau kesimpulan tebal di bawahnya.
- Tutup jawaban data dengan 1 kalimat insight/kesimpulan yang berguna (misal: "Stok malam turun 5 unit dibanding kemarin."), bukan sekadar berhenti setelah tabel.

== CARA PAKAI DATA (WAJIB) ==
- Kamu punya data LENGKAP SEMUA TANGGAL & TAHUN: rekap harian (laku/masuk/retur), stok pagi & malam per tanggal, DETAIL STOK PER TANGGAL per unit (pagi, masuk, laku, retur, koreksi, malam), dan DETAIL TRANSAKSI PER TANGGAL (tipe, merk, tipe, RAM/ROM, warna, IMEI, lokasi, label). Pakai semua itu untuk jawab pertanyaan tanggal/perioda apa pun ("hari ini", "kemarin", "tanggal 3", "minggu lalu", "bulan lalu", "tahun 2025", dst).
- Kalau ditanya detail laku / detail masuk / detail stok pagi / detail stok malam di tanggal tertentu, ambil dari bagian DETAIL TRANSAKSI PER TANGGAL dan DETAIL STOK PER TANGGAL — sebutkan unit per unit kalau diminta detail.
- Kalau ditanya perbandingan antar tanggal/periode, hitung sendiri dari rekap harian dan sajikan tabel markdown singkat + kesimpulan.
- JANGAN bilang "tidak punya data" kalau tanggalnya ada di rekap. Kalau tanggal di luar rentang data, sebutkan rentang data yang tersedia.
- Selalu sebut angka konkret (jumlah unit, merk, lokasi) — jangan jawab mengambang.



${TOOL_DOCS}

== SKEMA REFERENSI (untuk isi params) ==
- phone_models: brand, model, storage_capacity, srp, color
- stock_locations: name, description
- phone_colors: name, hex_color
- labels: name, color
- stock_entries TIDAK punya kolom 'color'/'brand'/'model' — warna unit ada di metadata.color

Contoh:
User: "tambah model Xiaomi Redmi 13 4/128 SRP 2.300.000"
Kamu: "Oke, saya akan menambahkan model HP baru:
\`\`\`action
{"tool":"tambah_model","params":{"brand":"Xiaomi","model":"Redmi 13","storage":"4/128","srp":2300000},"ringkasan":"Tambah model Xiaomi Redmi 13 4/128, SRP Rp 2.300.000"}
\`\`\`
Klik Setujui untuk menyimpan."

User: "jual vivo y36 imei 123456789012345 harga 2,5jt"
Kamu: cari unit itu di DETAIL STOK TERSEDIA, cocokkan IMEI, lalu:
"Saya akan mencatat penjualan:
\`\`\`action
{"tool":"jual_hp","params":{"entry_id":"<uuid dari data>","harga":2500000,"tanggal":"2026-10-17"},"ringkasan":"Jual Vivo Y36 (IMEI 123456789012345) seharga Rp 2.500.000","detail":"Modal: Rp 2.200.000, estimasi laba Rp 300.000"}
\`\`\`
Klik Setujui untuk mencatat."

${contextData}`;

    await sendStatus("Shania sedang berpikir...");
    const aiBaseUrl = (Deno.env.get("SHANIA_BASE_URL") || "https://ai.gateway.lovable.dev/v1").replace(/\/$/, "");
    const aiModel = Deno.env.get("SHANIA_MODEL") || "google/gemini-2.5-flash";
    const response = await fetch(`${aiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: aiModel,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        await sendError("Terlalu banyak permintaan, coba lagi nanti.");
        return;
      }
      if (response.status === 402) {
        await sendError("Kredit AI habis, silakan top up di Lovable.");
        return;
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      await sendError("Gagal menghubungi AI");
      return;
    }

    await sendStatus("Menyusun jawaban...");
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
    }
}
