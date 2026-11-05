import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
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
import { paymentName } from "./payment-methods";
import CheckoutIdentity, {
  clearCheckoutVerification,
} from "./CheckoutIdentity";
import { readDraft, saveDraft } from "./checkout-state";
import { dimensionLabel } from "./dimensions.js";

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
  activeCategory,
  cartCount,
  wishCount,
  onSearch,
  onLogout,
  currentView = "checkout",
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
  const [editingAddress, setEditingAddress] = useState(false);
  const [shipping, setShipping] = useState(
    ["local", "pickup"].includes(initial?.shipping) ? initial.shipping : "local"
  );
  const manualFee = Number(
    config?.shipping?.manualShippingFee ?? config?.shipping?.localDeliveryFee ?? 15000
  );

  const resolveShippingOption = (opt, ship = shipping) => {
    if (ship === "pickup") {
      return { courier: "TOKO", service: "Ambil di Toko", cost: 0 };
    }
    if (opt && typeof opt === "object" && opt.courier && opt.service) {
      return opt;
    }
    return { courier: "TOKO", service: "Standar", cost: manualFee };
  };

  const [shippingOption, setShippingOption] = useState(() => {
    if (initial?.shippingOption && typeof initial.shippingOption === "object") {
      return initial.shippingOption;
    }
    return { courier: "TOKO", service: "Standar", cost: manualFee };
  });

  const [payment, setPayment] = useState(initial?.payment || "");
  const methods = config.paymentMethods || [];
  const [identity, setIdentity] = useState(Boolean(initial?.identity && !user));
  const [quote, setQuote] = useState(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [quoteError, setQuoteError] = useState("");

  function validateCheckout() {
    if (!address.name || address.name.trim().length < 2) {
      setEditingAddress(true);
      return "Nama lengkap penerima wajib diisi (minimal 2 karakter).";
    }
    const cleanPhone = String(address.phone || "").replace(/\D/g, "");
    if (!cleanPhone || cleanPhone.length < 8 || cleanPhone.length > 20) {
      setEditingAddress(true);
      return "Nomor WhatsApp penerima wajib diisi dengan format nomor yang benar (minimal 8 digit).";
    }
    if (!address.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.email.trim())) {
      setEditingAddress(true);
      return "Email penerima wajib diisi dengan format email yang valid.";
    }
    if (shipping !== "pickup") {
      if (!address.city || address.city.trim().length < 2) {
        setEditingAddress(true);
        return "Kota / kabupaten pengantaran wajib diisi.";
      }
      if (!address.street || address.street.trim().length < 10) {
        setEditingAddress(true);
        return "Alamat jalan pengiriman lengkap wajib diisi (minimal 10 karakter jalan, no. rumah, RT/RW).";
      }
    }
    if (!cart.length) {
      return "Keranjang belanja masih kosong.";
    }
    return null;
  }

  const [step, setStep] = useState(() => {
    if (currentView === "payment") {
      const a = initial?.address;
      const isPick = initial?.shipping === "pickup";
      if (a?.name && a?.phone && a?.email && (isPick || (a?.street && a?.city))) {
        return "payment";
      }
    }
    return "checkout";
  });

  useEffect(() => {
    if (currentView === "payment" && step !== "payment") {
      const err = validateCheckout();
      if (!err) {
        setStep("payment");
      } else {
        setStep("checkout");
        nav("checkout", true);
      }
    } else if (currentView === "checkout" && step !== "checkout") {
      setStep("checkout");
    }
  }, [currentView]);

  useEffect(() => {
    saveDraft(storage, owner, {
      address,
      shipping,
      identity,
      payment,
      shippingOption,
      step,
    });
  }, [owner, address, shipping, identity, payment, shippingOption, step]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    api("/me/profile")
      .then((profile) => {
        if (!alive || !profile) return;
        setAddress((current) => ({
          name: profile.name || user.name || current.name || "",
          email: profile.email || user.email || current.email || "",
          phone:
            profile.phone ||
            profile.profile_phone ||
            user.phone ||
            current.phone ||
            "",
          street: profile.street || current.street || "",
          city: profile.city || current.city || "",
          postal: profile.postal || current.postal || "",
        }));
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
    const activeOption = resolveShippingOption(shippingOption, shipping);
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
        shippingOption: activeOption,
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
  }, [cart, coupon, shipping, shippingOption]);

  async function pay(buyer) {
    setBusy(true);
    setError("");
    const activeOption = resolveShippingOption(shippingOption, shipping);
    const cleanAddress = {
      ...address,
      street:
        address.street?.trim() ||
        (shipping === "pickup" ? "Ambil langsung di Toko Fisik" : ""),
      city:
        address.city?.trim() ||
        (shipping === "pickup" ? "Lokasi Toko" : ""),
    };
    const payload = {
      items: cart.map(({ id, size, color, quantity }) => ({
        id,
        size,
        color,
        quantity,
      })),
      address: cleanAddress,
      shipping,
      shippingOption: activeOption,
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
      if (["FAILED", "CANCELLED", "EXPIRED"].includes(order.payment_status)) {
        storage.write("checkout:" + buyer.id, null);
        throw Error(
          order.paymentError ||
            "Metode pembayaran belum tersedia. Pilih metode lain dan coba kembali."
        );
      }
      storage.write("checkout:" + buyer.id, null);
      storage.write("checkout-draft:" + buyer.id, null);
      storage.write("checkout-draft:guest", null);
      clearCheckoutVerification();
      onPlaced(order, buyer, payload.items);
      if (order.payment_status === "PENDING" && order.payment_url && /^https?:\/\//i.test(order.payment_url))
        window.location.assign(order.payment_url);
    } catch (e) {
      setError(e.message);
      setIdentity(false);
      setBusy(false);
    }
  }

  function proceedToPayment(e) {
    if (e) e.preventDefault();
    const err = validateCheckout();
    if (err) {
      setError(err);
      return;
    }
    setError("");
    if (shipping === "pickup" && (!address.street || !address.city)) {
      setAddress((current) => ({
        ...current,
        street: current.street?.trim() || "Ambil langsung di Toko Fisik",
        city: current.city?.trim() || "Lokasi Toko",
      }));
    }
    setStep("payment");
    nav("payment", true);
  }

  function submitPayment(e) {
    if (e) e.preventDefault();
    const err = validateCheckout();
    if (err) {
      setStep("checkout");
      nav("checkout", true);
      setError(err);
      return;
    }
    if (!payment) {
      return setError("Pilih salah satu metode pembayaran online terlebih dahulu.");
    }
    if (!methods.some((method) => method.id === payment)) {
      return setError("Metode pembayaran tidak valid atau belum tersedia.");
    }
    if (!quote || checking || busy) return;
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

  const total = quote || totals(cart, coupon, shipping, manualFee);
  const hasSavedAddress = Boolean(
    address.name &&
      address.phone &&
      (shipping === "pickup" || (address.street && address.city))
  );

  function field(name, label, props = {}) {
    const Element = name === "street" ? "textarea" : "input";
    return (
      <label className={name === "street" ? "ws-wide" : ""}>
        {label}
        <Element
          name={name}
          required={shipping !== "pickup" || (name !== "street" && name !== "city" && name !== "postal")}
          value={address[name] || ""}
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
      <StoreHeader
        config={config}
        user={user}
        nav={nav}
        shop={shop}
        activeCategory={activeCategory}
        count={cartCount}
        wishCount={wishCount}
        onSearch={onSearch}
        onLogout={onLogout}
      />
      <main className="checkout-content">
        {step === "checkout" ? (
          <button className="ws-link" onClick={() => nav("cart")}>
            <ArrowLeft size={16} /> Kembali ke keranjang
          </button>
        ) : (
          <button
            className="ws-link"
            onClick={() => {
              setStep("checkout");
              nav("checkout", true);
            }}
          >
            <ArrowLeft size={16} /> Kembali ke data pengiriman
          </button>
        )}

        <div className="checkout-page-title">
          <p className="ks-kicker">
            {step === "checkout" ? "KINTSUGI / CHECKOUT" : "KINTSUGI / PEMBAYARAN"}
          </p>
          <h1>
            {step === "checkout"
              ? "Informasi Penerima & Pengiriman"
              : "Pilih Metode Pembayaran"}
          </h1>
          <p>
            {step === "checkout"
              ? "Lengkapi identitas dan opsi pengiriman pesanan Anda."
              : "Periksa kembali data pesanan, lalu pilih cara pembayaran yang Anda inginkan."}
          </p>
        </div>

        <div className="checkout-flow">
          <span className="done">
            <Check size={15} /> Keranjang
          </span>
          <i />
          <span className={step === "checkout" ? "active" : "done"}>
            {step === "payment" ? <Check size={15} /> : null} Data & Pengiriman
          </span>
          <i />
          <span className={step === "payment" ? "active" : ""}>
            Pilih Pembayaran
          </span>
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
              {step === "checkout" ? (
                /* TAHAP 1: FORMULIR CHECKOUT (PENGIRIMAN & IDENTITAS) - TANPA PILIHAN PEMBAYARAN */
                <form id="checkout-form" onSubmit={proceedToPayment}>
                  <fieldset disabled={busy} className="ks-checkout-fields">
                    <section className="ws-panel ws-form-panel">
                      <div className="ws-panel-heading">
                        <h2>
                          <MapPin size={20} /> 01 / Identitas & Alamat Penerima
                        </h2>
                        <p>
                          {hasSavedAddress && !editingAddress
                            ? "Alamat tersimpan Anda digunakan otomatis untuk pesanan ini."
                            : "Lengkapi data kontak dan alamat pengiriman Anda."}
                        </p>
                      </div>

                      {shipping === "pickup" && (
                        <div
                          className="ws-notice info"
                          style={{
                            marginBottom: 16,
                            background: "#f0f7f5",
                            borderColor: "var(--ks-teal)",
                            color: "var(--ks-teal)",
                          }}
                        >
                          <b>Opsi Ambil di Toko:</b> Pesanan diambil langsung di lokasi toko. Alamat jalan pengantaran tidak diwajibkan. Pastikan nomor WhatsApp aktif untuk verifikasi pengambilan.
                        </div>
                      )}

                      {hasSavedAddress && !editingAddress ? (
                        <div className="ks-saved-address-card">
                          <div className="ks-saved-address-header">
                            <span className="ks-saved-address-badge">
                              <Check size={14} /> Data Penerima Tersimpan
                            </span>
                            <button
                              type="button"
                              className="ks-change-address-btn"
                              onClick={() => setEditingAddress(true)}
                            >
                              Ubah Data
                            </button>
                          </div>
                          <div className="ks-saved-address-body">
                            <strong>
                              {address.name}{" "}
                              <span className="ks-saved-phone">
                                ({address.phone})
                              </span>
                            </strong>
                            {shipping !== "pickup" ? (
                              <>
                                <p className="ks-saved-street">{address.street}</p>
                                <p className="ks-saved-city">
                                  {address.city}, {address.postal}
                                </p>
                              </>
                            ) : (
                              <p className="ks-saved-street" style={{ color: "var(--ks-muted)" }}>
                                Ambil langsung di toko (tanpa pengantaran kurir)
                              </p>
                            )}
                            {address.email && (
                              <small className="ks-saved-email">
                                Email: {address.email}
                              </small>
                            )}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="ws-form-grid">
                            {field("name", "Nama lengkap penerima", {
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
                            {field(
                              "city",
                              shipping === "pickup"
                                ? "Kota (opsional untuk ambil di toko)"
                                : "Kota / kabupaten",
                              {
                                minLength: shipping === "pickup" ? 0 : 2,
                                maxLength: 100,
                                autoComplete: "address-level2",
                                placeholder: "Kota / kabupaten",
                              }
                            )}
                            {field(
                              "street",
                              shipping === "pickup"
                                ? "Catatan alamat (opsional untuk ambil di toko)"
                                : "Alamat lengkap",
                              {
                                minLength: shipping === "pickup" ? 0 : 10,
                                maxLength: 500,
                                autoComplete: "street-address",
                                placeholder:
                                  shipping === "pickup"
                                    ? "Catatan tambahan atau kosongi jika ambil di toko"
                                    : "Jalan, nomor rumah, RT/RW, kecamatan",
                              }
                            )}
                            {field("postal", "Kode pos", {
                              inputMode: "numeric",
                              pattern: "[0-9]{5}",
                              maxLength: 5,
                              required: false,
                              autoComplete: "postal-code",
                              placeholder: "5 digit (opsional)",
                            })}
                          </div>
                          {hasSavedAddress && editingAddress && (
                            <button
                              type="button"
                              className="ws-link"
                              style={{ marginTop: 12, display: "inline-block" }}
                              onClick={() => setEditingAddress(false)}
                            >
                              Gunakan alamat tersimpan
                            </button>
                          )}
                        </>
                      )}
                    </section>

                    <section className="ws-panel ws-form-panel">
                      <div className="ws-panel-heading">
                        <h2>
                          <Truck size={20} /> 02 / Metode Pengiriman
                        </h2>
                        <p>Pilih metode pengantaran atau ambil sendiri pesanan Anda.</p>
                      </div>
                      <div className="checkout-shipping">
                        {[
                          [
                            "local",
                            "Pengiriman Standar",
                            "Kurir toko / ekspedisi reguler · ongkir manual toko",
                            manualFee,
                          ],
                          [
                            "pickup",
                            "Ambil di Toko",
                            "Ambil pesanan langsung di toko tanpa ongkos kirim",
                            0,
                          ],
                        ].map(([value, title, detail, price]) => {
                          const isFree =
                            value !== "pickup" && total.subtotal >= 699000;
                          const displayPrice =
                            value === "pickup" ? 0 : isFree ? 0 : price;
                          return (
                            <label
                              className={shipping === value ? "selected" : ""}
                              key={value}
                            >
                              <input
                                type="radio"
                                name="shippingChoice"
                                checked={shipping === value}
                                onChange={() => {
                                  setShipping(value);
                                  setShippingOption(
                                    value === "pickup"
                                      ? {
                                          courier: "TOKO",
                                          service: "Ambil di Toko",
                                          cost: 0,
                                        }
                                      : {
                                          courier: "TOKO",
                                          service: "Standar",
                                          cost: isFree ? 0 : manualFee,
                                        }
                                  );
                                }}
                              />
                              <div>
                                <b>{title}</b>
                                <small>
                                  {isFree && value !== "pickup"
                                    ? "Bebas ongkir otomatis (belanja di atas Rp 699.000)"
                                    : detail}
                                </small>
                              </div>
                              <strong>
                                {displayPrice === 0
                                  ? "Gratis"
                                  : money(displayPrice)}
                              </strong>
                            </label>
                          );
                        })}
                      </div>
                    </section>
                  </fieldset>
                </form>
              ) : (
                /* TAHAP 2: PILIH METODE PEMBAYARAN - HANYA DITAMPILKAN DI TAHAP INI */
                <div>
                  <section className="ws-panel ws-form-panel">
                    <div className="ks-saved-address-card" style={{ margin: 0 }}>
                      <div className="ks-saved-address-header">
                        <span className="ks-saved-address-badge">
                          <Check size={14} /> Ringkasan Pengiriman & Penerima
                        </span>
                        <button
                          type="button"
                          className="ks-change-address-btn"
                          onClick={() => {
                            setStep("checkout");
                            nav("checkout", true);
                          }}
                        >
                          Ubah Data Pengiriman
                        </button>
                      </div>
                      <div className="ks-saved-address-body">
                        <strong>
                          {address.name}{" "}
                          <span className="ks-saved-phone">
                            ({address.phone})
                          </span>
                        </strong>
                        <p className="ks-saved-street">
                          <b>Layanan: </b>
                          {shipping === "pickup"
                            ? "Ambil Langsung di Toko (Bebas Ongkir)"
                            : "Pengiriman Standar Kurir Toko"}
                        </p>
                        {shipping !== "pickup" ? (
                          <p className="ks-saved-street">
                            <b>Alamat: </b>
                            {address.street}, {address.city}{" "}
                            {address.postal ? `(${address.postal})` : ""}
                          </p>
                        ) : (
                          <p
                            className="ks-saved-street"
                            style={{ color: "var(--ks-muted)" }}
                          >
                            Lokasi dan waktu pengambilan dikoordinasikan via WhatsApp toko.
                          </p>
                        )}
                        {address.email && (
                          <small className="ks-saved-email">
                            Email konfirmasi: {address.email}
                          </small>
                        )}
                      </div>
                    </div>
                  </section>

                  <section className="ws-panel ws-form-panel">
                    <div className="ws-panel-heading">
                      <h2>
                        <CreditCard size={20} /> Pilih Metode Pembayaran
                      </h2>
                      <p>
                        Pilih cara pembayaran online Anda. Transaksi diproses aman dan status pembayaran terkonfirmasi otomatis.
                      </p>
                    </div>
                    <div className="ks-payment-methods">
                      {["Bank", "E-Wallet", "COD", ...new Set(methods.map((method) => method.group))]
                        .filter((group, index, arr) => arr.indexOf(group) === index && methods.some((m) => m.group === group))
                        .map((group) => (
                          <fieldset key={group}>
                            <legend>
                              {group === "Bank"
                                ? "Transfer Bank (Virtual Account)"
                                : group === "E-Wallet"
                                  ? "E-Wallet & QRIS"
                                  : group === "COD"
                                    ? "Bayar di Tempat (COD)"
                                    : group}
                            </legend>
                            {methods
                              .filter((method) => method.group === group)
                              .map((method) => (
                                <label
                                  key={method.id}
                                  className={
                                    payment === method.id ? "selected" : ""
                                  }
                                >
                                  <input
                                    type="radio"
                                    name="paymentMethod"
                                    value={method.id}
                                    checked={payment === method.id}
                                    onChange={() => setPayment(method.id)}
                                    required
                                  />
                                  <span className="ks-payment-mark">
                                    {group === "Bank" ? "VA" : group === "E-Wallet" ? "QR" : group === "COD" ? "COD" : method.name.slice(0, 3).toUpperCase()}
                                  </span>
                                  <span>
                                    <b>{method.name}</b>
                                    <small>
                                      {method.detail ||
                                        (group === "COD"
                                          ? "Bayar tunai kepada kurir saat pesanan sampai di alamat Anda."
                                          : "Pilihan bank atau dompet digital akan dipilih langsung di halaman pembayaran Xendit.")}
                                    </small>
                                  </span>
                                </label>
                              ))}
                          </fieldset>
                        ))}
                      {!methods.length && (
                        <Notice>
                          Metode pembayaran sedang dimuat atau belum tersedia. Silakan muat ulang halaman.
                        </Notice>
                      )}
                    </div>
                  </section>
                </div>
              )}

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
                        Ukuran {dimensionLabel(i.size)} ·{" "}
                        {i.variationLabel || "Variasi"}: {colorLabel(i.color)} ·{" "}
                        {i.quantity} barang
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

              {step === "checkout" ? (
                /* TOMBOL TAHAP CHECKOUT: LANJUT KE PEMBAYARAN */
                <button
                  className="ws-button primary ks-checkout-btn"
                  type="submit"
                  form="checkout-form"
                  disabled={busy || checking || !cart.length}
                >
                  Lanjut ke Pembayaran
                  <ArrowRight size={17} />
                </button>
              ) : (
                /* TOMBOL TAHAP PEMBAYARAN: PROSES PEMBAYARAN */
                !identity && (
                  <button
                    className="ws-button primary"
                    type="button"
                    disabled={
                      busy || checking || !quote || !config.payments || !payment
                    }
                    onClick={submitPayment}
                  >
                    {busy
                      ? "Menyiapkan pembayaran…"
                      : payment
                      ? "Bayar dengan " + paymentName(payment)
                      : "Pilih metode pembayaran"}
                    <ArrowUpRight size={17} />
                  </button>
                )
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
                <ShieldCheck size={15} /> Pembayaran aman · Status dikonfirmasi
                otomatis.
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
