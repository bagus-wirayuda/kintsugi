import { z } from "zod";
export const addressSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().max(254),
  phone: z.string().regex(/^[0-9+ ()-]{8,20}$/),
  street: z.string().trim().min(10).max(500),
  city: z.string().trim().min(2).max(100),
  postal: z.string().regex(/^\d{5}$/),
});
export const orderSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        size: z.string().min(1).max(10),
        color: z.string().regex(/^#[a-fA-F0-9]{3,6}$/),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(50),
  address: addressSchema,
  shipping: z.enum(["regular", "express", "pickup"]),
  payment: z.literal("xendit").default("xendit"),
  checkoutKey: z.string().uuid(),
  coupon: z.enum(["", "LINY10"]).default(""),
});
export function calculateTotals(items, coupon, shipping) {
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  if (!Number.isSafeInteger(subtotal) || subtotal > 100000000)
    throw Object.assign(new Error("Total pesanan melebihi batas."), {
      status: 400,
    });
  const discount =
    coupon === "LINY10" ? Math.min(Math.round(subtotal * 0.1), 100000) : 0;
  const delivery =
    shipping === "pickup" || subtotal >= 699000
      ? 0
      : shipping === "express"
        ? 35000
        : 15000;
  return {
    subtotal,
    discount,
    delivery,
    total: subtotal - discount + delivery,
  };
}
export function aggregateItems(items) {
  const result = new Map();
  for (const i of items) {
    const key = [i.id, i.size, i.color].join(":");
    const existing = result.get(key);
    if (existing) existing.quantity += i.quantity;
    else result.set(key, { ...i });
  }
  const rows = [...result.values()].sort((a, b) =>
    [a.id, a.size, a.color]
      .join(":")
      .localeCompare([b.id, b.size, b.color].join(":")),
  );
  if (rows.some((i) => i.quantity > 99))
    throw Object.assign(new Error("Jumlah maksimum 99 per varian."), {
      status: 400,
    });
  return rows;
}
export const transitions = {
  "Menunggu pembayaran": ["Dibatalkan"],
  Diproses: ["Dikirim"],
  Dikirim: ["Selesai"],
  Selesai: [],
  Dibatalkan: [],
};
