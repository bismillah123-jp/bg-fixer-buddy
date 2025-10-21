-- Comprehensive fix for IMEI duplicate constraint issues
-- This script addresses the root cause of the "duplicate key value violates unique constraint" error

-- Step 1: Check current state of stock_events table
SELECT 'Current stock_events count:' as info, COUNT(*) as count FROM stock_events;

-- Step 2: Find and display duplicate entries
SELECT 
    'Duplicate entries found:' as info,
    imei, 
    date, 
    event_type, 
    COUNT(*) as duplicate_count,
    array_agg(id ORDER BY created_at DESC) as ids
FROM stock_events 
GROUP BY imei, date, event_type 
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- Step 3: Remove duplicate entries, keeping only the latest one
WITH duplicates AS (
    SELECT 
        id,
        ROW_NUMBER() OVER (
            PARTITION BY imei, date, event_type 
            ORDER BY created_at DESC, id DESC
        ) as rn
    FROM stock_events
)
DELETE FROM stock_events 
WHERE id IN (
    SELECT id 
    FROM duplicates 
    WHERE rn > 1
);

-- Step 4: Verify no more duplicates exist
SELECT 
    'Remaining duplicates:' as info,
    imei, 
    date, 
    event_type, 
    COUNT(*) as count
FROM stock_events 
GROUP BY imei, date, event_type 
HAVING COUNT(*) > 1;

-- Step 5: Show final count
SELECT 'Final stock_events count:' as info, COUNT(*) as count FROM stock_events;

-- Step 6: Check if the unique constraint exists and is working
SELECT 
    'Unique constraint status:' as info,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'stock_events' 
AND indexname = 'idx_stock_events_imei_date_type';

-- Step 7: Test constraint by trying to insert a duplicate (this should fail)
-- Uncomment the lines below to test the constraint
/*
INSERT INTO stock_events (date, imei, location_id, phone_model_id, event_type, qty)
SELECT date, imei, location_id, phone_model_id, event_type, qty
FROM stock_events 
LIMIT 1;
*/
