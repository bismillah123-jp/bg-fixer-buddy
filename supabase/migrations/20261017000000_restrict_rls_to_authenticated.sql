-- SECURITY FIX (bug bounty #1, 2026-10-16)
-- Sebelumnya 4 tabel memakai policy USING (true) tanpa batasan role,
-- sehingga ANON/PUBLIC bisa SELECT/INSERT/UPDATE/DELETE penuh.
-- Migrasi ini mengembalikan policy ke authenticated-only.
-- Catatan: aplikasi selalu login dulu (App.tsx redirect ke /login),
-- dan edge functions memakai SERVICE_ROLE (bypass RLS), jadi tidak ada
-- alur legit yang rusak oleh perubahan ini.

-- stock_locations
DROP POLICY IF EXISTS "Allow all operations on stock locations" ON public.stock_locations;
DROP POLICY IF EXISTS "Authenticated users can manage stock locations" ON public.stock_locations;
CREATE POLICY "Authenticated users can manage stock locations"
ON public.stock_locations FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- phone_models
DROP POLICY IF EXISTS "Allow all operations on phone models" ON public.phone_models;
DROP POLICY IF EXISTS "Authenticated users can manage phone models" ON public.phone_models;
CREATE POLICY "Authenticated users can manage phone models"
ON public.phone_models FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- labels
DROP POLICY IF EXISTS "Allow all operations on labels" ON public.labels;
DROP POLICY IF EXISTS "Authenticated users can manage labels" ON public.labels;
CREATE POLICY "Authenticated users can manage labels"
ON public.labels FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- phone_colors
DROP POLICY IF EXISTS "Allow all operations on phone_colors" ON public.phone_colors;
DROP POLICY IF EXISTS "Authenticated users can manage phone_colors" ON public.phone_colors;
CREATE POLICY "Authenticated users can manage phone_colors"
ON public.phone_colors FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');
