import { z } from "zod";
import { parseDimensions } from "../src/dimensions.js";
export const addressSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().max(254),
  phone: z.string().regex(/^[0-9+ ()-]{8,20}$/),
  street: z.string().trim().min(1).max(500),
  city: z.string().trim().min(1).max(100),
  postal: z.string().trim().max(10).optional().default("").refine((value) => !value || /^\d{5}$/.test(value), "Kode pos harus 5 digit."),
});
export const orderSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        size: z.string().min(1).max(30).transform((value) => {
          const dimensions = parseDimensions(value);
          return dimensions
            ? `${dimensions.length}×${dimensions.width}×${dimensions.height}`
            : value;
        }),
        color: z.string().trim().min(1).max(100),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(50),
  address: addressSchema,
  shipping: z.string().trim().min(1).max(100),
  payment: z.string().trim().min(2).max(60).default("xendit"),
  shippingOption: z
    .object({
      destinationId: z.any().optional(),
      courier: z.any().optional(),
      service: z.any().optional(),
      cost: z.any().optional(),
      etd: z.any().optional(),
    })
    .nullish(),
  checkoutKey: z.string().uuid(),
  coupon: z.enum(["", "LINY10"]).default(""),
});
export function calculateTotals(items, coupon, shipping, deliveryOverride, manualFeeOverride = 15000) {
  const subtotal = items.reduce((s, i) => s + (Number(String(i.price).replace(/\D/g, "")) || 0) * (Number(i.quantity) || 1), 0);
  if (!Number.isSafeInteger(subtotal) || subtotal > 100000000)
    throw Object.assign(new Error("Total pesanan melebihi batas."), {
      status: 400,
    });
  const discount =
    coupon === "LINY10" ? Math.min(Math.round(subtotal * 0.1), 100000) : 0;
  const defaultFee = Number(manualFeeOverride) >= 0 ? Number(manualFeeOverride) : 15000;
  const delivery = deliveryOverride !== undefined && deliveryOverride !== null
    ? Number(deliveryOverride)
    : (shipping === "pickup" || subtotal >= 699000
        ? 0
        : shipping === "express"
          ? Math.max(defaultFee, 35000)
          : defaultFee);
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
