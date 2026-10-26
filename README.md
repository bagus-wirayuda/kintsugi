# Liny Jaya

Website toko fashion dengan React 19 + Vite, Node.js + Express 5, dan PostgreSQL. Beranda editorial, navigasi Wanita/Pria/Anak/Bayi, katalog, pencarian, filter, pengurutan, detail produk, varian, wishlist, keranjang, voucher, checkout simulasi, akun, pesanan, pembatalan, dan panel admin.

Referensi publik: https://www.uniqlo.com/id/id/. Implementasi ini mengikuti pola pengalaman toko fashion dan menggunakan identitas Liny Jaya, foto stok Unsplash, produk dan data dummy. Ini bukan salinan kode, aset merek, sistem internal, atau reproduksi pixel-perfect UNIQLO. Teknologi internal UNIQLO tidak dapat dipastikan dari halaman publik.

## Menjalankan pratinjau

Memerlukan Node.js 22.12+ (direkomendasikan 24 LTS).

```powershell
npm.cmd ci
npm.cmd run dev
```

Buka URL yang dicetak Vite (biasanya http://127.0.0.1:5173). Default adalah **mode demo browser**: akun, keranjang, wishlist, dan pesanan disimpan di localStorage. Password demo tidak disimpan; login demo menerima email dummy dan password minimal 8 karakter. Panel admin hanya tersedia pada mode API. Tidak ada pembayaran atau email nyata.

## Menjalankan PostgreSQL + API

1. Pasang PostgreSQL 17 atau Docker Desktop. Jika PostgreSQL sudah ada, buat database dan user, lalu gunakan URL koneksi Anda.
2. Untuk Docker, jalankan `docker compose up -d postgres`.
3. Salin `.env.example` ke `.env`. Sesuaikan `DATABASE_URL`, `ADMIN_EMAIL`, dan `ADMIN_PASSWORD`. Gunakan password admin unik minimal 16 karakter. Default contoh hanya untuk development lokal.
4. Tambahkan `VITE_DATA_MODE=api` ke `.env`.
5. Jalankan `npm.cmd run db:init`. Ini membuat skema dan mengisi 32 produk serta varian ukuran/warna. Seed idempotent dan tidak mereset stok atau kata sandi akun yang sudah ada.
6. Jalankan `npm.cmd run server` pada terminal pertama dan `npm.cmd run dev` pada terminal kedua. Buka Vite di http://127.0.0.1:5173. Request `/api` diteruskan ke backend port 3001.
7. Daftar sebagai pelanggan, atau masuk menggunakan akun admin dari `.env`. Panel admin tersedia di footer serta halaman akun admin.

Untuk build yang disajikan langsung oleh Express:

```powershell
npm.cmd run build
npm.cmd run server
```

Buka http://127.0.0.1:3001. Build harus dilakukan setelah `VITE_DATA_MODE=api` ditetapkan karena Vite memasukkan konfigurasi ke bundle saat build.

## Database

Skema ada di `database/schema.sql`: `users`, `sessions`, `products`, `product_variants`, `orders`, `order_items`. Dapat dikelola dengan pgAdmin, DBeaver, atau klien PostgreSQL lain.

Checkout memakai transaksi dan row lock per varian, menggabungkan item duplikat, membaca harga dari database, memvalidasi voucher dan alamat di server, serta menolak stok yang tidak mencukupi. Pembatalan menggunakan row lock pesanan dan mengembalikan stok satu kali. Pelanggan hanya dapat membaca dan membatalkan pesanan sendiri yang belum diproses. Stok pada tampilan katalog merupakan nilai minimum seluruh varian; admin mengubah stok untuk semua varian sebuah produk.

Sesi menggunakan token acak, hash SHA-256 pada database, cookie HttpOnly + SameSite Strict, masa berlaku 7 hari, dan pencabutan saat logout. Kata sandi menggunakan bcrypt. Endpoint admin memeriksa role server. SQL menggunakan parameter; input menggunakan Zod; API mempunyai rate limit dan pemeriksaan origin.

## Fitur demo

- 32 produk dummy (8 per departemen), pilihan warna/ukuran, ulasan dummy.
- Voucher `LINY10`: diskon 10%, maksimal Rp100.000.
- Reguler Rp15.000, ekspres Rp35.000, pickup gratis.
- Gratis ongkir ketika subtotal sebelum diskon minimal Rp699.000.
- Virtual account dan COD adalah simulasi; tidak membuat tagihan.
- Kebijakan toko, alamat, stok awal, formulir newsletter, dan informasi perusahaan adalah dummy.
- Foto stok Unsplash disertakan di `public/images`; font Google Fonts memakai fallback sistem jika jaringan tidak tersedia. Sumber foto ada di `assetSources` dalam `src/data.js`.

## Verifikasi

```powershell
npm.cmd test
npm.cmd run build
```

Tes unit aturan commerce dan tes integrasi API menggunakan PGlite (mesin PostgreSQL dalam WASM) tanpa instalasi database sistem. Cakupan: skema SQL, register/login/logout, session cookie, otorisasi admin, isolasi pesanan, harga otoritatif, diskon, stok, rollback transaksi, pembatalan idempotent, dan transisi status. PGlite adalah koneksi tunggal; pengujian ini tidak menggantikan uji beban/konkurensi terhadap server PostgreSQL produksi.

## Hosting dan batas implementasi

Pratinjau Sites menayangkan bundle statis dalam mode demo browser. Backend Express dan PostgreSQL disertakan sebagai source untuk dijalankan pada server yang mendukung Node.js serta koneksi PostgreSQL; pratinjau statis tidak terhubung ke database server. Sites tidak menjalankan proses Express atau container PostgreSQL.

Ini toko dengan satu operator seperti referensi, bukan platform multi-penjual. Belum ada seller onboarding, komisi, payment gateway nyata, webhook pembayaran, integrasi kurir/resi, pengiriman email, reset password, upload foto admin, atau sinkronisasi keranjang/wishlist lintas perangkat. Admin dapat melihat semua pesanan, mengubah status yang valid, menambah produk beserta varian, mengedit nama/harga/stok, mengarsipkan produk, dan mengaktifkan kembali arsip. Arsip mempertahankan referensi riwayat pesanan. Foto kategori bayi/anak dan variasi beberapa produk masih memakai gambar stok placeholder.

Sebelum dipakai untuk transaksi nyata, hubungkan payment gateway, kurir, layanan email, tambahkan verifikasi email/reset password, ganti semua konten dummy dan kredensial, serta lakukan pengujian PostgreSQL multi-koneksi. Backend lokal mendengarkan loopback; untuk server produksi gunakan konfigurasi bind/proxy yang sesuai, HTTPS dan `NODE_ENV=production` agar cookie Secure aktif. Jangan memublikasikan `.env`.
