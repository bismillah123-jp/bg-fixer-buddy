-- FIX (bug hunt 16 Okt 2026): undo penjualan harus atomic.
-- Sebelumnya: 3 operasi terpisah (delete event laku -> reset stock_entries ->
-- cascade recalc). Kalau langkah 2 gagal setelah langkah 1 sukses, event hilang
-- tapi entry masih "terjual" — data inkonsisten permanen.
-- Sekarang: semua dalam SATU transaksi Postgres.

CREATE OR REPLACE FUNCTION undo_sale(
  p_event_id UUID,
  p_entry_id UUID,
  p_from_date DATE,
  p_to_date DATE,
  p_location_id UUID,
  p_phone_model_id UUID,
  p_imei TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Hapus event 'laku'. Kalau event tidak ada / sudah dihapus, gagalkan.
  DELETE FROM stock_events WHERE id = p_event_id AND event_type = 'laku';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event penjualan tidak ditemukan (mungkin sudah dibatalkan)';
  END IF;

  -- 2. Reset field penjualan pada entry
  UPDATE stock_entries
  SET sold = 0,
      selling_price = 0,
      sale_date = NULL,
      profit_loss = 0,
      updated_at = NOW()
  WHERE id = p_entry_id;

  -- 3. Cascade recalc dari tanggal entry sampai hari ini
  PERFORM cascade_recalc_stock_with_imei(
    p_from_date, p_to_date, p_location_id, p_phone_model_id, p_imei
  );
END;
$$;

COMMENT ON FUNCTION undo_sale IS 'Atomic undo penjualan: hapus event laku + reset entry + recalc dalam 1 transaksi (bug hunt 16 Okt 2026)';
