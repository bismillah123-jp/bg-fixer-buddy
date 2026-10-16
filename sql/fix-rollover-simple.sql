-- Simple and safe fix for rollover issues
-- This will fix the morning_stock calculation step by step

-- Step 1: Check current data
SELECT 
  'BEFORE FIX' as status,
  date,
  imei,
  morning_stock,
  night_stock,
  LAG(night_stock) OVER (PARTITION BY imei ORDER BY date) as prev_night_stock
FROM stock_entries
WHERE date >= '2024-10-15'
ORDER BY imei, date;

-- Step 2: Fix morning_stock for each entry
-- This will set morning_stock = previous day's night_stock for each IMEI
WITH fixed_entries AS (
  SELECT 
    se.id,
    se.date,
    se.location_id,
    se.phone_model_id,
    se.imei,
    COALESCE(
      LAG(se.night_stock) OVER (PARTITION BY se.location_id, se.phone_model_id, se.imei ORDER BY se.date),
      0
    ) as correct_morning_stock
  FROM stock_entries se
  WHERE se.date >= '2024-10-15'
)
UPDATE stock_entries
SET 
  morning_stock = fe.correct_morning_stock,
  updated_at = NOW()
FROM fixed_entries fe
WHERE stock_entries.id = fe.id
  AND (stock_entries.morning_stock IS NULL OR stock_entries.morning_stock != fe.correct_morning_stock);

-- Step 3: Verify the fix
SELECT 
  'AFTER FIX' as status,
  date,
  imei,
  morning_stock,
  night_stock,
  LAG(night_stock) OVER (PARTITION BY imei ORDER BY date) as prev_night_stock,
  CASE 
    WHEN LAG(night_stock) OVER (PARTITION BY imei ORDER BY date) IS NULL 
    THEN 'First entry'
    WHEN morning_stock = LAG(night_stock) OVER (PARTITION BY imei ORDER BY date)
    THEN 'FIXED ✅'
    ELSE 'STILL WRONG ❌'
  END as status_check
FROM stock_entries
WHERE date >= '2024-10-15'
ORDER BY imei, date;
