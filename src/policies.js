export function policy(title, contact) {
  const policies = {
    "Cerita kami":
      "Liny Jaya adalah toko fashion dengan satu pengelola untuk koleksi Wanita, Pria, Anak dan Bayi. Katalog saat ini memakai data contoh untuk pengujian.",
    "Kualitas & material":
      "Baca deskripsi masing-masing produk dan ikuti label perawatan pada barang. Foto katalog adalah foto referensi; komposisi material perlu dikonfirmasi sebelum transaksi produksi.",
    Keberlanjutan:
      "Informasi sertifikasi dan sumber bahan belum dipublikasikan. Hubungi pengelola untuk pertanyaan mengenai produk tertentu.",
    "Temukan toko":
      "Belum ada alamat toko fisik yang dipublikasikan. Untuk pengambilan pesanan, koordinasikan lokasi dengan pengelola melalui " +
      contact +
      ".",
    "Panduan belanja":
      "Pilih departemen dan produk, tentukan warna serta ukuran, lalu tambahkan ke keranjang. Masuk ke akun, isi alamat dan selesaikan pembayaran di Xendit. Pantau status melalui Akun saya. Keranjang dan wishlist tersimpan terpisah per akun di browser ini; favorit yang diarsipkan disembunyikan.",
    Pengiriman:
      "Aturan uji toko: reguler Rp15.000, ekspres Rp35.000, pengambilan pesanan gratis. Gratis ongkir mulai subtotal Rp699.000 sebelum diskon. Estimasi reguler 2–4 dan ekspres 1–2 hari kerja, perlu konfirmasi pengelola sebelum pengiriman sebenarnya.",
    "Penukaran & pengembalian":
      "Hubungi pengelola dengan nomor pesanan dan kondisi barang untuk permintaan penukaran. Persetujuan dan biaya ditentukan setelah pemeriksaan. Pembatalan mandiri tersedia sebelum pembayaran; refund otomatis belum tersedia.",
    "Hubungi kami":
      "Layanan pelanggan Liny Jaya: " +
      contact +
      ". Sertakan nomor pesanan jika pertanyaan berkaitan dengan pembelian.",
    "Kebijakan privasi":
      "Nama, email dan alamat digunakan untuk akun serta pemenuhan pesanan. Kata sandi disimpan sebagai hash, sesi memakai cookie HttpOnly. Data pembayaran diproses oleh Xendit dan notifikasi email oleh Resend. Keranjang dan wishlist disimpan di browser dengan kunci terpisah per akun. Hubungi " +
      contact +
      " untuk permintaan terkait data.",
    "Syarat & ketentuan":
      "Harga ditampilkan dalam Rupiah. Voucher uji LINY10 memberi diskon 10% maksimal Rp100.000 tanpa minimum belanja. Harga dan stok diperiksa ulang oleh server saat checkout. Pesanan lunas hanya setelah konfirmasi Xendit; stok dikembalikan satu kali bila pembayaran gagal, kedaluwarsa atau pembatalan dikonfirmasi. Situs saat ini memakai katalog dummy dan Xendit mode pengujian.",
  };
  return policies[title] || policies["Panduan belanja"];
}
