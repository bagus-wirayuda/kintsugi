import { parseRupiah } from "./rupiah.js";

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
  remove(key) {
    try {
      localStorage.removeItem("lj:" + key);
    } catch {}
  },
  clearUserSession(userId) {
    try {
      if (userId) {
        localStorage.removeItem("lj:cart:" + userId);
        localStorage.removeItem("lj:wish:" + userId);
        localStorage.removeItem("lj:coupon:" + userId);
        localStorage.removeItem("lj:direct:" + userId);
        localStorage.removeItem("lj:checkout:" + userId);
        localStorage.removeItem("lj:checkout-draft:" + userId);
      }
      sessionStorage.removeItem("lj:verification:admin");
      sessionStorage.removeItem("lj:verification:customer");
      sessionStorage.removeItem("lj:pending_checkout");
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
      "Layanan toko sedang tidak dapat dihubungi. Silakan periksa koneksi internet Anda.",
    );
  }

  const rawText = await res.text();
  let data;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    if (!res.ok) {
      throw Object.assign(
        new Error(
          rawText?.trim() ||
            (res.status === 429
              ? "Terlalu banyak permintaan. Silakan tunggu beberapa saat sebelum mencoba kembali."
              : res.status === 502
                ? "Gagal terhubung ke layanan eksternal. Silakan coba kembali."
                : res.status === 503
                  ? "Layanan sedang dalam pemeliharaan. Silakan coba sesaat lagi."
                  : `Terjadi kendala pada server (status ${res.status}). Silakan coba kembali.`)
        ),
        { status: res.status }
      );
    }
    data = {};
  }

  if (!res.ok) {
    const errorMsg =
      data.error ||
      data.message ||
      (res.status === 429
        ? "Terlalu banyak permintaan. Silakan tunggu beberapa saat sebelum mencoba kembali."
        : res.status === 502
          ? "Layanan pihak ketiga belum berhasil merespons. Silakan coba kembali."
          : res.status === 503
            ? "Layanan toko sedang dalam pemeliharaan. Silakan coba sesaat lagi."
            : `Terjadi kesalahan (${res.status}). Silakan coba lagi.`);
    throw Object.assign(new Error(errorMsg), {
      status: res.status,
      code: data.code,
    });
  }
  return data;
}
export function totals(cart, coupon = "", shipping = "standard", localDeliveryFee = 15000) {
  const subtotal = cart.reduce((s, i) => s + (parseRupiah(i.price) * (Number(i.quantity) || 1)), 0);
  const discount =
    coupon === "LINY10" ? Math.min(Math.round(subtotal * 0.1), 100000) : 0;
  const fee = parseRupiah(localDeliveryFee) >= 0 ? parseRupiah(localDeliveryFee) : 15000;
  const delivery =
    shipping === "pickup" || subtotal >= 699000
      ? 0
      : shipping === "express"
      ? Math.max(fee, 35000)
      : fee;
  return {
    subtotal,
    discount,
    delivery,
    total: subtotal - discount + delivery,
  };
}
