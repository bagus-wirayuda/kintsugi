import fs from 'node:fs';
import assert from 'node:assert';

console.log('--- Verifying Modern Footer Design & Content Integrity ---');

const chromeCode = fs.readFileSync('src/StoreChrome.jsx', 'utf8');
const cssCode = fs.readFileSync('src/kintsugi.css', 'utf8');

// 1. Content completeness in StoreChrome.jsx
const requiredPhrases = [
  'Kebijakan Privasi',
  'Informasi Pengiriman',
  'Informasi {brand}',
  'Panduan Belanja',
  'Syarat & Ketentuan',
  'Hubungi layanan pelanggan {brand}:',
  'mailto:${contact}',
  'Alamat toko: {storeAddress}',
  'Untuk pertanyaan pesanan, sertakan nomor pesanan Anda.',
  'Hak Cipta © 2026 {brand}. Semua hak dilindungi undang-undang.'
];

for (const phrase of requiredPhrases) {
  assert(chromeCode.includes(phrase), `Footer must contain "${phrase}"`);
}

// 2. Modern structural classes in StoreChrome.jsx
const structuralClasses = [
  'ks-footer-main',
  'ks-footer-brand-col',
  'ks-footer-nav-col',
  'ks-footer-contact-col',
  'ks-footer-bottom',
  'ks-footer-actions'
];

for (const cls of structuralClasses) {
  assert(chromeCode.includes(cls), `Footer must have structural class "${cls}"`);
}

// 3. CSS Modern Layout definitions
const requiredCssClasses = [
  '.ks-simple-footer',
  '.ks-footer-main',
  '.ks-footer-brand-col',
  '.ks-footer-nav-col',
  '.ks-footer-contact-col',
  '.ks-footer-bottom',
  '.ks-footer-actions',
  '.ks-footer-icon-btn',
  '.ks-footer-contact-card',
  '.ks-footer-address-card',
  '.ks-footer-trust-badge'
];

for (const cls of requiredCssClasses) {
  assert(cssCode.includes(cls), `CSS must define class "${cls}"`);
}

// 4. Gold top accent & responsive layout
assert(cssCode.includes('border-top: 3px solid var(--ks-gold)'), 'Footer must have luxury gold top accent');
assert(cssCode.includes('@media (max-width: 960px)'), 'Footer must have tablet responsive breakpoint');
assert(cssCode.includes('@media (max-width: 640px)'), 'Footer must have mobile responsive breakpoint');

console.log('✓ All Modern Footer verification checks passed successfully!');
