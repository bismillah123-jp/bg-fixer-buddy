
-- Create labels table
CREATE TABLE public.labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT '#6B7280',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;

-- Allow all operations
CREATE POLICY "Allow all operations on labels"
ON public.labels FOR ALL
USING (true)
WITH CHECK (true);

-- Seed common labels
INSERT INTO public.labels (name, color) VALUES
  ('Repack', '#EF4444'),
  ('Second', '#F59E0B'),
  ('Baru', '#22C55E'),
  ('Demo', '#3B82F6'),
  ('Rusak', '#DC2626');
