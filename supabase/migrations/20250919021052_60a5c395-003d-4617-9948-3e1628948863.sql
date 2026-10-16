-- Insert sample locations (without address since column doesn't exist)
INSERT INTO stock_locations (name) VALUES 
('Toko Utama'),
('Cabang Selatan'),
('Cabang Utara')
ON CONFLICT (name) DO NOTHING;

-- Insert sample phone models
INSERT INTO phone_models (brand, model, storage_capacity, color) VALUES 
('Samsung', 'Galaxy A54', '128GB', 'Black'),
('Samsung', 'Galaxy A54', '128GB', 'White'), 
('Samsung', 'Galaxy A34', '128GB', 'Purple'),
('Xiaomi', 'Redmi Note 12', '128GB', 'Blue'),
('Xiaomi', 'Redmi Note 12', '256GB', 'Black'),
('iPhone', '14', '128GB', 'Blue'),
('iPhone', '14', '256GB', 'Black'),
('Vivo', 'V27', '128GB', 'Gold'),
('Oppo', 'Reno 8', '128GB', 'Green')
ON CONFLICT (brand, model, storage_capacity, color) DO NOTHING;

-- Insert sample stock entries for today
INSERT INTO stock_entries (
    date, 
    location_id, 
    phone_model_id, 
    morning_stock, 
    night_stock, 
    incoming, 
    add_stock, 
    returns, 
    sold, 
    adjustment
)
SELECT 
    CURRENT_DATE,
    sl.id,
    pm.id,
    FLOOR(RANDOM() * 10 + 5)::integer, -- morning_stock (5-14)
    FLOOR(RANDOM() * 8 + 2)::integer,  -- night_stock (2-9)
    FLOOR(RANDOM() * 5)::integer,      -- incoming (0-4)
    FLOOR(RANDOM() * 3)::integer,      -- add_stock (0-2)
    FLOOR(RANDOM() * 2)::integer,      -- returns (0-1)
    FLOOR(RANDOM() * 6 + 1)::integer,  -- sold (1-6)
    0                                   -- adjustment
FROM stock_locations sl
CROSS JOIN phone_models pm
WHERE sl.name IN ('Toko Utama', 'Cabang Selatan')
AND pm.brand IN ('Samsung', 'Xiaomi', 'iPhone')
LIMIT 15;