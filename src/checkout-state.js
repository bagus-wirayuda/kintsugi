import { sizesMatch } from "./size-guide.js";

// Data alamat tidak berisi password/OTP. Draft dibatasi 24 jam di browser ini.
export const DRAFT_TTL = 24 * 60 * 60 * 1000;
export function readDraft(storage, owner, now = Date.now()) {
  const draft = storage.read("checkout-draft:" + owner, null);
  return draft?.updatedAt > now - DRAFT_TTL ? draft : null;
}
export function saveDraft(storage, owner, data) {
  storage.write("checkout-draft:" + owner, { ...data, updatedAt: Date.now() });
}
function normalizeCartStock(a, b) {
  const sa = Number(a);
  if (Number.isFinite(sa) && sa > 0) return Math.min(99, Math.trunc(sa));
  const sb = Number(b);
  if (Number.isFinite(sb) && sb > 0) return Math.min(99, Math.trunc(sb));
  return 99;
}

function normalizeCartQty(q) {
  const n = Math.trunc(Number(q));
  return Number.isFinite(n) && n >= 1 ? Math.min(99, n) : 1;
}

export function mergeGuestCart(saved, guest) {
  const merged = saved.map((item) => ({
    ...item,
    stock: normalizeCartStock(item.stock),
    quantity: normalizeCartQty(item.quantity),
  }));
  for (const item of guest) {
    const incomingQty = normalizeCartQty(item.quantity);
    const maxStock = normalizeCartStock(item.stock, merged.find((row) => row.key === item.key)?.stock);
    const previous = merged.find((row) => row.key === item.key);
    if (previous) {
      previous.stock = maxStock;
      previous.quantity = Math.max(
        1,
        Math.min(maxStock, previous.quantity + incomingQty),
      );
    } else {
      merged.push({
        ...item,
        stock: maxStock,
        quantity: Math.min(maxStock, incomingQty),
      });
    }
  }
  return merged;
}
/**
 * Sums total physical item units (`SUM(quantity)`) across cart or order rows.
 */
export function getCartItemCount(items = []) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => sum + normalizeCartQty(item?.quantity), 0);
}

/**
 * Reconciles persisted selected item keys against current valid cart items.
 * Preserves explicit empty selections (`[]`) while auto-selecting all on first load (`null`).
 */
export function reconcileSelectedKeys(cart = [], currentSelected = null) {
  const validKeys = new Set((cart || []).map((item) => item.key).filter(Boolean));
  if (currentSelected === null || currentSelected === undefined) {
    return [...validKeys];
  }
  if (!Array.isArray(currentSelected)) return [];
  const seen = new Set();
  const next = [];
  for (const key of currentSelected) {
    if (validKeys.has(key) && !seen.has(key)) {
      seen.add(key);
      next.push(key);
    }
  }
  return next;
}

/**
 * Merges guest cart item selection choices with a customer's saved selection upon sign-in.
 */
export function mergeGuestSelection(savedKeys, guestKeys, mergedCart = []) {
  const validKeys = new Set((mergedCart || []).map((item) => item.key).filter(Boolean));
  const savedSet =
    Array.isArray(savedKeys)
      ? savedKeys
      : [];
  const guestList =
    Array.isArray(guestKeys)
      ? guestKeys
      : [];
  const combined = savedKeys === null && guestKeys === null
    ? [...validKeys]
    : [...new Set([...savedSet, ...guestList])];
  return reconcileSelectedKeys(mergedCart, combined);
}

export function moveGuestCheckout(storage, userId) {
  const draft = readDraft(storage, "guest");
  if (draft) saveDraft(storage, userId, draft);
  storage.write("checkout-draft:guest", null);
}
export function subtractPurchased(cart, items) {
  return cart.flatMap((row) => {
    const item = items.find(
      (entry) =>
        entry.id === row.id &&
        sizesMatch(entry.size, row.size) &&
        entry.color === row.color,
    );
    const purchasedQty = item ? normalizeCartQty(item.quantity) : 0;
    const quantity = normalizeCartQty(row.quantity) - purchasedQty;
    return quantity > 0 ? [{ ...row, quantity }] : [];
  });
}
