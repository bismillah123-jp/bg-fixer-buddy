-- Fix rollover system to properly handle IMEI-based stock entries
-- This ensures morning_stock of day N+1 = night_stock of day N for each IMEI

-- 1. Create improved cascade recalculation function that handles IMEI properly
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
  -- Validate inputs
  IF p_from_date > p_to_date THEN
    RAISE EXCEPTION 'from_date cannot be greater than to_date';
  END IF;

  -- Get distinct location, model, and IMEI combinations to recalculate
  FOR v_location_id, v_phone_model_id, v_imei IN
    SELECT DISTINCT e.location_id, e.phone_model_id, e.imei
    FROM stock_events e
    WHERE e.date BETWEEN p_from_date AND p_to_date
      AND (p_location_id IS NULL OR e.location_id = p_location_id)
      AND (p_phone_model_id IS NULL OR e.phone_model_id = p_phone_model_id)
      AND (p_imei IS NULL OR e.imei = p_imei)
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
        -- Get previous day's night stock for this specific IMEI
        IF v_current_date > p_from_date THEN
          SELECT COALESCE(night_stock, 0) INTO v_prev_night_stock
          FROM stock_entries
          WHERE date = v_current_date - INTERVAL '1 day'
            AND location_id = v_location_id
            AND phone_model_id = v_phone_model_id
            AND COALESCE(imei, '') = COALESCE(v_imei, '')
          LIMIT 1;
        ELSE
          -- For the first day, get from existing stock_entries if exists
          SELECT COALESCE(morning_stock, 0) INTO v_prev_night_stock
          FROM stock_entries
          WHERE date = v_current_date
            AND location_id = v_location_id
            AND phone_model_id = v_phone_model_id
            AND COALESCE(imei, '') = COALESCE(v_imei, '')
          LIMIT 1;
        END IF;
        
        -- Ensure morning_stock is never NULL
        v_morning_stock := COALESCE(v_prev_night_stock, 0);
        
        -- Aggregate events for this day and IMEI
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
        
        -- Calculate night stock
        v_night_stock := v_morning_stock + v_incoming + v_returns - v_sold + v_adjustment;
        
        -- Upsert into stock_entries with IMEI
        INSERT INTO stock_entries (
          date, location_id, phone_model_id, imei,
          morning_stock, incoming, sold, returns, adjustment, night_stock,
          created_at, updated_at
        ) VALUES (
          v_current_date, v_location_id, v_phone_model_id, v_imei,
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

-- 2. Create function to fix existing rollover issues
CREATE OR REPLACE FUNCTION fix_rollover_issues(
  p_from_date DATE DEFAULT '2024-01-01',
  p_to_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  fixed_entries INTEGER
) AS $$
DECLARE
  v_fixed_count INTEGER := 0;
  v_entry RECORD;
  v_prev_night_stock INTEGER;
BEGIN
  -- Loop through all stock entries and fix morning_stock
  FOR v_entry IN
    SELECT id, date, location_id, phone_model_id, imei, morning_stock, night_stock
    FROM stock_entries
    WHERE date BETWEEN p_from_date AND p_to_date
    ORDER BY date, location_id, phone_model_id, imei
  LOOP
    -- Get previous day's night stock
    SELECT COALESCE(night_stock, 0) INTO v_prev_night_stock
    FROM stock_entries
    WHERE date = v_entry.date - INTERVAL '1 day'
      AND location_id = v_entry.location_id
      AND phone_model_id = v_entry.phone_model_id
      AND COALESCE(imei, '') = COALESCE(v_entry.imei, '')
    LIMIT 1;
    
    -- Update morning_stock if it's different from previous night_stock
    IF v_entry.morning_stock != v_prev_night_stock THEN
      UPDATE stock_entries
      SET morning_stock = v_prev_night_stock,
          updated_at = NOW()
      WHERE id = v_entry.id;
      
      v_fixed_count := v_fixed_count + 1;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT v_fixed_count;
END;
$$ LANGUAGE plpgsql;

-- 3. Create function to recalculate specific date range
CREATE OR REPLACE FUNCTION recalculate_stock_range(
  p_from_date DATE,
  p_to_date DATE DEFAULT CURRENT_DATE
)
RETURNS VOID AS $$
BEGIN
  -- First fix any existing rollover issues
  PERFORM fix_rollover_issues(p_from_date, p_to_date);
  
  -- Then recalculate from events
  PERFORM cascade_recalc_stock_with_imei(p_from_date, p_to_date);
END;
$$ LANGUAGE plpgsql;

-- 4. Update the trigger function to use the new IMEI-aware function
CREATE OR REPLACE FUNCTION trigger_cascade_recalc()
RETURNS TRIGGER AS $$
BEGIN
  -- Use the new IMEI-aware function
  PERFORM cascade_recalc_stock_with_imei(
    COALESCE(NEW.date, OLD.date),
    CURRENT_DATE,
    COALESCE(NEW.location_id, OLD.location_id),
    COALESCE(NEW.phone_model_id, OLD.phone_model_id),
    COALESCE(NEW.imei, OLD.imei)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add comments
COMMENT ON FUNCTION cascade_recalc_stock_with_imei IS 'Recalculates stock_entries from stock_events with proper IMEI handling for rollover';
COMMENT ON FUNCTION fix_rollover_issues IS 'Fixes existing rollover issues by correcting morning_stock values';
COMMENT ON FUNCTION recalculate_stock_range IS 'Recalculates a date range and fixes rollover issues';
