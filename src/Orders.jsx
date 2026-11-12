import React, { useState } from "react";
import {
  ArrowUpRight,
  RefreshCw,
  ChevronDown,
  Package,
  CheckCircle2,
  Clock3,
} from "lucide-react";
import { api } from "./store";
import { colorLabel, money } from "./data";
import { paymentName } from './payment-methods';
import { Notice, Status } from "./Workspace";
import { dimensionLabel } from "./dimensions.js";
import QrisPanel from "./QrisPanel.jsx";
export const paymentLabel = {
  CREATING: "Menyiapkan pembayaran",
  PENDING: "Belum dibayar",
  WAITING_VERIFICATION: "Menunggu Verifikasi",
  PAID: "Lunas",
  FAILED: "Pembayaran gagal",
  EXPIRED: "Kedaluwarsa",
  CANCELLED: "Dibatalkan",
};
export default function OrderCard({ order: o, onRefresh, notify, config }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  async function action(path) {
    setBusy(true);
    setError("");
    try {
      await api("/orders/" + o.id + "/" + path, { method: "POST" });
      await onRefresh();
      setConfirm(false);
      notify(
        path === "cancel"
          ? "Pesanan dibatalkan. Stok telah dikembalikan."
          : "Status pembayaran diperbarui.",
      );
    } catch (e) {
      setError(e.message);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }
  const pending = o.status === "Menunggu pembayaran",
    awaitingPickup = o.status === "Menunggu Pengambilan & Pembayaran",
    cancelled = o.status === "Dibatalkan",
    isStorePickup = o.payment_type === "store_pickup" || o.payment === "store_pickup",
    isCod = !isStorePickup && (o.payment_type === "cod" || o.payment === "COD"),
    isQrisManual =
      !isStorePickup &&
      (o.payment_type === "qris_manual" ||
        Boolean(o.qris_payload || o.qris_static_payload));
  const waDigits = String(config?.contactPhone || "").replace(/\D/g, "");
  const waHref = waDigits
    ? `https://wa.me/${waDigits.startsWith("0") ? "62" + waDigits.slice(1) : waDigits}`
    : "";
  return (
    <article className="ws-order">
      <div className="ws-order-heading">
        <div>
          <p className="ws-kicker">PESANAN #{o.id.slice(-8).toUpperCase()}</p>
          <span>
            {new Date(o.createdAt).toLocaleString("id-ID", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        </div>
        <Status
          tone={
            o.payment_status === "PAID"
              ? "success"
              : cancelled
                ? "neutral"
                : "warning"
          }
        >
          {o.status}
        </Status>
      </div>
      <div className="ws-order-items">
        {o.items.map((i, j) => (
          <div key={j}>
            <img src={i.image} alt={i.name} />
            <div>
              <b>{i.name}</b>
              <span>
                Ukuran {dimensionLabel(i.size)} ·{" "}
                {i.variation_label || "Variasi"}: {colorLabel(i.color)} ·{" "}
                {i.quantity} barang
              </span>
              <small>{money(i.price)} / barang</small>
            </div>
            <strong>{money(i.quantity * i.price)}</strong>
          </div>
        ))}
      </div>
      <div className="ws-order-total">
        <div>
          <span>{o.payment_method_name || paymentName(o.payment, config?.paymentMethods)}</span>
          <Status
            tone={
              o.payment_status === "PAID"
                ? "success"
                : pending || awaitingPickup
                  ? "warning"
                  : "neutral"
            }
          >
            {paymentLabel[o.payment_status] || o.payment_status}
          </Status>
        </div>
        <div>
          <span>Total pembayaran</span>
          <strong>{money(o.total)}</strong>
        </div>
      </div>
      <Notice>{error}</Notice>
      {isStorePickup && !cancelled && o.payment_status !== "PAID" && (
        <div className="ks-pickup-instruction-card ks-pickup-order-card">
          <p className="ks-pickup-highlight">
            Pembayaran dilakukan saat pengambilan di toko
          </p>
          <p className="ws-muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
            <b>Alamat Toko:</b> {config?.storeAddress || "Hubungi admin WhatsApp untuk detail alamat toko."}
            {config?.contactPhone && (
              <>
                {" · "}
                <b>WhatsApp:</b>{" "}
                {waHref ? (
                  <a href={waHref} target="_blank" rel="noreferrer" className="ws-link">
                    {config.contactPhone}
                  </a>
                ) : (
                  config.contactPhone
                )}
              </>
            )}
          </p>
          {config?.pickupInfo && (
            <p className="ws-muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
              {config.pickupInfo}
            </p>
          )}
        </div>
      )}
      {isQrisManual && (pending || o.payment_proof_url) && (
        <QrisPanel
          order={o}
          onUpdated={() => onRefresh?.()}
          notify={notify}
        />
      )}
      {(pending || (isStorePickup && awaitingPickup && o.payment_status !== "PAID")) && (
        <div className="ws-payment-actions">
          {isStorePickup ? (
            <p className="ws-payment-expiry" style={{ width: "100%", margin: "4px 0" }}>
              Status: <b>{o.status}</b>. Selesaikan pembayaran langsung di kasir saat mengambil pesanan.
            </p>
          ) : isCod ? (
            <p className="ws-payment-expiry" style={{ width: "100%", margin: "4px 0" }}>
              Metode Bayar di Tempat (COD). Siapkan uang pas kepada kurir saat pesanan sampai.
            </p>
          ) : isQrisManual ? null : (
            <>
              {o.payment_url && /^https?:\/\//i.test(o.payment_url) && (
                <a className="ws-button primary" href={o.payment_url}>
                  Bayar sekarang
                  <ArrowUpRight size={17} />
                </a>
              )}
              <button
                className="ws-button"
                disabled={busy}
                onClick={() => action("payment")}
              >
                <RefreshCw size={16} />
                {busy
                  ? "Memeriksa…"
                  : o.payment_status === "CREATING"
                    ? "Siapkan pembayaran"
                    : "Periksa pembayaran"}
              </button>
            </>
          )}
          <button
            className="ws-link danger"
            disabled={busy}
            onClick={() => setConfirm(!confirm)}
          >
            Batalkan pesanan
          </button>
        </div>
      )}
      {confirm && (
        <div className="ws-confirm">
          <p>
            Batalkan pesanan ini? Tautan pembayaran akan ditutup dan stok
            dikembalikan setelah pembatalan dikonfirmasi.
          </p>
          <button
            className="ws-button danger-button"
            disabled={busy}
            onClick={() => action("cancel")}
          >
            Ya, batalkan
          </button>
          <button className="ws-button" onClick={() => setConfirm(false)}>
            Kembali
          </button>
        </div>
      )}
      {pending && o.expires_at && o.payment !== "COD" && (
        <p className="ws-payment-expiry">
          <Clock3 size={15} />
          Bayar sebelum {new Date(o.expires_at).toLocaleString("id-ID")}
        </p>
      )}
      {!cancelled && (
        <div className="ws-order-progress">
          {["Diproses", "Dikirim", "Selesai"].map((step, index) => (
            <span
              key={step}
              className={
                ["Diproses", "Dikirim", "Selesai"].indexOf(o.status) >= index
                  ? "done"
                  : ""
              }
            >
              <CheckCircle2 size={16} />
              {step}
            </span>
          ))}
        </div>
      )}
      <details className="ws-order-details">
        <summary>
          Lihat rincian pesanan & alamat <ChevronDown size={16} />
        </summary>
        <div>
          <p>
            <b>Penerima</b>
            <br />
            {o.address.name} · {o.address.phone}
            <br />
            {o.address.street}, {o.address.city} {o.address.postal}
            <br />
            {o.address.email}
          </p>
          <dl>
            <div>
              <dt>Pengiriman</dt>
              <dd>
                {
                  {
                    regular: "Reguler",
                    express: "Ekspres",
                    pickup: "Pengambilan pesanan",
                  }[o.shipping]
                }
              </dd>
            </div>
            <div>
              <dt>Subtotal</dt>
              <dd>{money(o.subtotal)}</dd>
            </div>
            <div>
              <dt>Diskon</dt>
              <dd>−{money(o.discount)}</dd>
            </div>
            <div>
              <dt>Ongkir</dt>
              <dd>{money(o.delivery)}</dd>
            </div>
            <div>
              <dt>Nomor lengkap</dt>
              <dd className="ws-mono">{o.id}</dd>
            </div>
          </dl>
        </div>
      </details>
    </article>
  );
}
