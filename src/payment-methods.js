import { SAMPLE_DANA_QRIS_META, SAMPLE_DANA_QRIS_PAYLOAD } from "./qris.js";

// Payment method groups supported by the store
export const PAYMENT_GROUPS = ["QRIS", "Bank", "E-Wallet", "COD"];

export const PAYMENT_TYPES = {
  GATEWAY: "gateway",
  COD: "cod",
  QRIS_MANUAL: "qris_manual",
  STORE_PICKUP: "store_pickup",
};

export const defaultPaymentMethods = [
  {
    id: "COD",
    name: "Bayar di Tempat (COD)",
    group: "COD",
    paymentType: PAYMENT_TYPES.COD,
    detail: "Bayar tunai langsung kepada kurir saat pesanan sampai di alamat Anda.",
    enabled: true,
    sort_order: 0,
  },
  {
    id: SAMPLE_DANA_QRIS_META.id,
    name: SAMPLE_DANA_QRIS_META.name,
    group: "QRIS",
    paymentType: PAYMENT_TYPES.QRIS_MANUAL,
    qrisPayload: SAMPLE_DANA_QRIS_PAYLOAD,
    qrisMerchantName: SAMPLE_DANA_QRIS_META.merchantName,
    qrisProvider: SAMPLE_DANA_QRIS_META.provider,
    qrisMode: "dynamic",
    detail:
      "Scan QRIS nominal otomatis (DANA - BAGUS WIRAYUDA) lalu unggah bukti bayar untuk verifikasi Admin.",
    enabled: true,
    sort_order: 1,
  },
];

export function isCodMethod(methodOrId) {
  if (!methodOrId) return false;
  if (typeof methodOrId === "string") return methodOrId === "COD";
  return (
    methodOrId.paymentType === PAYMENT_TYPES.COD ||
    methodOrId.payment_type === PAYMENT_TYPES.COD ||
    methodOrId.group === "COD" ||
    methodOrId.group_name === "COD" ||
    methodOrId.id === "COD"
  );
}

export function isManualQrisMethod(methodOrId) {
  if (!methodOrId) return false;
  if (typeof methodOrId === "string") return methodOrId.startsWith("QRIS_");
  return (
    methodOrId.paymentType === PAYMENT_TYPES.QRIS_MANUAL ||
    methodOrId.payment_type === PAYMENT_TYPES.QRIS_MANUAL ||
    (methodOrId.group === "QRIS" && Boolean(methodOrId.qrisPayload || methodOrId.qris_payload))
  );
}

export function isManualOfflineMethod(methodOrId) {
  return isCodMethod(methodOrId) || isManualQrisMethod(methodOrId);
}

export function isStorePickupMethod(methodOrId) {
  if (!methodOrId) return false;
  if (typeof methodOrId === "string") return methodOrId === "store_pickup";
  return (
    methodOrId.paymentType === PAYMENT_TYPES.STORE_PICKUP ||
    methodOrId.payment_type === PAYMENT_TYPES.STORE_PICKUP ||
    methodOrId.id === "store_pickup" ||
    methodOrId.payment === "store_pickup"
  );
}

const legacyMap = {
  store_pickup: "Bayar di Toko (Store Pickup)",
  QRIS: "QRIS",
  [SAMPLE_DANA_QRIS_META.id]: SAMPLE_DANA_QRIS_META.name,
  DANA: "DANA",
  OVO: "OVO",
  SHOPEEPAY: "ShopeePay",
  LINKAJA: "LinkAja",
  BCA: "BCA Virtual Account",
  BNI: "BNI Virtual Account",
  BRI: "BRI Virtual Account",
  MANDIRI: "Mandiri Virtual Account",
  PERMATA: "Permata Virtual Account",
  BSI: "BSI Virtual Account",
  CREDIT_CARD: "Kartu Kredit / Debit",
};

export function paymentName(id, methods = []) {
  if (!id) return "Pembayaran";
  const found = methods?.find((m) => m.id === id);
  if (found) return found.name;
  if (id === "COD") return "Bayar di Tempat (COD)";
  if (legacyMap[id]) return legacyMap[id];
  return id;
}

export const paymentMethods = defaultPaymentMethods;
