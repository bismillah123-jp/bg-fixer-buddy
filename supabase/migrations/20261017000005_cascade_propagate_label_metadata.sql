-- FIX (17 Okt 2026): label & warna yang dipilih saat "HP Datang" tidak muncul di tabel.
--
-- Root cause: label & warna (metadata.color) tersimpan di stock_events,
-- tapi fungsi cascade_recalc_stock_with_imei yang membangun stock_entries
-- TIDAK menyalin label/metadata — jadi tabel (yang baca stock_entries)
-- selalu menampilkan label & warna kosong.
--
-- Migrasi ini: (1) pastikan kolom label & metadata ada di stock_entries,
-- (2) definisikan ulang cascade agar ikut mempropagasi label + metadata
-- dari event terbaru per IMEI (sama seperti condition), (3) backfill
-- entri yang sudah ada.

-- 1. Pastikan kolom ada (idempotent)
ALTER TABLE stock_entries ADD COLUMN IF NOT EXISTS label TEXT DEFAULT NULL;
ALTER TABLE stock_entries ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE stock_events ADD COLUMN IF NOT EXISTS label TEXT DEFAULT NULL;
ALTER TABLE stock_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 2. Cascade per-IMEI terbaru + propagasi condition, label, metadata
CREATE OR REPLACE FUNCTION cascade_recalc_stock_with_imei(
  p_from_date DATE,
  p_to_date DATE DEFAULT CURRENT_DATE,
  p_location_id UUID DEFAULT NULL,
  p_phone_model_id UUID DEFAULT NULL,
  p_imei TEXT DEFAULT NULL
)
RETURNS TABLE (
  recalculated_days INTEGER,
  affected_entries INTEGER
) AS $$
DECLARE
  v_current_date DATE;
  v_days_count INTEGER := 0;
  v_entries_count INTEGER := 0;
  v_location_id UUID;
  v_phone_model_id UUID;
  v_imei TEXT;
BEGIN
  IF p_from_date > p_to_date THEN
    RAISE EXCEPTION 'from_date cannot be greater than to_date';
  END IF;

  FOR v_location_id, v_phone_model_id, v_imei IN
    SELECT DISTINCT e.location_id, e.phone_model_id, e.imei
    FROM stock_events e
    WHERE e.date BETWEEN p_from_date AND p_to_date
      AND (p_location_id IS NULL OR e.location_id = p_location_id)
      AND (p_phone_model_id IS NULL OR e.phone_model_id = p_phone_model_id)
      AND (p_imei IS NULL OR e.imei = p_imei)
  LOOP
    v_current_date := p_from_date;

    WHILE v_current_date <= p_to_date LOOP
      DECLARE
        v_prev_night_stock INTEGER := 0;
        v_morning_stock INTEGER := 0;
        v_incoming INTEGER := 0;
        v_sold INTEGER := 0;
        v_returns INTEGER := 0;
        v_adjustment INTEGER := 0;
        v_night_stock INTEGER := 0;
        v_condition TEXT := 'baru';
        v_label TEXT := NULL;
        v_metadata JSONB := '{}'::jsonb;
      BEGIN
        IF v_current_date > p_from_date THEN
          SELECT COALESCE(night_stock, 0) INTO v_prev_night_stock
          FROM stock_entries
          WHERE date = v_current_date - INTERVAL '1 day'
            AND location_id = v_location_id
            AND phone_model_id = v_phone_model_id
            AND COALESCE(imei, '') = COALESCE(v_imei, '')
          LIMIT 1;
        ELSE
          SELECT COALESCE(morning_stock, 0) INTO v_prev_night_stock
          FROM stock_entries
          WHERE date = v_current_date
            AND location_id = v_location_id
            AND phone_model_id = v_phone_model_id
            AND COALESCE(imei, '') = COALESCE(v_imei, '')
          LIMIT 1;
        END IF;

        v_morning_stock := COALESCE(v_prev_night_stock, 0);

        SELECT
          COALESCE(SUM(CASE WHEN event_type = 'masuk' THEN qty ELSE 0 END), 0),
          COALESCE(SUM(CASE WHEN event_type = 'laku' THEN qty ELSE 0 END), 0),
          COALESCE(SUM(CASE WHEN event_type = 'retur_in' THEN qty ELSE 0 END), 0),
          COALESCE(SUM(CASE
            WHEN event_type IN ('retur_out', 'transfer_out') THEN -qty
            WHEN event_type = 'transfer_in' THEN qty
            WHEN event_type = 'koreksi' THEN qty
            ELSE 0
          END), 0)
        INTO v_incoming, v_sold, v_returns, v_adjustment
        FROM stock_events
        WHERE date = v_current_date
          AND location_id = v_location_id
          AND phone_model_id = v_phone_model_id
          AND COALESCE(imei, '') = COALESCE(v_imei, '');

        v_night_stock := v_morning_stock + v_incoming + v_returns - v_sold + v_adjustment;

        -- Ambil condition, label, metadata dari event terbaru per IMEI
        SELECT e.condition, e.label, COALESCE(e.metadata, '{}'::jsonb)
        INTO v_condition, v_label, v_metadata
        FROM stock_events e
        WHERE e.imei = v_imei
          AND (e.condition IS NOT NULL OR e.label IS NOT NULL OR e.metadata IS NOT NULL)
        ORDER BY e.date DESC, e.created_at DESC
        LIMIT 1;
        v_condition := COALESCE(v_condition, 'baru');
        v_metadata := COALESCE(v_metadata, '{}'::jsonb);

        INSERT INTO stock_entries (
          date, location_id, phone_model_id, imei,
          morning_stock, incoming, sold, returns, adjustment, night_stock,
          condition, label, metadata, created_at, updated_at
        ) VALUES (
          v_current_date, v_location_id, v_phone_model_id, v_imei,
          v_morning_stock, v_incoming, v_sold, v_returns, v_adjustment, v_night_stock,
          v_condition, v_label, v_metadata, NOW(), NOW()
        )
        ON CONFLICT (date, location_id, phone_model_id, imei)
        DO UPDATE SET
          morning_stock = EXCLUDED.morning_stock,
          incoming = EXCLUDED.incoming,
          sold = EXCLUDED.sold,
          returns = EXCLUDED.returns,
          adjustment = EXCLUDED.adjustment,
          night_stock = EXCLUDED.night_stock,
          condition = EXCLUDED.condition,
          label = EXCLUDED.label,
          metadata = EXCLUDED.metadata,
          updated_at = NOW();

        v_entries_count := v_entries_count + 1;
      END;

      v_current_date := v_current_date + INTERVAL '1 day';
      v_days_count := v_days_count + 1;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_days_count, v_entries_count;
END;
$$ LANGUAGE plpgsql;

-- 3. Backfill: salin label & metadata dari event terbaru ke entri yang sudah ada
UPDATE stock_entries se
SET
  label = ev.label,
  metadata = COALESCE(ev.metadata, '{}'::jsonb),
  updated_at = NOW()
FROM (
  SELECT DISTINCT ON (e.imei)
    e.imei, e.label, e.metadata
  FROM stock_events e
  WHERE e.imei IS NOT NULL
    AND (e.label IS NOT NULL OR e.metadata IS NOT NULL)
  ORDER BY e.imei, e.date DESC, e.created_at DESC
) ev
WHERE se.imei = ev.imei
  AND (se.label IS NULL AND ev.label IS NOT NULL
       OR se.metadata IS NULL OR se.metadata = '{}'::jsonb);

COMMENT ON FUNCTION cascade_recalc_stock_with_imei IS 'Recalculates stock_entries from stock_events; propagates condition, label, metadata(color) from latest event per IMEI';
