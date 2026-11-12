import React, { useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  ImagePlus,
  QrCode,
  RefreshCw,
  ShieldAlert,
  Upload,
} from "lucide-react";
import { api } from "./store";
import { money } from "./data";
import { Notice, Status } from "./Workspace";

export default function QrisPanel({ order, onUpdated, notify }) {
  const [useStaticFallback, setUseStaticFallback] = useState(
    order?.qris_mode !== "dynamic",
  );
  const [proofData, setProofData] = useState("");
  const [proofName, setProofName] = useState("");
  const [note, setNote] = useState(order?.payment_proof_note || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showReupload, setShowReupload] = useState(false);

  if (!order) return null;

  const isPaid = order.payment_status === "PAID";
  const isWaitingVerification = order.payment_status === "WAITING_VERIFICATION";
  const isAwaitingOrder = order.status === "Menunggu pembayaran";

  const hasDynamicQr =
    order.qris_mode === "dynamic" && Boolean(order.qrisQrDataUrl);
  const isDynamicShown = hasDynamicQr && !useStaticFallback;
  const activeQrSrc = isDynamicShown
    ? order.qrisQrDataUrl
    : order.qrisStaticQrDataUrl || order.qrisQrDataUrl || "";
  const activePayload = isDynamicShown
    ? order.qris_payload
    : order.qris_static_payload || order.qris_payload || "";

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(String(text || ""));
      notify?.(`${label} berhasil disalin.`);
    } catch {
      notify?.(`Gagal menyalin otomatis. Nilai: ${text}`);
    }
  }

  function handleFileChange(event) {
    setError("");
    const file = event.target.files?.[0];
    if (!file) {
      setProofData("");
      setProofName("");
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Format file harus gambar PNG, JPG, atau WebP.");
      return;
    }
    if (file.size > 5_000_000) {
      setError("Ukuran bukti pembayaran maksimal 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setProofData(String(reader.result || ""));
      setProofName(file.name);
    };
    reader.onerror = () => {
      setError("Gagal membaca file gambar bukti pembayaran.");
    };
    reader.readAsDataURL(file);
  }

  async function handleConfirmPayment(event) {
    event.preventDefault();
    if (!proofData) {
      setError("Pilih atau unggah gambar bukti pembayaran terlebih dahulu.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const updated = await api(
        `/orders/${encodeURIComponent(order.id)}/confirm-payment`,
        {
          method: "POST",
          body: {
            proofData,
            note: note.trim(),
          },
        },
      );
      setProofData("");
      setProofName("");
      setShowReupload(false);
      onUpdated?.(updated);
      notify?.(
        "Konfirmasi pembayaran terkirim. Status kini Menunggu Verifikasi Admin.",
      );
    } catch (err) {
      setError(err.message || "Gagal mengirim konfirmasi pembayaran.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="ks-qris-card" aria-label="Pembayaran QRIS Manual">
      <div className="ks-qris-header">
        <div className="ks-qris-title">
          <QrCode size={20} />
          <div>
            <h4>{order.payment_method_name || "Pembayaran QRIS"}</h4>
            <p>
              Merchant: <b>{order.qris_merchant_name || "-"}</b>
              {order.qris_provider ? ` · Penyedia ${order.qris_provider}` : ""}
            </p>
          </div>
        </div>
        <Status
          tone={
            isPaid ? "success" : isWaitingVerification ? "warning" : "neutral"
          }
        >
          {isPaid
            ? "Lunas"
            : isWaitingVerification
              ? "Menunggu Verifikasi"
              : order.status === "Dibatalkan"
                ? "Dibatalkan"
                : "Menunggu Pembayaran"}
        </Status>
      </div>

      <div className="ks-qris-meta-grid">
        <div>
          <small>Nomor Pesanan</small>
          <div className="ks-qris-copy-row">
            <b className="ws-mono">#{order.id.slice(-8).toUpperCase()}</b>
            <button
              type="button"
              className="ws-link"
              onClick={() => copyText(order.id, "Nomor pesanan")}
            >
              <Copy size={13} /> Salin
            </button>
          </div>
        </div>
        <div>
          <small>Total Pembayaran</small>
          <div className="ks-qris-copy-row">
            <strong className="ks-qris-total">{money(order.total)}</strong>
            <button
              type="button"
              className="ws-link"
              onClick={() => copyText(String(order.total), "Nominal angka")}
            >
              <Copy size={13} /> Salin nominal
            </button>
          </div>
        </div>
      </div>

      {isPaid ? (
        <div className="ks-qris-verified-box">
          <CheckCircle2 size={20} />
          <div>
            <b>Pembayaran Terverifikasi (Lunas)</b>
            <p>
              Admin telah memverifikasi mutasi pembayaran Anda. Pesanan
              dilanjutkan ke tahap pemrosesan.
            </p>
            {order.payment_proof_url && (
              <a
                href={order.payment_proof_url}
                target="_blank"
                rel="noreferrer"
                className="ws-link"
              >
                Lihat bukti pembayaran terlampir
              </a>
            )}
          </div>
        </div>
      ) : !isAwaitingOrder ? null : (
        <>
          <div className="ks-qris-stage">
            <div className="ks-qris-qr-column">
              <div className="ks-qris-mode-badge">
                {isDynamicShown
                  ? "QRIS Dinamis · Nominal Otomatis"
                  : "QRIS Statis Fallback · Input Nominal Manual"}
              </div>
              {activeQrSrc ? (
                <div className="ks-qris-image-wrap">
                  <img
                    src={activeQrSrc}
                    alt={`QRIS ${order.qris_merchant_name || "Pembayaran"}`}
                  />
                </div>
              ) : (
                <Notice>Kode QR belum tersedia untuk pesanan ini.</Notice>
              )}
              <div className="ks-qris-qr-actions">
                {activeQrSrc && (
                  <a
                    className="ws-button small"
                    href={activeQrSrc}
                    download={`qris-${order.id}.png`}
                  >
                    <Download size={14} /> Unduh QR
                  </a>
                )}
                {hasDynamicQr && order.qrisStaticQrDataUrl && (
                  <button
                    type="button"
                    className="ws-button small"
                    onClick={() => setUseStaticFallback((prev) => !prev)}
                  >
                    <RefreshCw size={14} />
                    {useStaticFallback
                      ? "Kembali ke QR Dinamis"
                      : "Gunakan QRIS Statis Fallback"}
                  </button>
                )}
              </div>
              {!isDynamicShown && (
                <div className="ks-qris-static-amount-hint">
                  Masukkan nominal tepat sebesar{" "}
                  <b>{money(order.total)}</b> di aplikasi pembayaran saat scan
                  QR statis ini.
                </div>
              )}
            </div>

            <div className="ks-qris-instructions">
              <h5>Cara Pembayaran QRIS</h5>
              <ol>
                <li>
                  Buka aplikasi <b>DANA</b>, GoPay, OVO, ShopeePay, LinkAja,
                  atau Mobile Banking yang mendukung QRIS.
                </li>
                <li>
                  Pindai kode QR di samping atau unduh gambar QR lalu impor dari
                  galeri aplikasi pembayaran Anda.
                </li>
                <li>
                  Pastikan nama penerima adalah{" "}
                  <b>{order.qris_merchant_name || "-"}</b> dan total pembayaran
                  tepat sebesar <b>{money(order.total)}</b>.
                  {!isDynamicShown &&
                    " (Ketik nominal secara manual pada layar pembayaran Anda)."}
                </li>
                <li>
                  Setelah pembayaran berhasil, simpan tangkapan layar bukti
                  transfer dan unggah di bawah lalu tekan{" "}
                  <b>Konfirmasi Pembayaran</b>.
                </li>
              </ol>

              <div className="ks-qris-caution">
                <ShieldAlert size={16} />
                <div>
                  <b>Catatan Kompatibilitas & Verifikasi Manual:</b>{" "}
                  {isDynamicShown
                    ? "QRIS ini membawa nominal otomatis standar EMVCo (tag 54 & CRC16 valid). Jika aplikasi pembayaran Anda menolak QR nominal otomatis, klik tombol Gunakan QRIS Statis Fallback di samping dan ketik nominal secara manual."
                    : "Mode QRIS Statis digunakan. Harap periksa kembali angka nominal sebelum menyelesaikan transfer."}{" "}
                  Status akan tetap <b>Menunggu Verifikasi</b> sampai Admin
                  memeriksa mutasi masuk pada akun DANA.
                </div>
              </div>

              {activePayload && (
                <details className="ks-qris-payload-details">
                  <summary>Detail payload EMVCo/QRIS</summary>
                  <code className="ws-mono">{activePayload}</code>
                </details>
              )}
            </div>
          </div>

          <div className="ks-qris-confirmation-box">
            <h5>Konfirmasi Pembayaran & Unggah Bukti</h5>
            {order.payment_rejection_reason && (
              <Notice>
                Bukti sebelumnya perlu diperbaiki:{" "}
                <b>{order.payment_rejection_reason}</b>
              </Notice>
            )}
            <Notice>{error}</Notice>

            {isWaitingVerification && !showReupload ? (
              <div className="ks-qris-waiting-box">
                <div className="ks-qris-waiting-head">
                  <Clock3 size={18} />
                  <div>
                    <b>Bukti Pembayaran Terkirim — Menunggu Verifikasi</b>
                    <p>
                      Admin telah menerima notifikasi WhatsApp dan akan memeriksa
                      mutasi masuk akun DANA sebelum menyetujui transaksi menjadi
                      Lunas.
                    </p>
                  </div>
                </div>
                {order.payment_proof_url && (
                  <div className="ks-qris-proof-preview-row">
                    <a
                      href={order.payment_proof_url}
                      target="_blank"
                      rel="noreferrer"
                      className="ks-qris-proof-thumb"
                    >
                      <img
                        src={order.payment_proof_url}
                        alt="Bukti pembayaran pelanggan"
                      />
                    </a>
                    <div>
                      <small>Bukti pembayaran terunggah</small>
                      {order.payment_submitted_at && (
                        <p>
                          Dikirim pada{" "}
                          {new Date(order.payment_submitted_at).toLocaleString(
                            "id-ID",
                          )}
                        </p>
                      )}
                      {order.payment_proof_note && (
                        <p>Catatan: {order.payment_proof_note}</p>
                      )}
                      <button
                        type="button"
                        className="ws-link"
                        onClick={() => setShowReupload(true)}
                      >
                        Unggah ulang bukti lain
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <form className="ks-qris-upload-form" onSubmit={handleConfirmPayment}>
                <label className="ks-qris-file-label">
                  <span>
                    <ImagePlus size={16} />
                    {proofName
                      ? `File dipilih: ${proofName}`
                      : "Pilih gambar bukti transfer QRIS (PNG / JPG / WebP, maks. 5 MB)"}
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleFileChange}
                  />
                </label>

                {proofData && (
                  <div className="ks-qris-upload-preview">
                    <img src={proofData} alt="Pratinjau bukti pembayaran" />
                  </div>
                )}

                <label>
                  Catatan Pembayaran (opsional)
                  <input
                    type="text"
                    maxLength={500}
                    placeholder="Contoh: Transfer dari DANA a.n. Budi pukul 14:20"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>

                <div className="ks-qris-upload-actions">
                  <button
                    type="submit"
                    className="ws-button primary"
                    disabled={submitting || !proofData}
                  >
                    <Upload size={16} />
                    {submitting
                      ? "Mengirim bukti…"
                      : "Konfirmasi Pembayaran"}
                  </button>
                  {isWaitingVerification && (
                    <button
                      type="button"
                      className="ws-button"
                      disabled={submitting}
                      onClick={() => {
                        setShowReupload(false);
                        setProofData("");
                        setProofName("");
                      }}
                    >
                      Batal
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </section>
  );
}
