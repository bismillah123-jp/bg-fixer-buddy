-- Script untuk menambahkan model HP yang hilang ke database
-- Berdasarkan data dari CSV export

-- Insert missing phone models
INSERT INTO phone_models (brand, model, storage_capacity, color) VALUES 
-- OPPO Models
('OPPO', 'A3', '8/128GB', 'Black'),
('OPPO', 'A5I', '4/128GB', 'Black'),
('OPPO', 'A5I', '4/64GB', 'Black'),
('OPPO', 'A5I PRO', '8/128GB', 'Black'),
('OPPO', 'A6 PRO', '8/256GB', 'Black'),

-- REALME Models
('REALME', 'C71', '8/128GB', 'Black'),
('REALME', 'C71', '4/128GB', 'Black'),
('REALME', 'Note 60X', '4/64GB', 'Black'),
('REALME', 'Note 70', '4/128GB', 'Black'),

-- VIVO Models
('VIVO', 'V60 LITE', '8/256GB', 'Black'),
('VIVO', 'Y19s', '4/128GB', 'Black'),
('VIVO', 'Y19s', '6/128GB', 'Black'),
('VIVO', 'Y29', '6/128GB', 'Black'),

-- SAMSUNG Models (yang belum ada)
('SAMSUNG', 'A06 5G', '4/64GB', 'Black'),
('SAMSUNG', 'A07', '4/64GB', 'Black'),

-- XIAOMI Models
('XIAOMI', 'REDMI 15C', '6/128GB', 'Black'),
('XIAOMI', 'POCO C85', '6/128GB', 'Black'),
('XIAOMI', 'Redmi A5', '4/128GB', 'Black'),
('XIAOMI', 'Note 14 5G', '8/256GB', 'Black'),
('XIAOMI', 'POCO M7 PRO 5G', '8/128GB', 'Black'),
('XIAOMI', 'Redmi 13', '8/128GB', 'Black'),
('XIAOMI', 'Redmi 15', '8/128GB', 'Black'),
('XIAOMI', 'POCO C71', '4/128GB', 'Black'),
('XIAOMI', 'Redmi Note 14', '8/128GB', 'Black'),
('XIAOMI', 'Redmi Note 14', '8/256GB', 'Black'),
('XIAOMI', 'POCO X7', '12/512GB', 'Black'),
('XIAOMI', 'POCO M7', '8/128GB', 'Black'),

-- INFINIX Models
('INFINIX', 'HOT 60I', '6/128GB', 'Black'),
('INFINIX', 'HOT 60I', '8/256GB', 'Black'),
('INFINIX', 'HOT 60 PRO', '8/256GB', 'Black'),
('INFINIX', 'Smart 10', '4/128GB', 'Black'),
('INFINIX', 'Smart 10', '4/64GB', 'Black'),
('INFINIX', 'HOT 60 PRO+', '8/256GB', 'Black'),

-- TECNO Models
('TECNO', 'Pova 7', '8/128GB', 'Black'),
('TECNO', 'Pova 7', '8/256GB', 'Black'),

-- ITEL Models
('ITEL', 'A90', '4/64GB', 'Black'),

-- ZTE Models
('ZTE', 'NUBIA A36', '4/64GB', 'Black')

ON CONFLICT (brand, model, storage_capacity, color) DO NOTHING;

-- Verify the models were added
SELECT 
  brand, 
  model, 
  storage_capacity, 
  color,
  'Added Successfully' as status
FROM phone_models 
WHERE brand IN ('OPPO', 'REALME', 'VIVO', 'SAMSUNG', 'XIAOMI', 'INFINIX', 'TECNO', 'ITEL', 'ZTE')
ORDER BY brand, model, storage_capacity;

