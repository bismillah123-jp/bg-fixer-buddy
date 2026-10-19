-- FIX (19 Okt 2026): rollover membalik second -> baru setiap hari.
--
-- Root cause: rollover_to_new_day() INSERT baris baru ke stock_entries dengan
-- menyalin metadata, cost_price, label -- TAPI TIDAK menyalin condition.
-- Baris baru otomatis dapat DEFAULT 'baru', jadi tiap pagi semua unit second
-- ke-flip jadi baru. Tidak ada trigger yang membetulkannya karena rollover
-- insert langsung ke stock_entries (bukan lewat stock_events).
--
-- Perbaikan: salin condition dari baris hari sebelumnya (kondisi unit tidak
-- pernah berubah seumur hidup unit: sekali second, tetap second).
-- Plus: perbaiki data yang sudah terlanjur ke-flip dari event 'masuk'.

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
    label,
    condition
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
    label,
    condition
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
    END,
    -- Kondisi unit tidak berubah seumur hidupnya; baris konflik pasti unit
    -- yang sama, jadi aman timpa dengan condition dari hari sebelumnya.
    condition = EXCLUDED.condition;
END;
$function$;

-- Perbaiki baris-baris yang sudah terlanjur ke-flip oleh rollover:
-- kembalikan condition tiap IMEI ke condition aslinya dari event 'masuk'.
UPDATE public.stock_entries se
SET condition = ev.condition, updated_at = NOW()
FROM (
  SELECT DISTINCT ON (e.imei) e.imei, e.condition
  FROM public.stock_events e
  WHERE e.imei IS NOT NULL
    AND e.event_type = 'masuk'
    AND e.condition IS NOT NULL
  ORDER BY e.imei, e.date DESC, e.created_at DESC
) ev
WHERE se.imei = ev.imei
  AND se.condition IS DISTINCT FROM ev.condition;
