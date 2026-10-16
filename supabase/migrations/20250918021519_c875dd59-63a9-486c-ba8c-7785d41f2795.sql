-- Add sample stock data for testing

-- First, let's add some sample stock entries for today
DO $$
DECLARE
    location_mbutoh_id UUID;
    location_soko_id UUID;
    vivo_y29_white_id UUID;
    vivo_y29_black_id UUID;
    vivo_y199s_white_id UUID;
    samsung_a25_blue_id UUID;
    samsung_a25_black_id UUID;
    xiaomi_note13_gray_id UUID;
BEGIN
    -- Get location IDs
    SELECT id INTO location_mbutoh_id FROM public.stock_locations WHERE name = 'MBUTOH';
    SELECT id INTO location_soko_id FROM public.stock_locations WHERE name = 'SOKO';
    
    -- Get phone model IDs
    SELECT id INTO vivo_y29_white_id FROM public.phone_models WHERE brand = 'VIVO' AND model = 'Y29' AND color = 'WHITE';
    SELECT id INTO vivo_y29_black_id FROM public.phone_models WHERE brand = 'VIVO' AND model = 'Y29' AND color = 'BLACK';
    SELECT id INTO vivo_y199s_white_id FROM public.phone_models WHERE brand = 'VIVO' AND model = 'Y199S' AND color = 'WHITE';
    SELECT id INTO samsung_a25_blue_id FROM public.phone_models WHERE brand = 'SAMSUNG' AND model = 'Galaxy A25' AND color = 'BLUE';
    SELECT id INTO samsung_a25_black_id FROM public.phone_models WHERE brand = 'SAMSUNG' AND model = 'Galaxy A25' AND color = 'BLACK';
    SELECT id INTO xiaomi_note13_gray_id FROM public.phone_models WHERE brand = 'XIAOMI' AND model = 'Redmi Note 13' AND color = 'GRAY';

    -- Insert sample stock entries for today
    INSERT INTO public.stock_entries (date, location_id, phone_model_id, imei, morning_stock, incoming, add_stock, returns, sold, adjustment, notes) VALUES
    (CURRENT_DATE, location_mbutoh_id, vivo_y29_white_id, '863245076046496', 15, 0, 0, 0, 3, 0, 'Initial stock entry'),
    (CURRENT_DATE, location_mbutoh_id, vivo_y29_black_id, '863245076046497', 12, 2, 0, 0, 1, 0, 'Incoming shipment received'),
    (CURRENT_DATE, location_mbutoh_id, vivo_y199s_white_id, NULL, 8, 0, 0, 1, 0, 0, 'Customer return processed'),
    (CURRENT_DATE, location_soko_id, samsung_a25_blue_id, '863245076046498', 20, 0, 0, 0, 5, 0, 'High demand item'),
    (CURRENT_DATE, location_soko_id, samsung_a25_black_id, NULL, 3, 0, 0, 0, 2, 0, 'Low stock alert'),
    (CURRENT_DATE, location_soko_id, xiaomi_note13_gray_id, '863245076046499', 10, 3, 0, 0, 1, 0, 'New shipment arrived');

    -- Insert some historical data (yesterday)
    INSERT INTO public.stock_entries (date, location_id, phone_model_id, morning_stock, incoming, add_stock, returns, sold, adjustment) VALUES
    (CURRENT_DATE - INTERVAL '1 day', location_mbutoh_id, vivo_y29_white_id, 18, 0, 0, 0, 3, 0),
    (CURRENT_DATE - INTERVAL '1 day', location_mbutoh_id, vivo_y29_black_id, 10, 3, 0, 0, 1, 0),
    (CURRENT_DATE - INTERVAL '1 day', location_soko_id, samsung_a25_blue_id, 25, 0, 0, 0, 5, 0),
    (CURRENT_DATE - INTERVAL '1 day', location_soko_id, samsung_a25_black_id, 5, 0, 0, 0, 2, 0);

    -- Insert data for a few more days for trend analysis
    INSERT INTO public.stock_entries (date, location_id, phone_model_id, morning_stock, incoming, add_stock, returns, sold, adjustment) VALUES
    (CURRENT_DATE - INTERVAL '2 days', location_mbutoh_id, vivo_y29_white_id, 21, 0, 0, 0, 3, 0),
    (CURRENT_DATE - INTERVAL '2 days', location_soko_id, samsung_a25_blue_id, 30, 0, 0, 0, 5, 0),
    (CURRENT_DATE - INTERVAL '3 days', location_mbutoh_id, vivo_y29_white_id, 24, 0, 0, 0, 3, 0),
    (CURRENT_DATE - INTERVAL '3 days', location_soko_id, samsung_a25_blue_id, 35, 0, 0, 0, 5, 0);
END $$;