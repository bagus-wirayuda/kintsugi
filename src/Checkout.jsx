import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ShieldCheck,
  Truck,
  CreditCard,
  MapPin,
} from "lucide-react";
import { api, storage, totals } from "./store";
import { money } from "./data";
import { Notice } from "./Workspace";
export default function Checkout({
  user,
  cart,
  coupon,
  config,
  onPlaced,
  nav,
}) {
  const [shipping, setShipping] = useState("regular"),
    [quote, setQuote] = useState(null),
    [profile, setProfile] = useState(null),
    [loading, setLoading] = useState(true),
    [checking, setChecking] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [quoteError, setQuoteError] = useState("");
  useEffect(() => {
    api("/me/profile")
      .then(setProfile)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user.id]);
  useEffect(() => {
    if (!cart.length) {
      setQuote(null);
      setChecking(false);
      return;
    }
    const c = new AbortController();
    setChecking(true);
    setQuoteError("");
    setQuote(null);
    api("/checkout/quote", {
      method: "POST",
      signal: c.signal,
      body: {
        items: cart.map(({ id, size, color, quantity }) => ({
          id,
          size,
          color,
          quantity,
        })),
        coupon,
        shipping,
      },
    })
      .then(setQuote)
      .catch((e) => {
        if (e.name !== "AbortError") setQuoteError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setChecking(false);
      });
    return () => c.abort();
  }, [cart, coupon, shipping]);
  async function submit(e) {
    e.preventDefault();
    if (!quote || checking) return;
    setBusy(true);
    setError("");
    const address = Object.fromEntries(new FormData(e.currentTarget));
    const payload = {
      items: cart.map(({ id, size, color, quantity }) => ({
        id,
        size,
        color,
        quantity,
      })),
      address,
      shipping,
      coupon,
      payment: "xendit",
    };
    const signature = JSON.stringify(payload),
      saved = storage.read("checkout:" + user.id, null);
    const key =
      saved?.signature === signature ? saved.key : crypto.randomUUID();
    storage.write("checkout:" + user.id, { signature, key });
    try {
      const order = await api("/orders", {
        method: "POST",
        body: { ...payload, checkoutKey: key },
      });
      if (!order.id)
        throw Error("Pesanan belum terkonfirmasi. Silakan coba lagi.");
      storage.write("checkout:" + user.id, null);
      onPlaced(order);
      if (order.payment_status === "PENDING" && order.payment_url)
        window.location.assign(order.payment_url);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  const total = quote || totals(cart, coupon, shipping);
  return (
    <div className="workspace ws-checkout">
      <header className="checkout-header">
        <a className="ws-logo" href="#home">
          <span>LJ</span>
          <div>
            Liny Jaya<small>CHECKOUT</small>
          </div>
        </a>
        <span>
          <ShieldCheck size={17} />
          Checkout aman
        </span>
      </header>
      <main className="checkout-content">
        <button className="ws-link" onClick={() => nav("cart")}>
          <ArrowLeft size={16} />
          Kembali ke keranjang
        </button>
        <div className="checkout-page-title">
          <h1>Pengiriman & pembayaran</h1>
          <p>Pastikan alamat dan pesanan Anda sudah sesuai.</p>
        </div>
        <div className="checkout-flow">
          <span className="done">
            <Check size={15} />
            Keranjang
          </span>
          <i />
          <span className="active">2 · Pengiriman</span>
          <i />
          <span>3 · Pembayaran Xendit</span>
        </div>
        {!cart.length ? (
          <div className="ws-panel ws-empty">
            <h2>Keranjang masih kosong</h2>
            <p>Tambahkan produk sebelum melanjutkan checkout.</p>
            <button
              className="ws-button primary"
              onClick={() => nav("catalog")}
            >
              Buka katalog
            </button>
          </div>
        ) : (
          <form className="checkout-layout" onSubmit={submit}>
            <div>
              <section className="ws-panel ws-form-panel">
                <div className="ws-panel-heading">
                  <h2>
                    <MapPin size={20} />
                    Alamat penerima
                  </h2>
                  <p>Gunakan alamat lengkap agar pesanan mudah dikirim.</p>
                </div>
                {loading ? (
                  <p>Memuat alamat tersimpan…</p>
                ) : (
                  <div className="ws-form-grid" key={profile?.street}>
                    <label>
                      Nama penerima
                      <input
                        name="name"
                        required
                        minLength={2}
                        maxLength={100}
                        defaultValue={profile?.name || user.name}
                        autoComplete="name"
                      />
                    </label>
                    <label>
                      Email penerima
                      <input
                        name="email"
                        type="email"
                        required
                        defaultValue={user.email}
                        autoComplete="email"
                      />
                    </label>
                    <label>
                      Nomor telepon
                      <input
                        name="phone"
                        type="tel"
                        pattern="[0-9+ ()-]{8,20}"
                        required
                        defaultValue={profile?.phone || ""}
                        autoComplete="tel"
                        placeholder="08xxxxxxxxxx"
                      />
                    </label>
                    <label>
                      Kota / kabupaten
                      <input
                        name="city"
                        required
                        minLength={2}
                        defaultValue={profile?.city || ""}
                      />
                    </label>
                    <label className="ws-wide">
                      Alamat lengkap
                      <textarea
                        name="street"
                        required
                        minLength={10}
                        defaultValue={profile?.street || ""}
                        autoComplete="street-address"
                        placeholder="Nama jalan, nomor rumah, kelurahan, kecamatan"
                      />
                    </label>
                    <label>
                      Kode pos
                      <input
                        name="postal"
                        pattern="[0-9]{5}"
                        maxLength={5}
                        required
                        defaultValue={profile?.postal || ""}
                      />
                    </label>
                  </div>
                )}
              </section>
              <section className="ws-panel ws-form-panel">
                <div className="ws-panel-heading">
                  <h2>
                    <Truck size={20} />
                    Metode pengiriman
                  </h2>
                </div>
                <div className="checkout-shipping">
                  {[
                    ["regular", "Reguler", "Estimasi 2–4 hari kerja", 15000],
                    ["express", "Ekspres", "Estimasi 1–2 hari kerja", 35000],
                    [
                      "pickup",
                      "Pengambilan pesanan",
                      "Lokasi dikoordinasikan dengan pengelola",
                      0,
                    ],
                  ].map(([v, title, description, price]) => (
                    <label className={shipping === v ? "selected" : ""} key={v}>
                      <input
                        type="radio"
                        name="shippingChoice"
                        checked={shipping === v}
                        onChange={() => setShipping(v)}
                      />
                      <div>
                        <b>{title}</b>
                        <small>{description}</small>
                      </div>
                      <strong>
                        {total.subtotal >= 699000 || price === 0
                          ? "Gratis"
                          : money(price)}
                      </strong>
                    </label>
                  ))}
                </div>
              </section>
              <section className="ws-panel ws-form-panel">
                <div className="ws-panel-heading">
                  <h2>
                    <CreditCard size={20} />
                    Pembayaran
                  </h2>
                  <p>Pembayaran dilakukan di halaman aman Xendit.</p>
                </div>
                <div className="checkout-payment-option">
                  <ShieldCheck size={28} />
                  <div>
                    <b>Xendit Checkout</b>
                    <p>
                      Transfer bank, QRIS, kartu, dan e-wallet sesuai metode
                      yang tersedia pada akun toko.
                    </p>
                  </div>
                  <Check size={20} />
                </div>
                {config.sandbox && (
                  <div className="ws-payment-guide">
                    <b>Mode pengujian Xendit</b>
                    <p>
                      Anda akan diarahkan ke halaman Xendit Test Mode. Pilih
                      metode lalu gunakan tombol simulasi pembayaran di banner
                      atas. Belum ada dana nyata yang ditagihkan.
                    </p>
                  </div>
                )}
              </section>
            </div>
            <aside className="ws-panel checkout-summary">
              <h2>Ringkasan pesanan</h2>
              <p className="ws-muted">
                {cart.reduce((n, i) => n + i.quantity, 0)} barang
              </p>
              <div className="checkout-products">
                {cart.map((i) => (
                  <div key={i.key}>
                    <img src={i.image} alt={i.name} />
                    <div>
                      <b>{i.name}</b>
                      <small>
                        {i.size} · {i.quantity} barang
                      </small>
                      <strong>{money(i.price * i.quantity)}</strong>
                    </div>
                  </div>
                ))}
              </div>
              <dl className="checkout-totals">
                <div>
                  <dt>Subtotal</dt>
                  <dd>{money(total.subtotal)}</dd>
                </div>
                {total.discount > 0 && (
                  <div className="discount">
                    <dt>Voucher {coupon}</dt>
                    <dd>−{money(total.discount)}</dd>
                  </div>
                )}
                <div>
                  <dt>Pengiriman</dt>
                  <dd>{total.delivery ? money(total.delivery) : "Gratis"}</dd>
                </div>
                <div className="total">
                  <dt>Total bayar</dt>
                  <dd>{money(total.total)}</dd>
                </div>
              </dl>
              <Notice>{error || quoteError}</Notice>
              {checking && (
                <p className="ws-muted" role="status">
                  Memeriksa harga & stok…
                </p>
              )}
              <button
                className="ws-button primary"
                type="submit"
                disabled={
                  busy || checking || !quote || loading || !config.payments
                }
              >
                {busy ? "Menghubungkan ke Xendit…" : "Lanjut ke pembayaran"}
                <ArrowUpRight size={17} />
              </button>
              {!config.payments && (
                <Notice>Pembayaran belum tersedia. Hubungi pengelola.</Notice>
              )}
              <p className="checkout-safe">
                <ShieldCheck size={15} />
                Status lunas dikonfirmasi oleh Xendit.
              </p>
            </aside>
          </form>
        )}
      </main>
      <footer className="auth-footer">
        © 2026 Liny Jaya · Pembayaran diproses melalui Xendit
      </footer>
    </div>
  );
}
