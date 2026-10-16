-- Fix function search path security warnings

-- Update calculate_night_stock function to use proper search path
CREATE OR REPLACE FUNCTION public.calculate_night_stock(
  p_morning_stock INTEGER,
  p_incoming INTEGER,
  p_add_stock INTEGER,
  p_returns INTEGER,
  p_sold INTEGER,
  p_adjustment INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- night_stock = morning_stock + incoming + add_stock + returns + adjustment - sold
  RETURN p_morning_stock + p_incoming + p_add_stock + p_returns + p_adjustment - p_sold;
END;
$$;

-- Update update_night_stock function to use proper search path
CREATE OR REPLACE FUNCTION public.update_night_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.night_stock := public.calculate_night_stock(
    NEW.morning_stock,
    NEW.incoming,
    NEW.add_stock,
    NEW.returns,
    NEW.sold,
    NEW.adjustment
  );
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;