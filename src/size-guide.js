import { dimensionValue, parseDimensions } from "./dimensions.js";

const APPAREL_ORDER = [
  "XXS",
  "XS",
  "S",
  "S-M",
  "M",
  "M-L",
  "L",
  "L-XL",
  "XL",
  "XXL",
  "XXXL",
  "ALL SIZE",
  "ALL SIZE (FIT TO L)",
];

const BEDDING_NAMED_ORDER = ["BABY", "STANDAR", "SINGLE", "QUEEN", "KING", "SUPER KING"];

/**
 * Normalizes a size token so minor separator or casing differences match reliably.
 * Handles dimension separators (e.g. `160x200x30` vs `160×200×30`).
 */
export function normalizeSizeToken(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const parts = raw.split(/[×xX]/).map((part) => Number(part.trim()));
  if (
    parts.length === 3 &&
    parts.every((part) => Number.isInteger(part) && part >= 1 && part <= 500)
  ) {
    return dimensionValue(parts[0], parts[1], parts[2]);
  }
  if (
    parts.length === 2 &&
    parts.every((part) => Number.isInteger(part) && part >= 1 && part <= 500)
  ) {
    return `${parts[0]}×${parts[1]}`;
  }
  return raw;
}

/**
 * Checks whether two size labels represent the same physical size.
 */
export function sizesMatch(a, b) {
  const na = normalizeSizeToken(a).toUpperCase();
  const nb = normalizeSizeToken(b).toUpperCase();
  if (!na || !nb) return false;
  if (na === nb) return true;
  const da = parseDimensions(a);
  const db = parseDimensions(b);
  return Boolean(
    da &&
      db &&
      da.length === db.length &&
      da.width === db.width &&
      da.height === db.height,
  );
}

/**
 * Returns candidate size strings to query MySQL safely regardless of `x` vs `×`.
 */
export function sizeQueryCandidates(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  const candidates = new Set([raw]);
  const normalized = normalizeSizeToken(raw);
  if (normalized) candidates.add(normalized);
  const parts = raw.split(/[×xX]/).map((part) => Number(part.trim()));
  if (parts.length === 3 && parts.every((n) => Number.isInteger(n) && n >= 1 && n <= 500)) {
    candidates.add(`${parts[0]}×${parts[1]}×${parts[2]}`);
    candidates.add(`${parts[0]}x${parts[1]}x${parts[2]}`);
  } else if (parts.length === 2 && parts.every((n) => Number.isInteger(n) && n >= 1 && n <= 500)) {
    candidates.add(`${parts[0]}×${parts[1]}`);
    candidates.add(`${parts[0]}x${parts[1]}`);
    candidates.add(`${parts[0]}×${parts[1]}×30`);
    candidates.add(`${parts[0]}x${parts[1]}x30`);
  }
  return [...candidates];
}

function sizeSortRank(size) {
  const token = String(size ?? "").trim();
  const upper = token.toUpperCase();

  const apparelIdx = APPAREL_ORDER.indexOf(upper);
  if (apparelIdx >= 0) return { group: 0, primary: apparelIdx, secondary: 0, label: upper };

  const numeric = Number(token);
  if (/^\d{2,3}$/.test(token) && Number.isFinite(numeric)) {
    return { group: 1, primary: numeric, secondary: 0, label: upper };
  }

  const beddingNamedIdx = BEDDING_NAMED_ORDER.indexOf(upper);
  if (beddingNamedIdx >= 0) {
    return { group: 2, primary: beddingNamedIdx, secondary: 0, label: upper };
  }

  const dims = parseDimensions(token);
  if (dims) {
    return {
      group: 3,
      primary: dims.length,
      secondary: dims.width * 1000 + dims.height,
      label: upper,
    };
  }

  return { group: 4, primary: 0, secondary: 0, label: upper };
}

/**
 * Sorts an array of size labels logically (S..XXL, 28..36, Bedding dimensions, etc.).
 */
export function sortCategorySizes(sizes = []) {
  return [...new Set((sizes || []).filter(Boolean))].sort((a, b) => {
    const ra = sizeSortRank(a);
    const rb = sizeSortRank(b);
    if (ra.group !== rb.group) return ra.group - rb.group;
    if (ra.primary !== rb.primary) return ra.primary - rb.primary;
    if (ra.secondary !== rb.secondary) return ra.secondary - rb.secondary;
    return ra.label.localeCompare(rb.label, undefined, { numeric: true });
  });
}

/**
 * Determines which size-guide category (`fashion` or `bedding`) should open
 * given the currently viewed product and active catalog category.
 */
export function detectSizeGuideCategory(product = null, activeCategory = "Semua") {
  const cat = String(product?.category || activeCategory || "").toLowerCase();
  const sub = String(product?.subcategory || "").toLowerCase();
  if (cat.includes("fashion") || sub.includes("fashion")) return "fashion";
  if (cat.includes("bedding") || cat.includes("seprai") || sub.includes("bedding")) {
    return "bedding";
  }

  const sizes = Array.isArray(product?.sizes) ? product.sizes : [];
  if (sizes.some((s) => /^(xxs|xs|s|m|l|xl|xxl|xxxl|all size|s-m|l-xl|\d{2})$/i.test(String(s).trim()))) {
    return "fashion";
  }
  return "bedding";
}

/**
 * Detects which Fashion chart section matches the active product.
 */
export function detectFashionSubgroup(product = null) {
  const sub = String(product?.subcategory || "").toLowerCase();
  if (sub.includes("celana")) return "bottoms";
  if (sub.includes("lounge")) return "lounge";
  const sizes = Array.isArray(product?.sizes) ? product.sizes : [];
  if (sizes.length && sizes.every((s) => /^\d{2}$/.test(String(s).trim()))) return "bottoms";
  if (sizes.some((s) => /all size|s-m|l-xl/i.test(String(s)))) return "lounge";
  return "tops";
}

export const BEDDING_MATTRESS_GUIDE = [
  { size: "90×200×30", alias: "Single Small", width: "90 cm", length: "200 cm", height: "20–30 cm" },
  { size: "100×200×30", alias: "Single Standard", width: "100 cm", length: "200 cm", height: "20–30 cm" },
  { size: "120×200×30", alias: "Super Single / Twin", width: "120 cm", length: "200 cm", height: "25–35 cm" },
  { size: "160×200×30", alias: "Queen", width: "160 cm", length: "200 cm", height: "30–35 cm" },
  { size: "180×200×30", alias: "King", width: "180 cm", length: "200 cm", height: "30–35 cm" },
  { size: "200×200×30", alias: "Super King", width: "200 cm", length: "200 cm", height: "30–35 cm" },
];

export const BEDDING_ACCESSORY_GUIDE = [
  { size: "Baby", category: "Bayi / Boks", dim: "60×120 cm / 70×140 cm", note: "Tinggi kasur 10–15 cm" },
  { size: "Standar", category: "Bantal & Guling", dim: "Bantal 50×70 cm · Guling 35×95 cm", note: "Ukuran bantal tidur standar hotel" },
  { size: "King", category: "Bantal & Guling", dim: "Bantal 51×76 cm · Guling 38×100 cm", note: "Ideal untuk kasur Queen/King" },
  { size: "150×200", category: "Selimut / Quilt", dim: "150 × 200 cm", note: "Nyaman untuk 1 orang (Single–Twin)" },
  { size: "180×200", category: "Selimut / Quilt", dim: "180 × 200 cm", note: "Ideal untuk kasur Queen (160×200)" },
  { size: "200×220", category: "Selimut / Quilt", dim: "200 × 220 cm", note: "Pas untuk kasur King & Super King" },
];

export const FASHION_TOPS_GUIDE = [
  { size: "S", chest: "96 – 100 cm", shoulder: "43 cm", length: "66 – 68 cm", weightHint: "± 48 – 57 kg" },
  { size: "M", chest: "102 – 106 cm", shoulder: "45 cm", length: "69 – 71 cm", weightHint: "± 58 – 67 kg" },
  { size: "L", chest: "108 – 112 cm", shoulder: "47 cm", length: "72 – 74 cm", weightHint: "± 68 – 77 kg" },
  { size: "XL", chest: "114 – 118 cm", shoulder: "49 cm", length: "75 – 77 cm", weightHint: "± 78 – 87 kg" },
  { size: "XXL", chest: "120 – 124 cm", shoulder: "51 cm", length: "78 – 80 cm", weightHint: "± 88 – 98 kg" },
];

export const FASHION_BOTTOMS_GUIDE = [
  { size: "28", waist: "72 – 74 cm", hip: "92 cm", length: "98 cm", fit: "Setara S" },
  { size: "30", waist: "77 – 79 cm", hip: "97 cm", length: "99 cm", fit: "Setara M" },
  { size: "32", waist: "82 – 84 cm", hip: "102 cm", length: "101 cm", fit: "Setara L" },
  { size: "34", waist: "87 – 89 cm", hip: "107 cm", length: "102 cm", fit: "Setara XL" },
  { size: "36", waist: "92 – 94 cm", hip: "112 cm", length: "103 cm", fit: "Setara XXL" },
];

export const FASHION_LOUNGE_GUIDE = [
  { size: "S-M", chest: "96 – 106 cm", waist: "68 – 82 cm", note: "Potongan santai untuk ukuran S hingga M" },
  { size: "L-XL", chest: "108 – 120 cm", waist: "82 – 96 cm", note: "Potongan santai untuk ukuran L hingga XL" },
  { size: "All Size (Fit to L)", chest: "104 – 112 cm", waist: "70 – 92 cm (karet)", note: "Pinggang elastis nyaman fit S s.d. L" },
  { size: "All Size", chest: "104 – 114 cm", waist: "70 – 94 cm (karet)", note: "Reguler all size dewasa" },
];
