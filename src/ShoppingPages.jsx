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
  Truck,
  MapPin,
} from "lucide-react";
import { Empty, Notice } from "./Workspace";
import { api, totals } from "./store";
import { colorLabel, money } from "./data";
import { categoryLabel } from "./catalog";
import { StoreHeader, StoreFooter } from "./StoreChrome";
import { dimensionLabel } from "./dimensions.js";
import { getCartItemCount } from "./checkout-state.js";
import QrisPanel from "./QrisPanel.jsx";
import { resolveShippingInfo } from "./shipping-info.js";
import { handleImageError, resolveMediaUrl } from "./variant-utils.js";
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
              PESANAN / {active === "cart" ? "KERANJANG BELANJA" : "FAVORIT"}
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
  selectedKeys = null,
  onToggleSelect,
  onToggleSelectAll,
  coupon = "",
  setCoupon,
  config,
  nav,
}) {
  const [input, setInput] = useState(coupon || ""),
    [error, setError] = useState(""),
    [quote, setQuote] = useState(null),
    [quoteError, setQuoteError] = useState(""),
    [busy, setBusy] = useState(false);

  useEffect(() => {
    setInput(coupon || "");
  }, [coupon]);

  const selectedSet = new Set(
    Array.isArray(selectedKeys) ? selectedKeys : cart.map((i) => i.key),
  );
  const selectedItems = cart.filter((i) => selectedSet.has(i.key));
  const totalCartUnits = getCartItemCount(cart);
  const selectedUnits = getCartItemCount(selectedItems);
  const allSelected = cart.length > 0 && selectedItems.length === cart.length;
  const someSelected = selectedItems.length > 0 && selectedItems.length < cart.length;

  const manualShippingFee = Number(config?.shipping?.manualShippingFee ?? config?.shipping?.localDeliveryFee ?? 15000);
  const optimisticTotal = selectedItems.length
    ? totals(selectedItems, coupon, "standard", manualShippingFee)
    : { subtotal: 0, discount: 0, delivery: 0, total: 0 };

  const selectedSignature = selectedItems
    .map((i) => `${i.key}:${Math.max(1, Math.trunc(Number(i.quantity) || 1))}`)
    .join("|");

  useEffect(() => {
    if (!selectedItems.length) {
      setQuote(null);
      setQuoteError("");
      return;
    }
    const controller = new AbortController();
    setQuoteError("");
    const timer = setTimeout(() => {
      api("/checkout/quote", {
        method: "POST",
        signal: controller.signal,
        body: {
          items: selectedItems.map(({ id, variantId, size, color, quantity }) => ({
            id: String(id).trim(),
            ...(variantId && String(variantId).trim() ? { variantId: String(variantId).trim() } : {}),
            size: String(size ?? "").trim(),
            color: String(color ?? "").trim(),
            quantity: Math.max(1, Math.trunc(Number(quantity) || 1)),
          })),
          coupon,
          shipping: "local",
        },
      })
        .then(setQuote)
        .catch((e) => {
          if (e.name !== "AbortError") setQuoteError(e.message);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [selectedSignature, coupon]);

  const total = selectedItems.length ? quote || optimisticTotal : optimisticTotal;

  const maxStockFor = (item) => {
    const s = Number(item?.stock);
    return Number.isFinite(s) && s > 0 ? Math.min(99, Math.trunc(s)) : 99;
  };

  function quantity(key, value) {
    if (!setCart) return;
    const numeric = Math.trunc(Number(value));
    const safeNext = Number.isFinite(numeric) ? numeric : 1;
    setCart((c) =>
      c.map((i) => {
        if (i.key !== key) return i;
        const cap = maxStockFor(i);
        return { ...i, stock: cap, quantity: Math.min(cap, Math.max(1, safeNext)) };
      }),
    );
  }

  async function apply(e) {
    e.preventDefault();
    if (!selectedItems.length) {
      setError("Pilih minimal 1 produk sebelum menggunakan kode voucher.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const code = input.trim().toUpperCase();
      const q = await api("/checkout/quote", {
        method: "POST",
        body: {
          items: selectedItems.map(({ id, variantId, size, color, quantity }) => ({
            id: String(id).trim(),
            ...(variantId && String(variantId).trim() ? { variantId: String(variantId).trim() } : {}),
            size: String(size ?? "").trim(),
            color: String(color ?? "").trim(),
            quantity: Math.max(1, Math.trunc(Number(quantity) || 1)),
          })),
          coupon: code,
          shipping: "local",
        },
      });
      setQuote(q);
      if (setCoupon) setCoupon(code);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function proceedToCheckout() {
    if (!selectedItems.length || busy) return;
    setBusy(true);
    setQuoteError("");
    try {
      const q = await api("/checkout/quote", {
        method: "POST",
        body: {
          items: selectedItems.map(({ id, variantId, size, color, quantity }) => ({
            id: String(id).trim(),
            ...(variantId && String(variantId).trim() ? { variantId: String(variantId).trim() } : {}),
            size: String(size ?? "").trim(),
            color: String(color ?? "").trim(),
            quantity: Math.max(1, Math.trunc(Number(quantity) || 1)),
          })),
          coupon,
          shipping: "local",
        },
      });
      setQuote(q);
      if (setCart && Array.isArray(q?.items)) {
        setCart((prev) =>
          prev.map((row) => {
            const matched = q.items.find(
              (srv) =>
                (srv.variantId && row.variantId && srv.variantId === row.variantId) ||
                (srv.id === row.id &&
                  String(srv.color).trim().toLowerCase() === String(row.color).trim().toLowerCase() &&
                  String(srv.size).trim().toLowerCase() === String(row.size).trim().toLowerCase()),
            );
            return matched ? { ...row, price: matched.price } : row;
          }),
        );
      }
      nav("checkout");
    } catch (e) {
      setQuoteError(e.message);
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
          <h2>Produk di Keranjang</h2>
          <span className="ks-cart-count-badge">
            {totalCartUnits} barang · {cart.length} jenis produk
          </span>
        </div>

        <div className="ks-cart-select-bar">
          <label className="ks-cart-select-all" htmlFor="cart-select-all">
            <input
              id="cart-select-all"
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              type="checkbox"
              checked={allSelected}
              onChange={(e) => onToggleSelectAll?.(e.target.checked)}
            />
            <span>
              Pilih Semua <strong>({cart.length} produk · {totalCartUnits} barang)</strong>
            </span>
          </label>
          <span className="ks-cart-selected-summary">
            Dipilih: <strong>{selectedUnits} barang</strong> ({selectedItems.length} produk)
          </span>
        </div>

        <div className="ks-cart-items-list">
          {cart.map((i) => {
            const isChecked = selectedSet.has(i.key);
            return (
              <article
                className={"ks-cart-card " + (isChecked ? "is-selected" : "")}
                key={i.key}
              >
                <label
                  className="ks-cart-check"
                  aria-label={`Pilih ${i.name} untuk checkout`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggleSelect?.(i.key)}
                  />
                </label>
                <div className="ks-cart-img-wrap">
                  <img src={resolveMediaUrl(i.image)} alt={i.name} loading="lazy" onError={(e) => handleImageError(e)} />
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
                    <span className="ks-stepper-val">{Number(i.quantity) || 1}</span>
                    <button
                      type="button"
                      className="ks-stepper-btn"
                      aria-label={"Tambah " + i.name}
                      disabled={(Number(i.quantity) || 1) >= maxStockFor(i)}
                      onClick={() => quantity(i.key, (Number(i.quantity) || 1) + 1)}
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  <div className="ks-cart-price-action-group">
                    <div className="ks-cart-item-pricing">
                      <span className="ks-cart-total-label">
                        {money(i.price)} × {Number(i.quantity) || 1}
                      </span>
                      <strong className="ks-cart-total-val">
                        {money(i.price * (Number(i.quantity) || 1))}
                      </strong>
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
            );
          })}
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
              <span>Produk Dipilih</span>
              <span>{selectedItems.length} jenis ({selectedUnits} barang)</span>
            </div>

            <div className="ks-summary-row">
              <span>Total Harga ({selectedUnits} barang)</span>
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
              <span>
                {!selectedItems.length
                  ? "—"
                  : total.delivery === 0
                    ? "Gratis"
                    : money(total.delivery)}
              </span>
            </div>

            <div className="ks-summary-divider" />

            <div className="ks-summary-row ks-summary-total">
              <span>Total Pembayaran</span>
              <strong className="ks-summary-total-price">{money(total.total)}</strong>
            </div>
          </div>

          {quoteError && (
            <div className="ks-voucher-error" role="alert" style={{ marginBottom: "12px" }}>
              {quoteError}
            </div>
          )}

          {!selectedItems.length && (
            <p className="ks-cart-selection-hint">
              Pilih minimal 1 produk di keranjang untuk melanjutkan checkout.
            </p>
          )}

          <button
            type="button"
            className="btn black ks-checkout-btn"
            disabled={!selectedItems.length || busy}
            onClick={proceedToCheckout}
          >
            <span>
              {busy
                ? "Memvalidasi pesanan…"
                : selectedUnits > 0
                  ? `Lanjut ke Checkout (${selectedUnits} barang)`
                  : "Lanjut ke Checkout"}
            </span>
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
      cartCount={getCartItemCount(cart)}
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
                  <img src={resolveMediaUrl(p.image)} alt={p.name} onError={(e) => handleImageError(e)} />
                </button>
                <div>
                  <span className="ws-kicker">
                    {categoryLabel(p.category, config?.categories)}
                  </span>
                  <h3>{p.name}</h3>
                  <b>{money(p.minPrice ?? p.price)}</b>
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
  onOrderUpdated,
  notify,
  shop,
  activeCategory,
  cartCount,
  wishCount,
  onSearch,
}) {
  const isStorePickup =
    order?.payment_type === "store_pickup" ||
    order?.payment === "store_pickup";
  const isCod = !isStorePickup && (order?.payment_type === "cod" || order?.payment === "COD");
  const isQrisManual =
    !isStorePickup &&
    (order?.payment_type === "qris_manual" ||
      Boolean(order?.qris_payload || order?.qris_static_payload));
  const isExternalUrl = order?.payment_url && /^https?:\/\//i.test(order.payment_url);
  const pending = order?.payment_status === "PENDING";
  const waitingVerify = order?.payment_status === "WAITING_VERIFICATION";
  const shipInfo = resolveShippingInfo(order);
  const waDigits = String(config?.contactPhone || "").replace(/\D/g, "");
  const waHref = waDigits
    ? `https://wa.me/${waDigits.startsWith("0") ? "62" + waDigits.slice(1) : waDigits}`
    : "";
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
      title={
        isStorePickup
          ? "Pesanan Ambil di Toko Dikonfirmasi"
          : isCod
            ? "Pesanan Berhasil Dibuat"
            : "Pembayaran Pesanan"
      }
      subtitle={
        isStorePickup
          ? "Pembayaran dilakukan langsung saat pengambilan di toko."
          : isCod
            ? "Pesanan Anda berhasil dikonfirmasi dan segera diproses oleh toko."
            : isQrisManual
              ? "Scan kode QRIS di bawah lalu unggah bukti transfer untuk diverifikasi Admin."
              : "Pesanan Anda tersimpan dan dapat dilanjutkan dari halaman pesanan."
      }
    >
      <section className="ws-panel ws-payment-result">
        <span className="ws-result-icon">
          <CheckCircle2 size={32} />
        </span>
        <h2>
          {isStorePickup
            ? order?.payment_status === "PAID"
              ? "Pesanan Selesai (Sudah Diambil & Dibayar)"
              : "Menunggu Pengambilan & Pembayaran"
            : isCod
              ? "Pesanan Berhasil Dibuat (COD)"
              : isQrisManual
                ? waitingVerify
                  ? "Menunggu Verifikasi Pembayaran"
                  : order?.payment_status === "PAID"
                    ? "Pembayaran QRIS Diterima (Lunas)"
                    : "Selesaikan Pembayaran QRIS"
                : pending
                  ? "Lanjutkan Pembayaran"
                  : order?.payment_status === "FAILED"
                    ? "Pembayaran belum berhasil disiapkan"
                    : "Pesanan telah tersimpan"}
        </h2>
        <p>
          Nomor pesanan <b>#{order?.id?.slice(-8).toUpperCase()}</b>{" "}
          <span className="ws-mono">({order?.id})</span>
        </p>
        <h3>{money(order?.total || 0)}</h3>
        {order?.paymentError && <Notice>{order.paymentError}</Notice>}
        {!isStorePickup && shipInfo && (
          <div className="ks-order-shipping-panel ks-payment-shipping-panel">
            <div className="ks-order-shipping-header">
              <div className="ks-order-shipping-courier">
                <span
                  className="ks-courier-badge"
                  style={{
                    backgroundColor: shipInfo.courier.bg,
                    borderColor: shipInfo.courier.border,
                    color: shipInfo.courier.color,
                  }}
                >
                  <Truck size={14} />
                  {shipInfo.courier.shortName}
                </span>
                <div className="ks-order-courier-title-wrap">
                  <strong className="ks-order-courier-title">{shipInfo.title}</strong>
                  <span className="ks-order-courier-service">{shipInfo.service}</span>
                </div>
              </div>
              <div className="ks-order-shipping-fee-wrap">
                <span className="ks-order-shipping-fee-label">Ongkos Kirim</span>
                <strong className={`ks-order-shipping-fee ${shipInfo.isFree ? "free" : ""}`}>
                  {shipInfo.deliveryCostLabel}
                </strong>
              </div>
            </div>

            <div className="ks-order-shipping-body">
              <div className="ks-order-shipping-status-banner">
                <div className="ks-order-status-indicator-col">
                  <span className="ks-order-status-dot processing" />
                </div>
                <div className="ks-order-status-content">
                  <p className="ks-order-status-headline">{shipInfo.statusText}</p>
                  <p className="ks-order-status-desc">{shipInfo.statusDetail}</p>
                </div>
              </div>

              {order?.address && (
                <div className="ks-order-address-box">
                  <div className="ks-order-address-icon">
                    <MapPin size={16} />
                  </div>
                  <div className="ks-order-address-text">
                    <div className="ks-order-address-recipient">
                      <b>{order.address.name}</b>
                      {order.address.phone && <span> · {order.address.phone}</span>}
                    </div>
                    <p className="ks-order-address-detail">
                      {order.address.street}, {order.address.city} {order.address.postal}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {isStorePickup ? (
          <div className="ks-pickup-instruction-card">
            <p className="ks-pickup-highlight">
              Pembayaran dilakukan saat pengambilan di toko
            </p>
            <dl className="ks-pickup-details">
              <div>
                <dt>Status Pesanan</dt>
                <dd>{order?.status || "Menunggu Pengambilan & Pembayaran"}</dd>
              </div>
              <div>
                <dt>Status Pembayaran</dt>
                <dd>{order?.payment_status === "PAID" ? "Lunas" : "Belum dibayar (Bayar di Toko)"}</dd>
              </div>
              <div>
                <dt>Alamat Toko</dt>
                <dd>{config?.storeAddress || "Hubungi admin WhatsApp untuk alamat lengkap pengambilan di toko."}</dd>
              </div>
              <div>
                <dt>Kontak WhatsApp</dt>
                <dd>
                  {config?.contactPhone ? (
                    waHref ? (
                      <a href={waHref} target="_blank" rel="noreferrer" className="ws-link">
                        {config.contactPhone}
                      </a>
                    ) : (
                      config.contactPhone
                    )
                  ) : (
                    "Gunakan kontak admin pada halaman Informasi Toko"
                  )}
                </dd>
              </div>
              <div>
                <dt>Informasi Pengambilan</dt>
                <dd>
                  {config?.pickupInfo ||
                    "Tunjukkan nomor pesanan Anda kepada petugas toko saat melakukan pengambilan dan pembayaran."}
                </dd>
              </div>
            </dl>
          </div>
        ) : isCod ? (
          <p style={{ maxWidth: 460, margin: "12px auto", color: "var(--ws-muted)", lineHeight: 1.6 }}>
            Pesanan Anda menggunakan metode <b>Bayar di Tempat (COD)</b>. Siapkan uang tunai sebesar <b>{money(order?.total || 0)}</b> saat kurir mengantarkan pesanan ke alamat Anda.
          </p>
        ) : isQrisManual ? (
          <div style={{ textAlign: "left", marginTop: "18px", width: "100%" }}>
            <QrisPanel
              order={order}
              onUpdated={onOrderUpdated}
              notify={notify}
            />
          </div>
        ) : (
          pending && isExternalUrl && (
            <a className="ws-button primary" href={order.payment_url}>
              Lanjutkan ke Pembayaran Xendit
              <ArrowUpRight size={17} />
            </a>
          )
        )}
        <button className="ws-button" onClick={() => nav("account/orders")}>
          Lihat Status Pesanan
        </button>
        <p>
          {isStorePickup
            ? "Pesanan berstatus Lunas & Selesai setelah pembayaran dan pengambilan dikonfirmasi petugas toko."
            : isCod
              ? "Status pesanan dapat dipantau berkala pada halaman riwayat pesanan."
              : isQrisManual
                ? "Pembayaran menjadi Lunas setelah Admin memeriksa mutasi akun DANA Anda."
                : "Status pesanan diperbarui setelah pembayaran berhasil dikonfirmasi."}
        </p>
      </section>
    </Shell>
  );
}
