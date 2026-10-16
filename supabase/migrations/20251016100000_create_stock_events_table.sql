-- Migration: Create stock_events table for event-sourcing architecture
-- This table stores immutable transaction events (masuk, laku, retur_in, retur_out)

-- Create stock_events table
CREATE TABLE IF NOT EXISTS stock_events (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  date DATE NOT NULL,
  imei TEXT NOT NULL,
  location_id UUID NOT NULL REFERENCES stock_locations(id) ON DELETE RESTRICT,
  phone_model_id UUID NOT NULL REFERENCES phone_models(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('masuk', 'laku', 'retur_in', 'retur_out', 'transfer_out', 'transfer_in', 'koreksi')),
  qty INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_stock_events_date_location ON stock_events(date, location_id);
CREATE INDEX IF NOT EXISTS idx_stock_events_imei ON stock_events(imei);
CREATE INDEX IF NOT EXISTS idx_stock_events_type ON stock_events(event_type);
CREATE INDEX IF NOT EXISTS idx_stock_events_created_at ON stock_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_events_phone_model ON stock_events(phone_model_id);

-- Enable Row Level Security
ALTER TABLE stock_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Enable read access for all authenticated users" ON stock_events
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON stock_events
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON stock_events
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Add comment
COMMENT ON TABLE stock_events IS 'Immutable event stream for all stock transactions. Primary source of truth for stock movements.';
COMMENT ON COLUMN stock_events.event_type IS 'Transaction type: masuk (incoming), laku (sold), retur_in (return to store), retur_out (return to supplier), transfer_out, transfer_in, koreksi (correction)';

