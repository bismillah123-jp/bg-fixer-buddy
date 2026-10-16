-- Update cascade function to handle INSERT and UPDATE safely
CREATE OR REPLACE FUNCTION public.cascade_stock_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  next_entry_id uuid;
  next_entry_date date;
  current_night_stock integer;
BEGIN
  -- Determine if we should cascade
  IF TG_OP = 'UPDATE' THEN
    IF NEW.night_stock IS NOT DISTINCT FROM OLD.night_stock THEN
      RETURN NEW; -- nothing changed
    END IF;
  END IF;

  -- Start from the current row's date
  next_entry_date := NEW.date;
  current_night_stock := NEW.night_stock;

  LOOP
    -- find next future entry for the same location/model/imei
    SELECT id, date
    INTO next_entry_id, next_entry_date
    FROM public.stock_entries
    WHERE date > next_entry_date
      AND location_id = NEW.location_id
      AND phone_model_id = NEW.phone_model_id
      AND COALESCE(imei, '') = COALESCE(NEW.imei, '')
    ORDER BY date
    LIMIT 1;

    EXIT WHEN next_entry_id IS NULL;

    -- Update morning stock of next entry; BEFORE trigger will recalc night_stock
    UPDATE public.stock_entries
    SET morning_stock = current_night_stock
    WHERE id = next_entry_id
    RETURNING night_stock INTO current_night_stock;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Recreate trigger to run after INSERT or UPDATE
DROP TRIGGER IF EXISTS cascade_stock_updates_trigger ON public.stock_entries;
CREATE TRIGGER cascade_stock_updates_trigger
AFTER INSERT OR UPDATE ON public.stock_entries
FOR EACH ROW
EXECUTE FUNCTION public.cascade_stock_updates();