# Fix IMEI Duplicate Constraint Error

## Problem
You're getting this error:
```
Gagal menyimpan event: duplicate key value violates unique constraint "idx_stock_events_imei_date_type"
```

## Root Cause
The `stock_events` table has a unique constraint `idx_stock_events_imei_date_type` that prevents duplicate entries with the same IMEI, date, and event_type combination. However, the validation logic in the frontend was checking `stock_entries` instead of `stock_events`, causing the constraint violation.

## Solution

### Step 1: Clean up existing duplicates
Run this SQL in your Supabase SQL Editor:

```sql
-- Remove duplicate entries from stock_events, keeping only the latest one
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
```

### Step 2: Verify the fix
Check that no duplicates remain:

```sql
-- This should return no rows
SELECT 
    imei, 
    date, 
    event_type, 
    COUNT(*) as count
FROM stock_events 
GROUP BY imei, date, event_type 
HAVING COUNT(*) > 1;
```

### Step 3: Code changes (already applied)
The following files have been updated to fix the validation logic:

1. **src/components/AddStockDialog.tsx** - Now checks `stock_events` instead of `stock_entries`
2. **src/components/IncomingStockDialog.tsx** - Now checks `stock_events` instead of `stock_entries`

### Step 4: Test the application
1. Try adding a new stock entry with an IMEI
2. Try adding the same IMEI again - it should now show a proper error message
3. The error should be caught at the validation level, not at the database constraint level

## What was fixed

1. **Validation Logic**: Changed from checking `stock_entries` to checking `stock_events` (the actual source of truth)
2. **Better Error Messages**: Now shows which event type and date the IMEI was already registered
3. **Proper Event Filtering**: Only checks incoming events (`masuk`, `retur_in`) for IMEI validation
4. **Database Cleanup**: Removed any existing duplicate entries

## Prevention
The unique constraint `idx_stock_events_imei_date_type` is actually a good thing - it prevents data corruption. The issue was that the frontend validation wasn't checking the right table. Now it does, so you shouldn't see this error again.