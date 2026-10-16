CREATE OR REPLACE FUNCTION public.delete_stock_entry_and_logs(entry_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- First, delete associated logs
  DELETE FROM public.stock_transactions_log
  WHERE stock_entry_id = entry_id;

  -- Then, delete the main entry
  DELETE FROM public.stock_entries
  WHERE id = entry_id;
END;
$$;
