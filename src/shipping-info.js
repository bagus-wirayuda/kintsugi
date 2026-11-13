import { money } from "./rupiah.js";

export const COURIER_DETAILS = {
  jnt: {
    code: "jnt",
    name: "J&T Express",
    shortName: "J&T",
    color: "#C81E1E",
    bg: "#FDF2F2",
    border: "#F98080",
    trackUrl: "https://www.jet.co.id/track",
  },
  jne: {
    code: "jne",
    name: "JNE Express",
    shortName: "JNE",
    color: "#1C64F2",
    bg: "#EBF5FF",
    border: "#76A9FA",
    trackUrl: "https://www.jne.co.id/tracking",
  },
  tiki: {
    code: "tiki",
    name: "TIKI",
    shortName: "TIKI",
    color: "#0694A2",
    bg: "#EDF8F7",
    border: "#4FD1C5",
    trackUrl: "https://www.tiki.id/id/tracking",
  },
  pos: {
    code: "pos",
    name: "POS Indonesia",
    shortName: "POS",
    color: "#C2410C",
    bg: "#FFF7ED",
    border: "#FDBA8C",
    trackUrl: "https://www.posindonesia.co.id/id/tracking",
  },
  local: {
    code: "local",
    name: "Kurir Toko",
    shortName: "Lokal",
    color: "#046C4E",
    bg: "#F3FAF7",
    border: "#6EE7B7",
    trackUrl: "",
  },
  pickup: {
    code: "pickup",
    name: "Ambil di Toko",
    shortName: "Ambil Sendiri",
    color: "#6C2BD9",
    bg: "#F6F5FF",
    border: "#CABFFD",
    trackUrl: "",
  },
};

/**
 * Resolves detailed courier and delivery information for an order.
 * @param {Object} order - Order object containing shipping, shipping_name, delivery, tracking_number, status, etc.
 * @returns {Object} Structured courier and delivery metadata
 */
export function resolveShippingInfo(order) {
  if (!order) return null;
  const rawShipping = String(order.shipping || "").toLowerCase();
  const rawName = String(order.shipping_name || "").trim();
  const isPickup =
    rawShipping === "pickup" ||
    order.payment_type === "store_pickup" ||
    order.payment === "store_pickup" ||
    /ambil di toko/i.test(rawName);

  if (isPickup) {
    return {
      isPickup: true,
      code: "pickup",
      courier: COURIER_DETAILS.pickup,
      title: "Ambil Langsung di Toko",
      courierName: "Ambil di Toko",
      service: "Ambil di Lokasi Toko",
      deliveryLabel: "Gratis (Ambil di Toko)",
      trackingNumber: "",
      statusText:
        order.status === "Selesai"
          ? "Pesanan telah selesai diambil di toko"
          : order.payment_status === "PAID"
            ? "Pesanan siap diambil di toko"
            : "Menunggu pembayaran dan pengambilan di toko fisik",
      statusDetail:
        "Tunjukkan nomor pesanan kepada petugas kasir saat mengambil pesanan di lokasi toko.",
      eta: "Buka setiap hari (09:00 - 20:00 WITA)",
    };
  }

  // Identify courier code from rawName or rawShipping
  let code = "local";
  const testTarget = (rawName + " " + rawShipping).toLowerCase();
  if (/j&t|jnt/i.test(testTarget)) code = "jnt";
  else if (/jne/i.test(testTarget)) code = "jne";
  else if (/tiki/i.test(testTarget)) code = "tiki";
  else if (/pos ind|pos/i.test(testTarget)) code = "pos";
  else if (rawShipping === "rajaongkir") code = "jnt"; // default fallback for rajaongkir

  const courier = COURIER_DETAILS[code] || COURIER_DETAILS.local;
  const title = rawName || (code === "local" ? "Pengiriman Kurir Toko" : `${courier.name} Reguler`);

  // Extract service
  let service = "";
  if (/pos reguler/i.test(rawName)) service = "Pos Reguler";
  else if (/pos kilat/i.test(rawName)) service = "Pos Kilat Khusus";
  else if (/ez/i.test(rawName)) service = "EZ (Reguler)";
  else if (/yes/i.test(rawName)) service = "YES (Yakin Esok Sampai)";
  else if (/\breg\b|reguler/i.test(rawName)) service = "REG (Reguler)";
  else if (/ekspres|express/i.test(rawName)) service = "Layanan Ekspres";
  else if (code === "local") service = "Pengantaran Toko";
  else service = "Layanan Standar";

  // Delivery cost
  const cost = Number(order.delivery) || 0;
  const isFree = cost === 0;
  const deliveryCostLabel = isFree ? "Gratis Ongkir (Rp0)" : money(cost);

  // Status and descriptions
  let statusText = "";
  let statusDetail = "";
  switch (order.status) {
    case "Dikirim":
      statusText = `Sedang Diantar oleh ${courier.name}`;
      statusDetail = order.tracking_number
        ? `Paket sedang dalam perjalanan bersama kurir ${courier.name} menuju alamat penerima (No. Resi: ${order.tracking_number}).`
        : `Paket telah diserahkan ke ${courier.name} dan sedang dalam proses pengantaran ke alamat Anda.`;
      break;
    case "Selesai":
      statusText = "Pesanan Berhasil Diantar & Diterima";
      statusDetail = `Paket telah sampai di alamat tujuan dan diterima dengan baik. Terima kasih telah berbelanja!`;
      break;
    case "Diproses":
      statusText = `Sedang Dikemas (Menunggu Penjemputan ${courier.name})`;
      statusDetail = `Pesanan Anda sedang disiapkan dan dikemas dengan rapi oleh toko untuk diserahkan ke kurir ${courier.name}.`;
      break;
    case "Dibatalkan":
      statusText = "Pengantaran Dibatalkan";
      statusDetail = "Pesanan dibatalkan sehingga proses pengantaran paket tidak dilanjutkan.";
      break;
    case "Menunggu pembayaran":
    default:
      statusText = `Menunggu Pembayaran (Pengantaran via ${courier.name})`;
      statusDetail = `Pengantaran pesanan melalui ${courier.name} akan segera diproses setelah pembayaran berhasil dikonfirmasi.`;
      break;
  }

  return {
    isPickup: false,
    code,
    courier,
    title,
    courierName: courier.name,
    service,
    cost,
    isFree,
    deliveryCostLabel,
    trackingNumber: String(order.tracking_number || "").trim(),
    trackUrl: courier.trackUrl,
    statusText,
    statusDetail,
  };
}
