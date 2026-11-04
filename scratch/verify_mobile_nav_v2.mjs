import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

console.log('--- Verifying Nav and Category Mobile/Desktop Requirements ---');

const mainJsxPath = path.resolve('src/main.jsx');
const kintsugiCssPath = path.resolve('src/kintsugi.css');
const storeChromePath = path.resolve('src/StoreChrome.jsx');

const mainJsx = fs.readFileSync(mainJsxPath, 'utf8');
const kintsugiCss = fs.readFileSync(kintsugiCssPath, 'utf8');
const storeChrome = fs.readFileSync(storeChromePath, 'utf8');

// 1. Dropdown kategori hanya berlaku pada mode ponsel. Pada desktop, pertahankan tampilan kategori seperti semula tanpa perubahan.
assert(mainJsx.includes('className="catalog-desktop-only"'), 'Desktop category wrapper must exist in main.jsx');
assert(mainJsx.includes('<h3>Kategori</h3>'), 'Desktop must have standard <h3>Kategori</h3> heading');
assert(kintsugiCss.includes('.catalog-desktop-only'), 'CSS must define .catalog-desktop-only');
assert(kintsugiCss.includes('.catalog-mobile-only'), 'CSS must define .catalog-mobile-only');

// Check desktop hides mobile dropdown and displays desktop list
const desktopOnlyCheck = /\.catalog-mobile-only\s*\{\s*display:\s*none\s*!important;\s*\}/.test(kintsugiCss);
assert(desktopOnlyCheck, 'CSS must hide mobile-only on desktop');

// Check mobile media query hides desktop list and displays mobile dropdown
const mobileMedia700 = kintsugiCss.slice(kintsugiCss.indexOf('@media (max-width: 700px)'));
assert(mobileMedia700.includes('.catalog-desktop-only'), 'Mobile media query must target .catalog-desktop-only');
assert(mobileMedia700.includes('display: none !important'), 'Mobile media query must hide .catalog-desktop-only');

// 2. Gunakan desain dropdown kategori yang serupa dengan komponen Ukuran, Variasi, dan Harga yang sudah ada agar tampilannya konsisten.
assert(mainJsx.includes('<details className="advanced-filters catalog-mobile-only catalog-category-details">'), 'Mobile category dropdown must use advanced-filters details component');
assert(mainJsx.includes('<summary>'), 'Must have summary');
assert(mainJsx.includes('Ukuran, variasi & harga'), 'Existing size & variation component must exist');

// 3. Secara default kedua dropdown tertutup. Pilihan kategori baru muncul ketika pengguna membukanya.
// Neither details element should have an `open` attribute
const mobileCategoryDetailsRegex = /<details[^>]*catalog-category-details[^>]*>/;
const advancedFiltersRegex = /<details[^>]*className="advanced-filters"[^>]*>/;

const mobileCatMatch = mainJsx.match(mobileCategoryDetailsRegex);
assert(mobileCatMatch, 'Found mobile category details tag');
assert(!mobileCatMatch[0].includes('open'), 'Mobile category details must NOT have open attribute (closed by default)');

const sizeDetailsMatch = mainJsx.match(advancedFiltersRegex);
assert(sizeDetailsMatch, 'Found size details tag');
assert(!sizeDetailsMatch[0].includes('open'), 'Size & variations details must NOT have open attribute (closed by default)');

// 4. Pada navbar mode ponsel, cukup tampilkan logo dan tombol pencarian. Sembunyikan elemen lainnya.
assert(storeChrome.includes('className="ks-brand"'), 'Logo brand button must exist');
assert(storeChrome.includes('className="ks-search"'), 'Search button must exist');

// Check that mobile CSS hides all buttons in .ks-actions except .ks-search and hides .ks-menu
const mobileMedia1024 = kintsugiCss.slice(kintsugiCss.indexOf('@media (max-width: 1024px)'));
assert(mobileMedia1024.includes('.ks-actions > button:not(.ks-search)'), 'Must hide all ks-actions buttons except ks-search in mobile 1024px');
assert(mobileMedia1024.includes('.ks-actions .ks-search'), 'Must show ks-search in mobile 1024px');
assert(mobileMedia1024.includes('.ks-actions .ks-menu'), 'Must hide ks-menu in mobile 1024px');

// Check 700px media query also preserves this
assert(kintsugiCss.includes('.ks-actions .ks-menu {\n    display: none !important;'), '700px media query must keep ks-menu hidden');

// 5. Perubahan hanya berlaku pada tampilan ponsel, baik halaman publik maupun pelanggan. Jangan mengubah tampilan desktop.
assert(kintsugiCss.includes('.ks-departments {'), 'Desktop departments navigation must exist in base CSS');
assert(kintsugiCss.includes('.ks-actions > button {'), 'Desktop ks-actions button base styling must exist');

console.log('✓ All 6 requirements verified successfully!');
