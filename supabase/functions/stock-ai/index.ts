import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, type } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch current stock context
    const today = new Date().toISOString().split("T")[0];

    // Get stock summary
    const { data: stockData } = await supabase
      .from("stock_entries")
      .select(`
        id, date, morning_stock, incoming, sold, returns, adjustment, night_stock, imei, label, metadata, cost_price, selling_price, sale_date,
        phone_model:phone_models(brand, model, storage_capacity),
        location:stock_locations(name)
      `)
      .eq("date", today)
      .order("date", { ascending: false })
      .limit(500);

    // Get recent sales (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const { data: recentSales } = await supabase
      .from("stock_events")
      .select(`
        date, imei, qty, event_type, metadata, label,
        phone_model:phone_models(brand, model, storage_capacity),
        location:stock_locations(name)
      `)
      .eq("event_type", "laku")
      .gte("date", thirtyDaysAgo)
      .order("date", { ascending: false })
      .limit(500);

    // Get all locations
    const { data: locations } = await supabase
      .from("stock_locations")
      .select("name");

    // Build context
    const locationNames = locations?.map((l: any) => l.name).join(", ") || "N/A";

    // Stock summary by brand/location
    const stockSummary: Record<string, any> = {};
    stockData?.forEach((entry: any) => {
      const brand = entry.phone_model?.brand || "Unknown";
      const loc = entry.location?.name || "Unknown";
      const key = `${brand}-${loc}`;
      if (!stockSummary[key]) {
        stockSummary[key] = { brand, location: loc, total: 0, sold_today: 0, incoming_today: 0 };
      }
      stockSummary[key].total += entry.night_stock;
      stockSummary[key].sold_today += entry.sold;
      stockSummary[key].incoming_today += entry.incoming;
    });

    // Sales trend by brand (last 30 days)
    const salesByBrand: Record<string, number> = {};
    const salesByDate: Record<string, number> = {};
    recentSales?.forEach((sale: any) => {
      const brand = sale.phone_model?.brand || "Unknown";
      salesByBrand[brand] = (salesByBrand[brand] || 0) + sale.qty;
      salesByDate[sale.date] = (salesByDate[sale.date] || 0) + sale.qty;
    });

    // Slow moving stock (items with night_stock > 0 and no recent sales)
    const availableStock = stockData?.filter((e: any) => e.night_stock > 0) || [];
    const soldImeis = new Set(recentSales?.map((s: any) => s.imei) || []);
    const slowMoving = availableStock.filter((e: any) => e.imei && !soldImeis.has(e.imei));

    const contextData = `
=== DATA STOK HARI INI (${today}) ===
Lokasi: ${locationNames}
Total unit tersedia: ${availableStock.length}

Ringkasan per Merk & Lokasi:
${Object.values(stockSummary).map((s: any) => 
  `- ${s.brand} di ${s.location}: ${s.total} unit, terjual hari ini: ${s.sold_today}, masuk hari ini: ${s.incoming_today}`
).join("\n")}

=== PENJUALAN 30 HARI TERAKHIR ===
Total terjual: ${recentSales?.length || 0} unit
Per Merk: ${Object.entries(salesByBrand).map(([b, c]) => `${b}: ${c}`).join(", ")}
Tren harian (5 hari terakhir): ${Object.entries(salesByDate).slice(0, 5).map(([d, c]) => `${d}: ${c} unit`).join(", ")}

=== STOK LAMBAT TERJUAL ===
${slowMoving.slice(0, 20).map((e: any) => 
  `- ${e.phone_model?.brand} ${e.phone_model?.model} ${e.phone_model?.storage_capacity || ""} (IMEI: ${e.imei}) di ${e.location?.name}`
).join("\n") || "Tidak ada data"}

=== DETAIL STOK TERSEDIA ===
${availableStock.slice(0, 50).map((e: any) => {
  const color = e.metadata?.color || "-";
  return `- ${e.phone_model?.brand} ${e.phone_model?.model} ${e.phone_model?.storage_capacity || ""} | Warna: ${color} | IMEI: ${e.imei} | Lokasi: ${e.location?.name} | Label: ${e.label || "-"}`;
}).join("\n")}
`;

    const systemPrompt = `Kamu adalah asisten AI untuk manajemen stok HP (handphone). Kamu membantu pemilik toko HP dengan:

1. **Menjawab pertanyaan stok** - berapa stok, di mana, model apa yang tersedia
2. **Laporan cerdas** - ringkasan penjualan, tren, performa per merk/lokasi
3. **Prediksi & rekomendasi restock** - berdasarkan tren penjualan, sarankan kapan dan apa yang perlu di-restock

Aturan:
- Jawab dalam Bahasa Indonesia
- Gunakan data yang diberikan sebagai referensi utama
- Jika ditanya tentang prediksi, analisis tren dari data penjualan 30 hari
- Format jawaban dengan jelas menggunakan markdown (bold, list, dll)
- Jika data tidak cukup untuk menjawab, katakan dengan jujur
- Singkat dan to the point, jangan bertele-tele
- Gunakan emoji untuk membuat jawaban lebih friendly 📱📊

${contextData}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
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
