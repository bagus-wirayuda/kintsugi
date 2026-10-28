import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import {
  Search,
  UserRound,
  Heart,
  ShoppingBag,
  Menu,
  X,
  ArrowRight,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Plus,
  Minus,
  Check,
  Truck,
  Package,
  MapPin,
  ArrowUpRight,
  SlidersHorizontal,
  Star,
  ArrowLeft,
  Instagram,
  Mail,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";
import { categories, money } from "./data";
import { storage, api } from "./store";
import "./styles.css";
const Admin = lazy(() => import("./Admin.jsx"));
const Auth = lazy(() => import("./Auth.jsx"));
const Account = lazy(() => import("./Account.jsx"));
const Checkout = lazy(() => import("./Checkout.jsx"));
import Home from "./Home.jsx";
import { CartPage, WishlistPage, PaymentPage } from "./ShoppingPages.jsx";
import "./workspace.css";
import "./home.css";
import { policy } from "./policies.js";

const routes = [
  "home",
  "catalog",
  "wishlist",
  "account",
  "checkout",
  "admin",
  "cart",
];
const initialView = () =>
  routes.includes(location.hash.slice(1).split("/")[0])
    ? location.hash.slice(1).split("/")[0]
    : "home";
function App() {
  const [products, setProducts] = useState([]),
    [gender, setGender] = useState("Wanita"),
    [view, setView] = useState(initialView),
    [menu, setMenu] = useState(false),
    [search, setSearch] = useState(""),
    [searchOpen, setSearchOpen] = useState(false),
    [category, setCategory] = useState("Semua"),
    [sort, setSort] = useState("recommended"),
    [detail, setDetail] = useState(null),
    [size, setSize] = useState(""),
    [color, setColor] = useState(""),
    [quantity, setQuantity] = useState(1),
    [cart, setCart] = useState([]),
    [wish, setWish] = useState([]),
    [user, setUser] = useState(null),
    [toast, setToast] = useState(""),
    [coupon, setCoupon] = useState(""),
    [placed, setPlaced] = useState(null),
    [info, setInfo] = useState(null),
    [cookie, setCookie] = useState(() => !storage.read("cookie", false));
  const [authReady, setAuthReady] = useState(false),
    [cartOwner, setCartOwner] = useState(null),
    [config, setConfig] = useState({
      contact: "wirayuda101101@gmail.com",
      sandbox: true,
    }),
    [catalog, setCatalog] = useState({
      items: [],
      total: 0,
      pages: 0,
      facets: { sizes: [], colors: [] },
    }),
    [catalogLoading, setCatalogLoading] = useState(true),
    [catalogError, setCatalogError] = useState(""),
    [catalogRetry, setCatalogRetry] = useState(0),
    [page, setPage] = useState(1),
    [filterSize, setFilterSize] = useState(""),
    [filterColor, setFilterColor] = useState(""),
    [minPrice, setMinPrice] = useState(""),
    [maxPrice, setMaxPrice] = useState(""),
    [productLoading, setProductLoading] = useState(false);
  const toastTimer = useRef();
  function notify(t) {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  }
  useEffect(() => {
    if (!authReady) return;
    const owner = user?.id || "guest";
    setCart(storage.read("cart:" + owner, []));
    setWish(storage.read("wish:" + owner, []));
    setCartOwner(owner);
    setCoupon("");
    setPlaced(null);
  }, [user?.id, authReady]);
  useEffect(() => {
    if (authReady && cartOwner === (user?.id || "guest"))
      storage.write("cart:" + cartOwner, cart);
  }, [cart, cartOwner, user?.id, authReady]);
  useEffect(() => {
    if (authReady && cartOwner === (user?.id || "guest"))
      storage.write("wish:" + cartOwner, wish);
  }, [wish, cartOwner, user?.id, authReady]);
  useEffect(() => {
    api("/products?pageSize=48")
      .then((data) => setProducts(data.items))
      .catch((e) => notify(e.message));
    api("/config")
      .then((data) => setConfig({ ...data, loaded: true }))
      .catch((e) => notify(e.message));
    api("/me")
      .then(setUser)
      .catch((e) => {
        if (e.status !== 401) notify(e.message);
      })
      .finally(() => setAuthReady(true));
  }, []);
  useEffect(() => {
    const key = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((s) => !s);
      }
      if (e.key === "Escape") {
        setDetail(null);
        setMenu(false);
        setSearchOpen(false);
        setInfo(null);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    const change = () => setView(initialView());
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    if (!detail && !searchOpen && !menu && !info) return;
    const previous = document.activeElement;
    const dialogs = document.querySelectorAll('[role="dialog"]');
    const dialog = dialogs[dialogs.length - 1];
    if (!dialog) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      [
        ...dialog.querySelectorAll(
          'button,input,select,textarea,[tabindex="0"]',
        ),
      ].filter((e) => !e.disabled && e.getClientRects().length);
    const elements = focusable();
    (dialog.querySelector("[autofocus]") || elements[0])?.focus();
    const trap = (e) => {
      if (e.key !== "Tab") return;
      const items = focusable(),
        first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    dialog.addEventListener("keydown", trap);
    return () => {
      document.body.style.overflow = overflow;
      dialog.removeEventListener("keydown", trap);
      previous?.focus?.();
    };
  }, [detail, searchOpen, menu, info]);
  const nav = (v) => {
    if (v === "success") history.replaceState(null, "", "#account");
    else history.pushState(null, "", "#" + v);
    setView(v.split("/")[0]);
    setMenu(false);
    setSearchOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const shop = (cat = "Semua", g = gender) => {
    setGender(g);
    setCategory(cat);
    setSearch("");
    nav("catalog");
  };
  const openProduct = async (p) => {
    setProductLoading(true);
    try {
      const product = await api("/products/" + encodeURIComponent(p.id));
      setDetail(product);
      setSize("");
      setColor(product.colors[0]);
      setQuantity(1);
    } catch (e) {
      notify(e.message);
    } finally {
      setProductLoading(false);
    }
  };
  const selectedStock = detail?.variants
    ? detail.variants.find((v) => v.size === size && v.color === color)
        ?.stock || 0
    : detail?.stock || 0;
  useEffect(() => {
    setQuantity(1);
  }, [size, color]);
  useEffect(() => {
    setPage(1);
  }, [
    gender,
    category,
    search,
    sort,
    filterSize,
    filterColor,
    minPrice,
    maxPrice,
    view,
  ]);
  useEffect(() => {
    if (!["catalog", "wishlist"].includes(view)) return;
    const controller = new AbortController();
    setCatalogLoading(true);
    setCatalogError("");
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        category: view === "wishlist" ? "Semua" : category,
        search,
        sort,
        page: String(page),
        pageSize: "8",
      });
      if (view === "wishlist") params.set("ids", wish.join(","));
      else params.set("gender", gender);
      if (filterSize) params.set("size", filterSize);
      if (filterColor) params.set("color", filterColor);
      if (minPrice) params.set("min", minPrice);
      if (maxPrice) params.set("max", maxPrice);
      api("/products?" + params, { signal: controller.signal })
        .then(setCatalog)
        .catch((e) => {
          if (e.name !== "AbortError") setCatalogError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setCatalogLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    view,
    gender,
    category,
    search,
    sort,
    page,
    filterSize,
    filterColor,
    minPrice,
    maxPrice,
    wish,
    catalogRetry,
  ]);
  const toggleWish = (id) => {
    if (user?.role === "admin")
      return notify("Favorit hanya tersedia untuk akun pelanggan.");
    setWish((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));
  };
  const add = () => {
    if (user?.role === "admin")
      return notify("Akun admin tidak dapat berbelanja.");
    if (!authReady) return notify("Sedang memuat akun. Coba sesaat lagi.");
    if (!size) {
      notify("Pilih ukuran terlebih dahulu.");
      return;
    }
    const key = `${detail.id}:${size}:${color}`;
    const old = cart.find((i) => i.key === key);
    if ((old?.quantity || 0) + quantity > Math.min(99, selectedStock)) {
      notify("Jumlah melebihi stok tersedia.");
      return;
    }
    setCart((c) =>
      old
        ? c.map((i) =>
            i.key === key ? { ...i, quantity: i.quantity + quantity } : i,
          )
        : [
            ...c,
            { ...detail, stock: selectedStock, key, size, color, quantity },
          ],
    );
    setDetail(null);
    nav("cart");
    notify("Produk ditambahkan ke keranjang");
  };
  const count = cart.reduce((n, i) => n + i.quantity, 0);
  function card(p) {
    return (
      <article className="product" key={p.id}>
        <div className="product-image">
          <button
            className="image-button"
            onClick={() => openProduct(p)}
            aria-label={`Lihat ${p.name}`}
          >
            <img src={p.image} alt={p.name} loading="lazy" />
          </button>
          <span className={"product-tag " + (p.oldPrice ? "red" : "")}>
            {p.oldPrice
              ? "Limited offer"
              : p.isNew
                ? "New arrival"
                : "Everyday essential"}
          </span>
          <button
            className={"wish-btn " + (wish.includes(p.id) ? "liked" : "")}
            aria-label={`Wishlist ${p.name}`}
            onClick={() => toggleWish(p.id)}
          >
            <Heart
              size={19}
              fill={wish.includes(p.id) ? "currentColor" : "none"}
            />
          </button>
        </div>
        <div className="swatches">
          {p.colors.map((c) => (
            <span key={c} style={{ background: c }} />
          ))}
        </div>
        <div className="product-meta">
          {p.gender.toUpperCase()}{" "}
          <span>
            {p.sizes[0]}–{p.sizes.at(-1)}
          </span>
        </div>
        <button className="product-name" onClick={() => openProduct(p)}>
          {p.name}
        </button>
        <div className={"price " + (p.oldPrice ? "sale" : "")}>
          {money(p.price)} {p.oldPrice > 0 && <del>{money(p.oldPrice)}</del>}
        </div>
        <div className="rating">
          <Star size={11} fill="currentColor" />
          {p.rating.toFixed(1)} <span>({p.reviews})</span>
        </div>
      </article>
    );
  }

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      setUser(null);
      setDetail(null);
      nav("account");
    } catch (e) {
      notify(e.message);
    }
  }
  async function authenticated(u) {
    if (u.role === "customer" && cartOwner === "guest" && cart.length) {
      const saved = storage.read("cart:" + u.id, []),
        merged = [...saved];
      for (const item of cart) {
        const old = merged.find((x) => x.key === item.key);
        if (old)
          old.quantity = Math.min(99, item.stock, old.quantity + item.quantity);
        else merged.push({ ...item });
      }
      storage.write("cart:" + u.id, merged);
      storage.write("cart:guest", []);
    }
    if (u.role === "customer" && cartOwner === "guest" && wish.length) {
      storage.write("wish:" + u.id, [
        ...new Set([...storage.read("wish:" + u.id, []), ...wish]),
      ]);
      storage.write("wish:guest", []);
    }
    setUser(u);
    nav(u.role === "admin" ? "admin" : "account");
  }
  const feedback = toast && (
    <div className="ws-toast" role="status">
      {toast}
    </div>
  );
  if (!authReady)
    return (
      <div className="workspace">
        <div className="ws-loading" role="status">
          Menyiapkan Liny Jaya…
        </div>
      </div>
    );
  if (user?.role === "admin")
    return (
      <>
        <Admin user={user} notify={notify} onLogout={logout} />
        {feedback}
      </>
    );
  if (
    !user &&
    ["account", "admin", "checkout", "cart", "wishlist", "success"].includes(
      view,
    )
  )
    return (
      <>
        <Auth
          key={view === "admin" ? "admin" : "customer"}
          admin={view === "admin"}
          onAuthenticated={authenticated}
          config={config}
          pendingCart={cart.length > 0}
        />
        {feedback}
      </>
    );
  if (user && view === "admin")
    return (
      <div className="workspace">
        <div className="ws-empty">
          <ShieldCheck size={35} />
          <h1>Akses khusus administrator</h1>
          <p>Akun Anda adalah akun pelanggan.</p>
          <button className="ws-button primary" onClick={() => nav("account")}>
            Kembali ke akun
          </button>
        </div>
      </div>
    );
  const accountProps = { user, onLogout: logout, nav };
  if (view === "account")
    return (
      <>
        <Account
          {...accountProps}
          onUser={setUser}
          notify={notify}
          wishCount={wish.length}
          cartCount={count}
          config={config}
        />
        {feedback}
      </>
    );
  if (view === "cart")
    return (
      <>
        <CartPage
          {...accountProps}
          cart={cart}
          setCart={setCart}
          coupon={coupon}
          setCoupon={setCoupon}
        />
        {feedback}
      </>
    );
  if (view === "wishlist")
    return (
      <>
        <WishlistPage
          {...accountProps}
          wish={wish}
          setWish={setWish}
          openProduct={(p) => {
            nav("catalog");
            openProduct(p);
          }}
        />
        {feedback}
      </>
    );
  if (view === "checkout")
    return (
      <>
        <Checkout
          user={user}
          cart={cart}
          coupon={coupon}
          config={config}
          nav={nav}
          onPlaced={(order) => {
            storage.write("cart:" + user.id, []);
            setPlaced(order);
            setCart([]);
            setCoupon("");
            nav("success");
          }}
        />
        {feedback}
      </>
    );
  if (view === "success")
    return (
      <>
        <PaymentPage {...accountProps} order={placed} />
        {feedback}
      </>
    );
  return (
    <div
      className={view === "home" ? "modern-storefront" : "catalog-storefront"}
    >
      <div className="topbar">
        <span>Everyday, made better.</span>
        <span>
          Gratis ongkir untuk belanja mulai Rp699.000 <ArrowRight size={12} />
        </span>
        <button onClick={() => setInfo("Bantuan")}>Bantuan & layanan</button>
      </div>
      <header>
        <div className="header-inner">
          <button
            className="brand"
            aria-label="Liny Jaya beranda"
            onClick={() => nav("home")}
          >
            <span>
              LINY
              <br />
              JAYA
            </span>
          </button>
          <nav className="desktop-nav">
            {["Wanita", "Pria", "Anak", "Bayi"].map((g) => (
              <button
                className={gender === g ? "active" : ""}
                key={g}
                onClick={() => {
                  setGender(g);
                  shop("Semua", g);
                }}
              >
                {g}
              </button>
            ))}
          </nav>
          <div className="header-actions">
            <button
              className="search-trigger"
              aria-label="Cari produk"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={20} />
              <span>Cari produk</span>
              <kbd>⌘ K</kbd>
            </button>
            <button aria-label="Akun saya" onClick={() => nav("account")}>
              <UserRound size={21} />
            </button>
            <button
              className="hide-mobile"
              aria-label="Wishlist"
              onClick={() => {
                setCategory("Semua");
                setSearch("");
                nav("wishlist");
              }}
            >
              <Heart size={21} />
              {wish.length > 0 && <i>{wish.length}</i>}
            </button>
            <button aria-label="Keranjang belanja" onClick={() => nav("cart")}>
              <ShoppingBag size={21} />
              {count > 0 && <i>{count}</i>}
            </button>
            <button
              aria-label="Menu kategori"
              className="mobile-menu"
              onClick={() => setMenu(!menu)}
            >
              <Menu />
            </button>
          </div>
        </div>
      </header>
      <div className="mobile-tabs">
        {["Wanita", "Pria", "Anak", "Bayi"].map((g) => (
          <button
            key={g}
            className={gender === g ? "active" : ""}
            onClick={() => {
              setGender(g);
              shop("Semua", g);
            }}
          >
            {g}
          </button>
        ))}
      </div>
      {view === "home" && (
        <Home shop={shop} products={products} openProduct={openProduct} />
      )}
      {(view === "catalog" || view === "wishlist") && (
        <main className="catalog page">
          <div className="breadcrumb">
            <button onClick={() => nav("home")}>Beranda</button>
            <ChevronRight size={12} />
            {view === "wishlist" ? "Wishlist" : gender}
            <ChevronRight size={12} />
            {category}
          </div>
          <div className="catalog-title">
            <div>
              <span className="eyebrow">EVERYDAY ESSENTIALS</span>
              <h1>
                {view === "wishlist"
                  ? "Wishlist Anda"
                  : search
                    ? `Hasil pencarian “${search}”`
                    : category === "Semua"
                      ? `Koleksi ${gender}`
                      : category}
              </h1>
              <p>
                {view === "wishlist"
                  ? "Simpan hari ini. Temukan lagi saat Anda siap."
                  : "Esensial yang mengikuti ritme hidup Anda."}
              </p>
            </div>
            <span>{catalog.total} produk</span>
          </div>
          <div className="catalog-layout">
            <aside>
              <h3>Kategori</h3>
              {categories
                .concat(["Produk Baru", "Penawaran Terbatas"])
                .map((c) => (
                  <button
                    key={c}
                    className={category === c ? "active" : ""}
                    onClick={() => setCategory(c)}
                  >
                    {c}
                    <ChevronRight size={13} />
                  </button>
                ))}
              <hr />
              <h3>Belanja untuk</h3>
              {["Wanita", "Pria", "Anak", "Bayi"].map((g) => (
                <button
                  key={g}
                  className={gender === g ? "active" : ""}
                  onClick={() => setGender(g)}
                >
                  {g}
                </button>
              ))}
              <details className="advanced-filters">
                <summary>Ukuran, warna & harga</summary>
                <div className="filter-fields">
                  <label>
                    Ukuran
                    <select
                      aria-label="Filter ukuran"
                      value={filterSize}
                      onChange={(e) => setFilterSize(e.target.value)}
                    >
                      <option value="">Semua ukuran</option>
                      {catalog.facets.sizes.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Warna
                    <select
                      aria-label="Filter warna"
                      value={filterColor}
                      onChange={(e) => setFilterColor(e.target.value)}
                    >
                      <option value="">Semua warna</option>
                      {catalog.facets.colors.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  {filterColor && (
                    <i
                      className="color-dot"
                      style={{ background: filterColor }}
                    />
                  )}
                  <label>
                    Harga minimum
                    <input
                      aria-label="Harga minimum"
                      type="number"
                      min="0"
                      max="10000000"
                      placeholder="Rp0"
                      value={minPrice}
                      onChange={(e) => setMinPrice(e.target.value)}
                    />
                  </label>
                  <label>
                    Harga maksimum
                    <input
                      aria-label="Harga maksimum"
                      type="number"
                      min="0"
                      max="10000000"
                      placeholder="Rp10.000.000"
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(e.target.value)}
                    />
                  </label>
                  <button
                    className="text-link"
                    onClick={() => {
                      setFilterSize("");
                      setFilterColor("");
                      setMinPrice("");
                      setMaxPrice("");
                      setCategory("Semua");
                      setSearch("");
                    }}
                  >
                    Hapus semua filter
                  </button>
                </div>
              </details>
            </aside>
            <div className="catalog-results">
              <div className="catalog-toolbar">
                <span>
                  <SlidersHorizontal size={16} /> {gender} / {category}
                </span>
                <label>
                  Urutkan:{" "}
                  <select
                    aria-label="Urutkan produk"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="recommended">Rekomendasi</option>
                    <option value="low">Harga terendah</option>
                    <option value="high">Harga tertinggi</option>
                    <option value="rating">Rating tertinggi</option>
                  </select>
                </label>
              </div>
              <div className="active-filters">
                {[
                  search && "Cari: " + search,
                  category !== "Semua" && category,
                  filterSize && "Ukuran: " + filterSize,
                  filterColor && "Warna: " + filterColor,
                  minPrice && "Min: " + money(minPrice),
                  maxPrice && "Maks: " + money(maxPrice),
                ]
                  .filter(Boolean)
                  .map((t) => (
                    <span key={t}>{t}</span>
                  ))}
              </div>
              {catalogLoading ? (
                <div className="empty" role="status">
                  Memuat koleksi…
                </div>
              ) : catalogError ? (
                <div className="empty" role="alert">
                  <h2>Koleksi belum dapat dimuat.</h2>
                  <p>{catalogError}</p>
                  <button
                    className="btn black"
                    onClick={() => setCatalogRetry((n) => n + 1)}
                  >
                    Coba lagi
                  </button>
                </div>
              ) : catalog.items.length ? (
                <div className="product-grid catalog-grid">
                  {catalog.items.map(card)}
                </div>
              ) : (
                <div className="empty">
                  <Search size={40} />
                  <h2>Belum ada produk di sini.</h2>
                  <p>Coba kategori atau kata pencarian lain.</p>
                  <button className="btn black" onClick={() => shop()}>
                    Jelajahi semua produk
                  </button>
                </div>
              )}
              {catalog.pages > 1 && (
                <nav className="pagination" aria-label="Halaman produk">
                  <button
                    className="btn outline"
                    disabled={page <= 1 || catalogLoading}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    ← Sebelumnya
                  </button>
                  <span>
                    {page} / {catalog.pages}
                  </span>
                  <button
                    className="btn outline"
                    disabled={page >= catalog.pages || catalogLoading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Berikutnya →
                  </button>
                </nav>
              )}
            </div>
          </div>
        </main>
      )}
      <section className="newsletter">
        <div>
          <span className="eyebrow">STAY IN THE KNOW</span>
          <h2>Sedikit inspirasi, langsung ke inbox Anda.</h2>
          <p>Koleksi baru, cerita menarik, dan penawaran pilihan.</p>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            try {
              await api("/newsletter", {
                method: "POST",
                body: { email: form.querySelector("input").value },
              });
              notify("Email tersimpan untuk kabar koleksi Liny Jaya.");
              form.reset();
            } catch (e) {
              notify(e.message);
            }
          }}
        >
          <label className="sr-only" htmlFor="newsletter">
            Email newsletter
          </label>
          <input
            id="newsletter"
            type="email"
            required
            placeholder="Alamat email Anda"
          />
          <button aria-label="Daftar newsletter">
            <ArrowRight size={22} />
          </button>
        </form>
      </section>
      <footer className="site-footer">
        <div className="footer-top">
          <div className="footer-brand">
            <button className="brand" onClick={() => nav("home")}>
              <span>
                LINY
                <br />
                JAYA
              </span>
            </button>
            <p>Everyday, made better.</p>
            <span>
              Pakaian esensial. Kenyamanan nyata.
              <br />
              Untuk semua cerita Anda.
            </span>
          </div>
          {[
            [
              "Tentang Liny Jaya",
              "Cerita kami",
              "Kualitas & material",
              "Keberlanjutan",
              "Temukan toko",
            ],
            [
              "Bantuan",
              "Panduan belanja",
              "Pengiriman",
              "Penukaran & pengembalian",
              "Hubungi kami",
            ],
            [
              "Akun Anda",
              "Akun saya",
              "Riwayat pesanan",
              "Wishlist",
              "Panel admin",
            ],
          ].map(([title, ...links]) => (
            <div className="footer-column" key={title}>
              <h4>{title}</h4>
              {links.map((l) => (
                <button
                  key={l}
                  onClick={() =>
                    l === "Wishlist"
                      ? (setCategory("Semua"), setSearch(""), nav("wishlist"))
                      : ["Akun saya", "Riwayat pesanan"].includes(l)
                        ? nav("account")
                        : l === "Panel admin"
                          ? nav("admin")
                          : setInfo(l)
                  }
                >
                  {l}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="footer-bottom">
          <span>© 2026 Liny Jaya. Semua hak dilindungi.</span>
          <div>
            <button onClick={() => setInfo("Kebijakan privasi")}>
              Kebijakan privasi
            </button>
            <button onClick={() => setInfo("Syarat & ketentuan")}>
              Syarat & ketentuan
            </button>
            <span>Indonesia / IDR</span>
          </div>
          <span className="demo-label">
            {config.sandbox ? "XENDIT TEST MODE" : "LINY JAYA"}
          </span>
        </div>
      </footer>
      {detail && (
        <div className="overlay" onClick={() => setDetail(null)}>
          <section
            className="product-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={detail.name}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="Tutup detail"
              onClick={() => setDetail(null)}
            >
              <X />
            </button>
            <div className="detail-image">
              <img src={detail.image} alt={detail.name} />
            </div>
            <div className="detail-info">
              <span className="eyebrow">
                {detail.gender} / {detail.category}
              </span>
              <h1>{detail.name}</h1>
              <div className="rating">
                <Star size={14} fill="currentColor" />
                {detail.rating.toFixed(1)} ({detail.reviews} ulasan dummy)
              </div>
              <div className="detail-price">
                {money(detail.price)}
                {detail.oldPrice > 0 && <del>{money(detail.oldPrice)}</del>}
              </div>
              <p>{detail.description}</p>
              <label>
                Warna{" "}
                <span>
                  {detail.colors.indexOf(color) + 1} / {detail.colors.length}
                </span>
              </label>
              <div className="color-choices">
                {detail.colors.map((c) => (
                  <button
                    key={c}
                    aria-label={`Warna ${c}`}
                    className={color === c ? "selected" : ""}
                    style={{ background: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
              <label>
                Ukuran: {size || "Pilih ukuran"}{" "}
                <button
                  className="text-link"
                  onClick={() => setInfo("Panduan ukuran")}
                >
                  Panduan ukuran
                </button>
              </label>
              <div className="size-choices">
                {detail.sizes.map((s) => (
                  <button
                    className={size === s ? "selected" : ""}
                    key={s}
                    disabled={
                      Boolean(detail.variants) &&
                      !detail.variants.some(
                        (v) => v.size === s && v.color === color && v.stock > 0,
                      )
                    }
                    onClick={() => setSize(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <label>
                Jumlah{" "}
                <span>
                  {size ? selectedStock + " tersedia" : "Pilih varian"}
                </span>
              </label>
              <div className="qty">
                <button
                  aria-label="Kurangi jumlah"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                >
                  <Minus size={15} />
                </button>
                <span>{quantity}</span>
                <button
                  aria-label="Tambah jumlah"
                  disabled={
                    !size ||
                    selectedStock < 1 ||
                    quantity >= Math.min(99, selectedStock)
                  }
                  onClick={() =>
                    setQuantity(Math.min(99, selectedStock, quantity + 1))
                  }
                >
                  <Plus size={15} />
                </button>
              </div>
              <button
                className="btn black full"
                disabled={!size || selectedStock < 1 || !authReady}
                onClick={add}
              >
                Tambahkan ke keranjang <ShoppingBag size={18} />
              </button>
              <button
                className="btn outline full"
                onClick={() => toggleWish(detail.id)}
              >
                <Heart
                  size={17}
                  fill={wish.includes(detail.id) ? "currentColor" : "none"}
                />
                {wish.includes(detail.id)
                  ? "Tersimpan di wishlist"
                  : "Simpan ke wishlist"}
              </button>
              <div className="detail-delivery">
                <Truck size={18} />
                <span>
                  Gratis ongkir min. Rp699.000
                  <br />
                  <small>Hubungi layanan pelanggan untuk penukaran.</small>
                </span>
              </div>
              <details>
                <summary>Material & perawatan</summary>
                <p>
                  Ikuti label perawatan pada barang. Hubungi pengelola untuk
                  rincian komposisi material produk ini.
                </p>
              </details>
            </div>
          </section>
        </div>
      )}
      {searchOpen && (
        <div
          className="overlay search-overlay"
          onClick={() => setSearchOpen(false)}
        >
          <section
            className="search-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Cari produk"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="search-title">
              <h2>Apa yang Anda cari?</h2>
              <button
                aria-label="Tutup pencarian"
                onClick={() => setSearchOpen(false)}
              >
                <X />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setCategory("Semua");
                nav("catalog");
              }}
            >
              <Search />
              <input
                autoFocus
                placeholder="Cari kemeja, T-shirt, celana…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button aria-label="Cari">
                <ArrowRight />
              </button>
            </form>
            <span className="eyebrow">PENCARIAN POPULER</span>
            <div className="search-tags">
              {["Linen", "T-Shirt", "Jeans", "Cardigan"].map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setSearch(t);
                    setCategory("Semua");
                    nav("catalog");
                  }}
                >
                  {t}
                  <ArrowUpRight size={14} />
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
      {menu && (
        <div className="overlay" onClick={() => setMenu(false)}>
          <section
            className="menu-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Menu kategori"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-title">
              <h2>Jelajahi Liny Jaya</h2>
              <button aria-label="Tutup menu" onClick={() => setMenu(false)}>
                <X />
              </button>
            </div>
            {categories.map((c) => (
              <button key={c} onClick={() => shop(c)}>
                {c}
                <ArrowRight size={16} />
              </button>
            ))}
            <button
              onClick={() => {
                setCategory("Semua");
                setSearch("");
                nav("wishlist");
              }}
            >
              Wishlist <Heart size={16} />
            </button>
          </section>
        </div>
      )}
      {info && (
        <div className="overlay" onClick={() => setInfo(null)}>
          <section
            className="info-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={info}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="Tutup informasi"
              onClick={() => setInfo(null)}
            >
              <X />
            </button>
            <span className="eyebrow">LINY JAYA / INFORMASI</span>
            <h2>{info}</h2>
            {info === "Panduan ukuran" ? (
              <>
                <p>Ukuran dummy (lingkar dada / panjang dalam cm).</p>
                <table>
                  <thead>
                    <tr>
                      <th>Ukuran</th>
                      <th>Dada</th>
                      <th>Panjang</th>
                    </tr>
                  </thead>
                  <tbody>
                    {["XS", "S", "M", "L", "XL", "XXL"].map((s, i) => (
                      <tr key={s}>
                        <td>{s}</td>
                        <td>{84 + i * 6}</td>
                        <td>{62 + i * 2}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <>
                <p>{policy(info, config.contact)}</p>
                <p>
                  <a href={"mailto:" + config.contact}>{config.contact}</a>
                </p>
              </>
            )}
          </section>
        </div>
      )}
      {cookie && (
        <div className="cookie">
          <p>
            Kami menyimpan preferensi dan keranjang di browser agar Anda dapat
            melanjutkan belanja.
          </p>
          <button
            onClick={() => {
              storage.write("cookie", true);
              setCookie(false);
            }}
          >
            Mengerti <Check size={14} />
          </button>
        </div>
      )}
      {productLoading && (
        <div className="toast" role="status">
          Memuat detail produk…
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
      <span className="mode-indicator">
        {"LINY JAYA · " + (config.sandbox ? "XENDIT TEST" : "ONLINE")}
      </span>
    </div>
  );
}
createRoot(document.getElementById("root")).render(
  <Suspense
    fallback={
      <div className="workspace">
        <div className="ws-loading" role="status">
          Memuat halaman…
        </div>
      </div>
    }
  >
    <App />
  </Suspense>,
);
