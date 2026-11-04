import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log("=== VERIFIKASI TAMPILAN VARIASI & WARNA PRODUK ===");

// 1. Periksa kintsugi.css
const kintsugiCss = fs.readFileSync(path.resolve('src/kintsugi.css'), 'utf8');

// Color choices & ks-variant-choice checks
assert(kintsugiCss.includes('.color-choices {'), ".color-choices harus terdefinisi di kintsugi.css");
assert(kintsugiCss.includes('flex-wrap: wrap !important;'), ".color-choices harus memiliki flex-wrap: wrap");
assert(kintsugiCss.includes('.ks-variant-choice {'), ".ks-variant-choice harus terdefinisi");
assert(kintsugiCss.includes('white-space: nowrap !important;'), ".ks-variant-choice harus memiliki white-space: nowrap");
assert(kintsugiCss.includes('min-width: max-content;'), ".ks-variant-choice harus memiliki min-width: max-content");
assert(kintsugiCss.includes('.ks-variant-choice.selected {'), "Indikator terpilih harus ada pada ks-variant-choice");

console.log("✓ kintsugi.css: Variasi warna/motif memiliki ukuran fleksibel, nowrap, dan flex-wrap.");

// Size choices checks
assert(kintsugiCss.includes('.size-choices.regular-sizes'), ".size-choices.regular-sizes harus terdefinisi");
assert(kintsugiCss.includes('.size-choices.has-dimensions'), ".size-choices.has-dimensions harus terdefinisi");
assert(kintsugiCss.includes('.text-size-btn'), ".text-size-btn harus terdefinisi");

console.log("✓ kintsugi.css: Pilihan ukuran konsisten untuk ukuran teks bebas maupun dimensi fisik.");

// 2. Periksa styles.css
const stylesCss = fs.readFileSync(path.resolve('src/styles.css'), 'utf8');
assert(!stylesCss.includes('width: 25px;\n  border: 1px solid #d5d9cd;'), "styles.css tidak boleh memaksa button variasi ke width 25px");
assert(!stylesCss.includes('width: 41px;\n  height: 36px;'), "styles.css tidak boleh memaksa size button ke width 41px");
assert(stylesCss.includes('overflow-x: hidden;'), "product-dialog dan detail-info harus terlindungi dari overflow-x");

console.log("✓ styles.css: Batasan lebar kaku (25px dan 41px) berhasil dihilangkan.");

// 3. Periksa main.jsx
const mainJsx = fs.readFileSync(path.resolve('src/main.jsx'), 'utf8');
assert(mainJsx.includes('className={"ks-variant-choice " + (color === c ? "selected" : "") + (isHex ? " is-hex" : " is-text")}'), "main.jsx harus membedakan is-hex dan is-text");
assert(mainJsx.includes('className={"size-choices " + (detail.sizes.some((value) => parseDimensions(value)) ? "has-dimensions" : "regular-sizes")}'), "main.jsx harus menandai has-dimensions vs regular-sizes");

console.log("✓ main.jsx: Variasi teks, motif, dan ukuran terstruktur dengan class yang tepat.");

console.log("=== SEMUA PENGUJIAN TAMPILAN VARIASI PRODUK LOLOS (PASSED) ===");
