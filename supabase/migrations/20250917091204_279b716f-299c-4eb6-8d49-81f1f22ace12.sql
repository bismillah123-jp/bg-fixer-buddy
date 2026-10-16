-- Create HP stock management schema

-- Locations table (MBUTOH, SOKO)
CREATE TABLE public.stock_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- HP brands and models
CREATE TABLE public.phone_models (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  storage_capacity TEXT,
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(brand, model, storage_capacity, color)
);

-- Stock entries with morning/night tracking
CREATE TABLE public.stock_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
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
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(date, location_id, phone_model_id, imei)
);

-- Stock transactions log for audit trail
CREATE TABLE public.stock_transactions_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stock_entry_id UUID NOT NULL REFERENCES public.stock_entries(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('incoming', 'add_stock', 'sale', 'return', 'adjustment')),
  quantity INTEGER NOT NULL,
  previous_night_stock INTEGER NOT NULL,
  new_night_stock INTEGER NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.stock_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transactions_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view stock locations" 
ON public.stock_locations FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage stock locations" 
ON public.stock_locations FOR ALL 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view phone models" 
ON public.phone_models FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage phone models" 
ON public.phone_models FOR ALL 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view stock entries" 
ON public.stock_entries FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage stock entries" 
ON public.stock_entries FOR ALL 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view transaction log" 
ON public.stock_transactions_log FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert transaction log" 
ON public.stock_transactions_log FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

-- Create function to update night stock based on business rules
CREATE OR REPLACE FUNCTION public.calculate_night_stock(
  p_morning_stock INTEGER,
  p_incoming INTEGER,
  p_add_stock INTEGER,
  p_returns INTEGER,
  p_sold INTEGER,
  p_adjustment INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- night_stock = morning_stock + incoming + add_stock + returns + adjustment - sold
  RETURN p_morning_stock + p_incoming + p_add_stock + p_returns + p_adjustment - p_sold;
END;
$$;

-- Create trigger to automatically calculate night_stock
CREATE OR REPLACE FUNCTION public.update_night_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
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

CREATE TRIGGER trigger_update_night_stock
  BEFORE INSERT OR UPDATE ON public.stock_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_night_stock();

-- Create trigger for updated_at columns
CREATE TRIGGER update_stock_locations_updated_at
  BEFORE UPDATE ON public.stock_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_phone_models_updated_at
  BEFORE UPDATE ON public.phone_models
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert sample data
INSERT INTO public.stock_locations (name, description) VALUES
('MBUTOH', 'Main Mbutoh Store'),
('SOKO', 'Soko Branch Store');

INSERT INTO public.phone_models (brand, model, storage_capacity, color) VALUES
('VIVO', 'Y29', '8/256', 'WHITE'),
('VIVO', 'Y29', '8/256', 'BLACK'),
('VIVO', 'Y199S', '4/128', 'WHITE'),
('VIVO', 'Y199S', '4/128', 'BLACK'),
('SAMSUNG', 'Galaxy A25', '8/256', 'BLUE'),
('SAMSUNG', 'Galaxy A25', '8/256', 'BLACK'),
('XIAOMI', 'Redmi Note 13', '8/256', 'GRAY'),
('XIAOMI', 'Redmi Note 13', '8/256', 'BLUE');