-- Add unique constraint to ensure one entry per day/location/model combination
ALTER TABLE public.stock_entries 
ADD CONSTRAINT unique_daily_stock_entry 
UNIQUE (date, location_id, phone_model_id, imei);

-- Update the night stock calculation trigger to follow the exact formula
-- night_stock = morning_stock + incoming + add_stock + returns + adjustment - sold
CREATE OR REPLACE FUNCTION public.update_night_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Calculate night_stock using the exact formula from requirements
  NEW.night_stock := NEW.morning_stock + NEW.incoming + NEW.add_stock + NEW.returns + NEW.adjustment - NEW.sold;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;