export const DEMO = import.meta.env.VITE_DATA_MODE === "demo";
const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem("lj:" + key)) ?? fallback;
  } catch {
    return fallback;
  }
};
export const storage = {
  read,
  write(key, value) {
    try {
      localStorage.setItem("lj:" + key, JSON.stringify(value));
    } catch {}
  },
};
export async function api(path, options = {}) {
  let res;
  try {
    res = await fetch("/api" + path, {
      credentials: "include",
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new Error(
      "Tidak dapat menghubungi toko. Aktifkan MySQL Laragon, jalankan npm start di folder proyek, lalu buka http://localhost:3001.",
    );
  }
  const data = await res.json().catch(() => {
    throw new Error(
      "Backend belum terhubung. Jalankan npm start di folder proyek lalu buka http://localhost:3001, atau gunakan npm run dev untuk menyalakan frontend dan backend bersama.",
    );
  });
  if (!res.ok)
    throw Object.assign(
      new Error(data.error || "Terjadi kesalahan. Silakan coba lagi."),
      { status: res.status, code: data.code },
    );
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
// Mode browser hanya untuk pratinjau eksplisit. Checkout memerlukan API.
export function demoOrder() {
  throw new Error(
    "Checkout memerlukan backend MySQL dan Xendit. Jalankan npm start.",
  );
}
