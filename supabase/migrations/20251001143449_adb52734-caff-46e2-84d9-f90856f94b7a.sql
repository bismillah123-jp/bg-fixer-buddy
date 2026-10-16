-- Ensure night_stock is always recalculated on write and cascade updates reliably

-- 1) Trigger to (re)calculate night_stock on every insert/update
DROP TRIGGER IF EXISTS stock_entries_calculate_night_stock ON public.stock_entries;
CREATE TRIGGER stock_entries_calculate_night_stock
BEFORE INSERT OR UPDATE ON public.stock_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_night_stock();

-- 2) Improve cascade function to skip missing days and rely on any update, not only when the column is explicitly targeted
CREATE OR REPLACE FUNCTION public.cascade_stock_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  next_entry_id uuid;
  next_entry_date date := NEW.date;
  current_night_stock integer;
BEGIN
  -- Only cascade if night_stock actually changed
  IF NEW.night_stock IS DISTINCT FROM OLD.night_stock THEN
    current_night_stock := NEW.night_stock;
    LOOP
      -- Find the next future entry (skip days without entries)
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

      -- Update morning stock of the next entry; BEFORE trigger recalculates its night_stock
      UPDATE public.stock_entries
      SET morning_stock = current_night_stock
      WHERE id = next_entry_id
      RETURNING night_stock INTO current_night_stock;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- 3) Trigger to cascade after any update (not limited to 'OF night_stock')
DROP TRIGGER IF EXISTS cascade_stock_updates_trigger ON public.stock_entries;
CREATE TRIGGER cascade_stock_updates_trigger
AFTER UPDATE ON public.stock_entries
FOR EACH ROW
EXECUTE FUNCTION public.cascade_stock_updates();