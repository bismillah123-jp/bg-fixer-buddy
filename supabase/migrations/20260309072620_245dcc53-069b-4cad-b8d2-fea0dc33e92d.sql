
CREATE TABLE public.phone_colors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  hex_color text NOT NULL DEFAULT '#6B7280',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.phone_colors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on phone_colors" ON public.phone_colors FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.phone_colors (name, hex_color) VALUES
  ('Hitam', '#1F2937'),
  ('Putih', '#F9FAFB'),
  ('Biru', '#3B82F6'),
  ('Biru Muda', '#60A5FA'),
  ('Biru Tua', '#1E3A8A'),
  ('Hijau', '#22C55E'),
  ('Hijau Tua', '#166534'),
  ('Merah', '#EF4444'),
  ('Merah Maroon', '#991B1B'),
  ('Kuning', '#EAB308'),
  ('Emas/Gold', '#D4A017'),
  ('Ungu', '#8B5CF6'),
  ('Pink', '#EC4899'),
  ('Abu-abu', '#6B7280'),
  ('Silver', '#C0C0C0'),
  ('Coklat', '#92400E'),
  ('Orange', '#F97316'),
  ('Cream', '#FEF3C7'),
  ('Rose Gold', '#E8B4B8'),
  ('Midnight Blue', '#191970'),
  ('Forest Green', '#228B22'),
  ('Lavender', '#E6E6FA'),
  ('Teal', '#14B8A6'),
  ('Bronze', '#CD7F32')
ON CONFLICT (name) DO NOTHING;
