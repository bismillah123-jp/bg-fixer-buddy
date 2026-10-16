-- Fix morning_stock null constraint issue
-- The problem was that the cascade function was using wrong unique constraint

-- 1. Update the cascade function to use correct unique constraint with IMEI
CREATE OR REPLACE FUNCTION cascade_recalc_stock(
  p_from_date DATE,
  p_to_date DATE DEFAULT CURRENT_DATE,
  p_location_id UUID DEFAULT NULL,
  p_phone_model_id UUID DEFAULT NULL
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
BEGIN
  -- Validate inputs
  IF p_from_date > p_to_date THEN
    RAISE EXCEPTION 'from_date cannot be greater than to_date';
  END IF;

  -- Get distinct location and model combinations to recalculate
  FOR v_location_id, v_phone_model_id IN
    SELECT DISTINCT e.location_id, e.phone_model_id
    FROM stock_events e
    WHERE e.date BETWEEN p_from_date AND p_to_date
      AND (p_location_id IS NULL OR e.location_id = p_location_id)
      AND (p_phone_model_id IS NULL OR e.phone_model_id = p_phone_model_id)
  LOOP
    v_current_date := p_from_date;
    
    -- Loop through each day
    WHILE v_current_date <= p_to_date LOOP
      DECLARE
        v_prev_night_stock INTEGER := 0;
        v_morning_stock INTEGER := 0;
        v_incoming INTEGER := 0;
        v_sold INTEGER := 0;
        v_returns INTEGER := 0;
        v_adjustment INTEGER := 0;
        v_night_stock INTEGER := 0;
      BEGIN
        -- Get previous day's night stock
        IF v_current_date > p_from_date THEN
          SELECT COALESCE(night_stock, 0) INTO v_prev_night_stock
          FROM stock_entries
          WHERE date = v_current_date - INTERVAL '1 day'
            AND location_id = v_location_id
            AND phone_model_id = v_phone_model_id
            AND imei IS NULL  -- Use aggregated entries (NULL imei)
          LIMIT 1;
        ELSE
          -- For the first day, get from existing stock_entries if exists
          SELECT COALESCE(morning_stock, 0) INTO v_prev_night_stock
          FROM stock_entries
          WHERE date = v_current_date
            AND location_id = v_location_id
            AND phone_model_id = v_phone_model_id
            AND imei IS NULL  -- Use aggregated entries (NULL imei)
          LIMIT 1;
        END IF;
        
        v_morning_stock := v_prev_night_stock;
        
        -- Aggregate events for this day
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
          AND phone_model_id = v_phone_model_id;
        
        -- Calculate night stock
        v_night_stock := v_morning_stock + v_incoming + v_returns - v_sold + v_adjustment;
        
        -- Upsert into stock_entries with NULL imei for aggregated entries
        INSERT INTO stock_entries (
          date, location_id, phone_model_id, imei,
          morning_stock, incoming, sold, returns, adjustment, night_stock,
          created_at, updated_at
        ) VALUES (
          v_current_date, v_location_id, v_phone_model_id, NULL,
          v_morning_stock, v_incoming, v_sold, v_returns, v_adjustment, v_night_stock,
          NOW(), NOW()
        )
        ON CONFLICT (date, location_id, phone_model_id, imei) 
        DO UPDATE SET
          morning_stock = EXCLUDED.morning_stock,
          incoming = EXCLUDED.incoming,
          sold = EXCLUDED.sold,
          returns = EXCLUDED.returns,
          adjustment = EXCLUDED.adjustment,
          night_stock = EXCLUDED.night_stock,
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

-- 2. Also update the simpler version
CREATE OR REPLACE FUNCTION cascade_recalc_stock_simple(
  p_date DATE,
  p_location_id UUID,
  p_phone_model_id UUID
)
RETURNS VOID AS $$
BEGIN
  PERFORM cascade_recalc_stock(
    p_from_date := p_date,
    p_to_date := CURRENT_DATE,
    p_location_id := p_location_id,
    p_phone_model_id := p_phone_model_id
  );
END;
$$ LANGUAGE plpgsql;

-- 3. Fix any existing entries that might have NULL morning_stock
UPDATE stock_entries 
SET morning_stock = COALESCE(morning_stock, 0)
WHERE morning_stock IS NULL;

-- Add comments
COMMENT ON FUNCTION cascade_recalc_stock IS 'Recalculates stock_entries from stock_events for a date range. Handles cascade updates for retroactive corrections.';
COMMENT ON FUNCTION cascade_recalc_stock_simple IS 'Simplified cascade recalc for a single date/location/model combination.';
