-- Add metadata column to stock_entries if it doesn't exist
ALTER TABLE stock_entries ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Update existing stock_entries to copy metadata from stock_events
UPDATE stock_entries se
SET metadata = se_events.metadata
FROM (
  SELECT DISTINCT ON (imei, date, location_id, phone_model_id)
    imei, 
    date, 
    location_id, 
    phone_model_id,
    metadata
  FROM stock_events
  WHERE event_type = 'masuk'
  ORDER BY imei, date, location_id, phone_model_id, created_at DESC
) se_events
WHERE se.imei = se_events.imei
  AND se.date = se_events.date
  AND se.location_id = se_events.location_id
  AND se.phone_model_id = se_events.phone_model_id
  AND (se.metadata IS NULL OR se.metadata = '{}');

-- Create or replace function to ensure metadata is copied when stock_entries are created/updated
CREATE OR REPLACE FUNCTION copy_metadata_from_events()
RETURNS TRIGGER AS $$
BEGIN
  -- If metadata is empty or null, try to get it from stock_events
  IF NEW.metadata IS NULL OR NEW.metadata = '{}' THEN
    SELECT metadata INTO NEW.metadata
    FROM stock_events
    WHERE imei = NEW.imei
      AND date = NEW.date
      AND location_id = NEW.location_id
      AND phone_model_id = NEW.phone_model_id
      AND event_type = 'masuk'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically copy metadata
DROP TRIGGER IF EXISTS trigger_copy_metadata ON stock_entries;
CREATE TRIGGER trigger_copy_metadata
  BEFORE INSERT OR UPDATE ON stock_entries
  FOR EACH ROW
  EXECUTE FUNCTION copy_metadata_from_events();