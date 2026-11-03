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
} from "lucide-react";
import Workspace, { Empty, Notice, Status } from "./Workspace";
import { api } from "./store";
import { colorLabel, money } from "./data";
import { paymentLabel } from "./Orders";
import { dimensionLabel } from "./dimensions.js";
import { paymentMethods as supportedPayments } from "./payment-methods.js";

export default function Admin({ user, notify, onLogout, config }) {
  const isAdmin = user.role === "admin";
  const isManager = user.role === "manager";
  const isStaff = user.role === "staff";
  const tabs = isStaff ? ["orders"] : isAdmin
    ? ["overview", "products", "discounts", "orders", "categories", "templates", "team", "settings"]
    : ["overview", "products", "orders"];
  const readTab = () =>
    tabs.includes(location.hash.split("/")[1])
      ? location.hash.split("/")[1]
      : isStaff ? "orders" : "overview";
  const [tab, setTab] = useState(readTab),
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
  const [categoryDraft, setCategoryDraft] = useState("");
  const [promotionDraft, setPromotionDraft] = useState(null);
  async function saveStoreSettings(payload, message) {
    return perform(() => api("/admin/settings", { method: "PATCH", body: payload }), message);
  }
  async function savePromotion(event) {
    event.preventDefault();
    const form=event.currentTarget;
    const fields=Object.fromEntries(new FormData(form));
    const body={productId:fields.productId,eyebrow:fields.eyebrow,title:fields.title,description:fields.description,image:fields.image,discountPercent:Number(fields.discountPercent),active:form.elements.active.checked};
    const ok=await perform(()=>api(promotionDraft.id?`/admin/promotions/${promotionDraft.id}`:"/admin/promotions",{method:promotionDraft.id?"PATCH":"POST",body}),"Promo berhasil disimpan.");
    if(ok)setPromotionDraft(null);
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
    if (selected) setSelected(o.find((x) => x.id === selected.id) || null);
  }
  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    const change = () => {
      setTab(readTab());
      setEdit(null);
      setSelected(null);
      setSelectedProduct(null);
      setSearch("");
      setFilter("all");
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, [user.id]);
  function select(t) {
    setTab(t);
    setEdit(null);
    setSelected(null);
    setSelectedProduct(null);
    setSearch("");
    setFilter("all");
    setError("");
    setMessage("");
    history.replaceState(null, "", "#admin/" + t);
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
  async function save(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    const body = {
      name: f.name,
      sku: f.sku,
      price: Number(f.price),
      category: f.category,
      image: f.image,
      description: f.description,
      isNew: f.isNew === "on",
      costPrice: Number(f.costPrice || 0),
      weightGrams: Number(f.weightGrams || 1000),
      variationLabel: f.variationLabel || "Warna",
      motif: f.motif || "",
    };
    if (edit.id) {
      body.oldPrice = 0;
      const changed = edit.variants
        .map((v, i) => ({
          size: v.size,
          color: v.color,
          stock: Number(f["stock_" + i]),
          oldStock: v.stock,
        }))
        .filter((v) => v.stock !== v.oldStock)
        .map(({ oldStock, ...v }) => v);
      if (changed.length) body.variants = changed;
    } else {
      const variants = sizeRows.map((_, index) => ({
        size: f[`size_${index}`]?.trim(),
        color: f[`variation_${index}`]?.trim(),
        stock: Number(f[`stock_${index}`]),
        imageUrl: f[`imageUrl_${index}`]?.trim() || undefined,
        lengthCm: Number(f[`length_${index}`] || 0),
        widthCm: Number(f[`width_${index}`] || 0),
        heightCm: Number(f[`height_${index}`] || 0),
      }));
      if (variants.some((variant) => !variant.size || !variant.color || !Number.isFinite(variant.stock))) {
        setError("Lengkapi nama ukuran, nilai variasi, dan stok setiap variasi.");
        return;
      }
      body.oldPrice = 0;
      body.variants = variants;
    }
    if (
      await perform(
        () =>
          api("/admin/products" + (edit.id ? "/" + edit.id : ""), {
            method: edit.id ? "PATCH" : "POST",
            body,
          }),
        "Produk berhasil disimpan.",
      )
    )
      setEdit(null);
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
    settings: "Pengaturan toko",
    categories: "Kategori produk & navbar",
    discounts: "Kelola diskon produk",
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
                    onClick={() => {
                      setTab("orders");
                      setSelected(o);
                      setTrackingNumber(o.tracking_number || "");
                    }}
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
              : "Periksa koneksi dan konfigurasi layanan toko."
      }
      actions={
        <div className="ws-actions">
          {!edit && !selected && !selectedProduct && (
            <button
              className="ws-button"
              disabled={busy}
              onClick={() => perform(refresh)}
            >
              <RefreshCw size={16} />
              Muat ulang
            </button>
          )}
          {tab === "products" && !edit && isAdmin && (
            <button
              className="ws-button primary"
              onClick={() => {
                setSizeRows([{ id: "default", size: "160×200×30", variation: "Putih", stock: 30, length: "160", width: "200", height: "30", imageUrl: "" }]);
                setEdit({
                  name: "",
                  price: 149000,
                  oldPrice: 0,
                  costPrice: 0,
                  variationLabel: "Warna",
                  motif: "",
                  stock: 30,
                  isNew: true,
                });
              }}
            >
              <Plus size={17} />
              Tambah produk
            </button>
          )}
          {(edit || selected || selectedProduct) && (
            <button
              className="ws-button"
              onClick={() => {
                setEdit(null);
                setSelected(null);
                setSelectedProduct(null);
                setError("");
              }}
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
              <div className="ws-admin-intro">
                <span className="ws-status success">
                  <span className="ws-live-dot" />
                  Panel operasional aktif
                </span>
                <p>
                  Selamat datang, {user.name}. Berikut kondisi toko Anda hari
                  ini.
                </p>
              </div>
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
              {!isStaff && metrics && <div className="ws-stats admin-stats-grid ws-finance-stats">
                {[["Omset bersih transaksi",metrics.revenue],["Modal barang terjual",metrics.capital],["Biaya operasional",metrics.expenses],["Pendapatan bersih",metrics.netIncome]].map(([label,value])=><div className="ws-stat" key={label}><span><TrendingUp size={20}/></span><div><p>{label}</p><b>{money(value)}</b></div></div>)}
              </div>}
              {isAdmin && <section className="ws-panel ws-form-panel">
                <div className="ws-panel-heading"><h2>Catat modal operasional</h2><p>Biaya ini diperhitungkan dalam pendapatan bersih.</p></div>
                <form className="ws-inline-expense" onSubmit={(event)=>{event.preventDefault();const form=event.currentTarget;const values=Object.fromEntries(new FormData(form));perform(()=>api("/admin/expenses",{method:"POST",body:{date:values.date,description:values.description,amount:Number(values.amount)}}),"Biaya operasional disimpan.").then((ok)=>ok&&form.reset());}}>
                  <label>Tanggal<input type="date" name="date" defaultValue={new Date().toISOString().slice(0,10)} required/></label>
                  <label>Keterangan<input name="description" maxLength="200" required placeholder="Contoh: biaya kemasan"/></label>
                  <label>Jumlah (Rp)<input type="number" name="amount" min="1" required/></label>
                  <button className="ws-button primary" disabled={busy}>Simpan biaya</button>
                </form>
              </section>}
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
                          onClick={async () => {
                            setTab("products");
                            if(isAdmin) setEdit({...p,price:p.oldPrice>p.price?p.oldPrice:p.price});
                            else setSelectedProduct(await api(`/admin/products/${p.id}/details`));
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
                                onClick={async () => { try { setSelectedProduct(await api(`/admin/products/${p.id}/details`)); } catch (e) { setError(e.message); } }}
                              >
                                Detail
                              </button>
                              {isAdmin && <button
                                className="ws-link"
                                onClick={() => setEdit({ ...p, price: p.oldPrice > p.price ? p.oldPrice : p.price })}
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
                  Kategori
                  <select
                    name="category"
                    defaultValue={edit.category || "Sprei Fitted"}
                  >
                    {categories.filter((category) => category.active).map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                  </select>
                </label>
                <label>
                  Harga jual (Rp)
                  <input
                    name="price"
                    type="number"
                    min="1000"
                    max="10000000"
                    required
                    defaultValue={edit.price}
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
                <label>Motif<input name="motif" defaultValue={edit.motif || ""} placeholder="Contoh: garis, floral, polos" /></label>
                <label>Nama pilihan variasi<input name="variationLabel" defaultValue={edit.variationLabel || "Warna"} placeholder="Contoh: Warna, Motif, Bahan" required /></label>
                <label>Modal per produk (Rp)<input name="costPrice" type="number" min="0" max="10000000" defaultValue={edit.costPrice || 0} /><small>Hanya dipakai untuk laporan pimpinan dan admin.</small></label>
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
                {edit.id ? (
                  <div className="ws-wide">
                    <div className="ws-panel-heading">
                      <h2>Stok per varian</h2>
                      <p>
                        Hanya nilai yang Anda ubah yang disimpan. Stok yang
                        sudah dipesan tidak termasuk di sini.
                      </p>
                    </div>
                    <div className="ws-variant-scroll">
                      <table className="ws-table">
                        <thead>
                          <tr>
                            <th>Ukuran</th>
                            <th>{edit.variationLabel || "Pilihan"}</th>
                            <th>Stok tersedia</th>
                          </tr>
                        </thead>
                        <tbody>
                          {edit.variants.map((v, i) => (
                            <tr key={v.size + v.color}>
                              <td>{dimensionLabel(v.size)}</td>
                              <td>{colorLabel(v.color)}{v.image_url && <img className="ws-variant-thumb" src={v.image_url} alt="" />}</td>
                              <td>
                                <input
                                  aria-label={"Stok " + v.size + " " + v.color}
                                  name={"stock_" + i}
                                  type="number"
                                  min="0"
                                  max="100000"
                                  defaultValue={v.stock}
                                  required
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="ws-wide ws-dimension-editor">
                      <div className="ws-panel-heading">
                        <h2>Ukuran & stok variasi</h2>
                        <p>Ukuran dapat berupa panjang × lebar × tinggi atau nama bebas seperti X dan XL. Dimensi bersifat opsional; stok dicatat untuk setiap variasi.</p>
                      </div>
                      {sizeRows.map((row, index) => (
                        <div className="ws-dimension-row ws-product-variant-editor" key={row.id}>
                          <label>Ukuran<input name={`size_${index}`} defaultValue={row.size} placeholder="160×200×30 atau XL" required /></label>
                          <label>{edit.variationLabel || "Nilai variasi"}<input name={`variation_${index}`} defaultValue={row.variation} placeholder="Contoh: Sage / Floral" required /></label>
                          <label>Stok<input name={`stock_${index}`} type="number" min="0" max="100000" defaultValue={row.stock} required /></label>
                          <label>Ukuran fisik (opsional)<input name={`length_${index}`} type="number" min="0" max="500" defaultValue={row.length} placeholder="Panjang cm" /></label>
                          <label>Lebar (cm)<input name={`width_${index}`} type="number" min="0" max="500" defaultValue={row.width} placeholder="Opsional" /></label>
                          <label>Tinggi (cm)<input name={`height_${index}`} type="number" min="0" max="500" defaultValue={row.height} placeholder="Opsional" /></label>
                          <input type="hidden" name={`imageUrl_${index}`} defaultValue={row.imageUrl} />
                          <label className="ws-wide">Gambar variasi (opsional)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadAsset(event.target.files?.[0], event.currentTarget.closest(".ws-dimension-row").querySelector('input[type="hidden"]'))} /></label>
                          <button type="button" className="ws-button" disabled={sizeRows.length === 1} onClick={() => setSizeRows((rows) => rows.filter((_, i) => i !== index))}>Hapus variasi</button>
                        </div>
                      ))}
                      <button type="button" className="ws-button" onClick={() => setSizeRows((rows) => [...rows, { id: `${Date.now()}-${rows.length}`, size: "", variation: "", stock: 0, length: "", width: "", height: "", imageUrl: "" }])}><Plus size={15} /> Tambah variasi</button>
                    </div>
                  </>
                )}
                <div className="ws-wide ws-form-actions">
                  <button className="ws-button primary" disabled={busy}>
                    {busy ? "Menyimpan…" : "Simpan produk"}
                  </button>
                  <button
                    type="button"
                    className="ws-button"
                    onClick={() => {
                      setEdit(null);
                      setSizeRows([{ id: "default", length: "100", width: "200", height: "30" }]);
                    }}
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
          {tab === "categories" && <section className="ws-panel ws-form-panel">
            <div className="ws-panel-heading"><h2>Kategori navigasi dan produk</h2><p>Kategori aktif muncul di navbar toko dan menjadi pilihan pada formulir produk.</p></div>
            {categories.map((category,index)=><div className="ws-category-row" key={category.id}><input aria-label="Nama kategori" value={category.name} onChange={(event)=>setCategories((rows)=>rows.map((row,i)=>i===index?{...row,name:event.target.value}:row))}/><label><input type="checkbox" checked={Boolean(category.active)} onChange={(event)=>setCategories((rows)=>rows.map((row,i)=>i===index?{...row,active:event.target.checked}:row))}/> Tampilkan</label><button className="ws-link" onClick={()=>setCategories((rows)=>rows.filter((_,i)=>i!==index))}>Hapus</button></div>)}
            <form className="ws-inline-expense" onSubmit={(event)=>{event.preventDefault();const name=categoryDraft.trim();if(!name)return;const id=name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");if(categories.some((category)=>category.id===id))return setError("Kategori tersebut sudah tersedia.");setCategories((rows)=>[...rows,{id,name,active:true,sort_order:rows.length}]);setCategoryDraft("");}}><label>Nama kategori baru<input value={categoryDraft} onChange={(event)=>setCategoryDraft(event.target.value)} placeholder="Contoh: Selimut"/></label><button className="ws-button"><Plus size={15}/> Tambah kategori</button></form>
            <div className="ws-form-actions"><button className="ws-button primary" disabled={busy} onClick={()=>saveStoreSettings({categories:categories.map((category,index)=>({id:category.id,name:category.name,active:Boolean(category.active),sortOrder:index}))},"Kategori toko diperbarui.")}>Simpan kategori</button></div>
          </section>}
          {tab === "discounts" && (
            <>
              <section className="ws-panel ws-form-panel">
                <div className="ws-panel-heading horizontal">
                  <div><h2>Promo publik</h2><p>Setiap promo memiliki produk, potongan harga, gambar, dan copy sendiri. Promo aktif tampil sebagai slider di halaman utama.</p></div>
                  {!promotionDraft && <button className="ws-button primary" onClick={()=>setPromotionDraft({productId:"",eyebrow:"PROMO PILIHAN",title:"",description:"",image:"",discountPercent:10,active:true})}><Plus size={16}/> Tambahkan diskon</button>}
                </div>
                {promotions.length ? <div className="ws-promotion-grid">{promotions.map((promotion)=>{const product=products.find((item)=>item.id===promotion.product_id);const base=Number(product?.price||promotion.product_price||0);const sale=Math.max(1000,Math.round(base*(100-Number(promotion.discount_percent))/100));return <article className="ws-promotion-card" key={promotion.id}><img src={promotion.image||product?.image||promotion.product_image||"/images/seprai/sprei-01.jpg"} alt=""/><div className="ws-promotion-card-copy"><small>{promotion.eyebrow||"PROMO"} · DISKON {promotion.discount_percent}% · {promotion.active?"AKTIF":"DISEMBUNYIKAN"}</small><h3>{promotion.title}</h3><p>{promotion.description||"Tanpa deskripsi tambahan."}</p><b>{promotion.product_name||product?.name}</b><div className="ws-promotion-prices"><strong>{money(sale)}</strong><del>{money(base)}</del></div><div className="ws-row-actions"><button className="ws-link" onClick={()=>setPromotionDraft({id:promotion.id,productId:promotion.product_id,eyebrow:promotion.eyebrow,title:promotion.title,description:promotion.description,image:promotion.image||"",discountPercent:Number(promotion.discount_percent),active:Boolean(promotion.active)})}>Ubah</button><button className="ws-link" disabled={busy} onClick={()=>perform(()=>api(`/admin/promotions/${promotion.id}`,{method:"PATCH",body:{active:!promotion.active}}),promotion.active?"Promo disembunyikan.":"Promo ditampilkan.")}>{promotion.active?"Sembunyikan":"Tampilkan"}</button></div></div></article>})}</div>:<div className="ws-empty"><h3>Belum ada promo</h3><p>Pilih produk dari katalog di bawah atau tekan “Tambahkan diskon”.</p></div>}
              </section>
              {promotionDraft && <section className="ws-panel ws-form-panel"><div className="ws-panel-heading"><h2>{promotionDraft.id?"Ubah promo":"Tambahkan diskon"}</h2><p>Konten ini muncul pada slider promo halaman publik. Potongan harga diterapkan pada produk selama promo aktif.</p></div><form className="ws-form-grid" onSubmit={savePromotion}><label className="ws-wide">Produk<select name="productId" value={promotionDraft.productId} onChange={(event)=>setPromotionDraft((current)=>({...current,productId:event.target.value}))} required><option value="">Pilih produk</option>{products.filter((product)=>!promotions.some((item)=>item.product_id===product.id&&item.active&&item.id!==promotionDraft.id)).map((product)=><option key={product.id} value={product.id}>{product.name} · {money(product.price)}</option>)}</select></label><label>Label kecil<input name="eyebrow" maxLength="100" defaultValue={promotionDraft.eyebrow}/></label><label>Diskon (%)<input name="discountPercent" type="number" min="1" max="90" required defaultValue={promotionDraft.discountPercent}/></label><label className="ws-wide">Judul promo<input name="title" maxLength="160" required defaultValue={promotionDraft.title} placeholder="Contoh: Ruang baru, harga istimewa"/></label><label className="ws-wide">Kata-kata promo<textarea name="description" rows="3" maxLength="600" defaultValue={promotionDraft.description} placeholder="Tulis pesan singkat untuk pelanggan."/></label><label className="ws-wide">Gambar promo<input name="image" defaultValue={promotionDraft.image||""} placeholder="Kosongkan untuk memakai gambar produk"/><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event)=>uploadAsset(event.target.files?.[0],event.currentTarget.previousElementSibling)}/><small>PNG, JPG, atau WebP maksimal 5 MB.</small></label><label className="ws-checkbox ws-wide"><input name="active" type="checkbox" defaultChecked={promotionDraft.active}/> Tampilkan di halaman publik dan terapkan potongan harga</label><div className="ws-wide ws-form-actions"><button className="ws-button primary" disabled={busy}>Simpan promo</button><button className="ws-button" type="button" onClick={()=>setPromotionDraft(null)}>Batal</button></div></form></section>}
              <section className="ws-panel"><div className="ws-panel-heading"><h2>Katalog produk</h2><p>Pilih produk untuk mulai membuat promo yang ditampilkan di halaman publik.</p></div><div className="ws-promotion-catalog">{products.filter((product)=>product.active).map((product)=>{const current=promotions.find((item)=>item.product_id===product.id&&item.active);return <article key={product.id}><img src={product.image} alt=""/><div><b>{product.name}</b><small>{money(product.price)} · {product.category}</small></div><button className="ws-button" disabled={Boolean(current)} onClick={()=>setPromotionDraft({productId:product.id,eyebrow:"PROMO PILIHAN",title:"",description:"",image:"",discountPercent:10,active:true})}>{current?"Sudah dipromo":"Buat promo"}</button></article>})}</div></section>
            </>
          )}
          {tab === "templates" && <section className="ws-panel ws-form-panel"><div className="ws-panel-heading"><h2>Pesan WhatsApp otomatis</h2><p>Gunakan placeholder dalam tanda kurung siku agar sistem menggantinya dengan data pesanan.</p><small>[nama] · [nomor_pesanan] · [total] · [nomor_resi] · [kurir] · [toko]</small></div>{settings?.waTemplates && <form className="ws-form-grid" onSubmit={(event)=>{event.preventDefault();const form=event.currentTarget;const fields=Object.fromEntries(new FormData(form));saveStoreSettings({settings:{waTemplates:fields}},"Template WhatsApp disimpan.");}}>{[["purchased","Pembayaran berhasil"],["processing","Pesanan diproses"],["shipped","Pesanan dikirim"],["delivered","Pesanan telah sampai"]].map(([key,label])=><label className="ws-wide" key={key}>{label}<textarea name={key} rows="3" defaultValue={settings.waTemplates[key]||""}/></label>)}<div className="ws-wide ws-form-actions"><button className="ws-button primary">Simpan template</button></div></form>}</section>}
          {tab === "team" && <><section className="ws-panel ws-form-panel"><div className="ws-panel-heading"><h2>Tambah pimpinan atau karyawan</h2><p>Pimpinan melihat laporan kinerja; karyawan fokus pada pemantauan dan pemrosesan pesanan.</p></div><form className="ws-inline-expense" onSubmit={(event)=>{event.preventDefault();const form=event.currentTarget;const f=Object.fromEntries(new FormData(form));perform(()=>api("/admin/users",{method:"POST",body:f}),"Akun tim berhasil dibuat.").then((ok)=>ok&&form.reset());}}><label>Nama<input name="name" required/></label><label>Email masuk<input name="email" type="email" required/></label><label>WhatsApp<input name="phone"/></label><label>Kata sandi sementara<input name="password" minLength="12" required/></label><label>Peran<select name="role"><option value="staff">Karyawan</option><option value="manager">Pimpinan</option></select></label><button className="ws-button primary">Buat akun</button></form></section><section className="ws-panel"><div className="ws-panel-heading"><h2>Akun terdaftar</h2></div><div className="ws-table-scroll"><table className="ws-table"><thead><tr><th>Nama</th><th>Email</th><th>Nomor</th><th>Peran</th></tr></thead><tbody>{team.map((member)=><tr key={member.id}><td>{member.name}</td><td>{member.email}</td><td>{member.phone}</td><td><select aria-label={`Peran ${member.name}`} disabled={member.id===user.id} value={member.role} onChange={(event)=>perform(()=>api(`/admin/users/${member.id}/role`,{method:"PATCH",body:{role:event.target.value}}),"Peran akun diperbarui.")}><option value="customer">Pelanggan</option><option value="staff">Karyawan</option><option value="manager">Pimpinan</option><option value="admin">Admin</option></select></td></tr>)}</tbody></table></div></section></>}
          {tab === "settings" && (
            <>
            {settings && <section className="ws-panel ws-form-panel"><div className="ws-panel-heading"><h2>Identitas dan tampilan toko</h2><p>Kelola identitas toko dan konten halaman publik. Banner dan diskon promo dikelola terpisah pada menu Diskon.</p></div><form className="ws-form-grid" onSubmit={(event)=>{event.preventDefault();const form=event.currentTarget;const f=Object.fromEntries(new FormData(form));const essentials=Array.from(form.querySelector('[name="essentialsProducts"]').selectedOptions).map((option)=>option.value);const departments=Array.from(form.querySelector('[name="departmentProducts"]').selectedOptions).map((option)=>option.value);const numeric=["localDeliveryFee","packageWeightGrams"];for(const key of numeric)f[key]=Number(f[key]||0);f.essentialsProducts=essentials;f.departmentProducts=departments;saveStoreSettings({settings:f},"Pengaturan toko diperbarui.");}}>
              {[["brand","Nama toko"],["announcementText","Pengumuman baris atas"],["contactEmail","Email toko"],["storeAddress","Alamat toko"],["logo","Logo"],["heroImage","Gambar utama"],["heroKicker","Tagline utama"],["heroTitle","Judul utama (baris baru untuk pindah baris)"],["heroText","Deskripsi utama"],["departmentKicker","Tagline pilihan kategori"],["departmentTitle","Judul pilihan kategori"],["essentialsKicker","Tagline produk pilihan"],["essentialsTitle","Judul produk pilihan"],["rajaOriginId","ID asal RajaOngkir"]].map(([key,label])=><label className={["announcementText","storeAddress","heroTitle","heroText","departmentTitle","essentialsTitle","promoTitle","promoText"].includes(key)?"ws-wide":""} key={key}>{label}<input name={key} defaultValue={settings[key]||""} type={key==="contactEmail"?"email":"text"}/>{["logo","heroImage","promoImage"].includes(key)&&<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event)=>uploadAsset(event.target.files?.[0],event.currentTarget.previousElementSibling)}/>}</label>)}
              <label>Ongkir lokal (Rp)<input name="localDeliveryFee" type="number" min="0" defaultValue={settings.localDeliveryFee||0}/></label><label>Berat paket default (gram)<input name="packageWeightGrams" type="number" min="1" defaultValue={settings.packageWeightGrams||1000}/></label><label className="ws-wide">Produk pada section “Sleep Essentials”<select multiple name="essentialsProducts" defaultValue={settings.essentialsProducts||[]}>{products.map((product)=><option key={product.id} value={product.id}>{product.name}</option>)}</select><small>Pilih beberapa produk; tahan Ctrl saat memilih lebih dari satu.</small></label><label className="ws-wide">Produk pada section “Temukan Pilihan Anda”<select multiple name="departmentProducts" defaultValue={settings.departmentProducts||[]}>{products.map((product)=><option key={product.id} value={product.id}>{product.name}</option>)}</select><small>Kosongkan pilihan untuk menampilkan kategori produk.</small></label><button className="ws-button primary ws-wide">Simpan identitas & tampilan</button>
            </form></section>}
            <section className="ws-panel ws-form-panel"><div className="ws-panel-heading"><h2>Metode pembayaran Xendit</h2><p>Aktifkan metode yang tersedia pada akun Xendit atau tambahkan kanal dari daftar yang didukung.</p></div>{paymentMethods.map((method,index)=><label className="ws-payment-toggle" key={method.id}><input type="checkbox" checked={Boolean(method.enabled)} onChange={(event)=>setPaymentMethods((list)=>list.map((item,i)=>i===index?{...item,enabled:event.target.checked}:item))}/><span><b>{method.name}</b><small>{method.group} · {method.detail}</small></span></label>)}<button className="ws-button primary" onClick={()=>saveStoreSettings({paymentMethods:paymentMethods.map((method,index)=>({id:method.id,enabled:Boolean(method.enabled),sortOrder:index}))},"Metode pembayaran diperbarui.")}>Simpan metode aktif</button><form className="ws-inline-expense" onSubmit={(event)=>{event.preventDefault();const f=Object.fromEntries(new FormData(event.currentTarget));const method=supportedPayments.find((item)=>item.id===f.id);if(method)perform(()=>api("/admin/payment-methods",{method:"POST",body:method}),"Metode pembayaran ditambahkan.");}}><label>Tambah kanal Xendit<select name="id">{supportedPayments.filter((item)=>!paymentMethods.some((current)=>current.id===item.id)).map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label><button className="ws-button">Tambah metode</button></form></section>
            <div className="ws-services">
              {[
                {
                  name: "Database toko",
                  detail: "Penyimpanan produk, akun dan pesanan",
                  ok: true,
                  label: "Terhubung",
                },
                {
                  name: "Pembayaran online",
                  detail: health?.sandbox
                    ? "Transaksi nyata belum diaktifkan."
                    : "Penerimaan dan konfirmasi pembayaran otomatis.",
                  ok: health?.gateway,
                  label: health?.gateway
                    ? health?.sandbox
                      ? "Belum live"
                      : "Aktif"
                    : "Belum diatur",
                },
                {
                  name: "WhatsApp & verifikasi akun",
                  detail: "Pengiriman kode verifikasi dan notifikasi pesanan.",
                  ok: health?.whatsappConfigured,
                  label: health?.whatsappConfigured ? "Aktif" : "Belum diatur",
                },
                {
                  name: "Tarif pengiriman RajaOngkir",
                  detail: "Pencarian tujuan dan kalkulasi tarif kurir nasional.",
                  ok: health?.rajaOngkirConfigured,
                  label: health?.rajaOngkirConfigured ? "Aktif" : "Atur API key dan ID asal",
                },
              ].map((s) => (
                <section className="ws-panel ws-service" key={s.name}>
                  <span className="ws-service-icon">
                    {s.ok ? (
                      <CheckCircle2 size={25} />
                    ) : (
                      <AlertCircle size={25} />
                    )}
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
                  <h2>Antrean email transaksi</h2>
                  <p>
                    {health?.email?.find((x) => x.status === "sent")?.count || 0}{" "}
                    terkirim ·{" "}
                    {health?.email?.find((x) => x.status === "pending")?.count ||
                      0}{" "}
                    menunggu pengiriman. OTP dikirim langsung agar tidak
                    menunggu antrean.
                  </p>
                </div>
              </section>
            </div></>
          )}
        </>
      )}
    </Workspace>
  );
}