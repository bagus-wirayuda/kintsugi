import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log("=== PENGUJIAN SECTION BERANDA KOSONG (TANPA FALLBACK DUMMY) ===");

// 1. Periksa Home.jsx
const homeContent = fs.readFileSync(path.resolve('src/Home.jsx'), 'utf8');

// Pastikan tidak ada fallback dummy SLEEP ESSENTIALS ketika homeSections kosong
assert(!homeContent.includes('config.essentialsKicker || "SLEEP ESSENTIALS"'), "Home.jsx tidak boleh fallback ke SLEEP ESSENTIALS");
assert(!homeContent.includes('products.slice(0, 4)'), "Home.jsx tidak boleh otomatis menginjeksi 4 produk ketika section kosong");

// Pastikan homeSections diset ke [] jika kosong
assert(homeContent.includes('const homeSections = Array.isArray(config.homeSections)'), "Home.jsx harus membaca config.homeSections");
assert(homeContent.includes('if (sectionProducts.length === 0) return null;'), "Home.jsx harus skip section yang produknya 0");

console.log("✓ Home.jsx: Ketika homeSections kosong [], tampilan publik bersih dari dummy section.");

// 2. Periksa Admin.jsx
const adminContent = fs.readFileSync(path.resolve('src/Admin.jsx'), 'utf8');

// Pastikan currentHomeSections di Admin.jsx tidak fallback ke dummy
assert(!adminContent.includes('settings?.essentialsKicker || "SLEEP ESSENTIALS"'), "Admin.jsx tidak boleh fallback ke SLEEP ESSENTIALS");
assert(adminContent.includes('clearAllSections'), "Admin.jsx harus memiliki fungsi clearAllSections");
assert(adminContent.includes('Tidak ada section produk di beranda'), "Admin.jsx harus menampilkan status kosong jika section dikosongkan");

console.log("✓ Admin.jsx: Mendukung pengosongan penuh dan tidak mengembalikan default dummy.");

console.log("=== SEMUA PENGUJIAN PENGOSONGAN BERANDA BERHASIL (PASSED) ===");
