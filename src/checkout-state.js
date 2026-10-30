// Data alamat tidak berisi password/OTP. Draft dibatasi 24 jam di browser ini.
export const DRAFT_TTL = 24 * 60 * 60 * 1000;
export function readDraft(storage, owner, now = Date.now()) {
  const draft = storage.read("checkout-draft:" + owner, null);
  return draft?.updatedAt > now - DRAFT_TTL ? draft : null;
}
export function saveDraft(storage, owner, data) {
  storage.write("checkout-draft:" + owner, { ...data, updatedAt: Date.now() });
}
export function mergeGuestCart(saved, guest) {
  const merged = saved.map((item) => ({ ...item }));
  for (const item of guest) {
    const previous = merged.find((row) => row.key === item.key);
    if (previous)
      previous.quantity = Math.max(
        1,
        Math.min(99, item.stock, previous.quantity + item.quantity),
      );
    else merged.push({ ...item });
  }
  return merged;
}
export function moveGuestCheckout(storage, userId) {
  const draft = readDraft(storage, "guest");
  if (draft) saveDraft(storage, userId, draft);
  storage.write("checkout-draft:guest", null);
}
export function subtractPurchased(cart, items) {
  return cart.flatMap((row) => {
    const item = items.find(
      (item) =>
        item.id === row.id &&
        item.size === row.size &&
        item.color === row.color,
    );
    const quantity = row.quantity - (item?.quantity || 0);
    return quantity > 0 ? [{ ...row, quantity }] : [];
  });
}
