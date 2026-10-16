-- Add label column to stock_entries
ALTER TABLE public.stock_entries 
ADD COLUMN IF NOT EXISTS label text DEFAULT NULL;

-- Add label column to stock_events
ALTER TABLE public.stock_events 
ADD COLUMN IF NOT EXISTS label text DEFAULT NULL;

-- Update rollover_to_new_day to include label
CREATE OR REPLACE FUNCTION public.rollover_to_new_day(target_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  prev_date date;
BEGIN
  prev_date := target_date - interval '1 day';
  
  INSERT INTO public.stock_entries (
    date,
    location_id,
    phone_model_id,
    morning_stock,
    night_stock,
    imei,
    notes,
    metadata,
    cost_price,
    label
  )
  SELECT 
    target_date,
    location_id,
    phone_model_id,
    night_stock,
    night_stock,
    imei,
    'Rollover otomatis dari ' || prev_date::text,
    metadata,
    cost_price,
    label
  FROM public.stock_entries 
  WHERE date = prev_date 
    AND night_stock > 0
  ON CONFLICT (date, location_id, phone_model_id, COALESCE(imei, '')) 
  DO UPDATE SET
    metadata = CASE 
      WHEN stock_entries.metadata IS NULL OR stock_entries.metadata = '{}'::jsonb 
      THEN EXCLUDED.metadata 
      ELSE stock_entries.metadata 
    END,
    cost_price = CASE 
      WHEN stock_entries.cost_price IS NULL OR stock_entries.cost_price = 0 
      THEN EXCLUDED.cost_price 
      ELSE stock_entries.cost_price 
    END,
    label = CASE 
      WHEN stock_entries.label IS NULL OR stock_entries.label = '' 
      THEN EXCLUDED.label 
      ELSE stock_entries.label 
    END;
END;
$function$;

-- Update cascade_recalc_stock to preserve label
CREATE OR REPLACE FUNCTION public.cascade_recalc_stock(p_from_date date, p_to_date date DEFAULT CURRENT_DATE, p_location_id uuid DEFAULT NULL::uuid, p_phone_model_id uuid DEFAULT NULL::uuid, p_imei text DEFAULT NULL::text)
 RETURNS TABLE(recalculated_days integer, affected_entries integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_current_date DATE;
  v_days_count INTEGER := 0;
  v_entries_count INTEGER := 0;
  v_location_id UUID;
  v_phone_model_id UUID;
  v_imei TEXT;
BEGIN
  IF p_from_date > p_to_date THEN
    RAISE EXCEPTION 'from_date cannot be greater than to_date';
  END IF;

  FOR v_location_id, v_phone_model_id, v_imei IN
    SELECT DISTINCT e.location_id, e.phone_model_id, e.imei
    FROM stock_events e
    WHERE e.date BETWEEN p_from_date AND p_to_date
      AND (p_location_id IS NULL OR e.location_id = p_location_id)
      AND (p_phone_model_id IS NULL OR e.phone_model_id = p_phone_model_id)
      AND (p_imei IS NULL OR e.imei = p_imei)
      AND e.imei IS NOT NULL AND e.imei != ''
  LOOP
    v_current_date := p_from_date;
    
    WHILE v_current_date <= p_to_date LOOP
      DECLARE
        v_prev_night_stock INTEGER := 0;
        v_morning_stock INTEGER := 0;
        v_incoming INTEGER := 0;
        v_sold INTEGER := 0;
        v_returns INTEGER := 0;
        v_adjustment INTEGER := 0;
        v_night_stock INTEGER := 0;
        v_metadata JSONB := '{}'::jsonb;
        v_cost_price NUMERIC := 0;
        v_label TEXT := NULL;
      BEGIN
        IF v_current_date > p_from_date THEN
          SELECT COALESCE(night_stock, 0), COALESCE(metadata, '{}'::jsonb), COALESCE(cost_price, 0), label
          INTO v_prev_night_stock, v_metadata, v_cost_price, v_label
          FROM stock_entries
          WHERE date = v_current_date - INTERVAL '1 day'
            AND location_id = v_location_id
            AND phone_model_id = v_phone_model_id
            AND COALESCE(imei, '') = COALESCE(v_imei, '')
          LIMIT 1;
        ELSE
          SELECT COALESCE(morning_stock, 0), COALESCE(metadata, '{}'::jsonb), COALESCE(cost_price, 0), label
          INTO v_prev_night_stock, v_metadata, v_cost_price, v_label
          FROM stock_entries
          WHERE date = v_current_date
            AND location_id = v_location_id
            AND phone_model_id = v_phone_model_id
            AND COALESCE(imei, '') = COALESCE(v_imei, '')
          LIMIT 1;
        END IF;
        
        v_morning_stock := COALESCE(v_prev_night_stock, 0);
        
        -- Get metadata and label from stock_events if not found
        IF v_metadata IS NULL OR v_metadata = '{}'::jsonb THEN
          SELECT COALESCE(metadata, '{}'::jsonb), label INTO v_metadata, v_label
          FROM stock_events
          WHERE date <= v_current_date
            AND location_id = v_location_id
            AND phone_model_id = v_phone_model_id
            AND COALESCE(imei, '') = COALESCE(v_imei, '')
            AND (metadata IS NOT NULL AND metadata != '{}'::jsonb OR label IS NOT NULL)
          ORDER BY date DESC, created_at DESC
          LIMIT 1;
        END IF;
        
        SELECT 
          COALESCE(SUM(CASE WHEN event_type = 'masuk' THEN qty ELSE 0 END), 0),
          COALESCE(SUM(CASE WHEN event_type = 'laku' THEN qty ELSE 0 END), 0),
          COALESCE(SUM(CASE WHEN event_type = 'retur_in' THEN qty ELSE 0 END), 0),
          COALESCE(SUM(CASE 
            WHEN event_type IN ('retur_out', 'transfer_out') THEN -qty 
            WHEN event_type = 'transfer_in' THEN qty
            WHEN event_type = 'koreksi' THEN qty 
            ELSE 0 
          END), 0)
        INTO v_incoming, v_sold, v_returns, v_adjustment
        FROM stock_events
        WHERE date = v_current_date
          AND location_id = v_location_id
          AND phone_model_id = v_phone_model_id
          AND COALESCE(imei, '') = COALESCE(v_imei, '');
        
        v_night_stock := v_morning_stock + v_incoming + v_returns - v_sold + v_adjustment;
        
        INSERT INTO stock_entries (
          date, location_id, phone_model_id, imei,
          morning_stock, incoming, sold, returns, adjustment, night_stock,
          metadata, cost_price, label,
          created_at, updated_at
        ) VALUES (
          v_current_date, v_location_id, v_phone_model_id, v_imei,
          v_morning_stock, v_incoming, v_sold, v_returns, v_adjustment, v_night_stock,
          COALESCE(v_metadata, '{}'::jsonb), COALESCE(v_cost_price, 0), v_label,
          NOW(), NOW()
        )
        ON CONFLICT (date, location_id, phone_model_id, COALESCE(imei, '')) 
        DO UPDATE SET
          morning_stock = EXCLUDED.morning_stock,
          incoming = EXCLUDED.incoming,
          sold = EXCLUDED.sold,
          returns = EXCLUDED.returns,
          adjustment = EXCLUDED.adjustment,
          night_stock = EXCLUDED.night_stock,
          metadata = CASE 
            WHEN stock_entries.metadata IS NULL OR stock_entries.metadata = '{}'::jsonb 
            THEN EXCLUDED.metadata 
            ELSE stock_entries.metadata 
          END,
          cost_price = CASE 
            WHEN stock_entries.cost_price IS NULL OR stock_entries.cost_price = 0 
            THEN EXCLUDED.cost_price 
            ELSE stock_entries.cost_price 
          END,
          label = CASE 
            WHEN stock_entries.label IS NULL OR stock_entries.label = '' 
            THEN EXCLUDED.label 
            ELSE stock_entries.label 
          END,
          updated_at = NOW();
        
        v_entries_count := v_entries_count + 1;
      END;
      
      v_current_date := v_current_date + INTERVAL '1 day';
      v_days_count := v_days_count + 1;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_days_count, v_entries_count;
END;
$function$;