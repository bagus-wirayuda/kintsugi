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
function getFriendlyErrorMessage(status, fallbackText = "") {
  if (status === 502) {
    return "Gagal terhubung ke server toko (502 Bad Gateway). Layanan sedang memuat ulang atau mengalami gangguan sementara. Silakan coba beberapa saat lagi.";
  }
  if (status === 503) {
    return "Layanan toko sedang dalam pemeliharaan (503 Service Unavailable). Silakan coba sesaat lagi.";
  }
  if (status === 504) {
    return "Koneksi ke server batas waktu habis (504 Gateway Timeout). Silakan muat ulang halaman.";
  }
  if (status === 500) {
    return "Terjadi gangguan pada sistem toko. Silakan coba beberapa saat lagi.";
  }
  if (status === 429) {
    return "Terlalu banyak permintaan. Silakan tunggu beberapa saat sebelum mencoba kembali.";
  }
  if (status === 404) {
    return "Layanan atau data yang diminta tidak ditemukan (404).";
  }
  if (status === 403) {
    return "Akses tidak diizinkan (403).";
  }
  if (status === 401) {
    return "Silakan masuk terlebih dahulu.";
  }
  return fallbackText || `Terjadi kendala pada server (status ${status}). Silakan coba kembali.`;
}

function cleanErrorMessage(msg, status) {
  if (!msg || typeof msg !== "string") return getFriendlyErrorMessage(status);
  const trimmed = msg.trim();
  if (
    /^\s*<!DOCTYPE/i.test(trimmed) ||
    /^\s*<html/i.test(trimmed) ||
    /<[a-z][\s\S]*>/i.test(trimmed)
  ) {
    return getFriendlyErrorMessage(status);
  }
  return trimmed;
}

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
  let data = {};
  let isJson = false;
  try {
    if (rawText && rawText.trim()) {
      data = JSON.parse(rawText);
      isJson = true;
    }
  } catch {
    data = {};
    isJson = false;
  }

  if (!res.ok) {
    const rawError = data?.error || data?.message || (isJson ? "" : rawText);
    const friendlyMsg = cleanErrorMessage(rawError, res.status);
    throw Object.assign(new Error(friendlyMsg), {
      status: res.status,
      code: data?.code,
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
