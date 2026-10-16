-- Allow public access to stock_locations for now since authentication is not implemented
-- Remove existing policies first
DROP POLICY IF EXISTS "Authenticated users can manage stock locations" ON stock_locations;
DROP POLICY IF EXISTS "Authenticated users can view stock locations" ON stock_locations;

-- Create new policies that allow all operations
CREATE POLICY "Allow all operations on stock locations" 
ON stock_locations 
FOR ALL 
USING (true) 
WITH CHECK (true);