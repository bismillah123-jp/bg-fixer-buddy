# Event-Sourcing Implementation Guide

## 📚 Overview

Implementasi event-sourcing architecture untuk StockWise HP dengan cascade recalculation otomatis. Sistem ini memastikan alur data yang konsisten sesuai dengan brief requirements.

---

## 🎯 Architecture Changes

### Before (Snapshot-Based)
```
User Input → stock_entries (mutable daily snapshot)
                   ↓
              Trigger (single day calculation)
                   ↓
              night_stock computed
```

### After (Event-Sourcing)
```
User Input → stock_events (immutable event stream)
                   ↓
         Trigger cascade_recalc (automatic)
                   ↓
         stock_entries (materialized view, from date to today)
                   ↓
         Dashboard reads from stock_entries
```

---

## 📦 New Database Components

### 1. stock_events Table

**Purpose:** Immutable event stream - primary source of truth

```sql
CREATE TABLE stock_events (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  date DATE NOT NULL,
  imei TEXT NOT NULL,
  location_id UUID NOT NULL,
  phone_model_id UUID NOT NULL,
  event_type TEXT NOT NULL, -- 'masuk','laku','retur_in','retur_out','transfer_in','transfer_out','koreksi'
  qty INTEGER DEFAULT 1,
  notes TEXT,
  created_by UUID,
  metadata JSONB
);
```

**Event Types:**
- `masuk`: HP datang (incoming)
- `laku`: Terjual (sold)
- `retur_in`: Retur ke toko (return to store)
- `retur_out`: Retur ke supplier (return to supplier)
- `transfer_in`: Transfer masuk dari lokasi lain
- `transfer_out`: Transfer keluar ke lokasi lain
- `koreksi`: Koreksi stok manual

### 2. cascade_recalc_stock Function

**Purpose:** Recalculate stock_entries from events

```sql
SELECT * FROM cascade_recalc_stock(
  p_from_date := '2024-10-01',  -- Start date
  p_to_date := CURRENT_DATE,     -- End date (default today)
  p_location_id := NULL,          -- Optional: filter by location
  p_phone_model_id := NULL        -- Optional: filter by model
);
```

**How it Works:**
1. Loops dari `p_from_date` sampai `p_to_date`
2. Untuk setiap hari:
   - Ambil `night_stock` hari sebelumnya sebagai `morning_stock`
   - Aggregate events dari `stock_events`
   - Calculate `night_stock = morning + masuk + retur_in - laku - retur_out + adjustment`
   - Upsert ke `stock_entries`

### 3. Auto-Cascade Trigger

**Purpose:** Automatically trigger cascade when events change

```sql
-- Runs automatically after INSERT/UPDATE/DELETE on stock_events
CREATE TRIGGER trg_cascade_after_stock_event
AFTER INSERT OR UPDATE OR DELETE ON stock_events
FOR EACH ROW
EXECUTE FUNCTION trigger_cascade_recalc();
```

---

## 🆕 New React Components

### 1. UnifiedTransactionDialog

**Location:** `src/components/UnifiedTransactionDialog.tsx`

**Purpose:** Single dialog untuk semua jenis transaksi

**Features:**
- Dropdown untuk pilih event type (masuk, laku, retur_in, retur_out, dll)
- IMEI validation & duplicate checking
- Cost price input (untuk masuk & retur_in)
- Auto-trigger cascade via database trigger
- Dual-write compatible (writes to stock_events only)

**Usage:**
```tsx
<UnifiedTransactionDialog 
  open={isOpen} 
  onOpenChange={setIsOpen} 
/>
```

### 2. EventHistoryView

**Location:** `src/components/EventHistoryView.tsx`

**Purpose:** Audit trail lengkap semua transaksi

**Features:**
- Search by IMEI
- Filter by event type
- Color-coded badges per event type
- Real-time updates
- Full audit information (timestamp, user, notes)

**Usage:**
```tsx
<EventHistoryView 
  imeiFilter="123456789"  // Optional
  limit={100}              // Optional
/>
```

---

## 🔄 Data Flow

### Example: Adding New Stock (Masuk)

```typescript
// 1. User input via UnifiedTransactionDialog
await supabase.from('stock_events').insert({
  date: '2024-10-16',
  imei: '123456789012345',
  location_id: 'loc-soko-uuid',
  phone_model_id: 'model-vivo-y29-uuid',
  event_type: 'masuk',
  qty: 1,
  notes: 'HP baru datang',
  metadata: { cost_price: 2000000 }
});

// 2. Trigger automatically runs (no manual call needed)
// Database executes: trigger_cascade_recalc()

// 3. Cascade function runs
// Recalculates from 2024-10-16 to today for:
//   - location_id = loc-soko-uuid
//   - phone_model_id = model-vivo-y29-uuid

// 4. stock_entries updated
// - 16 Oct: morning=0, masuk=1, laku=0, akhir=1
// - 17 Oct: morning=1, masuk=0, laku=0, akhir=1
// - ... (all subsequent days updated)

// 5. Dashboard auto-refreshes
// React Query invalidates and refetches data
```

### Example: Retroactive Correction

```typescript
// Scenario: HP seharusnya masuk tanggal 15, bukan 16

// 1. Delete wrong event
await supabase.from('stock_events')
  .delete()
  .eq('id', wrongEventId);
// → Cascade from 16 Oct to today

// 2. Insert correct event
await supabase.from('stock_events').insert({
  date: '2024-10-15',  // Correct date
  imei: '123456789012345',
  location_id: 'loc-soko-uuid',
  phone_model_id: 'model-vivo-y29-uuid',
  event_type: 'masuk',
  qty: 1
});
// → Cascade from 15 Oct to today

// Result: All days from 15 Oct to today recalculated correctly ✅
```

---

## 🧪 Testing Guide

### Prerequisites

1. **Run Migrations:**
```bash
# Apply all migrations
supabase db push

# Or if using Supabase CLI
supabase migration up
```

2. **Verify Tables:**
```sql
-- Check stock_events table exists
SELECT * FROM stock_events LIMIT 1;

-- Check function exists
SELECT cascade_recalc_stock('2024-10-16'::date, CURRENT_DATE);

-- Check trigger exists
SELECT tgname FROM pg_trigger WHERE tgname = 'trg_cascade_after_stock_event';
```

### Test Case 1: Basic Event Creation

```sql
-- 1. Insert masuk event for 16 Oct
INSERT INTO stock_events (date, imei, location_id, phone_model_id, event_type, qty)
VALUES (
  '2024-10-16',
  '111111111111111',
  (SELECT id FROM stock_locations WHERE name = 'SOKO'),
  (SELECT id FROM phone_models WHERE brand = 'VIVO' AND model LIKE '%Y29%' LIMIT 1),
  'masuk',
  1
);

-- 2. Check stock_entries
SELECT date, morning_stock, incoming, sold, night_stock
FROM stock_entries
WHERE imei = '111111111111111'
ORDER BY date;

-- Expected:
-- 2024-10-16: morning=0, incoming=1, sold=0, night=1
```

### Test Case 2: Sale Transaction

```sql
-- 1. Insert laku event for 17 Oct
INSERT INTO stock_events (date, imei, location_id, phone_model_id, event_type, qty)
VALUES (
  '2024-10-17',
  '111111111111111',
  (SELECT id FROM stock_locations WHERE name = 'SOKO'),
  (SELECT id FROM phone_models WHERE brand = 'VIVO' AND model LIKE '%Y29%' LIMIT 1),
  'laku',
  1
);

-- 2. Check cascade result
SELECT date, morning_stock, incoming, sold, night_stock
FROM stock_entries
WHERE phone_model_id = (SELECT id FROM phone_models WHERE brand = 'VIVO' AND model LIKE '%Y29%' LIMIT 1)
  AND location_id = (SELECT id FROM stock_locations WHERE name = 'SOKO')
ORDER BY date;

-- Expected:
-- 2024-10-16: morning=0, incoming=1, sold=0, night=1
-- 2024-10-17: morning=1, incoming=0, sold=1, night=0 ✅
```

### Test Case 3: Retroactive Correction

```sql
-- 1. Current state (from Test Case 2):
-- 16 Oct: masuk=1, night=1
-- 17 Oct: morning=1, laku=1, night=0

-- 2. Insert another masuk on 16 Oct (forgot to input earlier)
INSERT INTO stock_events (date, imei, location_id, phone_model_id, event_type, qty)
VALUES (
  '2024-10-16',
  '222222222222222',  -- Different IMEI
  (SELECT id FROM stock_locations WHERE name = 'SOKO'),
  (SELECT id FROM phone_models WHERE brand = 'VIVO' AND model LIKE '%Y29%' LIMIT 1),
  'masuk',
  1
);

-- 3. Check cascade result
SELECT date, 
       SUM(morning_stock) as total_morning,
       SUM(incoming) as total_masuk,
       SUM(sold) as total_laku,
       SUM(night_stock) as total_night
FROM stock_entries
WHERE phone_model_id = (SELECT id FROM phone_models WHERE brand = 'VIVO' AND model LIKE '%Y29%' LIMIT 1)
  AND location_id = (SELECT id FROM stock_locations WHERE name = 'SOKO')
GROUP BY date
ORDER BY date;

-- Expected:
-- 2024-10-16: morning=0, masuk=2, laku=0, night=2 ✅
-- 2024-10-17: morning=2, masuk=0, laku=1, night=1 ✅ (auto-updated!)
```

### Test Case 4: UI Testing

1. **Test UnifiedTransactionDialog:**
   - Click FAB menu → "🆕 Transaksi Stok"
   - Select event type: "HP Datang (Masuk)"
   - Fill IMEI, location, brand, model
   - Submit
   - ✅ Check: Event appears in EventHistoryView
   - ✅ Check: stock_entries updated correctly

2. **Test EventHistoryView:**
   - Navigate to "Riwayat Event" tab
   - Search by IMEI
   - Filter by event type
   - ✅ Check: All events visible with correct timestamps
   - ✅ Check: Color-coded badges correct

3. **Test Cascade:**
   - Add event with past date (e.g., 3 days ago)
   - ✅ Check: All subsequent days in stock_entries updated
   - ✅ Check: Dashboard shows correct totals

---

## 🐛 Troubleshooting

### Issue: Cascade not triggering

**Check:**
```sql
-- Verify trigger exists and is enabled
SELECT tgenabled FROM pg_trigger 
WHERE tgname = 'trg_cascade_after_stock_event';
-- Should return 'O' (enabled)

-- Check function exists
SELECT proname FROM pg_proc 
WHERE proname = 'trigger_cascade_recalc';
```

**Fix:**
```sql
-- Re-create trigger
DROP TRIGGER IF EXISTS trg_cascade_after_stock_event ON stock_events;
CREATE TRIGGER trg_cascade_after_stock_event
AFTER INSERT OR UPDATE OR DELETE ON stock_events
FOR EACH ROW
EXECUTE FUNCTION trigger_cascade_recalc();
```

### Issue: Slow cascade performance

**Check:**
```sql
-- Check indexes
SELECT indexname FROM pg_indexes 
WHERE tablename = 'stock_events';

-- Should have:
-- - idx_stock_events_date_location
-- - idx_stock_events_imei
-- - idx_stock_events_type
```

**Optimize:**
```sql
-- For large datasets, consider partitioning
CREATE INDEX CONCURRENTLY idx_stock_events_date_type_loc 
ON stock_events (date, event_type, location_id);
```

### Issue: Duplicate IMEI errors

**Check:**
```sql
-- Find duplicate IMEIs
SELECT imei, COUNT(*) 
FROM stock_events 
WHERE event_type IN ('masuk', 'retur_in')
GROUP BY imei 
HAVING COUNT(*) > 1;
```

**Fix:** Add validation in UnifiedTransactionDialog (already implemented)

---

## 📊 Performance Considerations

### Cascade Optimization

**Current:** Cascade runs per location/model combination
- ✅ Efficient: Only affected partitions recalculated
- ✅ Parallel: Multiple location/model combos don't block each other

**Future Improvements:**
1. **Async Queue:** For large date ranges, use job queue (pg_cron or external)
2. **Materialized Views:** Cache common queries
3. **Partitioning:** Partition stock_events by date for faster queries

### Query Performance

```sql
-- Use prepared statement for repeated calls
PREPARE cascade_stmt (date, date, uuid, uuid) AS
SELECT * FROM cascade_recalc_stock($1, $2, $3, $4);

EXECUTE cascade_stmt('2024-10-16', CURRENT_DATE, 'location-uuid', 'model-uuid');
```

---

## 🚀 Migration from Old System

### Phase 1: Parallel Run (Current State)

- ✅ stock_events table exists
- ✅ UnifiedTransactionDialog writes to stock_events
- ✅ Old dialogs still work (write to stock_entries directly)
- ✅ Dashboard reads from stock_entries

### Phase 2: Backfill (Optional)

```sql
-- Backfill historical data from stock_entries to stock_events
INSERT INTO stock_events (date, imei, location_id, phone_model_id, event_type, qty, notes)
SELECT 
  date,
  imei,
  location_id,
  phone_model_id,
  CASE 
    WHEN incoming > 0 THEN 'masuk'
    WHEN sold > 0 THEN 'laku'
    WHEN returns > 0 THEN 'retur_in'
    ELSE 'koreksi'
  END as event_type,
  GREATEST(incoming, sold, returns, 1) as qty,
  notes
FROM stock_entries
WHERE date >= '2024-01-01'  -- Adjust date range
  AND imei IS NOT NULL
ORDER BY date, created_at;

-- Then trigger full recalc
SELECT cascade_recalc_stock('2024-01-01'::date, CURRENT_DATE);
```

### Phase 3: Full Migration

- Deprecate old dialogs (AddStockDialog, IncomingStockDialog)
- Use only UnifiedTransactionDialog
- stock_entries becomes pure materialized view
- All reads/writes go through stock_events

---

## 📝 Summary

### ✅ Completed

1. ✅ stock_events table (immutable event stream)
2. ✅ cascade_recalc_stock function (recalculation logic)
3. ✅ Auto-cascade trigger (automatic updates)
4. ✅ UnifiedTransactionDialog (single entry point)
5. ✅ EventHistoryView (audit trail)
6. ✅ Dashboard integration (new Events tab)
7. ✅ TypeScript types updated
8. ✅ Mobile navigation updated

### 🎯 Benefits

- ✅ **Event-driven:** True event sourcing architecture
- ✅ **Retroactive:** Past corrections cascade automatically
- ✅ **Audit Trail:** Complete history in stock_events
- ✅ **Consistent:** All calculations from single source of truth
- ✅ **Fast:** Materialized stock_entries for quick reads
- ✅ **Scalable:** Efficient cascade per partition

### 🔮 Next Steps

1. Test thoroughly in development
2. Backfill historical data (optional)
3. Monitor performance
4. Deprecate old dialogs gradually
5. Add batch import for CSV (using stock_events)

---

*Documentation created: 16 October 2025*
*Version: 1.0.0*

