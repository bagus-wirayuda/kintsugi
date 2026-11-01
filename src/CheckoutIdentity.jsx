import React, { useEffect, useState, useRef } from "react";
import { ArrowRight, Check, MessageCircle, ShieldCheck, Lock } from "lucide-react";
import { api } from "./store";
import { Notice } from "./Workspace";

const pendingKey = "ks:checkout-verification";
const canonical = (phone) =>
  String(phone || "")
    .replace(/\D/g, "")
    .replace(/^0/, "62");

function readPending(phone) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(pendingKey));
    return saved?.validUntil > Date.now() &&
      canonical(saved.phone) === canonical(phone)
      ? saved
      : null;
  } catch {
    return null;
  }
}

export function clearCheckoutVerification() {
  try {
    sessionStorage.removeItem(pendingKey);
  } catch {}
}

export default function CheckoutIdentity({ address, onVerified, onBack }) {
  const panel = useRef(null);
  useEffect(() => {
    panel.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  const [challenge, setChallenge] = useState(() => readPending(address.phone));
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isNewUser, setIsNewUser] = useState(null);
  const [checkingAccount, setCheckingAccount] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let alive = true;
    setCheckingAccount(true);
    api("/auth/lookup", {
      method: "POST",
      body: { phone: address.phone, email: address.email },
    })
      .then((res) => {
        if (!alive) return;
        setIsNewUser(Boolean(res.isNew));
      })
      .catch(() => {
        if (!alive) return;
        setIsNewUser(true);
      })
      .finally(() => {
        if (alive) setCheckingAccount(false);
      });
    return () => {
      alive = false;
    };
  }, [address.phone, address.email]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const cooldown = Math.max(
    0,
    Math.ceil(((challenge?.resendAt || 0) - now) / 1000),
  );

  function received(data) {
    const pending = {
      ...data,
      validUntil: Date.now() + data.expiresIn * 1000,
      resendAt: Date.now() + data.resendAfter * 1000,
    };
    try {
      sessionStorage.setItem(pendingKey, JSON.stringify(pending));
    } catch {}
    setChallenge(pending);
    setCode("");
    setNow(Date.now());
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (challenge) {
        const buyer = await api("/auth/otp/verify", {
          method: "POST",
          body: { challengeId: challenge.challengeId, code },
        });
        clearCheckoutVerification();
        await onVerified(buyer);
      } else {
        if (isNewUser) {
          if (!password || password.length < 8) {
            throw new Error("Kata sandi minimal 8 karakter.");
          }
          if (password !== confirmPassword) {
            throw new Error("Konfirmasi kata sandi tidak cocok.");
          }
        }
        received(
          await api("/auth/checkout", {
            method: "POST",
            body: {
              name: address.name,
              phone: address.phone,
              email: address.email,
              consent,
              password: isNewUser ? password : undefined,
            },
          }),
        );
      }
    } catch (e) {
      setError(e.message);
      if (e.status === 410) {
        setChallenge(null);
        clearCheckoutVerification();
      }
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError("");
    try {
      received(
        await api("/auth/otp/request", {
          method: "POST",
          body: { challengeId: challenge.challengeId },
        }),
      );
    } catch (e) {
      setError(e.message);
      if (e.status === 410) {
        setChallenge(null);
        clearCheckoutVerification();
      }
    } finally {
      setBusy(false);
    }
  }

  const isSubmitDisabled =
    busy ||
    checkingAccount ||
    (challenge
      ? code.length !== 6
      : isNewUser
        ? !consent || password.length < 8 || password !== confirmPassword
        : !consent);

  return (
    <section
      className="ks-identity ws-panel"
      ref={panel}
      aria-labelledby="verification-title"
    >
      <div className="ks-identity-icon">
        <ShieldCheck size={27} />
      </div>
      <p className="ks-kicker">SATU LANGKAH SEBELUM MEMBAYAR</p>
      <h2 id="verification-title">
        {challenge
          ? "Masukkan kode verifikasi"
          : isNewUser
            ? "Buat kata sandi akun baru"
            : "Konfirmasi nomor WhatsApp"}
      </h2>
      <p>
        {challenge ? (
          <>
            Kode dikirim melalui WhatsApp ke <strong>{challenge.phone}</strong>.
            Belanjaan dan alamat Anda tetap tersimpan.
          </>
        ) : isNewUser ? (
          <>
            Nomor <strong>{address.phone}</strong> belum terdaftar. Silakan buat
            kata sandi akun Anda sebelum melanjutkan ke pembayaran.
          </>
        ) : (
          <>
            Nomor <strong>{address.phone}</strong> terdaftar sebagai pelanggan.
            Kami akan mengirim kode verifikasi ke WhatsApp Anda.
          </>
        )}
      </p>
      <form onSubmit={submit}>
        {challenge ? (
          <label>
            Kode WhatsApp
            <input
              autoFocus
              className="ks-otp-input"
              aria-label="Kode OTP WhatsApp"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              required
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
            />
          </label>
        ) : (
          <>
            {isNewUser && (
              <div className="ks-new-account-box">
                <label>
                  <span>
                    <Lock
                      size={14}
                      style={{
                        display: "inline",
                        verticalAlign: "middle",
                        marginRight: 5,
                      }}
                    />
                    Kata sandi baru (minimal 8 karakter)
                  </span>
                  <input
                    type="password"
                    required
                    minLength={8}
                    maxLength={72}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan kata sandi baru"
                    autoComplete="new-password"
                  />
                </label>
                <label>
                  <span>Konfirmasi kata sandi</span>
                  <input
                    type="password"
                    required
                    minLength={8}
                    maxLength={72}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ketik ulang kata sandi"
                    autoComplete="new-password"
                  />
                </label>
              </div>
            )}
            <label className="ks-consent">
              <input
                type="checkbox"
                required
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                {isNewUser
                  ? "Saya setuju membuat akun Kintsugi dengan nomor ini dan kata sandi di atas untuk mengamankan dan mengelola pesanan."
                  : "Saya setuju masuk dengan nomor ini setelah verifikasi untuk menyimpan dan mengelola pesanan."}
              </span>
            </label>
          </>
        )}
        <Notice>{error}</Notice>
        <button className="ws-button primary" disabled={isSubmitDisabled}>
          {busy
            ? "Memproses…"
            : challenge
              ? "Verifikasi & lanjut bayar"
              : isNewUser
                ? "Kirim kode WhatsApp & Buat Akun"
                : "Kirim kode WhatsApp"}
          {challenge ? <Check size={17} /> : <MessageCircle size={17} />}
        </button>
      </form>
      {challenge && (
        <button
          className="ws-link"
          disabled={busy || cooldown > 0}
          onClick={resend}
        >
          {cooldown > 0
            ? `Kirim ulang dalam ${cooldown} detik`
            : "Kirim ulang kode"}
        </button>
      )}
      <button className="ws-link" disabled={busy} onClick={onBack}>
        Ubah data pengiriman <ArrowRight size={15} />
      </button>
      <small>
        {isNewUser
          ? "Akun Anda langsung aktif dengan kata sandi yang Anda buat dan dapat digunakan untuk masuk kapan saja."
          : "Tanpa mengisi formulir pendaftaran lagi. Anda dapat masuk kembali dengan nomor WhatsApp atau kata sandi Anda."}
      </small>
    </section>
  );
}
