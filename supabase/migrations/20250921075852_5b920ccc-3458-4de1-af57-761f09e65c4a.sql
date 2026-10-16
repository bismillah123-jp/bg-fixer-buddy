-- Create function to delete stock entry and related logs
CREATE OR REPLACE FUNCTION public.delete_stock_entry_and_logs(entry_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete related transaction logs first
  DELETE FROM public.stock_transactions_log 
  WHERE stock_entry_id = entry_id;
  
  -- Delete the stock entry
  DELETE FROM public.stock_entries 
  WHERE id = entry_id;
END;
$$;