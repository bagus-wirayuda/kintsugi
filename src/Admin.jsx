import React, { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Package,
  Boxes,
  Settings,
  Plus,
  Search,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Users,
  Percent,
  Tags,
  MessageSquareText,
  TrendingUp,
  Building2,
  Layout,
  Truck,
  CreditCard,
  Activity,
  Trash2,
  Ruler,
  Tag,
  ChevronUp,
  ChevronDown,
  X,
  Edit2,
  Eye,
  EyeOff,
} from "lucide-react";
import Workspace, { Empty, Notice, Status } from "./Workspace";
import { api } from "./store";
import { colorLabel, money, formatRupiah, parseRupiah } from "./data";
import RupiahInput from "./RupiahInput.jsx";
import { paymentLabel } from "./Orders";
import { dimensionLabel, parseDimensions } from "./dimensions.js";
import { paymentMethods as supportedPayments } from "./payment-methods.js";

export default function Admin({ user, notify, onLogout, config, reloadConfig }) {
  const isAdmin = user.role === "admin";
  const isManager = user.role === "manager";
  const isStaff = user.role === "staff";
  const tabs = isStaff ? ["orders"] : isAdmin
    ? ["overview", "products", "discounts", "orders", "categories", "templates", "team", "settings"]
    : ["overview", "products", "orders"];

  const parseAdminHash = () => {
    const raw = location.hash.replace(/^#/, "");
    const parts = raw.split("/");
    const parsedTab = tabs.includes(parts[1])
      ? parts[1]
      : (isStaff ? "orders" : "overview");
    const sub = parts[2] || "";
    const subId = parts[3] || "";
    return { tab: parsedTab, sub, subId };
  };

  const initialRoute = parseAdminHash();
  const [tab, setTab] = useState(initialRoute.tab),
    [products, setProducts] = useState([]),
    [orders, setOrders] = useState([]),
    [health, setHealth] = useState(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [edit, setEdit] = useState(null),
    [sizeMode, setSizeMode] = useState("dimensions"),
    [sizeRows, setSizeRows] = useState([{ id: "default", size: "160×200×30", variation: "Putih", stock: 30, length: "160", width: "200", height: "30", imageUrl: "" }]),
    [selected, setSelected] = useState(null),
    [selectedProduct, setSelectedProduct] = useState(null),
    [trackingNumber, setTrackingNumber] = useState("");
  const [settings, setSettings] = useState(null),
    [categories, setCategories] = useState([]),
    [paymentMethods, setPaymentMethods] = useState([]),
    [promotions, setPromotions] = useState([]),
    [metrics, setMetrics] = useState(null),
    [team, setTeam] = useState([]);

  const productsRef = useRef(products);
  productsRef.current = products;
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;

  const [settingsSubmenu, setSettingsSubmenu] = useState(
    initialRoute.tab === "settings" && ["identity", "storefront", "shipping", "payments", "integrations"].includes(initialRoute.sub)
      ? initialRoute.sub
      : "identity"
  );

  const navigate = (targetHash, replace = false) => {
    if (location.hash === targetHash) return;
    if (replace) {
      history.replaceState(null, "", targetHash);
    } else {
      history.pushState(null, "", targetHash);
    }
    syncRoute();
  };

  const goBack = (fallbackHash = isStaff ? "#admin/orders" : "#admin/overview") => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate(fallbackHash);
    }
  };

  const selectSettingsSubmenu = (subId, replace = false) => {
    navigate(`#admin/settings/${subId}`, replace);
  };
  const [categoryDraft, setCategoryDraft] = useState("");
  const [mainCategoryDraft, setMainCategoryDraft] = useState("");
  const [subcategoryDraft, setSubcategoryDraft] = useState("");
  const [selectedParentForSub, setSelectedParentForSub] = useState("seprai");
  const [formCategory, setFormCategory] = useState("seprai");
  const [formSubcategory, setFormSubcategory] = useState("");
  const [subDrafts, setSubDrafts] = useState({});
  const [editingCatId, setEditingCatId] = useState(null);
  const [editingCatName, setEditingCatName] = useState("");
  const [promotionDraft, setPromotionDraft] = useState(null);
  const [promoSearch, setPromoSearch] = useState("");
  const [promoCategory, setPromoCategory] = useState("all");

  function initPromoFromProduct(product) {
    const basePrice = Number(product.price || 0);
    const defaultDiscount = 10;
    const defaultPromoPrice = Math.round((basePrice * (100 - defaultDiscount)) / 100);
    setPromotionDraft({
      productId: product.id,
      eyebrow: "PENAWARAN TERBATAS",
      title: product.name,
      description: product.description ? product.description.slice(0, 160) : "",
      image: "",
      discountPercent: defaultDiscount,
      promoPrice: defaultPromoPrice,
      active: true,
    });
    setTimeout(() => {
      document.getElementById("promo-form-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function editPromoFromProduct(promo) {
    setPromotionDraft({
      id: promo.id,
      productId: promo.product_id,
      eyebrow: promo.eyebrow,
      title: promo.title,
      description: promo.description,
      image: promo.image || "",
      discountPercent: Number(promo.discount_percent),
      promoPrice: promo.promo_price ? Number(promo.promo_price) : null,
      active: Boolean(promo.active),
    });
    setTimeout(() => {
      document.getElementById("promo-form-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }
  const [sectionsDraft, setSectionsDraft] = useState(null);
  const [sectionSearchTerms, setSectionSearchTerms] = useState({});

  const currentHomeSections = sectionsDraft !== null
    ? sectionsDraft
    : (Array.isArray(settings?.homeSections)
        ? settings.homeSections
        : []);

  const clearAllSections = () => {
    if (window.confirm("Apakah Anda yakin ingin mengosongkan semua section produk beranda? Beranda publik tidak akan menampilkan section produk.")) {
      setSectionsDraft([]);
    }
  };

  const updateSectionField = (index, field, value) => {
    const next = [...currentHomeSections];
    next[index] = { ...next[index], [field]: value };
    setSectionsDraft(next);
  };

  const addHomeSection = () => {
    const newSec = {
      id: "sec-" + Date.now(),
      kicker: "KOLEKSI PILIHAN",
      title: "Koleksi Terbaru",
      productIds: []
    };
    setSectionsDraft([...currentHomeSections, newSec]);
  };

  const moveHomeSection = (index, direction) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= currentHomeSections.length) return;
    const next = [...currentHomeSections];
    const temp = next[targetIdx];
    next[targetIdx] = next[index];
    next[index] = temp;
    setSectionsDraft(next);
  };

  const removeHomeSection = (index) => {
    if (window.confirm("Apakah Anda yakin ingin menghapus section ini dari beranda?")) {
      const next = currentHomeSections.filter((_, i) => i !== index);
      setSectionsDraft(next);
    }
  };

  const toggleProductInSection = (secIndex, prodId) => {
    const next = [...currentHomeSections];
    const sec = next[secIndex];
    const pids = Array.isArray(sec.productIds) ? [...sec.productIds] : [];
    const idx = pids.indexOf(prodId);
    if (idx >= 0) {
      pids.splice(idx, 1);
    } else {
      pids.push(prodId);
    }
    next[secIndex] = { ...sec, productIds: pids };
    setSectionsDraft(next);
  };

  const removeProductFromSection = (secIndex, prodId) => {
    const next = [...currentHomeSections];
    const sec = next[secIndex];
    const pids = (Array.isArray(sec.productIds) ? sec.productIds : []).filter((id) => id !== prodId);
    next[secIndex] = { ...sec, productIds: pids };
    setSectionsDraft(next);
  };

  const saveHomeSections = async (customMessage) => {
    const payload = currentHomeSections.map((sec) => ({
      id: sec.id || "sec-" + Math.random().toString(36).slice(2, 8),
      kicker: String(sec.kicker || "").trim(),
      title: String(sec.title || "").trim(),
      productIds: Array.isArray(sec.productIds) ? sec.productIds : [],
    }));
    const ok = await saveStoreSettings(
      { settings: { homeSections: payload } },
      customMessage || "Section produk beranda berhasil disimpan."
    );
    if (ok) {
      setSectionsDraft(payload);
    }
  };
  async function saveStoreSettings(payload, message) {
    return perform(() => api("/admin/settings", { method: "PATCH", body: payload }), message);
  }
  async function savePromotion(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    const productId = fields.productId || promotionDraft?.productId;
    if (!productId) {
      notify("Pilih produk dari katalog terlebih dahulu.");
      return;
    }
    const product = products.find((p) => p.id === productId);
    const basePrice = Number(product?.price || 0);
    let promoPrice = fields.promoPrice ? parseRupiah(fields.promoPrice) : null;
    let discountPercent = Number(fields.discountPercent) || 10;

    if (promoPrice !== null && promoPrice > 0) {
      if (basePrice > 0 && promoPrice >= basePrice) {
        notify(`Harga promo (${money(promoPrice)}) wajib lebih rendah dari harga asli produk (${money(basePrice)}).`);
        return;
      }
      if (basePrice > 0) {
        discountPercent = Math.max(1, Math.min(99, Math.round((1 - promoPrice / basePrice) * 100)));
      }
    } else if (discountPercent > 0 && discountPercent < 100 && basePrice > 0) {
      promoPrice = Math.round((basePrice * (100 - discountPercent)) / 100);
    }

    const title = String(fields.title || "").trim();
    if (!title) {
      notify("Judul promo wajib diisi.");
      return;
    }

    const body = {
      productId,
      eyebrow: String(fields.eyebrow || "").trim() || "PENAWARAN TERBATAS",
      title,
      description: String(fields.description || "").trim(),
      image: String(fields.image || "").trim(),
      discountPercent,
      promoPrice,
      active: form.elements.active ? form.elements.active.checked : true,
    };
    const ok = await perform(
      () =>
        api(promotionDraft?.id ? `/admin/promotions/${promotionDraft.id}` : "/admin/promotions", {
          method: promotionDraft?.id ? "PATCH" : "POST",
          body,
        }),
      promotionDraft?.id ? "Perubahan promo berhasil disimpan." : "Promo baru berhasil ditambahkan."
    );
    if (ok) {
      setPromotionDraft(null);
      await reloadConfig?.();
    }
  }

  async function deletePromotion(id, title) {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus promo "${title || "ini"}" dari slider beranda?`)) return;
    const ok = await perform(
      () => api(`/admin/promotions/${id}`, { method: "DELETE" }),
      "Promo berhasil dihapus."
    );
    if (ok) {
      if (promotionDraft?.id === id) setPromotionDraft(null);
      await reloadConfig?.();
    }
  }

  async function movePromotion(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= promotions.length) return;
    const reordered = [...promotions];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    setPromotions(reordered);
    const ok = await perform(
      () =>
        api("/admin/promotions/reorder", {
          method: "PUT",
          body: { ids: reordered.map((p) => p.id) },
        }),
      "Urutan promo berhasil diperbarui."
    );
    if (ok) {
      await reloadConfig?.();
    } else {
      await refresh();
    }
  }

  async function handleTogglePromotionActive(promo) {
    const nextActive = !promo.active;
    const ok = await perform(
      () =>
        api(`/admin/promotions/${promo.id}`, {
          method: "PATCH",
          body: { active: nextActive },
        }),
      nextActive ? "Promo ditampilkan di slider beranda." : "Promo disembunyikan dari slider beranda."
    );
    if (ok) {
      await reloadConfig?.();
    }
  }
  async function uploadAsset(file, input) {
    if (!file) return;
    if (file.size > 5_000_000) return setError("Ukuran gambar maksimal 5 MB.");
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const { url } = await api("/admin/uploads", { method: "POST", body: { data: reader.result } });
        input.value = url;
        setMessage("Gambar berhasil diunggah.");
      } catch (e) { setError(e.message); }
    };
    reader.readAsDataURL(file);
  }
  async function refresh() {
    const [p, o, h, m, s, t] = await Promise.all([
      isStaff ? Promise.resolve([]) : api("/admin/products"),
      api("/admin/orders"),
      isAdmin ? api("/admin/status") : Promise.resolve(null),
      isStaff ? Promise.resolve(null) : api("/admin/metrics"),
      isAdmin ? api("/admin/settings") : Promise.resolve(null),
      isAdmin ? api("/admin/users") : Promise.resolve([]),
    ]);
    setProducts(p);
    setOrders(o);
    setHealth(h);
    setMetrics(m);
    if (s) { setSettings(s.settings); setCategories(s.categories); setPaymentMethods(s.paymentMethods); setPromotions(s.promotions || []); }
    setTeam(t);
    syncRoute(p, o, s?.categories || categoriesRef.current);
  }
  useEffect(() => {
    const parts = location.hash.replace(/^#/, "").split("/");
    if (!parts[1] || !tabs.includes(parts[1])) {
      const defaultHash = isStaff ? "#admin/orders" : "#admin/overview";
      history.replaceState(null, "", defaultHash);
    }

    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    const onPop = () => syncRoute();
    const onHash = () => syncRoute();

    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onHash);
    };
  }, [user.id]);

  function syncRoute(prods = productsRef.current, ords = ordersRef.current, cats = categoriesRef.current) {
    const { tab: nextTab, sub, subId } = parseAdminHash();
    setTab(nextTab);
    setSearch("");
    setFilter("all");
    setError("");
    setMessage("");

    if (nextTab === "settings") {
      const validSub = ["identity", "storefront", "shipping", "payments", "integrations"].includes(sub)
        ? sub
        : "identity";
      setSettingsSubmenu(validSub);
      setEdit(null);
      setSelected(null);
      setSelectedProduct(null);
    } else if (nextTab === "products") {
      if (sub === "new") {
        initCreateProductData(cats);
        setSelectedProduct(null);
      } else if (sub === "edit" && subId) {
        const found = prods.find((item) => item.id === subId);
        if (found) initEditProductData(found, cats);
        setSelectedProduct(null);
      } else if (sub === "view" && subId) {
        setEdit(null);
        api(`/admin/products/${subId}/details`)
          .then(setSelectedProduct)
          .catch(() => {});
      } else {
        setEdit(null);
        setSelectedProduct(null);
      }
      setSelected(null);
    } else if (nextTab === "orders") {
      if (sub) {
        const found = ords.find((item) => item.id === sub);
        if (found) {
          setSelected(found);
          setTrackingNumber(found.tracking_number || "");
        }
      } else {
        setSelected(null);
      }
      setEdit(null);
      setSelectedProduct(null);
    } else {
      setEdit(null);
      setSelected(null);
      setSelectedProduct(null);
    }
  }

  function select(t, replace = false) {
    const targetHash =
      t === "settings" ? `#admin/settings/${settingsSubmenu}` : `#admin/${t}`;
    navigate(targetHash, replace);
  }

  function viewOrder(o) {
    setSelected(o);
    setTrackingNumber(o.tracking_number || "");
    navigate(`#admin/orders/${o.id}`);
  }
  async function perform(fn, msg) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      await refresh();
      if (msg) {
        setMessage(msg);
        notify(msg);
      }
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const updateVariantField = (id, field, value) => {
    setSizeRows((rows) =>
      rows.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        if (sizeMode === "dimensions" && (field === "length" || field === "width" || field === "height")) {
          const l = field === "length" ? value : r.length;
          const w = field === "width" ? value : r.width;
          const h = field === "height" ? value : r.height;
          if (l && w && h) {
            updated.size = `${l}×${w}×${h}`;
          }
        }
        return updated;
      })
    );
  };

  const handleSwitchSizeMode = (newMode) => {
    setSizeMode(newMode);
    setSizeRows((rows) =>
      (rows || []).map((r) => {
        if (newMode === "dimensions") {
          const d = parseDimensions(r?.size);
          const l = r?.length || d?.length || "160";
          const w = r?.width || d?.width || "200";
          const h = r?.height || d?.height || "30";
          return {
            ...r,
            length: String(l),
            width: String(w),
            height: String(h),
            size: `${l}×${w}×${h}`,
          };
        } else {
          const currentSize = String(r?.size ?? "");
          const isDimension = /[×xX]/.test(currentSize) || (r?.length && r?.width);
          return {
            ...r,
            size: !isDimension && currentSize ? currentSize : "S",
          };
        }
      })
    );
  };

  const applyPreset = (presetType) => {
    if (presetType === "fashion-standard") {
      setSizeMode("text");
      setSizeRows([
        { id: "s-" + Date.now(), size: "S", variation: "Standar", stock: 20, length: "", width: "", height: "", imageUrl: "" },
        { id: "m-" + Date.now(), size: "M", variation: "Standar", stock: 30, length: "", width: "", height: "", imageUrl: "" },
        { id: "l-" + Date.now(), size: "L", variation: "Standar", stock: 35, length: "", width: "", height: "", imageUrl: "" },
        { id: "xl-" + Date.now(), size: "XL", variation: "Standar", stock: 25, length: "", width: "", height: "", imageUrl: "" },
        { id: "xxl-" + Date.now(), size: "XXL", variation: "Standar", stock: 15, length: "", width: "", height: "", imageUrl: "" },
      ]);
    } else if (presetType === "all-size") {
      setSizeMode("text");
      setSizeRows([
        { id: "all-" + Date.now(), size: "All Size", variation: "Standar", stock: 40, length: "", width: "", height: "", imageUrl: "" },
      ]);
    } else if (presetType === "bedding-complete") {
      setSizeMode("dimensions");
      setSizeRows([
        { id: "sp100-" + Date.now(), size: "100×200×30", variation: "Putih", stock: 20, length: "100", width: "200", height: "30", imageUrl: "" },
        { id: "sp120-" + Date.now(), size: "120×200×30", variation: "Putih", stock: 25, length: "120", width: "200", height: "30", imageUrl: "" },
        { id: "sp160-" + Date.now(), size: "160×200×30", variation: "Putih", stock: 35, length: "160", width: "200", height: "30", imageUrl: "" },
        { id: "sp180-" + Date.now(), size: "180×200×30", variation: "Putih", stock: 30, length: "180", width: "200", height: "30", imageUrl: "" },
        { id: "sp200-" + Date.now(), size: "200×200×30", variation: "Putih", stock: 15, length: "200", width: "200", height: "30", imageUrl: "" },
      ]);
    } else if (presetType === "bedding-queen") {
      setSizeMode("dimensions");
      setSizeRows([
        { id: "queen-" + Date.now(), size: "160×200×30", variation: "Putih", stock: 30, length: "160", width: "200", height: "30", imageUrl: "" },
      ]);
    }
  };

  const addVariation = () => {
    const newId = `${Date.now()}-${sizeRows.length}`;
    const defaultSize = sizeMode === "dimensions" ? "160×200×30" : "S";
    const defaultLength = sizeMode === "dimensions" ? "160" : "";
    const defaultWidth = sizeMode === "dimensions" ? "200" : "";
    const defaultHeight = sizeMode === "dimensions" ? "30" : "";
    setSizeRows((rows) => [
      ...rows,
      {
        id: newId,
        size: defaultSize,
        variation: "",
        stock: 10,
        length: defaultLength,
        width: defaultWidth,
        height: defaultHeight,
        imageUrl: "",
      },
    ]);
  };

  function initCreateProductData(cats = categoriesRef.current) {
    setSizeMode("dimensions");
    setSizeRows([
      { id: "default", size: "160×200×30", variation: "Putih", stock: 30, length: "160", width: "200", height: "30", imageUrl: "" },
    ]);
    const firstCat = cats.find((c) => (!c.parent_id && !c.parentId) && c.active)?.id || "seprai";
    const firstSub = cats.find((c) => ((c.parent_id || c.parentId) === firstCat) && c.active)?.id || "";
    setFormCategory(firstCat);
    setFormSubcategory(firstSub);
    setEdit({
      name: "",
      sku: "",
      price: 149000,
      category: firstCat,
      subcategory: firstSub,
      oldPrice: 0,
      costPrice: 0,
      variationLabel: "Warna",
      weight_grams: 1000,
      description: "",
      isNew: true,
    });
  }

  function initEditProductData(p, cats = categoriesRef.current) {
    const price = p.oldPrice > p.price ? p.oldPrice : p.price;
    const variants = Array.isArray(p.variants) ? p.variants : [];
    const initialRows = variants.map((v, i) => {
      const d = parseDimensions(v.size);
      const length = v.length_cm || d?.length || "";
      const width = v.width_cm || d?.width || "";
      const height = v.height_cm || d?.height || "";
      return {
        id: `v-${i}-${Date.now()}`,
        size: v.size || "",
        variation: v.color || "",
        stock: v.stock ?? 0,
        length: length ? String(length) : "",
        width: width ? String(width) : "",
        height: height ? String(height) : "",
        imageUrl: v.image_url || v.imageUrl || "",
      };
    });
    const hasDimensions =
      initialRows.some((r) => r.length && r.width && r.height) ||
      initialRows.some((r) => parseDimensions(r.size));
    setSizeMode(hasDimensions ? "dimensions" : "text");
    setSizeRows(
      initialRows.length
        ? initialRows
        : [{ id: "default", size: "", variation: "", stock: 30, length: "", width: "", height: "", imageUrl: "" }]
    );
    const catMatch = cats.find((c) => (!c.parent_id && !c.parentId) && (c.id === p.category || c.name.toLowerCase() === (p.category || "").toLowerCase()));
    const catId = catMatch ? catMatch.id : (p.category || "seprai");
    setFormCategory(catId);

    const subMatch = cats.find((c) => ((c.parent_id || c.parentId) === catId) && (c.id === p.subcategory || c.name.toLowerCase() === (p.subcategory || "").toLowerCase()));
    const subId = subMatch ? subMatch.id : (p.subcategory || "");
    setFormSubcategory(subId);

    setEdit({ ...p, price, category: catId, subcategory: subId });
  }

  function startCreateProduct() {
    initCreateProductData();
    navigate("#admin/products/new");
  }

  function loadProductToEdit(p) {
    initEditProductData(p);
    navigate(`#admin/products/edit/${p.id}`);
  }

  async function save(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    const cat = formCategory || f.category;
    const sub = formSubcategory || f.subcategory;
    if (!cat) {
      setError("Kategori utama wajib dipilih.");
      return;
    }
    if (!sub) {
      setError("Sub-kategori wajib dipilih. Pastikan kategori utama memiliki sub-kategori aktif.");
      return;
    }
    const body = {
      name: f.name,
      sku: f.sku,
      price: parseRupiah(f.price),
      category: cat,
      subcategory: sub,
      image: f.image,
      description: f.description,
      isNew: f.isNew === "on",
      costPrice: parseRupiah(f.costPrice || 0),
      weightGrams: Number(f.weightGrams || 1000),
      variationLabel: f.variationLabel || "Warna",
      motif: "",
    };

    if (sizeRows.length === 0) {
      setError("Tambahkan setidaknya satu paket variasi produk.");
      return;
    }

    const variants = [];
    for (let i = 0; i < sizeRows.length; i++) {
      const row = sizeRows[i];
      const color = (row.variation || "").trim();
      if (!color) {
        setError(`Lengkapi nama variasi (warna/motif) untuk Paket Variasi #${i + 1}.`);
        return;
      }

      let size = (row.size || "").trim();
      let lengthCm = 0;
      let widthCm = 0;
      let heightCm = 0;

      if (sizeMode === "dimensions") {
        const l = Number(row.length);
        const w = Number(row.width);
        const h = Number(row.height);
        if (!l || l <= 0 || !w || w <= 0 || !h || h <= 0) {
          setError(`Lengkapi panjang, lebar, dan tinggi (angka lebih dari 0) untuk Paket Variasi #${i + 1} (${color}).`);
          return;
        }
        size = `${l}×${w}×${h}`;
        lengthCm = l;
        widthCm = w;
        heightCm = h;
      } else {
        if (!size) {
          setError(`Isi ukuran teks untuk Paket Variasi #${i + 1} (${color}).`);
          return;
        }
      }

      const stock = Number(row.stock);
      if (!Number.isFinite(stock) || stock < 0) {
        setError(`Stok untuk Paket Variasi #${i + 1} (${color}) harus berupa angka non-negatif.`);
        return;
      }

      variants.push({
        size,
        color,
        stock,
        imageUrl: row.imageUrl ? row.imageUrl.trim() : undefined,
        lengthCm,
        widthCm,
        heightCm,
      });
    }

    // Check duplicate combinations of size + color
    const keys = variants.map((v) => `${v.size}:${v.color}`);
    if (new Set(keys).size !== keys.length) {
      setError("Terdapat kombinasi ukuran dan variasi yang duplikat. Setiap variasi harus memiliki kombinasi ukuran & warna/motif yang unik.");
      return;
    }

    body.oldPrice = 0;
    body.variants = variants;

    if (
      await perform(
        () =>
          api("/admin/products" + (edit.id ? "/" + edit.id : ""), {
            method: edit.id ? "PATCH" : "POST",
            body,
          }),
        edit.id ? "Perubahan produk berhasil disimpan." : "Produk baru berhasil ditambahkan."
      )
    ) {
      navigate("#admin/products");
      setSizeRows([
        { id: "default", size: "160×200×30", variation: "Putih", stock: 30, length: "160", width: "200", height: "30", imageUrl: "" }
      ]);
    }
  }

  async function handleAddMainCategory(e) {
    e.preventDefault();
    const name = mainCategoryDraft.trim();
    if (!name) return;
    const ok = await perform(
      () => api("/admin/categories", { method: "POST", body: { name, parentId: null } }),
      `Kategori utama "${name}" berhasil ditambahkan dan tersimpan permanen.`
    );
    if (ok) {
      setMainCategoryDraft("");
      await reloadConfig?.();
    }
  }

  async function handleAddSubcategory(parentId) {
    const draft = (subDrafts[parentId] || "").trim();
    if (!draft) return;
    const ok = await perform(
      () => api("/admin/categories", { method: "POST", body: { name: draft, parentId } }),
      `Sub-kategori "${draft}" berhasil ditambahkan dan tersimpan permanen.`
    );
    if (ok) {
      setSubDrafts((prev) => ({ ...prev, [parentId]: "" }));
      await reloadConfig?.();
    }
  }

  async function handleToggleCategoryActive(cat) {
    const nextActive = !cat.active;
    const ok = await perform(
      () => api(`/admin/categories/${cat.id}`, { method: "PATCH", body: { active: nextActive } }),
      `Status "${cat.name}" berhasil diubah menjadi ${nextActive ? "Aktif" : "Nonaktif"}.`
    );
    if (ok) await reloadConfig?.();
  }

  async function handleSaveCategoryName(catId) {
    const trimmed = (editingCatName || "").trim();
    if (!trimmed) {
      setEditingCatId(null);
      return;
    }
    const ok = await perform(
      () => api(`/admin/categories/${catId}`, { method: "PATCH", body: { name: trimmed } }),
      "Nama kategori berhasil diperbarui."
    );
    if (ok) {
      setEditingCatId(null);
      setEditingCatName("");
      await reloadConfig?.();
    }
  }

  async function handleDeleteCategory(cat) {
    const isMain = !cat.parentId && !cat.parent_id;
    const label = isMain ? "kategori utama" : "sub-kategori";
    if (!window.confirm(`Hapus ${label} "${cat.name}"? Pastikan tidak ada subkategori atau produk yang sedang menggunakannya.`)) {
      return;
    }
    const ok = await perform(
      () => api(`/admin/categories/${cat.id}`, { method: "DELETE" }),
      `${label.charAt(0).toUpperCase() + label.slice(1)} "${cat.name}" berhasil dihapus.`
    );
    if (ok) await reloadConfig?.();
  }

  async function handleMoveCategory(cat, direction) {
    const isMain = !cat.parentId && !cat.parent_id;
    const parentId = isMain ? null : (cat.parentId || cat.parent_id);
    const siblings = categories.filter((c) => isMain ? (!c.parentId && !c.parent_id) : ((c.parentId || c.parent_id) === parentId));
    const idx = siblings.findIndex((c) => c.id === cat.id);
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= siblings.length) return;

    const reorderedSiblings = [...siblings];
    const temp = reorderedSiblings[targetIdx];
    reorderedSiblings[targetIdx] = reorderedSiblings[idx];
    reorderedSiblings[idx] = temp;

    let siblingCounter = 0;
    const fullReordered = categories.map((c) => {
      const matchSibling = isMain ? (!c.parentId && !c.parent_id) : ((c.parentId || c.parent_id) === parentId);
      if (matchSibling) {
        return reorderedSiblings[siblingCounter++];
      }
      return c;
    });

    const ok = await perform(
      () => api("/admin/categories/reorder", { method: "PUT", body: { ids: fullReordered.map((c) => c.id) } }),
      "Urutan kategori berhasil diperbarui."
    );
    if (ok) await reloadConfig?.();
  }

  const pending = orders.filter(
    (o) => o.payment_status === "PENDING" || o.payment_status === "CREATING",
  );
  const items = [
    ...(!isStaff ? [{ id: "overview", label: isManager ? "Kinerja toko" : "Ringkasan", icon: LayoutDashboard }] : []),
    ...(!isStaff ? [{ id: "products", label: "Produk & stok", icon: Boxes }] : []),
    ...(isAdmin ? [{ id: "discounts", label: "Diskon", icon: Percent }] : []),
    {
      id: "orders",
      label: isStaff ? "Pesanan masuk" : "Pesanan",
      icon: Package,
      count: orders.filter((o) => o.status === "Diproses").length,
    },
    ...(isAdmin ? [
      { id: "categories", label: "Kategori navbar", icon: Tags },
      { id: "templates", label: "Template WhatsApp", icon: MessageSquareText },
      { id: "team", label: "Tim & peran", icon: Users },
      { id: "settings", label: "Pengaturan toko", icon: Settings },
    ] : []),
  ];
  const titles = {
    overview: "Ringkasan toko",
    products: edit
      ? edit.id
        ? "Edit produk"
        : "Tambah produk"
      : selectedProduct ? "Detail produk" : "Produk & stok",
    orders: selected ? "Detail pesanan" : "Kelola pesanan",
    settings: `Pengaturan toko — ${
      settingsSubmenu === "identity"
        ? "Identitas Toko"
        : settingsSubmenu === "storefront"
          ? "Tampilan Beranda"
          : settingsSubmenu === "shipping"
            ? "Pengiriman & Ekspedisi"
            : settingsSubmenu === "payments"
              ? "Metode Pembayaran"
              : "Status Integrasi"
    }`,
    categories: "Kategori produk & navbar",
    discounts: "Promo & Diskon Slider Beranda",
    templates: "Template notifikasi WhatsApp",
    team: "Tim dan peran akses",
  };
  const productRows = products.filter(
    (p) =>
      (filter === "all" ||
        (filter === "active" && p.active) ||
        (filter === "archived" && !p.active)) &&
      [p.name, p.sku, p.category]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const orderRows = orders.filter(
    (o) =>
      (filter === "all" || o.status === filter) &&
      [o.id, o.address.name, o.address.email]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  function orderTable(list) {
    return (
      <div className="ws-table-scroll">
        <table className="ws-table">
          <thead>
            <tr>
              <th>Pesanan</th>
              <th>Pelanggan</th>
              <th>Total</th>
              <th>Pembayaran</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((o) => (
              <tr key={o.id}>
                <td>
                  <b>#{o.id.slice(-8).toUpperCase()}</b>
                  <small>
                    {new Date(o.createdAt).toLocaleDateString("id-ID")}
                  </small>
                </td>
                <td>
                  {o.address.name}
                  <small>{o.address.email}</small>
                </td>
                <td className="ws-nowrap">{money(o.total)}</td>
                <td>
                  <Status
                    tone={
                      o.payment_status === "PAID"
                        ? "success"
                        : o.payment_status === "PENDING"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {paymentLabel[o.payment_status]}
                  </Status>
                </td>
                <td>{o.status}</td>
                <td>
                  <button
                    className="ws-link"
                    onClick={() => viewOrder(o)}
                  >
                    Lihat
                    <ArrowRight size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const renderDiscountsPage = () => {
    const activeProducts = products.filter((p) => p.active);
    const productCategories = ["all", ...new Set(activeProducts.map((p) => p.category).filter(Boolean))];
    const filteredPromoProducts = activeProducts.filter((p) => {
      const matchSearch =
        !promoSearch ||
        [p.name, p.sku, p.category, p.description]
          .join(" ")
          .toLowerCase()
          .includes(promoSearch.toLowerCase());
      const matchCat = promoCategory === "all" || p.category === promoCategory;
      return matchSearch && matchCat;
    });

    const draftProduct = promotionDraft?.productId
      ? products.find((p) => p.id === promotionDraft.productId)
      : null;

    return (
      <div className="ws-discounts-page" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* BAGIAN A: Katalog Produk untuk Promo (Bagian Teratas) */}
        <section className="ws-panel">
          <div className="ws-panel-heading horizontal" style={{ alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span className="ws-kicker" style={{ margin: 0 }}>LANGKAH 1 / PILIH PRODUK</span>
              </div>
              <h2 style={{ fontSize: "18px", margin: "0 0 6px" }}>Katalog Produk untuk Promo</h2>
              <p style={{ margin: 0, color: "var(--ws-muted)", fontSize: "13px" }}>
                Cari dan pilih produk dari database toko. Klik tombol <strong>Buat Promo</strong> untuk langsung memuat data produk ke formulir promo slider beranda.
              </p>
            </div>
            {promotionDraft && (
              <button
                type="button"
                className="ws-button light"
                onClick={() => setPromotionDraft(null)}
              >
                <X size={15} /> Tutup Formulir
              </button>
            )}
          </div>

          {/* Baris Pencarian & Filter Kategori */}
          <div
            style={{
              display: "flex",
              gap: "12px",
              margin: "18px 0 16px",
              flexWrap: "wrap",
              alignItems: "center",
              background: "#f8faf9",
              padding: "12px 16px",
              borderRadius: "8px",
              border: "1px solid var(--ks-line, #e2eae8)",
            }}
          >
            <div style={{ position: "relative", flex: "1 1 240px", minWidth: "200px" }}>
              <Search
                size={16}
                style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--ws-muted)",
                }}
              />
              <input
                type="text"
                placeholder="Cari nama produk, SKU, atau kategori..."
                value={promoSearch}
                onChange={(e) => setPromoSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px 8px 36px",
                  fontSize: "13px",
                  borderRadius: "6px",
                  border: "1px solid var(--ks-line, #cbd5e1)",
                  background: "#ffffff",
                }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "12px", color: "var(--ws-muted)", whiteSpace: "nowrap" }}>
                Kategori:
              </span>
              <select
                value={promoCategory}
                onChange={(e) => setPromoCategory(e.target.value)}
                style={{
                  padding: "8px 12px",
                  fontSize: "13px",
                  borderRadius: "6px",
                  border: "1px solid var(--ks-line, #cbd5e1)",
                  background: "#ffffff",
                  minWidth: "140px",
                }}
              >
                <option value="all">Semua Kategori</option>
                {productCategories
                  .filter((c) => c !== "all")
                  .map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
              </select>
            </div>
            <span style={{ fontSize: "12px", color: "var(--ws-muted)", marginLeft: "auto" }}>
              {filteredPromoProducts.length} produk ditemukan
            </span>
          </div>

          {/* Grid Katalog Produk */}
          {filteredPromoProducts.length ? (
            <div
              className="ws-promotion-catalog"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))",
                gap: "14px",
                maxHeight: "420px",
                overflowY: "auto",
                padding: "4px",
              }}
            >
              {filteredPromoProducts.map((product) => {
                const activePromo = promotions.find(
                  (item) => item.product_id === product.id && item.active
                );
                const isSelected = promotionDraft?.productId === product.id;

                return (
                  <article
                    key={product.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "14px",
                      padding: "12px 14px",
                      background: isSelected ? "rgba(10, 89, 107, 0.05)" : "#ffffff",
                      border: isSelected
                        ? "2px solid var(--ks-teal, #0a596b)"
                        : "1px solid var(--ks-line, #e2eae8)",
                      borderRadius: "8px",
                      boxShadow: isSelected
                        ? "0 2px 8px rgba(10, 89, 107, 0.12)"
                        : "0 1px 3px rgba(0,0,0,0.02)",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <img
                      src={product.image || "/images/seprai/sprei-01.jpg"}
                      alt={product.name}
                      style={{
                        width: "60px",
                        height: "68px",
                        borderRadius: "6px",
                        objectFit: "cover",
                        background: "#f1f5f9",
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b
                        style={{
                          fontSize: "13px",
                          display: "block",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          color: "#0f172a",
                        }}
                        title={product.name}
                      >
                        {product.name}
                      </b>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "3px" }}>
                        <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--ks-teal, #0a596b)" }}>
                          {money(product.price)}
                        </span>
                        <span style={{ fontSize: "11px", color: "var(--ws-muted)" }}>
                          · {product.category}
                        </span>
                      </div>
                      {activePromo && (
                        <div style={{ marginTop: "4px" }}>
                          <span
                            style={{
                              fontSize: "10.5px",
                              fontWeight: "600",
                              color: "#047857",
                              background: "#ecfdf5",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              display: "inline-block",
                            }}
                          >
                            Slide Aktif (-{activePromo.discount_percent}%)
                          </span>
                        </div>
                      )}
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      {activePromo ? (
                        <button
                          type="button"
                          className="ws-button small"
                          onClick={() => editPromoFromProduct(activePromo)}
                          style={{
                            fontSize: "12px",
                            padding: "6px 10px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <Edit2 size={13} /> Ubah
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`ws-button small ${isSelected ? "light" : "primary"}`}
                          onClick={() => initPromoFromProduct(product)}
                          style={{
                            fontSize: "12px",
                            padding: "6px 12px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <Plus size={13} /> Buat Promo
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="ws-empty" style={{ padding: "30px 10px" }}>
              <p style={{ margin: 0 }}>Tidak ada produk yang cocok dengan pencarian kata kunci “{promoSearch}”.</p>
            </div>
          )}
        </section>

        {/* BAGIAN B: Formulir Promo Publik & Slider Beranda (Anchor untuk scroll) */}
        <div id="promo-form-anchor" />
        {promotionDraft && (
          <section className="ws-panel ws-form-panel" style={{ border: "2px solid var(--ks-teal, #0a596b)", borderRadius: "8px" }}>
            <div className="ws-panel-heading horizontal" style={{ borderBottom: "1px solid var(--ks-line, #e2eae8)", paddingBottom: "14px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <span className="ws-kicker" style={{ margin: 0 }}>LANGKAH 2 / KONFIGURASI PROMO</span>
                </div>
                <h2 style={{ fontSize: "18px", margin: "0 0 4px", color: "var(--ks-deep, #073f4e)" }}>
                  {promotionDraft.id ? "Ubah Promo Publik & Slider Beranda" : "Formulir Promo Publik & Slider Beranda"}
                </h2>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--ws-muted)" }}>
                  Sesuaikan harga promo (wajib lebih rendah dari harga asli), tagline penawaran, judul, deskripsi, dan gambar editorial untuk slide beranda publik.
                </p>
              </div>
              <button
                type="button"
                className="ws-link"
                onClick={() => setPromotionDraft(null)}
                style={{ fontSize: "13px" }}
              >
                <X size={16} /> Batal
              </button>
            </div>

            {/* Banner Kartu Informasi Produk Terpilih */}
            {draftProduct && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  padding: "14px 18px",
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: "8px",
                  margin: "18px 0 20px",
                  flexWrap: "wrap",
                }}
              >
                <img
                  src={draftProduct.image || "/images/seprai/sprei-01.jpg"}
                  alt={draftProduct.name}
                  style={{
                    width: "56px",
                    height: "64px",
                    borderRadius: "6px",
                    objectFit: "cover",
                    background: "#ffffff",
                    border: "1px solid #86efac",
                  }}
                />
                <div style={{ flex: 1, minWidth: "220px" }}>
                  <span style={{ fontSize: "11px", fontWeight: "700", color: "#166534", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    PRODUK TERPILIH DARI DATABASE
                  </span>
                  <h4 style={{ margin: "2px 0 4px", fontSize: "15px", color: "#0f172a" }}>
                    {draftProduct.name}
                  </h4>
                  <div style={{ display: "flex", gap: "12px", alignItems: "center", fontSize: "13px" }}>
                    <span>
                      Harga Asli: <strong style={{ color: "#334155" }}>{money(draftProduct.price)}</strong>
                    </span>
                    <span>·</span>
                    <span style={{ color: "var(--ws-muted)" }}>
                      Kategori: <strong>{draftProduct.category}</strong>
                    </span>
                    {draftProduct.variants?.length > 0 && (
                      <>
                        <span>·</span>
                        <span style={{ color: "var(--ws-muted)" }}>
                          {draftProduct.variants.length} Varian Tersedia
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            <form className="ws-form-grid" onSubmit={savePromotion}>
              {/* Field Tersembunyi / Pemilihan Produk */}
              <input type="hidden" name="productId" value={promotionDraft.productId} />

              <label className="ws-wide">
                Produk Terhubung dari Database *
                <select
                  name="productIdSelect"
                  value={promotionDraft.productId}
                  onChange={(event) => {
                    const pId = event.target.value;
                    const prod = products.find((p) => p.id === pId);
                    const base = Number(prod?.price || 0);
                    setPromotionDraft((curr) => {
                      const disc = curr.discountPercent || 10;
                      const sale = base > 0 ? Math.round((base * (100 - disc)) / 100) : null;
                      return {
                        ...curr,
                        productId: pId,
                        title: curr.title || prod?.name || "",
                        description: curr.description || (prod?.description ? prod.description.slice(0, 160) : ""),
                        promoPrice: sale,
                        discountPercent: disc,
                      };
                    });
                  }}
                  required
                >
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({money(product.price)}) — {product.category}
                    </option>
                  ))}
                </select>
                <small>Produk dari database yang akan menerima potongan harga saat promo aktif.</small>
              </label>

              {/* Input Harga Promo Khusus */}
              <label>
                Harga Promo Khusus (Rp) *
                <RupiahInput
                  name="promoPrice"
                  value={promotionDraft.promoPrice ?? ""}
                  onValueChange={(val) => {
                    const prod = products.find((p) => p.id === promotionDraft.productId);
                    const base = parseRupiah(prod?.price || 0);
                    if (base > 0 && val && val < base) {
                      const pct = Math.max(1, Math.min(99, Math.round((1 - val / base) * 100)));
                      setPromotionDraft((curr) => ({ ...curr, promoPrice: val, discountPercent: pct }));
                    } else {
                      setPromotionDraft((curr) => ({ ...curr, promoPrice: val || null }));
                    }
                  }}
                  placeholder="Contoh: 150.000 (Wajib lebih rendah dari harga asli)"
                  required
                />
                <small>
                  {draftProduct && Number(draftProduct.price) > 0 ? (
                    <>Harga asli: <strong>{money(draftProduct.price)}</strong>. Harga promo harus lebih kecil.</>
                  ) : (
                    "Wajib lebih rendah dari harga asli produk."
                  )}
                </small>
              </label>

              {/* Input Diskon (%) */}
              <label>
                Persentase Diskon (%) *
                <input
                  name="discountPercent"
                  type="number"
                  min="1"
                  max="99"
                  value={promotionDraft.discountPercent ?? 10}
                  onChange={(event) => {
                    const pct = Number(event.target.value);
                    const prod = products.find((p) => p.id === promotionDraft.productId);
                    const base = parseRupiah(prod?.price || 0);
                    if (base > 0 && pct >= 1 && pct <= 99) {
                      const sale = Math.round((base * (100 - pct)) / 100);
                      setPromotionDraft((curr) => ({ ...curr, discountPercent: pct, promoPrice: sale }));
                    } else {
                      setPromotionDraft((curr) => ({ ...curr, discountPercent: pct }));
                    }
                  }}
                  required
                />
                <small>Otomatis menghitung harga promo (1% - 99%).</small>
              </label>

              {/* Tagline Promo (Kicker) */}
              <label>
                Tagline Promo (Kicker)
                <input
                  name="eyebrow"
                  maxLength="100"
                  defaultValue={promotionDraft.eyebrow}
                  placeholder="Contoh: PENAWARAN TERBATAS"
                />
                <small>Teks kecil di atas judul promo pada slide beranda.</small>
              </label>

              {/* Judul Promo */}
              <label>
                Judul Promo Slider *
                <input
                  name="title"
                  maxLength="160"
                  required
                  defaultValue={promotionDraft.title}
                  placeholder="Contoh: Keindahan Nyata di Setiap Sudut Kamar."
                />
                <small>Judul utama yang menarik perhatian pembeli di beranda.</small>
              </label>

              {/* Deskripsi Promo */}
              <label className="ws-wide">
                Teks Cerita / Deskripsi Singkat
                <textarea
                  name="description"
                  rows="3"
                  maxLength="600"
                  defaultValue={promotionDraft.description}
                  placeholder="Pilihan sprei dan selimut berkualitas tinggi untuk kenyamanan istirahat maksimal Anda dan keluarga."
                />
                <small>Penjelasan singkat nilai dan keunggulan promo (maksimal 600 karakter).</small>
              </label>

              {/* Upload Gambar Promo Opsional */}
              <label className="ws-wide">
                Gambar Promo Khusus (Opsional)
                <div style={{ display: "flex", gap: "14px", alignItems: "flex-start", marginTop: "6px", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: "240px" }}>
                    <input
                      name="image"
                      defaultValue={promotionDraft.image || ""}
                      placeholder="Kosongkan untuk otomatis menggunakan gambar utama produk"
                      onChange={(e) => {
                        const val = e.target.value;
                        setPromotionDraft((curr) => ({ ...curr, image: val }));
                      }}
                    />
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      style={{ marginTop: "8px" }}
                      onChange={(event) =>
                        uploadAsset(event.target.files?.[0], event.currentTarget.previousElementSibling)
                      }
                    />
                    <small style={{ display: "block", marginTop: "4px" }}>
                      Pilih gambar editorial khusus promo (PNG, JPG, WebP maks 5 MB). Jika tidak diunggah, sistem otomatis menggunakan gambar utama produk.
                    </small>
                  </div>
                  {/* Pratinjau Gambar Promo */}
                  <div
                    style={{
                      width: "90px",
                      height: "105px",
                      borderRadius: "6px",
                      overflow: "hidden",
                      border: "1px solid var(--ks-line, #cbd5e1)",
                      background: "#f8faf9",
                      position: "relative",
                      flexShrink: 0,
                    }}
                  >
                    <img
                      src={
                        promotionDraft.image ||
                        draftProduct?.image ||
                        "/images/seprai/sprei-01.jpg"
                      }
                      alt="Pratinjau Promo"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        background: "rgba(0,0,0,0.65)",
                        color: "#ffffff",
                        fontSize: "9px",
                        textAlign: "center",
                        padding: "2px",
                      }}
                    >
                      {promotionDraft.image ? "Gambar Custom" : "Gambar Produk"}
                    </span>
                  </div>
                </div>
              </label>

              {/* Checkbox Status Aktif */}
              <label className="ws-checkbox ws-wide">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={promotionDraft.active}
                />{" "}
                Tampilkan di slider halaman beranda publik (Aktif)
              </label>

              {/* Tombol Simpan & Batal */}
              <div className="ws-wide ws-form-actions" style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
                <button className="ws-button primary" disabled={busy}>
                  <Check size={16} /> Simpan Promo
                </button>
                <button
                  className="ws-button"
                  type="button"
                  onClick={() => setPromotionDraft(null)}
                >
                  Batal
                </button>
              </div>
            </form>
          </section>
        )}

        {/* BAGIAN C: Daftar Promo Aktif & Tersimpan (Bagian Bawah) */}
        <section className="ws-panel">
          <div className="ws-panel-heading horizontal">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span className="ws-kicker" style={{ margin: 0 }}>LANGKAH 3 / PENGELOLAAN SLIDER</span>
              </div>
              <h2 style={{ fontSize: "18px", margin: "0 0 4px" }}>
                Daftar Promo Aktif & Tersimpan ({promotions.length})
              </h2>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--ws-muted)" }}>
                Seluruh promo yang telah dibuat dan terhubung ke produk database. Urutan slide pada slider beranda dapat diatur dengan tombol Naik/Turun.
              </p>
            </div>
            {!promotionDraft && activeProducts.length > 0 && (
              <button
                type="button"
                className="ws-button light"
                onClick={() => {
                  initPromoFromProduct(activeProducts[0]);
                }}
              >
                <Plus size={16} /> Tambah Promo Baru
              </button>
            )}
          </div>

          {/* Daftar Kartu Promo Slider */}
          {promotions.length ? (
            <div className="ws-promotion-grid">
              {promotions.map((promotion, idx) => {
                const product = products.find((item) => item.id === promotion.product_id);
                const base = Number(product?.price || promotion.product_price || 0);
                const sale =
                  promotion.promo_price && Number(promotion.promo_price) > 0
                    ? Number(promotion.promo_price)
                    : Math.max(
                        1000,
                        Math.round((base * (100 - Number(promotion.discount_percent))) / 100)
                      );
                return (
                  <article className="ws-promotion-card" key={promotion.id}>
                    <div className="ws-promotion-card-header">
                      <div className="ws-promo-header-left">
                        <span className="ws-promo-seq-badge">Slide #{idx + 1}</span>
                        <span className="ws-promo-discount-pill">-{promotion.discount_percent}%</span>
                      </div>
                      <span
                        className={`ws-promo-status-badge ${promotion.active ? "is-active" : "is-inactive"}`}
                      >
                        {promotion.active ? "Aktif di Slider" : "Disembunyikan"}
                      </span>
                    </div>

                    <div className="ws-promotion-card-media">
                      <img
                        src={
                          promotion.image ||
                          product?.image ||
                          promotion.product_image ||
                          "/images/seprai/sprei-01.jpg"
                        }
                        alt={promotion.title}
                      />
                      {promotion.image && (
                        <span className="ws-promo-custom-badge" title="Menggunakan gambar custom khusus editorial">
                          Gambar Custom
                        </span>
                      )}
                    </div>

                    <div className="ws-promotion-card-copy">
                      <div className="ws-promo-meta">
                        <span className="ws-promo-eyebrow">{promotion.eyebrow || "PROMO PILIHAN"}</span>
                      </div>

                      <h3 className="ws-promo-title" title={promotion.title}>{promotion.title}</h3>

                      <p className="ws-promo-desc">{promotion.description || "Tanpa deskripsi tambahan."}</p>

                      <div className="ws-promo-product-box">
                        <span className="ws-promo-product-label">Produk Terhubung:</span>
                        <strong className="ws-promo-product-name">{promotion.product_name || product?.name || "-"}</strong>
                      </div>

                      <div className="ws-promotion-prices">
                        <span className="ws-promo-price-sale">{money(sale)}</span>
                        {base > sale && <del className="ws-promo-price-base">{money(base)}</del>}
                      </div>

                      {/* Tombol Aksi Terstruktur & Responsif */}
                      <div className="ws-promo-actions">
                        {/* Baris 1: Naik, Turun, Tampilkan / Sembunyikan */}
                        <div className="ws-promo-actions-row ws-promo-actions-order">
                          <button
                            type="button"
                            className="ws-promo-btn ws-promo-btn-order"
                            disabled={idx === 0 || busy}
                            onClick={() => movePromotion(idx, -1)}
                            title="Geser slide ke urutan lebih awal"
                          >
                            <ChevronUp size={14} />
                            <span>Naik</span>
                          </button>
                          <button
                            type="button"
                            className="ws-promo-btn ws-promo-btn-order"
                            disabled={idx === promotions.length - 1 || busy}
                            onClick={() => movePromotion(idx, 1)}
                            title="Geser slide ke urutan berikutnya"
                          >
                            <ChevronDown size={14} />
                            <span>Turun</span>
                          </button>
                          <button
                            type="button"
                            className={`ws-promo-btn ws-promo-btn-toggle ${promotion.active ? "btn-hide" : "btn-show"}`}
                            disabled={busy}
                            onClick={() => handleTogglePromotionActive(promotion)}
                            title={promotion.active ? "Sembunyikan promo dari slider beranda" : "Tampilkan promo di slider beranda"}
                          >
                            {promotion.active ? (
                              <>
                                <EyeOff size={14} />
                                <span>Sembunyi</span>
                              </>
                            ) : (
                              <>
                                <Eye size={14} />
                                <span>Tampil</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Baris 2: Ubah, Hapus */}
                        <div className="ws-promo-actions-row ws-promo-actions-main">
                          <button
                            type="button"
                            className="ws-promo-btn ws-promo-btn-edit"
                            disabled={busy}
                            onClick={() => editPromoFromProduct(promotion)}
                            title="Ubah data promo slider ini"
                          >
                            <Edit2 size={14} />
                            <span>Ubah</span>
                          </button>
                          <button
                            type="button"
                            className="ws-promo-btn ws-promo-btn-delete"
                            disabled={busy}
                            onClick={() => deletePromotion(promotion.id, promotion.title)}
                            title="Hapus promo ini secara permanen"
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
          ) : (
            <div className="ws-empty">
              <h3>Belum ada promo aktif</h3>
              <p>Pilih produk dari katalog di atas dan klik tombol “Buat Promo” untuk membuat slide promo pertama.</p>
            </div>
          )}
        </section>
      </div>
    );
  };

  return (
    <Workspace
      user={user}
      config={config}
      admin
      items={items}
      active={tab}
      onSelect={select}
      onLogout={onLogout}
      title={titles[tab]}
      subtitle={
        tab === "overview"
          ? "Pantau aktivitas dan pekerjaan yang perlu ditindaklanjuti."
          : tab === "products"
            ? "Kelola informasi produk dan ketersediaan setiap varian."
            : tab === "orders"
              ? "Periksa pembayaran, siapkan pesanan, dan kelola pengiriman."
              : tab === "discounts"
                ? "Kelola penawaran promo produk dan slider sorotan beranda toko Anda."
                : "Periksa koneksi dan konfigurasi layanan toko."
      }
      actions={
        <div className="ws-actions">
          {tab === "products" && !edit && isAdmin && (
            <button
              className="ws-button primary"
              onClick={startCreateProduct}
            >
              <Plus size={17} />
              Tambah produk
            </button>
          )}
          {(edit || selected || selectedProduct) && (
            <button
              className="ws-button"
              onClick={goBack}
            >
              <ArrowLeft size={16} />
              Kembali
            </button>
          )}
        </div>
      }
    >
      <Notice>{error}</Notice>
      <Notice type="success">{message}</Notice>
      {loading ? (
        <div className="ws-loading" role="status">
          Memuat data toko…
        </div>
      ) : (
        <>
          {tab === "overview" && (
            <>
              <div className="ws-stats admin-stats-grid">
                {[
                  {
                    label: "Pembayaran diterima",
                    value: money(
                      orders
                        .filter((o) => o.payment_status === "PAID")
                        .reduce((n, o) => n + o.total, 0),
                    ),
                    icon: CheckCircle2,
                  },
                  {
                    label: "Perlu disiapkan",
                    value: orders.filter((o) => o.status === "Diproses").length,
                    icon: Package,
                  },
                  {
                    label: "Produk aktif",
                    value: products.filter((p) => p.active).length,
                    icon: Boxes,
                  },
                  {
                    label: "Belum dibayar",
                    value: pending.length,
                    icon: AlertCircle,
                  },
                ].map((s) => (
                  <div key={s.label} className="ws-stat">
                    <span>
                      <s.icon size={21} />
                    </span>
                    <div>
                      <p>{s.label}</p>
                      <b>{s.value}</b>
                    </div>
                  </div>
                ))}
              </div>
              {!isStaff && metrics && (
                <div className="ws-stats admin-stats-grid ws-finance-stats">
                  {[
                    ["Omset bersih transaksi", metrics.revenue],
                    ["Modal barang terjual", metrics.capital],
                    ["Pendapatan bersih", (metrics.revenue || 0) - (metrics.capital || 0)],
                  ].map(([label, value]) => (
                    <div className="ws-stat" key={label}>
                      <span>
                        <TrendingUp size={20} />
                      </span>
                      <div>
                        <p>{label}</p>
                        <b>{money(value)}</b>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="ws-panel">
                <div className="ws-panel-heading horizontal">
                  <div>
                    <h2>Pesanan terbaru</h2>
                    <p>Riwayat transaksi yang masuk ke toko.</p>
                  </div>
                  <button className="ws-link" onClick={() => select("orders")}>
                    Semua pesanan
                    <ArrowRight size={15} />
                  </button>
                </div>
                {orders.length ? (
                  orderTable(orders.slice(0, 6))
                ) : (
                  <Empty icon={Package} title="Belum ada pesanan">
                    Pesanan pelanggan akan tampil di sini.
                  </Empty>
                )}
              </div>
              <div className="ws-admin-bottom">
                <section className="ws-panel">
                  <div className="ws-panel-heading">
                    <h2>Prioritas persediaan</h2>
                    <p>
                      Produk dengan setidaknya satu varian kurang dari 5 unit.
                    </p>
                  </div>
                  {products.filter(
                    (p) => p.active && p.variants.some((v) => v.stock < 5),
                  ).length ? (
                    products
                      .filter(
                        (p) => p.active && p.variants.some((v) => v.stock < 5),
                      )
                      .slice(0, 5)
                      .map((p) => (
                        <button
                          className="ws-inventory-alert"
                          key={p.id}
                          onClick={() => {
                            if (isAdmin) loadProductToEdit(p);
                            else navigate(`#admin/products/view/${p.id}`);
                          }}
                        >
                          <span>
                            {p.name}
                            <small>{p.sku}</small>
                          </span>
                          <Status tone="warning">
                            {p.variants.filter((v) => v.stock < 5).length}{" "}
                            varian menipis
                          </Status>
                        </button>
                      ))
                  ) : (
                    <div className="ws-inline-empty">
                      <CheckCircle2 size={20} />
                      Persediaan saat ini mencukupi.
                    </div>
                  )}
                </section>
                {isAdmin && <section className="ws-panel">
                  <div className="ws-panel-heading">
                    <h2>Peran administrator</h2>
                    <p>Ruang ini khusus untuk mengelola operasional.</p>
                  </div>
                  <p className="ws-body-copy">
                    Akun admin tidak memiliki keranjang, favorit, atau checkout.
                    Untuk mencoba belanja, keluar lalu masuk dengan akun
                    pelanggan.
                  </p>
                  <button
                    className="ws-link"
                    onClick={() => select("settings")}
                  >
                    Periksa status layanan
                    <ArrowRight size={16} />
                  </button>
                </section>}
              </div>
            </>
          )}
          {tab === "products" && !edit && !selectedProduct && (
            <section className="ws-panel">
              <div className="ws-toolbar">
                <label className="ws-search">
                  <Search size={18} />
                  <input
                    aria-label="Cari produk admin"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari nama, SKU, atau departemen…"
                  />
                </label>
                <select
                  aria-label="Status publikasi"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">Semua produk</option>
                  <option value="active">Aktif</option>
                  <option value="archived">Disembunyikan</option>
                </select>
                <span className="ws-muted">{productRows.length} produk</span>
              </div>
              {productRows.length ? (
                <div className="ws-table-scroll">
                  <table className="ws-table">
                    <thead>
                      <tr>
                        <th>Produk</th>
                        <th>Harga</th>
                        <th>Persediaan</th>
                        <th>Status</th>
                        <th>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productRows.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <div className="ws-product-cell">
                              <img src={p.image} alt={p.name} />
                              <div>
                                <b>{p.name}</b>
                                <small>
                                  {p.sku} · {categories.find((category)=>category.id===p.category)?.name || p.category}
                                </small>
                              </div>
                            </div>
                          </td>
                          <td>{money(p.price)}</td>
                          <td>
                            <b>{p.stock}</b> unit
                            <small>{p.variants.length} varian</small>
                          </td>
                          <td>
                            <Status tone={p.active ? "success" : "neutral"}>
                              {p.active ? "Tampil" : "Disembunyikan"}
                            </Status>
                          </td>
                          <td>
                            <div className="ws-row-actions">
                              <button
                                className="ws-link"
                                onClick={() => navigate(`#admin/products/view/${p.id}`)}
                              >
                                Detail
                              </button>
                              {isAdmin && <button
                                className="ws-link"
                                onClick={() => loadProductToEdit(p)}
                              >Edit</button>}
                              {isAdmin && <button
                                className="ws-link secondary-link"
                                disabled={busy}
                                onClick={() =>
                                  perform(
                                    () =>
                                      api("/admin/products/" + p.id, {
                                        method: "PATCH",
                                        body: { active: !p.active },
                                      }),
                                    p.active
                                      ? "Produk disembunyikan dari katalog."
                                      : "Produk diaktifkan.",
                                  )
                                }
                              >
                                {p.active ? "Sembunyikan" : "Tampilkan"}
                              </button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty icon={Boxes} title="Produk tidak ditemukan">
                  Coba kata pencarian atau status lain.
                </Empty>
              )}
            </section>
          )}
          {tab === "products" && selectedProduct && (
            <section className="ws-panel ws-product-detail">
              <div className="ws-product-detail-head"><img src={selectedProduct.image} alt={selectedProduct.name}/><div><p className="ws-kicker">{selectedProduct.sku} · {selectedProduct.category}</p><h2>{selectedProduct.name}</h2><p>{selectedProduct.description}</p><p>Motif: {selectedProduct.motif || "—"} · Harga: {money(selectedProduct.price)} · Status: {selectedProduct.active ? "Tampil" : "Disembunyikan"}</p></div></div>
              <div className="ws-stats admin-stats-grid">{[["Terjual (lunas)",selectedProduct.soldUnits],["Nilai penjualan",money(selectedProduct.soldRevenue)],["Modal terjual",money(selectedProduct.soldCost)],["Margin kotor",money(selectedProduct.grossProfit)],["Stok tersedia",selectedProduct.stock]].map(([label,value])=><div className="ws-stat" key={label}><div><p>{label}</p><b>{value}</b></div></div>)}</div>
              <h3>Rincian variasi dan stok</h3><div className="ws-table-scroll"><table className="ws-table"><thead><tr><th>Ukuran</th><th>{selectedProduct.variation_label || "Variasi"}</th><th>Stok</th><th>Gambar</th></tr></thead><tbody>{selectedProduct.variants.map((variant)=><tr key={variant.size+variant.color}><td>{dimensionLabel(variant.size)}</td><td>{colorLabel(variant.color)}</td><td>{variant.stock}</td><td>{variant.image_url ? <img className="ws-variant-thumb" src={variant.image_url} alt=""/> : "Gambar utama"}</td></tr>)}</tbody></table></div>
            </section>
          )}
          {tab === "products" && edit && (
            <section className="ws-panel ws-form-panel">
              <form
                className="ws-form-grid"
                key={edit.id || "new"}
                onSubmit={save}
              >
                <div className="ws-wide ws-panel-heading">
                  <h2>Informasi produk</h2>
                  <p>
                    Lengkapi identitas, harga, dan deskripsi sebelum menyimpan.
                  </p>
                </div>
                <label>
                  Nama produk
                  <input
                    name="name"
                    defaultValue={edit.name}
                    required
                    minLength={2}
                    maxLength={200}
                  />
                </label>
                <label>
                  SKU
                  <input
                    name="sku"
                    defaultValue={edit.sku || ""}
                    required
                    pattern="[A-Za-z0-9-]{2,40}"
                    placeholder="LJ-NEW-001"
                  />
                </label>
                <label>
                  Kategori Utama (Navbar)
                  <select
                    name="category"
                    value={formCategory}
                    onChange={(e) => {
                      const nextCat = e.target.value;
                      setFormCategory(nextCat);
                      const subs = categories.filter((c) => (c.parent_id || c.parentId) === nextCat && c.active);
                      setFormSubcategory(subs[0]?.id || "");
                    }}
                    required
                  >
                    {categories.filter((c) => !c.parent_id && !c.parentId && c.active).map(({ id, name }) => (
                      <option key={id} value={id}>{name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Sub-Kategori
                  <select
                    name="subcategory"
                    value={formSubcategory}
                    onChange={(e) => setFormSubcategory(e.target.value)}
                    required
                  >
                    <option value="">Pilih Sub-Kategori</option>
                    {categories
                      .filter((c) => (c.parent_id || c.parentId) === formCategory && c.active)
                      .map(({ id, name }) => (
                        <option key={id} value={id}>{name}</option>
                      ))}
                  </select>
                  {categories.filter((c) => (c.parent_id || c.parentId) === formCategory && c.active).length === 0 && (
                    <small style={{ color: "var(--danger, #dc2626)", display: "block", marginTop: 4 }}>
                      Kategori ini belum memiliki sub-kategori aktif. Buat sub-kategori terlebih dahulu di tab &quot;Kategori navbar&quot;.
                    </small>
                  )}
                </label>
                <label>
                  Harga jual (Rp) *
                  <RupiahInput
                    name="price"
                    min={1000}
                    max={10000000}
                    required
                    defaultValue={edit.price}
                    placeholder="150.000"
                  />
                </label>
                <label className="ws-wide">
                  Gambar produk
                  <input
                    name="image"
                    required
                    defaultValue={edit.image || ""}
                    placeholder="Alamat gambar produk"
                  />
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadAsset(event.target.files?.[0], event.currentTarget.previousElementSibling)} />
                  <small>Unggah PNG, JPG, atau WebP (maksimal 5 MB), atau isi URL HTTPS.</small>
                </label>
                <label>Nama pilihan variasi<input name="variationLabel" defaultValue={edit.variationLabel || "Warna"} placeholder="Contoh: Warna, Motif, Bahan" required /></label>
                <label>
                  Modal per produk (Rp)
                  <RupiahInput
                    name="costPrice"
                    min={0}
                    max={10000000}
                    defaultValue={edit.costPrice || 0}
                    placeholder="100.000"
                  />
                  <small>Hanya dipakai untuk laporan pimpinan dan admin.</small>
                </label>
                <label>Berat kemasan (gram)<input name="weightGrams" type="number" min="1" max="500000" defaultValue={edit.weight_grams || 1000} /><small>Dipakai untuk menghitung tarif ekspedisi.</small></label>
                <label className="ws-wide">
                  Deskripsi
                  <textarea
                    name="description"
                    minLength={10}
                    maxLength={2000}
                    required
                    defaultValue={edit.description || ""}
                  />
                </label>
                <label className="ws-checkbox ws-wide">
                  <input
                    type="checkbox"
                    name="isNew"
                    defaultChecked={edit.isNew}
                  />
                  Tandai sebagai produk baru
                </label>
                <div className="ws-wide ws-dimension-editor">
                  <div className="ws-panel-heading">
                    <h2>Ukuran & Stok Variasi</h2>
                    <p>
                      Setiap variasi dikelola sebagai satu paket data yang mencakup nama variasi (warna/motif), ukuran, dan stok tersedia.
                    </p>
                  </div>

                  {/* Mode Ukuran Switcher (Requirements 4 & 5) */}
                  <div className="ws-size-mode-selector">
                    <span className="ws-size-mode-label">Pilih Mode Ukuran Produk:</span>
                    <div className="ws-size-mode-tabs" role="radiogroup">
                      <button
                        type="button"
                        className={"ws-mode-tab " + (sizeMode === "dimensions" ? "active" : "")}
                        onClick={() => handleSwitchSizeMode("dimensions")}
                      >
                        <Ruler size={16} />
                        <span>Dimensi Fisik (Panjang × Lebar × Tinggi)</span>
                      </button>
                      <button
                        type="button"
                        className={"ws-mode-tab " + (sizeMode === "text" ? "active" : "")}
                        onClick={() => handleSwitchSizeMode("text")}
                      >
                        <Tag size={16} />
                        <span>Ukuran Teks Bebas (S, M, L, XL, All Size)</span>
                      </button>
                    </div>
                  </div>

                  {/* Preset Ukuran Cepat */}
                  <div className="ws-variant-presets-bar">
                    <span>Preset Cepat:</span>
                    <div className="ws-preset-btn-group">
                      {sizeMode === "dimensions" ? (
                        <>
                          <button
                            type="button"
                            className="ws-chip-btn"
                            onClick={() => applyPreset("bedding-complete")}
                          >
                            Ukuran Seprai Lengkap (100–200 cm)
                          </button>
                          <button
                            type="button"
                            className="ws-chip-btn"
                            onClick={() => applyPreset("bedding-queen")}
                          >
                            Standar Queen (160×200×30)
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="ws-chip-btn"
                            onClick={() => applyPreset("fashion-standard")}
                          >
                            Ukuran Fashion (S s/d XXL)
                          </button>
                          <button
                            type="button"
                            className="ws-chip-btn"
                            onClick={() => applyPreset("all-size")}
                          >
                            All Size
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Daftar Paket Variasi (Requirements 2, 3, 5, 6, 7) */}
                  <div className="ws-variant-packages-list">
                    {sizeRows.map((row, index) => (
                      <div className="ws-variant-package-card" key={row.id}>
                        <div className="ws-variant-package-header">
                          <span className="ws-variant-package-badge">
                            Paket Variasi #{index + 1}
                            {row.variation ? ` · ${row.variation}` : ""}
                            {sizeMode === "dimensions" && row.length && row.width && row.height
                              ? ` (${row.length}×${row.width}×${row.height} cm)`
                              : row.size ? ` (${row.size})` : ""}
                          </span>
                          <button
                            type="button"
                            className="ws-button-danger"
                            disabled={sizeRows.length <= 1}
                            title={sizeRows.length <= 1 ? "Minimal 1 variasi produk wajib tersedia" : "Hapus variasi ini"}
                            onClick={() => setSizeRows((rows) => rows.filter((r) => r.id !== row.id))}
                          >
                            <Trash2 size={14} />
                            <span>Hapus Variasi</span>
                          </button>
                        </div>

                        <div className="ws-variant-package-grid">
                          {/* Nama Variasi (Warna / Motif) */}
                          <label>
                            {edit.variationLabel ? `${edit.variationLabel} (Warna / Motif)` : "Warna / Motif"}
                            <input
                              type="text"
                              value={row.variation}
                              onChange={(e) => updateVariantField(row.id, "variation", e.target.value)}
                              placeholder="Contoh: Sage Green, Floral Daisy, Putih Polos"
                              required
                            />
                          </label>

                          {/* Ukuran (Requirements 3, 4, 5) */}
                          {sizeMode === "dimensions" ? (
                            <div className="ws-dimension-3col">
                              <label>
                                Panjang (cm)
                                <input
                                  type="number"
                                  min="1"
                                  max="500"
                                  value={row.length}
                                  onChange={(e) => updateVariantField(row.id, "length", e.target.value)}
                                  placeholder="160"
                                  required
                                />
                              </label>
                              <label>
                                Lebar (cm)
                                <input
                                  type="number"
                                  min="1"
                                  max="500"
                                  value={row.width}
                                  onChange={(e) => updateVariantField(row.id, "width", e.target.value)}
                                  placeholder="200"
                                  required
                                />
                              </label>
                              <label>
                                Tinggi (cm)
                                <input
                                  type="number"
                                  min="1"
                                  max="500"
                                  value={row.height}
                                  onChange={(e) => updateVariantField(row.id, "height", e.target.value)}
                                  placeholder="30"
                                  required
                                />
                              </label>
                            </div>
                          ) : (
                            <label>
                              Ukuran Teks Bebas
                              <input
                                type="text"
                                value={row.size}
                                onChange={(e) => updateVariantField(row.id, "size", e.target.value)}
                                placeholder="Contoh: S, M, L, XL, XXL, All Size"
                                required
                              />
                            </label>
                          )}

                          {/* Stok */}
                          <label>
                            Stok Tersedia
                            <input
                              type="number"
                              min="0"
                              max="100000"
                              value={row.stock}
                              onChange={(e) => updateVariantField(row.id, "stock", e.target.value)}
                              placeholder="0"
                              required
                            />
                          </label>

                          {/* Gambar Variasi (Opsional) */}
                          <div className="ws-variant-image-field">
                            <label>
                              Gambar Variasi (Opsional)
                              <div className="ws-variant-image-controls">
                                {row.imageUrl && (
                                  <img
                                    src={row.imageUrl}
                                    alt={row.variation || "Preview"}
                                    className="ws-variant-thumb-preview"
                                  />
                                )}
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp"
                                  onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (!file) return;
                                    if (file.size > 5000000) {
                                      setError("Ukuran gambar variasi maksimal 5 MB.");
                                      return;
                                    }
                                    const reader = new FileReader();
                                    reader.onload = async () => {
                                      try {
                                        const { url } = await api("/admin/uploads", {
                                          method: "POST",
                                          body: { data: reader.result },
                                        });
                                        updateVariantField(row.id, "imageUrl", url);
                                        setMessage("Gambar variasi berhasil diunggah.");
                                      } catch (err) {
                                        setError(err.message);
                                      }
                                    };
                                    reader.readAsDataURL(file);
                                  }}
                                />
                              </div>
                            </label>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Tambah Variasi Button */}
                  <button
                    type="button"
                    className="ws-button"
                    onClick={addVariation}
                    style={{ marginTop: "10px" }}
                  >
                    <Plus size={15} /> Tambah Variasi
                  </button>
                </div>
                <div className="ws-wide ws-form-actions">
                  <button className="ws-button primary" disabled={busy}>
                    {busy ? "Menyimpan…" : "Simpan produk"}
                  </button>
                  <button
                    type="button"
                    className="ws-button"
                    onClick={goBack}
                  >
                    Batal
                  </button>
                </div>
              </form>
            </section>
          )}
          {tab === "orders" && !selected && (
            <section className="ws-panel">
              <div className="ws-toolbar">
                <label className="ws-search">
                  <Search size={18} />
                  <input
                    aria-label="Cari pesanan admin"
                    placeholder="Nomor pesanan atau pelanggan…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Filter status pesanan"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">Semua status</option>
                  {[
                    "Menunggu pembayaran",
                    "Diproses",
                    "Dikirim",
                    "Selesai",
                    "Dibatalkan",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              {orderRows.length ? (
                orderTable(orderRows)
              ) : (
                <Empty icon={Package} title="Tidak ada pesanan">
                  Tidak ada hasil untuk filter ini.
                </Empty>
              )}
            </section>
          )}
          {tab === "orders" && selected && (
            <section className="ws-panel ws-admin-order">
              <div className="ws-order-heading">
                <div>
                  <p className="ws-kicker">
                    #{selected.id.slice(-8).toUpperCase()}
                  </p>
                  <h2>{selected.address.name}</h2>
                  <p>{new Date(selected.createdAt).toLocaleString("id-ID")}</p>
                </div>
                <Status
                  tone={
                    selected.payment_status === "PAID" ? "success" : "warning"
                  }
                >
                  {selected.status}
                </Status>
              </div>
              <div className="ws-detail-columns">
                <div>
                  <h3>Penerima & alamat</h3>
                  <p>
                    {selected.address.name}
                    <br />
                    {selected.address.phone}
                    <br />
                    {selected.address.email}
                    <br />
                    {selected.address.street}, {selected.address.city}{" "}
                    {selected.address.postal}
                  </p>
                </div>
                <div>
                  <h3>Pembayaran</h3>
                  <p>
                    {paymentLabel[selected.payment_status]}
                    <br />
                    Metode pengiriman: {selected.shipping}
                  </p>
                  <small className="ws-mono">
                    {selected.invoice_id || "Invoice belum tersedia"}
                  </small>
                </div>
              </div>
              <div className="ws-table-scroll">
                <table className="ws-table">
                  <thead>
                    <tr>
                      <th>Produk</th>
                      <th>Varian</th>
                      <th>Jumlah</th>
                      <th>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.items.map((i, j) => (
                      <tr key={j}>
                        <td>{i.name}</td>
                        <td>
                          {i.size} ·{" "}
                          <i
                            className="color-dot"
                            style={{ background: i.color }}
                          />
                        </td>
                        <td>{i.quantity}</td>
                        <td>{money(i.quantity * i.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="ws-admin-totals">
                <p>
                  Subtotal <b>{money(selected.subtotal)}</b>
                </p>
                <p>
                  Diskon <b>−{money(selected.discount)}</b>
                </p>
                <p>
                  Ongkir <b>{money(selected.delivery)}</b>
                </p>
                <p>
                  Total <strong>{money(selected.total)}</strong>
                </p>
              </div>
              {selected.tracking_number && <p>Nomor resi: <b>{selected.tracking_number}</b></p>}
              {selected.status === "Diproses" && <label>Nomor resi untuk notifikasi<input value={trackingNumber} onChange={(event)=>setTrackingNumber(event.target.value)} maxLength="100" placeholder="Masukkan nomor resi"/></label>}
              <div className="ws-form-actions">
                {selected.status === "Menunggu pembayaran" && (
                  <>
                    <button
                      className="ws-button primary"
                      disabled={busy}
                      onClick={() =>
                        perform(
                          () =>
                            api("/admin/orders/" + selected.id + "/payment", {
                              method: "POST",
                            }),
                          "Pembayaran telah diperiksa.",
                        )
                      }
                    >
                      Periksa pembayaran
                    </button>
                    <button
                      className="ws-button"
                      disabled={busy}
                      onClick={() =>
                        perform(
                          () =>
                            api("/admin/orders/" + selected.id, {
                              method: "PATCH",
                              body: { status: "Dibatalkan" },
                            }),
                          "Pesanan dibatalkan.",
                        )
                      }
                    >
                      Batalkan pesanan
                    </button>
                  </>
                )}
                {["Diproses", "Dikirim"].includes(selected.status) && (
                  <button
                    className="ws-button primary"
                    disabled={busy}
                    onClick={() =>
                      perform(
                        () =>
                          api("/admin/orders/" + selected.id, {
                            method: "PATCH",
                            body: {
                              status:
                                selected.status === "Diproses"
                                  ? "Dikirim"
                                  : "Selesai",
                              trackingNumber,
                            },
                          }),
                        "Status pesanan diperbarui.",
                      )
                    }
                  >
                    {selected.status === "Diproses"
                      ? "Tandai dikirim & kirim notifikasi"
                      : "Tandai selesai"}
                  </button>
                )}
              </div>
              <small className="ws-mono ws-muted">
                Referensi: {selected.id}
              </small>
            </section>
          )}
          {tab === "categories" && (
            <div className="ws-cat-container">
              <div className="ws-panel-heading">
                <h2>Kelola Kategori &amp; Navigasi Toko</h2>
                <p>
                  Kelola kategori utama yang tampil di navbar publik toko dan sub-kategori di bawahnya.
                  Setiap penambahan, perubahan nama, status aktif, dan penghapusan langsung tersimpan secara permanen ke database toko.
                </p>
              </div>

              {/* Form Tambah Kategori Utama Baru */}
              <form className="ws-cat-add-bar" onSubmit={handleAddMainCategory}>
                <Tag size={20} style={{ color: "var(--ks-teal, #1b4946)", flexShrink: 0 }} />
                <input
                  value={mainCategoryDraft}
                  onChange={(e) => setMainCategoryDraft(e.target.value)}
                  placeholder="Nama Kategori Utama baru (contoh: Perlengkapan Bayi, Aksesoris Rumah)..."
                  disabled={busy}
                  required
                />
                <button type="submit" className="ws-button primary" disabled={busy || !mainCategoryDraft.trim()}>
                  <Plus size={16} /> Tambah Kategori Utama
                </button>
              </form>

              {/* Tree Kategori Utama & Sub-Kategori */}
              <div className="ws-cat-tree">
                {categories
                  .filter((c) => !c.parentId && !c.parent_id)
                  .map((mainCat, mainIdx, mainArr) => {
                    const subs = categories.filter((c) => (c.parentId || c.parent_id) === mainCat.id);
                    const isEditingThis = editingCatId === mainCat.id;

                    return (
                      <div className="ws-cat-card" key={mainCat.id}>
                        <div className="ws-cat-card-header">
                          <div className="ws-cat-card-title-group">
                            <div className="ws-cat-order-btns">
                              <button
                                type="button"
                                className="ws-cat-order-btn"
                                title="Geser ke atas"
                                disabled={busy || mainIdx === 0}
                                onClick={() => handleMoveCategory(mainCat, -1)}
                              >
                                <ChevronUp size={14} />
                              </button>
                              <button
                                type="button"
                                className="ws-cat-order-btn"
                                title="Geser ke bawah"
                                disabled={busy || mainIdx === mainArr.length - 1}
                                onClick={() => handleMoveCategory(mainCat, 1)}
                              >
                                <ChevronDown size={14} />
                              </button>
                            </div>
                            <span className="ws-cat-badge-main">Utama</span>
                            {isEditingThis ? (
                              <form
                                className="ws-cat-inline-edit"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  handleSaveCategoryName(mainCat.id);
                                }}
                              >
                                <input
                                  autoFocus
                                  value={editingCatName}
                                  onChange={(e) => setEditingCatName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape") setEditingCatId(null);
                                  }}
                                />
                                <button type="submit" className="ws-button small primary" disabled={busy}>
                                  Simpan
                                </button>
                                <button
                                  type="button"
                                  className="ws-button small"
                                  disabled={busy}
                                  onClick={() => setEditingCatId(null)}
                                >
                                  Batal
                                </button>
                              </form>
                            ) : (
                              <>
                                <span className="ws-cat-title">{mainCat.name}</span>
                                <span className="ws-cat-badge-id">{mainCat.id}</span>
                                <span className="ws-cat-sub-count">({subs.length} sub-kategori)</span>
                              </>
                            )}
                          </div>

                          <div className="ws-cat-card-actions">
                            <label className="ws-cat-toggle" title="Tampilkan atau sembunyikan kategori ini dari navbar publik">
                              <input
                                type="checkbox"
                                checked={Boolean(mainCat.active)}
                                disabled={busy}
                                onChange={() => handleToggleCategoryActive(mainCat)}
                              />
                              <span>{mainCat.active ? "Aktif di Navbar" : "Nonaktif"}</span>
                            </label>

                            {!isEditingThis && (
                              <button
                                type="button"
                                className="ws-cat-btn-icon ws-cat-btn-edit"
                                title="Ubah nama kategori utama"
                                disabled={busy}
                                onClick={() => {
                                  setEditingCatId(mainCat.id);
                                  setEditingCatName(mainCat.name);
                                }}
                              >
                                <Edit2 size={14} /> Ubah
                              </button>
                            )}

                            <button
                              type="button"
                              className="ws-cat-btn-icon ws-cat-btn-delete"
                              title="Hapus kategori utama ini"
                              disabled={busy}
                              onClick={() => handleDeleteCategory(mainCat)}
                            >
                              <Trash2 size={14} /> Hapus
                            </button>
                          </div>
                        </div>

                        <div className="ws-cat-card-body">
                          {subs.length === 0 ? (
                            <div className="ws-cat-empty-subs">
                              Belum ada sub-kategori untuk kategori ini. Tambahkan sub-kategori pertama melalui form di bawah.
                            </div>
                          ) : (
                            <div className="ws-subcat-list">
                              {subs.map((sub, subIdx) => {
                                const isEditingSub = editingCatId === sub.id;
                                return (
                                  <div className="ws-subcat-row" key={sub.id}>
                                    <div className="ws-subcat-left">
                                      <div className="ws-cat-order-btns">
                                        <button
                                          type="button"
                                          className="ws-cat-order-btn"
                                          title="Geser ke atas"
                                          disabled={busy || subIdx === 0}
                                          onClick={() => handleMoveCategory(sub, -1)}
                                        >
                                          <ChevronUp size={13} />
                                        </button>
                                        <button
                                          type="button"
                                          className="ws-cat-order-btn"
                                          title="Geser ke bawah"
                                          disabled={busy || subIdx === subs.length - 1}
                                          onClick={() => handleMoveCategory(sub, 1)}
                                        >
                                          <ChevronDown size={13} />
                                        </button>
                                      </div>
                                      {isEditingSub ? (
                                        <form
                                          className="ws-cat-inline-edit"
                                          onSubmit={(e) => {
                                            e.preventDefault();
                                            handleSaveCategoryName(sub.id);
                                          }}
                                        >
                                          <input
                                            autoFocus
                                            value={editingCatName}
                                            onChange={(e) => setEditingCatName(e.target.value)}
                                            onKeyDown={(e) => {
                                              if (e.key === "Escape") setEditingCatId(null);
                                            }}
                                          />
                                          <button type="submit" className="ws-button small primary" disabled={busy}>
                                            Simpan
                                          </button>
                                          <button
                                            type="button"
                                            className="ws-button small"
                                            disabled={busy}
                                            onClick={() => setEditingCatId(null)}
                                          >
                                            Batal
                                          </button>
                                        </form>
                                      ) : (
                                        <>
                                          <span className="ws-subcat-name">{sub.name}</span>
                                          <span className="ws-cat-badge-id">{sub.id}</span>
                                        </>
                                      )}
                                    </div>

                                    <div className="ws-subcat-actions">
                                      <label className="ws-cat-toggle" title="Tampilkan atau sembunyikan subkategori ini di filter toko">
                                        <input
                                          type="checkbox"
                                          checked={Boolean(sub.active)}
                                          disabled={busy}
                                          onChange={() => handleToggleCategoryActive(sub)}
                                        />
                                        <span>{sub.active ? "Aktif di Filter" : "Nonaktif"}</span>
                                      </label>

                                      {!isEditingSub && (
                                        <button
                                          type="button"
                                          className="ws-cat-btn-icon ws-cat-btn-edit"
                                          title="Ubah nama sub-kategori"
                                          disabled={busy}
                                          onClick={() => {
                                            setEditingCatId(sub.id);
                                            setEditingCatName(sub.name);
                                          }}
                                        >
                                          <Edit2 size={13} /> Ubah
                                        </button>
                                      )}

                                      <button
                                        type="button"
                                        className="ws-cat-btn-icon ws-cat-btn-delete"
                                        title="Hapus sub-kategori"
                                        disabled={busy}
                                        onClick={() => handleDeleteCategory(sub)}
                                      >
                                        <Trash2 size={13} /> Hapus
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Inline form tambah sub-kategori baru */}
                          <form
                            className="ws-subcat-add-row"
                            onSubmit={(e) => {
                              e.preventDefault();
                              handleAddSubcategory(mainCat.id);
                            }}
                          >
                            <Plus size={16} style={{ color: "#64748b", flexShrink: 0 }} />
                            <input
                              value={subDrafts[mainCat.id] || ""}
                              onChange={(e) =>
                                setSubDrafts((prev) => ({ ...prev, [mainCat.id]: e.target.value }))
                              }
                              placeholder={`Tambah sub-kategori baru untuk ${mainCat.name}...`}
                              disabled={busy}
                            />
                            <button
                              type="submit"
                              className="ws-button small"
                              disabled={busy || !(subDrafts[mainCat.id] || "").trim()}
                            >
                              + Tambah Sub-Kategori
                            </button>
                          </form>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
          {tab === "discounts" && renderDiscountsPage()}
          {tab === "templates" && <section className="ws-panel ws-form-panel"><div className="ws-panel-heading"><h2>Pesan WhatsApp otomatis</h2><p>Gunakan placeholder dalam tanda kurung siku agar sistem menggantinya dengan data pesanan.</p><small>[nama] · [nomor_pesanan] · [total] · [nomor_resi] · [kurir] · [toko]</small></div>{settings?.waTemplates && <form className="ws-form-grid" onSubmit={(event)=>{event.preventDefault();const form=event.currentTarget;const fields=Object.fromEntries(new FormData(form));saveStoreSettings({settings:{waTemplates:fields}},"Template WhatsApp disimpan.");}}>{[["purchased","Pembayaran berhasil"],["processing","Pesanan diproses"],["shipped","Pesanan dikirim"],["delivered","Pesanan telah sampai"]].map(([key,label])=><label className="ws-wide" key={key}>{label}<textarea name={key} rows="3" defaultValue={settings.waTemplates[key]||""}/></label>)}<div className="ws-wide ws-form-actions"><button className="ws-button primary">Simpan template</button></div></form>}</section>}
          {tab === "team" && <><section className="ws-panel ws-form-panel"><div className="ws-panel-heading"><h2>Tambah pimpinan atau karyawan</h2><p>Pimpinan melihat laporan kinerja; karyawan fokus pada pemantauan dan pemrosesan pesanan.</p></div><form className="ws-inline-expense" onSubmit={(event)=>{event.preventDefault();const form=event.currentTarget;const f=Object.fromEntries(new FormData(form));perform(()=>api("/admin/users",{method:"POST",body:f}),"Akun tim berhasil dibuat.").then((ok)=>ok&&form.reset());}}><label>Nama<input name="name" required/></label><label>Email masuk<input name="email" type="email" required/></label><label>WhatsApp<input name="phone"/></label><label>Kata sandi sementara<input name="password" minLength="12" required/></label><label>Peran<select name="role"><option value="staff">Karyawan</option><option value="manager">Pimpinan</option></select></label><button className="ws-button primary">Buat akun</button></form></section><section className="ws-panel"><div className="ws-panel-heading"><h2>Akun terdaftar</h2></div><div className="ws-table-scroll"><table className="ws-table"><thead><tr><th>Nama</th><th>Email</th><th>Nomor</th><th>Peran</th></tr></thead><tbody>{team.map((member)=><tr key={member.id}><td>{member.name}</td><td>{member.email}</td><td>{member.phone}</td><td><select aria-label={`Peran ${member.name}`} disabled={member.id===user.id} value={member.role} onChange={(event)=>perform(()=>api(`/admin/users/${member.id}/role`,{method:"PATCH",body:{role:event.target.value}}),"Peran akun diperbarui.")}><option value="customer">Pelanggan</option><option value="staff">Karyawan</option><option value="manager">Pimpinan</option><option value="admin">Admin</option></select></td></tr>)}</tbody></table></div></section></>}
          {tab === "settings" && (
            <>
              {/* Navigasi Submenu Pengaturan Toko */}
              <nav className="ws-settings-subnav" aria-label="Kategori Pengaturan Toko">
                {[
                  { id: "identity", label: "Identitas Toko", icon: Building2 },
                  { id: "storefront", label: "Tampilan Beranda", icon: Layout },
                  { id: "shipping", label: "Pengiriman & Ekspedisi", icon: Truck },
                  { id: "payments", label: "Metode Pembayaran", icon: CreditCard },
                  { id: "integrations", label: "Status Integrasi", icon: Activity },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={"ws-settings-tab " + (settingsSubmenu === id ? "active" : "")}
                    onClick={() => selectSettingsSubmenu(id)}
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                  </button>
                ))}
              </nav>

              {/* Submenu 1: Identitas Toko */}
              {settingsSubmenu === "identity" && (
                <section className="ws-panel ws-form-panel">
                  <div className="ws-panel-heading">
                    <h2>Identitas & Informasi Toko</h2>
                    <p>Kelola nama merek, logo, email kontak, alamat resmi, dan pengumuman baris atas etalase toko.</p>
                  </div>
                  <form
                    className="ws-form-grid"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const f = Object.fromEntries(new FormData(event.currentTarget));
                      saveStoreSettings(
                        {
                          settings: {
                            brand: String(f.brand || "").trim(),
                            logo: String(f.logo || "").trim(),
                            contactEmail: String(f.contactEmail || "").trim(),
                            storeAddress: String(f.storeAddress || "").trim(),
                            announcementText: String(f.announcementText || "").trim(),
                          },
                        },
                        "Identitas toko berhasil disimpan."
                      );
                    }}
                  >
                    <label>
                      Nama Toko / Merek
                      <input name="brand" defaultValue={settings?.brand || ""} required />
                    </label>
                    <label>
                      Email Kontak Toko
                      <input name="contactEmail" type="email" defaultValue={settings?.contactEmail || ""} required />
                    </label>
                    <label className="ws-wide">
                      Logo Toko (URL atau Berkas)
                      <input name="logo" defaultValue={settings?.logo || ""} placeholder="Contoh: /brand/logo.png atau URL HTTPS" />
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) => uploadAsset(event.target.files?.[0], event.currentTarget.previousElementSibling)}
                      />
                      <small>Format PNG, JPG, atau WebP maksimal 5 MB dengan latar belakang transparan.</small>
                    </label>
                    <label className="ws-wide">
                      Pengumuman Baris Atas (Announcement Bar)
                      <input
                        name="announcementText"
                        defaultValue={settings?.announcementText || ""}
                        placeholder="Contoh: Koleksi tekstil & busana berkualitas untuk kenyamanan ruang hidup Anda."
                      />
                      <small>Teks ini tampil di baris teratas header publik etalase.</small>
                    </label>
                    <label className="ws-wide">
                      Alamat Fisik Toko
                      <textarea
                        name="storeAddress"
                        rows="3"
                        defaultValue={settings?.storeAddress || ""}
                        placeholder="Alamat kantor / gudang toko untuk faktur dan informasi kontak"
                      />
                    </label>
                    <div className="ws-wide ws-form-actions">
                      <button className="ws-button primary" disabled={busy}>
                        Simpan Identitas Toko
                      </button>
                    </div>
                  </form>
                </section>
              )}

              {/* Submenu 2: Tampilan Beranda */}
              {settingsSubmenu === "storefront" && (
                <>
                  {/* Modul 1: Banner Hero Beranda */}
                  <section className="ws-panel ws-form-panel ws-storefront-module">
                    <div className="ws-panel-heading">
                      <h2>Banner Hero Beranda</h2>
                      <p>Kelola gambar latar utama, tagline pembuka, judul utama, dan teks deskripsi singkat pada banner beranda.</p>
                    </div>
                    <form
                      className="ws-form-grid"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const f = Object.fromEntries(new FormData(event.currentTarget));
                        saveStoreSettings(
                          {
                            settings: {
                              heroImage: String(f.heroImage || "").trim(),
                              heroKicker: String(f.heroKicker || "").trim(),
                              heroTitle: String(f.heroTitle || "").trim(),
                              heroText: String(f.heroText || "").trim(),
                            },
                          },
                          "Pengaturan Banner Hero berhasil disimpan."
                        );
                      }}
                    >
                      <label className="ws-wide">
                        Gambar Banner Utama (Hero Image)
                        <input name="heroImage" defaultValue={settings?.heroImage || ""} placeholder="/images/hero.jpg atau URL HTTPS" />
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(event) => uploadAsset(event.target.files?.[0], event.currentTarget.previousElementSibling)}
                        />
                        <small>Rasio landscape disarankan (1920x1080) agar tampilan layar lebar proporsional.</small>
                      </label>
                      <label>
                        Tagline Utama Hero (Kicker)
                        <input name="heroKicker" defaultValue={settings?.heroKicker || ""} placeholder="Contoh: KINTSUGI / BEDROOM COLLECTION" />
                      </label>
                      <label className="ws-wide">
                        Judul Utama Hero (Gunakan baris baru untuk pindah baris)
                        <textarea name="heroTitle" rows="3" defaultValue={settings?.heroTitle || ""} />
                      </label>
                      <label className="ws-wide">
                        Deskripsi Singkat Hero
                        <textarea name="heroText" rows="2" defaultValue={settings?.heroText || ""} />
                      </label>
                      <div className="ws-wide ws-form-actions">
                        <button className="ws-button primary" disabled={busy}>
                          Simpan Pengaturan Hero
                        </button>
                      </div>
                    </form>
                  </section>

                  {/* Modul 2: Section Produk Beranda (Dinamis & Full Custom) */}
                  <section className="ws-panel ws-storefront-module">
                    <div className="ws-panel-heading" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                      <div>
                        <h2>Section Produk Beranda</h2>
                        <p>Kelola bagian produk di beranda tanpa batasan jumlah. Jika semua section dikosongkan, beranda publik tidak akan menampilkan section produk apapun.</p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {currentHomeSections.length > 0 && (
                          <button
                            type="button"
                            className="ws-button-danger"
                            onClick={clearAllSections}
                            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                          >
                            <Trash2 size={15} /> Kosongkan Semua
                          </button>
                        )}
                        <button
                          type="button"
                          className="ws-button primary"
                          onClick={addHomeSection}
                          style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                        >
                          <Plus size={16} /> Tambah Section Produk
                        </button>
                      </div>
                    </div>

                    {currentHomeSections.length === 0 ? (
                      <div style={{ padding: "40px 20px", textAlign: "center", border: "1.5px dashed #dce8e6", borderRadius: "10px", background: "#fcfdfd", margin: "16px 0" }}>
                        <p style={{ margin: "0 0 8px", color: "var(--ws-heading)", fontSize: "15px", fontWeight: "650" }}>
                          Tidak ada section produk di beranda
                        </p>
                        <p style={{ margin: "0 0 16px", color: "var(--ws-muted)", fontSize: "13px" }}>
                          Halaman beranda publik saat ini bersih dan tidak menampilkan section produk apapun.
                        </p>
                        <div style={{ display: "inline-flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
                          <button
                            type="button"
                            className="ws-button primary"
                            onClick={addHomeSection}
                            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                          >
                            <Plus size={16} /> Buat Section Produk Baru
                          </button>
                          {sectionsDraft !== null && (
                            <button
                              type="button"
                              className="ws-button"
                              disabled={busy}
                              onClick={() => saveHomeSections("Pengaturan section beranda berhasil dikosongkan.")}
                            >
                              Simpan Keadaan Kosong ke Beranda
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="ws-storefront-sections-list">
                        {currentHomeSections.map((sec, secIndex) => {
                          const searchTerm = (sectionSearchTerms[sec.id || secIndex] || "").toLowerCase().trim();
                          const filteredProducts = products.filter((p) => {
                            if (!searchTerm) return true;
                            return (
                              p.name?.toLowerCase().includes(searchTerm) ||
                              p.category?.toLowerCase().includes(searchTerm)
                            );
                          });
                          const selectedList = (Array.isArray(sec.productIds) ? sec.productIds : [])
                            .map((pid) => products.find((p) => p.id === pid))
                            .filter(Boolean);

                          return (
                            <article key={sec.id || secIndex} className="ws-section-card">
                              <div className="ws-section-card-header">
                                <div className="ws-section-card-title-wrap">
                                  <span className="ws-section-badge">Section #{secIndex + 1}</span>
                                  <strong style={{ fontSize: "14px", color: "var(--ws-heading)" }}>
                                    {sec.title || "Section Tanpa Judul"}
                                  </strong>
                                </div>
                                <div className="ws-section-card-controls">
                                  <button
                                    type="button"
                                    className="ws-btn-icon-sm"
                                    title="Pindah ke Atas"
                                    disabled={secIndex === 0}
                                    onClick={() => moveHomeSection(secIndex, -1)}
                                  >
                                    <ChevronUp size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    className="ws-btn-icon-sm"
                                    title="Pindah ke Bawah"
                                    disabled={secIndex === currentHomeSections.length - 1}
                                    onClick={() => moveHomeSection(secIndex, 1)}
                                  >
                                    <ChevronDown size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    className="ws-btn-icon-danger-sm"
                                    title="Hapus Section Ini"
                                    onClick={() => removeHomeSection(secIndex)}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </div>

                              <div className="ws-form-grid" style={{ marginBottom: "14px" }}>
                                <label>
                                  Tagline Section (Kicker)
                                  <input
                                    value={sec.kicker || ""}
                                    onChange={(e) => updateSectionField(secIndex, "kicker", e.target.value)}
                                    placeholder="Contoh: SLEEP ESSENTIALS"
                                  />
                                  <small>Teks pendek di atas judul section.</small>
                                </label>
                                <label>
                                  Judul Section
                                  <input
                                    value={sec.title || ""}
                                    onChange={(e) => updateSectionField(secIndex, "title", e.target.value)}
                                    placeholder="Contoh: Pilihan untuk tidur yang lebih baik."
                                  />
                                  <small>Judul utama section yang tampil di beranda.</small>
                                </label>
                              </div>

                              {/* Pilihan Produk dari Database */}
                              <div className="ws-prod-picker-box">
                                <div className="ws-prod-picker-header">
                                  <span className="ws-prod-picker-title">
                                    Pilihan Produk Database ({selectedList.length} terpilih)
                                  </span>
                                  <div className="ws-prod-picker-search">
                                    <Search size={15} />
                                    <input
                                      type="text"
                                      placeholder="Cari nama atau kategori produk..."
                                      value={sectionSearchTerms[sec.id || secIndex] || ""}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setSectionSearchTerms((prev) => ({ ...prev, [sec.id || secIndex]: val }));
                                      }}
                                    />
                                  </div>
                                </div>

                                {/* Selected Chips */}
                                <div className="ws-prod-selected-chips">
                                  {selectedList.length === 0 ? (
                                    <span style={{ fontSize: "12px", color: "var(--ws-muted)", padding: "4px" }}>
                                      Belum ada produk yang dipilih untuk section ini. Silakan centang produk di bawah.
                                    </span>
                                  ) : (
                                    selectedList.map((prod) => (
                                      <span key={prod.id} className="ws-prod-chip">
                                        <img src={prod.image} alt={prod.name} className="ws-prod-chip-thumb" />
                                        <span>{prod.name}</span>
                                        <button
                                          type="button"
                                          className="ws-prod-chip-remove"
                                          title={`Hapus ${prod.name}`}
                                          onClick={() => removeProductFromSection(secIndex, prod.id)}
                                        >
                                          <X size={12} />
                                        </button>
                                      </span>
                                    ))
                                  )}
                                </div>

                                {/* Scrollable Products Grid */}
                                <div className="ws-prod-grid-scroll">
                                  {filteredProducts.map((prod) => {
                                    const isSelected = (sec.productIds || []).includes(prod.id);
                                    return (
                                      <div
                                        key={prod.id}
                                        className={"ws-prod-select-card " + (isSelected ? "selected" : "")}
                                        onClick={() => toggleProductInSection(secIndex, prod.id)}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => {}}
                                          style={{ width: "16px", height: "16px", accentColor: "var(--ks-teal)", cursor: "pointer" }}
                                        />
                                        <img src={prod.image} alt={prod.name} className="ws-prod-select-thumb" />
                                        <div className="ws-prod-select-info">
                                          <span className="ws-prod-select-name" title={prod.name}>
                                            {prod.name}
                                          </span>
                                          <span className="ws-prod-select-meta">
                                            {money(prod.price)} · {prod.category}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="ws-section-actions-bar">
                                <span style={{ fontSize: "12px", color: "var(--ws-muted)" }}>
                                  {selectedList.length} produk siap ditampilkan di beranda untuk section ini.
                                </span>
                                <button
                                  type="button"
                                  className="ws-button primary"
                                  disabled={busy}
                                  onClick={() => saveHomeSections(`Section '${sec.title || "Section #" + (secIndex + 1)}' berhasil disimpan.`)}
                                >
                                  Simpan Section Ini
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}

                    {currentHomeSections.length > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", flexWrap: "wrap", gap: "10px" }}>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="ws-button"
                            onClick={addHomeSection}
                            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                          >
                            <Plus size={16} /> Tambah Section Baru
                          </button>
                          <button
                            type="button"
                            className="ws-button-danger"
                            onClick={clearAllSections}
                            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                          >
                            <Trash2 size={15} /> Kosongkan Semua Section
                          </button>
                        </div>
                        <button
                          type="button"
                          className="ws-button primary"
                          disabled={busy}
                          onClick={() => saveHomeSections("Semua section produk beranda berhasil disimpan.")}
                        >
                          Simpan Semua Section Produk
                        </button>
                      </div>
                    )}
                  </section>
                </>
              )}

              {/* Submenu 3: Pengiriman & Ekspedisi */}
              {settingsSubmenu === "shipping" && (
                <section className="ws-panel ws-form-panel">
                  <div className="ws-panel-heading">
                    <h2>Pengiriman & Ekspedisi</h2>
                    <p>Konfigurasi asal pengiriman kurir nasional (RajaOngkir), tarif lokal toko, dan berat default paket.</p>
                  </div>
                  <form
                    className="ws-form-grid"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const f = Object.fromEntries(new FormData(event.currentTarget));
                      saveStoreSettings(
                        {
                          settings: {
                            rajaOriginId: String(f.rajaOriginId || "").trim(),
                            localDeliveryFee: parseRupiah(f.localDeliveryFee || 0),
                            packageWeightGrams: Math.max(1, Number(f.packageWeightGrams || 1000)),
                          },
                        },
                        "Pengaturan pengiriman berhasil disimpan."
                      );
                    }}
                  >
                    <label>
                      ID Kota / Kabupaten Asal RajaOngkir
                      <input
                        name="rajaOriginId"
                        defaultValue={settings?.rajaOriginId || ""}
                        placeholder="Contoh: 501"
                        required
                      />
                      <small>Kode ID kota asal lokasi gudang/toko Anda di sistem RajaOngkir.</small>
                    </label>
                    <label>
                      Ongkir Lokal Toko (Rp)
                      <RupiahInput
                        name="localDeliveryFee"
                        defaultValue={settings?.localDeliveryFee || 0}
                        placeholder="15.000"
                        required
                      />
                      <small>Biaya kurir flat untuk pengiriman instan/lokal dalam kota.</small>
                    </label>
                    <label>
                      Berat Paket Default (gram)
                      <input
                        name="packageWeightGrams"
                        type="number"
                        min="1"
                        defaultValue={settings?.packageWeightGrams || 1000}
                        required
                      />
                      <small>Digunakan saat produk tidak mencantumkan berat gramasi spesifik.</small>
                    </label>
                    <div className="ws-wide ws-form-actions">
                      <button className="ws-button primary" disabled={busy}>
                        Simpan Pengaturan Pengiriman
                      </button>
                    </div>
                  </form>
                </section>
              )}

              {/* Submenu 4: Metode Pembayaran */}
              {settingsSubmenu === "payments" && (
                <section className="ws-panel ws-form-panel">
                  <div className="ws-panel-heading">
                    <h2>Kanal Pembayaran Online Xendit</h2>
                    <p>Aktifkan atau nonaktifkan metode pembayaran yang didukung akun Xendit Anda untuk transaksi checkout pelanggan.</p>
                  </div>
                  <div className="ws-payments-list">
                    {paymentMethods.map((method, index) => (
                      <label className="ws-payment-toggle" key={method.id}>
                        <input
                          type="checkbox"
                          checked={Boolean(method.enabled)}
                          onChange={(event) =>
                            setPaymentMethods((list) =>
                              list.map((item, i) =>
                                i === index ? { ...item, enabled: event.target.checked } : item
                              )
                            )
                          }
                        />
                        <span>
                          <b>{method.name}</b>
                          <small>{method.group} · {method.detail}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="ws-form-actions" style={{ marginTop: "16px", marginBottom: "28px" }}>
                    <button
                      className="ws-button primary"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        saveStoreSettings(
                          {
                            paymentMethods: paymentMethods.map((method, index) => ({
                              id: method.id,
                              enabled: Boolean(method.enabled),
                              sortOrder: index,
                            })),
                          },
                          "Metode pembayaran aktif berhasil diperbarui."
                        )
                      }
                    >
                      Simpan Metode Pembayaran
                    </button>
                  </div>
                  <hr style={{ margin: "24px 0", borderColor: "var(--ws-border)" }} />
                  <div className="ws-panel-heading">
                    <h3>Tambah Kanal Pembayaran Xendit</h3>
                    <p>Tambahkan metode pembayaran baru dari daftar kanal yang didukung.</p>
                  </div>
                  <form
                    className="ws-inline-expense"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const f = Object.fromEntries(new FormData(event.currentTarget));
                      const method = supportedPayments.find((item) => item.id === f.id);
                      if (method)
                        perform(
                          () => api("/admin/payment-methods", { method: "POST", body: method }),
                          "Metode pembayaran baru berhasil ditambahkan."
                        );
                    }}
                  >
                    <label>
                      Pilih Kanal Xendit
                      <select name="id">
                        {supportedPayments
                          .filter((item) => !paymentMethods.some((current) => current.id === item.id))
                          .map((item) => (
                            <option value={item.id} key={item.id}>
                              {item.name} ({item.group})
                            </option>
                          ))}
                      </select>
                    </label>
                    <button className="ws-button" disabled={busy}>
                      Tambah Metode
                    </button>
                  </form>
                </section>
              )}

              {/* Submenu 5: Status Layanan & Integrasi */}
              {settingsSubmenu === "integrations" && (
                <>
                  <div className="ws-panel-heading" style={{ marginBottom: "16px" }}>
                    <h2>Status Layanan Sistem & Integrasi</h2>
                    <p>Pemantauan kesehatan koneksi ke basis data, gateway pembayaran, integrasi WhatsApp, dan kurir RajaOngkir.</p>
                  </div>
                  <div className="ws-services">
                    {[
                      {
                        name: "Database Toko MySQL",
                        detail: "Penyimpanan katalog produk, varian, akun, dan transaksi pesanan",
                        ok: true,
                        label: "Terhubung",
                      },
                      {
                        name: "Pembayaran Online Xendit",
                        detail: health?.sandbox
                          ? "Mode Sandbox / Development (transaksi simulasi aktif)."
                          : health?.gateway
                            ? "Penerimaan dan verifikasi otomatis pembayaran aktif."
                            : "Kunci API Xendit belum dikonfigurasi.",
                        ok: Boolean(health?.gateway),
                        label: health?.gateway
                          ? health?.sandbox
                            ? "Sandbox (Uji Coba)"
                            : "Live Aktif"
                          : "Belum Dikonfigurasi",
                      },
                      {
                        name: "WhatsApp Gateway (Wablas)",
                        detail: "Pengiriman kode verifikasi OTP dan notifikasi pesanan pelanggan.",
                        ok: Boolean(health?.whatsappConfigured),
                        label: health?.whatsappConfigured ? "Aktif Terhubung" : "Belum Dikonfigurasi",
                      },
                      {
                        name: "Tarif Kurir RajaOngkir",
                        detail: "Kalkulasi ongkos kirim real-time JNE, POS, TIKI, SiCepat, dan J&T.",
                        ok: Boolean(health?.rajaOngkirConfigured),
                        label: health?.rajaOngkirConfigured ? "Aktif" : "API Key / Asal Belum Diatur",
                      },
                    ].map((s) => (
                      <section className="ws-panel ws-service" key={s.name}>
                        <span className="ws-service-icon">
                          {s.ok ? <CheckCircle2 size={25} /> : <AlertCircle size={25} />}
                        </span>
                        <div>
                          <h2>{s.name}</h2>
                          <p>{s.detail}</p>
                        </div>
                        <Status tone={s.ok ? "success" : "warning"}>{s.label}</Status>
                      </section>
                    ))}
                    <section className="ws-panel ws-service">
                      <div>
                        <h2>Antrean Email Transaksi</h2>
                        <p>
                          {health?.email?.find((x) => x.status === "sent")?.count || 0} terkirim ·{" "}
                          {health?.email?.find((x) => x.status === "pending")?.count || 0} menunggu pengiriman.
                        </p>
                      </div>
                    </section>
                  </div>
                  <div style={{ marginTop: "18px" }}>
                    <button
                      className="ws-button"
                      type="button"
                      disabled={busy}
                      onClick={() => perform(refresh, "Status layanan berhasil diperiksa ulang.")}
                    >
                      <RefreshCw size={14} style={{ marginRight: "6px" }} />
                      Periksa Ulang Status Koneksi
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </Workspace>
  );
}