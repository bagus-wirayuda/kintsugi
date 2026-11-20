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
import { getPermittedDestination, ADMIN_ROLES } from "./routes";
import "./styles.css";
const Admin = lazy(() => import("./Admin.jsx"));
const Auth = lazy(() => import("./Auth.jsx"));
const Account = lazy(() => import("./Account.jsx"));
const Checkout = lazy(() => import("./Checkout.jsx"));
import Home from "./Home.jsx";
import { CartPage, WishlistPage, PaymentPage } from "./ShoppingPages.jsx";
import "./workspace.css";
import { policy } from "./policies.js";
import { dimensionLabel, dimensionValue, parseDimensions } from "./dimensions.js";
import { SizeGuideContent } from "./SizeGuide.jsx";
import { sizesMatch } from "./size-guide.js";
import SizeSummary from "./SizeSummary.jsx";
import VariantSummary from "./VariantSummary.jsx";
import { resolveActiveVariant, resolveVariationDisplayMode, colorsMatch, getProductPriceRange, handleImageError, resolveMediaUrl } from "./variant-utils.js";
import { StoreHeader, StoreFooter } from "./StoreChrome.jsx";
import {
  getCartItemCount,
  mergeGuestCart,
  mergeGuestSelection,
  moveGuestCheckout,
  reconcileSelectedKeys,
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
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
              <button
                className="ws-button primary"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
              >
                Muat Ulang Halaman
              </button>
              <button
                className="ws-button"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  if (this.props.onHome) {
                    this.props.onHome();
                  } else {
                    window.location.hash = "#home";
                    window.location.reload();
                  }
                }}
              >
                Kembali ke Beranda
              </button>
              {this.props.onLogout && (
                <button
                  className="ws-button light"
                  onClick={() => {
                    this.setState({ hasError: false, error: null });
                    this.props.onLogout();
                  }}
                >
                  Keluar dari Akun
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const initialView = () => getPermittedDestination(location.hash, null).view;
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
    [selectedCartKeys, setSelectedCartKeys] = useState([]),
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
    [sizeGuideProduct, setSizeGuideProduct] = useState(null),
    [cardColors, setCardColors] = useState({}),
    [detailPhotoIndex, setDetailPhotoIndex] = useState(0),
    [crossCategoryMatches, setCrossCategoryMatches] = useState([]),
    [crossCategoryLoading, setCrossCategoryLoading] = useState(false);
  const closeInfoDialog = () => {
    setInfo(null);
    setSizeGuideProduct(null);
  };
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
      if (!row || typeof row !== "object") return row;
      const qty = Math.max(1, Math.min(99, Math.trunc(Number(row.quantity) || 1)));
      const stockNum = Number(row.stock);
      const safeStock =
        Number.isFinite(stockNum) && stockNum > 0
          ? Math.min(99, Math.trunc(stockNum))
          : 99;
      const parts = String(row?.size ?? "")
        .trim()
        .split(/[×xX]/)
        .map((part) => Number(part.trim()));
      const normalizedSize =
        parts.length === 3 &&
        parts.every((n) => Number.isInteger(n) && n >= 1 && n <= 500)
          ? dimensionValue(parts[0], parts[1], parts[2])
          : row.size;
      return { ...row, size: normalizedSize, quantity: qty, stock: safeStock };
    };
    const normalizedCart = savedCart.map(restoreDimensions);
    setCart(normalizedCart);
    const savedSelected = storage.read("cart-selected:" + owner, null);
    setSelectedCartKeys(reconcileSelectedKeys(normalizedCart, savedSelected));
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
    setSelectedCartKeys((prev) => {
      const valid = new Set(cart.map((item) => item.key));
      const next = prev.filter((k) => valid.has(k));
      return next.length === prev.length ? prev : next;
    });
  }, [cart]);
  useEffect(() => {
    if (authReady && cartOwner === (user?.id || "guest"))
      storage.write("cart-selected:" + cartOwner, selectedCartKeys);
  }, [selectedCartKeys, cartOwner, user?.id, authReady]);
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
      .then((u) => {
        setUser(u);
        const dest = getPermittedDestination(location.hash, u);
        if (dest.redirect || (dest.hash && location.hash !== dest.hash)) {
          history.replaceState(null, "", dest.hash);
        }
        setView(dest.view);
      })
      .catch((e) => {
        setUser(null);
        if (e.status !== 401) notify(e.message);
        const dest = getPermittedDestination(location.hash, null);
        if (dest.redirect || (dest.hash && location.hash !== dest.hash)) {
          history.replaceState(null, "", dest.hash);
        }
        setView(dest.view);
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
        closeInfoDialog();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!authReady) return;
    const change = () => {
      const dest = getPermittedDestination(location.hash, user);
      if (dest.redirect || (dest.hash && location.hash !== dest.hash)) {
        history.replaceState(null, "", dest.hash);
      }
      setView(dest.view);
    };
    change();
    window.addEventListener("hashchange", change);
    window.addEventListener("popstate", change);
    return () => {
      window.removeEventListener("hashchange", change);
      window.removeEventListener("popstate", change);
    };
  }, [authReady, user?.id, user?.role]);

  useEffect(() => {
    const brandName = config?.brand || "PT Liny Jaya";
    const brandLogo = config?.logo || "";

    const viewTitles = {
      home: `${brandName} | Toko Resmi`,
      catalog: `Katalog Produk | ${brandName}`,
      cart: `Keranjang Belanja | ${brandName}`,
      checkout: `Checkout Pesanan | ${brandName}`,
      payment: `Metode Pembayaran | ${brandName}`,
      success: `Status Pesanan | ${brandName}`,
      account: `Akun Saya | ${brandName}`,
      admin: `Panel Admin | ${brandName}`,
      auth: `Masuk / Daftar | ${brandName}`,
    };

    let titleText = viewTitles[view] || `${brandName} | Toko Resmi`;
    if (detail?.title) {
      titleText = `${detail.title} | ${brandName}`;
    }
    document.title = titleText;

    let iconLink = document.querySelector("link[rel~='icon']");
    if (!iconLink) {
      iconLink = document.createElement("link");
      iconLink.rel = "icon";
      document.head.appendChild(iconLink);
    }
    iconLink.type = "image/png";
    iconLink.href = brandLogo;

    let appleLink = document.querySelector("link[rel='apple-touch-icon']");
    if (!appleLink) {
      appleLink = document.createElement("link");
      appleLink.rel = "apple-touch-icon";
      document.head.appendChild(appleLink);
    }
    appleLink.href = brandLogo;
  }, [config?.brand, config?.logo, view, detail?.title]);
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
  const nav = (v, keepDirect = false, replace = false) => {
    const rawTarget = String(v).startsWith("#") ? v : "#" + v;
    const dest = getPermittedDestination(rawTarget, user);
    const targetHash = dest.hash;
    const targetView = dest.view;

    if ((v === 'checkout' || v === 'payment') && !keepDirect) {
      if (v === 'checkout') {
        setDirectPurchase(null);
        storage.write('direct:' + (user?.id || 'guest'), null);
      }
    }
    if (v === "success" || replace || dest.redirect) {
      history.replaceState(null, "", targetHash);
    } else if (location.hash !== targetHash) {
      history.pushState(null, "", targetHash);
    }
    setView(targetView);
    if (v !== 'success') window.dispatchEvent(new HashChangeEvent('hashchange'));
    setMenu(false);
    setSearchOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const selectCategoryFilter = (nextCat = "Semua", nextSub = "Semua") => {
    setActiveCategory(nextCat);
    setSubcategory(nextSub);
    setFilterSize("");
    setFilterColor("");
    setCrossCategoryMatches([]);
    setPage(1);
  };
  const shop = (cat = "Semua", g = "Semua") => {
    const catsPool = config?.categories?.length ? config.categories : catalogCategories;
    const isMainCat = (val) => {
      if (!val || val === "Semua") return false;
      return catsPool.some(
        (c) =>
          (!c.parentId && !c.parent_id) &&
          (c.id === val ||
            c.name?.toLowerCase() === String(val).toLowerCase() ||
            c.label?.toLowerCase() === String(val).toLowerCase())
      ) || ["bedding", "fashion", "seprai"].includes(val);
    };

    if (isMainCat(cat) && !isMainCat(g)) {
      const match = catsPool.find(
        (c) =>
          (!c.parentId && !c.parent_id) &&
          (c.id === cat ||
            c.name?.toLowerCase() === String(cat).toLowerCase() ||
            c.label?.toLowerCase() === String(cat).toLowerCase())
      );
      selectCategoryFilter(match?.id || cat, g);
    } else if (isMainCat(g)) {
      const match = catsPool.find(
        (c) =>
          (!c.parentId && !c.parent_id) &&
          (c.id === g ||
            c.name?.toLowerCase() === String(g).toLowerCase() ||
            c.label?.toLowerCase() === String(g).toLowerCase())
      );
      selectCategoryFilter(match?.id || g, cat);
    } else {
      selectCategoryFilter(cat, g);
    }
    setSearch("");
    nav("catalog");
  };
  const openProduct = async (p, intent = 'cart', preferredColor = "") => {
    setPurchaseIntent(intent);
    setProductLoading(true);
    try {
      const product = await api("/products/" + encodeURIComponent(p.id));
      const initialColor =
        preferredColor && product.colors?.includes(preferredColor)
          ? preferredColor
          : product.colors?.[0] || "";
      const singleSize = product.sizes?.length === 1 ? product.sizes[0] : "";
      setDetail(product);
      setSize(singleSize);
      setColor(initialColor);
      setDetailPhotoIndex(0);
      setQuantity(1);
    } catch (e) {
      notify(e.message);
    } finally {
      setProductLoading(false);
    }
  };
  const activeVariantInfo = detail
    ? resolveActiveVariant(detail, color, size)
    : null;
  const detailDisplay = detail
    ? resolveVariationDisplayMode(detail.colors, detail.variants, detail.variationLabel)
    : { mode: "text", items: [] };
  const activeGallery = activeVariantInfo?.gallery?.length
    ? activeVariantInfo.gallery
    : detail?.image
      ? [detail.image]
      : [];
  const activeMainPhoto =
    activeGallery[Math.min(detailPhotoIndex, activeGallery.length - 1)] ||
    activeVariantInfo?.image ||
    detail?.image;
  const activeUnitPrice = activeVariantInfo?.unitPrice || detail?.price || 0;
  const activeOldPrice = activeVariantInfo?.oldPrice ?? detail?.oldPrice ?? 0;

  const selectedStock = detail?.variants
    ? detail.variants.find((v) => sizesMatch(v.size, size) && v.color === color)
        ?.stock || 0
    : detail?.stock || 0;
  const effectiveMaxStock = !detail
    ? 0
    : size
      ? selectedStock
      : detail.variants?.length
        ? Math.max(
            0,
            ...detail.variants
              .filter((v) => !color || v.color === color)
              .map((v) => Number(v.stock) || 0),
          ) || Math.min(99, Number(detail.stock) || 0)
        : Number(detail.stock) || 0;
  useEffect(() => {
    setDetailPhotoIndex(0);
  }, [detail?.id, color]);
  useEffect(() => {
    if (!detail || !size) return;
    if (selectedStock > 0) {
      setQuantity((q) => Math.max(1, Math.min(99, selectedStock, q)));
    }
  }, [detail?.id, size, color, selectedStock]);
  useEffect(() => {
    if (catalogLoading) return;
    if (
      filterSize &&
      Array.isArray(catalog.facets?.sizes) &&
      !catalog.facets.sizes.some((s) => sizesMatch(s, filterSize))
    ) {
      setFilterSize("");
    }
    if (
      filterColor &&
      Array.isArray(catalog.facets?.colors) &&
      !catalog.facets.colors.includes(filterColor)
    ) {
      setFilterColor("");
    }
  }, [catalogLoading, catalog.facets, filterSize, filterColor]);
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
    const safeQty = Math.max(1, Math.min(99, Math.trunc(Number(quantity) || 1)));
    const safeStock = Math.max(0, Math.trunc(Number(selectedStock) || 0));
    const resolvedVariant = activeVariantInfo?.variant;
    const canonicalSize = resolvedVariant?.size || size;
    const canonicalColor = resolvedVariant?.color || color;
    const resolvedVariantId = activeVariantInfo?.variantId || resolvedVariant?.id || "";
    const resolvedImage = activeVariantInfo?.image || activeMainPhoto || detail.image;
    const resolvedPrice = activeUnitPrice;
    const key = `${detail.id}:${canonicalSize}:${canonicalColor}`;
    if (buyNow) {
      if (safeQty > Math.min(99, safeStock)) return notify('Jumlah melebihi stok tersedia.');
      const item = {
        ...detail,
        variantId: resolvedVariantId,
        image: resolvedImage,
        price: resolvedPrice,
        variationLabel: detail.variationLabel || "Variasi",
        stock: safeStock,
        key,
        size: canonicalSize,
        color: canonicalColor,
        quantity: safeQty,
      };
      setDirectPurchase(item);
      storage.write('direct:' + (user?.id || 'guest'), item);
      setDetail(null);
      nav('checkout', true);
      return;
    }
    const old = cart.find((i) => i.key === key);
    if ((old?.quantity || 0) + safeQty > Math.min(99, safeStock)) {
      notify("Jumlah melebihi stok tersedia.");
      return;
    }
    setCart((c) =>
      old
        ? c.map((i) =>
            i.key === key
              ? {
                  ...i,
                  variantId: resolvedVariantId || i.variantId,
                  image: resolvedImage,
                  price: resolvedPrice,
                  stock: safeStock,
                  quantity: i.quantity + safeQty,
                }
              : i,
          )
        : [
            ...c,
            {
              ...detail,
              variantId: resolvedVariantId,
              image: resolvedImage,
              price: resolvedPrice,
              variationLabel: detail.variationLabel || "Variasi",
              stock: safeStock,
              key,
              size: canonicalSize,
              color: canonicalColor,
              quantity: safeQty,
            },
          ],
    );
    setSelectedCartKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    flyToCart(resolvedImage, event.currentTarget);
    setDetail(null);
    notify("Produk ditambahkan ke keranjang");
  };
  const toggleCartSelect = (key) => {
    setSelectedCartKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };
  const toggleCartSelectAll = (checked) => {
    setSelectedCartKeys(checked ? cart.map((item) => item.key) : []);
  };
  const count = getCartItemCount(cart);
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
    const activeCardColor =
      cardColors[p.id] && p.colors?.includes(cardColors[p.id])
        ? cardColors[p.id]
        : p.colors?.[0] || "";
    const cardVariant = resolveActiveVariant(p, activeCardColor, "");
    const cardImage = resolveMediaUrl(cardVariant.image || p.image);
    return (
      <article className="product" key={p.id}>
        <div className="product-image">
          <button
            className="image-button"
            onClick={() => openProduct(p, "cart", activeCardColor)}
            aria-label={`Lihat ${p.name}`}
          >
            <img
              className="ks-variant-live-img"
              src={cardImage}
              alt={`${p.name}${activeCardColor ? ` - ${colorLabel(activeCardColor)}` : ""}`}
              loading="lazy"
              onError={(e) => handleImageError(e)}
            />
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
          variants={p.variants}
          variationLabel={p.variationLabel || "Warna"}
          selectedColor={activeCardColor}
          onSelectColor={(nextColor) =>
            setCardColors((prev) => ({ ...prev, [p.id]: nextColor }))
          }
        />
        <div className="product-meta">
          {categoryLabel(p.category, config.categories).toUpperCase()}
        </div>
        <SizeSummary sizes={p.sizes} />
        <button className="product-name" onClick={() => openProduct(p, "cart", activeCardColor)}>
          {p.name}
        </button>
        <div className={"price " + (p.oldPrice ? "sale" : "")}>
          {money(p.minPrice ?? p.price)} {p.oldPrice > 0 && <del>{money(p.oldPrice)}</del>}
        </div>
        <div className="ks-product-actions">
          <button aria-label={'Tambah ke keranjang ' + p.name} onClick={() => openProduct(p, 'cart', activeCardColor)}><ShoppingBag size={15}/><span>Keranjang</span></button>
          <button onClick={() => openProduct(p, 'buy', activeCardColor)} aria-label={'Beli langsung ' + p.name}>Beli langsung</button>
        </div>
      </article>
    );
  }

  async function logout() {
    const prevUserId = user?.id;
    try {
      await api("/auth/logout", { method: "POST" });
    } catch (e) {
      console.warn("Logout request failed:", e.message);
    } finally {
      setUser(null);
      setDetail(null);
      setDirectPurchase(null);
      setPlaced(null);
      setCart([]);
      setSelectedCartKeys([]);
      setWish([]);
      setCoupon("");
      setCartOwner("guest");

      storage.clearUserSession(prevUserId);
      storage.write("cart:guest", []);
      storage.write("cart-selected:guest", null);
      storage.write("wish:guest", []);
      storage.write("coupon:guest", "");
      storage.write("direct:guest", null);
      storage.write("checkout-draft:guest", null);

      history.replaceState(null, "", "#home");
      setView("home");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  }
  async function authenticated(u, checkout = false) {
    if (u.role === "customer" && cartOwner === "guest" && cart.length) {
      const saved = storage.read("cart:" + u.id, []),
        merged = mergeGuestCart(saved, cart);
      const mergedSelected = mergeGuestSelection(
        storage.read("cart-selected:" + u.id, null),
        selectedCartKeys,
        merged,
      );
      storage.write("cart:" + u.id, merged);
      storage.write("cart-selected:" + u.id, mergedSelected);
      storage.write("cart:guest", []);
      storage.write("cart-selected:guest", null);
    } else if (u.role === "customer" && cartOwner === "guest") {
      storage.write("cart-selected:guest", null);
    }
    if (u.role === "customer" && cartOwner === "guest") {
      if (directPurchase) {
        storage.write('direct:' + u.id, directPurchase);
        storage.write('direct:guest', null);
      }
      moveGuestCheckout(storage, u.id);
      if (coupon) storage.write("coupon:" + u.id, coupon);
      storage.write("coupon:guest", "");
    }
    if (u.role === "customer" && cartOwner === "guest" && wish.length) {
      storage.write("wish:" + u.id, [
        ...new Set([...storage.read("wish:" + u.id, []), ...wish]),
      ]);
      storage.write("wish:guest", []);
    }
    if (["admin", "manager", "staff"].includes(u.role)) {
      setCart([]);
      setSelectedCartKeys([]);
      setWish([]);
      setCoupon("");
      setDirectPurchase(null);
    }
    setUser(u);
    if (!checkout || ["admin", "manager", "staff"].includes(u.role)) {
      const target = u.role === "customer"
        ? "account/overview"
        : (u.role === "staff" ? "admin/orders" : "admin/overview");
      nav(target, false, true);
    }
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
        <div className="ks-detail-media">
          <div className="detail-image">
            <img
              className="ks-variant-live-img"
              src={resolveMediaUrl(activeMainPhoto)}
              alt={`${detail.name}${color ? ` - ${colorLabel(color)}` : ""}`}
              onError={(e) => handleImageError(e)}
            />
          </div>
          {activeGallery.length > 1 && (
            <div className="ks-detail-gallery" role="list" aria-label={`Galeri ${colorLabel(color) || detail.name}`}>
              {activeGallery.map((imgUrl, idx) => (
                <button
                  key={`${imgUrl}-${idx}`}
                  type="button"
                  className={"ks-detail-gallery-thumb " + (idx === detailPhotoIndex ? "active" : "")}
                  aria-label={`Lihat gambar ${idx + 1} dari ${colorLabel(color) || detail.name}`}
                  aria-pressed={idx === detailPhotoIndex}
                  onClick={() => setDetailPhotoIndex(idx)}
                >
                  <img src={resolveMediaUrl(imgUrl)} alt="" loading="lazy" onError={(e) => handleImageError(e)} />
                </button>
              ))}
            </div>
          )}
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
            {activeVariantInfo?.hasPriceRange && !size ? (
              <div className="ks-detail-price-range">
                <span className="ks-range-amount">
                  {money(activeVariantInfo.minPrice)} – {money(activeVariantInfo.maxPrice)}
                </span>
                <span className="ks-range-note">
                  Pilih ukuran & variasi untuk melihat harga spesifik
                </span>
              </div>
            ) : (
              <div className="ks-detail-price-single">
                <span className="ks-single-amount">{money(activeUnitPrice)}</span>
                {activeOldPrice > activeUnitPrice && <del>{money(activeOldPrice)}</del>}
                {activeVariantInfo?.hasPriceRange && (
                  <span className="ks-range-subnote">
                    Rentang: {money(activeVariantInfo.minPrice)} – {money(activeVariantInfo.maxPrice)}
                  </span>
                )}
              </div>
            )}
          </div>
          <p>{detail.description}</p>
          <label>
            {detail.variationLabel || "Variasi"}{" "}
            <span>
              {colorLabel(color)} · {Math.max(1, detail.colors.indexOf(color) + 1)} / {Math.max(1, detail.colors.length)}
            </span>
          </label>
          <div className={`color-choices mode-${detailDisplay.mode}`}>
            {detailDisplay.items.map((item) => {
              const isSelected = color === item.value;
              const modeClass =
                detailDisplay.mode === "swatch"
                  ? "is-hex"
                  : detailDisplay.mode === "thumbnail"
                    ? "is-thumb"
                    : "is-text";
              return (
                <button
                  key={item.value}
                  type="button"
                  aria-label={`${detail.variationLabel || "Variasi"} ${item.label}`}
                  aria-pressed={isSelected}
                  title={item.label}
                  className={`ks-variant-choice ${isSelected ? "selected" : ""} ${modeClass}`}
                  style={detailDisplay.mode === "swatch" ? { background: item.hex } : undefined}
                  onClick={() => {
                    setColor(item.value);
                    setDetailPhotoIndex(0);
                    if (
                      size &&
                      detail.variants &&
                      !detail.variants.some(
                        (v) =>
                          sizesMatch(v.size, size) &&
                          v.color === item.value &&
                          Number(v.stock) > 0,
                      )
                    ) {
                      const availableSizes = detail.variants.filter(
                        (v) => v.color === item.value && Number(v.stock) > 0,
                      );
                      setSize(availableSizes.length === 1 ? availableSizes[0].size : "");
                    }
                  }}
                >
                  {detailDisplay.mode === "thumbnail" && item.thumb && (
                    <img src={resolveMediaUrl(item.thumb)} alt={item.label} className="ks-variant-thumb" onError={(e) => handleImageError(e)} />
                  )}
                  {detailDisplay.mode !== "swatch" && (
                    <span className="ks-variant-text">{item.label}</span>
                  )}
                </button>
              );
            })}
          </div>
          <label className="product-size-label">
            <span>Ukuran</span>
            <button
              type="button"
              className="text-link"
              onClick={() => {
                setSizeGuideProduct(detail);
                setInfo("Panduan ukuran");
              }}
            >
              Panduan ukuran
            </button>
          </label>
          <p className="product-size-hint">{detail.sizes.some((value)=>parseDimensions(value))?"Pilih satu ukuran lengkap: panjang × lebar × tinggi.":"Pilih ukuran atau opsi produk yang tersedia."}</p>
          <div className={"size-choices " + (detail.sizes.some((value) => parseDimensions(value)) ? "has-dimensions" : "regular-sizes")}>
            {detail.sizes.map((s) => {
              const dimensions = parseDimensions(s);
              const matchedVar = detail.variants?.find((v) => colorsMatch(v.color, color) && sizesMatch(v.size, s));
              const hasVarPrice = matchedVar?.price != null && Number(matchedVar.price) >= 1000;
              const specificPrice = hasVarPrice ? Number(matchedVar.price) : Number(detail.basePrice || detail.price || 0);

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
                  {activeVariantInfo?.hasPriceRange && (
                    <span className="size-variant-price-tag">{money(specificPrice)}</span>
                  )}
                </button>
              );
            })}
          </div>
          {size && <p className="selected-size-summary">Dipilih: <strong>{dimensionLabel(size)}</strong></p>}
          <label>
            Jumlah{" "}
            <span>
              {size
                ? `${selectedStock} tersedia`
                : `Maks. ${effectiveMaxStock} unit (pilih ukuran)`}
            </span>
          </label>
          <div className="detail-qty-row">
            <div className="qty">
              <button
                type="button"
                aria-label="Kurangi jumlah"
                disabled={quantity <= 1}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                <Minus size={15} />
              </button>
              <span>{quantity}</span>
              <button
                type="button"
                aria-label="Tambah jumlah"
                disabled={
                  effectiveMaxStock < 1 ||
                  quantity >= Math.min(99, effectiveMaxStock)
                }
                onClick={() =>
                  setQuantity((q) =>
                    Math.min(99, Math.max(1, effectiveMaxStock), q + 1),
                  )
                }
              >
                <Plus size={15} />
              </button>
            </div>
            <div className="detail-qty-subtotal">
              <small>Subtotal ({quantity} barang)</small>
              <strong>{money(activeUnitPrice * quantity)}</strong>
            </div>
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
          Memuat halaman…
        </div>
      </div>
    );
  if (["admin", "manager", "staff"].includes(user?.role) && view === "admin")
    return (
      <ErrorBoundary onLogout={logout} onHome={() => nav(user.role === "staff" ? "admin/orders" : "admin/overview")}>
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
  if (user?.role === "customer" && view === "admin") {
    nav("account/overview", false, true);
    return (
      <div className="workspace">
        <div className="ws-loading" role="status">
          Mengalihkan ke akun pelanggan…
        </div>
      </div>
    );
  }
  if (["admin", "manager", "staff"].includes(user?.role) && view === "account") {
    const adminDest = user.role === "staff" ? "admin/orders" : "admin/overview";
    nav(adminDest, false, true);
    return (
      <div className="workspace">
        <div className="ws-loading" role="status">
          Mengalihkan ke panel pengelolaan…
        </div>
      </div>
    );
  }
  if (["admin", "manager", "staff"].includes(user?.role) && view !== "admin") {
    const adminDest = user.role === "staff" ? "admin/orders" : "admin/overview";
    nav(adminDest, false, true);
    return (
      <div className="workspace">
        <div className="ws-loading" role="status">
          Mengalihkan ke panel pengelolaan…
        </div>
      </div>
    );
  }
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
  const selectedCartItems = cart.filter((item) => selectedCartKeys.includes(item.key));
  const customerAccountProps = {
    ...accountProps,
    cart,
    setCart,
    selectedKeys: selectedCartKeys,
    onToggleSelect: toggleCartSelect,
    onToggleSelectAll: toggleCartSelectAll,
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
          selectedKeys={selectedCartKeys}
          onToggleSelect={toggleCartSelect}
          onToggleSelectAll={toggleCartSelectAll}
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
  const updateCheckoutQuantity = (key, nextQty) => {
    const cleanQty = Math.max(1, Math.min(99, Math.trunc(Number(nextQty) || 1)));
    if (directPurchase && directPurchase.key === key) {
      const cap =
        Number.isFinite(Number(directPurchase.stock)) && Number(directPurchase.stock) > 0
          ? Math.min(99, Math.trunc(Number(directPurchase.stock)))
          : 99;
      const updated = { ...directPurchase, stock: cap, quantity: Math.min(cap, cleanQty) };
      setDirectPurchase(updated);
      storage.write("direct:" + (user?.id || "guest"), updated);
      return;
    }
    setCart((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const cap =
          Number.isFinite(Number(row.stock)) && Number(row.stock) > 0
            ? Math.min(99, Math.trunc(Number(row.stock)))
            : 99;
        return { ...row, stock: cap, quantity: Math.min(cap, cleanQty) };
      }),
    );
  };
  if (view === "checkout" || view === "payment")
    return (
      <>
        <Checkout
          {...accountProps}
          user={user}
          cart={directPurchase ? [directPurchase] : selectedCartItems}
          key={directPurchase?.key || 'cart-checkout'}
          coupon={coupon}
          config={config}
          nav={nav}
          onUpdateQuantity={updateCheckoutQuantity}
          currentView={view}
          onAuthenticated={(u) => authenticated(u, true)}
          onPlaced={(order, buyer, items) => {
            const existingCart = storage.read("cart:" + buyer.id, []);
            const remaining = directPurchase
              ? existingCart
              : subtractPurchased(existingCart, items);
            const remainingKeys = new Set(remaining.map((row) => row.key));
            const savedSel = storage.read("cart-selected:" + buyer.id, null);
            const nextSelected = Array.isArray(savedSel)
              ? savedSel.filter((k) => remainingKeys.has(k))
              : remaining.map((row) => row.key);
            storage.write("cart:" + buyer.id, remaining);
            storage.write("cart-selected:" + buyer.id, nextSelected);
            storage.write("coupon:" + buyer.id, "");
            setPlaced(order);
            setDirectPurchase(null);
            storage.write('direct:' + buyer.id, null);
            storage.write('direct:guest', null);
            setCart(remaining);
            setSelectedCartKeys(nextSelected);
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
        <PaymentPage
          {...accountProps}
          order={placed}
          onOrderUpdated={setPlaced}
          notify={notify}
        />
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
          onSizeGuide={(prod) => {
            setSizeGuideProduct(prod || null);
            setInfo("Panduan ukuran");
          }}
          onAddToCart={(item, buttonEl) => {
            if (user && user.role !== "customer") return notify("Akun admin tidak dapat berbelanja.");
            if (!authReady) return notify("Sedang memuat akun. Coba sesaat lagi.");
            const qty = Math.max(1, Math.min(99, Math.trunc(Number(item.quantity) || 1)));
            const cap =
              Number.isFinite(Number(item.stock)) && Number(item.stock) > 0
                ? Math.min(99, Math.trunc(Number(item.stock)))
                : 99;
            const old = cart.find((i) => i.key === item.key);
            if ((old?.quantity || 0) + qty > cap) {
              return notify("Jumlah melebihi stok tersedia.");
            }
            const cleanItem = { ...item, stock: cap, quantity: qty };
            setCart((c) =>
              old
                ? c.map((i) =>
                    i.key === cleanItem.key ? { ...i, stock: cap, quantity: i.quantity + qty } : i,
                  )
                : [...c, cleanItem],
            );
            setSelectedCartKeys((prev) =>
              prev.includes(cleanItem.key) ? prev : [...prev, cleanItem.key],
            );
            if (buttonEl) flyToCart(cleanItem.image, buttonEl);
            notify("Produk promo berhasil ditambahkan ke keranjang");
          }}
          onBuyDirect={(item) => {
            if (user && user.role !== "customer") return notify("Akun admin tidak dapat berbelanja.");
            if (!authReady) return notify("Sedang memuat akun. Coba sesaat lagi.");
            const qty = Math.max(1, Math.min(99, Math.trunc(Number(item.quantity) || 1)));
            const cap =
              Number.isFinite(Number(item.stock)) && Number(item.stock) > 0
                ? Math.min(99, Math.trunc(Number(item.stock)))
                : 99;
            if (qty > cap) return notify("Jumlah melebihi stok tersedia.");
            const cleanItem = { ...item, stock: cap, quantity: qty };
            setDirectPurchase(cleanItem);
            storage.write("direct:" + (user?.id || "guest"), cleanItem);
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
                <button type="button" onClick={() => selectCategoryFilter("Semua", "Semua")}>
                  Katalog
                </button>
                {activeCategory !== "Semua" && (
                  <>
                    <ChevronRight size={12} />
                    <button type="button" onClick={() => selectCategoryFilter(activeCategory, "Semua")}>
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
                {activeCategory !== "Semua"
                  ? `${(config?.brand || "PT Liny Jaya").toUpperCase()} / ${mainCategoryLabel(activeCategory, allCategories).toUpperCase()}`
                  : `${(config?.brand || "PT Liny Jaya").toUpperCase()} / KOLEKSI KATALOG`}
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
                    : activeCategory === "bedding" || activeCategory === "seprai"
                      ? "Sprei katun Jepang, bed cover, sarung bantal guling, pelindung kasur, dan selimut untuk kenyamanan tidur terbaik."
                      : activeCategory !== "Semua"
                        ? `Koleksi produk berkualitas untuk ${mainCategoryLabel(activeCategory, allCategories)}.`
                        : "Koleksi lengkap perlengkapan tidur (bedding) dan busana harian (fashion) berkualitas tinggi."}
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
                    <div className="catalog-cat-subgroup">
                      {/* Header Nama Kategori Utama sebagai penanda aktif */}
                      <div
                        className="catalog-cat-group-title"
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "8px",
                        }}
                      >
                        <strong
                          style={{
                            color: "var(--ks-teal, #0a596b)",
                            fontSize: "12px",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          {mainCategoryLabel(activeCategory, allCategories)}
                        </strong>
                      </div>

                      {/* Tombol Lihat Semua Produk di Kategori Ini */}
                      <button
                        key="all-in-cat"
                        type="button"
                        className={
                          "catalog-sub-btn " +
                          (subcategory === "Semua" ? "active is-active" : "")
                        }
                        onClick={() => selectCategoryFilter(activeCategory, "Semua")}
                        style={{ marginBottom: "6px" }}
                      >
                        <span>
                          Semua {mainCategoryLabel(activeCategory, allCategories)}
                        </span>
                        <ChevronRight size={13} />
                      </button>

                      {/* Daftar Subkategori Khusus Kategori Ini */}
                      {subcategoriesList.length > 0 ? (
                        subcategoriesList.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            className={
                              "catalog-sub-btn " +
                              (subcategory === s.id ? "active is-active" : "")
                            }
                            onClick={() => selectCategoryFilter(activeCategory, s.id)}
                          >
                            <span>{s.label || s.name}</span>
                            <ChevronRight size={13} />
                          </button>
                        ))
                      ) : (
                        <div
                          className="catalog-empty-subs"
                          style={{
                            padding: "10px 12px",
                            fontSize: "12px",
                            color: "var(--ws-muted, #64748b)",
                            background: "#f8faf9",
                            borderRadius: "6px",
                            margin: "4px 0 8px",
                            border: "1px dashed var(--ks-line, #dce7e7)",
                          }}
                        >
                          Belum ada subkategori untuk{" "}
                          {mainCategoryLabel(activeCategory, allCategories)}.
                        </div>
                      )}

                      {/* Tombol Kembali ke Semua Kategori */}
                      <button
                        type="button"
                        className="ws-link"
                        onClick={() => selectCategoryFilter("Semua", "Semua")}
                        style={{
                          marginTop: "14px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "12px",
                          color: "var(--ks-muted, #666)",
                        }}
                      >
                        <ArrowLeft size={13} /> Lihat Semua Kategori
                      </button>
                    </div>
                  ) : (
                    mainCats.map((m) => {
                      const subs = getSubcategories(allCategories, m.id);
                      return (
                        <div key={m.id} className="catalog-cat-subgroup">
                          <button
                            type="button"
                            className="catalog-cat-group-title"
                            style={{
                              width: "100%",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              background: "none",
                              border: "none",
                              padding: "4px 6px",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                            onClick={() => selectCategoryFilter(m.id, "Semua")}
                          >
                            <strong>{m.label || m.name}</strong>
                            <ChevronRight size={12} />
                          </button>
                          {subs.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              className={
                                "catalog-sub-btn " +
                                (subcategory === s.id ? "active is-active" : "")
                              }
                              onClick={() => selectCategoryFilter(m.id, s.id)}
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
                    <div
                      className="catalog-cat-subgroup"
                      style={{ width: "100%" }}
                    >
                      {/* Header Nama Kategori Utama Mobile */}
                      <div
                        className="catalog-cat-group-title"
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "8px",
                          padding: "4px 8px",
                          fontWeight: "700",
                          color: "var(--ks-teal, #0a596b)",
                        }}
                      >
                        <span>
                          {mainCategoryLabel(activeCategory, allCategories)}
                        </span>
                      </div>

                      {/* Tombol Lihat Semua Produk di Kategori Ini */}
                      <button
                        key="all-in-cat-mobile"
                        type="button"
                        className={
                          "catalog-cat-pill " +
                          (subcategory === "Semua" ? "active is-active" : "")
                        }
                        onClick={(e) => {
                          selectCategoryFilter(activeCategory, "Semua");
                          e.currentTarget
                            .closest("details")
                            ?.removeAttribute("open");
                        }}
                        style={{
                          width: "100%",
                          justifyContent: "space-between",
                          marginBottom: "6px",
                        }}
                      >
                        <span>
                          Semua {mainCategoryLabel(activeCategory, allCategories)}
                        </span>
                        <ChevronRight size={13} />
                      </button>

                      {/* Daftar Subkategori Khusus Kategori Ini */}
                      {subcategoriesList.length > 0 ? (
                        subcategoriesList.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            className={
                              "catalog-cat-pill " +
                              (subcategory === s.id ? "active is-active" : "")
                            }
                            onClick={(e) => {
                              selectCategoryFilter(activeCategory, s.id);
                              e.currentTarget
                                .closest("details")
                                ?.removeAttribute("open");
                            }}
                            style={{
                              width: "100%",
                              justifyContent: "space-between",
                            }}
                          >
                            <span>{s.label || s.name}</span>
                            <ChevronRight size={13} />
                          </button>
                        ))
                      ) : (
                        <div
                          className="catalog-empty-subs"
                          style={{
                            padding: "10px 12px",
                            fontSize: "12px",
                            color: "var(--ws-muted, #64748b)",
                            background: "#f8faf9",
                            borderRadius: "6px",
                            margin: "4px 0 8px",
                            border: "1px dashed var(--ks-line, #dce7e7)",
                          }}
                        >
                          Belum ada subkategori untuk{" "}
                          {mainCategoryLabel(activeCategory, allCategories)}.
                        </div>
                      )}

                      {/* Tombol Kembali ke Semua Kategori */}
                      <button
                        type="button"
                        className="ws-link"
                        onClick={(e) => {
                          selectCategoryFilter("Semua", "Semua");
                          e.currentTarget
                            .closest("details")
                            ?.removeAttribute("open");
                        }}
                        style={{
                          marginTop: "10px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "12px",
                          padding: "6px 8px",
                        }}
                      >
                        <ArrowLeft size={13} /> Lihat Semua Kategori
                      </button>
                    </div>
                  ) : (
                    mainCats.map((m) => {
                      const subs = getSubcategories(allCategories, m.id);
                      return (
                        <div key={m.id} className="catalog-cat-subgroup">
                          <button
                            type="button"
                            className="catalog-cat-group-title"
                            style={{
                              width: "100%",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              background: "none",
                              border: "none",
                              padding: "4px 6px",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                            onClick={(e) => {
                              selectCategoryFilter(m.id, "Semua");
                              e.currentTarget
                                .closest("details")
                                ?.removeAttribute("open");
                            }}
                          >
                            <strong>{m.label || m.name}</strong>
                            <ChevronRight size={12} />
                          </button>
                          {subs.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              className={
                                "catalog-sub-btn catalog-cat-pill " +
                                (subcategory === s.id ? "active is-active" : "")
                              }
                              onClick={(e) => {
                                selectCategoryFilter(m.id, s.id);
                                e.currentTarget
                                  .closest("details")
                                  ?.removeAttribute("open");
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

              <details className="advanced-filters catalog-filter-details">
                <summary>
                  Ukuran, variasi & harga
                  {(filterSize || filterColor || minPrice || maxPrice) && (
                    <span className="catalog-summary-selection">
                      {" "}
                      ({[filterSize, filterColor, minPrice, maxPrice].filter(Boolean).length} aktif)
                    </span>
                  )}
                </summary>
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
                          {parseDimensions(s) ? dimensionLabel(s) : s}
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
                  filterSize && "Ukuran: " + (parseDimensions(filterSize) ? dimensionLabel(filterSize) : filterSize),
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
                          onClick={() => selectCategoryFilter(crossCategoryMatches[0].category, "Semua")}
                        >
                          <span>Beralih ke Kategori {mainCategoryLabel(crossCategoryMatches[0].category, allCategories)}</span>
                          <ArrowRight size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn outline"
                          onClick={() => selectCategoryFilter("Semua", "Semua")}
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
                              onClick={() => selectCategoryFilter(m.category, "Semua")}
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
                          onClick={() => selectCategoryFilter("Semua", "Semua")}
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
      <StoreFooter nav={nav} onInfo={(topic) => { setSizeGuideProduct(null); setInfo(topic); }} contact={config.contact} storeAddress={config.storeAddress} brand={config.brand} />
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
                selectCategoryFilter("Semua", "Semua");
                setSearchOpen(false);
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
                    selectCategoryFilter("Semua", "Semua");
                    setSearchOpen(false);
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
              <h2>Jelajahi {config?.brand || "Katalog"}</h2>
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
                selectCategoryFilter("Semua", "Semua");
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
        <div className="overlay info-overlay" onClick={closeInfoDialog}>
          <section
            className={"info-dialog " + (info === "Panduan ukuran" ? "size-guide-dialog" : "")}
            role="dialog"
            aria-modal="true"
            aria-label={info}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="close"
              aria-label="Tutup informasi"
              onClick={closeInfoDialog}
            >
              <X />
            </button>
            <span className="eyebrow">{(config?.brand || "PT LINY JAYA").toUpperCase()} / INFORMASI</span>
            <h2>{info}</h2>
            {info === "Panduan ukuran" ? (
              <SizeGuideContent
                product={sizeGuideProduct || detail}
                activeCategory={activeCategory}
              />
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
