-- CLEANUP (17 Okt 2026): perbaiki model HP yang RAM/ROM-nya nyangkut di nama.
--
-- Masalah: ada model seperti "SMART 20 4/256" — "4/256" ditulis langsung di
-- judul/nama model, kolom storage_capacity kosong atau tidak valid.
-- Akibatnya data berantakan & susah difilter.
--
-- Migrasi ini, per model yang bermasalah:
--   1. Ekstrak RAM/ROM dari nama (mis. "SMART 20 4/256" -> nama "SMART 20", ROM "4/256")
--   2. Kalau model yang SUDAH BENAR (nama bersih + kolom RAM/ROM terisi) sudah ada
--      -> pindahkan seluruh stok (events & entries) ke model itu, hapus model jelek
--   3. Kalau belum ada -> perbaiki model itu langsung (nama dibersihkan, kolom diisi)
--
-- Idempotent: model yang sudah benar tidak disentuh.

DO $$
DECLARE
  bad RECORD;
  target_id UUID;
  clean_name TEXT;
  storage TEXT;
  m TEXT[];
  moved_events INT;
  moved_entries INT;
  fixed_count INT := 0;
  merged_count INT := 0;
  skipped_count INT := 0;
BEGIN
  FOR bad IN
    SELECT id, brand, model, storage_capacity, color
    FROM phone_models
    WHERE (
        storage_capacity IS NULL
        OR TRIM(storage_capacity) = ''
        OR TRIM(storage_capacity) !~ '^\d+\s*/\s*\d+$'
      )
      AND model ~ '\d+\s*/\s*\d+'
    ORDER BY brand, model
  LOOP
    -- Ambil pola angka/angka pertama dari nama sebagai RAM/ROM
    m := regexp_match(bad.model, '(\d+)\s*/\s*(\d+)');
    IF m IS NULL THEN
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;
    storage := m[1] || '/' || m[2];

    -- Bersihkan nama: buang semua kemunculan pola angka/angka, rapikan spasi
    clean_name := regexp_replace(bad.model, '\s*\d+\s*/\s*\d+', ' ', 'g');
    clean_name := TRIM(regexp_replace(clean_name, '\s+', ' ', 'g'));

    IF clean_name = '' OR clean_name IS NULL THEN
      RAISE NOTICE 'SKIP: "%" (%) -> nama kosong setelah dibersihkan', bad.model, bad.brand;
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    -- Cari model yang sudah benar (brand case-insensitive, storage dinormalisasi)
    SELECT pm.id INTO target_id
    FROM phone_models pm
    WHERE pm.id <> bad.id
      AND pm.brand ILIKE bad.brand
      AND pm.model = clean_name
      AND pm.storage_capacity IS NOT NULL
      AND regexp_replace(TRIM(pm.storage_capacity), '\s+', '', 'g') = storage
    LIMIT 1;

    IF target_id IS NOT NULL THEN
      -- MERGE: pindahkan stok ke model yang benar
      -- (trigger cascade otomatis menghitung ulang entries via ON CONFLICT)
      UPDATE stock_events SET phone_model_id = target_id WHERE phone_model_id = bad.id;
      GET DIAGNOSTICS moved_events = ROW_COUNT;
      DELETE FROM stock_entries WHERE phone_model_id = bad.id;
      GET DIAGNOSTICS moved_entries = ROW_COUNT;
      DELETE FROM phone_models WHERE id = bad.id;
      merged_count := merged_count + 1;
      RAISE NOTICE 'MERGE: "%" (%) -> digabung (% events dipindah, % entries lama dibersihkan)',
        bad.model, bad.brand, moved_events, moved_entries;
    ELSE
      -- FIX IN PLACE: perbaiki nama & isi kolom storage
      BEGIN
        UPDATE phone_models
        SET model = clean_name,
            storage_capacity = storage,
            updated_at = NOW()
        WHERE id = bad.id;
        fixed_count := fixed_count + 1;
        RAISE NOTICE 'FIX: "%" (%) -> "%" [%]', bad.model, bad.brand, clean_name, storage;
      EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'SKIP (duplikat): "%" (%) -> "%" [%] sudah ada (beda huruf besar/kecil?)',
          bad.model, bad.brand, clean_name, storage;
        skipped_count := skipped_count + 1;
      END;
    END IF;
  END LOOP;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Selesai: % diperbaiki, % digabung, % dilewati', fixed_count, merged_count, skipped_count;
END $$;

-- Laporan sisa: model yang masih bermasalah (kalau ada, perlu tindakan manual)
SELECT brand, model AS nama_model_bermasalah, storage_capacity AS kolom_rom_saat_ini
FROM phone_models
WHERE (storage_capacity IS NULL OR TRIM(storage_capacity) = '' OR TRIM(storage_capacity) !~ '^\d+\s*/\s*\d+$')
ORDER BY brand, model;
