-- BUG BOUNTY FIX (2026-10-16)
-- #3 HIGH: transfer dua insert terpisah -> kalau insert kedua gagal, unit hilang.
-- #7 MEDIUM: sale (insert event + update entry) tidak atomic -> bisa ke-rekam setengah.
-- #8 MEDIUM: cek anti-double-sell di frontend mengabaikan event 'koreksi'.
--
-- Solusi: dua RPC SECURITY DEFINER — seluruh langkah jalan dalam SATU transaksi
-- Postgres (function = atomic). Guard ketersediaan unit (termasuk koreksi signed)
-- dicek di dalam RPC sehingga tidak ada race TOCTOU antar langkah.

-- Helper: balance unit per IMEI di satu lokasi (koreksi dihitung signed)
CREATE OR REPLACE FUNCTION public.unit_balance(p_imei TEXT, p_location_id UUID)
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(CASE
    WHEN event_type IN ('masuk', 'retur_in', 'transfer_in') THEN COALESCE(qty, 1)
    WHEN event_type IN ('laku', 'retur_out', 'transfer_out') THEN -COALESCE(qty, 1)
    WHEN event_type = 'koreksi' THEN COALESCE(qty, 0)
    ELSE 0 END), 0)::INT
  FROM public.stock_events
  WHERE imei = p_imei AND location_id = p_location_id;
$$;

-- #3: transfer atomic antar lokasi
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

  -- Kedua insert dalam satu transaksi: gagal di salah satu = rollback semua.
  -- Trigger cascade_recalc tetap jalan seperti biasa per insert.
  INSERT INTO public.stock_events (date, imei, location_id, phone_model_id, event_type, qty, notes, label, metadata)
  VALUES (p_date, p_imei, p_source_location_id, p_phone_model_id, 'transfer_out', 1,
          COALESCE(p_notes, 'Transfer ke ' || v_dst_name), p_label,
          COALESCE(p_metadata, '{}'::jsonb)
            || jsonb_build_object('destination_location_id', p_dest_location_id,
                                  'destination_location_name', v_dst_name));

  INSERT INTO public.stock_events (date, imei, location_id, phone_model_id, event_type, qty, notes, label, metadata)
  VALUES (p_date, p_imei, p_dest_location_id, p_phone_model_id, 'transfer_in', 1,
          'Transfer dari ' || COALESCE(v_src_name, '?'), p_label,
          COALESCE(p_metadata, '{}'::jsonb)
            || jsonb_build_object('source_location_id', p_source_location_id,
                                  'source_location_name', v_src_name));

  RETURN jsonb_build_object('ok', true, 'imei', p_imei, 'from', v_src_name, 'to', v_dst_name);
END;
$$;

-- #7: pencatatan penjualan atomic (event + update entry)
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
BEGIN
  IF p_price IS NULL OR p_price < 0 THEN
    RAISE EXCEPTION 'Harga jual tidak valid';
  END IF;

  -- Guard anti double-sell (termasuk koreksi), di dalam transaksi yang sama
  IF p_imei IS NOT NULL AND p_imei <> '' AND public.unit_balance(p_imei, p_location_id) <= 0 THEN
    RAISE EXCEPTION 'Unit % sudah tercatat terjual sebelumnya (tidak dicatat dua kali)', p_imei;
  END IF;

  v_cost := CASE WHEN COALESCE(p_cost_price, 0) > 0 THEN p_cost_price ELSE p_srp END;
  v_profit := p_price - v_cost;

  INSERT INTO public.stock_events (date, imei, location_id, phone_model_id, event_type, qty, notes, metadata)
  VALUES (p_sale_date, NULLIF(p_imei, ''), p_location_id, p_phone_model_id, 'laku', 1,
          'Terjual - Harga: Rp ' || to_char(p_price, 'FM999G999G999'),
          jsonb_build_object('selling_price', p_price, 'srp', p_srp,
                             'cost_price', v_cost, 'profit_loss', v_profit));

  UPDATE public.stock_entries
  SET selling_price = p_price,
      sale_date = p_sale_date,
      profit_loss = v_profit,
      cost_price = v_cost
  WHERE id = p_entry_id;

  RETURN jsonb_build_object('ok', true, 'profit_loss', v_profit);
END;
$$;

GRANT EXECUTE ON FUNCTION public.unit_balance(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_stock_unit(TEXT, UUID, UUID, UUID, DATE, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_sale(UUID, TEXT, UUID, UUID, DATE, NUMERIC, NUMERIC, NUMERIC) TO authenticated;
