-- Fix duplicate IMEI entries in stock_events table
-- This script removes duplicate entries and keeps only the latest one

-- First, let's see what duplicates exist
SELECT 
    imei, 
    date, 
    event_type, 
    COUNT(*) as duplicate_count,
    array_agg(id ORDER BY created_at DESC) as ids
FROM stock_events 
GROUP BY imei, date, event_type 
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- Delete duplicate entries, keeping only the latest one (highest id)
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

-- Verify no more duplicates exist
SELECT 
    imei, 
    date, 
    event_type, 
    COUNT(*) as count
FROM stock_events 
GROUP BY imei, date, event_type 
HAVING COUNT(*) > 1;

-- Show remaining stock_events count
SELECT COUNT(*) as total_stock_events FROM stock_events;
