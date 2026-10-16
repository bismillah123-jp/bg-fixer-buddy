-- Add SRP (Suggested Retail Price) to phone_models table
ALTER TABLE public.phone_models
ADD COLUMN IF NOT EXISTS srp numeric DEFAULT 0;

-- Add sales tracking columns to stock_entries table
ALTER TABLE public.stock_entries
ADD COLUMN IF NOT EXISTS selling_price numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS sale_date date DEFAULT NULL,
ADD COLUMN IF NOT EXISTS profit_loss numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS cost_price numeric DEFAULT 0;

COMMENT ON COLUMN public.phone_models.srp IS 'Suggested Retail Price (Harga Eceran yang Disarankan)';
COMMENT ON COLUMN public.stock_entries.selling_price IS 'Actual selling price when item is sold';
COMMENT ON COLUMN public.stock_entries.sale_date IS 'Date when item was sold';
COMMENT ON COLUMN public.stock_entries.profit_loss IS 'Calculated profit or loss (selling_price - cost_price)';
COMMENT ON COLUMN public.stock_entries.cost_price IS 'Cost price of the item';