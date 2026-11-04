import fs from 'node:fs';
import assert from 'node:assert';

console.log('--- Verifying Bottom Nav Category Drawer Changes ---');

const chromeCode = fs.readFileSync('src/StoreChrome.jsx', 'utf8');
const cssCode = fs.readFileSync('src/kintsugi.css', 'utf8');

// 1. Should not contain subcategories list inside mobile departments
assert(!chromeCode.includes('ks-mobile-sub-list'), 'Must not have ks-mobile-sub-list in StoreChrome.jsx');
assert(!chromeCode.includes('expandedMobileCat'), 'expandedMobileCat state should be removed');

// 2. Should render main categories list directly
assert(chromeCode.includes('ks-mobile-cats-list'), 'Must contain ks-mobile-cats-list');
assert(chromeCode.includes('ks-mobile-cat-item'), 'Must contain ks-mobile-cat-item');
assert(chromeCode.includes('browse(m.id, "Semua")'), 'Category click should navigate with browse(m.id, "Semua")');

// 3. Header and close button
assert(chromeCode.includes('ks-mobile-departments-header'), 'Must have header for category drawer');
assert(chromeCode.includes('ks-mobile-close-btn'), 'Must have close button for category drawer');

// 4. CSS styling
assert(cssCode.includes('.ks-mobile-cats-list'), 'CSS must define .ks-mobile-cats-list');
assert(cssCode.includes('.ks-mobile-cat-item'), 'CSS must define .ks-mobile-cat-item');
assert(!cssCode.includes('.ks-mobile-sub-list'), 'Old sub-list CSS should be removed');

console.log('✓ All bottom nav category drawer checks passed!');
