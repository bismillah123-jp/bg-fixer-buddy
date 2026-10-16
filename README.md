# BG Fixer Buddy — Sistem Manajemen Stok Konter HP

Aplikasi web untuk mengelola stok HP konter (multi-cabang): tracking per IMEI, stok harian
pagi → malam, transfer antar lokasi, import data, analitik, sampai AI chat untuk tanya-jawab
stok. Backend memakai Supabase (Postgres + Auth + Realtime + Edge Functions).

## Fitur

- **Dashboard stok** — ringkasan stok per lokasi, per brand/model, per hari
- **Tracking IMEI** — setiap unit tercatat: masuk, laku, retur, transfer, koreksi + riwayat per IMEI
- **Stok harian** — stok pagi, barang masuk, terjual, retur, penyesuaian → stok malam otomatis
- **Transfer antar cabang** — pindah stok antar lokasi dengan pencatatan event
- **Barcode/QR scanner** — scan IMEI langsung dari kamera HP
- **Import data** — CSV (lihat `data/contoh-import.csv` untuk format) & import teks
- **Analitik** — grafik penjualan & stok (recharts)
- **AI Chat** — tanya jawab soal stok via edge function `stock-ai`; aksi admin (tambah/ubah data)
  hanya dieksekusi setelah dikonfirmasi di UI
- **REST API eksternal** — edge function `stock-api` (auth via header `x-api-key`), lihat
  [API_DOCUMENTATION.md](API_DOCUMENTATION.md)
- **Rollover harian** — edge function `daily-rollover` menggulirkan stok malam → stok pagi hari berikutnya
- **Event sourcing** — `stock_events` (immutable, source of truth) → trigger `cascade_recalc`
  membangun ulang `stock_entries`; detail di [EVENT_SOURCING_IMPLEMENTATION.md](EVENT_SOURCING_IMPLEMENTATION.md)
- **PWA** — bisa di-install di HP (manifest + service worker)

## Tech Stack

| Lapisan   | Teknologi                                      |
|-----------|------------------------------------------------|
| Frontend  | Vite 5, React 18, TypeScript, shadcn/ui, Tailwind CSS |
| State/Data| TanStack React Query, Supabase Realtime         |
| Backend   | Supabase (Postgres, Auth, Edge Functions/Deno)  |
| Lainnya   | react-router-dom, react-hook-form + zod, papaparse, html5-qrcode, recharts |

## Cara Jalan (Development)

**Syarat:** Node.js 18+ (atau Bun), akun & project Supabase.

```bash
# 1. Install dependencies
npm install        # atau: bun install

# 2. Siapkan environment — JANGAN commit file ini!
cp .env.example .env
# lalu isi VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, dsb.

# 3. Jalankan database migrations
#    via Supabase Dashboard > SQL Editor, atau: supabase db push
#    (file migrasi ada di supabase/migrations/)

# 4. Jalankan dev server
npm run dev
```

| Script          | Keterangan                          |
|-----------------|-------------------------------------|
| `npm run dev`   | Dev server (Vite)                   |
| `npm run build` | Build production ke `dist/`         |
| `npm run preview` | Preview hasil build               |
| `npm run lint`  | ESLint                              |

> **Deploy:** set environment variables di dashboard hosting (Vercel/Netlify/dll.),
> jangan upload file `.env` ke mana pun.

## Struktur Project

```
src/
├── components/        # Komponen UI (dialog, tabel, dashboard, dsb.)
│   └── ui/            # Komponen shadcn/ui (jangan diubah manual)
├── pages/             # Login, Index (dashboard), Settings, Callback
├── hooks/             # useLabels, usePhoneColors, useRealtimeSubscription, ...
├── integrations/supabase/  # Client + tipe database Supabase
└── lib/               # Utils & helper tanggal
supabase/
├── functions/         # Edge Functions: stock-api, stock-ai, daily-rollover
└── migrations/        # Migrasi database resmi
sql/                   # Script SQL utilitas / perbaikan manual (arsip)
data/                  # Contoh CSV import & hasil export
```

## Keamanan

- File `.env` **tidak boleh** di-commit (sudah di-`.gitignore`). Kalau key pernah bocor,
  rotasi di Supabase Dashboard > Project Settings > API.
- API eksternal memakai `x-api-key` — simpan key di secret, jangan di dokumen publik.
- Aksi AI (`stock-ai`) memakai allowlist kolom per tabel + konfirmasi user sebelum eksekusi.

## Dokumentasi Tambahan

- [API_DOCUMENTATION.md](API_DOCUMENTATION.md) — dokumentasi REST API eksternal
- [EVENT_SOURCING_IMPLEMENTATION.md](EVENT_SOURCING_IMPLEMENTATION.md) — arsitektur event sourcing
- [NEON_SETUP_GUIDE.md](NEON_SETUP_GUIDE.md) / [NEON_DB_MIGRATION.md](NEON_DB_MIGRATION.md) — panduan migrasi Neon
- [FINAL_IMPLEMENTATION.md](FINAL_IMPLEMENTATION.md), [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) — ringkasan implementasi
