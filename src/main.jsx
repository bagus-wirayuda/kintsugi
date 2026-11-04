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
  Compass,
} from "lucide-react";
import { categories, colorLabel, money, parseRupiah } from "./data";
import RupiahInput from "./RupiahInput.jsx";
import { categoryLabel, catalogCategories, mainCategories, getMainCategories, getSubcategories, mainCategoryLabel } from "./catalog";
import { storage, api } from "./store";
import "./styles.css";
const Admin = lazy(() => import("./Admin.jsx"));
const Auth = lazy(() => import("./Auth.jsx"));
const Account = lazy(() => import("./Account.jsx"));
const Checkout = lazy(() => import("./Checkout.jsx"));
import Home from "./Home.jsx";
import { CartPage, WishlistPage, PaymentPage } from "./ShoppingPages.jsx";
import "./workspace.css";
import { policy } from "./policies.js";
import { dimensionLabel, parseDimensions } from "./dimensions.js";
import SizeSummary from "./SizeSummary.jsx";
import VariantSummary from "./VariantSummary.jsx";
import { StoreHeader, StoreFooter } from "./StoreChrome.jsx";
import {
  mergeGuestCart,
  moveGuestCheckout,
  subtractPurchased,
} from "./checkout-state.js";
import "./kintsugi.css";

const routes = [
  "home",
  "catalog",
  "wishlist",
  "account",
  "checkout",
  "admin",
  "cart",
];
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="workspace" style={{ padding: "40px 20px", textAlign: "center" }}>
          <div className="ws-empty" style={{ maxWidth: "480px", margin: "auto" }}>
            <h2 style={{ fontSize: "20px", marginBottom: "8px" }}>Terjadi kendala pada tampilan</h2>
            <p style={{ color: "#667085", fontSize: "14px", marginBottom: "20px" }}>
              {this.state.error?.message || "Halaman tidak dapat dimuat dengan sempurna."}
            </p>
            <button
              className="ws-button primary"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
            >
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const initialView = () =>
  routes.includes(location.hash.slice(1).split("/")[0])
    ? location.hash.slice(1).split("/")[0]
    : "home";
function App() {
  const [products, setProducts] = useState([]),
    [activeCategory, setActiveCategory] = useState("Semua"),
    [view, setView] = useState(initialView),
    [menu, setMenu] = useState(false),
    [search, setSearch] = useState(""),
    [searchOpen, setSearchOpen] = useState(false),
    [subcategory, setSubcategory] = useState("Semua"),
    [sort, setSort] = useState("recommended"),
    [detail, setDetail] = useState(null),
    [size, setSize] = useState(""),
    [color, setColor] = useState(""),
    [quantity, setQuantity] = useState(1),
    [cart, setCart] = useState([]),
    [directPurchase, setDirectPurchase] = useState(null),
    [purchaseIntent, setPurchaseIntent] = useState('cart'),
    [wish, setWish] = useState([]),
    [user, setUser] = useState(null),
    [toast, setToast] = useState(""),
    [coupon, setCoupon] = useState(""),
    [placed, setPlaced] = useState(null),
    [info, setInfo] = useState(null),
    [cookie, setCookie] = useState(() => !storage.read("cookie", false));

  // Alias for backward compatibility
  const category = subcategory;
  const setCategory = setSubcategory;
  const [authReady, setAuthReady] = useState(false),
    [cartOwner, setCartOwner] = useState(null),
    [config, setConfig] = useState({
      contact: "wirayuda101101@gmail.com",
      sandbox: true,
      categories: catalogCategories,
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
    [productLoading, setProductLoading] = useState(false),
    [crossCategoryMatches, setCrossCategoryMatches] = useState([]),
    [crossCategoryLoading, setCrossCategoryLoading] = useState(false);
  const toastTimer = useRef();
  function notify(t) {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  }
  useEffect(() => {
    if (!authReady) return;
    const owner = user?.id || "guest";
    const savedCart = storage.read("cart:" + owner, []);
    const restoreDimensions = (row) => {
      const d = parseDimensions(row?.size);
      return d ? { ...row, size: `${d.length}×${d.width}×${d.height}` } : row;
    };
    setCart(savedCart.map(restoreDimensions));
    const savedDirect = storage.read('direct:' + owner, null);
    setDirectPurchase(savedDirect ? restoreDimensions(savedDirect) : null);
    setWish(storage.read("wish:" + owner, []));
    setCartOwner(owner);
    setCoupon(storage.read("coupon:" + owner, ""));
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
    if (authReady && cartOwner === (user?.id || "guest"))
      storage.write("coupon:" + cartOwner, coupon);
  }, [coupon, cartOwner, user?.id, authReady]);
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
    const change = () => {
      const hash = location.hash.replace(/^#/, "");
      const top = hash.split("/")[0];
      if (user?.role === "customer" && (top === "cart" || top === "wishlist")) {
        history.replaceState(null, "", "#account/" + top);
        setView("account");
        return;
      }
      setView(initialView());
    };
    window.addEventListener("hashchange", change);
    window.addEventListener("popstate", change);
    return () => {
      window.removeEventListener("hashchange", change);
      window.removeEventListener("popstate", change);
    };
  }, [user?.role]);
  useEffect(() => {
    if (!authReady) return;
    if (user?.role === "customer") {
      const hash = location.hash.replace(/^#/, "");
      if (hash === "cart" || hash === "wishlist") {
        history.replaceState(null, "", "#account/" + hash);
        setView("account");
      }
    }
  }, [authReady, user?.role]);
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
  const nav = (v, keepDirect = false) => {
    let target = v;
    if (user?.role === "customer") {
      if (v === "cart" || v === "#cart") target = "account/cart";
      else if (v === "wishlist" || v === "#wishlist") target = "account/wishlist";
    }
    if (target === 'checkout' && !keepDirect) {
      setDirectPurchase(null);
      storage.write('direct:' + (user?.id || 'guest'), null);
    }
    const targetHash = "#" + (target === "success" ? "account" : target);
    if (target === "success") {
      history.replaceState(null, "", targetHash);
    } else if (location.hash !== targetHash) {
      history.pushState(null, "", targetHash);
    }
    setView(target.split("/")[0]);
    if (target !== 'success') window.dispatchEvent(new HashChangeEvent('hashchange'));
    setMenu(false);
    setSearchOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const shop = (cat = "Semua", g = "Semua") => {
    // Both orderings supported: shop(mainCategory, subcategory) or shop(subcategory, mainCategory)
    const isMainCat = (val) => mainCategories.some((m) => m.id === val) || ["seprai", "fashion", "home-living"].includes(val);
    if (isMainCat(cat) && !isMainCat(g)) {
      setActiveCategory(cat);
      setSubcategory(g);
    } else if (isMainCat(g)) {
      setActiveCategory(g);
      setSubcategory(cat);
    } else {
      setActiveCategory(g);
      setSubcategory(cat);
    }
    setSearch("");
    nav("catalog");
  };
  const openProduct = async (p, intent = 'cart') => {
    setPurchaseIntent(intent);
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
    activeCategory,
    subcategory,
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
        category: view === "wishlist" ? "Semua" : activeCategory,
        subcategory: view === "wishlist" ? "Semua" : subcategory,
        search,
        sort,
        page: String(page),
        pageSize: "8",
      });
      if (view === "wishlist") params.set("ids", wish.join(","));
      if (filterSize) params.set("size", filterSize);
      if (filterColor) params.set("color", filterColor);
      if (minPrice) params.set("min", parseRupiah(minPrice));
      if (maxPrice) params.set("max", parseRupiah(maxPrice));
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
    activeCategory,
    subcategory,
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
  useEffect(() => {
    if (
      view !== "catalog" ||
      catalogLoading ||
      catalogError ||
      catalog.items.length > 0 ||
      !search.trim() ||
      (activeCategory === "Semua" && subcategory === "Semua")
    ) {
      setCrossCategoryMatches([]);
      setCrossCategoryLoading(false);
      return;
    }

    const controller = new AbortController();
    setCrossCategoryLoading(true);
    api(
      `/products/cross-categories?search=${encodeURIComponent(search.trim())}&currentCategory=${encodeURIComponent(activeCategory)}&subcategory=${encodeURIComponent(subcategory)}`,
      { signal: controller.signal }
    )
      .then((res) => {
        if (!controller.signal.aborted) {
          setCrossCategoryMatches(res.matches || []);
        }
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setCrossCategoryMatches([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCrossCategoryLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    view,
    catalogLoading,
    catalogError,
    catalog.items.length,
    search,
    activeCategory,
    subcategory,
  ]);
  const toggleWish = (id) => {
    if (user && user.role !== "customer")
      return notify("Favorit hanya tersedia untuk akun pelanggan.");
    setWish((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));
  };
  const add = (event, buyNow = false) => {
    if (user && user.role !== "customer")
      return notify("Akun admin tidak dapat berbelanja.");
    if (!authReady) return notify("Sedang memuat akun. Coba sesaat lagi.");
    if (!size) {
      notify("Pilih ukuran terlebih dahulu.");
      return;
    }
    const key = `${detail.id}:${size}:${color}`;
    if (buyNow) {
      if (quantity > Math.min(99, selectedStock)) return notify('Jumlah melebihi stok tersedia.');
      const item = { ...detail, stock: selectedStock, key, size, color, quantity };
      setDirectPurchase(item);
      storage.write('direct:' + (user?.id || 'guest'), item);
      setDetail(null);
      nav('checkout', true);
      return;
    }
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
    flyToCart(detail.image, event.currentTarget);
    setDetail(null);
    notify("Produk ditambahkan ke keranjang");
  };
  const count = cart.reduce((n, i) => n + i.quantity, 0);
  function flyToCart(image, button) {
    const target = [...document.querySelectorAll('[data-cart-target]')].find((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    const source = document.querySelector('.product-dialog img') || button;
    if (!target || !source) return;
    const finish = () => target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.24)' }, { transform: 'scale(1)' }], { duration: 350 });
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
    const imageRect = source.getBoundingClientRect();
    const from = imageRect.top + imageRect.height / 2 > 0 && imageRect.top + imageRect.height / 2 < innerHeight ? imageRect : button.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const ghost = document.createElement('img');
    ghost.src = image; ghost.alt = ''; ghost.className = 'ks-flying-product';
    Object.assign(ghost.style, { left: `${from.left + from.width / 2 - 45}px`, top: `${from.top + from.height / 2 - 45}px` });
    document.body.append(ghost);
    const dx = to.left + to.width / 2 - from.left - from.width / 2, dy = to.top + to.height / 2 - from.top - from.height / 2;
    const flight = ghost.animate([{ transform: 'translate(0, 0) scale(1)', opacity: 1 }, { transform: `translate(${dx * .55}px, ${Math.min(dy * .45, -100)}px) scale(.7)`, opacity: .95, offset: .5 }, { transform: `translate(${dx}px, ${dy}px) scale(.12)`, opacity: .3 }], { duration: 750, easing: 'cubic-bezier(.3,.05,.45,1)', fill: 'forwards' });
    flight.onfinish = () => { ghost.remove(); finish(); };
    flight.oncancel = () => ghost.remove();
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
              ? "Penawaran terbatas"
              : p.isNew
                ? "Koleksi baru"
                : "Pilihan Kintsugi"}
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
        <VariantSummary
          colors={p.colors}
          variationLabel={p.variationLabel || "Warna"}
        />
        <div className="product-meta">
          {categoryLabel(p.category, config.categories).toUpperCase()}
        </div>
        <SizeSummary sizes={p.sizes} />
        <button className="product-name" onClick={() => openProduct(p)}>
          {p.name}
        </button>
        <div className={"price " + (p.oldPrice ? "sale" : "")}>
          {money(p.price)} {p.oldPrice > 0 && <del>{money(p.oldPrice)}</del>}
        </div>
        <div className="ks-product-actions">
          <button aria-label={'Tambah ke keranjang ' + p.name} onClick={() => openProduct(p, 'cart')}><ShoppingBag size={15}/><span>Keranjang</span></button>
          <button onClick={() => openProduct(p, 'buy')} aria-label={'Beli langsung ' + p.name}>Beli langsung</button>
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
  async function authenticated(u, checkout = false) {
    if (u.role === "customer" && cartOwner === "guest" && cart.length) {
      const saved = storage.read("cart:" + u.id, []),
        merged = mergeGuestCart(saved, cart);
      storage.write("cart:" + u.id, merged);
      storage.write("cart:guest", []);
    }
    if (u.role === "customer" && cartOwner === "guest") {
      if (directPurchase) storage.write('direct:' + u.id, directPurchase);
      moveGuestCheckout(storage, u.id);
      storage.write("coupon:" + u.id, coupon);
      storage.write("coupon:guest", "");
    }
    if (u.role === "customer" && cartOwner === "guest" && wish.length) {
      storage.write("wish:" + u.id, [
        ...new Set([...storage.read("wish:" + u.id, []), ...wish]),
      ]);
      storage.write("wish:guest", []);
    }
    setUser(u);
    if (!checkout) nav(u.role === "customer" ? "catalog" : "admin/overview");
  }

  const productDialog = detail ? (
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
            {categoryLabel(detail.category, config.categories)}
          </span>
          <h1>{detail.name}</h1>
          <div className="rating">
            <Star size={14} fill="currentColor" />
            Pilihan tekstil Kintsugi
          </div>
          <div className="detail-price">
            {money(detail.price)}
            {detail.oldPrice > 0 && <del>{money(detail.oldPrice)}</del>}
          </div>
          <p>{detail.description}</p>
          <label>
            {detail.variationLabel || "Variasi"}{" "}
            <span>
              {colorLabel(color)} · {detail.colors.indexOf(color) + 1} / {detail.colors.length}
            </span>
          </label>
          <div className="color-choices">
            {detail.colors.map((c) => (
              (() => {
                const variant = detail.variants?.find((item) => item.color === c && item.image_url);
                const isHex = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-label={`${detail.variationLabel || "Variasi"} ${colorLabel(c)}`}
                    title={colorLabel(c)}
                    className={"ks-variant-choice " + (color === c ? "selected" : "") + (isHex ? " is-hex" : " is-text")}
                    style={isHex ? { background: c } : undefined}
                    onClick={() => {
                      setColor(c);
                      if (variant?.image_url) setDetail((current) => ({ ...current, image: variant.image_url }));
                    }}
                  >
                    {variant?.image_url && <img src={variant.image_url} alt="" className="ks-variant-thumb" />}
                    {!isHex && <span className="ks-variant-text">{c}</span>}
                  </button>
                );
              })()
            ))}
          </div>
          <label className="product-size-label">
            <span>Ukuran</span>
            <button
              className="text-link"
              onClick={() => setInfo("Panduan ukuran")}
            >
              Panduan ukuran
            </button>
          </label>
          <p className="product-size-hint">{detail.sizes.some((value)=>parseDimensions(value))?"Pilih satu ukuran lengkap: panjang × lebar × tinggi.":"Pilih ukuran atau opsi produk yang tersedia."}</p>
          <div className={"size-choices " + (detail.sizes.some((value) => parseDimensions(value)) ? "has-dimensions" : "regular-sizes")}>
            {detail.sizes.map((s) => {
              const dimensions = parseDimensions(s);
              return (
                <button
                  className={(size === s ? "selected " : "") + (dimensions ? "dimension-btn" : "text-size-btn")}
                  key={s}
                  type="button"
                  aria-label={`Ukuran ${dimensionLabel(s)}`}
                  disabled={Boolean(detail.variants) && !detail.variants.some((v) => v.size === s && v.color === color && v.stock > 0)}
                  onClick={() => setSize(s)}
                >
                  {dimensions ? (
                    <span className="size-dimension-values">
                      <span><small>Panjang</small><b>{dimensions.length}</b></span>
                      <i>×</i>
                      <span><small>Lebar</small><b>{dimensions.width}</b></span>
                      <i>×</i>
                      <span><small>Tinggi</small><b>{dimensions.height}</b></span>
                      <small className="size-unit">cm</small>
                    </span>
                  ) : (
                    <span className="size-regular-value">{s}</span>
                  )}
                </button>
              );
            })}
          </div>
          {size && <p className="selected-size-summary">Dipilih: <strong>{dimensionLabel(size)}</strong></p>}
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
            onClick={(e) => add(e, purchaseIntent === 'buy')}
          >
            {purchaseIntent === 'buy' ? 'Beli langsung' : 'Tambahkan ke keranjang'} <ShoppingBag size={18} />
          </button>
          <button className="btn outline full" disabled={!size || selectedStock < 1 || !authReady} onClick={(e) => add(e, purchaseIntent !== 'buy')}>
            {purchaseIntent === 'buy' ? 'Tambahkan ke keranjang' : 'Beli langsung'}
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
  ) : null;

  const feedback = (
    <>
      {toast && (
        <div className="ws-toast" role="status">
          {toast}
        </div>
      )}
      {productDialog}
      {productLoading && (
        <div className="toast" role="status">
          Memuat detail produk…
        </div>
      )}
    </>
  );

  if (!authReady)
    return (
      <div className="workspace">
        <div className="ws-loading" role="status">
          Menyiapkan Kintsugi…
        </div>
      </div>
    );
  if (["admin", "manager", "staff"].includes(user?.role) && view === "admin")
    return (
      <ErrorBoundary>
        <Admin
          user={user}
          notify={notify}
          onLogout={logout}
          config={config}
          reloadConfig={() => api("/config").then((data) => setConfig({ ...data, loaded: true }))}
        />
        {feedback}
      </ErrorBoundary>
    );
  if (!user && ["account", "admin", "success"].includes(view))
    return (
      <>
        <Auth
          key={view === "admin" ? "admin" : "customer"}
          admin={view === "admin"}
          onAuthenticated={authenticated}
          config={config}
          pendingCart={cart.length > 0}
          nav={nav}
          shop={shop}
          activeCategory={activeCategory}
          cartCount={count}
          wishCount={wish.length}
          onSearch={() => { nav('catalog'); setSearchOpen(true); }}
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
  const accountProps = {
    user,
    config,
    onLogout: logout,
    nav,
    shop,
    activeCategory,
    cartCount: count,
    wishCount: wish.length,
    onSearch: () => {
      nav("catalog");
      setSearchOpen(true);
    },
  };
  const customerAccountProps = {
    ...accountProps,
    cart,
    setCart,
    coupon,
    setCoupon,
    wish,
    setWish,
    openProduct,
    onUser: setUser,
    notify,
    wishCount: wish.length,
    cartCount: count,
    config,
  };
  if (view === "account")
    return (
      <>
        <Account
          {...customerAccountProps}
        />
        {feedback}
      </>
    );
  if (view === "cart") {
    if (user?.role === "customer") {
      return (
        <>
          <Account
            {...customerAccountProps}
            initialTab="cart"
          />
          {feedback}
        </>
      );
    }
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
  }
  if (view === "wishlist") {
    if (user?.role === "customer") {
      return (
        <>
          <Account
            {...customerAccountProps}
            initialTab="wishlist"
          />
          {feedback}
        </>
      );
    }
    return (
      <>
        <WishlistPage
          {...accountProps}
          wish={wish}
          setWish={setWish}
          openProduct={(p, intent) => {
            nav("catalog");
            openProduct(p, intent);
          }}
        />
        {feedback}
      </>
    );
  }
  if (view === "checkout")
    return (
      <>
        <Checkout
          {...accountProps}
          user={user}
          cart={directPurchase ? [directPurchase] : cart}
          key={directPurchase?.key || 'cart-checkout'}
          coupon={coupon}
          config={config}
          nav={nav}
          onAuthenticated={(u) => authenticated(u, true)}
          onPlaced={(order, buyer, items) => {
            const remaining = directPurchase ? storage.read('cart:' + buyer.id, []) : subtractPurchased(
              storage.read("cart:" + buyer.id, []),
              items,
            );
            storage.write("cart:" + buyer.id, remaining);
            storage.write("coupon:" + buyer.id, "");
            setPlaced(order);
            setDirectPurchase(null);
            storage.write('direct:' + buyer.id, null);
            storage.write('direct:guest', null);
            setCart(remaining);
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
  const allCategories = config?.categories?.length ? config.categories : catalogCategories;
  const mainCats = getMainCategories(allCategories);
  const currentMainCat = mainCats.find((m) => m.id === activeCategory);
  const subcategoriesList = getSubcategories(allCategories, activeCategory === "Semua" ? null : activeCategory);

  return (
    <div
      className={view === "home" ? "modern-storefront" : "catalog-storefront"}
    >
      {["admin", "manager", "staff"].includes(user?.role) && (
        <div className="ks-admin-preview-bar">
          <div className="ks-admin-preview-content">
            <ShieldCheck size={16} />
            <span>Mode Pratinjau Toko &mdash; Anda login sebagai <strong>{user.name}</strong> ({user.role})</span>
          </div>
          <button className="ks-admin-preview-btn" onClick={() => nav("admin/overview")}>
            Kembali ke Panel Admin &rarr;
          </button>
        </div>
      )}
      <StoreHeader
        config={config}
        nav={nav}
        shop={shop}
        activeCategory={activeCategory}
        activeSubcategory={subcategory}
        count={count}
        wishCount={wish.length}
        user={user}
        onLogout={logout}
        onSearch={() => setSearchOpen(true)}
      />
      {view === "home" && (
        <Home
          shop={shop}
          products={products}
          openProduct={openProduct}
          config={config}
          onAddToCart={(item, buttonEl) => {
            if (user && user.role !== "customer") return notify("Akun admin tidak dapat berbelanja.");
            if (!authReady) return notify("Sedang memuat akun. Coba sesaat lagi.");
            const old = cart.find((i) => i.key === item.key);
            if ((old?.quantity || 0) + item.quantity > Math.min(99, item.stock)) {
              return notify("Jumlah melebihi stok tersedia.");
            }
            setCart((c) =>
              old
                ? c.map((i) =>
                    i.key === item.key ? { ...i, quantity: i.quantity + item.quantity } : i,
                  )
                : [...c, item],
            );
            if (buttonEl) flyToCart(item.image, buttonEl);
            notify("Produk promo berhasil ditambahkan ke keranjang");
          }}
          onBuyDirect={(item) => {
            if (user && user.role !== "customer") return notify("Akun admin tidak dapat berbelanja.");
            if (!authReady) return notify("Sedang memuat akun. Coba sesaat lagi.");
            if (item.quantity > Math.min(99, item.stock)) return notify("Jumlah melebihi stok tersedia.");
            setDirectPurchase(item);
            storage.write("direct:" + (user?.id || "guest"), item);
            nav("checkout", true);
          }}
        />
      )}
      {(view === "catalog" || view === "wishlist") && (
        <main className="catalog page">
          <div className="breadcrumb">
            <button onClick={() => nav("home")}>Beranda</button>
            <ChevronRight size={12} />
            {view === "wishlist" ? (
              <span>Wishlist Anda</span>
            ) : (
              <>
                <button onClick={() => { setActiveCategory("Semua"); setSubcategory("Semua"); }}>
                  Katalog
                </button>
                {activeCategory !== "Semua" && (
                  <>
                    <ChevronRight size={12} />
                    <button onClick={() => setSubcategory("Semua")}>
                      {mainCategoryLabel(activeCategory, allCategories)}
                    </button>
                  </>
                )}
                {subcategory !== "Semua" && (
                  <>
                    <ChevronRight size={12} />
                    <span>{categoryLabel(subcategory, allCategories)}</span>
                  </>
                )}
              </>
            )}
          </div>
          <div className="catalog-title">
            <div>
              <span className="eyebrow">
                {activeCategory === "fashion"
                  ? "KINTSUGI APPAREL & FASHION"
                  : activeCategory === "home-living"
                    ? "KINTSUGI LIVING ESSENTIALS"
                    : "KINTSUGI BEDROOM COLLECTION"}
              </span>
              <h1>
                {view === "wishlist"
                  ? "Wishlist Anda"
                  : search
                    ? `Hasil pencarian “${search}”`
                    : subcategory !== "Semua"
                      ? categoryLabel(subcategory, allCategories)
                      : activeCategory !== "Semua"
                        ? mainCategoryLabel(activeCategory, allCategories)
                        : "Semua Koleksi Produk"}
              </h1>
              <p>
                {view === "wishlist"
                  ? "Simpan hari ini. Temukan lagi saat Anda siap."
                  : activeCategory === "fashion"
                    ? "Busana kasual pria & wanita, kemeja linen, celana chino, dress floral, dan outerwear berkualitas."
                    : activeCategory === "home-living"
                      ? "Selimut fleece lembut, bantal silikon hotel, dan handuk katun bambu untuk kenyamanan rumah Anda."
                      : "Sprei fitted, set sprei spring bed, dan pelindung kasur dengan bahan katun sejuk dan rapi."}
              </p>
            </div>
            <span>{catalog.total} produk</span>
          </div>
          <div className="catalog-layout">
            <aside>
              {/* Desktop Category Navigation */}
              <div className="catalog-desktop-only">
                <h3>Kategori</h3>
                <div className="catalog-category-filter">
                  {activeCategory !== "Semua" ? (
                    subcategoriesList.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={subcategory === s.id ? "active is-active" : ""}
                        onClick={() => setSubcategory(s.id)}
                      >
                        <span>{s.label || s.name}</span>
                        <ChevronRight size={13} />
                      </button>
                    ))
                  ) : (
                    mainCats.map((m) => {
                      const subs = getSubcategories(allCategories, m.id);
                      return (
                        <div key={m.id} className="catalog-cat-subgroup">
                          <div className="catalog-cat-group-title">
                            <strong>{m.label || m.name}</strong>
                          </div>
                          {subs.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              className={"catalog-sub-btn " + (subcategory === s.id ? "active is-active" : "")}
                              onClick={() => {
                                setActiveCategory(m.id);
                                setSubcategory(s.id);
                              }}
                            >
                              <span>{s.label || s.name}</span>
                              <ChevronRight size={12} />
                            </button>
                          ))}
                        </div>
                      );
                    })
                  )}
                </div>
                <hr />
              </div>

              {/* Mobile Category Dropdown (closed by default, matching advanced-filters style) */}
              <details className="advanced-filters catalog-mobile-only catalog-category-details">
                <summary>
                  Kategori
                  {subcategory && subcategory !== "Semua" ? (
                    <span className="catalog-summary-selection">
                      : {categoryLabel(subcategory, allCategories)}
                    </span>
                  ) : activeCategory && activeCategory !== "Semua" ? (
                    <span className="catalog-summary-selection">
                      : {mainCategoryLabel(activeCategory, allCategories)}
                    </span>
                  ) : null}
                </summary>
                <div className="filter-fields catalog-mobile-cat-options">
                  {activeCategory !== "Semua" ? (
                    subcategoriesList.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={"catalog-cat-pill " + (subcategory === s.id ? "active is-active" : "")}
                        onClick={(e) => {
                          setSubcategory(s.id);
                          e.currentTarget.closest("details")?.removeAttribute("open");
                        }}
                      >
                        <span>{s.label || s.name}</span>
                        <ChevronRight size={13} />
                      </button>
                    ))
                  ) : (
                    mainCats.map((m) => {
                      const subs = getSubcategories(allCategories, m.id);
                      return (
                        <div key={m.id} className="catalog-cat-subgroup">
                          <div className="catalog-cat-group-title">
                            <strong>{m.label || m.name}</strong>
                          </div>
                          {subs.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              className={"catalog-sub-btn catalog-cat-pill " + (subcategory === s.id ? "active is-active" : "")}
                              onClick={(e) => {
                                setActiveCategory(m.id);
                                setSubcategory(s.id);
                                e.currentTarget.closest("details")?.removeAttribute("open");
                              }}
                            >
                              <span>{s.label || s.name}</span>
                              <ChevronRight size={12} />
                            </button>
                          ))}
                        </div>
                      );
                    })
                  )}
                </div>
              </details>

              <details className="advanced-filters">
                <summary>Ukuran, variasi & harga</summary>
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
                        <option key={s} value={s}>
                          {s.includes("×") || s.includes("x") ? dimensionLabel(s) : s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Variasi
                    <select
                      aria-label="Filter variasi"
                      value={filterColor}
                      onChange={(e) => setFilterColor(e.target.value)}
                    >
                      <option value="">Semua variasi</option>
                      {catalog.facets.colors.map((c) => (
                        <option key={c} value={c}>
                          {colorLabel(c)}
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
                    <RupiahInput
                      aria-label="Harga minimum"
                      placeholder="0"
                      value={minPrice}
                      onValueChange={(val, str) => setMinPrice(str)}
                    />
                  </label>
                  <label>
                    Harga maksimum
                    <RupiahInput
                      aria-label="Harga maksimum"
                      placeholder="10.000.000"
                      value={maxPrice}
                      onValueChange={(val, str) => setMaxPrice(str)}
                    />
                  </label>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => {
                      setFilterSize("");
                      setFilterColor("");
                      setMinPrice("");
                      setMaxPrice("");
                      setSubcategory("Semua");
                      setActiveCategory("Semua");
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
                  <SlidersHorizontal size={16} />{" "}
                  {subcategory !== "Semua"
                    ? categoryLabel(subcategory, allCategories)
                    : activeCategory !== "Semua"
                      ? mainCategoryLabel(activeCategory, allCategories)
                      : "Semua Koleksi"}
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
                  activeCategory !== "Semua" && "Kategori: " + mainCategoryLabel(activeCategory, allCategories),
                  subcategory !== "Semua" && "Kategori: " + categoryLabel(subcategory, allCategories),
                  filterSize && "Ukuran: " + (filterSize.includes("×") || filterSize.includes("x") ? dimensionLabel(filterSize) : filterSize),
                  filterColor && "Variasi: " + colorLabel(filterColor),
                  minPrice && "Min: " + money(parseRupiah(minPrice)),
                  maxPrice && "Maks: " + money(parseRupiah(maxPrice)),
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
              ) : crossCategoryLoading ? (
                <div className="empty" role="status">
                  <p>Memeriksa ketersediaan produk di kategori lain…</p>
                </div>
              ) : crossCategoryMatches.length > 0 ? (
                <div className="empty ks-cross-empty-container">
                  {crossCategoryMatches.length === 1 ? (
                    <div className="ks-cross-category-notice">
                      <div className="ks-cross-badge">
                        <Compass size={18} />
                        <span>Pencarian Lintas Kategori</span>
                      </div>
                      <h2 className="ks-cross-title">
                        Produk yang Anda cari tersedia di kategori {mainCategoryLabel(crossCategoryMatches[0].category, allCategories)}. Ingin beralih ke kategori tersebut?
                      </h2>
                      <p className="ks-cross-desc">
                        Kata kunci “<strong>{search}</strong>” tidak ditemukan di {subcategory !== "Semua" ? categoryLabel(subcategory, allCategories) : mainCategoryLabel(activeCategory, allCategories)}, namun tersedia {crossCategoryMatches[0].count} produk di kategori <strong>{mainCategoryLabel(crossCategoryMatches[0].category, allCategories)}</strong>.
                      </p>
                      <div className="ks-cross-actions">
                        <button
                          type="button"
                          className="btn black ks-cross-btn-main"
                          onClick={() => {
                            setActiveCategory(crossCategoryMatches[0].category);
                            setSubcategory("Semua");
                            setPage(1);
                            setCrossCategoryMatches([]);
                          }}
                        >
                          <span>Beralih ke Kategori {mainCategoryLabel(crossCategoryMatches[0].category, allCategories)}</span>
                          <ArrowRight size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn outline"
                          onClick={() => {
                            setActiveCategory("Semua");
                            setSubcategory("Semua");
                            setPage(1);
                            setCrossCategoryMatches([]);
                          }}
                        >
                          Cari di Semua Kategori
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="ks-cross-category-notice">
                      <div className="ks-cross-badge">
                        <Compass size={18} />
                        <span>Pencarian Lintas Kategori</span>
                      </div>
                      <h2 className="ks-cross-title">
                        Produk yang Anda cari tersedia di kategori lain. Ingin beralih ke salah satu kategori tersebut?
                      </h2>
                      <p className="ks-cross-desc">
                        Kata kunci “<strong>{search}</strong>” tidak ditemukan di {subcategory !== "Semua" ? categoryLabel(subcategory, allCategories) : mainCategoryLabel(activeCategory, allCategories)}, namun tersedia di {crossCategoryMatches.length} kategori berikut:
                      </p>
                      <div className="ks-cross-options-grid">
                        {crossCategoryMatches.map((m) => {
                          const catLabel = m.isCurrentCategoryAll
                            ? `Seluruh ${mainCategoryLabel(m.category, allCategories)}`
                            : mainCategoryLabel(m.category, allCategories);
                          return (
                            <button
                              key={m.category + (m.isCurrentCategoryAll ? "-all" : "")}
                              type="button"
                              className="ks-cross-option-card"
                              onClick={() => {
                                setActiveCategory(m.category);
                                setSubcategory("Semua");
                                setPage(1);
                                setCrossCategoryMatches([]);
                              }}
                            >
                              <div className="ks-cross-option-body">
                                <span className="ks-cross-option-name">Beralih ke {catLabel}</span>
                                <span className="ks-cross-option-sub">{m.count} produk tersedia</span>
                              </div>
                              <ArrowRight size={18} className="ks-cross-option-icon" />
                            </button>
                          );
                        })}
                      </div>
                      <div className="ks-cross-actions">
                        <button
                          type="button"
                          className="btn outline"
                          onClick={() => {
                            setActiveCategory("Semua");
                            setSubcategory("Semua");
                            setPage(1);
                            setCrossCategoryMatches([]);
                          }}
                        >
                          Cari di Semua Kategori ({crossCategoryMatches.reduce((acc, c) => acc + c.count, 0)} produk)
                        </button>
                      </div>
                    </div>
                  )}
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
              notify(`Email tersimpan untuk kabar koleksi ${config.brand || "toko"}.`);
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
      <StoreFooter nav={nav} onInfo={setInfo} contact={config.contact} storeAddress={config.storeAddress} brand={config.brand} />
      {productDialog}
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
            {["Sprei Fitted", "Sprei Karet", "Sprei Hotel", "Sarung Bantal"].map((t) => (
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
              <h2>Jelajahi Kintsugi</h2>
              <button aria-label="Tutup menu" onClick={() => setMenu(false)}>
                <X />
              </button>
            </div>
            {categories.map((c) => (
              <button key={c} onClick={() => shop(c)}>
                {categoryLabel(c, config.categories)}
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
            <span className="eyebrow">KINTSUGI / INFORMASI</span>
            <h2>{info}</h2>
            {info === "Panduan ukuran" ? (
              <>
                <p>Pilih ukuran yang sama dengan ukuran spring bed Anda. Semua angka dalam sentimeter.</p>
                <table>
                  <thead>
                    <tr>
                      <th>Ukuran</th>
                      <th>Lebar</th>
                      <th>Panjang</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[["90×200", 90], ["100×200", 100], ["120×200", 120], ["160×200", 160], ["180×200", 180], ["200×200", 200]].map(([s, width]) => (
                      <tr key={s}>
                        <td>{s}</td>
                        <td>{width} cm</td>
                        <td>200 cm</td>
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
