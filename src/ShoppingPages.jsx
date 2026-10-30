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
} from "lucide-react";
import { Empty, Notice } from "./Workspace";
import { api, totals } from "./store";
import { colorLabel, money } from "./data";
import { categoryLabel, departmentLabel } from "./catalog";
import { StoreHeader, StoreFooter } from "./StoreChrome";
function Shell({
  user,
  onLogout,
  nav,
  shop,
  gender,
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
        nav={nav}
        shop={shop}
        gender={gender}
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
      <StoreFooter nav={nav} />
    </div>
  );
}
export function CartPage({
  user,
  onLogout,
  nav,
  cart,
  setCart,
  coupon,
  setCoupon,
  shop,
  gender,
  wishCount,
  onSearch,
}) {
  const [input, setInput] = useState(coupon),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const total = totals(cart, coupon);
  function quantity(key, value) {
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
      setCoupon(code);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell
      user={user}
      onLogout={onLogout}
      nav={nav}
      active="cart"
      onSearch={onSearch}
      shop={shop}
      gender={gender}
      cartCount={cart.reduce((sum, row) => sum + row.quantity, 0)}
      wishCount={wishCount}
      title="Keranjang belanja"
      subtitle="Periksa barang pilihan Anda sebelum checkout."
    >
      {!cart.length ? (
        <div className="ws-panel">
          <Empty
            icon={ShoppingBag}
            title="Keranjang masih kosong"
            action={
              <button
                className="ws-button primary"
                onClick={() => nav("catalog")}
              >
                Jelajahi katalog
                <ArrowRight size={16} />
              </button>
            }
          >
            Pilih produk dan varian yang sesuai untuk mulai berbelanja.
          </Empty>
        </div>
      ) : (
        <div className="ws-cart-layout">
          <section className="ws-panel ws-cart-list">
            <div className="ws-panel-heading">
              <h2>Produk pilihan Anda</h2>
              <p>
                {cart.reduce((n, i) => n + i.quantity, 0)} barang di keranjang
              </p>
            </div>
            {cart.map((i) => (
              <article className="ws-cart-item" key={i.key}>
                <img src={i.image} alt={i.name} />
                <div>
                  <h3>{i.name}</h3>
                  <p>
                    Ukuran kasur {i.size} ·{" "}
                    <i className="color-dot" style={{ background: i.color }} /> {colorLabel(i.color)}
                  </p>
                  <b>{money(i.price)}</b>
                  <div className="ws-quantity">
                    <button
                      aria-label={"Kurangi " + i.name}
                      disabled={i.quantity <= 1}
                      onClick={() => quantity(i.key, i.quantity - 1)}
                    >
                      <Minus size={14} />
                    </button>
                    <span>{i.quantity}</span>
                    <button
                      aria-label={"Tambah " + i.name}
                      disabled={i.quantity >= Math.min(99, i.stock)}
                      onClick={() => quantity(i.key, i.quantity + 1)}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
                <div className="ws-cart-item-end">
                  <strong>{money(i.price * i.quantity)}</strong>
                  <button
                    className="ws-link danger"
                    onClick={() =>
                      setCart((c) => c.filter((x) => x.key !== i.key))
                    }
                  >
                    <Trash2 size={15} />
                    Hapus
                  </button>
                </div>
              </article>
            ))}
          </section>
          <aside className="ws-panel checkout-summary">
            <h2>Ringkasan belanja</h2>
            <form className="ws-coupon" onSubmit={apply}>
              <label>
                Kode voucher
                <div>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Masukkan kode"
                  />
                  <button className="ws-button" disabled={busy}>
                    Gunakan
                  </button>
                </div>
              </label>
            </form>
            {coupon && (
              <button
                className="ws-status success"
                onClick={() => {
                  setCoupon("");
                  setInput("");
                }}
              >
                Voucher {coupon} aktif · Hapus ×
              </button>
            )}
            <Notice>{error}</Notice>
            <dl className="checkout-totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{money(total.subtotal)}</dd>
              </div>
              {total.discount > 0 && (
                <div className="discount">
                  <dt>Diskon</dt>
                  <dd>−{money(total.discount)}</dd>
                </div>
              )}
              <div>
                <dt>Estimasi ongkir reguler</dt>
                <dd>{money(total.delivery)}</dd>
              </div>
              <div className="total">
                <dt>Estimasi total</dt>
                <dd>{money(total.total)}</dd>
              </div>
            </dl>
            <button
              className="ws-button primary"
              onClick={() => nav("checkout")}
            >
              Lanjut ke checkout
              <ArrowRight size={17} />
            </button>
            <p className="checkout-safe">
              Harga, stok, dan ongkir diperiksa kembali saat checkout.
            </p>
          </aside>
        </div>
      )}
    </Shell>
  );
}
export function WishlistPage({
  user,
  onLogout,
  nav,
  wish,
  setWish,
  openProduct,
  shop,
  gender,
  cartCount,
  onSearch,
}) {
  const [rows, setRows] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    setLoading(true);
    api("/products?ids=" + encodeURIComponent(wish.join(",")) + "&pageSize=48")
      .then((d) => setRows(d.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [wish]);
  return (
    <Shell
      user={user}
      onLogout={onLogout}
      nav={nav}
      active="wishlist"
      onSearch={onSearch}
      shop={shop}
      gender={gender}
      cartCount={cartCount}
      wishCount={wish.length}
      title="Favorit saya"
      subtitle="Produk pilihan yang ingin Anda temukan kembali."
    >
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
                  onClick={() => openProduct(p)}
                >
                  <img src={p.image} alt={p.name} />
                </button>
                <div>
                  <span className="ws-kicker">
                    {departmentLabel(p.gender)} / {categoryLabel(p.category)}
                  </span>
                  <h3>{p.name}</h3>
                  <b>{money(p.price)}</b>
                  <div className="ks-product-actions"><button onClick={() => openProduct(p, 'cart')}>+ Keranjang</button><button onClick={() => openProduct(p, 'buy')}>Beli langsung</button></div>
                  <button
                    className="ws-link secondary-link"
                    onClick={() =>
                      setWish((w) => w.filter((id) => id !== p.id))
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
    </Shell>
  );
}
export function PaymentPage({
  user,
  onLogout,
  nav,
  order,
  shop,
  gender,
  cartCount,
  wishCount,
  onSearch,
}) {
  const pending = order?.payment_status === "PENDING";
  return (
    <Shell
      user={user}
      onLogout={onLogout}
      nav={nav}
      active="orders"
      shop={shop}
      gender={gender}
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
