-- FIX (17 Okt 2026): "gagal menghapus entri — there is no unique or exclusion
-- constraint matching the ON CONFLICT specification"
--
-- Root cause: cascade trigger (trigger_cascade_recalc) jalan setiap ada
-- DELETE/INSERT di stock_events, lalu memanggil cascade_recalc_stock_with_imei
-- yang memakai ON CONFLICT (date, location_id, phone_model_id, imei).
-- Kalau unique index tersebut TIDAK ADA di database (gagal dibuat karena ada
-- baris duplikat, atau migrasinya belum pernah di-apply), SETIAP trigger
-- gagal → hapus/tambah stok error.
--
-- Migrasi ini: (1) pastikan kolom condition ada, (2) bersihkan duplikat,
-- (3) buat unique index, (4) pastikan cascade + trigger versi terbaru.

-- 1. Kolom condition (idempotent — aman walau 20261017000003 sudah/sedang di-apply)
ALTER TABLE stock_events ADD COLUMN IF NOT EXISTS condition TEXT DEFAULT 'baru';
ALTER TABLE stock_entries ADD COLUMN IF NOT EXISTS condition TEXT DEFAULT 'baru';
UPDATE stock_events SET condition = 'baru' WHERE condition IS NULL;
UPDATE stock_entries SET condition = 'baru' WHERE condition IS NULL;
DO $$ BEGIN
  ALTER TABLE stock_events ADD CONSTRAINT chk_stock_events_condition CHECK (condition IN ('baru', 'second'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE stock_entries ADD CONSTRAINT chk_stock_entries_condition CHECK (condition IN ('baru', 'second'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Bersihkan baris duplikat di stock_entries (simpan 1 per kombinasi unik:
--    yang paling baru di-update; kalau sama, id terbesar)
DELETE FROM stock_entries a
USING stock_entries b
WHERE a.id <> b.id
  AND a.date = b.date
  AND a.location_id = b.location_id
  AND a.phone_model_id = b.phone_model_id
  AND COALESCE(a.imei, '') = COALESCE(b.imei, '')
  AND (a.updated_at, a.id) < (b.updated_at, b.id);

-- 3. Buat unique index yang dibutuhkan ON CONFLICT (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_entries_date_loc_model_imei
ON stock_entries(date, location_id, phone_model_id, imei);

-- 4. Cascade per-IMEI terbaru (dengan propagasi condition) + trigger deterministik
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

        SELECT e.condition INTO v_condition
        FROM stock_events e
        WHERE e.imei = v_imei AND e.condition IS NOT NULL
        ORDER BY e.date DESC, e.created_at DESC
        LIMIT 1;
        v_condition := COALESCE(v_condition, 'baru');

        INSERT INTO stock_entries (
          date, location_id, phone_model_id, imei,
          morning_stock, incoming, sold, returns, adjustment, night_stock,
          condition, created_at, updated_at
        ) VALUES (
          v_current_date, v_location_id, v_phone_model_id, v_imei,
          v_morning_stock, v_incoming, v_sold, v_returns, v_adjustment, v_night_stock,
          v_condition, NOW(), NOW()
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

CREATE OR REPLACE FUNCTION trigger_cascade_recalc()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM cascade_recalc_stock_with_imei(
    COALESCE(NEW.date, OLD.date),
    CURRENT_DATE,
    COALESCE(NEW.location_id, OLD.location_id),
    COALESCE(NEW.phone_model_id, OLD.phone_model_id),
    COALESCE(NEW.imei, OLD.imei)
  );
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cascade_after_stock_event ON stock_events;
CREATE TRIGGER trg_cascade_after_stock_event
AFTER INSERT OR UPDATE OR DELETE ON stock_events
FOR EACH ROW
EXECUTE FUNCTION trigger_cascade_recalc();

COMMENT ON FUNCTION cascade_recalc_stock_with_imei IS 'Recalculates stock_entries from stock_events with proper IMEI handling; propagates condition (baru/second) from latest event';
