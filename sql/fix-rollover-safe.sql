-- Safe script to fix rollover issues step by step
-- This will fix the morning_stock calculation without breaking existing data

-- Step 1: First, let's see what data we have
SELECT 
  'Current Data' as status,
  date,
  location_id,
  phone_model_id,
  imei,
  morning_stock,
  night_stock
FROM stock_entries
WHERE date >= '2024-10-15'
ORDER BY location_id, phone_model_id, imei, date
LIMIT 20;

-- Step 2: Create a safer function that handles NULL values properly
CREATE OR REPLACE FUNCTION fix_rollover_safe(
  p_from_date DATE DEFAULT '2024-10-15',
  p_to_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  fixed_entries INTEGER,
  errors INTEGER
) AS $$
DECLARE
  v_fixed_count INTEGER := 0;
  v_error_count INTEGER := 0;
  v_entry RECORD;
  v_prev_night_stock INTEGER;
  v_correct_morning_stock INTEGER;
BEGIN
  -- Loop through all stock entries and fix morning_stock
  FOR v_entry IN
    SELECT id, date, location_id, phone_model_id, imei, morning_stock, night_stock
    FROM stock_entries
    WHERE date BETWEEN p_from_date AND p_to_date
    ORDER BY date, location_id, phone_model_id, imei
  LOOP
    BEGIN
      -- Get previous day's night stock
      SELECT COALESCE(night_stock, 0) INTO v_prev_night_stock
      FROM stock_entries
      WHERE date = v_entry.date - INTERVAL '1 day'
        AND location_id = v_entry.location_id
        AND phone_model_id = v_entry.phone_model_id
        AND COALESCE(imei, '') = COALESCE(v_entry.imei, '')
      LIMIT 1;
      
      -- Calculate correct morning_stock
      v_correct_morning_stock := COALESCE(v_prev_night_stock, 0);
      
      -- Update morning_stock if it's different from previous night_stock
      IF v_entry.morning_stock IS NULL OR v_entry.morning_stock != v_correct_morning_stock THEN
        UPDATE stock_entries
        SET morning_stock = v_correct_morning_stock,
            updated_at = NOW()
        WHERE id = v_entry.id;
        
        v_fixed_count := v_fixed_count + 1;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      RAISE WARNING 'Error fixing entry %: %', v_entry.id, SQLERRM;
    END;
  END LOOP;
  
  RETURN QUERY SELECT v_fixed_count, v_error_count;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Run the safe fix
SELECT fix_rollover_safe('2024-10-15', CURRENT_DATE);

-- Step 4: Verify the fix
SELECT 
  'After Fix' as status,
  date,
  location_id,
  phone_model_id,
  imei,
  morning_stock,
  night_stock,
  CASE 
    WHEN LAG(night_stock) OVER (PARTITION BY location_id, phone_model_id, imei ORDER BY date) IS NULL 
    THEN 'First entry'
    WHEN morning_stock = LAG(night_stock) OVER (PARTITION BY location_id, phone_model_id, imei ORDER BY date)
    THEN 'FIXED ✅'
    ELSE 'STILL WRONG ❌'
  END as status_check
FROM stock_entries
WHERE date >= '2024-10-15'
ORDER BY location_id, phone_model_id, imei, date
LIMIT 20;
