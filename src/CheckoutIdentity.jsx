import React, { useEffect, useState, useRef } from "react";
import {
  ArrowRight,
  Check,
  MessageCircle,
  ShieldCheck,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  RefreshCw,
} from "lucide-react";
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isNewUser, setIsNewUser] = useState(null);
  const [checkingAccount, setCheckingAccount] = useState(true);
  const [registeredMethod, setRegisteredMethod] = useState("password"); // "password" | "otp"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let alive = true;
    setCheckingAccount(true);
    setError("");
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
      validUntil: Date.now() + (data.expiresIn || 600) * 1000,
      resendAt: Date.now() + (data.resendAfter || 60) * 1000,
    };
    try {
      sessionStorage.setItem(pendingKey, JSON.stringify(pending));
    } catch {}
    setChallenge(pending);
    setCode("");
    setNow(Date.now());
  }

  async function submit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (busy || checkingAccount) return;

    setError("");

    // Skenario 1: Verifikasi Kode OTP (baru atau terdaftar)
    if (challenge) {
      const cleanCode = code.replace(/\D/g, "");
      if (cleanCode.length !== 6) {
        setError("Masukkan 6 digit kode verifikasi WhatsApp.");
        return;
      }
      setBusy(true);
      try {
        const buyer = await api("/auth/otp/verify", {
          method: "POST",
          body: { challengeId: challenge.challengeId, code: cleanCode },
        });
        clearCheckoutVerification();
        await onVerified(buyer);
      } catch (err) {
        setError(err.message || "Gagal memverifikasi kode OTP.");
        if (err.status === 410) {
          setChallenge(null);
          clearCheckoutVerification();
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    // Skenario 2: Akun Baru -> Wajib Password min 8 + Konfirmasi + Persetujuan
    if (isNewUser) {
      if (!password || password.length < 8) {
        setError("Kata sandi akun baru minimal 8 karakter.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Konfirmasi kata sandi tidak cocok.");
        return;
      }
      if (!consent) {
        setError("Harap centang persetujuan pembuatan akun sebelum melanjutkan.");
        return;
      }
      setBusy(true);
      try {
        const res = await api("/auth/checkout", {
          method: "POST",
          body: {
            name: address.name,
            phone: address.phone,
            email: address.email,
            consent: true,
            password,
          },
        });
        received(res);
      } catch (err) {
        setError(err.message || "Gagal mengirim kode verifikasi WhatsApp.");
      } finally {
        setBusy(false);
      }
      return;
    }

    // Skenario 3: Akun Terdaftar -> Pilihan Masuk Kata Sandi ATAU OTP WhatsApp
    if (registeredMethod === "password") {
      if (!password) {
        setError("Masukkan kata sandi akun Anda.");
        return;
      }
      setBusy(true);
      try {
        const buyer = await api("/auth/login", {
          method: "POST",
          body: {
            identifier: address.phone,
            password,
          },
        });
        clearCheckoutVerification();
        await onVerified(buyer);
      } catch (err) {
        setError(err.message || "Kata sandi yang Anda masukkan salah.");
      } finally {
        setBusy(false);
      }
      return;
    }

    // Skenario 4: Akun Terdaftar -> Minta Kode OTP WhatsApp
    if (!consent) {
      setError("Harap centang persetujuan masuk untuk melanjutkan pesanan.");
      return;
    }
    setBusy(true);
    try {
      const res = await api("/auth/checkout", {
        method: "POST",
        body: {
          name: address.name,
          phone: address.phone,
          email: address.email,
          consent: true,
        },
      });
      received(res);
    } catch (err) {
      setError(err.message || "Gagal mengirim kode verifikasi WhatsApp.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (busy || cooldown > 0) return;
    setBusy(true);
    setError("");
    try {
      const res = await api("/auth/otp/request", {
        method: "POST",
        body: { challengeId: challenge.challengeId },
      });
      received(res);
    } catch (err) {
      setError(err.message || "Gagal mengirim ulang kode OTP.");
      if (err.status === 410) {
        setChallenge(null);
        clearCheckoutVerification();
      }
    } finally {
      setBusy(false);
    }
  }

  function resetChallenge() {
    clearCheckoutVerification();
    setChallenge(null);
    setCode("");
    setError("");
  }

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
          ? "Masukkan Kode Verifikasi WhatsApp"
          : checkingAccount
            ? "Memeriksa Akun…"
            : isNewUser
              ? "Buat Kata Sandi Akun Baru"
              : "Autentikasi Akun Pelanggan"}
      </h2>
      <p>
        {challenge ? (
          <>
            Kode verifikasi 6 digit telah dikirim melalui WhatsApp ke{" "}
            <strong>{challenge.phone}</strong>. Keranjang belanja dan rincian
            pengiriman Anda tetap tersimpan aman.
          </>
        ) : checkingAccount ? (
          <>Menghubungkan nomor <strong>{address.phone}</strong> dengan sistem…</>
        ) : isNewUser ? (
          <>
            Nomor <strong>{address.phone}</strong> belum terdaftar. Buat kata sandi
            untuk mengamankan akun dan mengelola pesanan Anda.
          </>
        ) : (
          <>
            Nomor <strong>{address.phone}</strong> terdaftar sebagai pelanggan.
            Silakan masuk dengan kata sandi Anda atau minta kode OTP WhatsApp.
          </>
        )}
      </p>

      {/* Pilihan Metode untuk Akun Terdaftar */}
      {!challenge && !checkingAccount && !isNewUser && (
        <div
          className="ws-segment"
          role="tablist"
          aria-label="Pilihan metode masuk"
          style={{ marginTop: 16 }}
        >
          <button
            type="button"
            className={registeredMethod === "password" ? "active" : ""}
            onClick={() => {
              setRegisteredMethod("password");
              setError("");
            }}
          >
            <Lock
              size={13}
              style={{
                display: "inline",
                verticalAlign: "middle",
                marginRight: 6,
              }}
            />
            Masuk Kata Sandi
          </button>
          <button
            type="button"
            className={registeredMethod === "otp" ? "active" : ""}
            onClick={() => {
              setRegisteredMethod("otp");
              setError("");
            }}
          >
            <MessageCircle
              size={13}
              style={{
                display: "inline",
                verticalAlign: "middle",
                marginRight: 6,
              }}
            />
            Kode OTP WhatsApp
          </button>
        </div>
      )}

      <form onSubmit={submit} noValidate>
        {challenge ? (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
              Kode Verifikasi 6 Digit
            </label>
            <input
              autoFocus
              className="ks-otp-input"
              aria-label="Kode OTP WhatsApp"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              style={{ textAlign: "center" }}
            />
          </div>
        ) : isNewUser ? (
          <>
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
                  Kata Sandi Baru (minimal 8 karakter)
                </span>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    style={{ width: "100%", paddingRight: 40 }}
                    minLength={8}
                    maxLength={72}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan kata sandi baru"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: "absolute",
                      right: 10,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#6b7280",
                      padding: 4,
                    }}
                    title={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>

              <label>
                <span>
                  <KeyRound
                    size={14}
                    style={{
                      display: "inline",
                      verticalAlign: "middle",
                      marginRight: 5,
                    }}
                  />
                  Konfirmasi Kata Sandi
                </span>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    style={{ width: "100%", paddingRight: 40 }}
                    minLength={8}
                    maxLength={72}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ketik ulang kata sandi"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{
                      position: "absolute",
                      right: 10,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#6b7280",
                      padding: 4,
                    }}
                    title={showConfirmPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
            </div>

            <label className="ks-consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                Saya setuju membuat akun Kintsugi dengan nomor ini dan kata sandi di atas
                untuk mengamankan, melacak, dan mengelola pesanan saya.
              </span>
            </label>
          </>
        ) : registeredMethod === "password" ? (
          <div className="ks-new-account-box" style={{ marginBottom: 16 }}>
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
                Kata Sandi Akun
              </span>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  style={{ width: "100%", paddingRight: 40 }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan kata sandi akun Anda"
                  autoComplete="current-password"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: 10,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#6b7280",
                    padding: 4,
                  }}
                  title={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
          </div>
        ) : (
          <label className="ks-consent" style={{ marginBottom: 16 }}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              Saya setuju masuk dengan nomor ini setelah verifikasi OTP WhatsApp untuk
              menyimpan dan mengelola pesanan.
            </span>
          </label>
        )}

        {error && <Notice>{error}</Notice>}

        <button
          type="submit"
          className="ws-button primary"
          disabled={busy || checkingAccount}
        >
          {busy ? (
            "Memproses…"
          ) : challenge ? (
            <>
              Verifikasi & Lanjut Bayar <Check size={17} />
            </>
          ) : isNewUser ? (
            <>
              Kirim Kode WhatsApp & Buat Akun <MessageCircle size={17} />
            </>
          ) : registeredMethod === "password" ? (
            <>
              Masuk & Lanjut Bayar <ArrowRight size={17} />
            </>
          ) : (
            <>
              Kirim Kode WhatsApp <MessageCircle size={17} />
            </>
          )}
        </button>
      </form>

      {challenge ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
          <button
            type="button"
            className="ws-link"
            disabled={busy || cooldown > 0}
            onClick={resend}
          >
            <RefreshCw
              size={13}
              style={{
                display: "inline",
                verticalAlign: "middle",
                marginRight: 4,
              }}
            />
            {cooldown > 0
              ? `Kirim ulang kode dalam ${cooldown} detik`
              : "Kirim ulang kode WhatsApp"}
          </button>
          <button
            type="button"
            className="ws-link secondary-link"
            disabled={busy}
            onClick={resetChallenge}
          >
            Batal / Gunakan opsi lain
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="ws-link"
          disabled={busy}
          onClick={onBack}
          style={{ marginTop: 10 }}
        >
          Ubah data pengiriman <ArrowRight size={15} />
        </button>
      )}

      <small style={{ marginTop: 14 }}>
        {challenge
          ? "Periksa pesan masuk WhatsApp dari toko. Jangan bagikan kode ini kepada siapa pun."
          : isNewUser
            ? "Akun Anda langsung aktif setelah verifikasi nomor WhatsApp dan dapat digunakan untuk masuk kapan saja."
            : "Jika WhatsApp sedang tidak aktif, Anda dapat langsung masuk menggunakan kata sandi akun Anda."}
      </small>
    </section>
  );
}
