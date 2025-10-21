-- Function to create a snapshot of the previous day's night stock as the current day's morning stock
CREATE OR REPLACE FUNCTION handle_daily_stock_snapshot()
RETURNS void AS $$
DECLARE
    previous_day_entry record;
BEGIN
    FOR previous_day_entry IN
        SELECT *
        FROM public.stock_entries
        WHERE date = (current_date - interval '1 day')
    LOOP
        -- Check if an entry for the current date and same item already exists
        IF NOT EXISTS (
            SELECT 1
            FROM public.stock_entries
            WHERE date = current_date
            AND location_id = previous_day_entry.location_id
            AND phone_model_id = previous_day_entry.phone_model_id
            AND imei IS NOT DISTINCT FROM previous_day_entry.imei
        ) THEN
            -- If no entry exists, create a new one with the morning stock set to the previous day's night stock
            INSERT INTO public.stock_entries (
                date,
                location_id,
                phone_model_id,
                imei,
                morning_stock,
                night_stock,
                incoming,
                add_stock,
                returns,
                sold,
                adjustment,
                notes
            )
            VALUES (
                current_date,
                previous_day_entry.location_id,
                previous_day_entry.phone_model_id,
                previous_day_entry.imei,
                previous_day_entry.night_stock, -- Set morning_stock from previous night_stock
                0, -- Will be calculated later
                0,
                0,
                0,
                0,
                0,
                'Auto-generated from previous day''s stock'
            );
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Schedule the function to run every day at 00:00 WIB (17:00 UTC)
-- Supabase uses UTC time, so 00:00 WIB is 17:00 UTC the previous day.
-- We run it at 17:00 UTC which is 00:00 in Jakarta
SELECT cron.schedule(
    'daily-stock-snapshot',
    '0 17 * * *', -- 00:00 WIB is 17:00 UTC of the previous day
    $$
    SELECT handle_daily_stock_snapshot();
    $$
);

-- Also, let's create a function to calculate night_stock automatically
CREATE OR REPLACE FUNCTION update_night_stock()
RETURNS TRIGGER AS $$
BEGIN
    NEW.night_stock = NEW.morning_stock + NEW.incoming + NEW.add_stock - NEW.sold + NEW.adjustment + NEW.returns;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to run the function before insert or update
CREATE TRIGGER stock_entry_update_night_stock
BEFORE INSERT OR UPDATE ON public.stock_entries
FOR EACH ROW
EXECUTE FUNCTION update_night_stock();
