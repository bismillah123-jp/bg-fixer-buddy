-- Create function for day rollover: morning stock of new day = night stock of previous day
CREATE OR REPLACE FUNCTION public.rollover_to_new_day(target_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  prev_date date;
  entry_record RECORD;
BEGIN
  -- Calculate previous date
  prev_date := target_date - interval '1 day';
  
  -- Create new entries for the target date based on previous day's night stock
  INSERT INTO public.stock_entries (
    date,
    location_id,
    phone_model_id,
    morning_stock,
    night_stock,
    imei,
    notes
  )
  SELECT 
    target_date,
    location_id,
    phone_model_id,
    night_stock, -- Previous day's night stock becomes new day's morning stock
    night_stock, -- Initial night stock = morning stock
    imei,
    'Rollover otomatis dari ' || prev_date::text
  FROM public.stock_entries 
  WHERE date = prev_date 
    AND night_stock > 0 -- Only rollover items that still have stock
  ON CONFLICT (date, location_id, phone_model_id, imei) 
  DO NOTHING; -- Skip if entry already exists for this date/location/model/imei
END;
$function$;

-- Create function to check and perform automatic rollover
CREATE OR REPLACE FUNCTION public.check_and_rollover_if_needed()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  today_date date := CURRENT_DATE;
  yesterday_date date := CURRENT_DATE - interval '1 day';
  entries_exist boolean;
BEGIN
  -- Check if there are entries for today
  SELECT EXISTS(
    SELECT 1 FROM public.stock_entries 
    WHERE date = today_date
  ) INTO entries_exist;
  
  -- If no entries exist for today but entries exist for yesterday, perform rollover
  IF NOT entries_exist THEN
    SELECT EXISTS(
      SELECT 1 FROM public.stock_entries 
      WHERE date = yesterday_date AND night_stock > 0
    ) INTO entries_exist;
    
    IF entries_exist THEN
      PERFORM public.rollover_to_new_day(today_date);
      RETURN true;
    END IF;
  END IF;
  
  RETURN false;
END;
$function$;