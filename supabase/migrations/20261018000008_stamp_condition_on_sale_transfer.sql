-- FIX (18 Okt 2026): cap condition asli pada event 'laku' & 'transfer'.
--
-- Akar masalah: kolom stock_events.condition punya DEFAULT 'baru'.
-- record_sale & transfer_stock_unit INSERT event TANPA condition, sehingga
-- event 'laku'/'transfer_out'/'transfer_in' selalu tercatat 'baru'.
-- Cascade lalu membaca "event terbaru" -> unit second ke-flip jadi 'baru'
-- setiap kali dijual/ditransfer. Migrasi 000006 saja TIDAK cukup karena
-- event-nya sendiri yang salah cap, bukan cuma cara bacanya.
--
-- Perbaikan: kedua RPC sekarang mengambil condition asli unit dari
-- stock_entries dan mencapnya ke setiap event yang dibuat.
-- "Sekali second, selamanya second."
--
-- Self-contained & idempotent (CREATE OR REPLACE). Tidak tergantung 000006,
-- tapi 000006 tetap disarankan untuk propagasi label/metadata yang benar.

-- 1. record_sale: cap condition dari entri yang dijual
CREATE OR REPLACE FUNCTION public.record_sale(
  p_entry_id UUID,
  p_imei TEXT,
  p_location_id UUID,
  p_phone_model_id UUID,
  p_sale_date DATE,
  p_price NUMERIC,
  p_srp NUMERIC,
  p_cost_price NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_cost NUMERIC;
  v_profit NUMERIC;
  v_condition TEXT;
BEGIN
  IF p_price IS NULL OR p_price < 0 THEN
    RAISE EXCEPTION 'Harga jual tidak valid';
  END IF;

  -- Guard anti double-sell (termasuk koreksi), di dalam transaksi yang sama
  IF p_imei IS NOT NULL AND p_imei <> '' AND public.unit_balance(p_imei, p_location_id) <= 0 THEN
    RAISE EXCEPTION 'Unit % sudah tercatat terjual sebelumnya (tidak dicatat dua kali)', p_imei;
  END IF;

  -- Ambil condition asli unit ("sekali second, selamanya second")
  SELECT condition INTO v_condition FROM public.stock_entries WHERE id = p_entry_id;
  v_condition := COALESCE(v_condition, 'baru');

  v_cost := CASE WHEN COALESCE(p_cost_price, 0) > 0 THEN p_cost_price ELSE p_srp END;
  v_profit := p_price - v_cost;

  INSERT INTO public.stock_events (date, imei, location_id, phone_model_id, event_type, qty, notes, metadata, condition)
  VALUES (p_sale_date, NULLIF(p_imei, ''), p_location_id, p_phone_model_id, 'laku', 1,
          'Terjual - Harga: Rp ' || to_char(p_price, 'FM999G999G999'),
          jsonb_build_object('selling_price', p_price, 'srp', p_srp,
                             'cost_price', v_cost, 'profit_loss', v_profit),
          v_condition);

  UPDATE public.stock_entries
  SET selling_price = p_price,
      sale_date = p_sale_date,
      profit_loss = v_profit,
      cost_price = v_cost
  WHERE id = p_entry_id;

  RETURN jsonb_build_object('ok', true, 'profit_loss', v_profit);
END;
$$;

-- 2. transfer_stock_unit: cap condition dari unit di lokasi asal
CREATE OR REPLACE FUNCTION public.transfer_stock_unit(
  p_imei TEXT,
  p_source_location_id UUID,
  p_dest_location_id UUID,
  p_phone_model_id UUID,
  p_date DATE,
  p_notes TEXT DEFAULT NULL,
  p_label TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_src_name TEXT;
  v_dst_name TEXT;
  v_condition TEXT;
BEGIN
  IF p_source_location_id = p_dest_location_id THEN
    RAISE EXCEPTION 'Lokasi tujuan sama dengan lokasi asal';
  END IF;

  IF public.unit_balance(p_imei, p_source_location_id) <= 0 THEN
    RAISE EXCEPTION 'Unit % tidak tersedia di lokasi asal (mungkin sudah terjual/ditransfer)', p_imei;
  END IF;

  SELECT name INTO v_src_name FROM public.stock_locations WHERE id = p_source_location_id;
  SELECT name INTO v_dst_name FROM public.stock_locations WHERE id = p_dest_location_id;
  IF v_dst_name IS NULL THEN
    RAISE EXCEPTION 'Lokasi tujuan tidak ditemukan';
  END IF;

  -- Ambil condition asli unit di lokasi asal ("sekali second, selamanya second")
  SELECT condition INTO v_condition
  FROM public.stock_entries
  WHERE imei = p_imei
    AND location_id = p_source_location_id
    AND night_stock > 0
    AND sale_date IS NULL
  ORDER BY date DESC
  LIMIT 1;
  v_condition := COALESCE(v_condition, 'baru');

  -- Kedua insert dalam satu transaksi: gagal di salah satu = rollback semua.
  -- Trigger cascade_recalc tetap jalan seperti biasa per insert.
  INSERT INTO public.stock_events (date, imei, location_id, phone_model_id, event_type, qty, notes, label, metadata, condition)
  VALUES (p_date, p_imei, p_source_location_id, p_phone_model_id, 'transfer_out', 1,
          COALESCE(p_notes, 'Transfer ke ' || v_dst_name), p_label,
          COALESCE(p_metadata, '{}'::jsonb)
            || jsonb_build_object('destination_location_id', p_dest_location_id,
                                  'destination_location_name', v_dst_name),
          v_condition);

  INSERT INTO public.stock_events (date, imei, location_id, phone_model_id, event_type, qty, notes, label, metadata, condition)
  VALUES (p_date, p_imei, p_dest_location_id, p_phone_model_id, 'transfer_in', 1,
          'Transfer dari ' || COALESCE(v_src_name, '?'), p_label,
          COALESCE(p_metadata, '{}'::jsonb)
            || jsonb_build_object('source_location_id', p_source_location_id,
                                  'source_location_name', v_src_name),
          v_condition);

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_sale(UUID, TEXT, UUID, UUID, DATE, NUMERIC, NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_stock_unit(TEXT, UUID, UUID, UUID, DATE, TEXT, JSONB) TO authenticated;
