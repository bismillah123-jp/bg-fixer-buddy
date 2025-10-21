-- Create function to update brand name
CREATE OR REPLACE FUNCTION public.update_brand_name(
  old_brand_name text,
  new_brand_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.phone_models
  SET brand = new_brand_name
  WHERE brand = old_brand_name;
END;
$$;

-- Create function to delete brand and its models
CREATE OR REPLACE FUNCTION public.delete_brand(brand_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.phone_models
  WHERE brand = brand_name;
END;
$$;

-- Create function to cascade stock updates to future dates
CREATE OR REPLACE FUNCTION public.cascade_stock_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  next_date date;
  next_entry_id uuid;
  current_night_stock integer;
BEGIN
  -- Only cascade if night_stock actually changed
  IF NEW.night_stock != OLD.night_stock THEN
    next_date := NEW.date + interval '1 day';
    current_night_stock := NEW.night_stock;
    
    -- Loop through all future dates for this location/model/imei
    LOOP
      -- Find the next entry
      SELECT id INTO next_entry_id
      FROM public.stock_entries
      WHERE date = next_date
        AND location_id = NEW.location_id
        AND phone_model_id = NEW.phone_model_id
        AND COALESCE(imei, '') = COALESCE(NEW.imei, '')
      LIMIT 1;
      
      -- Exit if no more future entries
      EXIT WHEN next_entry_id IS NULL;
      
      -- Update the morning stock of the next entry
      UPDATE public.stock_entries
      SET morning_stock = current_night_stock
      WHERE id = next_entry_id
      RETURNING night_stock INTO current_night_stock;
      
      -- Move to the next day
      next_date := next_date + interval '1 day';
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to cascade updates after stock entry is updated
DROP TRIGGER IF EXISTS cascade_stock_updates_trigger ON public.stock_entries;
CREATE TRIGGER cascade_stock_updates_trigger
AFTER UPDATE OF night_stock ON public.stock_entries
FOR EACH ROW
EXECUTE FUNCTION public.cascade_stock_updates();