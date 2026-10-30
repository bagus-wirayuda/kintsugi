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
import { colorLabel, money } from "./data";
import { Notice } from "./Workspace";
import Brand from "./Brand";
import { StoreHeader } from "./StoreChrome";
import { paymentName } from './payment-methods';
import CheckoutIdentity, {
  clearCheckoutVerification,
} from "./CheckoutIdentity";
import { readDraft, saveDraft } from "./checkout-state";
const emptyAddress = {
  name: "",
  email: "",
  phone: "",
  street: "",
  city: "",
  postal: "",
};
export default function Checkout({
  user,
  cart,
  coupon,
  config,
  onPlaced,
  onAuthenticated,
  nav,
  shop,
  gender,
  cartCount,
  wishCount,
  onSearch,
  onLogout,
}) {
  const owner = user?.id || "guest";
  const [initial] = useState(() => readDraft(storage, owner));
  const [address, setAddress] = useState(() => ({
    ...emptyAddress,
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
    ...initial?.address,
  }));
  const [shipping, setShipping] = useState(initial?.shipping || "regular");
  const [payment, setPayment] = useState(initial?.payment || '');
  const methods = config.paymentMethods || [];
  const [identity, setIdentity] = useState(Boolean(initial?.identity && !user));
  const [quote, setQuote] = useState(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [quoteError, setQuoteError] = useState("");
  useEffect(() => {
    saveDraft(storage, owner, { address, shipping, identity, payment });
  }, [owner, address, shipping, identity, payment]);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    api("/me/profile")
      .then((profile) => {
        if (!alive) return;
        setAddress((current) =>
          Object.fromEntries(
            Object.keys(emptyAddress).map((key) => [
              key,
              current[key] || profile?.[key] || user[key] || "",
            ]),
          ),
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user?.id]);
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
  async function pay(buyer) {
    setBusy(true);
    setError("");
    const payload = {
      items: cart.map(({ id, size, color, quantity }) => ({
        id,
        size,
        color,
        quantity,
      })),
      address: { ...address },
      shipping,
      coupon,
      payment,
    };
    const signature = JSON.stringify(payload),
      saved = storage.read("checkout:" + buyer.id, null);
    const key =
      saved?.signature === signature ? saved.key : crypto.randomUUID();
    storage.write("checkout:" + buyer.id, { signature, key });
    try {
      const order = await api("/orders", {
        method: "POST",
        body: { ...payload, checkoutKey: key },
      });
      if (!order.id)
        throw Error("Pesanan belum terkonfirmasi. Silakan coba lagi.");
      if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(order.payment_status)) {
        storage.write('checkout:' + buyer.id, null);
        throw Error(order.paymentError || 'Metode pembayaran belum tersedia. Pilih metode lain dan coba kembali.');
      }
      storage.write("checkout:" + buyer.id, null);
      storage.write("checkout-draft:" + buyer.id, null);
      storage.write("checkout-draft:guest", null);
      clearCheckoutVerification();
      onPlaced(order, buyer, payload.items);
      if (order.payment_status === "PENDING" && order.payment_url)
        window.location.assign(order.payment_url);
    } catch (e) {
      setError(e.message);
      setIdentity(false);
      setBusy(false);
    }
  }
  function submit(e) {
    e.preventDefault();
    if (!quote || checking || busy) return;
    if (!methods.some((method) => method.id === payment)) return setError('Pilih metode pembayaran terlebih dahulu.');
    setError("");
    if (!user) {
      setIdentity(true);
      return;
    }
    pay(user);
  }
  async function verified(buyer) {
    if (buyer.role !== "customer")
      throw Error("Gunakan akun pelanggan untuk melanjutkan pembayaran.");
    await onAuthenticated(buyer);
    await pay(buyer);
  }
  const total = quote || totals(cart, coupon, shipping);
  function field(name, label, props = {}) {
    const Element = name === "street" ? "textarea" : "input";
    return (
      <label className={name === "street" ? "ws-wide" : ""}>
        {label}
        <Element
          name={name}
          required
          value={address[name]}
          onChange={(e) => {
            setAddress((a) => ({ ...a, [name]: e.target.value }));
            setIdentity(false);
          }}
          {...props}
        />
      </label>
    );
  }
  return (
    <div className="workspace ws-checkout ks-checkout">
      <StoreHeader user={user} nav={nav} shop={shop} gender={gender} count={cartCount} wishCount={wishCount} onSearch={onSearch} onLogout={onLogout}/>
      <main className="checkout-content">
        <button className="ws-link" onClick={() => nav("cart")}>
          <ArrowLeft size={16} /> Kembali ke keranjang
        </button>
        <div className="checkout-page-title">
          <p className="ks-kicker">KINTSUGI / CHECKOUT</p>
          <h1>Selangkah lagi, jadi milik Anda.</h1>
          <p>Lengkapi pengiriman, lalu pilih cara pembayaran Anda.</p>
        </div>
        <div className="checkout-flow">
          <span className="done">
            <Check size={15} /> Keranjang
          </span>
          <i />
          <span className={!identity ? "active" : "done"}>Pengiriman</span>
          <i />
          <span className={identity ? "active" : ""}>Pembayaran</span>
        </div>
        {!cart.length && !busy ? (
          <div className="ws-panel ws-empty">
            <h2>Keranjang masih kosong</h2>
            <p>Pilih produk favorit untuk melanjutkan.</p>
            <button
              className="ws-button primary"
              onClick={() => nav("catalog")}
            >
              Lihat koleksi
            </button>
          </div>
        ) : (
          <div className="checkout-layout">
            <div>
              <form id="checkout-form" onSubmit={submit}>
                <fieldset
                  disabled={busy || identity}
                  className="ks-checkout-fields"
                >
                  <section className="ws-panel ws-form-panel">
                    <div className="ws-panel-heading">
                      <h2>
                        <MapPin size={20} /> 01 / Alamat penerima
                      </h2>
                      <p>
                        Data tersimpan di browser ini selama 24 jam agar Anda
                        bisa melanjutkan nanti.
                      </p>
                    </div>
                    <div className="ws-form-grid">
                      {field("name", "Nama lengkap", {
                        minLength: 2,
                        maxLength: 100,
                        autoComplete: "name",
                        placeholder: "Nama penerima",
                      })}
                      {field("email", "Email untuk pesanan", {
                        type: "email",
                        maxLength: 254,
                        autoComplete: "email",
                        placeholder: "nama@email.com",
                      })}
                      {field("phone", "Nomor WhatsApp", {
                        type: "tel",
                        pattern: "[0-9+ ()-]{8,20}",
                        autoComplete: "tel",
                        placeholder: "08xxxxxxxxxx",
                      })}
                      {field("city", "Kota / kabupaten", {
                        minLength: 2,
                        maxLength: 100,
                        autoComplete: "address-level2",
                        placeholder: "Kota / kabupaten",
                      })}
                      {field("street", "Alamat lengkap", {
                        minLength: 10,
                        maxLength: 500,
                        autoComplete: "street-address",
                        placeholder: "Jalan, nomor rumah, RT/RW, kecamatan",
                      })}
                      {field("postal", "Kode pos", {
                        inputMode: "numeric",
                        pattern: "[0-9]{5}",
                        maxLength: 5,
                        autoComplete: "postal-code",
                        placeholder: "5 digit kode pos",
                      })}
                    </div>
                  </section>
                  <section className="ws-panel ws-form-panel">
                    <div className="ws-panel-heading">
                      <h2>
                        <Truck size={20} /> 02 / Pengiriman
                      </h2>
                      <p>Pilih layanan sesuai kebutuhan Anda.</p>
                    </div>
                    <div className="checkout-shipping">
                      {[
                        [
                          "regular",
                          "Reguler",
                          "Estimasi 2–4 hari kerja",
                          15000,
                        ],
                        [
                          "express",
                          "Ekspres",
                          "Estimasi 1–2 hari kerja",
                          35000,
                        ],
                        [
                          "pickup",
                          "Ambil pesanan",
                          "Lokasi dikoordinasikan dengan pengelola",
                          0,
                        ],
                      ].map(([value, title, detail, price]) => (
                        <label
                          className={shipping === value ? "selected" : ""}
                          key={value}
                        >
                          <input
                            type="radio"
                            name="shippingChoice"
                            checked={shipping === value}
                            onChange={() => setShipping(value)}
                          />
                          <div>
                            <b>{title}</b>
                            <small>{detail}</small>
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
                        <CreditCard size={20} /> 03 / Pembayaran
                      </h2>
                      <p>
                        Pilih cara pembayaran Anda. Ketersediaan metode diperiksa saat pembayaran disiapkan.
                      </p>
                    </div>
                    <div className="ks-payment-methods">
                      {[...new Set(methods.map((method) => method.group))].map((group) => <fieldset key={group}><legend>{group}</legend>{methods.filter((method) => method.group === group).map((method) => <label key={method.id} className={payment === method.id ? 'selected' : ''}><input type="radio" name="paymentMethod" value={method.id} checked={payment === method.id} onChange={() => setPayment(method.id)} required/><span className="ks-payment-mark">{method.name.slice(0, 3).toUpperCase()}</span><span><b>{method.name}</b><small>{method.detail}</small></span></label>)}</fieldset>)}
                      {!methods.length && <Notice>Metode pembayaran sedang dimuat. Silakan muat ulang halaman.</Notice>}
                    </div>
                  </section>
                </fieldset>
              </form>
              {identity && !user && (
                <CheckoutIdentity
                  address={address}
                  onVerified={verified}
                  onBack={() => setIdentity(false)}
                />
              )}
              {busy && (
                <div className="ws-notice success" role="status">
                  Pesanan sedang disiapkan. Menghubungkan ke pembayaran…
                </div>
              )}
            </div>
            <aside className="ws-panel checkout-summary">
              <h2>Ringkasan pesanan</h2>
              <p className="ws-muted">
                {cart.reduce((n, i) => n + i.quantity, 0)} barang pilihan Anda
              </p>
              <div className="checkout-products">
                {cart.map((i) => (
                  <div key={i.key}>
                    <img src={i.image} alt={i.name} />
                    <div>
                      <b>{i.name}</b>
                      <small>
                        Ukuran kasur {i.size} · {colorLabel(i.color)} · {i.quantity} barang
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
              {!identity && (
                <button
                  className="ws-button primary"
                  type="submit"
                  form="checkout-form"
                  disabled={busy || checking || !quote || !config.payments || !payment}
                >
                  {busy ? "Menyiapkan pembayaran…" : payment ? 'Bayar dengan ' + paymentName(payment) : 'Pilih metode pembayaran'}
                  <ArrowUpRight size={17} />
                </button>
              )}
              {identity && !user && (
                <p className="ks-verify-summary">
                  <ShieldCheck size={20} /> Selesaikan verifikasi WhatsApp untuk
                  melanjutkan. Belanjaan Anda sudah tersimpan.
                </p>
              )}
              {!config.payments && (
                <Notice>Pembayaran belum tersedia. Hubungi pengelola.</Notice>
              )}
              <p className="checkout-safe">
                <ShieldCheck size={15} /> Pembayaran aman · Status dikonfirmasi otomatis.
              </p>
            </aside>
          </div>
        )}
      </main>
      <footer className="auth-footer">
        © 2026 Kintsugi · Pilihan sederhana, untuk setiap hari.
      </footer>
    </div>
  );
}
