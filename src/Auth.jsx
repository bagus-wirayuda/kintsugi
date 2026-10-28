import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Mail,
  ShieldCheck,
  Eye,
  EyeOff,
} from "lucide-react";
import { api } from "./store";
import { Notice } from "./Workspace";
export default function Auth({
  onAuthenticated,
  admin = false,
  config,
  pendingCart = false,
}) {
  const pendingKey = "lj:verification:" + (admin ? "admin" : "customer");
  function readPending() {
    try {
      const p = JSON.parse(sessionStorage.getItem(pendingKey));
      return p?.validUntil > Date.now() ? p : null;
    } catch {
      return null;
    }
  }
  const [mode, setMode] = useState(() =>
      readPending()?.purpose === "register"
        ? "register"
        : readPending()?.purpose === "reset"
          ? "reset"
          : "login",
    ),
    [method, setMethod] = useState("password"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [challenge, setChallenge] = useState(readPending),
    [cooldown, setCooldown] = useState(() =>
      Math.max(
        0,
        Math.ceil(((readPending()?.resendAt || 0) - Date.now()) / 1000),
      ),
    ),
    [code, setCode] = useState(""),
    [show, setShow] = useState(false);
  useEffect(() => {
    if (!cooldown) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  function change(value) {
    try {
      sessionStorage.removeItem(pendingKey);
    } catch {}
    setMode(value);
    setError("");
    setMessage("");
    setChallenge(null);
    setCode("");
  }
  function received(data) {
    try {
      sessionStorage.setItem(
        pendingKey,
        JSON.stringify({
          ...data,
          validUntil: Date.now() + 600000,
          resendAt: Date.now() + (data.resendAfter || 60) * 1000,
        }),
      );
    } catch {}
    setChallenge(data);
    setCooldown(data.resendAfter || 60);
    setCode("");
    setMessage("");
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (
        (mode === "register" ||
          mode === "reset" ||
          method === "otp" ||
          challenge) &&
        config?.loaded &&
        config.registrationRequiresOtp !== true
      )
        throw Error(
          "Layanan akun masih memakai versi lama. Hentikan server lama dengan Ctrl+C, lalu jalankan npm start kembali sebelum mendaftar.",
        );
      if (challenge) {
        if (
          challenge.purpose === "reset" &&
          f.newPassword !== f.confirmPassword
        )
          throw Error("Konfirmasi kata sandi belum cocok.");
        const result = await api("/auth/otp/verify", {
          method: "POST",
          body: {
            challengeId: challenge.challengeId,
            code,
            newPassword: f.newPassword,
          },
        });
        if (result.reset) {
          change("login");
          setMessage(result.message);
        } else {
          try {
            sessionStorage.removeItem(pendingKey);
          } catch {}
          await onAuthenticated(result);
        }
      } else if (mode === "register") {
        if (f.password !== f.confirmPassword)
          throw Error("Konfirmasi kata sandi belum cocok.");
        received(
          await api("/auth/register", {
            method: "POST",
            body: { name: f.name, email: f.email, password: f.password },
          }),
        );
      } else if (mode === "reset" || method === "otp") {
        received(
          await api("/auth/otp/request", {
            method: "POST",
            body: {
              email: f.email,
              purpose: mode === "reset" ? "reset" : "login",
            },
          }),
        );
      } else
        await onAuthenticated(
          await api("/auth/login", {
            method: "POST",
            body: { email: f.email, password: f.password },
          }),
        );
    } catch (e) {
      setError(e.message);
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
    } finally {
      setBusy(false);
    }
  }
  const title = challenge
    ? "Periksa email Anda"
    : mode === "register"
      ? "Buat akun baru"
      : mode === "reset"
        ? "Lupa kata sandi?"
        : admin
          ? "Masuk ke panel admin"
          : "Selamat datang kembali";
  return (
    <div className="workspace auth-screen">
      <div className="auth-brandbar">
        <a className="ws-logo" href="#home">
          <span>LJ</span>
          <div>
            Liny Jaya
            <small>{admin ? "ADMINISTRATION" : "CUSTOMER ACCOUNT"}</small>
          </div>
        </a>
        <a className="ws-link" href={admin ? "#account" : "#catalog"}>
          <ArrowLeft size={16} />
          {admin ? "Akun pelanggan" : "Kembali ke katalog"}
        </a>
      </div>
      <main className="auth-container">
        <section className="auth-intro">
          <span className="auth-symbol">
            {admin ? <ShieldCheck size={30} /> : <KeyRound size={30} />}
          </span>
          <p className="ws-kicker">
            {admin ? "KHUSUS PENGELOLA TOKO" : "SATU AKUN, SEMUA KEBUTUHAN"}
          </p>
          <h1>
            {admin ? (
              <>
                Ruang kerja yang
                <br />
                lebih teratur.
              </>
            ) : (
              <>
                Belanja lebih mudah.
                <br />
                Akun lebih aman.
              </>
            )}
          </h1>
          <p>
            {admin
              ? "Kelola katalog, pantau pembayaran, dan proses pesanan dari panel operasional Anda."
              : "Kelola pesanan, simpan favorit, dan atur pengiriman dalam satu tempat yang nyaman."}
          </p>
          <div className="auth-intro-points">
            {(admin
              ? [
                  "Pengelolaan produk & stok varian",
                  "Verifikasi pembayaran dari Xendit",
                  "Proses pesanan dengan alur yang jelas",
                ]
              : [
                  "Verifikasi email sebelum akun dibuat",
                  "Status pesanan dan pembayaran yang jelas",
                  "Informasi pengiriman tersimpan",
                ]
            ).map((t) => (
              <div key={t}>
                <CheckCircle2 size={18} />
                {t}
              </div>
            ))}
          </div>
          <small>
            {admin
              ? "Akun admin tidak dapat digunakan untuk berbelanja."
              : "Data akun Anda digunakan untuk layanan toko."}
          </small>
        </section>
        <section className="auth-card">
          <span className="auth-card-icon">
            {challenge ? <Mail size={23} /> : <KeyRound size={23} />}
          </span>
          <h2>{title}</h2>
          <p>
            {challenge ? (
              <>
                Masukkan 6 digit kode yang dikirim ke <b>{challenge.email}</b>.
                Kode berlaku 10 menit.
              </>
            ) : mode === "register" ? (
              "Verifikasi email diperlukan untuk menyelesaikan pendaftaran."
            ) : mode === "reset" ? (
              "Kami akan mengirimkan kode untuk mengatur ulang kata sandi."
            ) : (
              "Masukkan informasi akun Anda untuk melanjutkan."
            )}
          </p>
          {!challenge && mode === "login" && !admin && (
            <div className="ws-segment">
              <button
                className={method === "password" ? "active" : ""}
                onClick={() => {
                  setMethod("password");
                  setError("");
                }}
              >
                Kata sandi
              </button>
              <button
                className={method === "otp" ? "active" : ""}
                onClick={() => {
                  setMethod("otp");
                  setError("");
                }}
              >
                Kode email
              </button>
            </div>
          )}
          {!admin && pendingCart && !challenge && (
            <Notice type="info">
              Masuk untuk melanjutkan belanja. Keranjang tamu akan dipindahkan
              ke akun pelanggan yang Anda masuki.
            </Notice>
          )}
          <Notice>{error}</Notice>
          <Notice type="success">{message}</Notice>
          <form onSubmit={submit} key={mode + Boolean(challenge) + method}>
            {challenge ? (
              <>
                <label>
                  Kode verifikasi
                  <input
                    className="auth-otp"
                    autoFocus
                    autoComplete="one-time-code"
                    aria-label="Kode verifikasi"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                  />
                </label>
                {challenge.purpose === "reset" && (
                  <>
                    <label>
                      Kata sandi baru
                      <input
                        name="newPassword"
                        type="password"
                        required
                        minLength={8}
                        maxLength={72}
                        autoComplete="new-password"
                      />
                    </label>
                    <label>
                      Ulangi kata sandi baru
                      <input
                        name="confirmPassword"
                        type="password"
                        required
                        minLength={8}
                        autoComplete="new-password"
                      />
                    </label>
                  </>
                )}
              </>
            ) : (
              <>
                {mode === "register" && (
                  <label>
                    Nama lengkap
                    <input
                      name="name"
                      autoComplete="name"
                      required
                      minLength={2}
                      maxLength={100}
                      placeholder="Nama lengkap Anda"
                    />
                  </label>
                )}
                <label>
                  Alamat email
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    placeholder="nama@email.com"
                  />
                </label>
                {(mode === "register" ||
                  (mode === "login" && method === "password")) && (
                  <label>
                    Kata sandi
                    <div className="auth-password">
                      <input
                        name="password"
                        type={show ? "text" : "password"}
                        required
                        minLength={8}
                        maxLength={72}
                        autoComplete={
                          mode === "register"
                            ? "new-password"
                            : "current-password"
                        }
                        placeholder="Minimal 8 karakter"
                      />
                      <button
                        type="button"
                        aria-label={
                          show
                            ? "Sembunyikan kata sandi"
                            : "Tampilkan kata sandi"
                        }
                        onClick={() => setShow(!show)}
                      >
                        {show ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </label>
                )}
                {mode === "register" && (
                  <label>
                    Ulangi kata sandi
                    <input
                      name="confirmPassword"
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      placeholder="Masukkan kembali kata sandi"
                    />
                  </label>
                )}
                {mode === "login" && method === "password" && (
                  <button
                    type="button"
                    className="auth-forgot ws-link"
                    onClick={() => change("reset")}
                  >
                    Lupa kata sandi?
                  </button>
                )}
              </>
            )}
            <button className="ws-button primary auth-submit" disabled={busy}>
              {busy
                ? "Memproses…"
                : challenge
                  ? "Verifikasi & lanjutkan"
                  : mode === "register"
                    ? "Kirim kode verifikasi"
                    : mode === "reset" || method === "otp"
                      ? "Kirim kode email"
                      : "Masuk"}
              <ArrowRight size={17} />
            </button>
          </form>
          {challenge ? (
            <div className="auth-resend">
              <span>Belum menerima kode?</span>
              <button
                className="ws-link"
                disabled={busy || cooldown > 0}
                onClick={resend}
              >
                {cooldown > 0
                  ? "Kirim ulang dalam " + cooldown + " dtk"
                  : "Kirim ulang kode"}
              </button>
              <button
                className="ws-link secondary-link"
                disabled={busy}
                onClick={() => change(mode)}
              >
                Ganti email / mulai ulang
              </button>
            </div>
          ) : (
            <div className="auth-switch">
              {!admin && (
                <>
                  <span>
                    {mode === "login"
                      ? "Belum punya akun?"
                      : "Sudah punya akun?"}
                  </span>
                  <button
                    className="ws-link"
                    onClick={() =>
                      change(mode === "login" ? "register" : "login")
                    }
                  >
                    {mode === "login" ? "Daftar sekarang" : "Masuk ke akun"}
                  </button>
                </>
              )}
              {admin && mode === "reset" && (
                <button className="ws-link" onClick={() => change("login")}>
                  Kembali ke masuk admin
                </button>
              )}
            </div>
          )}
          {(mode === "register" ||
            mode === "reset" ||
            method === "otp" ||
            challenge) && (
            <div className="auth-test-note">
              <ShieldCheck size={16} />
              <span>
                Kode dikirim hanya ke alamat email yang Anda masukkan. Akun baru
                akan dibuat setelah kode verifikasi benar.
              </span>
            </div>
          )}
          {!admin && !challenge && (
            <a className="auth-admin-link" href="#admin">
              Masuk sebagai pengelola toko
            </a>
          )}
        </section>
      </main>
      <footer className="auth-footer">
        © 2026 Liny Jaya · Akses akun yang aman
      </footer>
    </div>
  );
}
