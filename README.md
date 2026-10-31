# Liny Jaya

Toko fashion satu pengelola: React + Vite, Express, **MySQL 8 Laragon**, Xendit Payment Link dan WhatsApp Wablas. Nama yang dipakai Liny Jaya. Katalog dan aturan toko saat ini untuk pengujian.

## Menjalankan

Aktifkan MySQL di Laragon. Apache tidak diperlukan. Gunakan Node 22.12+ (komputer ini: Node 24).

~~~powershell
npm.cmd ci
# Hanya jika .env belum ada:
Copy-Item .env.example .env
npm.cmd run db:init
npm.cmd start
~~~

Buka **http://localhost:3001**. Kredensial integrasi yang diberikan sudah disimpan di .env lokal, diabaikan Git. Jangan menaruh API key dalam variabel VITE_. Seed idempotent dan tidak mereset stok/password/data yang sudah ada.

Untuk pemakaian berikutnya, cukup aktifkan MySQL Laragon lalu jalankan **npm.cmd start** dari folder proyek. Perintah ini otomatis membuat build terbaru dan menjalankan backend beserta tampilan di http://localhost:3001. Biarkan terminal tetap terbuka; Ctrl+C menghentikan toko. Membuka Laragon saja belum menjalankan aplikasi Node.

Untuk development, cukup satu terminal: **npm.cmd run dev**. Perintah ini menyalakan backend, menunggu koneksi MySQL siap, lalu membuka frontend di http://127.0.0.1:5173. Jika backend proyek sudah aktif, proses itu digunakan kembali. Atur APP_URL sesuai URL yang dipakai agar redirect Xendit kembali dengan benar. **npm.cmd run preview** juga menjalankan toko lengkap seperti npm start. Perintah dev:frontend hanya untuk penggunaan lanjutan saat backend sudah dijalankan terpisah.

Jika muncul pesan backend belum terhubung: hentikan terminal lama dengan Ctrl+C, pastikan MySQL Laragon aktif, jalankan npm.cmd start, lalu buka URL http://localhost:3001 yang dicetak di terminal. Jangan membuka index.html langsung atau memakai Live Server untuk aplikasi ini. Jika tabel/database belum ada, jalankan npm.cmd run db:init terlebih dahulu.

Jika muncul **Port 3001 sudah digunakan**, sudah ada proses lain di port itu. Coba buka http://localhost:3001 terlebih dahulu. Untuk memulai ulang toko di terminal Anda sendiri, tekan Ctrl+C pada terminal toko lama lalu jalankan npm.cmd start lagi. Tidak perlu menjalankan npm start beberapa kali; satu proses sudah menyajikan frontend dan backend. Peringatan bundle Vite di atas 500 kB bukan kegagalan build.

## Akun lokal siap pakai

| Peran | Email | Password |
|---|---|---|
| Admin | admin@linyjaya.test | AdminLinyJaya2026! |
| Pelanggan | pelanggan@linyjaya.test | BelanjaLiny2026! |

Pelanggan masuk melalui #account; admin dapat masuk melalui #admin. Setelah masuk sebagai admin, semua navigasi diarahkan ke panel operasional. Admin tidak memiliki keranjang, favorit, atau checkout dan API menolak pembuatan pesanan oleh admin.

## Database Laragon

Klik **Database** di Laragon untuk membuka HeidiSQL:

| Pengaturan | Nilai |
|---|---|
| Jenis | MySQL TCP/IP |
| Host | 127.0.0.1 |
| Port | 3306 |
| User | root |
| Password | kosong (konfigurasi Laragon lokal) |
| Database | **liny_jaya** |

Tabel: users, sessions, products, product_variants, orders, order_items, payment_events, email_outbox, newsletter_subscribers, auth_challenges, customer_profiles. Skema: database/schema.sql. Database ini terpisah dari database Laragon lain; tidak ada migrasi data PostgreSQL lama.

Password disimpan sebagai bcrypt; token sesi hanya sebagai hash SHA-256. Cookie HttpOnly, SameSite Lax (agar redirect Xendit tetap membawa sesi), umur 7 hari dan dicabut saat logout. Endpoint mutasi memeriksa origin; endpoint admin memeriksa role server.

## Katalog, keranjang dan checkout

GET /api/products memfilter di SQL: search, gender, category, size, color, min, max, sort (recommended/low/high/rating), page dan pageSize. Respons: items, total, page, pageSize, pages, facets. Filter ukuran+warna memeriksa kombinasi varian yang sama. Detail GET /api/products/:id menyediakan stok setiap kombinasi; produk arsip/tidak ada menghasilkan 404.

Keranjang dan wishlist tersimpan **per akun per browser**. Tamu memiliki penyimpanan sendiri; saat masuk sebagai pelanggan, keranjang dan favorit tamu dipindahkan ke akun tersebut, lalu penyimpanan tamu dikosongkan. Akun admin tidak menerima keranjang/favorit tamu. Logout mempertahankan milik akun untuk dipulihkan saat login kembali. Tidak ada sinkronisasi lintas perangkat. Produk arsip disembunyikan dari wishlist.

Checkout meminta quote dari server. Server memvalidasi ulang harga, stok, varian, alamat dan voucher; menggabungkan varian duplikat; mengunci stok; menyimpan pesanan/item dalam satu transaksi InnoDB. checkoutKey mencegah submit ulang menggandakan reservasi. Harga/nama pesanan adalah snapshot, tetap tersedia setelah produk diedit/diarsipkan.

Aturan uji:
- LINY10: diskon 10%, maksimal Rp100.000, tanpa minimum belanja.
- Reguler Rp15.000, ekspres Rp35.000, pengambilan pesanan gratis.
- Gratis ongkir mulai subtotal Rp699.000 sebelum diskon.
- Lokasi pengambilan dikoordinasikan dengan pengelola; tidak ada alamat toko fiktif.
- Foto referensi disediakan lokal di public/images; sumber di src/data.js. Produk/rating merupakan contoh.
- Kontak memakai alamat email yang diberikan pemilik. Isi katalog produksi, alamat fisik, SLA dan kebijakan penukaran final perlu ditetapkan sebelum transaksi nyata.

## Pembayaran Xendit

Integrasi memakai **hosted Payment Link / Invoice**, POST /v2/invoices. Pengunjung memilih channel di halaman Xendit. Webhook yang dipakai adalah **Invoice**, bukan payload QR standalone qr.payment.

1. Pesanan mereservasi stok dan memakai ID pesanan sebagai external_id.
2. Pembayaran CREATING → PENDING setelah invoice tersimpan. Timeout mempertahankan reservasi; retry mencari referensi invoice sama sebelum membuat ulang. Penolakan definitif menandai FAILED dan mengembalikan stok.
3. Masa bayar default 3600 detik, melalui INVOICE_DURATION.
4. PAID/SETTLED yang diverifikasi mengubah pembayaran menjadi PAID dan pesanan Diproses.
5. EXPIRED/FAILED mengembalikan stok satu kali. Pembatalan meminta expire ke Xendit terlebih dahulu, baru menandai CANCELLED.
6. Pesanan lunas tidak dapat dibatalkan karena refund otomatis di luar scope.
7. Admin hanya dapat Diproses → Dikirim → Selesai. Tidak ada fungsi admin atau tombol browser untuk memaksa lunas.\n8. Setelah alamat dan quote valid, checkout otomatis mengarahkan pelanggan ke halaman pembayaran Xendit. Halaman pesanan memeriksa ulang pembayaran ke Xendit setelah pelanggan kembali. Admin memakai endpoint pemeriksaan khusus /api/admin/orders/:id/payment.

Webhook memeriksa x-callback-token secara konstan, invoice ID, external_id, currency IDR, amount dan paid_amount, lalu mengonfirmasi status lewat API Xendit. Event berulang idempotent. Worker tiap menit serta tombol Periksa status pembayaran merekonsiliasi status ke Xendit.

### Penggunaan lokal

Endpoint **POST /api/webhooks/xendit** sudah tersedia. Pengguna memilih lokal dahulu; Xendit tidak dapat mengirim callback ke localhost. Rekonsiliasi server tetap bekerja. Pengujian webhook lokal menggunakan callback yang diperiksa terhadap Xendit; belum membuktikan pengiriman callback dari internet.

Jika sudah memiliki domain/server HTTPS, atur APP_URL dan callback Invoice dashboard Xendit ke https://DOMAIN/api/webhooks/xendit. Aktifkan notifikasi invoice kedaluwarsa dan gunakan token sama di XENDIT_WEBHOOK_TOKEN. Untuk live diperlukan key production dan channel aktif.

Rujukan: [request Invoice](https://github.com/xendit/xendit-node/blob/master/docs/invoice/CreateInvoiceRequest.md), [callback Invoice](https://github.com/xendit/xendit-node/blob/master/docs/invoice/InvoiceCallback.md), [pengujian sandbox](https://help.xendit.co/hc/en-us/articles/4406696409357-How-can-I-simulate-payment-using-invoice-on-test-mode).

## WhatsApp Wablas

Seluruh notifikasi dan validasi dikirim melalui WhatsApp menggunakan gateway Wablas:
- Pesanan dibuat, pembayaran diterima, serta pembaruan status pesanan masuk ke antrean `wa_outbox`.
- Kode OTP untuk pendaftaran akun, masuk dengan OTP, serta reset kata sandi dikirim langsung secara instan melalui WhatsApp menggunakan Wablas API (`https://smg.wablas.com/api/send-message`).
- Otentikasi Wablas menggunakan format header `Authorization: TOKEN.SECRET_KEY`.
- Nomor telepon otomatis dinormalisasi ke format internasional (contoh: `08...` diubah menjadi `628...`).
- Worker background memproses antrean `wa_outbox` secara periodik dengan mekanisme retry hingga 8 kali dan jeda 30 menit. Panel admin menampilkan status pengiriman pesan WhatsApp.

## Verifikasi

~~~powershell
npm.cmd test
npm.cmd run build
~~~

Tes integrasi memakai **MySQL Laragon nyata**, membuat database liny_jaya_test_TIMESTAMP terpisah dan menghapus hanya database tes tersebut. Cakupan: autentikasi/hash/expiry/logout, CSRF, role, isolasi pesanan, filter SQL/pagination/detail, harga otoritatif, rollback, oversell bersamaan, idempotensi checkout, webhook palsu/duplikat, expiry/pembatalan, stok per varian, metadata/admin/arsip/snapshot, serta outbox email.

scripts/smoke-integrations.mjs membuat satu invoice **test** dan email pengujian ke STORE_CONTACT_EMAIL. Jalankan hanya jika ingin membuat pengujian baru. Bukti lokal: artifacts/integration-smoke.json (diabaikan Git). Tidak ada endpoint bypass pembayaran pada aplikasi.

## Admin dan batas penggunaan

Admin dapat menambah produk dengan kombinasi ukuran/warna, mengedit SKU/kategori/departemen/deskripsi/harga/gambar, mengedit stok per kombinasi, arsip/aktifkan produk, memeriksa pembayaran dan memproses pengiriman. Gambar menerima /images/ lokal atau images.unsplash.com sesuai CSP. Varian lama dipertahankan untuk riwayat/pengembalian stok.

Hasil siap untuk **pengujian lokal dengan Laragon**. Pengiriman webhook publik, key live, kredensial WhatsApp Wablas yang aktif, data/kebijakan toko produksi serta hosting HTTPS perlu konfigurasi sebelum transaksi pelanggan nyata. Verifikasi nomor WhatsApp pendaftaran melalui OTP, masuk menggunakan OTP WhatsApp, reset password melalui OTP WhatsApp, dan penggantian kata sandi sudah disediakan. Upload foto, kurir/resi dan refund otomatis tidak termasuk implementasi.

Untuk hosting Node: build, MySQL dengan user aplikasi khusus, NODE_ENV=production, APP_URL HTTPS, HOST sesuai jaringan dan TRUST_PROXY=1 hanya di belakang reverse proxy tepercaya. Tidak ada deployment Sites statis pada pekerjaan lokal ini.

## Tata letak baru dan OTP pendaftaran

Beranda memakai layout baru. Katalog dan detail produk mempertahankan referensi toko fashion. Akun pelanggan, keranjang, favorit, checkout, serta panel admin memiliki layout tersendiri tanpa header promosi, footer belanja, atau newsletter. Admin memakai sidebar operasional, ringkasan, tabel produk/stok, detail pesanan dan status layanan.

POST /api/auth/register mengembalikan 202 dan challengeId, **belum membuat user atau sesi**. POST /api/auth/otp/verify baru membuat akun pelanggan setelah kode benar. OTP 6 digit dihasilkan secara kriptografis, disimpan sebagai hash bcrypt, berlaku 10 menit, hanya sekali pakai, maksimal 5 percobaan, dan kirim ulang memiliki jeda 60 detik. Kegagalan pengiriman tidak membuat akun. Jangan mengubah jalur pendaftaran menjadi login langsung.

OTP selalu dikirim langsung ke alamat yang dimasukkan pengguna, tanpa dialihkan dan tanpa pembatasan RESEND_ALLOWED_TO. Resend dengan onboarding@resend.dev hanya menerima email pemilik akun Resend; jika ditolak, akun belum dibuat dan error ditampilkan. Akun contoh .test tetap dapat login menggunakan password. Untuk mengirim OTP ke semua pelanggan, pengelola perlu memasang alamat pengirim dari domain Resend terverifikasi. Key yang diberikan hanya mengizinkan pengiriman, sehingga daftar domain tidak dapat dibaca menggunakan key itu.

Kata sandi baru pada reset memerlukan kode OTP. Mengganti atau mereset kata sandi mencabut sesi sebelumnya. Profil/alamat tersimpan di customer_profiles dan otomatis ditawarkan saat checkout.

Bukti pengujian aktual tersimpan lokal di artifacts/otp-live-verification.json dan artifacts/payment-flow-verification.json. scripts/verify-otp-live.mjs mengirim satu OTP sungguhan ke email uji pada database tes terpisah; kode tidak dicetak. scripts/verify-payment-flow.mjs membuat lalu membatalkan invoice Xendit development, memeriksa total/idempotensi, penolakan checkout admin, dan pengembalian stok. Jangan jalankan skrip tersebut berulang tanpa kebutuhan. Pengujian browser otomatis pada rombakan ini terhenti karena alat tidak dapat memastikan URL browser; build dan pengujian API berhasil, tetapi tampilan belum diverifikasi otomatis di browser.

## Mengaktifkan OTP ke semua email penerima

Email `to` mengikuti alamat pendaftar; email `from` harus identitas pengirim toko yang diizinkan Resend. Pengirim `onboarding@resend.dev` hanya untuk alamat pemilik akun Resend. Mengganti email penerima atau membuat API key baru tidak menghilangkan batas pengirim uji ini.

Tambahkan domain milik pengelola di dashboard Resend, pasang record DNS yang diminta, tunggu status Verified, lalu isi RESEND_FROM dengan alamat dari domain tersebut. API key harus diizinkan mengirim dari domain yang sama. Jangan mengisi RESEND_FROM dengan email pendaftar. Setelah konfigurasi benar, restart backend dan uji pendaftaran dengan dua inbox yang berbeda.

Key yang tersedia pada pengerjaan hanya mengizinkan pengiriman; permintaan daftar domain ditolak dengan restricted_api_key. Domain/alamat pengirim terverifikasi masih perlu diberikan pengelola. Tidak ada fallback OTP lokal, kode tetap, atau pembuatan akun tanpa verifikasi.

Rujukan resmi: https://resend.com/docs/knowledge-base/403-error-resend-dev-domain

Untuk mendiagnosis penerima yang sudah mengizinkan email uji, jalankan `node --env-file=.env scripts/diagnose-email.mjs --to email-penerima`. Skrip melakukan satu permintaan kirim sungguhan tanpa membuat akun, lalu menyimpan status dan respons Resend di artifacts/resend-delivery-TIMESTAMP.json. API key dan kode uji tidak dicetak. Opsi `--from` dapat dipakai untuk menguji pengirim terverifikasi sebelum mengubah konfigurasi toko. Respons API membedakan penolakan pengirim uji, domain belum terverifikasi, izin key, dan batas pengiriman melalui kode EMAIL_ yang sesuai.
