-- STOKTAKIP PRO — MİGRASYON SQL (Supabase SQL Editor'de çalıştırın)

-- Eski boş tabloları kaldır
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;

-- Kategoriler tablosunu oluştur
CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    icon text,
    color text,
    created_at timestamptz DEFAULT now()
);

-- Ürünler tablosunu oluştur
CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
    category_name text,                 -- Mevcut tip categoryName tutuyor; geçişte kolaylık
    barcode text,                       -- EAN/UPC ya da iç kod (STK########)
    stock integer NOT NULL DEFAULT 0,
    min_stock integer NOT NULL DEFAULT 0,
    purchase_price numeric(15,2) NOT NULL DEFAULT 0,
    sale_price numeric(15,2) NOT NULL DEFAULT 0,
    description text DEFAULT '',
    created_at timestamptz DEFAULT now()
);

-- Barkod benzersiz (boş/null olanlar hariç)
CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_unique
    ON public.products (barcode) WHERE barcode IS NOT NULL AND barcode <> '';

-- Kategori indeksi
CREATE INDEX IF NOT EXISTS products_category_idx ON public.products (category_id);

-- İç barkod (Code128) sıra üreteci
CREATE SEQUENCE IF NOT EXISTS public.internal_barcode_seq START 1;
CREATE OR REPLACE FUNCTION public.next_internal_barcode()
RETURNS text AS $$
    SELECT 'STK' || lpad(nextval('public.internal_barcode_seq')::text, 9, '0');
$$ LANGUAGE sql;

-- RLS (Satır Bazlı Güvenlik) Politikaları
-- Uygulama anonim (anon) anahtarı kullandığı için erişim rolünü TO public (veya TO anon, authenticated) yapıyoruz.
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "all_public_categories" ON public.categories FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "all_public_products"   ON public.products   FOR ALL TO public USING (true) WITH CHECK (true);
