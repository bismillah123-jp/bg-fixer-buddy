-- Create function to reset all data
CREATE OR REPLACE FUNCTION public.reset_all_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Delete all stock transaction logs first (foreign key dependency)
  DELETE FROM public.stock_transactions_log;
  
  -- Delete all stock entries
  DELETE FROM public.stock_entries;
  
  -- Delete all stock transactions
  DELETE FROM public.stock_transactions;
  
  -- Delete all daily summaries
  DELETE FROM public.daily_summaries;
  
  -- Delete all file uploads
  DELETE FROM public.file_uploads;
  
  -- Delete all phone models
  DELETE FROM public.phone_models;
  
  -- Reset sequences if any
  -- Note: UUIDs don't need sequence resets
END;
$$;