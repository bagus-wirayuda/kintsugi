import { createHash } from "node:crypto";
import QRCode from "qrcode";
import { fail, queueWhatsApp, renderWhatsAppTemplate } from "./integrations.js";
import {
  PAYMENT_TYPES,
  isCodMethod,
  isManualQrisMethod,
  isStorePickupMethod,
} from "../src/payment-methods.js";
import {
  assessQrisCompatibility,
  convertStaticQrisToDynamic,
  validateQrisPayload,
} from "../src/qris.js";

export const orderRow = (o) => ({
  ...o,
  address: typeof o.address === "string" ? JSON.parse(o.address) : o.address,
  createdAt: o.created_at,
});

export async function renderQrDataUrl(payload) {
  const clean = String(payload || "").trim();
  if (!clean) return "";
  return QRCode.toDataURL(clean, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320,
    color: {
      dark: "#1A1A1A",
      light: "#FFFFFF",
    },
  });
}

export async function enrichQrisOrder(order) {
  if (!order) return order;
  const isQris =
    order.payment_type === PAYMENT_TYPES.QRIS_MANUAL ||
    Boolean(order.qris_payload || order.qris_static_payload);
  if (!isQris) return order;

  const activePayload = order.qris_payload || order.qris_static_payload || "";
  const staticPayload = order.qris_static_payload || order.qris_payload || "";
  const [qrisQrDataUrl, qrisStaticQrDataUrl] = await Promise.all([
    activePayload ? renderQrDataUrl(activePayload) : Promise.resolve(""),
    staticPayload
      ? staticPayload === activePayload && activePayload
        ? Promise.resolve("")
        : renderQrDataUrl(staticPayload)
      : Promise.resolve(""),
  ]);

  let compatibility = null;
  try {
    if (activePayload) compatibility = assessQrisCompatibility(activePayload);
  } catch {
    compatibility = null;
  }

  return {
    ...order,
    qrisQrDataUrl,
    qrisStaticQrDataUrl: qrisStaticQrDataUrl || qrisQrDataUrl,
    qrisCompatibility: compatibility,
  };
}

export async function enrichQrisOrders(orders = []) {
  return Promise.all(orders.map((o) => enrichQrisOrder(o)));
}
export function validateInvoice(invoice, order) {
  if (
    invoice.id !== order.invoice_id ||
    invoice.external_id !== order.id ||
    invoice.currency !== "IDR" ||
    Number(invoice.amount) !== order.total ||
    (["PAID", "SETTLED"].includes(invoice.status) &&
      Number(invoice.paid_amount) !== order.total)
  )
    throw fail(
      409,
      "Referensi, mata uang atau nominal pembayaran tidak cocok.",
    );
}
export async function releaseStock(c, order) {
  if (order.stock_released) return;
  const { rows } = await c.query(
    "SELECT * FROM order_items WHERE order_id=? ORDER BY product_id,size,color",
    [order.id],
  );
  for (const i of rows)
    await c.query(
      "UPDATE product_variants SET stock=stock+? WHERE product_id=? AND size=? AND color=?",
      [i.quantity, i.product_id, i.size, i.color],
    );
  await c.query("UPDATE orders SET stock_released=TRUE WHERE id=?", [order.id]);
}
export function createPayments(pool, gateway) {
  async function notification(db, key, values) {
    const [row, brandRow] = await Promise.all([
      db.query("SELECT setting_value FROM store_settings WHERE setting_key='waTemplates'"),
      db.query("SELECT setting_value FROM store_settings WHERE setting_key='brand'"),
    ]);
    const configValue = row.rows[0]?.setting_value;
    const config = configValue;
    const brandValue=brandRow.rows[0]?.setting_value;
    const brand=brandValue;
    const defaults = {
      purchased: "Halo [nama], pembayaran pesanan [nomor_pesanan] sebesar [total] berhasil dikonfirmasi. Pesanan Anda segera disiapkan oleh [toko]. Terima kasih!",
      processing: "Halo [nama], pesanan [nomor_pesanan] sedang diproses dan dikemas dengan teliti oleh tim [toko]. Kami akan mengabari saat pesanan siap dikirim.",
      shipped: "Halo [nama], pesanan [nomor_pesanan] telah dikirim menggunakan kurir [kurir]. Nomor resi pengiriman Anda: *[nomor_resi]*. Lacak pesanan Anda secara berkala.",
      delivered: "Halo [nama], pesanan [nomor_pesanan] telah sampai di tujuan. Terima kasih telah berbelanja di [toko]. Semoga Anda puas dengan produk kami!",
      cancelled: "Halo [nama], pesanan [nomor_pesanan] telah dibatalkan. Jika ada pertanyaan atau membutuhkan bantuan, silakan hubungi layanan pelanggan [toko].",
    };
    return renderWhatsAppTemplate(config?.[key] || defaults[key], {...values,toko:values.toko||brand||"Kintsugi"});
  }
  async function ensure(id) {
    const c = await pool.connect();
    let result;
    try {
      await c.query("START TRANSACTION");
      const { rows } = await c.query(
        "SELECT * FROM orders WHERE id=? FOR UPDATE",
        [id],
      );
      const o = rows[0];
      if (!o) throw fail(404, "Pesanan tidak ditemukan.");
      if (o.payment_status !== "CREATING") {
        await c.query("COMMIT");
        return o;
      }
      const isStorePickup =
        isStorePickupMethod(o) ||
        (o.shipping === "pickup" && o.payment === "store_pickup");
      if (isStorePickup) {
        const methodName = o.payment_method_name || "Bayar di Toko (Store Pickup)";
        await c.query(
          "UPDATE orders SET payment='store_pickup',payment_type='store_pickup',payment_method_name=?,payment_status='PENDING',status='Menunggu Pengambilan & Pembayaran',payment_url='/#account/orders' WHERE id=?",
          [methodName, o.id],
        );
        result = {
          ...o,
          payment: "store_pickup",
          payment_type: "store_pickup",
          payment_method_name: methodName,
          payment_status: "PENDING",
          status: "Menunggu Pengambilan & Pembayaran",
          payment_url: "/#account/orders",
        };
        const settingsRows = (
          await c.query(
            "SELECT setting_key, setting_value FROM store_settings WHERE setting_key IN ('brand','storeAddress','contactPhone','pickupInfo')",
          )
        ).rows;
        const settingsMap = Object.fromEntries(
          settingsRows.map(({ setting_key, setting_value }) => {
            try {
              return [setting_key, typeof setting_value === "string" ? JSON.parse(setting_value) : setting_value];
            } catch {
              return [setting_key, setting_value];
            }
          }),
        );
        const address = orderRow(o).address;
        const brandName = settingsMap.brand || "Kintsugi";
        const storeAddr = settingsMap.storeAddress ? `\nLokasi Toko: ${settingsMap.storeAddress}` : "";
        const pickupNote = settingsMap.pickupInfo ? `\nCatatan: ${settingsMap.pickupInfo}` : "";
        const totalStr = `Rp${Number(o.total).toLocaleString("id-ID")}`;
        const msg =
          `Halo ${address.name}, pesanan Ambil di Toko *${o.id}* sebesar *${totalStr}* telah kami catat (Status: Menunggu Pengambilan & Pembayaran).` +
          ` Pembayaran dilakukan langsung saat pengambilan di toko.${storeAddr}${pickupNote}\n\nTerima kasih telah berbelanja di ${brandName}.`;
        await queueWhatsApp(c, "pickup/" + o.id, address.phone, msg);
        await c.query("COMMIT");
        return result;
      }

      const method = (
        await c.query("SELECT * FROM store_payment_methods WHERE id=?", [o.payment])
      ).rows[0];
      const isCod = isCodMethod(method) || o.payment === "COD";
      const isQrisManual =
        isManualQrisMethod(method) || o.payment_type === PAYMENT_TYPES.QRIS_MANUAL;

      if (isCod) {
        const methodName = method?.name || "Bayar di Tempat (COD)";
        await c.query(
          "UPDATE orders SET payment_type='cod',payment_method_name=?,payment_status='PENDING',status='Diproses',payment_url='/#account' WHERE id=?",
          [methodName, o.id],
        );
        result = {
          ...o,
          payment_type: "cod",
          payment_method_name: methodName,
          payment_status: "PENDING",
          status: "Diproses",
          payment_url: "/#account",
        };
        const address = orderRow(o).address;
        const values = {
          nama: address.name,
          nomor_pesanan: o.id,
          total: `Rp${Number(o.total).toLocaleString("id-ID")}`,
          toko: "Kintsugi",
          nomor_resi: o.tracking_number || "",
          kurir: o.shipping_name || "",
        };
        await queueWhatsApp(c, "processing/" + o.id, address.phone, await notification(c, "processing", values));
        await c.query("COMMIT");
        return result;
      }

      if (isQrisManual) {
        const staticPayload = String(
          method?.qris_payload || o.qris_static_payload || "",
        ).trim();
        const staticValidation = validateQrisPayload(staticPayload);
        if (!staticValidation.valid || !staticValidation.parsed) {
          throw fail(
            502,
            `Konfigurasi QRIS manual tidak valid: ${staticValidation.errors.join(" ")}`,
          );
        }

        const methodMode = method?.qris_mode === "static" ? "static" : "dynamic";
        let qrisPayloadActual = staticValidation.parsed.normalized;
        let qrisModeActual = "static_fallback";

        if (methodMode === "dynamic" && Number(o.total) > 0) {
          try {
            const converted = convertStaticQrisToDynamic(
              staticValidation.parsed.normalized,
              Number(o.total),
            );
            qrisPayloadActual = converted.payload;
            qrisModeActual = "dynamic";
          } catch {
            // Fallback ke QRIS statis jika konversi dinamis tidak memungkinkan
            qrisPayloadActual = staticValidation.parsed.normalized;
            qrisModeActual = "static_fallback";
          }
        }

        const methodName =
          method?.name ||
          o.payment_method_name ||
          `QRIS ${staticValidation.parsed.provider || "Manual"}`.trim();
        const merchantName =
          method?.qris_merchant_name ||
          staticValidation.parsed.merchantName ||
          o.qris_merchant_name ||
          "";
        const provider =
          method?.qris_provider ||
          staticValidation.parsed.provider ||
          o.qris_provider ||
          "QRIS";

        await c.query(
          `UPDATE orders
           SET payment_type=?, payment_method_name=?, qris_payload=?, qris_static_payload=?,
               qris_mode=?, qris_merchant_name=?, qris_provider=?,
               payment_status='PENDING', payment_url='/#account/orders'
           WHERE id=?`,
          [
            PAYMENT_TYPES.QRIS_MANUAL,
            methodName,
            qrisPayloadActual,
            staticValidation.parsed.normalized,
            qrisModeActual,
            merchantName,
            provider,
            o.id,
          ],
        );

        result = {
          ...o,
          payment_type: PAYMENT_TYPES.QRIS_MANUAL,
          payment_method_name: methodName,
          qris_payload: qrisPayloadActual,
          qris_static_payload: staticValidation.parsed.normalized,
          qris_mode: qrisModeActual,
          qris_merchant_name: merchantName,
          qris_provider: provider,
          payment_status: "PENDING",
          payment_url: "/#account/orders",
        };
        await c.query("COMMIT");
        return result;
      }
      try {
        const invoice = await gateway.create(o);
        if (
          !invoice.id ||
          !/^https:\/\/(?:[a-z0-9-]+\.)*xendit\.co\//i.test(
            invoice.invoice_url || "",
          ) ||
          invoice.external_id !== o.id ||
          Number(invoice.amount) !== o.total ||
          invoice.currency !== "IDR"
        )
          throw fail(502, "Respons pembayaran tidak valid.");
        const expires = new Date(invoice.expiry_date);
        if (!Number.isFinite(expires.getTime()))
          throw fail(502, "Batas waktu pembayaran tidak valid.");
        await c.query(
          "UPDATE orders SET invoice_id=?,payment_url=?,expires_at=?,payment_status='PENDING' WHERE id=?",
          [invoice.id, invoice.invoice_url, expires, o.id],
        );
        result = {
          ...o,
          invoice_id: invoice.id,
          payment_url: invoice.invoice_url,
          expires_at: expires,
          payment_status: "PENDING",
        };
      } catch (e) {
        if (e.definitive) {
          await releaseStock(c, o);
          await c.query(
            "UPDATE orders SET status='Dibatalkan',payment_status='FAILED' WHERE id=?",
            [o.id],
          );
        }
        await c.query("COMMIT");
        throw e;
      }
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async function apply(invoice, cancelled = false) {
    const c = await pool.connect();
    try {
      await c.query("START TRANSACTION");
      const { rows } = await c.query(
        "SELECT * FROM orders WHERE id=? FOR UPDATE",
        [invoice.external_id],
      );
      const o = rows[0];
      if (!o) throw fail(404, "Pesanan pembayaran tidak ditemukan.");
      validateInvoice(invoice, o);
      const key = createHash("sha256")
        .update(invoice.id + ":" + invoice.status)
        .digest("hex");
      if (
        (
          await c.query(
            "SELECT event_key FROM payment_events WHERE event_key=?",
            [key],
          )
        ).rows.length
      ) {
        await c.query("COMMIT");
        return { duplicate: true };
      }
      if (["PAID", "SETTLED"].includes(invoice.status)) {
        if (
          o.stock_released ||
          ["FAILED", "EXPIRED", "CANCELLED"].includes(o.payment_status)
        )
          throw fail(
            409,
            "Pesanan sudah ditutup. Pembayaran memerlukan pemeriksaan admin.",
          );
        if (o.payment_status !== "PAID") {
          await c.query(
            "UPDATE orders SET payment_status='PAID',status='Diproses',paid_at=UTC_TIMESTAMP(3) WHERE id=?",
            [o.id],
          );
          const address = orderRow(o).address;
          // Kirim notifikasi pembayaran diterima via WhatsApp
          const values={nama:address.name,nomor_pesanan:o.id,total:`Rp${Number(o.total).toLocaleString("id-ID")}`,toko:"Kintsugi",nomor_resi:o.tracking_number||"",kurir:o.shipping_name||""};
          await queueWhatsApp(
            c,
            "purchased/" + o.id,
            address.phone,
            await notification(c,"purchased",values),
          );
          await queueWhatsApp(c,"processing/"+o.id,address.phone,await notification(c,"processing",values));
        }
      } else if (["EXPIRED", "FAILED"].includes(invoice.status)) {
        if (o.payment_status === "PAID")
          throw fail(
            409,
            "Pembayaran lunas tidak dapat dikembalikan menjadi kedaluwarsa.",
          );
        if (!o.stock_released) {
          await releaseStock(c, o);
          await c.query(
            "UPDATE orders SET status='Dibatalkan',payment_status=? WHERE id=?",
            [cancelled ? "CANCELLED" : invoice.status, o.id],
          );
        }
      } else if (invoice.status !== "PENDING")
        throw fail(400, "Status invoice tidak didukung.");
      await c.query(
        "INSERT INTO payment_events(event_key,order_id,provider_status) VALUES(?,?,?)",
        [key, o.id, invoice.status],
      );
      await c.query("COMMIT");
      return { ok: true };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async function resolveMethodFlags(order) {
    if (order.payment_type === PAYMENT_TYPES.STORE_PICKUP || order.payment === "store_pickup") {
      return { isCod: false, isQrisManual: false, isStorePickup: true };
    }
    if (order.payment_type === PAYMENT_TYPES.COD) return { isCod: true, isQrisManual: false, isStorePickup: false };
    if (order.payment_type === PAYMENT_TYPES.QRIS_MANUAL) return { isCod: false, isQrisManual: true, isStorePickup: false };
    const method = (
      await pool.query(
        "SELECT id, group_name, payment_type, qris_payload FROM store_payment_methods WHERE id=?",
        [order.payment],
      )
    ).rows[0];
    return {
      isCod: isCodMethod(method) || order.payment === "COD",
      isQrisManual: isManualQrisMethod(method),
      isStorePickup: false,
    };
  }
  async function sync(order) {
    const { isCod, isQrisManual, isStorePickup } = await resolveMethodFlags(order);
    if (isCod || isQrisManual || isStorePickup) return;
    if (order.payment_status === "CREATING") order = await ensure(order.id);
    if (
      order.invoice_id &&
      ["PENDING", "CREATING"].includes(order.payment_status)
    )
      await apply(await gateway.get(order.invoice_id));
  }
  async function cancel(order) {
    const { isCod, isQrisManual, isStorePickup } = await resolveMethodFlags(order);
    if (isCod || isQrisManual || isStorePickup) {
      const allowedStatus = isStorePickup
        ? ["Menunggu Pengambilan & Pembayaran", "Menunggu pembayaran", "Diproses"].includes(order.status) &&
          order.payment_status !== "PAID"
        : isCod
          ? order.status === "Menunggu pembayaran" || order.status === "Diproses"
          : order.status === "Menunggu pembayaran" &&
            ["CREATING", "PENDING", "WAITING_VERIFICATION"].includes(order.payment_status);
      if (!allowedStatus)
        throw fail(409, "Pesanan ini tidak dapat dibatalkan.");
      const c = await pool.connect();
      try {
        await c.query("START TRANSACTION");
        const o = (await c.query("SELECT * FROM orders WHERE id=? FOR UPDATE", [order.id])).rows[0];
        if (!o.stock_released) {
          await releaseStock(c, o);
          await c.query("UPDATE orders SET status='Dibatalkan',payment_status='CANCELLED' WHERE id=?", [o.id]);
        }
        await c.query("COMMIT");
        return;
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    }
    if (
      order.status !== "Menunggu pembayaran" ||
      !["CREATING", "PENDING"].includes(order.payment_status)
    )
      throw fail(409, "Pesanan ini tidak dapat dibatalkan.");
    if (!order.invoice_id) order = await ensure(order.id);
    const invoice = await gateway.get(order.invoice_id);
    if (["PAID", "SETTLED"].includes(invoice.status)) {
      await apply(invoice);
      throw fail(
        409,
        "Pembayaran sudah diterima. Pesanan tidak dapat dibatalkan.",
      );
    }
    const expired =
      invoice.status === "EXPIRED"
        ? invoice
        : await gateway.expire(order.invoice_id);
    if (expired.status !== "EXPIRED") {
      if (["PAID", "SETTLED"].includes(expired.status)) await apply(expired);
      throw fail(
        409,
        "Pembatalan pembayaran belum dikonfirmasi. Coba muat ulang.",
      );
    }
    await apply(expired, true);
  }
  return { ensure, apply, sync, cancel, notification };
}
