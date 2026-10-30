export function policy(title, contact) {
  const policies = {
    "Cerita kami":
      "Kintsugi menyediakan sprei dan tekstil kamar untuk kebutuhan dewasa, hotel & guest, anak, serta bayi. Temukan pilihan ukuran kasur dan warna yang sesuai dengan ruang istirahat Anda.",
    "Kualitas & material":
      "Baca deskripsi produk dan ikuti label perawatan pada barang. Hubungi layanan pelanggan untuk informasi bahan, warna, dan ukuran sebelum memesan.",
    Keberlanjutan:
      "Informasi sertifikasi dan sumber bahan belum dipublikasikan. Hubungi pengelola untuk pertanyaan mengenai produk tertentu.",
    "Temukan toko":
      "Belum ada alamat toko fisik yang dipublikasikan. Untuk pengambilan pesanan, koordinasikan lokasi dengan pengelola melalui " +
      contact +
      ".",
    "Panduan belanja":
      "Pilih produk dan tentukan warna serta ukuran kasur. Gunakan Tambah Keranjang untuk mengumpulkan pilihan atau Beli Langsung untuk checkout produk tersebut. Anda dapat berbelanja sebagai tamu; verifikasi akun hanya diminta sebelum pembayaran. Pilih metode pembayaran, lalu ikuti petunjuk pembayaran. Keranjang dan favorit tersimpan di browser ini.",
    Pengiriman:
      "Pengiriman reguler Rp15.000, ekspres Rp35.000, dan pengambilan pesanan gratis. Gratis ongkir mulai subtotal Rp699.000 sebelum diskon. Estimasi reguler 2–4 dan ekspres 1–2 hari kerja. Hubungi layanan pelanggan untuk memastikan jangkauan pengiriman.",
    "Penukaran & pengembalian":
      "Hubungi pengelola dengan nomor pesanan dan kondisi barang untuk permintaan penukaran. Persetujuan dan biaya ditentukan setelah pemeriksaan. Pembatalan mandiri tersedia sebelum pembayaran; refund otomatis belum tersedia.",
    "Hubungi kami":
      "Layanan pelanggan Kintsugi: " +
      contact +
      ". Sertakan nomor pesanan jika pertanyaan berkaitan dengan pembelian.",
    "Kebijakan privasi":
      "Nama, nomor WhatsApp, email, dan alamat digunakan untuk verifikasi akun, notifikasi, dan pemenuhan pesanan. Kata sandi disimpan dalam bentuk terlindungi. Pembayaran dan pengiriman notifikasi melibatkan penyedia layanan terkait. Keranjang dan favorit disimpan di browser per akun. Hubungi " +
      contact +
      " untuk permintaan terkait data.",
    "Syarat & ketentuan":
      "Harga ditampilkan dalam Rupiah. Harga, stok, voucher, dan ongkos pengiriman diperiksa saat checkout. Pesanan dinyatakan lunas setelah pembayaran dikonfirmasi. Stok dikembalikan bila pembayaran gagal, kedaluwarsa, atau pembatalan dikonfirmasi. Hubungi layanan pelanggan untuk bantuan terkait pesanan.",
  };
  return policies[title] || policies["Panduan belanja"];
}
