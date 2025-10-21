CREATE OR REPLACE FUNCTION public.bulk_insert_stock(entries jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  entry jsonb;
BEGIN
  -- Check if the user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be authenticated to perform this action.';
  END IF;

  -- Loop through each entry in the JSON array and insert it
  FOR entry IN SELECT * FROM jsonb_array_elements(entries)
  LOOP
    INSERT INTO public.stock_entries (
      date,
      location_id,
      phone_model_id,
      imei,
      morning_stock,
      incoming,
      add_stock,
      returns,
      sold,
      adjustment,
      notes
    )
    VALUES (
      (entry->>'date')::date,
      (entry->>'location_id')::uuid,
      (entry->>'phone_model_id')::uuid,
      entry->>'imei',
      (entry->>'morning_stock')::integer,
      (entry->>'incoming')::integer,
      (entry->>'add_stock')::integer,
      (entry->>'returns')::integer,
      (entry->>'sold')::integer,
      (entry->>'adjustment')::integer,
      entry->>'notes'
    )
    -- If a row with the same date, location, model, and IMEI already exists,
    -- do nothing to prevent duplicates. This makes the import idempotent.
    ON CONFLICT (date, location_id, phone_model_id, imei) DO NOTHING;
  END LOOP;
END;
$$;

-- Grant execute permission to the authenticated role
GRANT EXECUTE ON FUNCTION public.bulk_insert_stock(jsonb) TO authenticated;
