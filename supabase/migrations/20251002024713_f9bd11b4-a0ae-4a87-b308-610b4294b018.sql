-- Update reset_all_data to avoid DELETE without WHERE issues by using TRUNCATE CASCADE
CREATE OR REPLACE FUNCTION public.reset_all_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Use TRUNCATE with CASCADE for fast, safe full resets
  TRUNCATE TABLE
    public.stock_transactions_log,
    public.stock_entries,
    public.stock_transactions,
    public.daily_summaries,
    public.file_uploads,
    public.phone_models
  RESTART IDENTITY CASCADE;
END;
$$;