import React, { useEffect, useState } from "react";
import {
  Heart,
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Tag,
  ShieldCheck,
} from "lucide-react";
import { Empty, Notice } from "./Workspace";
import { api, totals } from "./store";
import { colorLabel, money } from "./data";
import { categoryLabel } from "./catalog";
import { StoreHeader, StoreFooter } from "./StoreChrome";
import { dimensionLabel } from "./dimensions.js";
function Shell({
  user,
  config,
  onLogout,
  nav,
  shop,
  activeCategory,
  cartCount,
  wishCount,
  onSearch,
  active,
  title,
  subtitle,
  children,
}) {
  return (
    <div className="workspace ks-shopping">
      <StoreHeader
        config={config}
        nav={nav}
        shop={shop}
        activeCategory={activeCategory}
        user={user}
        count={cartCount}
        wishCount={wishCount}
        onSearch={onSearch}
        onLogout={onLogout}
      />
      <main className="ks-shopping-content">
        <div className="breadcrumb">
          <button onClick={() => nav("home")}>Beranda</button>
          <span>/</span>
          <span>{title}</span>
        </div>
        <div className="ks-shopping-title">
          <div>
            <p className="ks-kicker">
              KINTSUGI / {active === "cart" ? "SHOPPING BAG" : "MY SELECTION"}
            </p>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <button className="ws-link" onClick={() => nav("catalog")}>
            Lanjut belanja <ArrowRight size={17} />
          </button>
        </div>
        {children}
      </main>
      <StoreFooter nav={nav} contact={config?.contact} storeAddress={config?.storeAddress} brand={config?.brand} />
    </div>
  );
}
export function CartView({
  cart = [],
  setCart,
  coupon = "",
  setCoupon,
  config,
  nav,
}) {
  const [input, setInput] = useState(coupon || ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);

  useEffect(() => {
    setInput(coupon || "");
  }, [coupon]);

  const total = totals(cart, coupon, "local", config?.shipping?.localDeliveryFee);

  function quantity(key, value) {
    if (!setCart) return;
    setCart((c) =>
      c.map((i) =>
        i.key === key
          ? { ...i, quantity: Math.min(99, i.stock, Math.max(1, value)) }
          : i,
      ),
    );
  }

  async function apply(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const code = input.trim().toUpperCase();
      await api("/checkout/quote", {
        method: "POST",
        body: {
          items: cart.map(({ id, size, color, quantity }) => ({
            id,
            size,
            color,
            quantity,
          })),
          coupon: code,
          shipping: "regular",
        },
      });
      if (setCoupon) setCoupon(code);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!cart.length) {
    return (
      <div className="ks-cart-empty-panel">
        <div className="ks-cart-empty-content">
          <div className="ks-cart-empty-icon">
            <ShoppingBag size={44} />
          </div>
          <h2>Keranjang belanja masih kosong</h2>
          <p>
            Pilih produk dan varian yang sesuai dari katalog kami untuk mulai berbelanja.
          </p>
          <button
            type="button"
            className="btn black ks-cart-empty-btn"
            onClick={() => nav("catalog")}
          >
            <span>Jelajahi Katalog Produk</span>
            <ArrowRight size={17} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ks-cart-page-layout ws-cart-layout">
      <section className="ks-cart-main">
        <div className="ks-cart-header">
          <h2>Produk Pilihan Anda</h2>
          <span className="ks-cart-count-badge">
            {cart.reduce((n, i) => n + i.quantity, 0)} barang
          </span>
        </div>
        <div className="ks-cart-items-list">
          {cart.map((i) => (
            <article className="ks-cart-card" key={i.key}>
              <div className="ks-cart-img-wrap">
                <img src={i.image} alt={i.name} loading="lazy" />
              </div>
              <div className="ks-cart-detail">
                <div className="ks-cart-meta-top">
                  <h3 className="ks-cart-name">{i.name}</h3>
                  <div className="ks-cart-specs">
                    {i.size && (
                      <span className="ks-cart-badge">
                        Ukuran: <strong>{dimensionLabel(i.size)}</strong>
                      </span>
                    )}
                    {i.color && (
                      <span className="ks-cart-badge">
                        {i.variationLabel || "Warna"}: <strong>{colorLabel(i.color)}</strong>
                      </span>
                    )}
                  </div>
                  <div className="ks-cart-unit-price">
                    {money(i.price)} <span className="ks-unit-suffix">/ barang</span>
                  </div>
                </div>

                <div className="ks-cart-controls-row">
                  <div className="ks-cart-stepper" aria-label={`Jumlah pesanan ${i.name}`}>
                    <button
                      type="button"
                      className="ks-stepper-btn"
                      aria-label={"Kurangi " + i.name}
                      disabled={i.quantity <= 1}
                      onClick={() => quantity(i.key, i.quantity - 1)}
                    >
                      <Minus size={14} />
                    </button>
                    <span className="ks-stepper-val">{i.quantity}</span>
                    <button
                      type="button"
                      className="ks-stepper-btn"
                      aria-label={"Tambah " + i.name}
                      disabled={i.quantity >= Math.min(99, i.stock)}
                      onClick={() => quantity(i.key, i.quantity + 1)}
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  <div className="ks-cart-price-action-group">
                    <div className="ks-cart-item-pricing">
                      <span className="ks-cart-total-label">Subtotal</span>
                      <strong className="ks-cart-total-val">{money(i.price * i.quantity)}</strong>
                    </div>

                    <button
                      type="button"
                      className="ks-cart-remove-btn"
                      aria-label={"Hapus " + i.name + " dari keranjang"}
                      onClick={() =>
                        setCart && setCart((c) => c.filter((x) => x.key !== i.key))
                      }
                    >
                      <Trash2 size={14} />
                      <span>Hapus</span>
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <aside className="ks-cart-summary checkout-summary">
        <div className="ks-summary-card">
          <h2 className="ks-summary-title">Ringkasan Belanja</h2>

          <div className="ks-voucher-section">
            <form className="ks-voucher-form" onSubmit={apply}>
              <label htmlFor="cart-voucher-input" className="ks-voucher-label">
                <Tag size={14} />
                <span>Punya kode voucher?</span>
              </label>
              <div className="ks-voucher-input-group">
                <input
                  id="cart-voucher-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Masukkan kode voucher"
                  disabled={busy}
                />
                <button
                  type="submit"
                  className="ks-voucher-submit-btn"
                  disabled={busy || !input.trim()}
                >
                  {busy ? "Memeriksa…" : "Gunakan"}
                </button>
              </div>
            </form>

            {coupon && (
              <div className="ks-voucher-active">
                <div className="ks-voucher-active-info">
                  <CheckCircle2 size={15} />
                  <span>Voucher <strong>{coupon}</strong> aktif</span>
                </div>
                <button
                  type="button"
                  className="ks-voucher-remove-btn"
                  aria-label="Hapus voucher"
                  onClick={() => {
                    if (setCoupon) setCoupon("");
                    setInput("");
                  }}
                >
                  Hapus ×
                </button>
              </div>
            )}

            {error && (
              <div className="ks-voucher-error" role="alert">
                {error}
              </div>
            )}
          </div>

          <div className="ks-summary-rows">
            <div className="ks-summary-row">
              <span>Total Harga ({cart.reduce((n, i) => n + i.quantity, 0)} barang)</span>
              <span>{money(total.subtotal)}</span>
            </div>

            {total.discount > 0 && (
              <div className="ks-summary-row ks-summary-discount">
                <span>Diskon Voucher</span>
                <span>−{money(total.discount)}</span>
              </div>
            )}

            <div className="ks-summary-row">
              <span>Estimasi Ongkir</span>
              <span>{total.delivery > 0 ? money(total.delivery) : "Dihitung saat checkout"}</span>
            </div>

            <div className="ks-summary-divider" />

            <div className="ks-summary-row ks-summary-total">
              <span>Total Pembayaran</span>
              <strong className="ks-summary-total-price">{money(total.total)}</strong>
            </div>
          </div>

          <button
            type="button"
            className="btn black ks-checkout-btn"
            onClick={() => nav("checkout")}
          >
            <span>Lanjut ke Checkout</span>
            <ArrowRight size={17} />
          </button>

          <div className="ks-checkout-security">
            <ShieldCheck size={16} />
            <span>Transaksi aman, stok & ongkir diperiksa ulang saat checkout.</span>
          </div>
        </div>
      </aside>
    </div>
  );
}

export function CartPage(props) {
  const {
    user,
    config,
    onLogout,
    nav,
    cart = [],
    shop,
    activeCategory,
    wishCount,
    onSearch,
  } = props;
  return (
    <Shell
      user={user}
      config={config}
      onLogout={onLogout}
      nav={nav}
      active="cart"
      onSearch={onSearch}
      shop={shop}
      activeCategory={activeCategory}
      cartCount={cart.reduce((sum, row) => sum + row.quantity, 0)}
      wishCount={wishCount}
      title="Keranjang belanja"
      subtitle="Periksa barang pilihan Anda sebelum checkout."
    >
      <CartView {...props} />
    </Shell>
  );
}

export function WishlistView({
  wish = [],
  setWish,
  openProduct,
  nav,
  config,
}) {
  const [rows, setRows] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    if (!wish?.length) {
      setRows([]);
      setLoading(false);
      return;
    }
    api("/products?ids=" + encodeURIComponent(wish.join(",")) + "&pageSize=48")
      .then((d) => setRows(d.items || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [wish]);

  return (
    <>
      <Notice>{error}</Notice>
      {loading ? (
        <div className="ws-loading">Memuat favorit…</div>
      ) : rows.length ? (
        <>
          <p className="ws-muted ws-spaced">
            Pilihan Anda tersimpan di browser ini untuk ditemukan kembali.
          </p>
          <div className="ws-favorites">
            {rows.map((p) => (
              <article key={p.id} className="ws-panel">
                <button
                  className="ws-favorite-image"
                  aria-label={"Lihat " + p.name}
                  onClick={() => openProduct && openProduct(p)}
                >
                  <img src={p.image} alt={p.name} />
                </button>
                <div>
                  <span className="ws-kicker">
                    {categoryLabel(p.category, config?.categories)}
                  </span>
                  <h3>{p.name}</h3>
                  <b>{money(p.price)}</b>
                  <div className="ks-product-actions">
                    <button onClick={() => openProduct && openProduct(p, 'cart')}>+ Keranjang</button>
                    <button onClick={() => openProduct && openProduct(p, 'buy')}>Beli langsung</button>
                  </div>
                  <button
                    className="ws-link secondary-link"
                    onClick={() =>
                      setWish && setWish((w) => w.filter((id) => id !== p.id))
                    }
                  >
                    Hapus dari favorit
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="ws-panel">
          <Empty
            icon={Heart}
            title="Belum ada favorit tersedia"
            action={
              <button
                className="ws-button primary"
                onClick={() => nav("catalog")}
              >
                Temukan produk
              </button>
            }
          >
            Simpan produk melalui ikon hati pada katalog.
          </Empty>
        </div>
      )}
    </>
  );
}

export function WishlistPage(props) {
  const {
    user,
    config,
    onLogout,
    nav,
    wish = [],
    shop,
    activeCategory,
    cartCount,
    onSearch,
  } = props;
  return (
    <Shell
      user={user}
      config={config}
      onLogout={onLogout}
      nav={nav}
      active="wishlist"
      onSearch={onSearch}
      shop={shop}
      activeCategory={activeCategory}
      cartCount={cartCount}
      wishCount={wish.length}
      title="Favorit saya"
      subtitle="Produk pilihan yang ingin Anda temukan kembali."
    >
      <WishlistView {...props} />
    </Shell>
  );
}
export function PaymentPage({
  user,
  config,
  onLogout,
  nav,
  order,
  shop,
  activeCategory,
  cartCount,
  wishCount,
  onSearch,
}) {
  const pending = order?.payment_status === "PENDING";
  return (
    <Shell
      user={user}
      config={config}
      onLogout={onLogout}
      nav={nav}
      active="orders"
      shop={shop}
      activeCategory={activeCategory}
      cartCount={cartCount}
      wishCount={wishCount}
      onSearch={onSearch}
      title="Pembayaran pesanan"
      subtitle="Pesanan Anda tersimpan dan dapat dilanjutkan dari halaman pesanan."
    >
      <section className="ws-panel ws-payment-result">
        <span className="ws-result-icon">
          <CheckCircle2 size={32} />
        </span>
        <h2>
          {pending
            ? "Lanjutkan pembayaran"
            : order?.payment_status === "FAILED"
              ? "Pembayaran belum berhasil disiapkan"
              : "Pesanan telah tersimpan"}
        </h2>
        <p>
          Nomor pesanan <b>#{order?.id?.slice(-8).toUpperCase()}</b>
        </p>
        <h3>{money(order?.total || 0)}</h3>
        <Notice>{order?.paymentError}</Notice>
        {pending && (
          <a className="ws-button primary" href={order.payment_url}>
            Lanjutkan pembayaran
            <ArrowUpRight size={17} />
          </a>
        )}
        <button className="ws-button" onClick={() => nav("account/orders")}>
          Lihat status pesanan
        </button>
        <p>
          Status pesanan diperbarui setelah pembayaran berhasil dikonfirmasi.
        </p>
      </section>
    </Shell>
  );
}
