import React, { useState } from "react";
import {
  Building2,
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  Download,
  ImagePlus,
  QrCode,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Trash2,
  Upload,
} from "lucide-react";
import { api } from "./store";
import { money } from "./data";
import { Notice, Status } from "./Workspace";
import { isManualQrisMethod } from "./payment-methods.js";

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
  const isRejected = order.payment_status === "REJECTED";
  const isAwaitingOrder = order.status === "Menunggu pembayaran";

  const isQris = Boolean(order.qris_payload || order.qris_static_payload || isManualQrisMethod(order));
  const isBank = !isQris && (order.payment?.startsWith("BANK_") || order.group === "Bank" || order.group_name === "Bank");
  const isEwallet = !isQris && !isBank && (order.payment?.startsWith("EWALLET_") || order.group === "E-Wallet" || order.group_name === "E-Wallet");

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

  async function handleFileChange(event) {
    setError("");
    const file = event.target.files?.[0];
    if (!file) {
      setProofData("");
      setProofName("");
      return;
    }
    const allowedMime = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "image/gif",
      "image/bmp",
      "image/x-ms-bmp",
      "image/avif",
      "image/heic",
      "image/heif",
    ];
    const isImage =
      allowedMime.includes(file.type) ||
      /\.(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i.test(file.name || "");
    if (!isImage) {
      setError("Format file harus gambar (JPG, PNG, WebP, GIF, BMP, atau AVIF).");
      return;
    }
    if (file.size > 10_000_000) {
      setError("Ukuran bukti pembayaran maksimal 10 MB.");
      return;
    }
    const isBmp =
      file.type === "image/bmp" ||
      file.type === "image/x-ms-bmp" ||
      /\.bmp$/i.test(file.name || "");
    if (isBmp && typeof window !== "undefined" && window.createImageBitmap) {
      try {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(bitmap, 0, 0);
        setProofData(canvas.toDataURL("image/png"));
        setProofName(file.name);
        return;
      } catch (err) {
        console.warn("BMP canvas conversion fallback:", err);
      }
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
      setError("Pilih atau unggah gambar bukti transfer terlebih dahulu.");
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
        "Konfirmasi pembayaran berhasil dikirim. Status pesanan kini Menunggu Verifikasi Admin.",
      );
    } catch (err) {
      setError(err.message || "Gagal mengirim konfirmasi pembayaran.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="ks-qris-card" aria-label="Instruksi Pembayaran Manual">
      <div className="ks-qris-header">
        <div className="ks-qris-title">
          {isQris ? (
            <QrCode size={20} />
          ) : isBank ? (
            <Building2 size={20} />
          ) : (
            <Smartphone size={20} />
          )}
          <div>
            <h4>{order.payment_method_name || (isQris ? "Pembayaran QRIS" : isBank ? "Transfer Bank" : "Transfer E-Wallet")}</h4>
            <p>
              {isQris ? (
                <>
                  Merchant: <b>{order.qris_merchant_name || "-"}</b>
                  {order.qris_provider ? ` · Penyedia ${order.qris_provider}` : ""}
                </>
              ) : (
                <>
                  Tujuan: <b>{order.account_name || order.accountName || "PT Liny Jaya"}</b>
                  {order.account_number || order.accountNumber ? ` · No: ${order.account_number || order.accountNumber}` : ""}
                </>
              )}
            </p>
          </div>
        </div>
        <Status
          tone={
            isPaid
              ? "success"
              : isWaitingVerification
                ? "warning"
                : isRejected
                  ? "critical"
                  : "neutral"
          }
        >
          {isPaid
            ? "Lunas"
            : isWaitingVerification
              ? "Menunggu Verifikasi"
              : isRejected
                ? "Ditolak"
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
          <small>Total Tagihan Pembayaran</small>
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
              Admin telah memverifikasi mutasi pembayaran Anda. Pesanan sedang diproses dan dipersiapkan untuk pengiriman.
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
          {isQris ? (
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
                    Setelah transfer selesai, klik tombol{" "}
                    <b>"Saya Sudah Melakukan Pembayaran"</b> di bawah dan unggah bukti transfer Anda.
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
                    memeriksa mutasi masuk pada rekening/akun toko.
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
          ) : (
            <div className="ks-manual-bank-stage" style={{ padding: "18px 20px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", margin: "16px 0" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 14 }}>
                <div style={{ background: "#fff", padding: "14px 16px", borderRadius: 6, border: "1px solid #cbd5e1" }}>
                  <small style={{ color: "#64748b", display: "block", marginBottom: 4, fontWeight: 500 }}>
                    {isBank ? "Nomor Rekening Tujuan" : "Nomor Akun Tujuan"}
                  </small>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <b className="ws-mono" style={{ fontSize: 17, color: "#0f172a" }}>
                      {order.account_number || order.accountNumber || "-"}
                    </b>
                    {(order.account_number || order.accountNumber) && (
                      <button
                        type="button"
                        className="ws-link"
                        onClick={() => copyText(order.account_number || order.accountNumber, isBank ? "Nomor rekening" : "Nomor akun")}
                      >
                        <Copy size={13} /> Salin
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ background: "#fff", padding: "14px 16px", borderRadius: 6, border: "1px solid #cbd5e1" }}>
                  <small style={{ color: "#64748b", display: "block", marginBottom: 4, fontWeight: 500 }}>
                    Nama Pemilik / Penerima
                  </small>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <b style={{ fontSize: 16, color: "#0f172a" }}>
                      {order.account_name || order.accountName || "PT Liny Jaya"}
                    </b>
                    {(order.account_name || order.accountName) && (
                      <button
                        type="button"
                        className="ws-link"
                        onClick={() => copyText(order.account_name || order.accountName, "Nama penerima")}
                      >
                        <Copy size={13} /> Salin
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {order.instructions ? (
                <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.6, background: "#fff", padding: "12px 14px", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                  <b style={{ color: "#0f172a" }}>Instruksi Pembayaran:</b>
                  <p style={{ margin: "4px 0 0" }}>{order.instructions}</p>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.6, background: "#fff", padding: "12px 14px", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                  <b style={{ color: "#0f172a" }}>Instruksi Pembayaran:</b>
                  <ol style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    <li>Transfer ke rekening / nomor akun di atas dengan nominal tepat <b>{money(order.total)}</b>.</li>
                    <li>Simpan tangkapan layar atau bukti transfer berhasil.</li>
                    <li>Unggah bukti transfer di bawah lalu klik tombol <b>"Saya Sudah Melakukan Pembayaran"</b>.</li>
                  </ol>
                </div>
              )}
            </div>
          )}

          <div className="ks-qris-confirmation-box">
            <h5>Konfirmasi Pembayaran & Unggah Bukti</h5>

            {isRejected && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "14px 16px", marginBottom: 14, color: "#991b1b" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, marginBottom: 4 }}>
                  <ShieldAlert size={18} /> Bukti Pembayaran Sebelumnya Belum Disetujui
                </div>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
                  Alasan penolakan: <b>"{order.payment_rejection_reason || "Bukti transfer belum valid atau belum sesuai mutasi."}"</b>
                </p>
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#7f1d1d" }}>
                  Silakan periksa mutasi rekening Anda dan unggah ulang bukti transfer yang valid melalui formulir di bawah ini.
                </p>
              </div>
            )}

            {error && <Notice>{error}</Notice>}

            {isWaitingVerification && !showReupload ? (
              <div className="ks-qris-waiting-box">
                <div className="ks-qris-waiting-head">
                  <Clock3 size={18} />
                  <div>
                    <b>Bukti Pembayaran Terkirim — Menunggu Verifikasi</b>
                    <p>
                      Admin telah menerima notifikasi dan sedang memeriksa mutasi pembayaran masuk sebelum menyetujui transaksi menjadi Lunas.
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
                        Unggah ulang bukti transfer lain
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
                      : "Pilih gambar bukti pembayaran (JPG, PNG, WebP, GIF, BMP, AVIF, maks. 10 MB)"}
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/bmp,image/avif"
                    onChange={handleFileChange}
                  />
                </label>

                {proofData && (
                  <div className="ks-qris-upload-preview">
                    <img src={proofData} alt="Pratinjau bukti pembayaran" />
                    <div style={{ marginTop: 8, display: "flex", gap: 8, justifyContent: "center" }}>
                      <button
                        type="button"
                        className="ws-btn-ghost-sm"
                        onClick={() => {
                          setProofData("");
                          setProofName("");
                        }}
                      >
                        <Trash2 size={14} style={{ marginRight: 4 }} /> Hapus Pilihan
                      </button>
                    </div>
                  </div>
                )}

                <label>
                  Catatan Pembayaran (opsional)
                  <input
                    type="text"
                    maxLength={500}
                    placeholder="Contoh: Transfer dari rekening BCA a.n. Budi pukul 14:20"
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
                      : "Saya Sudah Melakukan Pembayaran"}
                  </button>
                  {(isWaitingVerification || isRejected) && (
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
