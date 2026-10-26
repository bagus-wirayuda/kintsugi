import React, { useState, useEffect, useRef } from "react";
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
import { products as seed, categories, assets, campaigns, money } from "./data";
import { DEMO, storage, api, totals, demoOrder } from "./store";
import "./styles.css";
import Admin from "./Admin.jsx";

const routes = ["home", "catalog", "wishlist", "account", "checkout", "admin"];
const initialView = () =>
  routes.includes(location.hash.slice(1)) ? location.hash.slice(1) : "home";
function App() {
  const [products, setProducts] = useState(seed),
    [gender, setGender] = useState("Wanita"),
    [view, setView] = useState(initialView),
    [menu, setMenu] = useState(false),
    [search, setSearch] = useState(""),
    [searchOpen, setSearchOpen] = useState(false),
    [category, setCategory] = useState("Semua"),
    [sort, setSort] = useState("recommended"),
    [slide, setSlide] = useState(0),
    [detail, setDetail] = useState(null),
    [size, setSize] = useState(""),
    [color, setColor] = useState(""),
    [quantity, setQuantity] = useState(1),
    [cart, setCart] = useState(() => storage.read("cart", [])),
    [wish, setWish] = useState(() => storage.read("wish", [])),
    [drawer, setDrawer] = useState(false),
    [user, setUser] = useState(() =>
      DEMO ? storage.read("user", null) : null,
    ),
    [orders, setOrders] = useState(() =>
      DEMO ? storage.read("orders", []) : [],
    ),
    [toast, setToast] = useState(""),
    [coupon, setCoupon] = useState(""),
    [couponInput, setCouponInput] = useState(""),
    [shipping, setShipping] = useState("regular"),
    [placed, setPlaced] = useState(null),
    [busy, setBusy] = useState(false),
    [authMode, setAuthMode] = useState("login"),
    [info, setInfo] = useState(null),
    [cookie, setCookie] = useState(() => !storage.read("cookie", false));
  const toastTimer = useRef();
  function notify(t) {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  }
  useEffect(() => {
    storage.write("cart", cart);
  }, [cart]);
  useEffect(() => {
    storage.write("wish", wish);
  }, [wish]);
  useEffect(() => {
    if (DEMO) {
      storage.write("user", user);
      storage.write("orders", orders);
    }
  }, [user, orders]);
  useEffect(() => {
    if (!DEMO) {
      api("/products")
        .then(setProducts)
        .catch((e) => notify(e.message));
      api("/me")
        .then(setUser)
        .catch(() => {});
      api("/orders")
        .then(setOrders)
        .catch(() => {});
    }
  }, []);
  useEffect(() => {
    const key = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((s) => !s);
      }
      if (e.key === "Escape") {
        setDetail(null);
        setDrawer(false);
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
    if (!detail && !drawer && !searchOpen && !menu && !info) return;
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
  }, [detail, drawer, searchOpen, menu, info]);
  const nav = (v) => {
    if (v !== "success") history.pushState(null, "", "#" + v);
    setView(v);
    setMenu(false);
    setDrawer(false);
    setSearchOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const shop = (cat = "Semua", g = gender) => {
    setGender(g);
    setCategory(cat);
    setSearch("");
    nav("catalog");
  };
  const openProduct = (p) => {
    setDetail(p);
    setSize("");
    setColor(p.colors[0]);
    setQuantity(1);
  };
  const toggleWish = (id) => {
    setWish((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));
  };
  const add = () => {
    if (!size) {
      notify("Pilih ukuran terlebih dahulu.");
      return;
    }
    const key = `${detail.id}:${size}:${color}`;
    const old = cart.find((i) => i.key === key);
    if ((old?.quantity || 0) + quantity > detail.stock) {
      notify("Jumlah melebihi stok tersedia.");
      return;
    }
    setCart((c) =>
      old
        ? c.map((i) =>
            i.key === key ? { ...i, quantity: i.quantity + quantity } : i,
          )
        : [...c, { ...detail, key, size, color, quantity }],
    );
    setDetail(null);
    setDrawer(true);
    notify("Produk ditambahkan ke keranjang");
  };
  const updateQty = (key, n) =>
    setCart((c) =>
      c.map((i) =>
        i.key === key
          ? { ...i, quantity: Math.min(i.stock, Math.max(1, i.quantity + n)) }
          : i,
      ),
    );
  const filtered = products
    .filter(
      (p) =>
        (view === "wishlist" ? wish.includes(p.id) : p.gender === gender) &&
        (category === "Semua" ||
          view === "wishlist" ||
          (category === "Penawaran Terbatas" && p.oldPrice) ||
          (category === "Produk Baru" && p.isNew) ||
          p.category === category) &&
        `${p.name} ${p.category}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "low"
        ? a.price - b.price
        : sort === "high"
          ? b.price - a.price
          : sort === "rating"
            ? b.rating - a.rating
            : 0,
    );
  const total = totals(cart, coupon, shipping),
    count = cart.reduce((s, i) => s + i.quantity, 0),
    campaign = campaigns[slide];
  async function authenticate(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    try {
      let u;
      if (DEMO) {
        u = {
          name: f.name || "Sahabat Liny",
          email: f.email,
          role: "customer",
        };
        notify(
          "Anda masuk dalam mode demo. Tidak ada akun server yang dibuat.",
        );
      } else u = await api("/auth/" + authMode, { method: "POST", body: f });
      setUser(u);
      if (!DEMO) setOrders(await api("/orders"));
      nav("account");
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function checkout(e) {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    try {
      let order;
      if (DEMO) {
        order = demoOrder(cart, form, coupon, shipping);
        setOrders((o) => [order, ...o]);
      } else {
        order = await api("/orders", {
          method: "POST",
          body: {
            items: cart.map((i) => ({
              id: i.id,
              size: i.size,
              color: i.color,
              quantity: i.quantity,
            })),
            address: form,
            coupon,
            shipping,
            payment: form.payment,
          },
        });
        setOrders(await api("/orders"));
        setProducts(await api("/products"));
      }
      setPlaced(order);
      setCart([]);
      setCoupon("");
      nav("success");
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
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
  return (
    <>
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
                  if (view !== "home") shop("Semua", g);
                }}
              >
                {g}
              </button>
            ))}
          </nav>
          <div className="header-actions">
            <button
              className="search-trigger"
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
            <button
              aria-label="Keranjang belanja"
              onClick={() => setDrawer(true)}
            >
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
              if (view !== "home") shop("Semua", g);
            }}
          >
            {g}
          </button>
        ))}
      </div>
      {view === "home" && (
        <>
          <div className="collection-nav">
            <button onClick={() => shop("Produk Baru")}>
              Produk baru <span>NEW</span>
            </button>
            <button onClick={() => shop("Penawaran Terbatas")}>
              Penawaran terbatas
            </button>
            <button onClick={() => shop()}>Koleksi esensial</button>
            <button onClick={() => shop("Kemeja & Blus")}>
              Linen collection
            </button>
            <button onClick={() => setInfo("Toko Liny Jaya")}>
              <MapPin size={14} /> Temukan toko
            </button>
          </div>
          <section className={"hero hero-" + slide}>
            <img
              className="hero-img"
              src={
                gender === "Pria"
                  ? assets.men
                  : gender === "Anak" || gender === "Bayi"
                    ? assets.kids
                    : campaign.image
              }
              alt="Koleksi gaya sehari-hari Liny Jaya"
            />
            <div className="hero-shade" />
            <div className="hero-content">
              <span className="eyebrow light">
                {gender.toUpperCase()} / {campaign.eyebrow}
              </span>
              <h1>{campaign.title}</h1>
              <p>{campaign.desc}</p>
              <button
                className="btn white"
                onClick={() => shop(slide === 1 ? "Kemeja & Blus" : "Semua")}
              >
                Jelajahi koleksi <ArrowUpRight size={18} />
              </button>
            </div>
            <div className="hero-bottom">
              <div>
                <span>{campaign.tag}</span>
                <strong>{campaign.product}</strong>
                <b>{campaign.price}</b>
              </div>
              <div className="slider-controls">
                <span>
                  0{slide + 1}
                  <em>/ 03</em>
                </span>
                <button
                  onClick={() => setSlide((slide + 2) % 3)}
                  aria-label="Banner sebelumnya"
                >
                  <ChevronLeft />
                </button>
                <button
                  onClick={() => setSlide((slide + 1) % 3)}
                  aria-label="Banner berikutnya"
                >
                  <ChevronRight />
                </button>
              </div>
            </div>
            <div className="hero-dots">
              {campaigns.map((_, i) => (
                <button
                  key={i}
                  aria-label={`Banner ${i + 1}`}
                  className={slide === i ? "selected" : ""}
                  onClick={() => setSlide(i)}
                />
              ))}
            </div>
            <span className="hero-side">LINY JAYA — EVERYDAY ESSENTIALS</span>
          </section>
          <div className="service-strip">
            <span>
              <Truck size={18} /> Gratis ongkir mulai Rp699.000
            </span>
            <span>
              <RotateCcw size={17} /> Penukaran mudah hingga 30 hari
            </span>
            <span>
              <Package size={18} /> Ambil pesanan di toko
            </span>
            <span>
              <ShieldCheck size={18} /> Kualitas di setiap detail
            </span>
          </div>
          <main className="home-main">
            <section className="category-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">TEMUKAN FAVORIT ANDA</span>
                  <h2>Untuk semua sisi diri Anda.</h2>
                </div>
                <button className="text-link" onClick={() => shop()}>
                  Semua kategori <ArrowRight size={17} />
                </button>
              </div>
              <div className="category-grid">
                {[
                  {
                    name: "T-Shirt",
                    img: assets.tshirt,
                    sub: "Nyaman di setiap hari",
                  },
                  {
                    name: "Kemeja & Blus",
                    img: assets.linen,
                    sub: "Ringan, dengan karakter",
                  },
                  {
                    name: "Celana",
                    img: assets.denim,
                    sub: "Temukan potongan Anda",
                  },
                  {
                    name: "Luaran",
                    img: assets.jacket,
                    sub: "Layer untuk segala rencana",
                  },
                  {
                    name: "Sweater & Cardigan",
                    img: assets.shirt,
                    sub: "Lembut di setiap sentuhan",
                  },
                  {
                    name: "Aksesoris",
                    img: assets.bag,
                    sub: "Detail yang melengkapi",
                  },
                ].map((c) => (
                  <button
                    className="category-card"
                    key={c.name}
                    onClick={() => shop(c.name)}
                  >
                    <div>
                      <img src={c.img} alt={c.name} loading="lazy" />
                      <span>
                        <ArrowUpRight size={18} />
                      </span>
                    </div>
                    <h3>{c.name}</h3>
                    <p>{c.sub}</p>
                  </button>
                ))}
              </div>
            </section>
            <section className="arrivals">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">FRESH FINDS, EVERY WEEK</span>
                  <h2>Baru datang. Siap jadi favorit.</h2>
                </div>
                <button
                  className="text-link"
                  onClick={() => shop("Produk Baru")}
                >
                  Lihat semua produk baru <ArrowRight size={17} />
                </button>
              </div>
              <div className="product-grid">
                {products
                  .filter((p) => p.gender === gender)
                  .slice(0, 4)
                  .map(card)}
              </div>
            </section>
            <section className="editorial">
              <div className="editorial-image">
                <img
                  src={assets.editorial}
                  alt="Pilihan pakaian esensial"
                  loading="lazy"
                />
                <span>THE LINY JOURNAL / VOL. 01</span>
              </div>
              <div className="editorial-copy">
                <span className="eyebrow">LESS, BUT BETTER.</span>
                <h2>
                  Gaya yang tinggal.
                  <br />
                  Bukan sekadar singgah.
                </h2>
                <p>
                  Pakaian yang baik terasa seperti diri sendiri. Kenali koleksi
                  esensial yang dirancang untuk dipakai, dipadukan, dan dicintai
                  setiap hari.
                </p>
                <button className="btn black" onClick={() => shop()}>
                  Temukan everyday essentials <ArrowUpRight size={18} />
                </button>
                <span className="editorial-foot">MADE FOR YOUR EVERYDAY.</span>
              </div>
            </section>
            <section className="offers">
              <div className="section-heading">
                <div>
                  <span className="eyebrow red-text">
                    PILIHAN HEMAT MINGGU INI
                  </span>
                  <h2>Favorit Anda, harga lebih istimewa.</h2>
                </div>
                <button
                  className="text-link"
                  onClick={() => shop("Penawaran Terbatas")}
                >
                  Lihat penawaran <ArrowRight size={17} />
                </button>
              </div>
              <div className="offer-banner">
                <div>
                  <span>LINY WEEKLY OFFERS</span>
                  <h3>
                    Esensial yang Anda suka.
                    <br />
                    Kesempatan yang Anda tunggu.
                  </h3>
                  <p>
                    Gunakan kode <b>LINY10</b> untuk potongan 10%, maks.
                    Rp100.000.
                  </p>
                </div>
                <button
                  className="btn white"
                  onClick={() => shop("Penawaran Terbatas")}
                >
                  Belanja sekarang <ArrowRight size={18} />
                </button>
              </div>
            </section>
          </main>
        </>
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
            <span>{filtered.length} produk</span>
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
              {filtered.length ? (
                <div className="product-grid catalog-grid">
                  {filtered.map(card)}
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
            </div>
          </div>
        </main>
      )}
      {view === "checkout" && (
        <main className="page checkout">
          <button className="text-link" onClick={() => setDrawer(true)}>
            <ArrowLeft size={16} /> Kembali ke keranjang
          </button>
          <h1>Checkout</h1>
          <div className="checkout-steps">
            <b>01 Keranjang</b>
            <ChevronRight size={14} />
            <b>02 Pengiriman & pembayaran</b>
            <ChevronRight size={14} />
            <span>03 Selesai</span>
          </div>
          <form onSubmit={checkout} className="checkout-grid">
            <div>
              <section className="form-section">
                <h2>Informasi penerima</h2>
                <div className="form-row">
                  <label>
                    Nama lengkap
                    <input
                      name="name"
                      required
                      minLength={2}
                      defaultValue={user?.name}
                      autoComplete="name"
                    />
                  </label>
                  <label>
                    Email
                    <input
                      name="email"
                      type="email"
                      required
                      defaultValue={user?.email}
                      autoComplete="email"
                    />
                  </label>
                </div>
                <label>
                  Nomor telepon
                  <input
                    name="phone"
                    type="tel"
                    pattern="[0-9+ ()-]{8,20}"
                    required
                    autoComplete="tel"
                  />
                </label>
                <label>
                  Alamat lengkap
                  <textarea
                    name="street"
                    minLength={10}
                    required
                    autoComplete="street-address"
                  />
                </label>
                <div className="form-row">
                  <label>
                    Kota / Kabupaten
                    <input name="city" required minLength={2} />
                  </label>
                  <label>
                    Kode pos
                    <input
                      name="postal"
                      pattern="[0-9]{5}"
                      maxLength={5}
                      required
                    />
                  </label>
                </div>
              </section>
              <section className="form-section">
                <h2>Metode pengiriman</h2>
                {[
                  [
                    "regular",
                    "Pengiriman reguler",
                    "2–4 hari kerja · Rp15.000",
                  ],
                  [
                    "express",
                    "Pengiriman ekspres",
                    "1–2 hari kerja · Rp35.000",
                  ],
                  [
                    "pickup",
                    "Ambil di toko",
                    "Liny Jaya Central Jakarta · Gratis",
                  ],
                ].map(([v, t, d]) => (
                  <label className="radio-card" key={v}>
                    <input
                      type="radio"
                      name="shipping"
                      checked={shipping === v}
                      onChange={() => setShipping(v)}
                    />
                    <div>
                      <b>{t}</b>
                      <span>{d}</span>
                    </div>
                  </label>
                ))}
              </section>
              <section className="form-section">
                <h2>Pembayaran simulasi</h2>
                <p className="muted">
                  Pesanan dummy. Tidak ada uang yang ditagihkan.
                </p>
                <label className="radio-card">
                  <input
                    type="radio"
                    name="payment"
                    value="bank_transfer"
                    defaultChecked
                  />
                  <div>
                    <b>Virtual Account (Demo)</b>
                    <span>Simulasi transfer bank</span>
                  </div>
                </label>
                <label className="radio-card">
                  <input type="radio" name="payment" value="cod" />
                  <div>
                    <b>Bayar di tempat (Demo)</b>
                    <span>Simulasi pembayaran saat diterima</span>
                  </div>
                </label>
              </section>
            </div>
            <div className="order-summary">
              <h2>Ringkasan pesanan</h2>
              {cart.map((i) => (
                <div className="summary-item" key={i.key}>
                  <img src={i.image} alt="" />
                  <div>
                    <b>{i.name}</b>
                    <span>
                      {i.size} / {i.quantity} item
                    </span>
                    <strong>{money(i.price * i.quantity)}</strong>
                  </div>
                </div>
              ))}
              <Summary total={total} />
              <button
                disabled={busy || !cart.length}
                className="btn black full"
                type="submit"
              >
                {busy ? "Memproses…" : "Buat pesanan dummy"}
                <ArrowRight size={17} />
              </button>
              <small>
                <ShieldCheck size={14} /> Checkout simulasi tanpa transaksi uang
              </small>
            </div>
          </form>
        </main>
      )}
      {view === "success" && placed && (
        <main className="page success">
          <span className="success-icon">
            <Check size={38} />
          </span>
          <span className="eyebrow">TERIMA KASIH TELAH MEMILIH LINY JAYA</span>
          <h1>Favorit baru Anda sedang disiapkan.</h1>
          <p>
            Pesanan <b>{placed.id}</b> berhasil dibuat.
          </p>
          <div className="success-box">
            <div>
              <span>Total pesanan</span>
              <b>{money(placed.total)}</b>
            </div>
            <div>
              <span>Status</span>
              <b>{placed.status}</b>
            </div>
            <p>
              Ini adalah pesanan simulasi. Tidak diperlukan pembayaran nyata.
            </p>
          </div>
          <button className="btn black" onClick={() => nav("account")}>
            Lihat pesanan saya <ArrowRight size={17} />
          </button>
          <button className="text-link" onClick={() => nav("home")}>
            Kembali ke beranda
          </button>
        </main>
      )}
      {view === "account" && (
        <main className="page account">
          <div className="breadcrumb">
            <button onClick={() => nav("home")}>Beranda</button>
            <ChevronRight size={12} />
            Akun saya
          </div>
          {!user ? (
            <div className="auth-layout">
              <div>
                <span className="eyebrow">YOUR EVERYDAY STARTS HERE</span>
                <h1>
                  Selamat datang
                  <br />
                  di Liny Jaya.
                </h1>
                <p>Satu akun untuk semua favorit dan cerita baru Anda.</p>
                <div className="auth-benefit">
                  <Heart /> Simpan produk favorit Anda
                </div>
                <div className="auth-benefit">
                  <Package /> Pantau pesanan dengan mudah
                </div>
                <div className="auth-benefit">
                  <Star /> Temukan penawaran khusus
                </div>
              </div>
              <form className="auth-form" onSubmit={authenticate}>
                <div className="auth-tabs">
                  <button
                    type="button"
                    className={authMode === "login" ? "active" : ""}
                    onClick={() => setAuthMode("login")}
                  >
                    Masuk
                  </button>
                  <button
                    type="button"
                    className={authMode === "register" ? "active" : ""}
                    onClick={() => setAuthMode("register")}
                  >
                    Daftar
                  </button>
                </div>
                {DEMO && (
                  <div className="notice">
                    Mode demo: gunakan email dummy dan kata sandi apa pun (min.
                    8 karakter). Jangan gunakan kata sandi pribadi.
                  </div>
                )}
                {authMode === "register" && (
                  <label>
                    Nama lengkap
                    <input name="name" required minLength={2} />
                  </label>
                )}
                <label>
                  Email
                  <input
                    name="email"
                    type="email"
                    required
                    placeholder="nama@contoh.test"
                  />
                </label>
                <label>
                  Kata sandi
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete={
                      authMode === "login" ? "current-password" : "new-password"
                    }
                  />
                </label>
                <button disabled={busy} className="btn black full">
                  {busy
                    ? "Memproses…"
                    : authMode === "login"
                      ? "Masuk ke akun"
                      : "Buat akun"}
                  <ArrowRight size={17} />
                </button>
              </form>
            </div>
          ) : (
            <>
              <div className="catalog-title">
                <div>
                  <span className="eyebrow">AKUN SAYA</span>
                  <h1>Halo, {user.name}.</h1>
                  <p>{user.email}</p>
                </div>
                <button
                  className="text-link"
                  onClick={async () => {
                    if (!DEMO) await api("/auth/logout", { method: "POST" });
                    setUser(null);
                    if (!DEMO) setOrders([]);
                    notify("Anda telah keluar");
                  }}
                >
                  Keluar
                </button>
              </div>
              <div className="account-links">
                <button
                  onClick={() => {
                    setCategory("Semua");
                    setSearch("");
                    nav("wishlist");
                  }}
                >
                  <Heart /> Wishlist <span>{wish.length} produk</span>
                  <ChevronRight />
                </button>
                <button onClick={() => setDrawer(true)}>
                  <ShoppingBag /> Keranjang <span>{count} item</span>
                  <ChevronRight />
                </button>
                {user.role === "admin" && (
                  <button onClick={() => nav("admin")}>
                    Panel admin <ArrowRight />
                  </button>
                )}
              </div>
              <h2>Riwayat pesanan</h2>
              {orders.length ? (
                orders.map((o) => (
                  <div className="order-card" key={o.id}>
                    <div>
                      <b>{o.id}</b>
                      <span>
                        {new Date(o.createdAt).toLocaleDateString("id-ID", {
                          dateStyle: "long",
                        })}
                      </span>
                      <strong className="order-status">{o.status}</strong>
                    </div>
                    <div className="order-products">
                      {o.items.map((i, j) => (
                        <div key={j}>
                          <img src={i.image} alt={i.name} />
                          <span>
                            {i.name}
                            <small>
                              {i.size} · {i.quantity} item
                            </small>
                          </span>
                        </div>
                      ))}
                    </div>
                    <footer>
                      <span>Total pesanan</span>
                      <b>{money(o.total)}</b>
                    </footer>
                    {o.status === "Menunggu pembayaran" && (
                      <button
                        className="text-link"
                        onClick={async () => {
                          try {
                            if (!DEMO)
                              await api(`/orders/${o.id}/cancel`, {
                                method: "POST",
                              });
                            setOrders((os) =>
                              os.map((x) =>
                                x.id === o.id
                                  ? { ...x, status: "Dibatalkan" }
                                  : x,
                              ),
                            );
                            notify("Pesanan dibatalkan");
                          } catch (e) {
                            notify(e.message);
                          }
                        }}
                      >
                        Batalkan pesanan
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <div className="empty">
                  <Package size={40} />
                  <h3>Belum ada pesanan.</h3>
                  <p>Temukan favorit pertama Anda hari ini.</p>
                  <button className="btn black" onClick={() => shop()}>
                    Mulai belanja <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      )}
      {view === "admin" && (
        <Admin
          user={user}
          products={products}
          notify={notify}
          onProducts={setProducts}
        />
      )}
      <section className="newsletter">
        <div>
          <span className="eyebrow">STAY IN THE KNOW</span>
          <h2>Sedikit inspirasi, langsung ke inbox Anda.</h2>
          <p>Koleksi baru, cerita menarik, dan penawaran pilihan.</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            notify("Terima kasih! Pendaftaran newsletter demo berhasil.");
            e.currentTarget.reset();
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
          <span className="demo-label">DEMO STORE</span>
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
                    onClick={() => setSize(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <label>
                Jumlah <span>{detail.stock} tersedia</span>
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
                  onClick={() =>
                    setQuantity(Math.min(detail.stock, quantity + 1))
                  }
                >
                  <Plus size={15} />
                </button>
              </div>
              <button className="btn black full" onClick={add}>
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
                  <small>Penukaran mudah hingga 30 hari · Simulasi</small>
                </span>
              </div>
              <details>
                <summary>Material & perawatan</summary>
                <p>
                  Material dummy: 70% katun, 30% linen. Cuci dengan air dingin
                  dan warna serupa. Hindari pemutih.
                </p>
              </details>
            </div>
          </section>
        </div>
      )}
      {drawer && (
        <div
          className="overlay drawer-overlay"
          onClick={() => setDrawer(false)}
        >
          <section
            className="cart-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Keranjang Anda"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-title">
              <h2>
                Keranjang Anda <span>({count})</span>
              </h2>
              <button
                aria-label="Tutup keranjang"
                onClick={() => setDrawer(false)}
              >
                <X />
              </button>
            </div>
            {!cart.length ? (
              <div className="empty">
                <ShoppingBag size={44} />
                <h2>Masih ada ruang untuk favorit.</h2>
                <p>Temukan esensial yang cocok untuk Anda.</p>
                <button className="btn black" onClick={() => shop()}>
                  Jelajahi koleksi <ArrowRight size={17} />
                </button>
              </div>
            ) : (
              <>
                <div className="free-shipping">
                  <Truck size={16} />
                  {total.subtotal >= 699000
                    ? "Anda mendapatkan gratis ongkir!"
                    : `Tambah ${money(699000 - total.subtotal)} untuk gratis ongkir.`}
                  <div>
                    <span
                      style={{
                        width: Math.min(100, total.subtotal / 6990) + "%",
                      }}
                    />
                  </div>
                </div>
                <div className="cart-items">
                  {cart.map((i) => (
                    <div className="cart-item" key={i.key}>
                      <img src={i.image} alt={i.name} />
                      <div>
                        <span className="eyebrow">{i.gender}</span>
                        <b>{i.name}</b>
                        <small>
                          Ukuran: {i.size} · Warna{" "}
                          <i
                            className="color-dot"
                            style={{ background: i.color }}
                          />
                        </small>
                        <strong>{money(i.price)}</strong>
                        <div className="cart-item-actions">
                          <div className="qty">
                            <button
                              aria-label={`Kurangi ${i.name}`}
                              onClick={() => updateQty(i.key, -1)}
                            >
                              <Minus size={13} />
                            </button>
                            <span>{i.quantity}</span>
                            <button
                              aria-label={`Tambah ${i.name}`}
                              onClick={() => updateQty(i.key, 1)}
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                          <button
                            className="remove"
                            onClick={() =>
                              setCart((c) => c.filter((x) => x.key !== i.key))
                            }
                          >
                            Hapus
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="cart-footer">
                  <form
                    className="coupon"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const c = couponInput.trim().toUpperCase();
                      if (c === "LINY10") {
                        setCoupon(c);
                        notify("Voucher LINY10 berhasil digunakan");
                      } else notify("Kode voucher tidak valid. Coba LINY10.");
                    }}
                  >
                    <input
                      aria-label="Kode voucher"
                      placeholder="Masukkan kode voucher"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                    />
                    <button>Gunakan</button>
                  </form>
                  {coupon && (
                    <button
                      className="coupon-applied"
                      onClick={() => {
                        setCoupon("");
                        setCouponInput("");
                      }}
                    >
                      LINY10 diterapkan <X size={13} />
                    </button>
                  )}
                  <Summary total={total} />
                  <button
                    className="btn black full"
                    onClick={() => {
                      if (!DEMO && !user) {
                        notify("Silakan masuk sebelum checkout.");
                        nav("account");
                      } else nav("checkout");
                    }}
                  >
                    Lanjut ke checkout <ArrowRight size={18} />
                  </button>
                  <button
                    className="text-link centered"
                    onClick={() => setDrawer(false)}
                  >
                    Lanjutkan belanja
                  </button>
                </div>
              </>
            )}
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
                <p>
                  {info.includes("engiriman")
                    ? "Pengiriman reguler 2–4 hari kerja (Rp15.000), ekspres 1–2 hari kerja (Rp35.000), atau ambil di toko gratis. Gratis ongkir belanja minimal Rp699.000."
                    : info.includes("enukaran")
                      ? "Simulasi kebijakan: produk dapat ditukar dalam 30 hari dengan label asli dan bukti pembelian. Hubungi tim kami untuk bantuan."
                      : info.includes("privasi")
                        ? "Pratinjau demo menyimpan keranjang, wishlist, profil dummy, dan pesanan di browser Anda. Mode API menggunakan sesi server dan PostgreSQL. Gunakan data dummy saat mencoba."
                        : info.includes("toko") || info.includes("Toko")
                          ? "Toko dummy: Liny Jaya Central, Jl. Contoh Raya No. 10, Jakarta. Senin–Minggu, 10.00–21.00 WIB. Layanan pickup tersedia untuk simulasi."
                          : "Liny Jaya menghadirkan pakaian esensial dengan desain sederhana dan kenyamanan untuk setiap hari. Semua produk, ulasan, alamat toko, dan transaksi di situs ini merupakan konten dummy."}
                </p>
                <p className="muted">
                  Kontak dummy: halo@linyjaya.test · 021-0000-0000
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
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
      <span className="mode-indicator">
        {DEMO ? "DEMO · Data tersimpan di browser" : "POSTGRESQL · API aktif"}
      </span>
    </>
  );
}
function Summary({ total }) {
  return (
    <div className="summary-lines">
      <div>
        <span>Subtotal</span>
        <b>{money(total.subtotal)}</b>
      </div>
      {total.discount > 0 && (
        <div className="red-text">
          <span>Diskon LINY10</span>
          <b>−{money(total.discount)}</b>
        </div>
      )}
      <div>
        <span>Estimasi pengiriman</span>
        <b>{total.delivery === 0 ? "Gratis" : money(total.delivery)}</b>
      </div>
      <div className="grand-total">
        <span>Total</span>
        <b>{money(total.total)}</b>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
