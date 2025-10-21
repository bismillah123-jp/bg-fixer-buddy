CREATE OR REPLACE FUNCTION public.bulk_insert_stock(entries jsonb[])
RETURNS void AS $$
DECLARE
    entry jsonb;
BEGIN
    FOREACH entry IN ARRAY entries
    LOOP
        INSERT INTO stock_entries (
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
            night_stock,
            notes
        ) VALUES (
            (entry->>'date')::date,
            (entry->>'location_id')::uuid,
            (entry->>'phone_model_id')::uuid,
            entry->>'imei',
            COALESCE((entry->>'morning_stock')::integer, 0),
            COALESCE((entry->>'incoming')::integer, 0),
            COALESCE((entry->>'add_stock')::integer, 0),
            COALESCE((entry->>'returns')::integer, 0),
            COALESCE((entry->>'sold')::integer, 0),
            COALESCE((entry->>'adjustment')::integer, 0),
            COALESCE((entry->>'night_stock')::integer, 0),
            entry->>'notes'
        )
        ON CONFLICT (date, location_id, phone_model_id, imei) 
        DO UPDATE SET
            morning_stock = EXCLUDED.morning_stock,
            incoming = EXCLUDED.incoming,
            add_stock = EXCLUDED.add_stock,
            returns = EXCLUDED.returns,
            sold = EXCLUDED.sold,
            adjustment = EXCLUDED.adjustment,
            night_stock = EXCLUDED.night_stock,
            notes = EXCLUDED.notes,
            updated_at = now();
    END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.update_brand_name(old_brand_name text, new_brand_name text)
RETURNS void AS $$
BEGIN
    UPDATE phone_models 
    SET brand = new_brand_name 
    WHERE brand = old_brand_name;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.delete_brand(brand_name text)
RETURNS void AS $$
BEGIN
    DELETE FROM phone_models WHERE brand = brand_name;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.reset_all_data()
RETURNS void AS $$
BEGIN
    -- Disable foreign key checks temporarily
    SET session_replication_role = replica;
    
    -- Delete all data
    DELETE FROM stock_entries WHERE id IS NOT NULL;
    DELETE FROM stock_events WHERE id IS NOT NULL;
    DELETE FROM phone_models WHERE id IS NOT NULL;
    DELETE FROM stock_locations WHERE name NOT IN ('SOKO', 'MBUTOH');
    
    -- Re-enable foreign key checks
    SET session_replication_role = DEFAULT;
END;
$$ LANGUAGE plpgsql;
