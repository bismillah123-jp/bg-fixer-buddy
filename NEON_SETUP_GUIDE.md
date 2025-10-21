# Setup Neon DB untuk Stock Management App

## Opsi 1: Manual Setup dengan Supabase Client (Recommended)

### Langkah 1: Buat Project Supabase Baru
1. Buka https://supabase.com
2. Klik "New Project"
3. Pilih organization
4. Isi:
   - Name: `stockwise-neon`
   - Database Password: (buat password baru)
   - Region: pilih yang terdekat

### Langkah 2: Setup Database Schema di Neon DB
1. Buka Neon Console: https://console.neon.tech
2. Login dengan akun Anda
3. Pilih project `neondb`
4. Buka SQL Editor

### Langkah 3: Jalankan Migration Scripts
Copy dan paste script berikut di Neon SQL Editor:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create stock_locations table
CREATE TABLE IF NOT EXISTS public.stock_locations (
  id UUID NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Create phone_models table
CREATE TABLE IF NOT EXISTS public.phone_models (
  id UUID NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  storage_capacity TEXT,
  color TEXT,
  srp INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(brand, model, storage_capacity, color)
);

-- 3. Create stock_entries table
CREATE TABLE IF NOT EXISTS public.stock_entries (
  id UUID NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  location_id UUID NOT NULL REFERENCES public.stock_locations(id),
  phone_model_id UUID NOT NULL REFERENCES public.phone_models(id),
  imei TEXT,
  morning_stock INTEGER NOT NULL DEFAULT 0,
  night_stock INTEGER NOT NULL DEFAULT 0,
  incoming INTEGER NOT NULL DEFAULT 0,
  add_stock INTEGER NOT NULL DEFAULT 0,
  returns INTEGER NOT NULL DEFAULT 0,
  sold INTEGER NOT NULL DEFAULT 0,
  adjustment INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  selling_price INTEGER DEFAULT 0,
  sale_date DATE,
  profit_loss INTEGER DEFAULT 0,
  cost_price INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(date, location_id, phone_model_id, imei)
);

-- 4. Create stock_events table
CREATE TABLE IF NOT EXISTS public.stock_events (
  id UUID NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  date DATE NOT NULL,
  imei TEXT,
  location_id UUID NOT NULL REFERENCES public.stock_locations(id),
  phone_model_id UUID NOT NULL REFERENCES public.phone_models(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('masuk', 'laku', 'retur_in', 'retur_out', 'transfer_out', 'transfer_in', 'koreksi')),
  qty INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. Create indexes
CREATE INDEX IF NOT EXISTS idx_stock_events_date ON stock_events(date);
CREATE INDEX IF NOT EXISTS idx_stock_events_imei ON stock_events(imei);
CREATE INDEX IF NOT EXISTS idx_stock_events_type ON stock_events(event_type);
CREATE INDEX IF NOT EXISTS idx_stock_entries_date ON stock_entries(date);
CREATE INDEX IF NOT EXISTS idx_stock_entries_imei ON stock_entries(imei);

-- 6. Create unique constraint for stock_events
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_events_imei_date_type 
ON stock_events(date, imei, location_id, phone_model_id, event_type);

-- 7. Insert sample data
INSERT INTO stock_locations (name, description) VALUES 
('MBUTOH', 'Toko Mbutoh'),
('SOKO', 'Toko Soko')
ON CONFLICT (name) DO NOTHING;

-- 8. Create cascade function
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
  IF p_from_date > p_to_date THEN
    RAISE EXCEPTION 'from_date cannot be greater than to_date';
  END IF;

  FOR v_location_id, v_phone_model_id IN
    SELECT DISTINCT e.location_id, e.phone_model_id
    FROM stock_events e
    WHERE e.date BETWEEN p_from_date AND p_to_date
      AND (p_location_id IS NULL OR e.location_id = p_location_id)
      AND (p_phone_model_id IS NULL OR e.phone_model_id = p_phone_model_id)
  LOOP
    v_current_date := p_from_date;
    
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
        IF v_current_date > p_from_date THEN
          SELECT COALESCE(night_stock, 0) INTO v_prev_night_stock
          FROM stock_entries
          WHERE date = v_current_date - INTERVAL '1 day'
            AND location_id = v_location_id
            AND phone_model_id = v_phone_model_id
            AND imei IS NULL
          LIMIT 1;
        ELSE
          SELECT COALESCE(morning_stock, 0) INTO v_prev_night_stock
          FROM stock_entries
          WHERE date = v_current_date
            AND location_id = v_location_id
            AND phone_model_id = v_phone_model_id
            AND imei IS NULL
          LIMIT 1;
        END IF;
        
        v_morning_stock := COALESCE(v_prev_night_stock, 0);
        
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
        
        v_night_stock := v_morning_stock + v_incoming + v_returns - v_sold + v_adjustment;
        
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
          morning_stock = COALESCE(EXCLUDED.morning_stock, 0),
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

-- 9. Create trigger function
CREATE OR REPLACE FUNCTION trigger_cascade_recalc()
RETURNS TRIGGER AS $$
DECLARE
  v_date DATE;
  v_location_id UUID;
  v_phone_model_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_date := OLD.date;
    v_location_id := OLD.location_id;
    v_phone_model_id := OLD.phone_model_id;
  ELSE
    v_date := NEW.date;
    v_location_id := NEW.location_id;
    v_phone_model_id := NEW.phone_model_id;
  END IF;
  
  BEGIN
    PERFORM cascade_recalc_stock(
      p_from_date := v_date,
      p_to_date := CURRENT_DATE,
      p_location_id := v_location_id,
      p_phone_model_id := v_phone_model_id
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Cascade recalculation failed: %', SQLERRM;
  END;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 10. Create trigger
DROP TRIGGER IF EXISTS trg_cascade_after_stock_event ON stock_events;
CREATE TRIGGER trg_cascade_after_stock_event
AFTER INSERT OR UPDATE OR DELETE ON stock_events
FOR EACH ROW
EXECUTE FUNCTION trigger_cascade_recalc();

-- 11. Enable RLS (Row Level Security) - required by Supabase
ALTER TABLE stock_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_events ENABLE ROW LEVEL SECURITY;

-- 12. Create policies (allow all for now)
CREATE POLICY "Allow all operations" ON stock_locations FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON phone_models FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON stock_entries FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON stock_events FOR ALL USING (true);
```

### Langkah 4: Update Supabase Client
Setelah schema siap, update client.ts dengan credentials Supabase project baru:

```typescript
// src/integrations/supabase/client.ts
const SUPABASE_URL = "https://YOUR_NEW_PROJECT_ID.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "YOUR_NEW_ANON_KEY";
```

## Opsi 2: Direct Neon DB Connection (Advanced)

Jika ingin langsung ke Neon tanpa Supabase:

### 1. Install dependencies
```bash
npm install pg @types/pg
```

### 2. Create database client
```typescript
// src/lib/database.ts
import { Pool } from 'pg';

const pool = new Pool({
  host: 'ep-fragrant-night-a1vimis8-pooler.ap-southeast-1.aws.neon.tech',
  database: 'neondb',
  user: 'neondb_owner',
  password: 'npg_yvdbr2AMNOm4',
  ssl: { rejectUnauthorized: false },
  port: 5432,
});

export default pool;
```

### 3. Update semua komponen untuk menggunakan raw SQL
Ini membutuhkan refactor besar-besaran semua komponen.

## Rekomendasi

**Gunakan Opsi 1** - lebih mudah dan tidak perlu ubah kode aplikasi.
