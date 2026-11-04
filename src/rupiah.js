/**
 * Pure JavaScript utilities for Indonesian Rupiah (id-ID) currency formatting & parsing.
 * Safe for both browser and Node.js environments (no JSX / React dependencies).
 */

/**
 * Parse any currency representation (number, "1.000.000", "Rp 150.000", etc.)
 * into a pure integer number.
 * Returns 0 if empty or invalid.
 */
export function parseRupiah(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") {
    return isNaN(value) ? fallback : Math.round(value);
  }
  const str = String(value).trim();
  if (!str) return fallback;
  const isNegative = str.startsWith("-");
  const cleanDigits = str.replace(/\D/g, "");
  if (!cleanDigits) return fallback;
  const num = parseInt(cleanDigits, 10);
  return isNegative ? -num : num;
}

/**
 * Format a number or numeric string to standard Indonesian thousand dots.
 * Example: 1000000 -> "1.000.000", with prefix=true -> "Rp 1.000.000".
 */
export function formatRupiah(value, { prefix = false, fallback = "0" } = {}) {
  if (value === null || value === undefined || value === "") {
    return prefix ? `Rp ${fallback}` : fallback;
  }
  const numeric = parseRupiah(value, NaN);
  if (isNaN(numeric)) {
    return prefix ? `Rp ${fallback}` : fallback;
  }
  const isNegative = numeric < 0;
  const absVal = Math.abs(numeric);

  // Format with standard Indonesian thousand separator (.)
  const formatted = new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0,
  }).format(absVal);

  if (prefix) {
    return isNegative ? `-Rp ${formatted}` : `Rp ${formatted}`;
  }
  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Format raw typing input into dot-separated thousands.
 * Strips leading zeros (e.g. "0500" -> "500").
 * Returns empty string if no digits present.
 */
export function formatRupiahInput(value) {
  if (value === null || value === undefined || value === "") return "";
  const str = String(value);
  const cleanDigits = str.replace(/\D/g, "");
  if (!cleanDigits) return "";
  const trimmed = cleanDigits.replace(/^0+(?=\d)/, "");
  return trimmed.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Default money display function using formatRupiah with "Rp" prefix.
 */
export const money = (n) => formatRupiah(n, { prefix: true, fallback: "0" });
