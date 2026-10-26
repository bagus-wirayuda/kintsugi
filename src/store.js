import { products } from "./data.js";
export const DEMO = import.meta.env.VITE_DATA_MODE !== "api";
const read = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem("lj:" + k)) ?? d;
  } catch {
    return d;
  }
};
export const storage = {
  read,
  write: (k, v) => localStorage.setItem("lj:" + k, JSON.stringify(v)),
};
export async function api(path, options = {}) {
  const res = await fetch("/api" + path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || "Terjadi kesalahan. Silakan coba lagi.");
  return data;
}
export function totals(cart, coupon = "", shipping = "regular") {
  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
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
export function demoOrder(cart, form, coupon, shipping) {
  if (!cart.length) throw new Error("Keranjang masih kosong.");
  const canonical = cart.map((item) => {
    const p = products.find((p) => p.id === item.id);
    if (
      !p ||
      !p.sizes.includes(item.size) ||
      !p.colors.includes(item.color) ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > p.stock
    )
      throw new Error("Varian atau jumlah tidak tersedia.");
    return { ...item, price: p.price };
  });
  return {
    id: "LJ-" + Date.now(),
    createdAt: new Date().toISOString(),
    status: "Menunggu pembayaran",
    items: canonical,
    address: form,
    shipping,
    payment: form.payment,
    ...totals(canonical, coupon, shipping),
  };
}
