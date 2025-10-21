# Migration ke Neon DB

## Opsi 1: Tetap Gunakan Supabase Client (Recommended)

### Langkah-langkah:

1. **Buka Supabase Dashboard**
   - Login ke https://supabase.com
   - Pilih project yang ada

2. **Update Database Settings**
   - Pergi ke Settings → Database
   - Ganti connection details dengan Neon DB credentials:

```
Host: ep-fragrant-night-a1vimis8-pooler.ap-southeast-1.aws.neon.tech
Database: neondb
User: neondb_owner
Password: npg_yvdbr2AMNOm4
SSL Mode: require
```

3. **Migrate Schema**
   - Jalankan semua migration SQL yang ada di folder `supabase/migrations/`
   - Pastikan semua tabel dan functions terbuat dengan benar

4. **Update Environment Variables**
   - Update SUPABASE_URL dan SUPABASE_ANON_KEY di dashboard
   - Atau buat project baru di Supabase dengan Neon DB sebagai backend

## Opsi 2: Langsung ke Neon DB (Advanced)

Jika ingin menggunakan Neon DB langsung tanpa Supabase client:

### Langkah-langkah:

1. **Install PostgreSQL Client**
```bash
npm install pg @types/pg
```

2. **Buat Database Client Baru**
```typescript
// src/integrations/database/client.ts
import { Pool } from 'pg';

const pool = new Pool({
  host: 'ep-fragrant-night-a1vimis8-pooler.ap-southeast-1.aws.neon.tech',
  database: 'neondb',
  user: 'neondb_owner',
  password: 'npg_yvdbr2AMNOm4',
  ssl: { rejectUnauthorized: false },
  port: 5432,
});

export default pool;
```

3. **Update Semua Komponen**
   - Ganti semua `supabase.from()` dengan query PostgreSQL langsung
   - Implement authentication sendiri
   - Handle real-time subscriptions sendiri

## Rekomendasi

**Gunakan Opsi 1** karena:
- ✅ Lebih mudah (tidak perlu ubah kode)
- ✅ Tetap bisa pakai Supabase features (auth, real-time, etc.)
- ✅ Migration lebih cepat
- ✅ Tidak perlu refactor semua komponen

**Opsi 2** hanya jika:
- ❌ Ingin full control atas database
- ❌ Tidak perlu Supabase features
- ❌ Siap untuk refactor besar-besaran
