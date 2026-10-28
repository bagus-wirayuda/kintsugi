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
import { money } from "./data";
import { Notice, Status } from "./Workspace";
export const paymentLabel = {
  CREATING: "Menyiapkan pembayaran",
  PENDING: "Belum dibayar",
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
    cancelled = o.status === "Dibatalkan";
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
                Ukuran {i.size} ·{" "}
                <i className="color-dot" style={{ background: i.color }} /> ·{" "}
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
          <span>Pembayaran Xendit</span>
          <Status
            tone={
              o.payment_status === "PAID"
                ? "success"
                : pending
                  ? "warning"
                  : "neutral"
            }
          >
            {paymentLabel[o.payment_status]}
          </Status>
        </div>
        <div>
          <span>Total pembayaran</span>
          <strong>{money(o.total)}</strong>
        </div>
      </div>
      <Notice>{error}</Notice>
      {pending && (
        <div className="ws-payment-actions">
          {o.payment_url && o.payment_status === "PENDING" && (
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
            dikembalikan setelah Xendit mengonfirmasi.
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
      {pending && o.expires_at && (
        <p className="ws-payment-expiry">
          <Clock3 size={15} />
          Bayar sebelum {new Date(o.expires_at).toLocaleString("id-ID")}
        </p>
      )}
      {pending && config?.sandbox && (
        <div className="ws-payment-guide">
          <b>Pembayaran dalam mode uji</b>
          <p>
            Di halaman Xendit, pilih metode pembayaran lalu gunakan tombol
            simulasi pada banner Test Mode. Kode OTP bank/e-wallet mengikuti
            instruksi Xendit, bukan kode verifikasi akun toko.
          </p>
        </div>
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
