import { colorLabel } from "./data.js";
import { sizesMatch } from "./size-guide.js";

/**
 * Known solid color palette mapped to CSS hex values.
 * Patterns and multi-color motifs (e.g. "Navy Polkadot", "Hitam Garis Putih")
 * are intentionally omitted so motif groups render consistently as text or thumbnails.
 */
export const COLOR_HEX_MAP = {
  "putih ivory": "#F7F1E7",
  "teal samudra": "#0E6575",
  "hijau sage": "#9CB8B5",
  "sage green": "#9CB8B5",
  "biru kabut": "#6F8294",
  "mocha hangat": "#B88C62",
  champagne: "#D7B28A",
  "rose dust": "#E8D8CB",
  "abu batu": "#6E7479",
  "krem susu": "#F4EFE2",
  "biru langit": "#B7C8D5",
  "hijau mint": "#C9DDBB",
  "kuning ceria": "#EACD72",
  "pink lembut": "#F2C4C6",
  "putih awan": "#E7EEF0",
  "navy gelap": "#2C3E50",
  "abu charcoal": "#34495E",
  terracotta: "#C5A880",
  "oatmeal beige": "#D4C2B0",
  hitam: "#18181B",
  "washed black": "#323437",
  putih: "#F8FAFC",
  "putih broken white": "#F5F2EB",
  navy: "#1E3A5F",
  "dark indigo": "#1F2A44",
  maroon: "#7F1D1D",
  "biru muda": "#93C5FD",
  "light blue wash": "#93B4D4",
  "dusty blue": "#7A96AB",
  "hijau olive": "#6B7042",
  "olive green": "#6B7042",
  "hijau army": "#4D5D40",
  "abu-abu": "#8C9298",
  "abu misty": "#B2B8BE",
  "abu muda": "#CBD5E1",
  "abu gelap": "#374151",
  beige: "#E5D6C3",
  krem: "#F3EAD8",
  "krem ivory": "#F6F0E4",
  oatmeal: "#DDD5C7",
  khaki: "#C3B091",
  mocha: "#9A7B64",
  "mocha beige": "#C8B5A0",
  "cokelat tan": "#B68454",
  "cokelat tua": "#5C3D2E",
  mustard: "#D4A017",
  "dusty pink": "#D8A3A8",
  "dusty rose": "#C88A92",
  "soft pink": "#F7D1D6",
};

const HEX_COLOR_REGEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const MOTIF_LABEL_REGEX = /motif|pola|pattern|jenis|model|bahan|corak|edisi/i;

/**
 * Resolves a raw color string (hex code or solid color name) to a CSS hex value, or null.
 */
export function resolveColorHex(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (HEX_COLOR_REGEX.test(raw)) return raw.toUpperCase();
  const display = String(colorLabel(raw) || raw).trim().toLowerCase();
  return COLOR_HEX_MAP[display] || COLOR_HEX_MAP[raw.toLowerCase()] || null;
}

/**
 * Collects a deduplicated array of image URLs belonging to a single variant row.
 */
export function collectVariantImages(variant) {
  if (!variant || typeof variant !== "object") return [];
  let extra = [];
  if (Array.isArray(variant.images)) {
    extra = variant.images;
  } else if (typeof variant.images_json === "string" && variant.images_json.trim()) {
    try {
      const parsed = JSON.parse(variant.images_json);
      if (Array.isArray(parsed)) extra = parsed;
    } catch {
      extra = [];
    }
  } else if (typeof variant.imagesJson === "string" && variant.imagesJson.trim()) {
    try {
      const parsed = JSON.parse(variant.imagesJson);
      if (Array.isArray(parsed)) extra = parsed;
    } catch {
      extra = [];
    }
  }
  const merged = [variant.image_url, variant.imageUrl, ...extra]
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter(Boolean);
  return [...new Set(merged)];
}

/**
 * Returns normalized metadata and gallery images for every distinct variation value.
 */
export function collectColorOptionMeta(options = [], variants = []) {
  const cleanOptions = [...new Set((options || []).filter(Boolean))];
  return cleanOptions.map((value) => {
    const label = colorLabel(value);
    const matching = (variants || []).filter((v) => v.color === value);
    const images = [...new Set(matching.flatMap((v) => collectVariantImages(v)))];
    return {
      value,
      label,
      hex: resolveColorHex(value),
      thumb: images[0] || "",
      images,
      inStock: matching.length === 0 || matching.some((v) => Number(v.stock) > 0),
    };
  });
}

/**
 * Determines ONE strictly consistent display mode across an entire variation group:
 * - "swatch"    -> all options are solid color swatches (uniform color boxes, never mixed with text)
 * - "thumbnail" -> all options have variant thumbnails + labels (ideal for motif/type with images)
 * - "text"      -> all options render as uniform text buttons (no mixed swatches or partial thumbnails)
 */
export function resolveVariationDisplayMode(options = [], variants = [], variationLabel = "Warna") {
  const items = collectColorOptionMeta(options, variants);
  if (!items.length) return { mode: "text", items: [] };

  const allHaveHex = items.every((item) => Boolean(item.hex));
  const allHaveThumb = items.every((item) => Boolean(item.thumb));
  const isMotifOrType = MOTIF_LABEL_REGEX.test(String(variationLabel || ""));

  let mode = "text";
  if (isMotifOrType) {
    mode = allHaveThumb ? "thumbnail" : "text";
  } else if (allHaveHex) {
    mode = "swatch";
  } else if (allHaveThumb) {
    mode = "thumbnail";
  }

  return { mode, items };
}

/**
 * Checks whether two color labels represent the same color (case-insensitive & trimmed).
 */
export function colorsMatch(a, b) {
  const ca = String(a ?? "").trim().toLowerCase();
  const cb = String(b ?? "").trim().toLowerCase();
  return Boolean(ca && cb && ca === cb);
}

/**
 * Calculates the price range (minimum and maximum price) across a product's variants.
 * If selectedColor is specified, also computes range for that specific color.
 */
export function getProductPriceRange(product, selectedColor = "") {
  if (!product) return { min: 0, max: 0, hasRange: false, colorMin: 0, colorMax: 0, hasColorRange: false };
  const basePrice = Number(product.basePrice ?? product.price) || 0;
  const variants = Array.isArray(product.variants) ? product.variants : [];

  const allPrices = variants
    .map((v) => (v.price != null && Number(v.price) >= 1000 ? Number(v.price) : basePrice))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!allPrices.length) allPrices.push(basePrice);

  const min = Math.min(...allPrices);
  const max = Math.max(...allPrices);

  let colorMin = min;
  let colorMax = max;
  if (selectedColor) {
    const colorVariants = variants.filter((v) => colorsMatch(v.color, selectedColor));
    const colorPrices = colorVariants
      .map((v) => (v.price != null && Number(v.price) >= 1000 ? Number(v.price) : basePrice))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (colorPrices.length) {
      colorMin = Math.min(...colorPrices);
      colorMax = Math.max(...colorPrices);
    }
  }

  return {
    min,
    max,
    hasRange: max > min,
    colorMin,
    colorMax,
    hasColorRange: colorMax > colorMin,
  };
}

/**
 * Resolves the active database variant row for (selectedColor, selectedSize),
 * falling back cleanly to the active color's first in-stock or first variant when size is unset.
 */
export function resolveActiveVariant(product, selectedColor = "", selectedSize = "") {
  if (!product) {
    return {
      variant: null,
      exactVariant: null,
      isExactVariantSelected: false,
      variantId: "",
      unitPrice: 0,
      oldPrice: 0,
      stock: 0,
      image: "",
      gallery: [],
      hasVariantImage: false,
      color: selectedColor || "",
      size: selectedSize || "",
      minPrice: 0,
      maxPrice: 0,
      hasPriceRange: false,
      colorMinPrice: 0,
      colorMaxPrice: 0,
      hasColorRange: false,
    };
  }

  const variants = Array.isArray(product.variants) ? product.variants : [];
  const exactVariant =
    selectedColor && selectedSize
      ? variants.find(
          (v) => colorsMatch(v.color, selectedColor) && sizesMatch(v.size, selectedSize),
        ) || null
      : selectedSize
        ? variants.find((v) => sizesMatch(v.size, selectedSize)) || null
        : null;

  const colorSiblings = selectedColor
    ? variants.filter((v) => colorsMatch(v.color, selectedColor))
    : variants;

  const fallbackVariant =
    colorSiblings.find((v) => Number(v.stock) > 0 && collectVariantImages(v).length > 0) ||
    colorSiblings.find((v) => Number(v.stock) > 0) ||
    colorSiblings.find((v) => collectVariantImages(v).length > 0) ||
    colorSiblings[0] ||
    null;

  const activeRow = exactVariant || fallbackVariant;
  const exactImages = collectVariantImages(exactVariant);
  const siblingImages = colorSiblings.flatMap((v) => collectVariantImages(v));
  const variantGallery = [...new Set(exactImages.length ? exactImages : siblingImages)];

  const productFallback = product.image || "";
  const gallery = variantGallery.length
    ? variantGallery
    : (productFallback ? [productFallback] : []);

  const rawVariantPrice = Number(activeRow?.price);
  const unitPrice =
    Number.isFinite(rawVariantPrice) && rawVariantPrice >= 1000
      ? rawVariantPrice
      : Number(product.price || 0);
  const oldPrice =
    Number.isFinite(rawVariantPrice) && rawVariantPrice >= 1000
      ? 0
      : Number(product.oldPrice || 0);

  const variantId =
    activeRow?.id ||
    (product.id && activeRow
      ? `${product.id}::${activeRow.size}::${activeRow.color}`
      : "");

  const stock = exactVariant
    ? Math.max(0, Number(exactVariant.stock) || 0)
    : selectedSize
      ? 0
      : colorSiblings.length
        ? Math.max(0, ...colorSiblings.map((v) => Number(v.stock) || 0))
        : Math.max(0, Number(product.stock) || 0);

  const priceRange = getProductPriceRange(product, selectedColor);

  return {
    variant: activeRow,
    exactVariant: exactVariant || null,
    isExactVariantSelected: Boolean(exactVariant),
    variantId,
    unitPrice,
    oldPrice,
    stock,
    image: gallery[0],
    gallery,
    hasVariantImage: variantGallery.length > 0,
    color: selectedColor || activeRow?.color || "",
    size: selectedSize || exactVariant?.size || "",
    minPrice: priceRange.min,
    maxPrice: priceRange.max,
    hasPriceRange: priceRange.hasRange,
    colorMinPrice: priceRange.colorMin,
    colorMaxPrice: priceRange.colorMax,
    hasColorRange: priceRange.hasColorRange,
  };
}

/**
 * Convenience wrapper returning mainImage, gallery array, and variant image flag.
 */
export function getGalleryForSelection(product, selectedColor = "", selectedSize = "") {
  const resolved = resolveActiveVariant(product, selectedColor, selectedSize);
  return {
    mainImage: resolved.image,
    gallery: resolved.gallery,
    hasVariantImage: resolved.hasVariantImage,
  };
}
