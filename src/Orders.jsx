import React, { useState } from "react";
import {
  ArrowUpRight,
  RefreshCw,
  ChevronDown,
  Package,
  CheckCircle2,
  Clock3,
  Truck,
  Copy,
  Check,
  MapPin,
  ExternalLink,
} from "lucide-react";
import { api } from "./store";
import { colorLabel, money } from "./data";
import { paymentName, isManualPaymentMethod } from './payment-methods';
import { Notice, Status } from "./Workspace";
import { dimensionLabel } from "./dimensions.js";
import QrisPanel from "./QrisPanel.jsx";
import { handleImageError, resolveMediaUrl } from "./variant-utils.js";
import { resolveShippingInfo } from "./shipping-info.js";
export const paymentLabel = {
  CREATING: "Menyiapkan pembayaran",
  PENDING: "Belum dibayar",
  WAITING_VERIFICATION: "Menunggu Verifikasi",
  PAID: "Lunas",
  FAILED: "Pembayaran gagal",
  EXPIRED: "Kedaluwarsa",
  CANCELLED: "Dibatalkan",
  REJECTED: "Pembayaran Ditolak",
};
export default function OrderCard({ order: o, onRefresh, notify, config }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false),
    [copiedResi, setCopiedResi] = useState(false);

  const shipInfo = resolveShippingInfo(o);

  async function handleCopyResi(resi) {
    if (!resi) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(resi);
      } else {
        const ta = document.createElement("textarea");
        ta.value = resi;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedResi(true);
      notify?.("Nomor resi berhasil disalin ke papan klip.");
      setTimeout(() => setCopiedResi(false), 2500);
    } catch (_) {
      notify?.("Gagal menyalin nomor resi.");
    }
  }

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
    isManual = !isStorePickup && !isCod && isManualPaymentMethod(o);
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
            <img src={resolveMediaUrl(i.image)} alt={i.name} onError={(e) => handleImageError(e)} />
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
      {/* Informasi Pilihan Kurir & Status Pengantaran */}
      {shipInfo && (
        <div className="ks-order-shipping-panel">
          <div className="ks-order-shipping-header">
            <div className="ks-order-shipping-courier">
              <span
                className="ks-courier-badge"
                style={{
                  backgroundColor: shipInfo.courier.bg,
                  borderColor: shipInfo.courier.border,
                  color: shipInfo.courier.color,
                }}
              >
                <Truck size={14} />
                {shipInfo.courier.shortName}
              </span>
              <div className="ks-order-courier-title-wrap">
                <strong className="ks-order-courier-title">{shipInfo.title}</strong>
                <span className="ks-order-courier-service">{shipInfo.service}</span>
              </div>
            </div>
            <div className="ks-order-shipping-fee-wrap">
              <span className="ks-order-shipping-fee-label">Ongkos Kirim</span>
              <strong className={`ks-order-shipping-fee ${shipInfo.isFree ? "free" : ""}`}>
                {shipInfo.deliveryCostLabel}
              </strong>
            </div>
          </div>

          <div className="ks-order-shipping-body">
            <div className="ks-order-shipping-status-banner">
              <div className="ks-order-status-indicator-col">
                <span
                  className={`ks-order-status-dot ${
                    o.status === "Dikirim"
                      ? "in-transit"
                      : o.status === "Selesai"
                        ? "delivered"
                        : o.status === "Dibatalkan"
                          ? "cancelled"
                          : "processing"
                  }`}
                />
              </div>
              <div className="ks-order-status-content">
                <p className="ks-order-status-headline">{shipInfo.statusText}</p>
                <p className="ks-order-status-desc">{shipInfo.statusDetail}</p>
              </div>
            </div>

            {/* Nomor Resi Pengantaran (Jika Tersedia) */}
            {shipInfo.trackingNumber ? (
              <div className="ks-order-resi-card">
                <div className="ks-order-resi-meta">
                  <span className="ks-order-resi-label">Nomor Resi / Pelacakan:</span>
                  <strong className="ks-order-resi-code">{shipInfo.trackingNumber}</strong>
                </div>
                <div className="ks-order-resi-buttons">
                  <button
                    type="button"
                    className="ks-order-btn-copy"
                    onClick={() => handleCopyResi(shipInfo.trackingNumber)}
                    title="Salin nomor resi"
                  >
                    {copiedResi ? <Check size={14} color="#057a55" /> : <Copy size={14} />}
                    <span>{copiedResi ? "Tersalin!" : "Salin Resi"}</span>
                  </button>
                  {shipInfo.trackUrl && (
                    <a
                      href={shipInfo.trackUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ks-order-btn-track"
                    >
                      <span>Lacak Resmi {shipInfo.courier.shortName}</span>
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              </div>
            ) : !shipInfo.isPickup && (o.status === "Diproses" || o.status === "Menunggu pembayaran") ? (
              <div className="ks-order-resi-placeholder">
                <small>
                  ℹ Nomor resi pengantaran resmi {shipInfo.courier.name} akan otomatis tercantum di sini segera setelah paket diserahkan ke pihak kurir.
                </small>
              </div>
            ) : null}

            {/* Alamat Pengantaran */}
            {!shipInfo.isPickup && o.address && (
              <div className="ks-order-address-box">
                <div className="ks-order-address-icon">
                  <MapPin size={16} />
                </div>
                <div className="ks-order-address-text">
                  <div className="ks-order-address-recipient">
                    <b>{o.address.name}</b>
                    {o.address.phone && <span> · {o.address.phone}</span>}
                  </div>
                  <p className="ks-order-address-detail">
                    {o.address.street}, {o.address.city} {o.address.postal}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
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
      {isManual && (pending || o.payment_proof_url || o.payment_status === "WAITING_VERIFICATION" || o.payment_status === "REJECTED") && (
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
          ) : isManual ? null : (
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
          {(shipInfo?.isPickup
            ? ["Diproses", "Siap Diambil", "Selesai"]
            : ["Diproses", "Dikirim", "Selesai"]
          ).map((step, index) => {
            const currentIdx = shipInfo?.isPickup
              ? o.status === "Selesai"
                ? 2
                : awaitingPickup || o.payment_status === "PAID"
                  ? 1
                  : 0
              : ["Diproses", "Dikirim", "Selesai"].indexOf(o.status);
            return (
              <span
                key={step}
                className={currentIdx >= index ? "done" : ""}
              >
                <CheckCircle2 size={16} />
                {step === "Dikirim" && shipInfo?.courier?.shortName
                  ? `Dikirim (${shipInfo.courier.shortName})`
                  : step}
              </span>
            );
          })}
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
              <dt>Kurir &amp; Pengantaran</dt>
              <dd>
                {shipInfo?.title ||
                  o.shipping_name ||
                  {
                    rajaongkir: "Ekspedisi Resmi",
                    local: "Kurir Toko",
                    regular: "Reguler",
                    express: "Ekspres",
                    pickup: "Ambil di Toko",
                  }[o.shipping] ||
                  o.shipping}
                {shipInfo?.trackingNumber ? ` · No. Resi: ${shipInfo.trackingNumber}` : ""}
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
