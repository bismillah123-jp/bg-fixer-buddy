-- Script to fix existing rollover data issues
-- Run this to fix the problem where morning_stock is not properly calculated

-- 1. First, let's see what's wrong
SELECT 
  'Current Issues' as status,
  date,
  location_id,
  phone_model_id,
  imei,
  morning_stock,
  night_stock,
  CASE 
    WHEN LAG(night_stock) OVER (PARTITION BY location_id, phone_model_id, imei ORDER BY date) IS NULL 
    THEN 'First entry'
    WHEN morning_stock != LAG(night_stock) OVER (PARTITION BY location_id, phone_model_id, imei ORDER BY date)
    THEN 'MISMATCH: morning_stock should be ' || LAG(night_stock) OVER (PARTITION BY location_id, phone_model_id, imei ORDER BY date)
    ELSE 'OK'
  END as issue
FROM stock_entries
WHERE date >= '2024-10-15'  -- Adjust date range as needed
ORDER BY location_id, phone_model_id, imei, date;

-- 2. Fix the rollover issues
SELECT fix_rollover_issues('2024-10-15', CURRENT_DATE);

-- 3. Recalculate from events to ensure everything is correct
SELECT cascade_recalc_stock_with_imei('2024-10-15', CURRENT_DATE);

-- 4. Verify the fix
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
    WHEN morning_stock != LAG(night_stock) OVER (PARTITION BY location_id, phone_model_id, imei ORDER BY date)
    THEN 'STILL MISMATCH: morning_stock should be ' || LAG(night_stock) OVER (PARTITION BY location_id, phone_model_id, imei ORDER BY date)
    ELSE 'FIXED'
  END as issue
FROM stock_entries
WHERE date >= '2024-10-15'  -- Adjust date range as needed
ORDER BY location_id, phone_model_id, imei, date;
