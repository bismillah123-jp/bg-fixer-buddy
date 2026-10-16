-- Migration: Create trigger for automatic cascade recalculation
-- Triggers cascade when stock_events are inserted/updated/deleted

CREATE OR REPLACE FUNCTION trigger_cascade_recalc()
RETURNS TRIGGER AS $$
DECLARE
  v_date DATE;
  v_location_id UUID;
  v_phone_model_id UUID;
BEGIN
  -- Determine which event to use (NEW for INSERT/UPDATE, OLD for DELETE)
  IF TG_OP = 'DELETE' THEN
    v_date := OLD.date;
    v_location_id := OLD.location_id;
    v_phone_model_id := OLD.phone_model_id;
  ELSE
    v_date := NEW.date;
    v_location_id := NEW.location_id;
    v_phone_model_id := NEW.phone_model_id;
  END IF;
  
  -- Schedule cascade recalculation from the affected date to today
  PERFORM cascade_recalc_stock_simple(
    v_date,
    v_location_id,
    v_phone_model_id
  );
  
  -- Return appropriate value based on operation
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on stock_events table
DROP TRIGGER IF EXISTS trg_cascade_after_stock_event ON stock_events;

CREATE TRIGGER trg_cascade_after_stock_event
AFTER INSERT OR UPDATE OR DELETE ON stock_events
FOR EACH ROW
EXECUTE FUNCTION trigger_cascade_recalc();

-- Add index on stock_entries for the unique constraint used in upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_entries_date_loc_model_imei 
ON stock_entries(date, location_id, phone_model_id, imei);

COMMENT ON FUNCTION trigger_cascade_recalc IS 'Trigger function that automatically recalculates stock_entries when stock_events change';
COMMENT ON TRIGGER trg_cascade_after_stock_event ON stock_events IS 'Automatically triggers cascade recalculation after any stock event change';

