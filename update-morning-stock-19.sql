-- Script untuk mengupdate morning_stock tanggal 19 berdasarkan data tanggal 18
-- Data tanggal 18: 57 stok malam, semua IMEI dengan night_stock = 1

-- Step 1: Lihat data tanggal 18 dan 19 sebelum update
SELECT 
  'BEFORE UPDATE' as status,
  date,
  imei,
  morning_stock,
  night_stock
FROM stock_entries
WHERE date IN ('2025-10-18', '2025-10-19')
ORDER BY date, imei;

-- Step 2: Update morning_stock tanggal 19 = night_stock tanggal 18 untuk setiap IMEI
UPDATE stock_entries
SET 
  morning_stock = COALESCE(
    (SELECT night_stock 
     FROM stock_entries se2 
     WHERE se2.date = '2025-10-18'
       AND se2.location_id = stock_entries.location_id
       AND se2.phone_model_id = stock_entries.phone_model_id
       AND COALESCE(se2.imei, '') = COALESCE(stock_entries.imei, '')
     LIMIT 1),
    0
  ),
  updated_at = NOW()
WHERE date = '2025-10-19'
  AND (morning_stock IS NULL OR morning_stock != COALESCE(
    (SELECT night_stock 
     FROM stock_entries se2 
     WHERE se2.date = '2025-10-18'
       AND se2.location_id = stock_entries.location_id
       AND se2.phone_model_id = stock_entries.phone_model_id
       AND COALESCE(se2.imei, '') = COALESCE(stock_entries.imei, '')
     LIMIT 1),
    0
  ));

-- Step 3: Verifikasi update berhasil
SELECT 
  'AFTER UPDATE' as status,
  date,
  imei,
  morning_stock,
  night_stock,
  CASE 
    WHEN date = '2025-10-19' AND morning_stock = COALESCE(
      (SELECT night_stock 
       FROM stock_entries se2 
       WHERE se2.date = '2025-10-18'
         AND se2.location_id = stock_entries.location_id
         AND se2.phone_model_id = stock_entries.phone_model_id
         AND COALESCE(se2.imei, '') = COALESCE(stock_entries.imei, '')
       LIMIT 1),
      0
    )
    THEN 'FIXED ✅'
    WHEN date = '2025-10-18'
    THEN 'Source Data'
    ELSE 'STILL WRONG ❌'
  END as status_check
FROM stock_entries
WHERE date IN ('2025-10-18', '2025-10-19')
ORDER BY date, imei;

-- Step 4: Hitung total stok untuk memastikan
SELECT 
  date,
  COUNT(*) as total_entries,
  SUM(morning_stock) as total_morning_stock,
  SUM(night_stock) as total_night_stock
FROM stock_entries
WHERE date IN ('2025-10-18', '2025-10-19')
GROUP BY date
ORDER BY date;
