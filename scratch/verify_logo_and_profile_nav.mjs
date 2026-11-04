import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log("=== VERIFIKASI PERBAIKAN LOGO & NAVIGASI PROFIL ===");

// 1. Periksa Brand.jsx
const brandContent = fs.readFileSync(path.resolve('src/Brand.jsx'), 'utf8');
assert(brandContent.includes('const DEFAULT_LOGO = "/brand/kintsugi-logo-transparent-v2.png"'), "DEFAULT_LOGO harus didefinisikan");
assert(brandContent.includes('resolvedSrc = src && typeof src === "string" && src.trim() !== "" ? src.trim() : DEFAULT_LOGO'), "resolvedSrc harus fallback dengan aman");
assert(brandContent.includes('onError='), "Brand harus memiliki onError fallback");
console.log("✓ Brand.jsx: Validasi fallback logo lengkap & aman.");

// 2. Periksa StoreChrome.jsx
const storeChromeContent = fs.readFileSync(path.resolve('src/StoreChrome.jsx'), 'utf8');
assert(!storeChromeContent.includes('ks-profile-menu'), "StoreChrome tidak boleh lagi memiliki elemen popup ks-profile-menu");
assert(!storeChromeContent.includes('profileOpen'), "StoreChrome tidak boleh lagi memiliki state profileOpen");
assert(storeChromeContent.includes('handleProfileClick'), "StoreChrome harus memiliki handleProfileClick");
assert(storeChromeContent.includes('nav(user ? "account/profile" : "account")'), "handleProfileClick harus mengarahkan langsung ke account/profile saat login, atau account saat belum login");
console.log("✓ StoreChrome.jsx: Popup menu profil dihilangkan, navigasi langsung berhasil diterapkan.");

// 3. Periksa kintsugi.css
const cssContent = fs.readFileSync(path.resolve('src/kintsugi.css'), 'utf8');
assert(!cssContent.includes('.ks-profile-menu'), "kintsugi.css tidak boleh lagi berisi rule .ks-profile-menu");
console.log("✓ kintsugi.css: Clean up styling popup profil berhasil.");

// 4. Periksa Auth.jsx
const authContent = fs.readFileSync(path.resolve('src/Auth.jsx'), 'utf8');
assert(authContent.includes('<StoreHeader config={config}'), "Auth.jsx harus meneruskan config ke StoreHeader");
assert(!/[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}]/u.test(authContent), "Auth.jsx tidak boleh mengandung emoji visual");
console.log("✓ Auth.jsx: StoreHeader menerima config dan tidak ada emoji.");

console.log("=== SEMUA PENGUJIAN BERHASIL (PASSED) ===");
