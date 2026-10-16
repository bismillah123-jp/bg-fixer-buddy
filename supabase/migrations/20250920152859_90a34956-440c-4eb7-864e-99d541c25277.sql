-- Fix RLS policy for phone_models table to allow all operations
DROP POLICY IF EXISTS "Authenticated users can manage phone models" ON public.phone_models;
DROP POLICY IF EXISTS "Authenticated users can view phone models" ON public.phone_models;

-- Create new policy that allows all operations for all users
CREATE POLICY "Allow all operations on phone models" 
ON public.phone_models 
FOR ALL 
USING (true)
WITH CHECK (true);