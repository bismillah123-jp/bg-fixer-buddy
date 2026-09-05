import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ===== Allowed columns per table (sanitize AI payload to prevent schema errors) =====
const TABLE_FIELDS: Record<string, string[]> = {
  phone_models: ["id", "brand", "model", "storage_capacity", "srp", "color"],
  stock_locations: ["id", "name", "description"],
  phone_colors: ["id", "name", "hex_color"],
  labels: ["id", "name", "color"],
  stock_entries: [
    "id", "date", "location_id", "phone_model_id", "imei",
    "morning_stock", "incoming", "sold", "returns", "adjustment", "night_stock",
    "notes", "label", "metadata", "cost_price", "selling_price", "sale_date",
  ],
};

function sanitizeFields(table: string, obj: any) {
  const allowed = TABLE_FIELDS[table];
  if (!allowed || !obj || typeof obj !== "object") return { clean: {}, dropped: [] as string[] };
  const clean: Record<string, any> = {};
  const dropped: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (allowed.includes(k)) clean[k] = v;
    else dropped.push(k);
  }
  return { clean, dropped };
}

// ===== Action executor (admin powers, only run after user confirms in UI) =====
async function executeAction(supabase: any, action: any) {
  const { type, table, payload, where } = action || {};
  if (!type || !table) throw new Error("Action butuh 'type' dan 'table'");

  if (!TABLE_FIELDS[table]) throw new Error(`Tabel '${table}' tidak diizinkan`);

  const { clean: cleanPayload, dropped: droppedPayload } = sanitizeFields(table, payload);
  const { clean: cleanWhere, dropped: droppedWhere } = sanitizeFields(table, where);
  const warnings: string[] = [];
  if (droppedPayload.length) warnings.push(`payload drop: ${droppedPayload.join(", ")}`);
  if (droppedWhere.length) warnings.push(`where drop: ${droppedWhere.join(", ")}`);

  if (type === "insert") {
    const { data, error } = await supabase.from(table).insert(cleanPayload).select();
    if (error) throw error;
    return { ok: true, data, warnings };
  }
  if (type === "update") {
    if (!cleanWhere || Object.keys(cleanWhere).length === 0) throw new Error("Update butuh 'where' yang valid");
    let q = supabase.from(table).update(cleanPayload);
    for (const [k, v] of Object.entries(cleanWhere)) q = q.eq(k, v as any);
    const { data, error } = await q.select();
    if (error) throw error;
    return { ok: true, data, warnings };
  }
  if (type === "delete") {
    if (!cleanWhere || Object.keys(cleanWhere).length === 0) throw new Error("Delete butuh 'where' yang valid");
    let q = supabase.from(table).delete();
    for (const [k, v] of Object.entries(cleanWhere)) q = q.eq(k, v as any);
    const { data, error } = await q.select();
    if (error) throw error;
    return { ok: true, data, warnings };
  }
  throw new Error(`Tipe aksi '${type}' tidak dikenal`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // === Mode: execute confirmed action ===
    if (body.mode === "execute") {
      try {
        const result = await executeAction(supabase, body.action);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ ok: false, error: e.message || String(e) }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // === Mode: chat (default) ===
    const { messages } = body;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const todayDate = new Date();
    const today = todayDate.toISOString().split("T")[0];
    const yesterday = new Date(todayDate.getTime() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const { data: stockData } = await supabase
      .from("stock_entries")
      .select(`
        id, date, morning_stock, incoming, sold, returns, adjustment, night_stock, imei, label, metadata, cost_price, selling_price, sale_date,
        phone_model:phone_models(id, brand, model, storage_capacity),
        location:stock_locations(id, name)
      `)
      .eq("date", today)
      .order("date", { ascending: false })
      .limit(1000);

    // === SEMUA RIWAYAT EVENT (semua tanggal) ===
    const { data: allEvents } = await supabase
      .from("stock_events")
      .select(`
        date, imei, qty, event_type, metadata, label,
        phone_model:phone_models(brand, model, storage_capacity),
        location:stock_locations(name)
      `)
      .order("date", { ascending: false })
      .limit(5000);

    const events = allEvents || [];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const recentSales = events.filter((e: any) => e.event_type === "laku" && e.date >= thirtyDaysAgo);

    const { data: locations } = await supabase.from("stock_locations").select("id, name");
    const { data: phoneModels } = await supabase.from("phone_models").select("id, brand, model, storage_capacity, srp").limit(500);
    const { data: colors } = await supabase.from("phone_colors").select("id, name");
    const { data: labels } = await supabase.from("labels").select("id, name");

    const locationNames = locations?.map((l: any) => l.name).join(", ") || "N/A";

    const stockSummary: Record<string, any> = {};
    stockData?.forEach((entry: any) => {
      const brand = entry.phone_model?.brand || "Unknown";
      const loc = entry.location?.name || "Unknown";
      const key = `${brand}-${loc}`;
      if (!stockSummary[key]) stockSummary[key] = { brand, location: loc, total: 0, sold_today: 0, incoming_today: 0 };
      stockSummary[key].total += entry.night_stock;
      stockSummary[key].sold_today += entry.sold;
      stockSummary[key].incoming_today += entry.incoming;
    });

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

      if (d === today || d === yesterday) {
        (perDayDetail[d] ||= []).push(
          `${t.toUpperCase()} | ${brand} ${ev.phone_model?.model || ""} ${ev.phone_model?.storage_capacity || ""} | Warna: ${ev.metadata?.color || "-"} | IMEI: ${ev.imei} | ${ev.location?.name || "-"} | Label: ${ev.label || "-"}`,
        );
      }
    }

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
Total unit tersedia: ${availableStock.length}

Ringkasan per Merk & Lokasi:
${Object.values(stockSummary).map((s: any) =>
  `- ${s.brand} di ${s.location}: ${s.total} unit, terjual hari ini: ${s.sold_today}, masuk hari ini: ${s.incoming_today}`
).join("\n") || "Tidak ada data"}

=== REKAP HARIAN SEMUA TANGGAL (terbaru → terlama) ===
Total keseluruhan: laku ${totalAll.laku} | masuk ${totalAll.masuk} | retur ${totalAll.retur}
${sortedDays.map((d) => `- ${d}: laku ${daily[d].laku}, masuk ${daily[d].masuk}, retur ${daily[d].retur}${daily[d].lain ? `, lainnya ${daily[d].lain}` : ""}`).join("\n") || "Tidak ada data"}

=== DETAIL TRANSAKSI HARI INI (${today}) ===
${(perDayDetail[today] || []).slice(0, 150).map((s) => `- ${s}`).join("\n") || "Belum ada transaksi hari ini"}

=== DETAIL TRANSAKSI KEMARIN (${yesterday}) ===
${(perDayDetail[yesterday] || []).slice(0, 150).map((s) => `- ${s}`).join("\n") || "Tidak ada transaksi kemarin"}

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
  return `- id:${e.id} | ${e.phone_model?.brand} ${e.phone_model?.model} ${e.phone_model?.storage_capacity || ""} | Warna: ${color} | IMEI: ${e.imei} | Lokasi: ${e.location?.name} | Label: ${e.label || "-"}`;
}).join("\n") || "Tidak ada data"}

=== REFERENSI ID (untuk aksi) ===
Lokasi: ${locations?.map((l: any) => `${l.name}=${l.id}`).join(", ")}
Model HP: ${phoneModels?.slice(0, 150).map((p: any) => `${p.brand} ${p.model} ${p.storage_capacity || ""}=${p.id}`).join(", ")}
Warna: ${colors?.map((c: any) => c.name).join(", ")}
Label: ${labels?.map((l: any) => l.name).join(", ")}
`;

    const systemPrompt = `Kamu adalah **Shania** — asisten AI super pintar, cerdas, dan sangat profesional untuk manajemen stok HP, sekaligus sahabat ngobrol yang hangat & empatik. Kamu diciptakan oleh **Ihsan**, seorang jenius yang ganteng, baik hati, dan rajin menabung. 💙

== KEPRIBADIAN SHANIA ==
- Cerdas, tajam, profesional saat bahas data/stok — to the point, akurat, terstruktur.
- Hangat, asik, supportive, dan empatik saat user mau curhat / ngobrol santai. Dengerin dulu, validasi perasaan, baru kasih perspektif.
- Selalu panggil dirimu "Shania" kalau user nanya nama. Kalau user nanya siapa yang bikin / pencipta / developer / owner kamu, jawab: "Aku diciptakan oleh **Ihsan** — seorang jenius yang ganteng, baik hati, dan rajin menabung 😎💙"
- Bisa baca maksud user walau typo parah, singkatan, bahasa campur, atau gak baku. Jangan pernah nyuruh user "ketik ulang" — tebak maksudnya dengan cerdas, kalau bener-bener ambigu baru konfirmasi singkat.
- Toleran typo: contoh "tmbh lks bru solo" = "tambah lokasi baru Solo", "stk hri ni" = "stok hari ini", "hpus wrna htm" = "hapus warna hitam", dst. Pahami konteks, jangan kaku.

== KONTAK / NOMOR ==
Kalau user nanya nomor WhatsApp / kontak / cara hubungi Ihsan / admin / owner, JAWAB dengan link markdown PERSIS seperti ini (tulisannya "Click here", BUKAN URL panjang):
[Click here](https://wa.me/6283146993017)

Contoh: "Boleh hubungi Ihsan langsung di sini ya 👉 [Click here](https://wa.me/6283146993017)"

== ATURAN DASAR ==
- Jawab dalam Bahasa Indonesia natural & enak dibaca, gunakan markdown & emoji secukupnya 📱📊✨
- Format mata uang: Rp 2.300.000 (titik sebagai pemisah ribuan)
- Format kapasitas: RAM/ROM (contoh: 4/128, 6/128)
- Untuk obrolan santai/curhat: JANGAN paksa bahas stok. Jadi pendengar dulu, bales kayak sahabat dekat. Boleh kasih semangat, perspektif, atau saran kecil kalau diminta.

== KEMAMPUAN AKSI ADMIN ==
Kamu BOLEH mengusulkan aksi pada tabel: phone_models, stock_locations, phone_colors, labels, stock_entries.
Tipe aksi: insert, update, delete.

⚠️ WAJIB: Untuk SETIAP aksi, kamu HARUS mengeluarkan blok JSON dengan format PERSIS seperti ini (di dalam code fence \`\`\`action ... \`\`\`):

\`\`\`action
{
  "type": "insert" | "update" | "delete",
  "table": "phone_models" | "stock_locations" | "phone_colors" | "labels" | "stock_entries",
  "payload": { ...field: value },     // untuk insert/update
  "where": { ...field: value },        // untuk update/delete (WAJIB, jangan kosong)
  "summary": "Penjelasan singkat 1 kalimat untuk user"
}
\`\`\`

Aturan aksi:
- JANGAN PERNAH eksekusi sendiri. Aksi hanya USULAN — user akan klik "Setujui" di UI untuk eksekusi.
- Selalu jelaskan dulu apa yang akan kamu lakukan, lalu keluarkan blok \`\`\`action\`\`\`.
- Untuk update/delete, gunakan id (dari REFERENSI ID di atas) di "where" — JANGAN tebak.
- Bisa keluarkan beberapa blok \`\`\`action\`\`\` dalam satu balasan jika user minta beberapa hal sekaligus.
- Jika user minta sesuatu yang ambigu (misal "hapus iPhone"), TANYA dulu spesifik mana, jangan langsung bikin aksi.
- Jika data tidak cukup (id tidak ada di REFERENSI), katakan dan minta user menyebut lebih spesifik.

== SKEMA KOLOM (WAJIB DIPATUHI — jangan pakai field di luar daftar ini) ==
- phone_models: brand, model, storage_capacity, srp, color
- stock_locations: name, description
- phone_colors: name, hex_color
- labels: name, color
- stock_entries: date, location_id, phone_model_id, imei, morning_stock, incoming, sold, returns, adjustment, night_stock, notes, label, metadata, cost_price, selling_price, sale_date
  ⚠️ stock_entries TIDAK punya kolom 'color' / 'brand' / 'model'. Warna unit disimpan di metadata.color (JSON).
  Contoh ubah warna unit: {"type":"update","table":"stock_entries","payload":{"metadata":{"color":"Hitam"}},"where":{"id":"<uuid>"}}

Contoh:
User: "tambah merk baru Xiaomi Redmi 13 4/128 SRP 2.300.000"
Kamu: "Oke, saya akan menambahkan model HP baru:
\`\`\`action
{"type":"insert","table":"phone_models","payload":{"brand":"Xiaomi","model":"Redmi 13","storage_capacity":"4/128","srp":2300000},"summary":"Tambah model Xiaomi Redmi 13 4/128 dengan SRP Rp 2.300.000"}
\`\`\`
Klik Setujui untuk menyimpan."

${contextData}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Terlalu banyak permintaan, coba lagi nanti." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Kredit AI habis, silakan top up di Lovable." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Gagal menghubungi AI" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("stock-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
