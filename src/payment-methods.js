// Payment method groups supported by the store
export const PAYMENT_GROUPS = ["Bank", "E-Wallet", "COD"];

export const defaultPaymentMethods = [
  {
    id: "COD",
    name: "Bayar di Tempat (COD)",
    group: "COD",
    detail: "Bayar tunai langsung kepada kurir saat pesanan sampai di alamat Anda.",
    enabled: true,
    sort_order: 0,
  },
];

const legacyMap = {
  QRIS: "QRIS",
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

// Fallback exported payment methods containing only COD default
export const paymentMethods = defaultPaymentMethods;
